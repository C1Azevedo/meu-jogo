const test = require('node:test');
const assert = require('node:assert');
const ch = require('../games/chess');
const ai = require('../games/ai');

const sq = ch.parseSquare;
/** Aplica lances em notação de casas: 'e2e4', 'e7e8q'... */
function play(state, ...uci) {
  for (const u of uci) {
    const move = { from: sq(u.slice(0, 2)), to: sq(u.slice(2, 4)), promotion: u[4] };
    const legal = ch.getMoves(state).find((m) => ch.moveKey(m) === ch.moveKey(move));
    assert.ok(legal, `lance ilegal: ${u}`);
    state = ch.applyMove(state, legal);
  }
  return state;
}
const has = (state, u) => ch.getMoves(state).some((m) => ch.moveKey(m) === ch.moveKey({ from: sq(u.slice(0, 2)), to: sq(u.slice(2, 4)), promotion: u[4] }));

function perft(s, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of ch.getMoves(s)) n += d === 1 ? 1 : perft(ch.applyMove(s, m), d - 1);
  return n;
}

test('perft: contagem de posições bate com os valores de referência', () => {
  assert.deepStrictEqual([1, 2, 3].map((d) => perft(ch.createState(), d)), [20, 400, 8902]);
  // "Kiwipete": roque, en passant, promoções e cravadas
  const kiwi = ch.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.deepStrictEqual([1, 2].map((d) => perft(kiwi, d)), [48, 2039]);
  const pos3 = ch.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.deepStrictEqual([1, 2, 3].map((d) => perft(pos3, d)), [14, 191, 2812]);
  const pos5 = ch.fromFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  assert.deepStrictEqual([1, 2].map((d) => perft(pos5, d)), [44, 1486]);
});

test('roque pequeno e grande move rei e torre', () => {
  const s = ch.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const short = play(s, 'e1g1');
  assert.strictEqual(short.board[sq('g1')], 'K');
  assert.strictEqual(short.board[sq('f1')], 'R');
  assert.strictEqual(short.board[sq('h1')], '');
  assert.strictEqual(short.castling, 'kq');
  const long = play(short, 'e8c8');
  assert.strictEqual(long.board[sq('c8')], 'k');
  assert.strictEqual(long.board[sq('d8')], 'r');
  assert.strictEqual(long.board[sq('a8')], '');
  assert.strictEqual(long.castling, '');
});

test('roque proibido: em xeque, passando por casa atacada ou com peça no caminho', () => {
  // Rei em xeque pela torre em e8
  assert.ok(!has(ch.fromFEN('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'e1g1'));
  // f1 atacada pelo bispo em c4 → sem roque pequeno; grande continua possível
  const s = ch.fromFEN('6k1/8/8/8/2b5/8/8/R3K2R w KQ - 0 1');
  assert.ok(!has(s, 'e1g1'));
  assert.ok(has(s, 'e1c1'));
  // Cavalo em b1 bloqueia o roque grande
  assert.ok(!has(ch.fromFEN('6k1/8/8/8/8/8/8/RN2K2R w KQ - 0 1'), 'e1c1'));
});

test('direito de roque se perde ao mover o rei, a torre ou ter a torre capturada', () => {
  let s = ch.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  s = play(s, 'h1h2', 'a8a7');
  assert.strictEqual(s.castling, 'Qk');
  s = play(s, 'e1d1', 'a7a1'); // rei branco anda; torre preta captura a torre de a1
  assert.strictEqual(s.castling, 'k');
  const s2 = play(ch.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'a1a8'); // captura a torre de a8
  assert.strictEqual(s2.castling, 'Kk');
});

test('en passant: só no lance imediatamente seguinte', () => {
  let s = play(ch.createState(), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  assert.strictEqual(s.ep, sq('d6'));
  assert.ok(has(s, 'e5d6'));
  const taken = play(s, 'e5d6');
  assert.strictEqual(taken.board[sq('d5')], '', 'o peão capturado sai do tabuleiro');
  assert.strictEqual(taken.board[sq('d6')], 'P');
  assert.deepStrictEqual(taken.captured[0], ['p']);
  // Se não capturar na hora, perde o direito
  const later = play(s, 'h2h3', 'h7h6');
  assert.ok(!has(later, 'e5d6'));
});

test('en passant proibido quando deixaria o rei em xeque', () => {
  // Rei branco em a5, peão branco b5, peão preto c5 (acabou de avançar), torre preta em h5.
  const s = ch.fromFEN('7k/8/8/KPp4r/8/8/8/8 w - c6 0 1');
  assert.ok(!has(s, 'b5c6'));
});

test('promoção: as quatro opções, inclusive capturando', () => {
  const s = ch.fromFEN('1r4k1/P7/8/8/8/8/8/6K1 w - - 0 1');
  const promos = ch.getMoves(s).filter((m) => m.promotion).map((m) => ch.squareName(m.to) + m.promotion).sort();
  assert.deepStrictEqual(promos, ['a8b', 'a8n', 'a8q', 'a8r', 'b8b', 'b8n', 'b8q', 'b8r']);
  assert.strictEqual(play(s, 'a7a8n').board[sq('a8')], 'N');
  assert.strictEqual(play(s, 'a7b8q').board[sq('b8')], 'Q');
  // Sem escolher a peça, a jogada não existe (o servidor recusa)
  assert.ok(!has(s, 'a7a8'));
});

test('xeque: o lado em xeque só pode sair do xeque', () => {
  const s = play(ch.createState(), 'e2e4', 'f7f6', 'd1h5');
  assert.strictEqual(s.check, true);
  assert.strictEqual(ch.statusNote(s), 'Xeque!');
  for (const m of ch.getMoves(s)) {
    const after = ch.applyMove(s, m);
    assert.ok(!ch.isAttacked(after.board, after.board.indexOf('k'), 0));
  }
  assert.ok(has(s, 'g7g6'));
  assert.ok(!has(s, 'a7a6'));
});

test('peça cravada não pode sair da linha do rei', () => {
  const s = ch.fromFEN('4k3/8/8/8/4r3/8/4N3/4K3 w - - 0 1');
  assert.ok(ch.getMoves(s).every((m) => m.from !== sq('e2')));
});

test('xeque-mate (mate do louco)', () => {
  const s = play(ch.createState(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.strictEqual(s.winner, 1);
  assert.strictEqual(s.reason, 'checkmate');
  assert.strictEqual(ch.resultDetail(s), 'Xeque-mate!');
  assert.deepStrictEqual(ch.getMoves(s), []);
});

test('afogamento é empate', () => {
  const s = play(ch.fromFEN('7k/8/6Q1/8/8/8/8/K7 w - - 0 1'), 'g6f7');
  assert.strictEqual(s.winner, 'draw');
  assert.strictEqual(s.reason, 'stalemate');
});

test('empate por repetição tripla', () => {
  let s = ch.createState();
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  s = play(s, ...cycle); // posição inicial pela 2ª vez
  assert.strictEqual(s.winner, null);
  s = play(s, ...cycle.slice(0, 3));
  assert.strictEqual(s.winner, null);
  s = play(s, cycle[3]); // 3ª vez
  assert.strictEqual(s.winner, 'draw');
  assert.strictEqual(s.reason, 'repetition');
});

test('regra dos 50 lances (100 meios-lances sem captura nem lance de peão)', () => {
  let s = ch.fromFEN('4k3/8/8/8/8/8/R7/4K3 w - - 98 80');
  s = play(s, 'a2b2');
  assert.strictEqual(s.winner, null);
  s = play(s, 'e8d8');
  assert.strictEqual(s.winner, 'draw');
  assert.strictEqual(s.reason, 'fifty');
  // Lance de peão zera a contagem
  const reset = play(ch.fromFEN('4k3/8/8/8/8/8/P7/4K3 w - - 98 80'), 'a2a3');
  assert.strictEqual(reset.halfmove, 0);
});

test('material insuficiente é empate', () => {
  const s = play(ch.fromFEN('4k3/8/8/8/8/8/3q4/4K3 w - - 0 1'), 'e1d2'); // rei captura a dama
  assert.strictEqual(s.winner, 'draw');
  assert.strictEqual(s.reason, 'material');
});

test('lista de peças capturadas', () => {
  const s = play(ch.createState(), 'e2e4', 'd7d5', 'e4d5', 'd8d5');
  assert.deepStrictEqual(s.captured, [['p'], ['P']]);
});

test('o cache de jogadas não vai no JSON (rede) e o estado volta igual', () => {
  const s = play(ch.createState(), 'e2e4');
  const json = JSON.parse(JSON.stringify(s));
  assert.strictEqual(json._moves, undefined);
  assert.strictEqual(ch.getMoves(json).length, ch.getMoves(s).length);
});

test('moveKey rejeita formatos inválidos', () => {
  for (const bad of [null, 5, 'e2e4', {}, { from: 12 }, { from: -1, to: 3 }, { from: 0, to: 64 }, { from: 1, to: 2, promotion: 'k' }, { from: 1.5, to: 2 }]) {
    assert.strictEqual(ch.moveKey(bad), null, JSON.stringify(bad));
  }
  assert.strictEqual(ch.moveKey({ from: 8, to: 0, promotion: 'q' }), '8-0q');
});

test('IA difícil encontra mate em 1', () => {
  const s = ch.fromFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const m = ai.chooseMove(ch, s, 'hard');
  assert.strictEqual(ch.squareName(m.from) + ch.squareName(m.to), 'a1a8');
});

test('IA média (material, profundidade 2) captura a dama solta e não entrega a própria', () => {
  // Dama preta indefesa em d4, cavalo branco em f3 pode capturá-la.
  const s = ch.fromFEN('4k3/8/8/8/3q4/5N2/8/4K3 w - - 0 1');
  const m = ai.chooseMove(ch, s, 'medium');
  assert.strictEqual(ch.squareName(m.from) + ch.squareName(m.to), 'f3d4');
  // Dama branca atacada pelo peão: a média tira a dama dali (não deixa capturar).
  const s2 = ch.fromFEN('4k3/8/8/2p5/3Q4/8/8/4K3 w - - 0 1');
  for (let i = 0; i < 5; i++) {
    const m2 = ai.chooseMove(ch, s2, 'medium');
    const after = ch.applyMove(s2, m2);
    assert.ok(after.board.includes('Q'), 'não pode perder a dama');
    const reply = ai.chooseMove(ch, after, 'hard');
    assert.ok(!(reply.captured === 'Q'), 'a dama ficou atacada');
  }
});

test('IA difícil não cai numa troca ruim (quiescência)', () => {
  // Bxd5 parece ganhar um peão, mas d5 está protegido por e6: o bispo seria recapturado.
  const s = ch.fromFEN('4k3/8/4p3/3p4/8/8/6B1/4K3 w - - 0 1');
  const m = ai.chooseMove(ch, s, 'hard');
  assert.notStrictEqual(ch.squareName(m.from) + ch.squareName(m.to), 'g2d5');
});

test('IA: todas as dificuldades devolvem jogada legal e a difícil respeita o tempo', () => {
  let s = ch.createState();
  for (const level of ['easy', 'medium', 'hard', 'easy', 'medium', 'hard']) {
    const t = Date.now();
    const m = ai.chooseMove(ch, s, level);
    assert.ok(Date.now() - t < 3000, `${level} demorou demais`);
    assert.ok(ch.getMoves(s).includes(m));
    s = ch.applyMove(s, m);
  }
});

test('IA difícil vence a fácil', () => {
  const fastHard = { ...ch, ai: { ...ch.ai, timeLimitMs: 250 } };
  let s = ch.createState();
  while (s.winner === null && s.moveCount < 300) {
    s = ch.applyMove(s, ai.chooseMove(s.turn === 0 ? fastHard : ch, s, s.turn === 0 ? 'hard' : 'easy'));
  }
  assert.strictEqual(s.winner, 0, `resultado: ${s.winner} (${s.reason})`);
});
