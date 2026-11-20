const test = require('node:test');
const assert = require('node:assert');
const ms = require('../games/minesweeper');
const ai = require('../games/ai');

/** Monta um estado com minas em posições fixas (já "depois do sorteio"). */
function withMines(options, mineList) {
  const s = ms.createState(options);
  s.mines = Array(s.cols * s.rows).fill(0);
  mineList.forEach((i) => { s.mines[i] = 1; });
  return s;
}
/** Gerador pseudoaleatório determinístico para os testes. */
function seeded(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

test('níveis: 9×9/10, 16×16/40 e 30×16/99', () => {
  for (const [level, cols, rows, mines] of [['easy', 9, 9, 10], ['medium', 16, 16, 40], ['hard', 30, 16, 99]]) {
    const s = ms.createState({ level });
    assert.deepStrictEqual([s.cols, s.rows, s.mineCount, s.cells.length], [cols, rows, mines, cols * rows]);
    assert.strictEqual(s.mines, null, 'minas só são sorteadas na primeira jogada');
  }
  assert.strictEqual(ms.createState({ level: 'impossivel' }).level, 'easy');
});

test('primeiro clique nunca cai em mina e abre uma área', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const level = ['easy', 'medium', 'hard'][seed % 3];
    const first = Math.floor(seededPick(seed) * ms.LEVELS[level].cols * ms.LEVELS[level].rows);
    const s = ms.applyMove(ms.createState({ level }), first, seeded(seed));
    assert.strictEqual(s.exploded, null);
    assert.strictEqual(s.winner, null);
    assert.strictEqual(s.cells[first], 0, 'a casa inicial e as vizinhas não têm minas');
    assert.strictEqual(s.mines.reduce((a, b) => a + b, 0), ms.LEVELS[level].mines);
  }
  function seededPick(seed) { return seeded(seed * 7)(); }
});

test('números contam as minas vizinhas', () => {
  // 3×3 de fácil: mina em (0,0); casa (1,1) tem 1
  const s = withMines({ level: 'easy' }, [0]);
  const after = ms.applyMove(s, 10);
  assert.strictEqual(after.cells[10], 1);
  assert.strictEqual(after.opened[0], 1, 'número não abre vizinhas');
});

test('abertura automática de áreas vazias (para nos números)', () => {
  // Só uma mina no canto (0,0) do 9×9: abrir o canto oposto abre tudo menos a mina → vitória
  const s = withMines({ level: 'easy', mode: 'solo' }, [0]);
  s.mineCount = 1;
  const after = ms.applyMove(s, 80);
  assert.strictEqual(after.cells[0], -1);
  assert.strictEqual(after.cells[1], 1);
  assert.strictEqual(after.cells[9], 1);
  assert.strictEqual(after.cells[10], 1);
  assert.strictEqual(after.cells[80], 0);
  assert.strictEqual(after.opened[0], 80);
  assert.strictEqual(after.winner, 0);
});

test('solo: pisar numa mina perde', () => {
  const s = withMines({ level: 'easy', mode: 'solo' }, [0, 40]);
  const after = ms.applyMove(ms.applyMove(s, 80), 40);
  assert.strictEqual(after.exploded, 40);
  assert.strictEqual(after.winner, 1);
  assert.strictEqual(after.turn, 0, 'no solo é sempre a vez do jogador');
  assert.deepStrictEqual(ms.getMoves(after), []);
});

test('versus: jogadas alternadas, quem pisa na mina perde', () => {
  const s = withMines({ level: 'easy', mode: 'versus' }, [0, 1, 2]);
  const a = ms.applyMove(s, 80); // jogador 0
  assert.strictEqual(a.turn, 1);
  const b = ms.applyMove(a, 1); // jogador 1 pisa na mina
  assert.strictEqual(b.winner, 0);
  assert.strictEqual(b.exploded, 1);
});

test('versus: campo limpo sem explosão → vence quem abriu mais casas', () => {
  // Minas na primeira linha inteira; a linha 1 fica toda com números.
  const mines = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const s0 = withMines({ level: 'easy', mode: 'versus' }, mines);
  s0.mineCount = 9;
  // Jogador 0 abre a casa (8,8) que abre a área grande (linhas 2..8 + números da linha 1)
  let s = ms.applyMove(s0, 80);
  assert.strictEqual(s.winner, 0, 'abriu tudo de uma vez');
  assert.strictEqual(s.opened[0], 72);
  assert.match(ms.resultDetail(s, 0), /72 × 0/);

  // Empate quando os dois abrem o mesmo número de casas.
  const s1 = withMines({ level: 'easy', mode: 'versus' }, []);
  s1.mineCount = 79; // todas menos (0,0) e (8,8)
  s1.mines = Array(81).fill(1);
  s1.mines[0] = 0;
  s1.mines[80] = 0;
  s = ms.applyMove(ms.applyMove(s1, 0), 80);
  assert.deepStrictEqual(s.opened, [1, 1]);
  assert.strictEqual(s.winner, 'draw');
});

test('estado público nunca contém as minas antes do fim', () => {
  const s = ms.applyMove(ms.createState({ level: 'medium', mode: 'versus' }), 100, seeded(3));
  const pub = ms.publicState(s);
  assert.strictEqual(pub.mines, undefined);
  assert.strictEqual(pub.mineMap, null);
  assert.ok(!JSON.stringify(pub).includes('"mines"'));
  // Casas fechadas continuam -1 (sem dica do conteúdo)
  assert.ok(pub.cells.every((v) => v >= -1 && v <= 8));
  assert.strictEqual(ms.publicState(pub), pub, 'é idempotente');

  // Depois do fim, o mapa das minas é revelado
  const mineIndex = s.mines.indexOf(1);
  const end = ms.publicState(ms.applyMove(s, mineIndex));
  assert.strictEqual(end.mineMap.length, 40);
  assert.ok(end.mineMap.includes(mineIndex));
});

test('IA: deduções simples encontram casas seguras e minas', () => {
  // Faixa 3×3 no canto: número 1 em (0,1) com só uma vizinha fechada → mina.
  const view = ms.publicState(ms.createState({ level: 'easy' }));
  const cells = view.cells.slice().fill(0);
  cells[0] = -1; // única fechada
  cells[1] = 1;
  cells[9] = 1;
  cells[10] = 1;
  const v = { ...view, cells, mineCount: 1 };
  const { mines } = ai.minesweeper.simpleDeductions(v);
  assert.deepStrictEqual([...mines], [0]);
});

test('IA média nunca chuta quando existe casa segura deduzível', () => {
  // Propriedade verificada ao longo de várias partidas reais.
  let checked = 0;
  for (let g = 0; g < 20; g++) {
    const rng = seeded(500 + g);
    let s = ms.createState({ level: 'medium', mode: 'solo' });
    s = ms.applyMove(s, 136, rng);
    while (s.winner === null) {
      const { safe, mines } = ai.minesweeper.simpleDeductions(ms.publicState(s));
      const move = ai.chooseMove(ms, s, 'medium', rng);
      assert.ok(!mines.has(move), 'abriu uma mina deduzível');
      if (safe.size) {
        assert.ok(safe.has(move), 'chutou havendo casa segura');
        checked++;
      }
      s = ms.applyMove(s, move, rng);
    }
  }
  assert.ok(checked > 50);
});

test('IA difícil: dedução por restrições encontra a casa segura', () => {
  // Tudo aberto menos (0,0) e (0,1); mina em (0,1). Números coerentes com isso.
  const base = ms.publicState(ms.createState({ level: 'easy' }));
  const cells = base.cells.slice().fill(0);
  cells[0] = -1;
  cells[1] = -1;
  cells[2] = 1; // (0,2) só vê (0,1) fechada → mina
  cells[9] = 1; // (1,0) vê (0,0) e (0,1)
  cells[10] = 1; // (1,1)
  cells[11] = 1; // (1,2) vê (0,1)
  const view = { ...base, cells, mineCount: 1 };
  const { probs } = ai.minesweeper.probabilities(view);
  assert.strictEqual(probs.get(1), 1);
  assert.strictEqual(probs.get(0), 0);
  assert.strictEqual(ai.chooseMove(ms, view, 'hard'), 0);
});

test('IA difícil: probabilidade global considera as casas do interior', () => {
  // 9×9, 10 minas, um único "1" aberto no canto (0,0)... com vizinhas fechadas.
  const base = ms.publicState(ms.createState({ level: 'easy' }));
  const cells = base.cells.slice().fill(-1);
  cells[0] = 1; // vizinhas: 1, 9, 10 → 1 mina entre 3 (≈33%)
  const { probs } = ai.minesweeper.probabilities({ ...base, cells, mineCount: 10 });
  const pFront = probs.get(1);
  const pInterior = probs.get(80);
  assert.ok(Math.abs(probs.get(1) - probs.get(9)) < 1e-9);
  assert.ok(Math.abs(pFront - 1 / 3) < 1e-9, 'fronteira: ' + pFront);
  assert.ok(Math.abs(pInterior - 9 / 77) < 1e-9, 'interior: ' + pInterior);
  // A casa mais segura é do interior.
  const move = ai.chooseMove(ms, { ...base, cells, mineCount: 10 }, 'hard');
  assert.ok(![1, 9, 10].includes(move));
});

test('IA não usa as minas: escolhe a mesma coisa com o estado completo e o público', () => {
  const s = ms.applyMove(ms.createState({ level: 'easy', mode: 'versus' }), 40, seeded(11));
  const fakeRng = seeded(5);
  const a = ai.chooseMove(ms, s, 'hard', fakeRng);
  const b = ai.chooseMove(ms, ms.publicState(s), 'hard', seeded(5));
  assert.strictEqual(a, b);
});

test('a IA difícil vence mais partidas solo que a média, que vence mais que a fácil', () => {
  const wins = { easy: 0, medium: 0, hard: 0 };
  for (const level of Object.keys(wins)) {
    for (let g = 0; g < 30; g++) {
      let s = ms.createState({ level: 'easy', mode: 'solo' });
      const rng = seeded(1000 + g);
      while (s.winner === null) s = ms.applyMove(s, ai.chooseMove(ms, s, level, rng), rng);
      if (s.winner === 0) wins[level]++;
    }
  }
  assert.ok(wins.hard > wins.medium && wins.medium > wins.easy, JSON.stringify(wins));
});

test('moveKey aceita só inteiros', () => {
  for (const bad of ['3', 1.5, null, {}, [3]]) assert.strictEqual(ms.moveKey(bad), null);
  assert.strictEqual(ms.moveKey(3), '3');
});
