/**
 * Dupla Tropical online: dois clientes Socket.IO reais no namespace /coop.
 */
const test = require('node:test');
const assert = require('node:assert');
const { io: Client } = require('socket.io-client');
const { server, io, coop, rooms: hubRooms } = require('../server');

let url;
test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
  // Tempos curtos para os testes de atraso e reconexão
  Object.assign(coop.config, { reconnectMs: 1500, lagMs: 400, resumeMs: 200 });
});
test.after(() => new Promise((resolve) => {
  coop.close();
  io.close();
  server.close(() => resolve());
}));

function connect(ns = '/coop') {
  return new Promise((resolve, reject) => {
    const c = Client(url + ns, { transports: ['websocket'], forceNew: true, reconnection: false });
    c.once('connect', () => resolve(c));
    c.once('connect_error', reject);
  });
}
const emit = (c, ev, data) => new Promise((resolve) => c.emit(ev, data, resolve));
const once = (c, ev) => new Promise((resolve) => c.once(ev, resolve));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Espera um estado que satisfaça a condição. */
function waitState(c, pred, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { c.off('coop:state', on); reject(new Error('estado esperado não chegou')); }, timeout);
    function on(s) { if (pred(s)) { clearTimeout(timer); c.off('coop:state', on); resolve(s); } }
    c.on('coop:state', on);
  });
}
/** Mantém um cliente "vivo" mandando entradas a 30/s. */
function pump(c, input = {}) {
  let seq = 0;
  const t = setInterval(() => c.emit('coop:input', { s: ++seq, l: !!input.left, r: !!input.right, j: !!input.jump }), 33);
  return { stop: () => clearInterval(t), set: (inp) => { input = inp; }, seq: () => seq };
}

async function setupRoom(level) {
  const a = await connect();
  const b = await connect();
  const created = await emit(a, 'coop:create', { level });
  assert.ok(created.ok);
  assert.match(created.code, /^[A-Z]{4}$/);
  const sa = once(a, 'coop:start');
  const sb = once(b, 'coop:start');
  const joined = await emit(b, 'coop:join', { code: created.code.toLowerCase() });
  assert.ok(joined.ok);
  const [startA, startB] = await Promise.all([sa, sb]);
  return { a, b, code: created.code, startA, startB, tokenA: created.token, tokenB: joined.token };
}

test('criar e entrar na sala: cada um recebe seu lugar e o estado inicial', async () => {
  const { a, b, code, startA, startB } = await setupRoom();
  assert.strictEqual(startA.seat, 0);
  assert.strictEqual(startB.seat, 1);
  assert.strictEqual(startA.code, code);
  assert.strictEqual(startA.state.status, 'playing');
  assert.strictEqual(startA.state.players.length, 2);
  assert.notStrictEqual(startA.token, startB.token);
  a.close();
  b.close();
});

test('o servidor envia o estado a ~30 ticks/s', async () => {
  const { a, b } = await setupRoom();
  const pa = pump(a);
  const pb = pump(b);
  let count = 0;
  const on = () => count++;
  a.on('coop:state', on);
  await sleep(1000);
  a.off('coop:state', on);
  assert.ok(count >= 25 && count <= 35, `${count} estados em 1 s`);
  pa.stop(); pb.stop();
  a.close(); b.close();
});

test('entradas movem o jogador e o servidor confirma a última processada', async () => {
  const { a, b, startA } = await setupRoom();
  const x0 = startA.state.players[0].x;
  const pa = pump(a, { right: true });
  const pb = pump(b);
  const s = await waitState(a, (st) => st.players[0].x > x0 + 20);
  assert.ok(s.ack[0] > 0, 'ack da entrada do jogador 0');
  assert.ok(s.players[1].x === startA.state.players[1].x, 'o jogador 1 não se mexeu');
  pa.stop(); pb.stop();
  a.close(); b.close();
});

test('trapaças: entrada repetida, fora de ordem ou com campos forjados não tem efeito', async () => {
  const { a, b, code } = await setupRoom();
  const room = coop.rooms.get(code);
  a.emit('coop:input', { s: 5, r: true, x: 9999, y: -50, coins: 99 });
  a.emit('coop:input', { s: 5, l: true }); // repetida
  a.emit('coop:input', { s: 3, l: true }); // fora de ordem
  a.emit('coop:input', { s: 'x', l: true }); // inválida
  a.emit('coop:input', 'lixo');
  await sleep(150);
  assert.strictEqual(room.seats[0].lastSeq, 5);
  const s = await waitState(a, () => true);
  assert.ok(s.players[0].x < 200, 'posição forjada ignorada');
  assert.strictEqual(s.stats.coins, 0);
  // Outro socket não consegue mandar entradas pela sala
  const intruder = await connect();
  intruder.emit('coop:input', { s: 1, r: true });
  intruder.emit('coop:retry');
  await sleep(100);
  assert.strictEqual(room.seats[1].lastSeq, 0);
  [a, b, intruder].forEach((c) => c.close());
});

test('sala inexistente, cheia, código inválido e fase inválida', async () => {
  const { a, b, code } = await setupRoom();
  const c = await connect();
  assert.deepStrictEqual(await emit(c, 'coop:join', { code: 'ZZZZ' }), { ok: false, error: 'Sala não encontrada.' });
  assert.deepStrictEqual(await emit(c, 'coop:join', { code }), { ok: false, error: 'Sala cheia.' });
  assert.strictEqual((await emit(c, 'coop:join', null)).ok, false);
  assert.strictEqual((await emit(c, 'coop:join', { code: 'x'.repeat(50) })).ok, false);
  const r = await emit(c, 'coop:create', { level: 999 });
  assert.strictEqual(r.level, 0, 'fase fora do intervalo vira a primeira');
  [a, b, c].forEach((s) => s.close());
});

test('códigos são únicos entre as salas do hub e as da Dupla Tropical, e o hub indica o jogo certo', async () => {
  const { a, b, code } = await setupRoom();
  assert.ok(!hubRooms.has(code));
  const hubClient = await connect('/');
  const res = await emit(hubClient, 'room:join', { code });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.gameId, 'platformer');
  [a, b, hubClient].forEach((s) => s.close());
});

test('desconexão pausa o jogo e quem caiu volta para a mesma sala com o token', async () => {
  const { a, b, code, tokenB } = await setupRoom();
  const pa = pump(a);
  let pb = pump(b);
  pb.stop();
  b.close();
  const paused = await waitState(a, (s) => s.pause && s.pause.reason === 'disconnected');
  assert.strictEqual(paused.pause.seat, 1);
  assert.deepStrictEqual(paused.online, [true, false]);
  const tickPaused = paused.tick;
  await sleep(300);
  assert.strictEqual(coop.rooms.get(code).world.tick, tickPaused, 'o mundo não anda pausado');

  // Token errado não entra
  const b2 = await connect();
  assert.strictEqual((await emit(b2, 'coop:rejoin', { code, token: 'errado' })).ok, false);
  // Token certo volta para o mesmo lugar
  const started = once(b2, 'coop:start');
  const res = await emit(b2, 'coop:rejoin', { code, token: tokenB });
  assert.deepStrictEqual(res, { ok: true, code, seat: 1 });
  assert.strictEqual((await started).seat, 1);
  pb = pump(b2);
  const resumed = await waitState(a, (s) => !s.pause && s.tick > tickPaused);
  assert.deepStrictEqual(resumed.online, [true, true]);
  pa.stop(); pb.stop();
  a.close(); b2.close();
});

test('se ninguém volta a tempo, a sala é encerrada', async () => {
  const { a, b, code } = await setupRoom();
  const pa = pump(a);
  b.close();
  const closed = await once(a, 'coop:closed');
  assert.strictEqual(closed.reason, 'timeout');
  assert.ok(!coop.rooms.has(code));
  pa.stop();
  a.close();
});

test('atraso: jogador sem mandar nada pausa o jogo, que volta sozinho quando ele volta', async () => {
  const { a, b } = await setupRoom();
  const pa = pump(a);
  const lag = await waitState(a, (s) => s.pause && s.pause.reason === 'lag');
  assert.strictEqual(lag.pause.seat, 1);
  const pb = pump(b);
  await waitState(a, (s) => !s.pause, 3000);
  pa.stop(); pb.stop();
  a.close(); b.close();
});

test('sair da sala avisa o parceiro e apaga a sala', async () => {
  const { a, b, code } = await setupRoom();
  const closed = once(b, 'coop:closed');
  a.emit('coop:leave');
  assert.strictEqual((await closed).reason, 'left');
  assert.ok(!coop.rooms.has(code));
  a.close(); b.close();
});

test('game over: "tentar de novo" precisa dos dois e recomeça do checkpoint', async () => {
  const { a, b, code } = await setupRoom();
  const pa = pump(a);
  const pb = pump(b);
  const room = coop.rooms.get(code);
  room.world.time = 0.05; // força o tempo acabar
  await waitState(a, (s) => s.status === 'gameover');
  const votes = once(b, 'coop:votes');
  a.emit('coop:retry');
  assert.deepStrictEqual((await votes).seats, [0]);
  assert.strictEqual(room.world.status, 'gameover', 'um voto só não basta');
  b.emit('coop:retry');
  const s = await waitState(a, (st) => st.status === 'playing');
  assert.ok(s.time > 100, 'tempo reiniciado');
  pa.stop(); pb.stop();
  a.close(); b.close();
});
