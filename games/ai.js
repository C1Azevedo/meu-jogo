/**
 * IA genérica para qualquer jogo que implemente a interface:
 *   getMoves(state), applyMove(state, move), evaluate(state, player), moveKey(move)
 *   state.turn (0|1), state.winner (null | 0 | 1 | 'draw')
 *   ai: { mediumDepth, hardDepth, timeLimitMs }
 *
 * Dificuldades:
 *   easy   — na maior parte das vezes joga aleatoriamente; às vezes aproveita
 *            uma vitória imediata, mas não se defende (erra de propósito).
 *   medium — busca rasa (2 lances): ganha quando dá e bloqueia ameaças óbvias.
 *   hard   — Minimax (negamax) com poda alfa-beta e aprofundamento iterativo,
 *            limitado por profundidade e por tempo para nunca travar a tela.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Games = root.Games || {}).ai = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WIN = 1000000;
  const TIMEOUT = { timeout: true };

  function pickRandom(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Pontuação de um estado terminal do ponto de vista de quem está na vez. */
  function terminalScore(state, ply) {
    if (state.winner === 'draw') return 0;
    return state.winner === state.turn ? WIN - ply : -(WIN - ply);
  }

  function negamax(game, state, depth, alpha, beta, ply, ctx) {
    if (state.winner !== null) return terminalScore(state, ply);
    if (depth === 0) return game.evaluate(state, state.turn);

    ctx.nodes++;
    if (ctx.deadline && (ctx.nodes & 511) === 0 && Date.now() > ctx.deadline) throw TIMEOUT;

    const moves = game.getMoves(state);
    let best = -Infinity;
    for (const move of moves) {
      const score = -negamax(game, game.applyMove(state, move), depth - 1, -beta, -alpha, ply + 1, ctx);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break; // poda alfa-beta
    }
    return best;
  }

  /** Avalia todas as jogadas da raiz com janela completa (pontuação exata de cada uma). */
  function scoreAllMoves(game, state, depth, moves) {
    const ctx = { nodes: 0, deadline: 0 };
    return moves.map((move) => ({
      move,
      score: -negamax(game, game.applyMove(state, move), depth - 1, -Infinity, Infinity, 1, ctx),
    }));
  }

  /** Escolhe aleatoriamente entre as jogadas com pontuação próxima da melhor. */
  function pickAmongBest(scored, tolerance, rng) {
    const best = Math.max(...scored.map((s) => s.score));
    const top = scored.filter((s) => s.score >= best - tolerance);
    return pickRandom(top, rng).move;
  }

  /** Busca com aprofundamento iterativo e limite de tempo. */
  function searchHard(game, state, moves, rng) {
    const maxDepth = game.ai.hardDepth;
    const deadline = Date.now() + (game.ai.timeLimitMs || 1500);
    // Embaralha para variar entre jogadas equivalentes; a ordem do jogo (ex.: centro primeiro)
    // é preservada como desempate porque o sort é estável.
    let ordered = shuffle(moves, rng);
    if (game.orderMoves) ordered = game.orderMoves(state, ordered);
    let bestMove = ordered[0];

    for (let depth = 1; depth <= maxDepth; depth++) {
      const ctx = { nodes: 0, deadline };
      let alpha = -Infinity;
      let iterBest = null;
      let iterBestScore = -Infinity;
      try {
        for (const move of ordered) {
          const score = -negamax(game, game.applyMove(state, move), depth - 1, -Infinity, -alpha, 1, ctx);
          if (score > iterBestScore) {
            iterBestScore = score;
            iterBest = move;
          }
          if (score > alpha) alpha = score;
        }
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        break; // tempo esgotado: usa o resultado da última profundidade completa
      }
      bestMove = iterBest;
      // Próxima iteração começa pela melhor jogada encontrada (melhora a poda).
      ordered = [iterBest, ...ordered.filter((m) => m !== iterBest)];
      if (Math.abs(iterBestScore) > WIN - 1000) break; // resultado forçado encontrado
      if (Date.now() > deadline) break;
    }
    return bestMove;
  }

  // ---------------------------------------------------------------------------
  // Campo Minado: IA por dedução (usa SÓ o estado público — nunca vê as minas)
  // ---------------------------------------------------------------------------

  function msNeighbors(i, cols, rows) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) list.push(rr * cols + cc);
      }
    }
    return list;
  }

  /**
   * Deduções simples, repetidas até não mudar mais nada:
   *  - número = minas já conhecidas ao redor → as outras vizinhas fechadas são seguras;
   *  - número - minas conhecidas = vizinhas fechadas desconhecidas → todas são minas.
   */
  function msSimpleDeductions(view) {
    const { cells, cols, rows } = view;
    const mines = new Set();
    const safe = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < cells.length; i++) {
        const v = cells[i];
        if (v <= 0) continue;
        const hidden = msNeighbors(i, cols, rows).filter((n) => cells[n] === -1);
        const unknown = hidden.filter((n) => !mines.has(n) && !safe.has(n));
        if (!unknown.length) continue;
        const known = hidden.filter((n) => mines.has(n)).length;
        if (known === v) {
          unknown.forEach((n) => safe.add(n));
          changed = true;
        } else if (v - known === unknown.length) {
          unknown.forEach((n) => mines.add(n));
          changed = true;
        }
      }
    }
    return { mines, safe };
  }

  const logFactCache = [0];
  function logFact(n) {
    for (let k = logFactCache.length; k <= n; k++) logFactCache[k] = logFactCache[k - 1] + Math.log(k);
    return logFactCache[n];
  }
  function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    return logFact(n) - logFact(k) - logFact(n - k);
  }

  /**
   * Probabilidade de mina em cada casa fechada, enumerando todas as
   * configurações válidas da "fronteira" (casas fechadas vizinhas de números),
   * componente por componente, e ponderando pelo número de jeitos de espalhar
   * as minas restantes pelas casas do interior.
   * Retorna Map(índice → probabilidade) e as deduções certas.
   */
  function msProbabilities(view, maxNodes) {
    maxNodes = maxNodes || 300000;
    const { cells, cols, rows, mineCount } = view;
    const { mines: knownMines, safe: knownSafe } = msSimpleDeductions(view);
    const probs = new Map();
    knownMines.forEach((i) => probs.set(i, 1));
    knownSafe.forEach((i) => probs.set(i, 0));

    // Restrições: para cada número, quais casas desconhecidas toca e quantas minas faltam.
    const constraints = [];
    const frontierSet = new Set();
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] <= 0) continue;
      const hidden = msNeighbors(i, cols, rows).filter((n) => cells[n] === -1);
      const unknown = hidden.filter((n) => !knownMines.has(n) && !knownSafe.has(n));
      if (!unknown.length) continue;
      const need = cells[i] - hidden.filter((n) => knownMines.has(n)).length;
      constraints.push({ cells: unknown, need });
      unknown.forEach((n) => frontierSet.add(n));
    }

    const interior = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === -1 && !probs.has(i) && !frontierSet.has(i)) interior.push(i);
    }
    const remaining = mineCount - knownMines.size;

    // Separa a fronteira em componentes independentes (ligados por restrições).
    const parent = new Map([...frontierSet].map((x) => [x, x]));
    const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
    for (const ct of constraints) for (let k = 1; k < ct.cells.length; k++) parent.set(find(ct.cells[k]), find(ct.cells[0]));
    const groups = new Map();
    for (const x of frontierSet) {
      const root = find(x);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(x);
    }

    // Enumera cada componente: por nº de minas k → { ways, perCell[] }
    const components = [];
    let fallback = false;
    for (const group of groups.values()) {
      const idx = new Map(group.map((x, j) => [x, j]));
      const cts = constraints.filter((ct) => idx.has(ct.cells[0])).map((ct) => ({ cells: ct.cells.map((x) => idx.get(x)), need: ct.need }));
      const byCell = group.map(() => []);
      cts.forEach((ct, ci) => ct.cells.forEach((j) => byCell[j].push(ci)));
      const assigned = new Array(group.length).fill(0);
      const sum = cts.map(() => 0);
      const left = cts.map((ct) => ct.cells.length);
      const dist = new Map();
      let nodes = 0;
      const rec = (j, k) => {
        if (++nodes > maxNodes) throw TIMEOUT;
        if (j === group.length) {
          let entry = dist.get(k);
          if (!entry) dist.set(k, (entry = { ways: 0, perCell: new Array(group.length).fill(0) }));
          entry.ways++;
          for (let t = 0; t < group.length; t++) entry.perCell[t] += assigned[t];
          return;
        }
        for (const val of [0, 1]) {
          let ok = true;
          for (const ci of byCell[j]) {
            const s2 = sum[ci] + val;
            const l2 = left[ci] - 1;
            if (s2 > cts[ci].need || s2 + l2 < cts[ci].need) { ok = false; break; }
          }
          if (!ok) continue;
          for (const ci of byCell[j]) { sum[ci] += val; left[ci]--; }
          assigned[j] = val;
          rec(j + 1, k + val);
          for (const ci of byCell[j]) { sum[ci] -= val; left[ci]++; }
        }
        assigned[j] = 0;
      };
      try {
        rec(0, 0);
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        fallback = true;
        break;
      }
      components.push({ group, dist });
    }

    if (fallback) {
      // Componente grande demais: estimativa local (média das restrições de cada casa).
      for (const ct of constraints) {
        const p = ct.need / ct.cells.length;
        for (const x of ct.cells) probs.set(x, Math.max(probs.has(x) ? probs.get(x) : 0, p));
      }
      const pi = interior.length ? Math.max(0, remaining) / (interior.length + frontierSet.size) : 1;
      interior.forEach((x) => probs.set(x, pi));
      return { probs, knownMines, knownSafe };
    }

    // Convolução: distribuição do total de minas na fronteira (em log, sem estourar).
    const convolve = (list) => {
      let acc = new Map([[0, 0]]); // k → log(ways)
      for (const comp of list) {
        const next = new Map();
        for (const [k1, l1] of acc) {
          for (const [k2, e] of comp.dist) {
            const k = k1 + k2;
            const l = l1 + Math.log(e.ways);
            next.set(k, next.has(k) ? logAdd(next.get(k), l) : l);
          }
        }
        acc = next;
      }
      return acc;
    };
    const I = interior.length;

    let interiorNum = -Infinity;
    let total = -Infinity;
    for (const [K, l] of convolve(components)) {
      const rest = remaining - K;
      if (rest < 0 || rest > I) continue;
      const w = l + logChoose(I, rest);
      total = logAdd(total, w);
      if (I > 0 && rest > 0) interiorNum = logAdd(interiorNum, w + Math.log(rest / I));
    }
    if (total === -Infinity) return { probs, knownMines, knownSafe }; // informação inconsistente
    interior.forEach((x) => probs.set(x, Math.exp(interiorNum - total)));

    components.forEach((comp, ci) => {
      const others = convolve(components.filter((_, j) => j !== ci));
      const num = comp.group.map(() => -Infinity);
      for (const [k, e] of comp.dist) {
        let weight = -Infinity; // log da soma, sobre as outras componentes, dos jeitos de completar
        for (const [K2, l2] of others) {
          const rest = remaining - k - K2;
          if (rest < 0 || rest > I) continue;
          weight = logAdd(weight, l2 + logChoose(I, rest));
        }
        if (weight === -Infinity) continue;
        e.perCell.forEach((cnt, j) => {
          if (cnt > 0) num[j] = logAdd(num[j], Math.log(cnt) + weight);
        });
      }
      comp.group.forEach((x, j) => probs.set(x, Math.exp(num[j] - total)));
    });
    return { probs, knownMines, knownSafe };
  }

  function logAdd(a, b) {
    if (a === -Infinity) return b;
    if (b === -Infinity) return a;
    const m = Math.max(a, b);
    return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
  }

  function minesweeperMove(view, difficulty, rng) {
    const hidden = [];
    for (let i = 0; i < view.cells.length; i++) if (view.cells[i] === -1) hidden.push(i);
    if (!hidden.length) return null;
    const anyOpen = hidden.length < view.cells.length;

    // Fácil: chuta uma casa qualquer.
    if (difficulty === 'easy' || !anyOpen) return pickRandom(hidden, rng);

    if (difficulty === 'medium') {
      const { mines, safe } = msSimpleDeductions(view);
      if (safe.size) return pickRandom([...safe], rng);
      const guesses = hidden.filter((i) => !mines.has(i));
      return pickRandom(guesses.length ? guesses : hidden, rng);
    }

    // Difícil: deduções por restrições + probabilidade; abre a casa mais segura.
    const { probs } = msProbabilities(view);
    let best = Infinity;
    let options = [];
    for (const i of hidden) {
      const p = probs.has(i) ? probs.get(i) : 0.5;
      if (p < best - 1e-9) {
        best = p;
        options = [i];
      } else if (Math.abs(p - best) <= 1e-9) {
        options.push(i);
      }
    }
    return pickRandom(options, rng);
  }

  function chooseMove(game, state, difficulty, rng) {
    rng = rng || Math.random;
    if (game.ai.kind === 'minesweeper') return minesweeperMove(game.publicState(state), difficulty, rng);
    const moves = game.getMoves(state);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    if (difficulty === 'easy') {
      // 70% aleatório puro; 30% olha só um lance à frente (pega vitória imediata, mas não defende).
      if (rng() < 0.7) return pickRandom(moves, rng);
      return pickAmongBest(scoreAllMoves(game, state, 1, moves), 0, rng);
    }

    if (difficulty === 'medium') {
      const depth = game.ai.mediumDepth || 2;
      return pickAmongBest(scoreAllMoves(game, state, depth, moves), game.ai.mediumTolerance || 0, rng);
    }

    return searchHard(game, state, moves, rng);
  }

  return { chooseMove, WIN, minesweeper: { simpleDeductions: msSimpleDeductions, probabilities: msProbabilities } };
});
