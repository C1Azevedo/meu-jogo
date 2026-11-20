/**
 * Campo Minado — regras puras (sem DOM, sem rede).
 * Funciona no Node (require) e no navegador (window.Games.minesweeper).
 *
 * Modos:
 *   'solo'   — desafio solo: turn é sempre 0; vence (winner 0) ao abrir todas as
 *              casas seguras, perde (winner 1) ao pisar numa mina.
 *   'versus' — dois jogadores no mesmo tabuleiro, jogadas alternadas. Quem pisa
 *              numa mina perde. Se o campo for limpo, vence quem abriu mais casas.
 *
 * Estado completo (fica só no servidor, ou no navegador no modo contra a CPU):
 *   cells:  array com -1 (fechada) ou 0..8 (aberta: nº de minas vizinhas)
 *   owner:  quem abriu cada casa (0 | 1 | null)
 *   mines:  array de 0/1 com as minas — null até a primeira jogada
 *   opened: [casas abertas pelo jogador 0, pelo jogador 1]
 *   exploded: índice da mina pisada (ou null)
 * Estado público (publicState): o mesmo sem `mines`. As posições das minas só
 * aparecem em `mineMap` depois que a partida termina.
 *
 * Jogada: índice da casa a abrir. Bandeiras são só visuais e ficam no cliente.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Games = root.Games || {})[mod.id] = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LEVELS = {
    easy: { cols: 9, rows: 9, mines: 10, label: 'Fácil' },
    medium: { cols: 16, rows: 16, mines: 40, label: 'Médio' },
    hard: { cols: 30, rows: 16, mines: 99, label: 'Difícil' },
  };

  function normalizeOptions(options) {
    const o = options && typeof options === 'object' ? options : {};
    const level = Object.prototype.hasOwnProperty.call(LEVELS, o.level) ? o.level : 'easy';
    const mode = o.mode === 'versus' ? 'versus' : 'solo';
    return { level, mode };
  }

  /** Opções aceitas no modo online: só o nível vem do cliente; o modo é sempre 'versus'. */
  function onlineOptions(options) {
    return { level: normalizeOptions(options).level, mode: 'versus' };
  }

  function neighbors(index, cols, rows) {
    const r = Math.floor(index / cols);
    const c = index % cols;
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

  function createState(options) {
    const { level, mode } = normalizeOptions(options);
    const { cols, rows, mines } = LEVELS[level];
    const n = cols * rows;
    return {
      level,
      mode,
      cols,
      rows,
      mineCount: mines,
      cells: Array(n).fill(-1),
      owner: Array(n).fill(null),
      mines: null,
      opened: [0, 0],
      turn: 0,
      winner: null,
      winLine: null,
      exploded: null,
      lastMove: null,
      moveCount: 0,
      startedAt: null,
      endedAt: null,
    };
  }

  /**
   * Sorteia as minas na primeira jogada: a casa clicada e as vizinhas ficam
   * livres (o primeiro clique sempre abre uma área), se houver espaço.
   */
  function placeMines(state, firstIndex, rng) {
    const { cols, rows, mineCount } = state;
    const n = cols * rows;
    let forbidden = new Set([firstIndex, ...neighbors(firstIndex, cols, rows)]);
    if (n - forbidden.size < mineCount) forbidden = new Set([firstIndex]);
    const candidates = [];
    for (let i = 0; i < n; i++) if (!forbidden.has(i)) candidates.push(i);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const mines = Array(n).fill(0);
    for (let k = 0; k < mineCount; k++) mines[candidates[k]] = 1;
    return mines;
  }

  function countMines(mines, index, cols, rows) {
    let count = 0;
    for (const nb of neighbors(index, cols, rows)) count += mines[nb];
    return count;
  }

  function getMoves(state) {
    if (state.winner !== null) return [];
    const moves = [];
    for (let i = 0; i < state.cells.length; i++) if (state.cells[i] === -1) moves.push(i);
    return moves;
  }

  /** Abre a casa `index`. `rng` só é usado na primeira jogada (sorteio das minas). */
  function applyMove(state, index, rng) {
    const { cols, rows, mineCount, mode } = state;
    const player = state.turn;
    const mines = state.mines || placeMines(state, index, rng || Math.random);
    const cells = state.cells.slice();
    const owner = state.owner.slice();
    const opened = state.opened.slice();
    const now = Date.now();
    const startedAt = state.startedAt || now;
    let winner = null;
    let exploded = null;

    if (mines[index]) {
      exploded = index;
      winner = mode === 'solo' ? 1 : 1 - player;
    } else {
      // Abertura automática: casas com 0 abrem as vizinhas (busca em largura).
      const queue = [index];
      cells[index] = countMines(mines, index, cols, rows);
      owner[index] = player;
      let revealed = 1;
      while (queue.length) {
        const i = queue.shift();
        if (cells[i] !== 0) continue;
        for (const nb of neighbors(i, cols, rows)) {
          if (cells[nb] !== -1 || mines[nb]) continue;
          cells[nb] = countMines(mines, nb, cols, rows);
          owner[nb] = player;
          revealed++;
          queue.push(nb);
        }
      }
      opened[player] += revealed;
      if (opened[0] + opened[1] === cols * rows - mineCount) {
        if (mode === 'solo') winner = 0;
        else winner = opened[0] > opened[1] ? 0 : opened[1] > opened[0] ? 1 : 'draw';
      }
    }

    return {
      ...state,
      cells,
      owner,
      mines,
      opened,
      turn: mode === 'solo' ? 0 : 1 - player,
      winner,
      exploded,
      lastMove: index,
      moveCount: state.moveCount + 1,
      startedAt,
      endedAt: winner !== null ? now : null,
    };
  }

  /**
   * Versão do estado que pode ir para o cliente (e para a IA): nunca contém
   * as minas enquanto a partida está em andamento.
   */
  function publicState(state) {
    if (state.isPublic) return state;
    const { mines, ...rest } = state;
    let mineMap = null;
    if (state.winner !== null && mines) {
      mineMap = [];
      for (let i = 0; i < mines.length; i++) if (mines[i]) mineMap.push(i);
    }
    return { ...rest, isPublic: true, mineMap };
  }

  /** Texto extra sobre o resultado, do ponto de vista de `seat`. */
  function resultDetail(state, seat) {
    if (state.winner === null || state.mode === 'solo') return '';
    if (state.exploded !== null) {
      return state.winner === seat ? 'O adversário pisou numa mina.' : 'Você pisou numa mina.';
    }
    return `Campo limpo: ${state.opened[seat]} × ${state.opened[1 - seat]} casas abertas.`;
  }

  function evaluate() {
    return 0;
  }

  function moveKey(move) {
    return Number.isInteger(move) ? String(move) : null;
  }

  return {
    id: 'minesweeper',
    name: 'Campo Minado',
    playerNames: ['Azul', 'Laranja'],
    LEVELS,
    neighbors,
    normalizeOptions,
    onlineOptions,
    createState,
    getMoves,
    applyMove,
    publicState,
    resultDetail,
    evaluate,
    moveKey,
    // A IA do Campo Minado é baseada em dedução (ver ai.js), não em minimax.
    ai: { kind: 'minesweeper' },
  };
});
