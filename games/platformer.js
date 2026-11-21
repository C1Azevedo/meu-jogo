/**
 * Dupla Tropical — motor do jogo de plataforma cooperativo (sem DOM, sem rede).
 * Funciona no Node (require) e no navegador (window.Games.platformer).
 *
 * O MESMO código roda:
 *   - no servidor, que é a autoridade: simula a física e as colisões a 30 ticks/s;
 *   - no cliente, para a previsão local do próprio personagem (stepPlayer).
 * Por isso tudo é determinístico: passo fixo (DT), sem Math.random e sem relógio.
 *
 * Unidades: pixels do "mundo" (1 bloco = 16 px) e segundos.
 * As fases vêm de dados (games/platformer-levels.js): cada fase é um array de
 * strings, um caractere por bloco (legenda em LEGEND, logo abaixo).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Games = root.Games || {})[mod.id] = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TILE = 16;
  const TICK_RATE = 30;
  const DT = 1 / TICK_RATE;
  const EPS = 0.001;

  /** Constantes de física (ajustadas para: pulo sozinho alcança 3 blocos; nos ombros, 4). */
  const C = {
    playerW: 12,
    playerH: 14,
    run: 92, // velocidade máxima correndo (px/s)
    accelGround: 1100,
    accelAir: 700,
    friction: 1300,
    gravity: 950,
    jump: 345, // pulo ≈ 57 px: alcança 3 blocos sozinho (não 4); nos ombros ≈ 71 px (4 blocos)
    jumpCut: 130, // soltar o botão corta o pulo (pulo variável)
    maxFall: 420,
    coyote: 0.1, // ainda dá para pular logo depois de sair da beirada
    jumpBuffer: 0.12, // apertar pulo um pouco antes de tocar o chão também vale
    stompBounce: 230,
    invuln: 1.5,
    starTime: 8,
    starSpeed: 1.25,
    bubbleSpeed: 60,
    bubbleMinTime: 0.4,
    rescueRadius: 14,
    pushSpeed: 38, // caixote (um jogador)
    heavySpeed: 30, // bloco pesado (dois jogadores juntos)
    crabSpeed: 28,
    levelClearDelay: 3,
  };

  /**
   * Legenda dos caracteres das fases:
   *   .  vazio            #  chão            =  tijolo         -  plataforma vazada (sobe por baixo)
   *   o  moeda            x  espinhos        *  carambola estelar (poder temporário)
   *   c  caranguejo       j  água-viva       K  chefe (Rei Beliscão)
   *   k  caixote (1 jogador empurra)         H  bloco pesado 2×2 (só os dois juntos empurram)
   *   _  botão de pressão D  porta (abre quando TODOS os botões ligados a ela estão apertados ao mesmo
   *                                  tempo; cada botão liga na porta mais próxima; porta sem botões
   *                                  abre quando o chefe é derrotado)
   *   C  checkpoint       F  bandeira final  1 / 2  início de cada jogador
   */
  const LEGEND = '.#=-oxcjKkH_DCF12*';
  const SOLID = { '#': 1, '=': 1 };

  // ---------------------------------------------------------------------------
  // Fases
  // ---------------------------------------------------------------------------

  /** Lê uma fase (dados) e cria as partes estáticas: mapa e entidades iniciais. */
  function parseLevel(def) {
    const rows = def.map;
    const h = rows.length;
    const w = rows[0].length;
    const grid = rows.map((r) => r.split(''));
    const out = {
      name: def.name,
      theme: def.theme || 'praia',
      time: def.time || 240,
      w,
      h,
      grid, // grid[ty][tx]: só o terreno estático (entidades viram '.')
      spawns: [null, null],
      coins: [],
      enemies: [],
      crates: [],
      items: [],
      plates: [],
      doors: [],
      checkpoints: [],
      flag: null,
    };
    let id = 0;
    const doorCells = [];
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const ch = grid[ty][tx];
        const x = tx * TILE;
        const y = ty * TILE;
        let keep = false;
        switch (ch) {
          case '1': out.spawns[0] = { x: x + 2, y: y + TILE - C.playerH }; break;
          case '2': out.spawns[1] = { x: x + 2, y: y + TILE - C.playerH }; break;
          case 'o': out.coins.push({ id: id++, x: x + 3, y: y + 3, w: 10, h: 10 }); break;
          case '*': out.items.push({ id: id++, type: 'star', x: x + 2, y: y + 2, w: 12, h: 12 }); break;
          case 'c': out.enemies.push({ id: id++, type: 'crab', x: x + 1, y: y + TILE - 10, w: 14, h: 10 }); break;
          case 'j': out.enemies.push({ id: id++, type: 'jelly', x: x + 2, y: y + 2, w: 12, h: 12 }); break;
          case 'K': out.enemies.push({ id: id++, type: 'boss', x, y: y + TILE - 30, w: 40, h: 30 }); break;
          case 'k': out.crates.push({ id: id++, heavy: false, x, y, w: TILE, h: TILE }); break;
          case 'H': out.crates.push({ id: id++, heavy: true, x, y, w: TILE * 2, h: TILE * 2 }); break;
          case '_': out.plates.push({ tx, ty }); break;
          case 'C': out.checkpoints.push({ id: id++, tx, ty, x: x + 4, y: y - TILE * 2, w: 8, h: TILE * 3 }); break;
          case 'F': out.flag = { tx, ty, x: x - 4, y: y - TILE * 5, w: TILE + 8, h: TILE * 6 }; break;
          case 'D': doorCells.push({ tx, ty }); keep = true; break;
          case '#': case '=': case '-': case 'x': keep = true; break;
          default: break;
        }
        if (!keep) grid[ty][tx] = '.';
      }
    }
    // Portas: colunas contíguas de 'D'. Cada botão controla a porta mais próxima (na horizontal).
    doorCells.sort((a, b) => a.tx - b.tx || a.ty - b.ty);
    for (const cell of doorCells) {
      const last = out.doors[out.doors.length - 1];
      if (last && last.tx === cell.tx && last.ty + last.hTiles === cell.ty) last.hTiles++;
      else out.doors.push({ id: out.doors.length, tx: cell.tx, ty: cell.ty, hTiles: 1, plates: [] });
    }
    out.plates.forEach((pl, i) => {
      let best = null;
      for (const door of out.doors) {
        if (!best || Math.abs(door.tx - pl.tx) < Math.abs(best.tx - pl.tx)) best = door;
      }
      if (best) best.plates.push(i);
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Mundo (estado completo da partida, serializável)
  // ---------------------------------------------------------------------------

  function makePlayer(id, spawn) {
    return {
      id,
      x: spawn.x,
      y: spawn.y,
      w: C.playerW,
      h: C.playerH,
      vx: 0,
      vy: 0,
      facing: id === 0 ? 1 : -1,
      onGround: false,
      standOn: null, // 'p0'/'p1' (ombros do parceiro), 'c<id>' (caixote) ou null
      coyote: 0,
      jumpBuf: 0,
      jumpHeld: false,
      jumping: false,
      state: 'alive', // 'alive' | 'bubble'
      bubbleT: 0,
      invuln: 0,
      star: 0,
      atFlag: false,
      lastDx: 0,
      lastDy: 0,
    };
  }

  /**
   * Cria o mundo de uma fase. `levels` é a lista de fases (dados).
   * `carry` mantém o placar entre fases.
   */
  function createWorld(levels, levelIndex, carry) {
    const level = parseLevel(levels[levelIndex]);
    const world = {
      levelIndex,
      levelCount: levels.length,
      level, // estático (não vai na rede: o cliente monta a partir dos mesmos dados)
      tick: 0,
      status: 'playing', // 'playing' | 'levelclear' | 'gameover' | 'victory'
      statusTimer: 0,
      gameOverReason: null,
      time: level.time,
      checkpoint: -1,
      coinsTaken: [],
      levelCoins: 0,
      stats: carry ? { ...carry } : { coins: 0, deaths: 0, time: 0 },
      events: [],
      bossDefeated: false,
    };
    resetDynamic(world);
    return world;
  }

  /** (Re)cria tudo o que se move: jogadores, inimigos, caixotes, portas e itens. */
  function resetDynamic(world) {
    const L = world.level;
    const cp = world.checkpoint >= 0 ? L.checkpoints.find((c) => c.id === world.checkpoint) : null;
    const spawns = cp
      ? [{ x: cp.tx * TILE - 8, y: (cp.ty + 1) * TILE - C.playerH }, { x: cp.tx * TILE + 10, y: (cp.ty + 1) * TILE - C.playerH }]
      : L.spawns;
    world.players = [makePlayer(0, spawns[0]), makePlayer(1, spawns[1])];
    world.enemies = L.enemies.map((e) => ({
      ...e, vx: 0, vy: 0, alive: true, dir: -1, t: 0, baseY: e.y, onGround: false,
      hp: e.type === 'boss' ? 3 : 1, inv: 0,
    }));
    world.crates = L.crates.map((c) => ({ ...c, vx: 0, vy: 0, onGround: false }));
    world.items = L.items.map((i) => ({ ...i, taken: false }));
    world.doors = L.doors.map((d) => ({ id: d.id, open: false }));
    world.plates = L.plates.map(() => false);
    world.bossDefeated = false;
  }

  // ---------------------------------------------------------------------------
  // Colisões
  // ---------------------------------------------------------------------------

  function tileAt(world, tx, ty) {
    const L = world.level;
    if (tx < 0 || tx >= L.w) return '#'; // paredes invisíveis nas laterais
    if (ty < 0 || ty >= L.h) return '.'; // céu aberto em cima, abismo embaixo
    return L.grid[ty][tx];
  }

  function doorAt(world, tx, ty) {
    for (const d of world.level.doors) {
      if (d.tx === tx && ty >= d.ty && ty < d.ty + d.hTiles) return d.id;
    }
    return -1;
  }

  function isSolid(world, tx, ty) {
    const ch = tileAt(world, tx, ty);
    if (SOLID[ch]) return true;
    if (ch === 'D') return !world.doors[doorAt(world, tx, ty)].open;
    return false;
  }

  const overlaps = (a, b) => a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
  const overlapX = (a, b) => a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS;

  /**
   * Move um corpo (jogador, inimigo ou caixote) eixo por eixo, resolvendo colisões
   * com o terreno, portas fechadas, caixotes e — para jogadores — os ombros do parceiro.
   * Retorna { hitX, hitY, landed }.
   */
  function moveBody(world, b, dx, dy, kind) {
    const res = { hitX: false, hitY: false, boxX: null };
    const boxes = kind === 'enemy' ? [] : world.crates.filter((c) => c !== b);

    // --- Eixo X
    const x0 = b.x;
    if (dx !== 0) {
      b.x += dx;
      const ty0 = Math.floor(b.y / TILE);
      const ty1 = Math.floor((b.y + b.h - EPS) / TILE);
      if (dx > 0) {
        const tx = Math.floor((b.x + b.w - EPS) / TILE);
        for (let ty = ty0; ty <= ty1; ty++) {
          if (isSolid(world, tx, ty)) { b.x = tx * TILE - b.w; res.hitX = true; break; }
        }
      } else {
        const tx = Math.floor(b.x / TILE);
        for (let ty = ty0; ty <= ty1; ty++) {
          if (isSolid(world, tx, ty)) { b.x = (tx + 1) * TILE; res.hitX = true; break; }
        }
      }
      for (const box of boxes) {
        if (!overlaps(b, box)) continue;
        b.x = dx > 0 ? box.x - b.w : box.x + box.w;
        res.hitX = true;
        res.boxX = box;
      }
      if (res.hitX) b.vx = 0;
    }
    b.lastDx = b.x - x0;

    // --- Eixo Y
    const prevBottom = b.y + b.h;
    const y0 = b.y;
    b.onGround = false;
    b.standOn = null;
    b.y += dy;
    const tx0 = Math.floor(b.x / TILE);
    const tx1 = Math.floor((b.x + b.w - EPS) / TILE);
    if (dy > 0) {
      const ty = Math.floor((b.y + b.h - EPS) / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        const solid = isSolid(world, tx, ty);
        const oneWay = tileAt(world, tx, ty) === '-' && prevBottom <= ty * TILE + EPS;
        if (solid || oneWay) {
          b.y = ty * TILE - b.h;
          b.vy = 0;
          b.onGround = true;
          res.hitY = true;
          break;
        }
      }
      for (const box of boxes) {
        if (overlapX(b, box) && prevBottom <= box.y + EPS && b.y + b.h > box.y) {
          b.y = box.y - b.h;
          b.vy = 0;
          b.onGround = true;
          b.standOn = 'c' + box.id;
          res.hitY = true;
        }
      }
      if (kind === 'player') {
        // Subir nos ombros: o parceiro é uma "plataforma" para quem cai em cima dele.
        const other = world.players[1 - b.id];
        if (other.state === 'alive' && overlapX(b, other) && prevBottom <= other.y + EPS && b.y + b.h > other.y) {
          b.y = other.y - b.h;
          b.vy = 0;
          b.onGround = true;
          b.standOn = 'p' + other.id;
          res.hitY = true;
        }
      }
    } else if (dy < 0) {
      const ty = Math.floor(b.y / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isSolid(world, tx, ty)) { b.y = (ty + 1) * TILE; b.vy = 0; res.hitY = true; break; }
      }
      for (const box of boxes) {
        if (overlaps(b, box)) { b.y = box.y + box.h; b.vy = 0; res.hitY = true; }
      }
    }
    b.lastDy = b.y - y0;
    return res;
  }

  // ---------------------------------------------------------------------------
  // Jogador
  // ---------------------------------------------------------------------------

  const NO_INPUT = { left: false, right: false, jump: false };

  /**
   * Movimento e colisão de um jogador num passo. É a ÚNICA parte que o cliente
   * também roda (previsão local); interações (moedas, inimigos...) ficam no servidor.
   */
  function stepPlayer(world, p, input) {
    input = input || NO_INPUT;
    if (p.state !== 'alive') return;
    const maxRun = C.run * (p.star > 0 ? C.starSpeed : 1);
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    if (dir !== 0) {
      p.vx += dir * (p.onGround ? C.accelGround : C.accelAir) * DT;
      if (p.vx > maxRun) p.vx = maxRun;
      if (p.vx < -maxRun) p.vx = -maxRun;
      p.facing = dir;
    } else {
      const f = (p.onGround ? C.friction : C.accelAir * 0.35) * DT;
      if (Math.abs(p.vx) <= f) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * f;
    }

    // Pulo com "coyote time" e "buffer" (mais tolerante no celular)
    if (input.jump && !p.jumpHeld) p.jumpBuf = C.jumpBuffer;
    else p.jumpBuf = Math.max(0, p.jumpBuf - DT);
    p.coyote = p.onGround ? C.coyote : Math.max(0, p.coyote - DT);
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -C.jump;
      p.jumpBuf = 0;
      p.coyote = 0;
      p.jumping = true;
      world.events.push({ type: 'jump', p: p.id });
      // Quem estava nos ombros sobe junto (sem ganhar pulo extra)
      const rider = world.players[1 - p.id];
      if (rider.state === 'alive' && rider.standOn === 'p' + p.id) {
        rider.vy = Math.min(rider.vy, p.vy);
        rider.standOn = null;
        rider.onGround = false;
        rider.coyote = 0;
      }
    }
    // Pulo variável: soltar o botão cedo corta a subida
    if (!input.jump && p.jumping && p.vy < -C.jumpCut) p.vy = -C.jumpCut;
    p.jumpHeld = !!input.jump;

    p.vy = Math.min(p.vy + C.gravity * DT, C.maxFall);
    if (p.vy >= 0) p.jumping = false;

    moveBody(world, p, p.vx * DT, p.vy * DT, 'player');

    // Quem está nos ombros acompanha o parceiro na horizontal
    const rider = world.players[1 - p.id];
    if (rider.state === 'alive' && rider.standOn === 'p' + p.id && p.lastDx !== 0) {
      const keepVx = rider.vx;
      moveBody(world, rider, p.lastDx, 0, 'player');
      rider.vx = keepVx;
      rider.onGround = true;
      rider.standOn = 'p' + p.id;
    }
  }

  // ---------------------------------------------------------------------------
  // Passo completo da simulação (servidor)
  // ---------------------------------------------------------------------------

  function hurtPlayer(world, p, fell) {
    if (p.state !== 'alive') return;
    p.state = 'bubble';
    p.bubbleT = 0;
    p.vx = 0;
    p.vy = 0;
    p.star = 0;
    p.atFlag = false;
    p.standOn = null;
    world.stats.deaths++;
    world.events.push({ type: fell ? 'fall' : 'hurt', p: p.id });
    // Quem estava nos ombros dele cai
    const other = world.players[1 - p.id];
    if (other.standOn === 'p' + p.id) other.standOn = null;
    if (fell) {
      // Caiu no abismo: a bolha aparece perto do parceiro (ou no topo da tela)
      const ref = other.state === 'alive' ? other : p;
      p.x = Math.max(0, ref.x - 6);
      p.y = Math.max(8, Math.min(ref.y - 40, world.level.h * TILE - 60));
    }
  }

  function revive(world, p, rescuer) {
    p.state = 'alive';
    p.invuln = C.invuln;
    p.vy = -150;
    p.vx = 0;
    // Se a bolha estiver dentro de uma parede, aparece no lugar de quem resgatou
    const tx0 = Math.floor(p.x / TILE);
    const tx1 = Math.floor((p.x + p.w - EPS) / TILE);
    const ty0 = Math.floor(p.y / TILE);
    const ty1 = Math.floor((p.y + p.h - EPS) / TILE);
    let stuck = false;
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) if (isSolid(world, tx, ty)) stuck = true;
    if (stuck || world.crates.some((c) => overlaps(p, c))) {
      p.x = rescuer.x;
      p.y = rescuer.y - 4;
    }
    world.events.push({ type: 'rescue', p: p.id, by: rescuer.id });
  }

  function stepBubble(world, p) {
    p.bubbleT += DT;
    const other = world.players[1 - p.id];
    if (other.state !== 'alive') return;
    // A bolha flutua até o parceiro, atravessando paredes
    const dx = other.x + other.w / 2 - (p.x + p.w / 2);
    const dy = other.y + other.h / 2 - 20 - (p.y + p.h / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const sp = Math.min(dist, C.bubbleSpeed * DT);
      p.x += (dx / dist) * sp;
      p.y += (dy / dist) * sp;
    }
    // Resgate: o parceiro encosta na bolha
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const ox = other.x + other.w / 2;
    const oy = other.y + other.h / 2;
    if (p.bubbleT >= C.bubbleMinTime && Math.hypot(cx - ox, cy - oy) <= C.rescueRadius + 8) revive(world, p, other);
  }

  function stepCrates(world, inputs) {
    for (const c of world.crates) {
      // Quem está encostado empurrando o caixote nessa direção?
      let pushDir = 0;
      let pushers = 0;
      for (const dir of [1, -1]) {
        let n = 0;
        for (const p of world.players) {
          if (p.state !== 'alive') continue;
          const inp = inputs[p.id] || NO_INPUT;
          if (!(dir > 0 ? inp.right && !inp.left : inp.left && !inp.right)) continue;
          if (!(p.y < c.y + c.h - 2 && p.y + p.h > c.y + 2)) continue;
          const gap = dir > 0 ? c.x - (p.x + p.w) : p.x - (c.x + c.w);
          if (gap >= -2 && gap <= 1.5) n++;
        }
        if (n > pushers) { pushers = n; pushDir = dir; }
      }
      const need = c.heavy ? 2 : 1;
      c.vx = pushers >= need ? pushDir * (c.heavy ? C.heavySpeed : C.pushSpeed) : 0;
      if (c.vx !== 0 && c.onGround) {
        const before = c.x;
        moveBody(world, c, c.vx * DT, 0, 'crate');
        // Não atravessa jogadores que estão do outro lado
        if (world.players.some((p) => p.state === 'alive' && overlaps(c, p))) c.x = before;
        if (c.x !== before && c.heavy) world.events.push({ type: 'heavy' });
      }
      c.vy = Math.min(c.vy + C.gravity * DT, C.maxFall);
      const wasGround = c.onGround;
      moveBody(world, c, 0, c.vy * DT, 'crate');
      if (!wasGround && c.onGround) world.events.push({ type: 'thud' });
      if (c.y > world.level.h * TILE + 64) { c.y = world.level.h * TILE + 64; c.vy = 0; }
    }
  }

  function updatePlatesAndDoors(world) {
    const L = world.level;
    world.plates = L.plates.map((pl) => {
      const zone = { x: pl.tx * TILE + 1, y: pl.ty * TILE + TILE - 6, w: TILE - 2, h: 7 };
      return world.players.some((p) => p.state === 'alive' && overlaps(p, zone)) || world.crates.some((c) => overlaps(c, zone));
    });
    L.doors.forEach((d, i) => {
      const door = world.doors[i];
      if (door.open) return;
      const shouldOpen = d.plates.length ? d.plates.every((pi) => world.plates[pi]) : world.bossDefeated;
      if (shouldOpen) {
        door.open = true; // fica aberta de vez
        world.events.push({ type: 'door', door: i });
      }
    });
  }

  function stepEnemies(world) {
    for (const e of world.enemies) {
      if (!e.alive) continue;
      e.t += DT;
      if (e.inv > 0) e.inv -= DT;
      if (e.type === 'jelly') {
        e.y = e.baseY + Math.sin(e.t * 2.2) * 18;
        continue;
      }
      if (e.type === 'boss') {
        let target = null;
        for (const p of world.players) {
          if (p.state === 'alive' && (!target || Math.abs(p.x - e.x) < Math.abs(target.x - e.x))) target = p;
        }
        if (e.onGround) {
          const speed = 34 + (3 - e.hp) * 14;
          e.vx = target ? Math.sign(target.x + target.w / 2 - (e.x + e.w / 2)) * speed : 0;
          if (e.t > 2.4 - (3 - e.hp) * 0.4) { e.vy = -300; e.t = 0; world.events.push({ type: 'bossjump' }); }
        }
        if (e.vx) e.dir = Math.sign(e.vx);
      } else {
        e.vx = e.dir * C.crabSpeed;
      }
      e.vy = Math.min(e.vy + C.gravity * DT, C.maxFall);
      const r = moveBody(world, e, e.vx * DT, e.vy * DT, 'enemy');
      if (e.type === 'crab') {
        if (r.hitX) e.dir *= -1;
        else if (e.onGround) {
          // Não cai da beirada: vira antes
          const aheadX = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
          const tx = Math.floor(aheadX / TILE);
          const ty = Math.floor((e.y + e.h + 1) / TILE);
          if (!isSolid(world, tx, ty) && tileAt(world, tx, ty) !== '-') e.dir *= -1;
        }
      }
      if (e.y > world.level.h * TILE + 32) e.alive = false;
    }
  }

  function damageEnemy(world, e, p) {
    if (e.type === 'boss') {
      if (e.inv > 0) return;
      e.hp--;
      e.inv = 1.2;
      world.events.push({ type: 'bosshit', hp: e.hp });
      if (e.hp <= 0) {
        e.alive = false;
        world.bossDefeated = true;
        world.events.push({ type: 'bossdown' });
      }
      return;
    }
    e.alive = false;
    world.events.push({ type: 'stomp', p: p.id, x: e.x + e.w / 2, y: e.y });
  }

  function interactions(world) {
    const L = world.level;
    for (const p of world.players) {
      if (p.state !== 'alive') continue;
      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - DT);
      if (p.star > 0) p.star = Math.max(0, p.star - DT);

      // Abismo
      if (p.y > L.h * TILE + 8) { hurtPlayer(world, p, true); continue; }

      // Moedas
      for (const coin of L.coins) {
        if (world.coinsTaken.includes(coin.id) || !overlaps(p, coin)) continue;
        world.coinsTaken.push(coin.id);
        world.levelCoins++;
        world.stats.coins++;
        world.events.push({ type: 'coin', p: p.id, x: coin.x + 5, y: coin.y + 5 });
      }
      // Itens (carambola estelar)
      for (const it of world.items) {
        if (it.taken || !overlaps(p, it)) continue;
        it.taken = true;
        p.star = C.starTime;
        world.events.push({ type: 'power', p: p.id });
      }
      // Checkpoints
      for (const cp of L.checkpoints) {
        if (overlaps(p, cp) && world.checkpoint !== cp.id && L.checkpoints.indexOf(cp) > L.checkpoints.findIndex((c) => c.id === world.checkpoint)) {
          world.checkpoint = cp.id;
          world.events.push({ type: 'checkpoint', id: cp.id });
        }
      }
      // Espinhos (metade de baixo do bloco)
      const tx0 = Math.floor(p.x / TILE);
      const tx1 = Math.floor((p.x + p.w - EPS) / TILE);
      const ty0 = Math.floor(p.y / TILE);
      const ty1 = Math.floor((p.y + p.h - EPS) / TILE);
      let spiked = false;
      for (let tx = tx0; tx <= tx1 && !spiked; tx++) {
        for (let ty = ty0; ty <= ty1 && !spiked; ty++) {
          if (tileAt(world, tx, ty) === 'x' && overlaps(p, { x: tx * TILE + 2, y: ty * TILE + 8, w: TILE - 4, h: 8 })) spiked = true;
        }
      }
      if (spiked && p.invuln <= 0 && p.star <= 0) { hurtPlayer(world, p, false); continue; }

      // Inimigos: pular em cima derrota; encostar de lado machuca
      for (const e of world.enemies) {
        if (!e.alive || !overlaps(p, e)) continue;
        if (p.star > 0) { damageEnemy(world, e, p); continue; }
        const fromAbove = p.vy > 0 && p.y + p.h - e.y <= Math.max(8, p.vy * DT + 3);
        if (fromAbove) {
          damageEnemy(world, e, p);
          p.vy = -(p.jumpHeld ? C.jump : C.stompBounce);
          p.jumping = p.jumpHeld;
        } else if (p.invuln <= 0 && !(e.type === 'boss' && e.inv > 0.6)) {
          hurtPlayer(world, p, false);
          break;
        }
      }

      // Bandeira: quem chega fica marcado esperando o parceiro (só perde a marca se virar bolha)
      if (L.flag && !p.atFlag && overlaps(p, L.flag)) {
        p.atFlag = true;
        world.events.push({ type: 'flag', p: p.id });
      }
    }
    for (const p of world.players) if (p.state === 'bubble') stepBubble(world, p);
  }

  /**
   * Avança a partida um passo (1/30 s). `inputs` = [entrada do jogador 0, do jogador 1].
   * Muta o mundo e preenche world.events com o que aconteceu (para sons/partículas).
   */
  function step(world, inputs) {
    world.events = [];
    world.tick++;
    if (world.status === 'levelclear') {
      world.statusTimer -= DT;
      return;
    }
    if (world.status !== 'playing') return;

    world.time -= DT;
    world.stats.time += DT;
    if (world.time <= 0) {
      world.time = 0;
      gameOver(world, 'time');
      return;
    }

    updatePlatesAndDoors(world);
    stepCrates(world, inputs);
    for (const p of world.players) stepPlayer(world, p, inputs[p.id]);
    stepEnemies(world);
    interactions(world);

    // Só há game over se os dois estiverem em bolha ao mesmo tempo
    if (world.players.every((p) => p.state === 'bubble')) {
      gameOver(world, 'bubbles');
      return;
    }
    // Fase concluída quando os DOIS chegam juntos à bandeira
    if (world.players.every((p) => p.state === 'alive' && p.atFlag)) {
      world.status = 'levelclear';
      world.statusTimer = C.levelClearDelay;
      world.events.push({ type: 'clear' });
    }
  }

  function gameOver(world, reason) {
    world.status = 'gameover';
    world.gameOverReason = reason;
    world.events.push({ type: 'gameover', reason });
  }

  /** Recomeça do último checkpoint (moedas já pegas continuam pegas). */
  function retryFromCheckpoint(world) {
    resetDynamic(world);
    world.status = 'playing';
    world.gameOverReason = null;
    world.time = world.level.time;
    world.events = [{ type: 'retry' }];
  }

  // ---------------------------------------------------------------------------
  // Rede: estado compacto enviado a cada tick e aplicação no cliente
  // ---------------------------------------------------------------------------

  const r1 = (v) => Math.round(v * 10) / 10;

  /** Estado dinâmico enviado aos clientes (o mapa estático não vai: cada lado lê da fase). */
  function snapshot(world) {
    return {
      tick: world.tick,
      level: world.levelIndex,
      status: world.status,
      statusTimer: r1(world.statusTimer),
      reason: world.gameOverReason,
      time: r1(world.time),
      stats: { coins: world.stats.coins, deaths: world.stats.deaths, time: Math.floor(world.stats.time) },
      levelCoins: world.levelCoins,
      checkpoint: world.checkpoint,
      players: world.players.map((p) => ({
        x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), facing: p.facing, onGround: p.onGround,
        standOn: p.standOn, coyote: p.coyote, jumpBuf: p.jumpBuf, jumpHeld: p.jumpHeld, jumping: p.jumping,
        state: p.state, invuln: r1(p.invuln), star: r1(p.star), atFlag: p.atFlag,
      })),
      enemies: world.enemies.map((e) => ({ id: e.id, x: r1(e.x), y: r1(e.y), alive: e.alive, dir: e.dir, hp: e.hp, inv: r1(e.inv) })),
      crates: world.crates.map((c) => ({ id: c.id, x: r1(c.x), y: r1(c.y) })),
      coinsTaken: world.coinsTaken.slice(),
      items: world.items.map((i) => i.taken),
      doors: world.doors.map((d) => d.open),
      plates: world.plates.slice(),
      events: world.events,
    };
  }

  /** Copia um snapshot para um mundo local (cliente), para previsão e desenho. */
  function applySnapshot(world, snap) {
    world.tick = snap.tick;
    world.status = snap.status;
    world.statusTimer = snap.statusTimer;
    world.gameOverReason = snap.reason;
    world.time = snap.time;
    world.stats = snap.stats;
    world.levelCoins = snap.levelCoins;
    world.checkpoint = snap.checkpoint;
    snap.players.forEach((sp, i) => Object.assign(world.players[i], sp));
    snap.enemies.forEach((se) => {
      const e = world.enemies.find((x) => x.id === se.id);
      if (e) Object.assign(e, se);
    });
    snap.crates.forEach((sc) => {
      const c = world.crates.find((x) => x.id === sc.id);
      if (c) Object.assign(c, sc);
    });
    world.coinsTaken = snap.coinsTaken;
    snap.items.forEach((t, i) => { if (world.items[i]) world.items[i].taken = t; });
    snap.doors.forEach((o, i) => { if (world.doors[i]) world.doors[i].open = o; });
    world.plates = snap.plates;
  }

  /** Normaliza a entrada vinda da rede (nunca confie no cliente). */
  function sanitizeInput(raw) {
    if (!raw || typeof raw !== 'object') return { ...NO_INPUT };
    return { left: raw.l === true || raw.left === true, right: raw.r === true || raw.right === true, jump: raw.j === true || raw.jump === true };
  }

  return {
    id: 'platformer',
    name: 'Dupla Tropical',
    realtime: true,
    TILE,
    TICK_RATE,
    DT,
    C,
    LEGEND,
    playerNames: ['Tuca', 'Mel'],
    parseLevel,
    createWorld,
    resetDynamic,
    retryFromCheckpoint,
    tileAt,
    isSolid,
    overlaps,
    moveBody,
    stepPlayer,
    step,
    snapshot,
    applySnapshot,
    sanitizeInput,
    hurtPlayer,
    // Compatibilidade com o hub (não é um jogo por turnos; a IA não se aplica)
    ai: { kind: 'none' },
  };
});
