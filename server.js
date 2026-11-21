/**
 * Hub de Jogos — servidor HTTP + Socket.IO.
 *
 * - Serve o front-end (public/) e a lógica dos jogos (games/), que é
 *   compartilhada: o navegador usa os mesmos arquivos para a IA local.
 * - No modo online, o servidor é a autoridade: guarda o estado da partida
 *   e valida cada jogada com as regras do jogo. O cliente só envia intenções.
 * - Jogos com informação oculta (Campo Minado) definem publicState(): o
 *   cliente só recebe essa versão, sem as minas, até a partida acabar.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const setupCoop = require('./coop-server');

const GAMES = {
  tictactoe: require('./games/tictactoe'),
  connect4: require('./games/connect4'),
  checkers: require('./games/checkers'),
  minesweeper: require('./games/minesweeper'),
  chess: require('./games/chess'),
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/games', express.static(path.join(__dirname, 'games')));
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// Salas
// ---------------------------------------------------------------------------

/** code -> sala */
const rooms = new Map();
/** socket.id -> code */
const socketRoom = new Map();

// Sem I e O para evitar confusão com 1 e 0.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateCode() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    // Códigos são únicos entre as salas por turno e as salas da Dupla Tropical
    if (!rooms.has(code) && !(coop && coop.hasRoom(code))) return code;
  }
  throw new Error('Não foi possível gerar um código de sala.');
}

// Dupla Tropical: jogo em tempo real com salas próprias (namespace /coop)
const coop = setupCoop(io, { generateCode });

/** Procura, entre as jogadas legais, a que corresponde à jogada enviada pelo cliente. */
function findLegalMove(game, state, clientMove) {
  if (state.winner !== null) return null;
  let key;
  try {
    key = game.moveKey(clientMove);
  } catch (e) {
    return null;
  }
  if (typeof key !== 'string') return null;
  const legal = game.getMoves(state).find((m) => game.moveKey(m) === key);
  return legal === undefined ? null : legal;
}

/** O que pode ser enviado ao cliente (jogos com informação oculta escondem o segredo). */
function publicView(game, state) {
  return game.publicState ? game.publicState(state) : state;
}

function scoresFor(room, socketId) {
  const opponentId = room.seats.find((id) => id !== socketId);
  return { me: room.wins[socketId] || 0, opponent: room.wins[opponentId] || 0, draws: room.draws };
}

function startMatch(room) {
  const game = GAMES[room.gameId];
  room.state = game.createState(room.options);
  room.rematch.clear();
  room.seats.forEach((socketId, seat) => {
    io.to(socketId).emit('game:start', {
      gameId: room.gameId,
      code: room.code,
      options: room.options,
      seat,
      state: publicView(game, room.state),
      scores: scoresFor(room, socketId),
    });
  });
}

function leaveRoom(socket, reason) {
  const code = socketRoom.get(socket.id);
  if (!code) return;
  socketRoom.delete(socket.id);
  socket.leave(code);
  const room = rooms.get(code);
  if (!room) return;
  rooms.delete(code);
  // Encerra a partida para quem ficou.
  for (const otherId of room.seats) {
    if (otherId === socket.id) continue;
    socketRoom.delete(otherId);
    io.to(otherId).emit('room:closed', { reason });
    const other = io.sockets.sockets.get(otherId);
    if (other) other.leave(code);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

io.on('connection', (socket) => {
  const reply = (ack, payload) => {
    if (typeof ack === 'function') ack(payload);
  };

  socket.on('room:create', (data, ack) => {
    const gameId = isPlainObject(data) ? data.gameId : null;
    if (typeof gameId !== 'string' || !Object.prototype.hasOwnProperty.call(GAMES, gameId)) {
      return reply(ack, { ok: false, error: 'Jogo inválido.' });
    }
    // Opções da partida (ex.: nível do Campo Minado) são validadas pelo próprio jogo.
    const game = GAMES[gameId];
    const options = game.onlineOptions ? game.onlineOptions(data.options) : undefined;
    leaveRoom(socket, 'left');
    const code = generateCode();
    rooms.set(code, {
      code,
      gameId,
      options,
      seats: [socket.id], // seats[0] joga com as peças do jogador 0 (começa)
      state: null,
      wins: { [socket.id]: 0 },
      draws: 0,
      rematch: new Set(),
    });
    socketRoom.set(socket.id, code);
    socket.join(code);
    reply(ack, { ok: true, code, gameId, options });
  });

  socket.on('room:join', (data, ack) => {
    const raw = isPlainObject(data) ? data.code : null;
    if (typeof raw !== 'string' || raw.length > 10) return reply(ack, { ok: false, error: 'Código inválido.' });
    const code = raw.trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      // O código pode ser de uma sala da Dupla Tropical: o cliente redireciona
      if (coop.hasRoom(code)) return reply(ack, { ok: false, error: 'Esta sala é da Dupla Tropical.', gameId: 'platformer', code });
      return reply(ack, { ok: false, error: 'Sala não encontrada.' });
    }
    if (room.seats.includes(socket.id)) return reply(ack, { ok: false, error: 'Você já está nesta sala.' });
    if (room.seats.length >= 2) return reply(ack, { ok: false, error: 'Sala cheia.' });
    leaveRoom(socket, 'left');
    room.seats.push(socket.id);
    room.wins[socket.id] = 0;
    socketRoom.set(socket.id, code);
    socket.join(code);
    reply(ack, { ok: true, code, gameId: room.gameId });
    startMatch(room);
  });

  socket.on('game:move', (data, ack) => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || !room.state) return reply(ack, { ok: false, error: 'Nenhuma partida em andamento.' });
    const seat = room.seats.indexOf(socket.id);
    if (room.state.winner !== null) return reply(ack, { ok: false, error: 'A partida já terminou.' });
    if (room.state.turn !== seat) return reply(ack, { ok: false, error: 'Não é a sua vez.' });

    const game = GAMES[room.gameId];
    const move = findLegalMove(game, room.state, isPlainObject(data) ? data.move : undefined);
    if (move === null) return reply(ack, { ok: false, error: 'Jogada inválida.' });

    room.state = game.applyMove(room.state, move);
    const { winner } = room.state;
    if (winner === 'draw') room.draws++;
    else if (winner !== null) room.wins[room.seats[winner]]++;

    reply(ack, { ok: true });
    for (const socketId of room.seats) {
      io.to(socketId).emit('game:state', { state: publicView(game, room.state), move, scores: scoresFor(room, socketId) });
    }
  });

  socket.on('game:rematch', () => {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room || !room.state || room.state.winner === null || room.seats.length < 2) return;
    room.rematch.add(socket.id);
    if (room.rematch.size < 2) {
      const otherId = room.seats.find((id) => id !== socket.id);
      io.to(otherId).emit('game:rematch-requested');
      return;
    }
    // Troca os lugares: quem jogou em segundo começa a próxima.
    room.seats.reverse();
    startMatch(room);
  });

  socket.on('room:leave', () => leaveRoom(socket, 'left'));
  socket.on('disconnect', () => leaveRoom(socket, 'disconnected'));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Hub de Jogos rodando em http://localhost:${PORT}`));
}

module.exports = { app, server, io, rooms, GAMES, coop };
