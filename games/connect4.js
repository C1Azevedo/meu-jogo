/**
 * Ligue 4 — regras puras (sem DOM, sem rede).
 * Funciona no Node (require) e no navegador (window.Games.connect4).
 *
 * Tabuleiro 6 linhas × 7 colunas, guardado em um array de 42 posições
 * (índice = linha * 7 + coluna, linha 0 é a de cima).
 * Estado:
 *   board:   array[42] com null | 0 | 1   (0 = vermelho, 1 = amarelo)
 *   turn:    0 | 1
 *   winner:  null | 0 | 1 | 'draw'
 *   winLine: índices das 4 (ou mais) peças alinhadas
 *   lastMove: índice da última peça colocada
 * Jogada: número da coluna (0..6).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Games = root.Games || {})[mod.id] = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROWS = 6;
  const COLS = 7;
  const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];
  // Direções: horizontal, vertical, diagonal ↘ e diagonal ↗
  const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [-1, 1]];

  // Todas as "janelas" de 4 casas alinhadas (69 no total), usadas pela heurística.
  const WINDOWS = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of DIRECTIONS) {
        const er = r + 3 * dr;
        const ec = c + 3 * dc;
        if (er < 0 || er >= ROWS || ec >= COLS) continue;
        WINDOWS.push([0, 1, 2, 3].map((k) => (r + k * dr) * COLS + (c + k * dc)));
      }
    }
  }

  function createState() {
    return { board: Array(ROWS * COLS).fill(null), turn: 0, winner: null, winLine: null, lastMove: null, moveCount: 0 };
  }

  function getMoves(state) {
    if (state.winner !== null) return [];
    return CENTER_ORDER.filter((c) => state.board[c] === null); // coluna com espaço no topo
  }

  /** Linha onde a peça cairia na coluna (ou -1 se cheia). */
  function dropRow(board, col) {
    for (let r = ROWS - 1; r >= 0; r--) if (board[r * COLS + col] === null) return r;
    return -1;
  }

  /** Procura 4 em linha passando pela casa (r, c), em todas as direções. */
  function findLine(board, r, c) {
    const player = board[r * COLS + c];
    for (const [dr, dc] of DIRECTIONS) {
      const line = [r * COLS + c];
      for (const sign of [1, -1]) {
        let rr = r + dr * sign;
        let cc = c + dc * sign;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr * COLS + cc] === player) {
          line.push(rr * COLS + cc);
          rr += dr * sign;
          cc += dc * sign;
        }
      }
      if (line.length >= 4) return line.sort((a, b) => a - b);
    }
    return null;
  }

  function applyMove(state, col) {
    const row = dropRow(state.board, col);
    if (row < 0) throw new Error('Coluna cheia');
    const board = state.board.slice();
    const index = row * COLS + col;
    board[index] = state.turn;
    const moveCount = state.moveCount + 1;
    const winLine = findLine(board, row, col);
    let winner = winLine ? state.turn : null;
    if (winner === null && moveCount === ROWS * COLS) winner = 'draw';
    return { board, turn: 1 - state.turn, winner, winLine, lastMove: index, moveCount };
  }

  /** Heurística: pontua janelas abertas e o controle da coluna central. */
  function evaluate(state, player) {
    const b = state.board;
    let score = 0;
    for (let r = 0; r < ROWS; r++) {
      if (b[r * COLS + 3] === player) score += 4;
      else if (b[r * COLS + 3] !== null) score -= 4;
    }
    for (const w of WINDOWS) {
      let mine = 0;
      let theirs = 0;
      for (let k = 0; k < 4; k++) {
        const v = b[w[k]];
        if (v === null) continue;
        if (v === player) mine++;
        else theirs++;
      }
      if (mine && theirs) continue;
      if (mine === 3) score += 40;
      else if (mine === 2) score += 8;
      else if (theirs === 3) score -= 45;
      else if (theirs === 2) score -= 8;
    }
    return score;
  }

  /** Coloca as colunas centrais primeiro (melhora muito a poda alfa-beta). */
  function orderMoves(state, moves) {
    return moves.slice().sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b));
  }

  /** Chave única da jogada; null para qualquer coisa que não seja um inteiro. */
  function moveKey(move) {
    return Number.isInteger(move) ? String(move) : null;
  }

  return {
    id: 'connect4',
    name: 'Ligue 4',
    rows: ROWS,
    cols: COLS,
    playerNames: ['Vermelho', 'Amarelo'],
    createState,
    getMoves,
    applyMove,
    evaluate,
    orderMoves,
    moveKey,
    ai: { mediumDepth: 2, hardDepth: 20, timeLimitMs: 1500 },
  };
});
