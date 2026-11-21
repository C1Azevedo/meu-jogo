const test = require('node:test');
const assert = require('node:assert');
const E = require('../games/platformer');
const LEVELS = require('../games/platformer-levels');

const T = E.TILE;
const R = { right: true };
const Lft = { left: true };
const J = { jump: true };
const N = {};

/** Mundo a partir de um mapa pequeno escrito no próprio teste. */
function world(map, extra) {
  return E.createWorld([{ name: 'teste', time: 300, map, ...extra }], 0);
}
/** Roda n ticks com as entradas dadas (função ou par fixo). */
function run(w, n, inputs) {
  for (let i = 0; i < n; i++) E.step(w, typeof inputs === 'function' ? inputs(i, w) : inputs || [N, N]);
}
/** Altura máxima alcançada pelo jogador 0 segurando o pulo por `hold` ticks. */
function jumpHeight(w, hold) {
  const p = w.players[0];
  run(w, 10);
  const y0 = p.y;
  let top = p.y;
  run(w, 45, (i) => { top = Math.min(top, p.y); return [{ jump: i < hold }, N]; });
  return y0 - Math.min(top, p.y);
}

// Mapa plano de 30 blocos, jogadores lado a lado
const FLAT = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '.1..2.........................',
  '##############################',
  '##############################',
];

// ---------------------------------------------------------------------------
// Física
// ---------------------------------------------------------------------------

test('gravidade: o jogador cai e para no chão', () => {
  const map = FLAT.slice();
  map[5] = '.1..2.........................';
  map[12] = '..............................';
  const w = world(map);
  const p = w.players[0];
  assert.ok(p.y < 12 * T);
  run(w, 60);
  assert.strictEqual(p.onGround, true);
  assert.strictEqual(p.y + p.h, 13 * T, 'pés exatamente no topo do chão');
  assert.strictEqual(p.vy, 0);
});

test('corrida: acelera até a velocidade máxima e para com atrito', () => {
  const w = world(FLAT);
  const p = w.players[0];
  run(w, 5);
  run(w, 30, [R, N]);
  assert.strictEqual(p.vx, E.C.run);
  assert.strictEqual(p.facing, 1);
  run(w, 15);
  assert.strictEqual(p.vx, 0, 'parou sem entrada');
});

test('pulo variável: segurar mais tempo pula mais alto', () => {
  const short = jumpHeight(world(FLAT), 1);
  const mid = jumpHeight(world(FLAT), 4);
  const full = jumpHeight(world(FLAT), 40);
  assert.ok(short < mid && mid < full, `${short} < ${mid} < ${full}`);
  // Calibragem das fases: sozinho alcança 3 blocos, mas não 4
  assert.ok(full > 3 * T + 4, `pulo cheio ${full} deve passar de 3 blocos`);
  assert.ok(full < 4 * T - 4, `pulo cheio ${full} não pode chegar a 4 blocos`);
});

test('pulo só sai do chão (sem pulo duplo) e o botão precisa ser solto entre pulos', () => {
  const w = world(FLAT);
  const p = w.players[0];
  run(w, 5);
  run(w, 8, [J, N]); // sobe
  const vyHolding = p.vy;
  run(w, 1, [J, N]); // continuar segurando no ar não pula de novo
  assert.ok(p.vy > vyHolding);
  run(w, 60, [J, N]); // segurando ao cair e pousar: não pula sozinho
  assert.strictEqual(p.onGround, true);
});

test('"coyote time": ainda dá para pular logo depois de sair da beirada', () => {
  const map = FLAT.slice();
  map[13] = '######........................';
  map[14] = '######........................';
  const w = world(map);
  const p = w.players[0];
  run(w, 5);
  // corre até sair da beirada
  let ticks = 0;
  while (p.onGround && ticks < 200) { run(w, 1, [R, N]); ticks++; }
  run(w, 1, [{ right: true, jump: true }, N]);
  assert.ok(p.vy < 0, 'pulou mesmo já fora do chão');
});

// ---------------------------------------------------------------------------
// Colisões
// ---------------------------------------------------------------------------

test('parede bloqueia a passagem', () => {
  const map = FLAT.slice();
  map[12] = '.1..2...=......................'.slice(0, 30);
  const w = world(map);
  const p = w.players[0];
  run(w, 90, [R, N]);
  assert.strictEqual(p.x + p.w, 8 * T, 'encostado na parede');
  assert.strictEqual(p.vx, 0);
});

test('teto interrompe o pulo', () => {
  const map = FLAT.slice();
  map[10] = '=====.........................';
  const w = world(map);
  const p = w.players[0];
  run(w, 5);
  let top = p.y;
  run(w, 20, (i) => { top = Math.min(top, p.y); return [J, N]; });
  assert.strictEqual(top, 11 * T, 'bateu a cabeça no tijolo');
});

test('plataforma vazada: atravessa por baixo e fica em cima', () => {
  const map = FLAT.slice();
  map[10] = '-----.........................';
  const w = world(map);
  const p = w.players[0];
  run(w, 5);
  run(w, 40, (i) => [{ jump: i < 30 }, N]);
  assert.strictEqual(p.onGround, true);
  assert.strictEqual(p.y + p.h, 10 * T, 'parado em cima da plataforma');
});

test('abismo: cair no buraco vira bolha (não é morte direta)', () => {
  const map = FLAT.slice();
  map[13] = '######....####################';
  map[14] = '######....####################';
  const w = world(map);
  const p = w.players[0];
  let ticks = 0;
  while (p.state === 'alive' && ticks < 200) { run(w, 1, [R, N]); ticks++; }
  assert.strictEqual(p.state, 'bubble');
  assert.strictEqual(w.stats.deaths, 1);
  assert.strictEqual(w.status, 'playing', 'o parceiro ainda está vivo');
});

// ---------------------------------------------------------------------------
// Moedas, bandeira e tempo
// ---------------------------------------------------------------------------

test('moedas são pegas uma vez e contam no placar compartilhado', () => {
  const map = FLAT.slice();
  map[12] = '.1..2.ooo.....................';
  const w = world(map);
  run(w, 60, [R, R]);
  assert.strictEqual(w.stats.coins, 3);
  assert.strictEqual(w.levelCoins, 3);
  assert.strictEqual(new Set(w.coinsTaken).size, 3);
  assert.ok(w.events !== undefined);
});

test('fase só termina quando os DOIS chegam à bandeira', () => {
  const map = FLAT.slice();
  map[12] = '.1..2.....F...................';
  const w = world(map);
  run(w, 80, [R, N]); // só o jogador 0 vai
  assert.strictEqual(w.players[0].atFlag, true);
  assert.strictEqual(w.status, 'playing');
  run(w, 80, [N, R]);
  assert.strictEqual(w.status, 'levelclear');
});

test('tempo esgotado é game over', () => {
  const w = world(FLAT, { time: 1 });
  run(w, 40);
  assert.strictEqual(w.status, 'gameover');
  assert.strictEqual(w.gameOverReason, 'time');
});

test('snapshot + applySnapshot reproduzem o estado (rede)', () => {
  const w = world(FLAT);
  run(w, 20, [R, J]);
  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));
  const local = world(FLAT);
  E.applySnapshot(local, snap);
  assert.strictEqual(local.players[0].x, Math.round(w.players[0].x * 10) / 10);
  assert.strictEqual(local.players[1].state, 'alive');
  assert.strictEqual(local.tick, w.tick);
});

test('previsão local: o cliente chega no mesmo lugar que o servidor', () => {
  const server = world(FLAT);
  const client = world(FLAT);
  const inputs = [];
  for (let i = 0; i < 40; i++) inputs.push({ right: i < 30, jump: i > 5 && i < 15 });
  for (const inp of inputs) {
    E.step(server, [inp, N]);
    client.events = [];
    E.stepPlayer(client, client.players[0], inp);
  }
  assert.ok(Math.abs(server.players[0].x - client.players[0].x) < 0.01);
  assert.ok(Math.abs(server.players[0].y - client.players[0].y) < 0.01);
});

test('entrada da rede é sanitizada', () => {
  assert.deepStrictEqual(E.sanitizeInput({ l: 1, r: 'sim', j: true }), { left: false, right: false, jump: true });
  assert.deepStrictEqual(E.sanitizeInput(null), { left: false, right: false, jump: false });
  assert.deepStrictEqual(E.sanitizeInput('lixo'), { left: false, right: false, jump: false });
});

// ---------------------------------------------------------------------------
// Fases (dados)
// ---------------------------------------------------------------------------

test('todas as fases são válidas', () => {
  assert.ok(LEVELS.length >= 1);
  LEVELS.forEach((lv, i) => {
    const where = `fase ${i + 1} (${lv.name})`;
    assert.ok(lv.name && lv.map && lv.time > 0, where);
    assert.strictEqual(lv.map.length, 15, `${where}: 15 linhas`);
    const width = lv.map[0].length;
    lv.map.forEach((row, y) => {
      assert.strictEqual(row.length, width, `${where}: linha ${y} com tamanho diferente`);
      for (const ch of row) assert.ok(E.LEGEND.includes(ch), `${where}: caractere desconhecido "${ch}" na linha ${y}`);
    });
    const L = E.parseLevel(lv);
    assert.ok(L.spawns[0] && L.spawns[1], `${where}: precisa de 1 e 2`);
    assert.ok(L.flag, `${where}: precisa de bandeira F`);
    assert.ok(L.coins.length > 0, `${where}: precisa de moedas`);
    // Os jogadores começam em pé sobre algo sólido
    for (const s of L.spawns) {
      const tx = Math.floor((s.x + 6) / T);
      const ty = Math.floor((s.y + 14) / T);
      assert.ok(['#', '=', '-'].includes(L.grid[ty][tx]), `${where}: início sem chão embaixo`);
    }
  });
});
