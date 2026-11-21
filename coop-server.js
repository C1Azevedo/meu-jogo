/**
 * Dupla Tropical — salas online em tempo real (namespace Socket.IO "/coop").
 *
 * O servidor é a autoridade: guarda o mundo, aplica as entradas dos dois
 * jogadores e simula física e colisões a 30 ticks/s (games/platformer.js).
 * A cada tick envia o estado para os dois celulares, junto com o número da
 * última entrada processada de cada um (para a previsão local no cliente).
 *
 * Rede instável:
 *   - desconexão: o jogo pausa e a vaga fica reservada por cfg.reconnectMs; quem
 *     caiu volta para a mesma sala com o token que recebeu ao entrar;
 *   - atraso: se um jogador fica cfg.lagMs sem mandar nada, o jogo pausa até ele voltar.
 */
const crypto = require('crypto');
const E = require('./games/platformer');
const LEVELS = require('./games/platformer-levels');

const DEFAULTS = {
  reconnectMs: 30000, // vaga reservada para quem caiu
  lagMs: 3000, // sem notícias do jogador por esse tempo → pausa
  resumeMs: 1500, // contagem curta antes de voltar a jogar
};
const MAX_QUEUE = 8;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param io Servidor Socket.IO
 * @param opts.generateCode função que gera um código de 4 letras livre (compartilhado com o hub)
 */
function setupCoop(io, opts) {
  const nsp = io.of('/coop');
  const cfg = { ...DEFAULTS }; // mutável (os testes encurtam os tempos)
  const rooms = new Map(); // code -> sala
  const socketRoom = new Map(); // socket.id -> code

  const now = () => Date.now();

  function newSeat(socket) {
    return {
      socketId: socket.id,
      token: crypto.randomBytes(12).toString('hex'),
      connected: true,
      queue: [],
      lastInput: { left: false, right: false, jump: false },
      lastSeq: 0, // última entrada recebida
      ackSeq: 0, // última entrada aplicada na simulação
      lastSeen: now(),
    };
  }

  function seatIndex(room, socketId) {
    return room.seats.findIndex((s) => s && s.socketId === socketId);
  }

  function publicPause(room) {
    if (!room.pause) return null;
    return { reason: room.pause.reason, seat: room.pause.seat, left: Math.max(0, Math.ceil((room.pause.until - now()) / 1000)) };
  }

  function stateFor(room) {
    const snap = E.snapshot(room.world);
    snap.ack = room.seats.map((s) => (s ? s.ackSeq : 0));
    snap.pause = publicPause(room);
    snap.online = room.seats.map((s) => !!(s && s.connected));
    return snap;
  }

  function sendStart(room, seat) {
    const s = room.seats[seat];
    if (!s || !s.connected) return;
    nsp.to(s.socketId).emit('coop:start', { code: room.code, seat, token: s.token, state: stateFor(room) });
  }

  function closeRoom(room, reason, exceptSocketId) {
    rooms.delete(room.code);
    for (const s of room.seats) {
      if (!s) continue;
      socketRoom.delete(s.socketId);
      if (s.socketId !== exceptSocketId && s.connected) nsp.to(s.socketId).emit('coop:closed', { reason });
      const sock = nsp.sockets.get(s.socketId);
      if (sock) sock.leave(room.code);
    }
  }

  function startGame(room) {
    room.world = E.createWorld(LEVELS, room.startLevel);
    room.votes = new Set();
    room.pause = null;
    room.seats.forEach((s, i) => sendStart(room, i));
  }

  // ---------------------------------------------------------------------------
  // Laço de simulação: 30 ticks/s para todas as salas
  // ---------------------------------------------------------------------------

  function tickRoom(room) {
    if (!room.world || room.seats.some((s) => !s)) return;
    const t = now();

    // Atraso: alguém conectado parou de mandar entradas
    room.seats.forEach((s, i) => {
      if (s.connected && t - s.lastSeen > cfg.lagMs && !room.pause) {
        room.pause = { reason: 'lag', seat: i, until: t + cfg.reconnectMs };
      }
    });

    if (room.pause) {
      const p = room.pause;
      if (p.reason === 'lag' && room.seats[p.seat].connected && t - room.seats[p.seat].lastSeen <= cfg.lagMs) {
        room.pause = { reason: 'resume', seat: p.seat, until: t + cfg.resumeMs };
      } else if (p.reason === 'resume' && t >= p.until) {
        room.pause = null;
      } else if ((p.reason === 'disconnected' || p.reason === 'lag') && t >= p.until) {
        closeRoom(room, 'timeout');
        return;
      }
      if (room.pause) {
        room.pauseTick = (room.pauseTick || 0) + 1;
        if (room.pauseTick % 6 === 0) nsp.to(room.code).emit('coop:state', stateFor(room));
        return;
      }
    }

    // Entradas: uma por tick por jogador (se não chegou nada, repete a última)
    const inputs = room.seats.map((s) => {
      const next = s.queue.shift();
      if (next) {
        s.lastInput = next.input;
        s.ackSeq = next.seq;
      }
      return s.lastInput;
    });

    const w = room.world;
    E.step(w, inputs);

    if (w.status === 'levelclear' && w.statusTimer <= 0) {
      if (w.levelIndex + 1 >= LEVELS.length) {
        w.status = 'victory';
        w.events.push({ type: 'victory' });
      } else {
        const next = E.createWorld(LEVELS, w.levelIndex + 1, w.stats);
        next.tick = w.tick;
        room.world = next;
        next.events.push({ type: 'level' });
      }
    }
    nsp.to(room.code).emit('coop:state', stateFor(room));
  }

  // Relógio com compensação de atraso: nunca deixa a simulação "andar devagar"
  let last = process.hrtime.bigint();
  let acc = 0;
  const tickNs = 1e9 / E.TICK_RATE;
  const interval = setInterval(() => {
    const t = process.hrtime.bigint();
    acc += Number(t - last);
    last = t;
    let n = 0;
    while (acc >= tickNs && n < 4) {
      acc -= tickNs;
      n++;
      for (const room of rooms.values()) tickRoom(room);
    }
    if (acc > tickNs * 4) acc = 0; // servidor muito atrasado: descarta em vez de acelerar
  }, 1000 / E.TICK_RATE / 2);
  if (interval.unref) interval.unref();

  // ---------------------------------------------------------------------------
  // Eventos dos clientes
  // ---------------------------------------------------------------------------

  nsp.on('connection', (socket) => {
    const reply = (ack, payload) => { if (typeof ack === 'function') ack(payload); };
    const myRoom = () => rooms.get(socketRoom.get(socket.id));

    function leave(reason) {
      const room = myRoom();
      socketRoom.delete(socket.id);
      if (!room) return;
      if (reason === 'disconnected' && room.world) {
        // Reserva a vaga e pausa: dá para reconectar com o token
        const i = seatIndex(room, socket.id);
        if (i < 0) return;
        room.seats[i].connected = false;
        room.pause = { reason: 'disconnected', seat: i, until: now() + cfg.reconnectMs };
        nsp.to(room.code).emit('coop:state', stateFor(room));
        return;
      }
      closeRoom(room, reason, socket.id);
    }

    socket.on('coop:create', (data, ack) => {
      const level = isPlainObject(data) && Number.isInteger(data.level) && data.level >= 0 && data.level < LEVELS.length ? data.level : 0;
      leave('left');
      const code = opts.generateCode();
      const seat = newSeat(socket);
      rooms.set(code, { code, seats: [seat, null], startLevel: level, world: null, pause: null, votes: new Set() });
      socketRoom.set(socket.id, code);
      socket.join(code);
      reply(ack, { ok: true, code, seat: 0, token: seat.token, level });
    });

    socket.on('coop:join', (data, ack) => {
      const raw = isPlainObject(data) ? data.code : null;
      if (typeof raw !== 'string' || raw.length > 10) return reply(ack, { ok: false, error: 'Código inválido.' });
      const code = raw.trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return reply(ack, { ok: false, error: 'Sala não encontrada.' });
      if (seatIndex(room, socket.id) >= 0) return reply(ack, { ok: false, error: 'Você já está nesta sala.' });
      if (room.seats[1]) return reply(ack, { ok: false, error: 'Sala cheia.' });
      leave('left');
      const seat = newSeat(socket);
      room.seats[1] = seat;
      socketRoom.set(socket.id, code);
      socket.join(code);
      reply(ack, { ok: true, code, seat: 1, token: seat.token });
      startGame(room);
    });

    socket.on('coop:rejoin', (data, ack) => {
      if (!isPlainObject(data) || typeof data.code !== 'string' || typeof data.token !== 'string') {
        return reply(ack, { ok: false, error: 'Dados inválidos.' });
      }
      const room = rooms.get(data.code.toUpperCase());
      if (!room) return reply(ack, { ok: false, error: 'A sala não existe mais.' });
      const i = room.seats.findIndex((s) => s && s.token === data.token);
      if (i < 0) return reply(ack, { ok: false, error: 'Não foi possível voltar para esta sala.' });
      const s = room.seats[i];
      if (s.connected && s.socketId !== socket.id) {
        // Conexão antiga "presa": a nova assume a vaga
        const old = nsp.sockets.get(s.socketId);
        socketRoom.delete(s.socketId);
        if (old) old.leave(room.code);
      }
      leave('left');
      s.socketId = socket.id;
      s.connected = true;
      s.lastSeen = now();
      s.queue = [];
      socketRoom.set(socket.id, room.code);
      socket.join(room.code);
      if (room.pause && room.pause.seat === i) room.pause = { reason: 'resume', seat: i, until: now() + cfg.resumeMs };
      reply(ack, { ok: true, code: room.code, seat: i });
      if (room.world) sendStart(room, i);
    });

    socket.on('coop:input', (data) => {
      const room = myRoom();
      if (!room || !room.world || !isPlainObject(data)) return;
      const i = seatIndex(room, socket.id);
      if (i < 0) return;
      const s = room.seats[i];
      s.lastSeen = now();
      const seq = data.s;
      if (!Number.isInteger(seq) || seq <= s.lastSeq) return; // fora de ordem ou repetida
      s.lastSeq = seq;
      s.queue.push({ seq, input: E.sanitizeInput(data) });
      if (s.queue.length > MAX_QUEUE) s.queue.splice(0, s.queue.length - MAX_QUEUE);
    });

    // Mantém o "visto por último" mesmo sem entradas (ex.: tela de fim de fase)
    socket.on('coop:ping', (t, ack) => {
      const room = myRoom();
      if (room) {
        const i = seatIndex(room, socket.id);
        if (i >= 0) room.seats[i].lastSeen = now();
      }
      reply(ack, typeof t === 'number' ? t : 0);
    });

    // Tentar de novo (game over) ou jogar outra vez (vitória): precisa dos dois
    socket.on('coop:retry', () => {
      const room = myRoom();
      if (!room || !room.world || !['gameover', 'victory'].includes(room.world.status)) return;
      const i = seatIndex(room, socket.id);
      if (i < 0) return;
      room.votes.add(i);
      if (room.votes.size < 2) {
        nsp.to(room.code).emit('coop:votes', { seats: [...room.votes] });
        return;
      }
      room.votes = new Set();
      if (room.world.status === 'victory') {
        room.world = E.createWorld(LEVELS, 0);
      } else {
        E.retryFromCheckpoint(room.world);
      }
      nsp.to(room.code).emit('coop:votes', { seats: [] });
      nsp.to(room.code).emit('coop:state', stateFor(room));
    });

    socket.on('coop:leave', () => leave('left'));
    socket.on('disconnect', () => leave('disconnected'));
  });

  return {
    rooms,
    hasRoom: (code) => rooms.has(code),
    close: () => clearInterval(interval),
    config: cfg,
  };
}

module.exports = setupCoop;
