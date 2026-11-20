/**
 * Damas (regras brasileiras) — regras puras (sem DOM, sem rede).
 * Funciona no Node (require) e no navegador (window.Games.checkers).
 *
 * Regras implementadas:
 *  - Tabuleiro 8×8, peças nas casas escuras; as brancas (jogador 0) começam.
 *  - Pedra anda 1 casa na diagonal para frente.
 *  - Captura obrigatória; a pedra captura para frente e para trás.
 *  - Capturas múltiplas na mesma jogada.
 *  - Lei da maioria: é obrigatório escolher a sequência que captura mais peças.
 *  - Peças capturadas só saem do tabuleiro no fim da jogada e não podem
 *    ser puladas duas vezes.
 *  - Promoção a dama ao terminar a jogada na última linha (se a pedra passa
 *    pela última linha no meio de uma captura e continua capturando, não promove).
 *  - Dama "voadora": anda e captura a qualquer distância na diagonal.
 *  - Perde quem não tiver peças ou não puder se mover.
 *  - Empate: 20 lances seguidos de cada lado só com damas, sem captura.
 *
 * Tabuleiro: array[64], índice = linha * 8 + coluna (linha 0 em cima).
 *   0 vazio | 1 pedra branca | 2 dama branca | -1 pedra preta | -2 dama preta
 * Jogada: { from, path: [casas onde pousa, em ordem], captures: [casas capturadas] }
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Games = root.Games || {})[mod.id] = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 8;
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const DRAW_QUIET_KING_PLIES = 40; // 20 lances de cada lado

  const owner = (v) => (v > 0 ? 0 : v < 0 ? 1 : null);
  const isKing = (v) => v === 2 || v === -2;
  const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const forwardDir = (player) => (player === 0 ? -1 : 1); // brancas sobem, pretas descem
  const promotionRow = (player) => (player === 0 ? 0 : SIZE - 1);
  const isDark = (r, c) => (r + c) % 2 === 1;

  function createState() {
    const board = Array(SIZE * SIZE).fill(0);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!isDark(r, c)) continue;
        if (r < 3) board[r * SIZE + c] = -1;
        else if (r > 4) board[r * SIZE + c] = 1;
      }
    }
    return { board, turn: 0, winner: null, winLine: null, lastMove: null, moveCount: 0, quietKingPlies: 0 };
  }

  /** Todas as sequências de captura máximas (em "folha") a partir da casa `from`. */
  function collectCaptures(board, from, out) {
    const piece = board[from];
    const player = owner(piece);
    const opponent = 1 - player;
    const king = isKing(piece);
    const b = board.slice();
    b[from] = 0; // a casa de origem fica livre durante a jogada

    function dfs(pos, path, captured) {
      const r = Math.floor(pos / SIZE);
      const c = pos % SIZE;
      let extended = false;
      for (const [dr, dc] of DIRS) {
        if (king) {
          // Desliza por casas vazias até encontrar uma peça.
          let rr = r + dr;
          let cc = c + dc;
          while (inside(rr, cc) && b[rr * SIZE + cc] === 0) { rr += dr; cc += dc; }
          if (!inside(rr, cc)) continue;
          const mid = rr * SIZE + cc;
          if (owner(b[mid]) !== opponent || captured.includes(mid)) continue;
          // Pode pousar em qualquer casa vazia depois da peça capturada.
          let lr = rr + dr;
          let lc = cc + dc;
          while (inside(lr, lc) && b[lr * SIZE + lc] === 0) {
            const land = lr * SIZE + lc;
            extended = true;
            dfs(land, path.concat(land), captured.concat(mid));
            lr += dr;
            lc += dc;
          }
        } else {
          const lr = r + 2 * dr;
          const lc = c + 2 * dc;
          if (!inside(lr, lc)) continue;
          const mid = (r + dr) * SIZE + (c + dc);
          const land = lr * SIZE + lc;
          if (owner(b[mid]) !== opponent || captured.includes(mid) || b[land] !== 0) continue;
          extended = true;
          dfs(land, path.concat(land), captured.concat(mid));
        }
      }
      if (!extended && captured.length > 0) out.push({ from, path, captures: captured });
    }

    dfs(from, [], []);
  }

  function generateMoves(board, player) {
    const captures = [];
    for (let i = 0; i < board.length; i++) {
      if (owner(board[i]) === player) collectCaptures(board, i, captures);
    }
    if (captures.length > 0) {
      // Lei da maioria: só valem as sequências que capturam o máximo de peças.
      const max = Math.max(...captures.map((m) => m.captures.length));
      return captures.filter((m) => m.captures.length === max);
    }

    const moves = [];
    for (let i = 0; i < board.length; i++) {
      const v = board[i];
      if (owner(v) !== player) continue;
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      for (const [dr, dc] of DIRS) {
        if (isKing(v)) {
          let rr = r + dr;
          let cc = c + dc;
          while (inside(rr, cc) && board[rr * SIZE + cc] === 0) {
            moves.push({ from: i, path: [rr * SIZE + cc], captures: [] });
            rr += dr;
            cc += dc;
          }
        } else if (dr === forwardDir(player)) {
          const rr = r + dr;
          const cc = c + dc;
          if (inside(rr, cc) && board[rr * SIZE + cc] === 0) moves.push({ from: i, path: [rr * SIZE + cc], captures: [] });
        }
      }
    }
    return moves;
  }

  /** Verificação rápida (sem gerar tudo) se o jogador tem pelo menos uma jogada. */
  function hasAnyMove(board, player) {
    const opponent = 1 - player;
    for (let i = 0; i < board.length; i++) {
      const v = board[i];
      if (owner(v) !== player) continue;
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      for (const [dr, dc] of DIRS) {
        const r1 = r + dr;
        const c1 = c + dc;
        if (!inside(r1, c1)) continue;
        const n1 = board[r1 * SIZE + c1];
        if (n1 === 0 && (isKing(v) || dr === forwardDir(player))) return true;
        if (isKing(v)) {
          let rr = r1;
          let cc = c1;
          while (inside(rr, cc) && board[rr * SIZE + cc] === 0) { rr += dr; cc += dc; }
          if (inside(rr, cc) && owner(board[rr * SIZE + cc]) === opponent &&
              inside(rr + dr, cc + dc) && board[(rr + dr) * SIZE + cc + dc] === 0) return true;
        } else if (owner(n1) === opponent && inside(r1 + dr, c1 + dc) && board[(r1 + dr) * SIZE + c1 + dc] === 0) {
          return true;
        }
      }
    }
    return false;
  }

  function getMoves(state) {
    if (state.winner !== null) return [];
    return generateMoves(state.board, state.turn);
  }

  function applyMove(state, move) {
    const board = state.board.slice();
    let piece = board[move.from];
    const player = owner(piece);
    const wasKing = isKing(piece);
    board[move.from] = 0;
    for (const cap of move.captures) board[cap] = 0;
    const dest = move.path[move.path.length - 1];
    if (!wasKing && Math.floor(dest / SIZE) === promotionRow(player)) piece = player === 0 ? 2 : -2;
    board[dest] = piece;

    const quietKingPlies = wasKing && move.captures.length === 0 ? state.quietKingPlies + 1 : 0;
    const next = 1 - player;
    let winner = null;
    if (!hasAnyMove(board, next)) winner = player; // sem peças ou sem movimentos: perde
    else if (quietKingPlies >= DRAW_QUIET_KING_PLIES) winner = 'draw';

    return {
      board,
      turn: next,
      winner,
      winLine: null,
      lastMove: { from: move.from, path: move.path.slice(), captures: move.captures.slice() },
      moveCount: state.moveCount + 1,
      quietKingPlies,
    };
  }

  /** Heurística: material, avanço das pedras, centro e proteção da última linha. */
  function evaluate(state, player) {
    const b = state.board;
    let score = 0;
    for (let i = 0; i < b.length; i++) {
      const v = b[i];
      if (v === 0) continue;
      const p = owner(v);
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      let value;
      if (isKing(v)) {
        value = 320;
      } else {
        const advance = p === 0 ? SIZE - 1 - r : r; // 0..7
        value = 100 + advance * 4;
        if (r === (p === 0 ? SIZE - 1 : 0)) value += 6; // guarda a linha de promoção do adversário
      }
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) value += 4;
      score += p === player ? value : -value;
    }
    return score;
  }

  /** Jogadas que promovem primeiro (ajuda a poda). */
  function orderMoves(state, moves) {
    const row = promotionRow(state.turn);
    const promotes = (m) => !isKing(state.board[m.from]) && Math.floor(m.path[m.path.length - 1] / SIZE) === row;
    return moves.slice().sort((a, b) => promotes(b) - promotes(a));
  }

  /** Chave da jogada: "origem:destino1,destino2...". null se o formato for inválido. */
  function moveKey(move) {
    if (!move || typeof move !== 'object') return null;
    const { from, path } = move;
    if (!Number.isInteger(from) || !Array.isArray(path) || path.length === 0 || path.length > 20) return null;
    if (!path.every(Number.isInteger)) return null;
    return from + ':' + path.join(',');
  }

  function hasCaptures(state) {
    const moves = getMoves(state);
    return moves.length > 0 && moves[0].captures.length > 0;
  }

  return {
    id: 'checkers',
    name: 'Damas',
    size: SIZE,
    playerNames: ['Brancas', 'Pretas'],
    createState,
    getMoves,
    applyMove,
    evaluate,
    orderMoves,
    moveKey,
    hasCaptures,
    owner,
    isKing,
    ai: { mediumDepth: 3, mediumTolerance: 10, hardDepth: 9, timeLimitMs: 1500 },
  };
});
