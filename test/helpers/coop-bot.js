/**
 * "Robô cooperativo" para os testes: joga com os DOIS personagens usando o motor
 * real e prova que cada fase tem solução. Ele lê o mapa e reage ao que vem pela frente:
 *   - vão, degrau, espinho ou caranguejo → pula;
 *   - porta com dois botões → cada um vai para um botão;
 *   - porta com botão no alto → Mel fica encostada na parede, Tuca sobe nos ombros
 *     dela, sobe na plataforma e aperta o botão para a Mel passar;
 *   - bloco pesado → os dois empurram juntos até a parede e sobem por ele;
 *   - chefe → vão para cima dele e pulam para acertar a cabeça.
 */
const E = require('../../games/platformer');

const T = E.TILE;

function createBot() {
  const mem = { mode: null, heavyStill: 0, lastHeavyX: null, climbTick: 0 };

  const center = (b) => b.x + b.w / 2;
  const feet = (p) => p.y + p.h;

  function standable(w, tx, ty) {
    return E.isSolid(w, tx, ty) || E.tileAt(w, tx, ty) === '-';
  }

  /** Anda até `targetX` pulando obstáculos simples. */
  function walk(w, p, targetX, opts = {}) {
    const dx = targetX - center(p);
    if (Math.abs(dx) < (opts.tol || 2)) return { left: false, right: false, jump: !p.onGround && p.vy < 0 && p.jumping };
    const dir = Math.sign(dx);
    const inp = { left: dir < 0, right: dir > 0, jump: false };
    if (p.onGround) {
      const aheadX = dir > 0 ? p.x + p.w + 6 : p.x - 6;
      const tx = Math.floor(aheadX / T);
      const bodyRow = Math.floor((feet(p) - 1) / T);
      const feetRow = Math.floor((feet(p) + 1) / T);
      const wall = E.isSolid(w, tx, bodyRow) || w.crates.some((c) => aheadX >= c.x && aheadX <= c.x + c.w && feet(p) > c.y + 1 && p.y < c.y + c.h);
      const gap = !standable(w, tx, feetRow) && !standable(w, tx, feetRow + 1) && !w.crates.some((c) => aheadX >= c.x && aheadX <= c.x + c.w);
      const spike = E.tileAt(w, tx, bodyRow) === 'x';
      const enemy = w.enemies.some((e) => e.alive && e.type !== 'jelly' && Math.abs(center(e) - center(p)) < 34 && Math.sign(center(e) - center(p)) === dir && Math.abs(feet(e) - feet(p)) < 20);
      // jumpWalls:false → não sobe em paredes/blocos (para encostar ou empurrar), mas ainda pula vãos
      if ((wall && opts.jumpWalls !== false) || gap || spike || enemy) inp.jump = true;
    }
    // segura o pulo enquanto sobe (pulo variável: soltar corta a altura)
    if (!p.onGround && p.vy < 0 && p.jumping) inp.jump = true;
    return inp;
  }

  const idle = { left: false, right: false, jump: false };

  return function think(w) {
    const [a, b] = w.players;
    // Quem está vivo espera o parceiro em bolha (resgate mais rápido)
    if (a.state === 'bubble' || b.state === 'bubble') {
      const helper = a.state === 'alive' ? a : b;
      const bubble = a.state === 'bubble' ? a : b;
      const inp = [idle, idle];
      if (helper.state === 'alive') inp[helper.id] = walk(w, helper, center(bubble), { tol: 6, jumpWalls: false });
      return inp;
    }
    const front = Math.max(center(a), center(b));
    const back = Math.min(center(a), center(b));

    // --- Chefe
    const boss = w.enemies.find((e) => e.type === 'boss' && e.alive && Math.abs(center(e) - front) < 16 * T);
    if (boss) {
      const goal0 = w.level.flag ? w.level.flag.x + 10 : w.level.w * T;
      return [a, b].map((p) => {
        // Só luta quem já está no chão da arena; quem está nos degraus continua o caminho
        const row = Math.floor((boss.y + boss.h - 1) / T);
        const c0 = Math.floor(Math.min(center(p), center(boss)) / T);
        const c1 = Math.floor(Math.max(center(p), center(boss)) / T);
        let clear = Math.abs(feet(p) - (boss.y + boss.h)) < 40;
        for (let c = c0; c <= c1 && clear; c++) if (E.isSolid(w, c, row)) clear = false;
        const inArena = clear;
        if (!inArena) return walk(w, p, goal0);
        const inp = walk(w, p, center(boss), { tol: 4, jumpWalls: false });
        // Pula com antecedência: no alto do pulo passa por cima e desce na cabeça do chefe
        const d = Math.abs(center(boss) - center(p));
        if (p.onGround && d > 36 && d < 76) inp.jump = true;
        if (!p.onGround && p.vy < 0 && p.jumping) inp.jump = true;
        return inp;
      });
    }

    // --- Porta fechada à frente
    const door = w.level.doors.find((d, i) => !w.doors[i].open && d.plates.length && d.tx * T > back - T && d.tx * T - front < 6 * T);
    if (door) {
      const plates = door.plates.map((i) => w.level.plates[i]);
      if (plates.length >= 2) {
        // Cada um no seu botão
        const [p1, p2] = plates.slice().sort((x, y) => x.tx - y.tx);
        return [walk(w, a, p1.tx * T + 8, { tol: 3 }), walk(w, b, p2.tx * T + 8, { tol: 3 })];
      }
      // Botão no alto: ombros
      const plate = plates[0];
      const shelfTop = (plate.ty + 1) * T;
      const pillarX = door.tx * T;
      const baseX = pillarX - b.w / 2 - 0.5;
      const onShelf = feet(a) <= shelfTop + 0.5 && a.x + a.w > pillarX;
      const bIn = walk(w, b, baseX, { tol: 1, jumpWalls: false });
      if (onShelf) return [walk(w, a, plate.tx * T + 8, { tol: 2 }), idle];
      if (Math.abs(center(b) - baseX) > 1.5 || !b.onGround) return [walk(w, a, b.x - 20, { tol: 4 }), bIn];
      // Mel encostada: Tuca sobe nos ombros e de lá pula para a plataforma (segurando "direita")
      if (a.standOn === 'p1') {
        mem.climbTick++;
        if (mem.climbTick > 1) mem.launched = true;
        return [{ left: false, right: mem.climbTick > 3, jump: mem.climbTick > 1 }, idle];
      }
      mem.climbTick = 0;
      if (mem.launched && !a.onGround) return [{ left: false, right: true, jump: a.vy < 0 }, idle];
      mem.launched = false;
      const inp = walk(w, a, center(b), { tol: 1, jumpWalls: false });
      if (a.onGround && Math.abs(center(a) - center(b)) < 26) inp.jump = true;
      if (!a.onGround && a.vy < 0 && a.jumping) inp.jump = true;
      return [inp, idle];
    }

    // --- Bloco pesado à frente, ainda longe da parede
    const heavy = w.crates.find((c) => c.heavy && c.x > back - 4 && c.x - front < 8 * T);
    if (heavy) {
      const tx = Math.floor((heavy.x + heavy.w + 2) / T);
      const ty = Math.floor((heavy.y + heavy.h - 2) / T);
      const atWall = E.isSolid(w, tx, ty);
      if (!atWall) {
        // Os dois encostam do lado esquerdo e empurram juntos (sem pular)
        const behind = heavy.x - 7;
        return [a, b].map((p) => (center(p) < behind - 3 ? walk(w, p, behind, { jumpWalls: false }) : { left: false, right: true, jump: false }));
      }
    }

    // --- Caminho normal: os dois vão até depois da bandeira
    const goal = w.level.flag ? w.level.flag.x + 10 : w.level.w * T;
    return [walk(w, a, goal - 6), walk(w, b, goal + 6)];
  };
}

/**
 * Joga uma fase até o fim. Retorna { cleared, ticks, retries, deaths, coins }.
 * Em game over recomeça do checkpoint (como os jogadores fariam), até `maxRetries`.
 */
function playLevel(levels, index, opts = {}) {
  const w = E.createWorld(levels, index);
  const think = createBot();
  let retries = 0;
  const maxTicks = opts.maxTicks || 30 * 60 * 8;
  let t = 0;
  for (; t < maxTicks; t++) {
    if (w.status === 'levelclear') break;
    if (w.status === 'gameover') {
      if (retries >= (opts.maxRetries || 6)) break;
      retries++;
      E.retryFromCheckpoint(w);
    }
    E.step(w, think(w));
  }
  return { cleared: w.status === 'levelclear', ticks: t, retries, deaths: w.stats.deaths, coins: w.stats.coins, world: w };
}

module.exports = { createBot, playLevel };
