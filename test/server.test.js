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

test('Ligue 4 online: servidor valida coluna e detecta vitória', async () => {
  const { a, b } = await setupRoom('connect4');
  // Coluna inexistente / formato errado
  for (const bad of [7, -1, '3a', [3]]) {
    assert.strictEqual((await emit(a, 'game:move', { move: bad })).ok, false, JSON.stringify(bad));
  }
  const seq = [[a, 0], [b, 0], [a, 1], [b, 1], [a, 2], [b, 2]];
  for (const [c, m] of seq) {
    const upd = once(b, 'game:state');
    assert.ok((await emit(c, 'game:move', { move: m })).ok);
    await upd;
  }
  const fin = once(b, 'game:state');
  await emit(a, 'game:move', { move: 3 });
  const { state, scores } = await fin;
  assert.strictEqual(state.winner, 0);
  assert.strictEqual(state.winLine.length, 4);
  assert.deepStrictEqual(scores, { me: 0, opponent: 1, draws: 0 });
  a.close();
  b.close();
});

test('Damas online: servidor recusa jogadas ilegais e usa as capturas calculadas por ele', async () => {
  const { a, b, code } = await setupRoom('checkers');
  // Movimento de pedra para trás / casa inexistente / formato errado
  for (const bad of [{ from: 40, path: [49] }, { from: 40, path: [99] }, { from: 'x', path: [33] }, 33]) {
    assert.strictEqual((await emit(a, 'game:move', { move: bad })).ok, false, JSON.stringify(bad));
  }
  // Brancas: (5,2)=42 → (4,3)=35 ; Pretas: (2,5)=21 → (3,4)=28 ; agora brancas são obrigadas a capturar.
  let upd = once(b, 'game:state');
  assert.ok((await emit(a, 'game:move', { move: { from: 42, path: [35] } })).ok);
  await upd;
  upd = once(a, 'game:state');
  assert.ok((await emit(b, 'game:move', { move: { from: 21, path: [28] } })).ok);
  await upd;
  // Tentar ignorar a captura obrigatória
  assert.strictEqual((await emit(a, 'game:move', { move: { from: 40, path: [33] } })).ok, false);
  // Mandar "capturas" falsas junto com a jogada certa: o servidor ignora e usa as dele
  upd = once(b, 'game:state');
  const res = await emit(a, 'game:move', { move: { from: 35, path: [21], captures: [1, 3, 5, 7] } });
  assert.ok(res.ok);
  const { state } = await upd;
  assert.deepStrictEqual(state.lastMove.captures, [28]);
  assert.strictEqual(state.board.filter((v) => v < 0).length, 11);
  assert.strictEqual(rooms.get(code).state.board[1], -1, 'peças não capturadas continuam lá');
  a.close();
  b.close();
});

test('Campo Minado online: opções validadas, minas nunca enviadas e trapaças recusadas', async () => {
  const a = await connect();
  const b = await connect();
  // Cliente tenta forçar o modo solo e mandar lixo nas opções: o servidor ignora.
  const created = await emit(a, 'room:create', { gameId: 'minesweeper', options: { level: 'medium', mode: 'solo', mines: [1, 2] } });
  assert.deepStrictEqual(created.options, { level: 'medium', mode: 'versus' });

  // Registra TUDO que os clientes recebem, para conferir que as minas nunca vazam.
  const received = [];
  for (const c of [a, b]) c.onAny((event, payload) => received.push({ event, payload }));

  const startA = once(a, 'game:start');
  const startB = once(b, 'game:start');
  await emit(b, 'room:join', { code: created.code });
  const [sa, sb] = await Promise.all([startA, startB]);
  assert.strictEqual(sa.state.cols, 16);
  assert.strictEqual(sb.state.mode, 'versus');

  // Trapaças: fora da vez, fora do tabuleiro, formato errado
  assert.strictEqual((await emit(b, 'game:move', { move: 0 })).ok, false);
  for (const bad of [-1, 256, '5', 2.5, { index: 3 }]) {
    assert.strictEqual((await emit(a, 'game:move', { move: bad })).ok, false, JSON.stringify(bad));
  }

  // Primeira jogada de A: nunca é mina
  let upd = once(b, 'game:state');
  assert.ok((await emit(a, 'game:move', { move: 136 })).ok);
  let { state } = await upd;
  assert.strictEqual(state.exploded, null);
  assert.ok(state.opened[0] >= 1);
  // Abrir de novo uma casa já aberta é recusado
  assert.strictEqual((await emit(b, 'game:move', { move: 136 })).ok, false);

  // B pisa numa mina (o teste espia o servidor para saber onde há mina).
  const room = rooms.get(created.code);
  const mine = room.state.mines.indexOf(1);
  const endA = once(a, 'game:state');
  upd = once(b, 'game:state');
  assert.ok((await emit(b, 'game:move', { move: mine })).ok);
  ({ state } = await upd);
  const finalA = await endA;
  assert.strictEqual(state.winner, 0);
  assert.strictEqual(state.exploded, mine);
  assert.strictEqual(state.mineMap.length, 40, 'no fim, as minas são reveladas');
  assert.deepStrictEqual(finalA.scores, { me: 1, opponent: 0, draws: 0 });
  // Depois do fim, nada é aceito
  assert.strictEqual((await emit(a, 'game:move', { move: 0 })).ok, false);

  // Nenhuma mensagem antes do fim continha as minas.
  for (const { event, payload } of received) {
    const json = JSON.stringify(payload);
    assert.ok(!json.includes('"mines"'), `${event} vazou o campo mines`);
    if (payload && payload.state && payload.state.winner === null) {
      assert.strictEqual(payload.state.mineMap, null, `${event} vazou mineMap`);
      assert.ok(payload.state.cells.every((v) => v >= -1 && v <= 8));
    }
  }

  // Revanche: lugares invertidos e tabuleiro novo do mesmo nível
  const ra = once(a, 'game:start');
  const rb = once(b, 'game:start');
  a.emit('game:rematch');
  b.emit('game:rematch');
  const [na, nb] = await Promise.all([ra, rb]);
  assert.strictEqual(na.seat, 1);
  assert.strictEqual(nb.seat, 0);
  assert.strictEqual(na.state.moveCount, 0);
  assert.strictEqual(na.state.cols, 16);
  assert.ok(!JSON.stringify(na).includes('"mines"'));
  a.close();
  b.close();
});

test('Campo Minado online: nível inválido vira fácil', async () => {
  const a = await connect();
  for (const options of [{ level: 'insano' }, null, 'medium', { level: '__proto__' }]) {
    const res = await emit(a, 'room:create', { gameId: 'minesweeper', options });
    assert.deepStrictEqual(res.options, { level: 'easy', mode: 'versus' }, JSON.stringify(options));
  }
  a.close();
});
