const test = require('node:test');
const assert = require('node:assert');
const c4 = require('../games/connect4');
const ai = require('../games/ai');

function play(cols) {
  return cols.reduce((s, c) => c4.applyMove(s, c), c4.createState());
}

test('peça cai na linha mais baixa livre', () => {
  const s = play([3, 3, 3]);
  assert.strictEqual(s.board[5 * 7 + 3], 0);
  assert.strictEqual(s.board[4 * 7 + 3], 1);
  assert.strictEqual(s.board[3 * 7 + 3], 0);
  assert.strictEqual(s.lastMove, 3 * 7 + 3);
});

test('coluna cheia sai da lista de jogadas', () => {
  const s = play([0, 0, 0, 0, 0, 0]);
  assert.ok(!c4.getMoves(s).includes(0));
  assert.strictEqual(c4.getMoves(s).length, 6);
});

test('vitória horizontal', () => {
  const s = play([0, 0, 1, 1, 2, 2, 3]);
  assert.strictEqual(s.winner, 0);
  assert.deepStrictEqual(s.winLine, [35, 36, 37, 38]);
});

test('vitória vertical', () => {
  const s = play([0, 1, 0, 1, 0, 1, 0]);
  assert.strictEqual(s.winner, 0);
  assert.strictEqual(s.winLine.length, 4);
});

test('vitória diagonal ↗ e ↘', () => {
  // ↗: vermelho em (5,0),(4,1),(3,2),(2,3)
  const up = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.strictEqual(up.winner, 0);
  assert.deepStrictEqual(up.winLine, [2 * 7 + 3, 3 * 7 + 2, 4 * 7 + 1, 5 * 7 + 0]);
  // ↘: vermelho em (2,3),(3,4),(4,5),(5,6)
  const down = play([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
  assert.strictEqual(down.winner, 0);
  assert.deepStrictEqual(down.winLine, [2 * 7 + 3, 3 * 7 + 4, 4 * 7 + 5, 5 * 7 + 6]);
});

test('vitória fechando no meio da linha (peça central completa 4)', () => {
  const s = play([0, 0, 1, 1, 3, 3, 2]);
  assert.strictEqual(s.winner, 0);
});

test('empate com o tabuleiro cheio sem 4 em linha', () => {
  // Sequência que enche o tabuleiro sem ninguém alinhar 4.
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  let s = c4.createState();
  for (const c of order) {
    assert.strictEqual(s.winner, null, 'não deveria terminar antes: ' + c);
    s = c4.applyMove(s, c);
  }
  assert.strictEqual(s.winner, 'draw');
});

test('IA média completa a vitória e bloqueia', () => {
  // Vermelho tem 3 na base (0,1,2); vez do vermelho → joga 3
  const win = play([0, 0, 1, 1, 2, 5]);
  for (let i = 0; i < 10; i++) assert.strictEqual(ai.chooseMove(c4, win, 'medium'), 3);
  // Vez do amarelo → bloqueia em 3
  const block = play([0, 0, 1, 1, 2]);
  for (let i = 0; i < 10; i++) assert.strictEqual(ai.chooseMove(c4, block, 'medium'), 3);
});

test('IA difícil responde dentro do limite de tempo e evita armadilha dupla', () => {
  // Vermelho ameaça abrir duas pontas na base (_ X X _ _): amarelo precisa jogar ao lado.
  const s = play([2, 6, 3]);
  const t = Date.now();
  const move = ai.chooseMove(c4, s, 'hard');
  assert.ok(Date.now() - t < 2500, 'demorou demais');
  assert.ok([1, 4].includes(move), 'deveria impedir o duplo ataque, jogou ' + move);
});

test('IA difícil vence a média na maioria das partidas', () => {
  let hardWins = 0;
  let hardLosses = 0;
  for (let g = 0; g < 4; g++) {
    const hardSeat = g % 2;
    let s = c4.createState();
    while (s.winner === null) {
      s = c4.applyMove(s, ai.chooseMove(c4, s, s.turn === hardSeat ? 'hard' : 'medium'));
    }
    if (s.winner === hardSeat) hardWins++;
    else if (s.winner !== 'draw') hardLosses++;
  }
  assert.ok(hardWins > hardLosses, `difícil ${hardWins} x ${hardLosses} médio`);
});
