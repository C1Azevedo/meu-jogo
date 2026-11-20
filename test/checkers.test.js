const test = require('node:test');
const assert = require('node:assert');
const ck = require('../games/checkers');
const ai = require('../games/ai');

const sq = (r, c) => r * 8 + c;
const W = 1; // pedra branca (jogador 0, sobe)
const WK = 2; // dama branca
const B = -1; // pedra preta (jogador 1, desce)
const BK = -2; // dama preta

/** Monta um estado com as peças dadas: [[linha, coluna, valor], ...] */
function position(pieces, turn = 0) {
  const s = ck.createState();
  s.board = Array(64).fill(0);
  for (const [r, c, v] of pieces) s.board[sq(r, c)] = v;
  s.turn = turn;
  return s;
}
const keys = (moves) => moves.map(ck.moveKey).sort();

test('posição inicial: 12 peças de cada lado e 7 jogadas para as brancas', () => {
  const s = ck.createState();
  assert.strictEqual(s.board.filter((v) => v === W).length, 12);
  assert.strictEqual(s.board.filter((v) => v === B).length, 12);
  assert.strictEqual(s.turn, 0);
  const moves = ck.getMoves(s);
  assert.strictEqual(moves.length, 7);
  assert.ok(moves.every((m) => m.captures.length === 0));
});

test('pedra só anda para frente (sem captura)', () => {
  const s = position([[4, 3, W], [0, 1, B]]);
  assert.deepStrictEqual(keys(ck.getMoves(s)), [`${sq(4, 3)}:${sq(3, 2)}`, `${sq(4, 3)}:${sq(3, 4)}`].sort());
});

test('captura é obrigatória', () => {
  // Branca em (5,2) pode capturar a preta em (4,3); outra branca longe poderia andar.
  const s = position([[5, 2, W], [4, 3, B], [6, 7, W], [0, 1, B]]);
  const moves = ck.getMoves(s);
  assert.strictEqual(moves.length, 1);
  assert.deepStrictEqual(moves[0], { from: sq(5, 2), path: [sq(3, 4)], captures: [sq(4, 3)] });
  assert.ok(ck.hasCaptures(s));
});

test('pedra captura para trás', () => {
  const s = position([[3, 4, W], [4, 5, B], [0, 1, B]]);
  const moves = ck.getMoves(s);
  assert.strictEqual(moves.length, 1);
  assert.deepStrictEqual(moves[0].path, [sq(5, 6)]);
  assert.deepStrictEqual(moves[0].captures, [sq(4, 5)]);
});

test('captura múltipla em uma única jogada', () => {
  // (6,1) captura (5,2) → (4,3), depois (3,4) → (2,5)
  const s = position([[6, 1, W], [5, 2, B], [3, 4, B], [0, 7, B]]);
  const moves = ck.getMoves(s);
  assert.strictEqual(moves.length, 1);
  assert.deepStrictEqual(moves[0].path, [sq(4, 3), sq(2, 5)]);
  const after = ck.applyMove(s, moves[0]);
  assert.strictEqual(after.board[sq(5, 2)], 0);
  assert.strictEqual(after.board[sq(3, 4)], 0);
  assert.strictEqual(after.board[sq(2, 5)], W);
  assert.strictEqual(after.turn, 1);
});

test('lei da maioria: obrigatório escolher a sequência que captura mais', () => {
  // Opção A: (5,2) captura 1 peça para a esquerda. Opção B: captura 2 peças para a direita.
  const s = position([
    [5, 2, W],
    [4, 1, B], // captura simples → (3,0)
    [4, 3, B], [2, 5, B], // captura dupla → (3,4) → (1,6)
    [0, 1, B],
  ]);
  const moves = ck.getMoves(s);
  assert.strictEqual(moves.length, 1);
  assert.strictEqual(moves[0].captures.length, 2);
  assert.deepStrictEqual(moves[0].path, [sq(3, 4), sq(1, 6)]);
});

test('promoção a dama ao terminar na última linha', () => {
  const s = position([[1, 2, W], [7, 0, B]]);
  const move = ck.getMoves(s).find((m) => m.path[0] === sq(0, 1));
  const after = ck.applyMove(s, move);
  assert.strictEqual(after.board[sq(0, 1)], WK);
});

test('pedra que passa pela última linha capturando e continua não é promovida', () => {
  // Branca (2,1) captura (1,2) → (0,3), e de lá captura (1,4) → (2,5) (para trás).
  const s = position([[2, 1, W], [1, 2, B], [1, 4, B], [7, 0, B]]);
  const moves = ck.getMoves(s);
  assert.strictEqual(moves.length, 1);
  assert.deepStrictEqual(moves[0].path, [sq(0, 3), sq(2, 5)]);
  const after = ck.applyMove(s, moves[0]);
  assert.strictEqual(after.board[sq(2, 5)], W, 'continua pedra');
});

test('dama voadora anda várias casas', () => {
  const s = position([[7, 0, WK], [0, 1, B]]);
  const moves = ck.getMoves(s);
  // Diagonal (7,0) → (0,7): 7 casas livres
  assert.strictEqual(moves.length, 7);
});

test('dama captura à distância e escolhe onde pousar', () => {
  // Dama em (7,0); preta em (4,3); pode pousar em (3,4), (2,5), (1,6) ou (0,7)
  const s = position([[7, 0, WK], [4, 3, B]]);
  const moves = ck.getMoves(s);
  assert.deepStrictEqual(moves.map((m) => m.path[0]).sort((a, b) => a - b), [sq(0, 7), sq(1, 6), sq(2, 5), sq(3, 4)]);
  assert.ok(moves.every((m) => m.captures[0] === sq(4, 3)));
});

test('dama em captura múltipla deve pousar onde continua capturando (maioria)', () => {
  // Dama (7,0) captura (5,2). Só pousando em (3,4) ela alcança a preta em (2,3) e captura de novo.
  const s = position([[7, 0, WK], [5, 2, B], [2, 3, B]]);
  const moves = ck.getMoves(s);
  assert.ok(moves.length >= 1);
  assert.ok(moves.every((m) => m.captures.length === 2 && m.path[0] === sq(3, 4)));
});

test('peça capturada não pode ser pulada duas vezes e bloqueia o caminho', () => {
  // Dama branca cercando uma única preta: deve capturar 1 só, nunca a mesma 2x.
  const s = position([[4, 1, WK], [3, 2, B], [7, 6, B]]);
  for (const m of ck.getMoves(s)) {
    assert.strictEqual(new Set(m.captures).size, m.captures.length);
  }
});

test('perde quem fica sem peças', () => {
  const s = position([[5, 2, W], [4, 3, B]]);
  const after = ck.applyMove(s, ck.getMoves(s)[0]);
  assert.strictEqual(after.winner, 0);
  assert.deepStrictEqual(ck.getMoves(after), []);
});

test('perde quem fica sem movimentos (bloqueado)', () => {
  // Pedra preta em (5,0) não pode andar: (6,1) está ocupada e o pouso da captura, (7,2), também.
  const s = position([[5, 0, B], [6, 1, W], [7, 2, W], [4, 5, W]]);
  const move = ck.getMoves(s).find((m) => m.from === sq(4, 5));
  const after = ck.applyMove(s, move);
  assert.strictEqual(after.winner, 0);
});

test('empate após 20 lances de cada lado só com damas e sem captura', () => {
  // As duas damas vão e voltam em diagonais que nunca se cruzam.
  let s = position([[7, 2, WK], [0, 3, BK]]);
  const plan = [
    { from: sq(7, 2), path: [sq(6, 1)], captures: [] },
    { from: sq(0, 3), path: [sq(1, 4)], captures: [] },
    { from: sq(6, 1), path: [sq(7, 2)], captures: [] },
    { from: sq(1, 4), path: [sq(0, 3)], captures: [] },
  ];
  for (let i = 0; i < 39; i++) {
    s = ck.applyMove(s, plan[i % 4]);
    assert.strictEqual(s.winner, null, 'lance ' + i);
  }
  s = ck.applyMove(s, plan[39 % 4]);
  assert.strictEqual(s.winner, 'draw');
});

test('moveKey rejeita formatos inválidos', () => {
  for (const bad of [null, 3, 'a', {}, { from: 1 }, { from: 1, path: [] }, { from: 1, path: ['x'] }, { from: 1.5, path: [2] }]) {
    assert.strictEqual(ck.moveKey(bad), null, JSON.stringify(bad));
  }
  assert.strictEqual(ck.moveKey({ from: 1, path: [10, 19] }), '1:10,19');
});

test('IA sempre devolve jogada legal em todas as dificuldades', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    let s = ck.createState();
    for (let i = 0; i < 12 && s.winner === null; i++) {
      const t = Date.now();
      const m = ai.chooseMove(ck, s, level);
      assert.ok(Date.now() - t < 2500, `${level} demorou demais`);
      assert.ok(keys(ck.getMoves(s)).includes(ck.moveKey(m)));
      s = ck.applyMove(s, m);
    }
  }
});

test('IA média aproveita uma captura dupla em vez de simples', () => {
  const s = position([[5, 2, W], [4, 1, B], [4, 3, B], [2, 5, B], [0, 1, B]]);
  const m = ai.chooseMove(ck, s, 'medium');
  assert.strictEqual(m.captures.length, 2);
});

test('IA difícil vence a fácil', () => {
  let s = ck.createState();
  const hardSeat = 1;
  while (s.winner === null && s.moveCount < 200) {
    s = ck.applyMove(s, ai.chooseMove(ck, s, s.turn === hardSeat ? 'hard' : 'easy'));
  }
  assert.strictEqual(s.winner, hardSeat);
});
