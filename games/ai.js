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

  function chooseMove(game, state, difficulty, rng) {
    rng = rng || Math.random;
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

  return { chooseMove, WIN };
});
