/**
 * Jogo da Velha — regras puras (sem DOM, sem rede).
 * Funciona no Node (require) e no navegador (window.Games.tictactoe).
 *
 * Estado:
 *   board:   array[9] com null | 0 | 1   (0 = X, 1 = O)
 *   turn:    0 | 1  (de quem é a vez)
 *   winner:  null (em andamento) | 0 | 1 | 'draw'
 *   winLine: índices da linha vencedora (ou null)
 *   lastMove: índice da última jogada (ou null)
 * Jogada: índice 0..8 da casa.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Games = root.Games || {})[mod.id] = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // linhas
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // colunas
    [0, 4, 8], [2, 4, 6],            // diagonais
  ];

  function createState() {
    return { board: Array(9).fill(null), turn: 0, winner: null, winLine: null, lastMove: null, moveCount: 0 };
  }

  function getMoves(state) {
    if (state.winner !== null) return [];
    const moves = [];
    for (let i = 0; i < 9; i++) if (state.board[i] === null) moves.push(i);
    return moves;
  }

  function applyMove(state, move) {
    const board = state.board.slice();
    board[move] = state.turn;
    const moveCount = state.moveCount + 1;
    let winner = null;
    let winLine = null;
    for (const line of LINES) {
      const [a, b, c] = line;
      if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) {
        winner = board[a];
        winLine = line;
        break;
      }
    }
    if (winner === null && moveCount === 9) winner = 'draw';
    return { board, turn: 1 - state.turn, winner, winLine, lastMove: move, moveCount };
  }

  /** Heurística para a IA quando a busca não chega ao fim (pontuação do ponto de vista de `player`). */
  function evaluate(state, player) {
    let score = 0;
    for (const line of LINES) {
      let mine = 0;
      let theirs = 0;
      for (const i of line) {
        if (state.board[i] === player) mine++;
        else if (state.board[i] !== null) theirs++;
      }
      if (theirs === 0) score += mine * mine;
      if (mine === 0) score -= theirs * theirs;
    }
    if (state.board[4] === player) score += 1;
    return score;
  }

  function moveKey(move) {
    return String(move);
  }

  return {
    id: 'tictactoe',
    name: 'Jogo da Velha',
    playerNames: ['X', 'O'],
    createState,
    getMoves,
    applyMove,
    evaluate,
    moveKey,
    // Configuração da IA: profundidade da busca por dificuldade.
    ai: { mediumDepth: 2, hardDepth: 9, timeLimitMs: 2000 },
  };
});
