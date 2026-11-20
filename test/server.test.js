/**
 * Teste de integração do modo online: dois clientes Socket.IO reais
 * conversando com o servidor.
 */
const test = require('node:test');
const assert = require('node:assert');
const { io: Client } = require('socket.io-client');
const { server, rooms } = require('../server');

let url;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://localhost:${server.address().port}`;
});

test.after(() => new Promise((resolve) => {
  server.closeAllConnections?.();
  server.close(() => resolve());
  require('../server').io.close();
}));

function connect() {
  return new Promise((resolve, reject) => {
    const c = Client(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    c.once('connect', () => resolve(c));
    c.once('connect_error', reject);
  });
}
const emit = (c, ev, data) => new Promise((resolve) => c.emit(ev, data, resolve));
const once = (c, ev) => new Promise((resolve) => c.once(ev, resolve));

async function setupRoom(gameId) {
  const a = await connect();
  const b = await connect();
  const created = await emit(a, 'room:create', { gameId });
  assert.ok(created.ok);
  assert.match(created.code, /^[A-Z]{4}$/);
  const startA = once(a, 'game:start');
  const startB = once(b, 'game:start');
  const joined = await emit(b, 'room:join', { code: created.code.toLowerCase() });
  assert.ok(joined.ok, 'entrar com código em minúsculas funciona');
  const [sa, sb] = await Promise.all([startA, startB]);
  return { a, b, code: created.code, sa, sb };
}

test('criar sala, entrar, jogar até a vitória, placar e revanche', async () => {
  const { a, b, code, sa, sb } = await setupRoom('tictactoe');
  assert.strictEqual(sa.seat, 0);
  assert.strictEqual(sb.seat, 1);
  assert.strictEqual(sa.state.turn, 0);

  // Jogada fora da vez é recusada
  let res = await emit(b, 'game:move', { move: 4 });
  assert.deepStrictEqual(res, { ok: false, error: 'Não é a sua vez.' });

  // Jogada inválida (fora do tabuleiro / tipo errado) é recusada
  for (const bad of [9, -1, 'x', { a: 1 }, null, 1.5]) {
    res = await emit(a, 'game:move', { move: bad });
    assert.strictEqual(res.ok, false, 'deveria recusar ' + JSON.stringify(bad));
  }
  res = await emit(a, 'game:move', 'lixo');
  assert.strictEqual(res.ok, false);

  // A (X) vence: 0, 1, 2 ; B (O): 3, 4
  const sequence = [[a, 0], [b, 3], [a, 1], [b, 4]];
  for (const [c, m] of sequence) {
    const update = once(b, 'game:state');
    res = await emit(c, 'game:move', { move: m });
    assert.ok(res.ok, JSON.stringify(res) + " " + m);
    await update;
  }
  // Casa ocupada é recusada
  res = await emit(a, 'game:move', { move: 3 });
  assert.strictEqual(res.ok, false);

  const finalA = once(a, 'game:state');
  const finalB = once(b, 'game:state');
  await emit(a, 'game:move', { move: 2 });
  const [fa, fb] = await Promise.all([finalA, finalB]);
  assert.strictEqual(fa.state.winner, 0);
  assert.deepStrictEqual(fa.scores, { me: 1, opponent: 0, draws: 0 });
  assert.deepStrictEqual(fb.scores, { me: 0, opponent: 1, draws: 0 });

  // Depois do fim, nenhuma jogada é aceita
  res = await emit(b, 'game:move', { move: 8 });
  assert.strictEqual(res.ok, false);

  // Revanche: precisa dos dois; os lugares se invertem
  const requested = once(b, 'game:rematch-requested');
  a.emit('game:rematch');
  await requested;
  assert.strictEqual(rooms.get(code).state.winner, 0, 'ainda não reiniciou');
  const ra = once(a, 'game:start');
  const rb = once(b, 'game:start');
  b.emit('game:rematch');
  const [na, nb] = await Promise.all([ra, rb]);
  assert.strictEqual(na.seat, 1);
  assert.strictEqual(nb.seat, 0);
  assert.strictEqual(na.state.winner, null);
  assert.deepStrictEqual(na.scores, { me: 1, opponent: 0, draws: 0 });

  a.close();
  b.close();
});

test('sala inexistente, cheia e jogo inválido', async () => {
  const { a, b, code } = await setupRoom('tictactoe');
  const c = await connect();
  assert.deepStrictEqual(await emit(c, 'room:join', { code: 'ZZZZ' }), { ok: false, error: 'Sala não encontrada.' });
  assert.deepStrictEqual(await emit(c, 'room:join', { code }), { ok: false, error: 'Sala cheia.' });
  assert.strictEqual((await emit(c, 'room:create', { gameId: 'xadrez' })).ok, false);
  assert.strictEqual((await emit(c, 'room:create', { gameId: '__proto__' })).ok, false);
  assert.strictEqual((await emit(c, 'room:join', null)).ok, false);
  [a, b, c].forEach((s) => s.close());
});

test('desconexão do adversário encerra a partida e apaga a sala', async () => {
  const { a, b, code } = await setupRoom('tictactoe');
  const closed = once(a, 'room:closed');
  b.close();
  const info = await closed;
  assert.strictEqual(info.reason, 'disconnected');
  assert.strictEqual(rooms.has(code), false);
  const res = await emit(a, 'game:move', { move: 0 });
  assert.strictEqual(res.ok, false);
  a.close();
});

test('sair da sala avisa o adversário', async () => {
  const { a, b, code } = await setupRoom('tictactoe');
  const closed = once(b, 'room:closed');
  a.emit('room:leave');
  assert.strictEqual((await closed).reason, 'left');
  assert.strictEqual(rooms.has(code), false);
  a.close();
  b.close();
});
