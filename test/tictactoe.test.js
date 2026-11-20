const test = require('node:test');
const assert = require('node:assert');
const ttt = require('../games/tictactoe');
const ai = require('../games/ai');

function play(moves) {
  return moves.reduce((s, m) => ttt.applyMove(s, m), ttt.createState());
}

test('estado inicial', () => {
  const s = ttt.createState();
  assert.strictEqual(s.turn, 0);
  assert.strictEqual(s.winner, null);
  assert.deepStrictEqual(ttt.getMoves(s), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('detecta vitória em linha, coluna e diagonal', () => {
  assert.strictEqual(play([0, 3, 1, 4, 2]).winner, 0); // linha
  assert.deepStrictEqual(play([0, 3, 1, 4, 2]).winLine, [0, 1, 2]);
  assert.strictEqual(play([1, 0, 2, 3, 4, 6]).winner, 1); // coluna 0,3,6
  assert.strictEqual(play([0, 1, 4, 2, 8]).winner, 0); // diagonal
  assert.deepStrictEqual(ttt.getMoves(play([0, 3, 1, 4, 2])), []);
});

test('detecta empate', () => {
  const s = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.strictEqual(s.winner, 'draw');
});

test('applyMove não altera o estado anterior', () => {
  const s = ttt.createState();
  ttt.applyMove(s, 4);
  assert.strictEqual(s.board[4], null);
});

test('IA média vence quando pode e bloqueia quando precisa', () => {
  // X: 0,1  O: 3,4 — vez de X: deve ganhar em 2
  const win = play([0, 3, 1, 4]);
  for (let i = 0; i < 20; i++) assert.strictEqual(ai.chooseMove(ttt, win, 'medium'), 2);
  // X: 0,1  O: 4 — vez de O: deve bloquear em 2
  const block = play([0, 4, 1]);
  for (let i = 0; i < 20; i++) assert.strictEqual(ai.chooseMove(ttt, block, 'medium'), 2);
});

test('IA difícil nunca perde (contra todas as respostas possíveis)', () => {
  // Explora todas as linhas de jogo do adversário; a IA joga com a busca completa.
  let games = 0;
  function explore(state, aiSeat) {
    if (state.winner !== null) {
      games++;
      assert.notStrictEqual(state.winner, 1 - aiSeat, 'a IA perdeu: ' + state.board.join(','));
      return;
    }
    if (state.turn === aiSeat) {
      explore(ttt.applyMove(state, ai.chooseMove(ttt, state, 'hard')), aiSeat);
    } else {
      for (const m of ttt.getMoves(state)) explore(ttt.applyMove(state, m), aiSeat);
    }
  }
  explore(ttt.createState(), 0);
  explore(ttt.createState(), 1);
  assert.ok(games > 100);
});

test('IA difícil contra IA difícil sempre empata', () => {
  for (let i = 0; i < 5; i++) {
    let s = ttt.createState();
    while (s.winner === null) s = ttt.applyMove(s, ai.chooseMove(ttt, s, 'hard'));
    assert.strictEqual(s.winner, 'draw');
  }
});

test('IA fácil sempre devolve jogada legal e às vezes erra', () => {
  // Situação em que precisa bloquear: a fácil deve falhar em parte das vezes.
  const block = play([0, 4, 1]);
  const picks = new Set();
  for (let i = 0; i < 200; i++) {
    const m = ai.chooseMove(ttt, block, 'easy');
    assert.ok(ttt.getMoves(block).includes(m));
    picks.add(m);
  }
  assert.ok(picks.size > 1);
});
