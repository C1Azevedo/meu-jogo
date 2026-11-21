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

// ---------------------------------------------------------------------------
// Cooperação
// ---------------------------------------------------------------------------

/** Mapa de 30 colunas com uma parede de `h` blocos na coluna 12 (lado esquerdo livre). */
function wallMap(h, extraRow12) {
  const rows = [];
  for (let y = 0; y < 15; y++) {
    let row = '.'.repeat(30).split('');
    if (y >= 13) row = '#'.repeat(30).split('');
    else if (y >= 13 - h) for (let x = 12; x < 30; x++) row[x] = '#';
    rows.push(row.join(''));
  }
  rows[12] = rows[12].slice(0, 2) + '1..2' + rows[12].slice(6);
  if (extraRow12) rows[12] = extraRow12 + rows[12].slice(extraRow12.length);
  return rows;
}
const wallTop = (h) => (13 - h) * T;
/** Tenta subir a parede: corre para a direita pulando. Retorna true se ficou em cima. */
function climbs(w, i, ticks = 90) {
  const p = w.players[i];
  run(w, ticks, () => {
    const inp = [N, N];
    inp[i] = { right: true, jump: true };
    return inp;
  });
  return p.y + p.h <= wallTop(w._h) + 0.5 && p.x + p.w > 12 * T;
}

test('ombros: parede de 4 blocos é alta demais sozinho, mas dá subindo no parceiro', () => {
  const alone = world(wallMap(4));
  alone._h = 4;
  assert.strictEqual(climbs(alone, 0), false, 'sozinho não sobe');

  const w = world(wallMap(4));
  w._h = 4;
  const [a, b] = w.players;
  // B vai até a parede; A sobe nos ombros de B
  run(w, 60, [N, R]);
  assert.ok(b.x + b.w >= 12 * T - 1, 'B encostado na parede');
  b.x = 12 * T - b.w; // encostado
  a.x = b.x - 14;
  run(w, 20, (i) => [{ right: true, jump: i > 2 && i < 18 }, N]);
  run(w, 10, [R, N]);
  assert.strictEqual(a.standOn, 'p1', 'A em cima de B');
  // Agora, dos ombros, A pula e sobe a parede
  w.players[0].jumpHeld = false;
  run(w, 40, (i) => [{ right: true, jump: i < 25 }, N]);
  assert.ok(a.y + a.h <= wallTop(4) + 0.5, `A subiu (pés em ${a.y + a.h}, topo ${wallTop(4)})`);
});

test('ombros: quem está em cima é carregado quando o parceiro anda', () => {
  const w = world(FLAT);
  const [a, b] = w.players;
  run(w, 5);
  a.x = b.x;
  a.y = b.y - a.h - 2;
  run(w, 5);
  assert.strictEqual(a.standOn, 'p1');
  const ax = a.x;
  run(w, 15, [N, R]);
  assert.ok(a.x > ax + 10, 'A andou junto com B');
  assert.strictEqual(a.standOn, 'p1', 'continua nos ombros');
});

test('ombros: pular carregando o parceiro não dá "superpulo"', () => {
  const w = world(FLAT);
  const [a, b] = w.players;
  run(w, 5);
  a.x = b.x;
  a.y = b.y - a.h - 2;
  run(w, 5);
  const ground = 13 * T;
  let top = a.y;
  run(w, 40, (i) => { top = Math.min(top, a.y); return [{ jump: i > 3 && i < 30 }, { jump: i < 30 }]; });
  const reach = ground - (top + a.h);
  assert.ok(reach < 5 * T - 4, `alcance ${reach} não pode chegar a 5 blocos`);
});

test('caixote: um jogador empurra; serve de degrau depois de cair da beirada', () => {
  // Plataforma alta (4 blocos) com caixote na beirada; quem está em cima empurra para baixo
  const map = wallMap(4);
  map[8] = map[8].slice(0, 13) + 'k' + map[8].slice(14);
  const w = world(map);
  const [a] = w.players;
  // Coloca A em cima da parede, à direita do caixote, empurrando para a esquerda
  a.x = 15 * T;
  a.y = wallTop(4) - a.h;
  run(w, 5);
  const crate = w.crates[0];
  const x0 = crate.x;
  run(w, 120, [Lft, N]);
  assert.ok(crate.x < x0, 'caixote andou');
  assert.strictEqual(crate.y + crate.h, 13 * T, 'caixote caiu no chão ao pé da parede');
  // Agora B consegue subir usando o caixote como degrau
  const b = w.players[1];
  b.x = crate.x - 20;
  run(w, 5);
  run(w, 30, (i) => [N, { right: true, jump: i < 2 || (i > 8 && i < 30) }]);
  run(w, 40, (i) => [N, { right: true, jump: i < 25 }]);
  assert.ok(b.y + b.h <= wallTop(4) + 0.5, `B subiu (pés em ${b.y + b.h})`);
});

test('bloco pesado: só se move com os dois empurrando juntos', () => {
  const map = FLAT.slice();
  map[11] = '........H.....................';
  const w = world(map);
  const [a, b] = w.players;
  const heavy = w.crates[0];
  run(w, 10);
  const x0 = heavy.x;
  run(w, 60, [R, N]); // só A empurra
  assert.strictEqual(heavy.x, x0, 'um sozinho não move');
  assert.ok(a.x + a.w <= heavy.x + 0.01, 'A ficou parado encostado');
  run(w, 60, [R, R]); // os dois empurram
  assert.ok(heavy.x > x0 + 20, `os dois juntos movem (${heavy.x - x0} px)`);
  assert.ok(w.events !== null);
  void b;
});

test('bloco pesado como degrau: alcança parede de 5 blocos (sozinho e nos ombros, não)', () => {
  const shoulders = world(wallMap(5));
  shoulders._h = 5;
  const [a, b] = shoulders.players;
  b.x = 12 * T - b.w;
  run(shoulders, 5);
  a.x = b.x;
  a.y = b.y - a.h - 1;
  run(shoulders, 3);
  run(shoulders, 40, (i) => [{ right: true, jump: i < 25 }, N]);
  assert.ok(a.y + a.h > wallTop(5) + 0.5, 'nos ombros não chega a 5 blocos');

  const map = wallMap(5);
  map[11] = map[11].slice(0, 10) + 'H' + map[11].slice(11);
  const w = world(map);
  w._h = 5;
  const p = w.players[0];
  run(w, 5);
  p.x = 10 * T + 4;
  p.y = 11 * T - p.h - 1;
  run(w, 3);
  assert.strictEqual(p.standOn, 'c' + w.crates[0].id, 'em cima do bloco');
  run(w, 40, (i) => [{ right: true, jump: i < 25 }, N]);
  assert.ok(p.y + p.h <= wallTop(5) + 0.5, 'do bloco pesado, sobe 5 blocos');
});

test('botões e porta: abre só com os dois botões apertados ao mesmo tempo e fica aberta', () => {
  const map = FLAT.slice();
  map[9] = '...............D..............';
  map[10] = '...............D..............';
  map[11] = '...............D..............';
  map[12] = '.1..2...._.._..D..............';
  const w = world(map);
  const [a, b] = w.players;
  assert.strictEqual(w.level.doors[0].plates.length, 2);
  run(w, 5);
  // Só um botão: a porta continua fechada e bloqueia
  a.x = 9 * T + 2;
  run(w, 10);
  assert.deepStrictEqual(w.plates, [true, false]);
  assert.strictEqual(w.doors[0].open, false);
  b.x = 15 * T - 20;
  run(w, 30, [N, R]);
  assert.ok(b.x + b.w <= 15 * T + 0.01, 'porta fechada bloqueia');
  // Os dois botões
  b.x = 12 * T + 2;
  run(w, 5);
  assert.strictEqual(w.doors[0].open, true);
  assert.ok(w.plates.every(Boolean));
  // Saem dos botões: a porta continua aberta
  run(w, 60, [R, R]);
  assert.strictEqual(w.doors[0].open, true);
  assert.ok(b.x > 15 * T, 'passou pela porta');
});

test('caixote também aperta botão', () => {
  const map = FLAT.slice();
  map[11] = '..........k...................';
  map[12] = '.1..2.....__..D...............';
  map[11] = map[11].slice(0, 14) + 'D' + map[11].slice(15);
  const w = world(map);
  run(w, 10);
  assert.strictEqual(w.plates[0], true, 'caixote em cima do botão');
  w.players[0].x = 11 * T + 2;
  run(w, 5);
  assert.strictEqual(w.doors[0].open, true);
});

// ---------------------------------------------------------------------------
// Bolha e resgate
// ---------------------------------------------------------------------------

test('bolha: flutua até o parceiro, que resgata encostando nela', () => {
  const w = world(FLAT);
  const [a, b] = w.players;
  run(w, 5);
  b.x = 20 * T;
  E.hurtPlayer(w, a, false);
  assert.strictEqual(a.state, 'bubble');
  const d0 = Math.abs(a.x - b.x);
  run(w, 10);
  assert.ok(Math.abs(a.x - b.x) < d0, 'a bolha se aproxima do parceiro');
  run(w, 200);
  assert.strictEqual(a.state, 'alive', 'resgatado');
  assert.ok(a.invuln > 0 || w.tick > 0);
  assert.strictEqual(w.stats.deaths, 1);
});

test('bolha: não estoura antes de 0,4 s (evita resgate instantâneo)', () => {
  const w = world(FLAT);
  const [a] = w.players;
  run(w, 5);
  E.hurtPlayer(w, a, false); // está colado no parceiro
  run(w, 5);
  assert.strictEqual(a.state, 'bubble');
  run(w, 15);
  assert.strictEqual(a.state, 'alive');
});

test('game over só quando os DOIS estão em bolha ao mesmo tempo', () => {
  const w = world(FLAT);
  run(w, 5);
  w.players[1].x = 25 * T;
  E.hurtPlayer(w, w.players[0], false);
  run(w, 2);
  assert.strictEqual(w.status, 'playing');
  E.hurtPlayer(w, w.players[1], false);
  run(w, 1);
  assert.strictEqual(w.status, 'gameover');
  assert.strictEqual(w.gameOverReason, 'bubbles');
});

test('a fase não termina enquanto o parceiro está em bolha', () => {
  const map = FLAT.slice();
  map[12] = '.1..2.....F...................';
  const w = world(map);
  run(w, 60, [R, N]);
  assert.strictEqual(w.players[0].atFlag, true);
  E.hurtPlayer(w, w.players[1], false);
  run(w, 5);
  assert.strictEqual(w.status, 'playing', 'não termina com o parceiro na bolha');
});

// ---------------------------------------------------------------------------
// Inimigos, itens e checkpoints
// ---------------------------------------------------------------------------

test('caranguejo: pular em cima derrota; encostar de lado vira bolha', () => {
  const map = FLAT.slice();
  map[12] = '.1..2.........c...............';
  const w = world(map);
  const crab = w.enemies[0];
  const [a] = w.players;
  run(w, 5);
  // Cai em cima do caranguejo
  a.x = crab.x + 1;
  a.y = crab.y - 30;
  a.vy = 100;
  run(w, 10);
  assert.strictEqual(crab.alive, false, 'derrotado');
  assert.ok(a.state === 'alive' && w.stats.deaths === 0);

  const w2 = world(map);
  const crab2 = w2.enemies[0];
  run(w2, 5);
  w2.players[0].x = crab2.x - 20;
  run(w2, 30, [R, N]);
  assert.strictEqual(w2.players[0].state, 'bubble', 'encostou de lado');
  assert.strictEqual(crab2.alive, true);
});

test('caranguejo vira na beirada e na parede (não cai)', () => {
  const map = FLAT.slice();
  map[12] = '.1..2...........c.............';
  map[13] = '##############....############';
  map[14] = '##############....############';
  map[12] = map[12].slice(0, 14) + '=.c' + map[12].slice(17);
  map[13] = '##############.###############';
  const w = world(map);
  const crab = w.enemies[0];
  const xs = [];
  run(w, 300, (i) => { xs.push(crab.x); return [N, N]; });
  assert.ok(crab.alive && crab.y + crab.h === 13 * T, 'continua no chão');
  assert.ok(Math.max(...xs) - Math.min(...xs) > 4, 'anda de um lado para o outro');
});

test('água-viva flutua para cima e para baixo', () => {
  const map = FLAT.slice();
  map[8] = '..........j...................';
  const w = world(map);
  const ys = [];
  run(w, 90, () => { ys.push(w.enemies[0].y); return [N, N]; });
  assert.ok(Math.max(...ys) - Math.min(...ys) > 30);
});

test('espinhos viram bolha', () => {
  const map = FLAT.slice();
  map[12] = '.1..2...xx....................';
  const w = world(map);
  let ticks = 0;
  while (w.players[0].state === 'alive' && ticks < 90) { run(w, 1, [R, N]); ticks++; }
  assert.strictEqual(w.players[0].state, 'bubble');
  assert.strictEqual(w.stats.deaths, 1);
});

test('carambola estelar: invencível por 8 s, derrota inimigos encostando e corre mais', () => {
  const map = FLAT.slice();
  map[12] = '.1..2.*....c.c.c..............';
  const w = world(map);
  const [a] = w.players;
  run(w, 70, [R, N]);
  assert.ok(a.star > 0, 'pegou o poder');
  assert.strictEqual(a.state, 'alive');
  assert.strictEqual(w.enemies.filter((e) => e.alive).length, 0, 'derrubou os três');
  assert.ok(a.vx > E.C.run, 'mais rápido');
  run(w, 30 * 9);
  assert.strictEqual(a.star, 0, 'o poder acaba');
});

test('checkpoint: game over recomeça do checkpoint, com as moedas já pegas', () => {
  const map = FLAT.slice();
  map[12] = '.1..2.oo..C...................';
  const w = world(map);
  run(w, 70, [R, R]);
  assert.strictEqual(w.checkpoint, w.level.checkpoints[0].id);
  assert.strictEqual(w.stats.coins, 2);
  E.hurtPlayer(w, w.players[0], false);
  E.hurtPlayer(w, w.players[1], false);
  run(w, 1);
  assert.strictEqual(w.status, 'gameover');
  E.retryFromCheckpoint(w);
  assert.strictEqual(w.status, 'playing');
  const cpX = w.level.checkpoints[0].tx * T;
  assert.ok(w.players.every((p) => Math.abs(p.x - cpX) < 20), 'os dois no checkpoint');
  assert.strictEqual(w.stats.coins, 2, 'moedas mantidas');
  assert.strictEqual(w.coinsTaken.length, 2);
});

test('chefe: precisa de 3 pisões (com tempo de invencibilidade) e abre a porta da saída', () => {
  const map = FLAT.slice();
  map[12] = '.1..2.........K..........D....';
  for (let y = 1; y < 12; y++) map[y] = map[y].slice(0, 25) + 'D' + map[y].slice(26);
  const w = world(map);
  const boss = w.enemies[0];
  const [a] = w.players;
  assert.strictEqual(w.level.doors[0].plates.length, 0, 'porta sem botões');
  const stomp = () => {
    a.state = 'alive';
    a.invuln = 0;
    a.x = boss.x + 14;
    a.y = boss.y - 20;
    a.vy = 150;
    run(w, 2);
  };
  stomp();
  assert.strictEqual(boss.hp, 2);
  stomp(); // logo em seguida: ainda invencível
  assert.strictEqual(boss.hp, 2);
  run(w, 40);
  stomp();
  run(w, 40);
  stomp();
  assert.strictEqual(boss.alive, false);
  assert.strictEqual(w.bossDefeated, true);
  run(w, 1);
  assert.strictEqual(w.doors[0].open, true, 'porta da saída abriu');
});

// ---------------------------------------------------------------------------
// As fases têm solução: o "robô cooperativo" joga cada uma até o fim
// ---------------------------------------------------------------------------

test('todas as fases podem ser concluídas pela dupla (robô cooperativo)', () => {
  const { playLevel } = require('./helpers/coop-bot');
  LEVELS.forEach((lv, i) => {
    const r = playLevel(LEVELS, i);
    assert.ok(r.cleared, `fase ${i + 1} (${lv.name}) não foi concluída: ${r.world.status}, x=${r.world.players.map((p) => Math.round(p.x / T))}`);
    assert.ok(r.ticks / 30 < lv.time, `fase ${i + 1} terminou dentro do tempo`);
  });
});

test('dificuldade crescente: fases maiores e com mais mecânicas', () => {
  const parsed = LEVELS.map((lv) => E.parseLevel(lv));
  assert.strictEqual(LEVELS.length, 5);
  for (let i = 1; i < 4; i++) assert.ok(parsed[i].w >= parsed[i - 1].w, 'fases 1-4 ficam mais longas');
  assert.ok(parsed[0].doors.length >= 1, 'fase 1 já ensina a porta de dois botões');
  assert.ok(parsed.slice(2, 4).every((L) => L.crates.some((c) => c.heavy)), 'fases 3 e 4 têm bloco pesado');
  assert.ok(parsed[4].enemies.some((e) => e.type === 'boss'), 'fase 5 tem o chefe');
});
