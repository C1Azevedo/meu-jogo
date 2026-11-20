/**
 * Xadrez — regras puras (sem DOM, sem rede).
 * Funciona no Node (require) e no navegador (window.Games.chess).
 *
 * Regras: movimentos de todas as peças, roque (dos dois lados, sem passar por
 * casa atacada nem sair do xeque), en passant, promoção do peão (dama, torre,
 * bispo ou cavalo), xeque, xeque-mate, afogamento, empate por repetição tripla
 * (automático), regra dos 50 lances (automático) e material insuficiente.
 *
 * Tabuleiro: array[64], índice = linha * 8 + coluna; linha 0 é a 8ª fileira
 * (lado das pretas), coluna 0 é a coluna "a".
 *   '' vazio | 'PNBRQK' brancas | 'pnbrqk' pretas
 * Jogador 0 = brancas (começa), 1 = pretas.
 * Jogada: { from, to, promotion?: 'q'|'r'|'b'|'n' }
 *   (as jogadas geradas também trazem piece, captured e flag — 'double',
 *    'ep' ou 'castle' — mas o cliente só precisa mandar from/to/promotion)
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Games = root.Games || {})[mod.id] = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';
  const KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const PROMOTIONS = ['q', 'r', 'b', 'n'];
  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  // Casas dos cantos → direito de roque perdido quando a torre sai/é capturada
  const ROOK_CORNERS = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };

  const colorOf = (p) => (p === '' ? -1 : p < 'a' ? 0 : 1);
  const typeOf = (p) => p.toLowerCase();
  const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const pieceFor = (type, color) => (color === 0 ? type.toUpperCase() : type);

  function squareName(i) {
    return 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
  }
  function parseSquare(name) {
    return (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);
  }

  // ---------------------------------------------------------------------------
  // Ataques e geração de jogadas
  // ---------------------------------------------------------------------------

  /** A casa `sq` está atacada por alguma peça da cor `by`? */
  function isAttacked(board, sq, by) {
    const r = sq >> 3;
    const c = sq & 7;
    const pawn = by === 0 ? 'P' : 'p';
    const pr = by === 0 ? r + 1 : r - 1; // peões brancos atacam "para cima"
    if (pr >= 0 && pr < 8) {
      if (c > 0 && board[pr * 8 + c - 1] === pawn) return true;
      if (c < 7 && board[pr * 8 + c + 1] === pawn) return true;
    }
    const knight = pieceFor('n', by);
    for (const [dr, dc] of KNIGHT_D) {
      const rr = r + dr;
      const cc = c + dc;
      if (inside(rr, cc) && board[rr * 8 + cc] === knight) return true;
    }
    const king = pieceFor('k', by);
    for (const [dr, dc] of KING_D) {
      const rr = r + dr;
      const cc = c + dc;
      if (inside(rr, cc) && board[rr * 8 + cc] === king) return true;
    }
    const queen = pieceFor('q', by);
    const rook = pieceFor('r', by);
    const bishop = pieceFor('b', by);
    for (const [dr, dc] of ROOK_D) {
      let rr = r + dr;
      let cc = c + dc;
      while (inside(rr, cc)) {
        const p = board[rr * 8 + cc];
        if (p !== '') {
          if (p === rook || p === queen) return true;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
    for (const [dr, dc] of BISHOP_D) {
      let rr = r + dr;
      let cc = c + dc;
      while (inside(rr, cc)) {
        const p = board[rr * 8 + cc];
        if (p !== '') {
          if (p === bishop || p === queen) return true;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
    return false;
  }

  function findKing(board, color) {
    return board.indexOf(pieceFor('k', color));
  }

  /** Jogadas pseudo-legais (podem deixar o próprio rei em xeque). */
  function pseudoMoves(board, color, castling, ep) {
    const moves = [];
    const enemy = 1 - color;
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (colorOf(p) !== color) continue;
      const t = typeOf(p);
      const r = sq >> 3;
      const c = sq & 7;

      if (t === 'p') {
        const dir = color === 0 ? -1 : 1;
        const startRow = color === 0 ? 6 : 1;
        const lastRow = color === 0 ? 0 : 7;
        const r1 = r + dir;
        const addPawn = (to, captured, flag) => {
          if (r1 === lastRow) {
            for (const promotion of PROMOTIONS) moves.push({ from: sq, to, piece: p, captured, promotion });
          } else {
            moves.push(flag ? { from: sq, to, piece: p, captured, flag } : { from: sq, to, piece: p, captured });
          }
        };
        const one = r1 * 8 + c;
        if (board[one] === '') {
          addPawn(one, '');
          const two = (r + 2 * dir) * 8 + c;
          if (r === startRow && board[two] === '') moves.push({ from: sq, to: two, piece: p, captured: '', flag: 'double' });
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (cc < 0 || cc > 7) continue;
          const to = r1 * 8 + cc;
          const target = board[to];
          if (target !== '' && colorOf(target) === enemy) addPawn(to, target);
          else if (to === ep) moves.push({ from: sq, to, piece: p, captured: pieceFor('p', enemy), flag: 'ep' });
        }
        continue;
      }

      if (t === 'n' || t === 'k') {
        for (const [dr, dc] of t === 'n' ? KNIGHT_D : KING_D) {
          const rr = r + dr;
          const cc = c + dc;
          if (!inside(rr, cc)) continue;
          const target = board[rr * 8 + cc];
          if (target === '' || colorOf(target) === enemy) moves.push({ from: sq, to: rr * 8 + cc, piece: p, captured: target });
        }
        if (t === 'k') addCastling(board, color, castling, sq, moves);
        continue;
      }

      const dirs = t === 'r' ? ROOK_D : t === 'b' ? BISHOP_D : KING_D; // dama = todas as direções
      for (const [dr, dc] of dirs) {
        let rr = r + dr;
        let cc = c + dc;
        while (inside(rr, cc)) {
          const target = board[rr * 8 + cc];
          if (target === '') {
            moves.push({ from: sq, to: rr * 8 + cc, piece: p, captured: '' });
          } else {
            if (colorOf(target) === enemy) moves.push({ from: sq, to: rr * 8 + cc, piece: p, captured: target });
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
    }
    return moves;
  }

  /** Roque: rei e torre nas casas iniciais, casas entre eles livres, rei fora de xeque e sem passar por casa atacada. */
  function addCastling(board, color, castling, kingSq, moves) {
    const home = color === 0 ? 60 : 4;
    if (kingSq !== home) return;
    const enemy = 1 - color;
    const [kingSide, queenSide] = color === 0 ? ['K', 'Q'] : ['k', 'q'];
    const rook = pieceFor('r', color);
    const king = pieceFor('k', color);
    if (!castling.includes(kingSide) && !castling.includes(queenSide)) return;
    if (isAttacked(board, home, enemy)) return; // não pode rocar em xeque
    if (castling.includes(kingSide) && board[home + 3] === rook &&
        board[home + 1] === '' && board[home + 2] === '' &&
        !isAttacked(board, home + 1, enemy) && !isAttacked(board, home + 2, enemy)) {
      moves.push({ from: home, to: home + 2, piece: king, captured: '', flag: 'castle' });
    }
    if (castling.includes(queenSide) && board[home - 4] === rook &&
        board[home - 1] === '' && board[home - 2] === '' && board[home - 3] === '' &&
        !isAttacked(board, home - 1, enemy) && !isAttacked(board, home - 2, enemy)) {
      moves.push({ from: home, to: home - 2, piece: king, captured: '', flag: 'castle' });
    }
  }

  /** Tabuleiro depois da jogada (sem verificar legalidade). */
  function boardAfter(board, move) {
    const b = board.slice();
    const p = b[move.from];
    const color = colorOf(p);
    b[move.from] = '';
    if (move.flag === 'ep') b[move.to + (color === 0 ? 8 : -8)] = '';
    if (move.flag === 'castle') {
      const kingSide = move.to > move.from;
      const rookFrom = kingSide ? move.from + 3 : move.from - 4;
      const rookTo = kingSide ? move.from + 1 : move.from - 1;
      b[rookTo] = b[rookFrom];
      b[rookFrom] = '';
    }
    b[move.to] = move.promotion ? pieceFor(move.promotion, color) : p;
    return b;
  }

  const ORDER_BONUS = { q: 800, r: 400, b: 250, n: 250 };
  /** Capturas primeiro (vítima mais valiosa, atacante mais barato), depois promoções. */
  function moveOrderScore(m) {
    let score = 0;
    if (m.captured) score += 10 * VALUE[typeOf(m.captured)] - VALUE[typeOf(m.piece)] + 1000;
    if (m.promotion) score += ORDER_BONUS[m.promotion];
    return score;
  }

  function legalMoves(board, color, castling, ep) {
    const enemy = 1 - color;
    let kingSq = findKing(board, color);
    const legal = [];
    for (const m of pseudoMoves(board, color, castling, ep)) {
      const b = boardAfter(board, m);
      const k = m.from === kingSq ? m.to : kingSq;
      if (!isAttacked(b, k, enemy)) legal.push(m);
    }
    // Boa ordem ajuda muito a poda alfa-beta da IA.
    legal.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
    return legal;
  }

  /** Só considera o en passant na chave de posição se a captura for possível. */
  function effectiveEp(board, color, ep) {
    if (ep === null) return null;
    const pawn = pieceFor('p', color);
    const r = ep >> 3;
    const c = ep & 7;
    const pr = color === 0 ? r + 1 : r - 1;
    if ((c > 0 && board[pr * 8 + c - 1] === pawn) || (c < 7 && board[pr * 8 + c + 1] === pawn)) return ep;
    return null;
  }

  function positionKey(board, turn, castling, ep) {
    let key = '';
    for (let i = 0; i < 64; i++) key += board[i] || '.';
    return key + turn + castling + (ep === null ? '-' : ep);
  }

  function insufficientMaterial(board) {
    const minors = [];
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (p === '') continue;
      const t = typeOf(p);
      if (t === 'p' || t === 'r' || t === 'q') return false;
      if (t === 'n' || t === 'b') minors.push({ t, shade: ((i >> 3) + (i & 7)) % 2 });
    }
    if (minors.length <= 1) return true; // rei x rei, rei + peça menor x rei
    // Só bispos, todos em casas da mesma cor
    return minors.every((m) => m.t === 'b' && m.shade === minors[0].shade);
  }

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------

  function cacheMoves(state, moves) {
    // Não enumerável: não vai no JSON (rede) nem na cópia para o Web Worker.
    Object.defineProperty(state, '_moves', { value: moves, enumerable: false });
    return state;
  }

  function createState() {
    const board = START.split('').map((ch) => (ch === '.' ? '' : ch));
    const key = positionKey(board, 0, 'KQkq', null);
    return {
      board,
      turn: 0,
      castling: 'KQkq',
      ep: null,
      halfmove: 0,
      fullmove: 1,
      check: false,
      winner: null,
      winLine: null,
      reason: null,
      lastMove: null,
      captured: [[], []], // peças capturadas pelas brancas / pelas pretas
      history: [key], // posições desde o último lance irreversível (repetição)
      moveCount: 0,
    };
  }

  function getMoves(state) {
    if (state.winner !== null) return [];
    if (state._moves) return state._moves;
    const moves = legalMoves(state.board, state.turn, state.castling, state.ep);
    cacheMoves(state, moves);
    return moves;
  }

  function applyMove(state, move) {
    const color = state.turn;
    const next = 1 - color;
    const board = boardAfter(state.board, move);
    const piece = state.board[move.from];
    const t = typeOf(piece);

    let castling = state.castling;
    if (t === 'k') castling = castling.replace(color === 0 ? /[KQ]/g : /[kq]/g, '');
    if (ROOK_CORNERS[move.from]) castling = castling.replace(ROOK_CORNERS[move.from], '');
    if (ROOK_CORNERS[move.to]) castling = castling.replace(ROOK_CORNERS[move.to], '');

    const ep = t === 'p' && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null;
    const captured = move.captured || '';
    const halfmove = t === 'p' || captured ? 0 : state.halfmove + 1;
    const capturedLists = captured ? [state.captured[0].slice(), state.captured[1].slice()] : state.captured;
    if (captured) capturedLists[color].push(captured);

    const key = positionKey(board, next, castling, effectiveEp(board, next, ep));
    const history = halfmove === 0 ? [key] : state.history.concat(key);
    const check = isAttacked(board, findKing(board, next), color);
    const nextMoves = legalMoves(board, next, castling, ep);

    let winner = null;
    let reason = null;
    if (nextMoves.length === 0) {
      if (check) { winner = color; reason = 'checkmate'; }
      else { winner = 'draw'; reason = 'stalemate'; }
    } else if (halfmove >= 100) {
      winner = 'draw'; reason = 'fifty';
    } else if (history.filter((k) => k === key).length >= 3) {
      winner = 'draw'; reason = 'repetition';
    } else if (insufficientMaterial(board)) {
      winner = 'draw'; reason = 'material';
    }

    const result = {
      board,
      turn: next,
      castling,
      ep,
      halfmove,
      fullmove: state.fullmove + (color === 1 ? 1 : 0),
      check,
      winner,
      winLine: null,
      reason,
      lastMove: { from: move.from, to: move.to, promotion: move.promotion || null, captured, flag: move.flag || null },
      captured: capturedLists,
      history,
      moveCount: state.moveCount + 1,
    };
    return cacheMoves(result, winner === null ? nextMoves : []);
  }

  // ---------------------------------------------------------------------------
  // Avaliação (para a IA)
  // ---------------------------------------------------------------------------

  // Tabelas de posição (do ponto de vista das brancas; linha 0 = 8ª fileira).
  const PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0,
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20,
    ],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20,
    ],
    kEnd: [
      -50, -40, -30, -20, -20, -30, -40, -50,
      -30, -20, -10, 0, 0, -10, -20, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -30, 0, 0, 0, 0, -30, -30,
      -50, -30, -30, -30, -30, -30, -30, -50,
    ],
  };

  /** Só material (usada pela IA média). */
  function evaluateMaterial(state, player) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = state.board[i];
      if (p === '') continue;
      score += colorOf(p) === player ? VALUE[typeOf(p)] : -VALUE[typeOf(p)];
    }
    return score;
  }

  /** Material + posição das peças (usada pela IA difícil). */
  function evaluate(state, player) {
    const b = state.board;
    let heavy = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (p !== '' && p !== 'P' && p !== 'p' && p !== 'K' && p !== 'k') heavy += VALUE[typeOf(p)];
    }
    const endgame = heavy <= 1600; // poucas peças: o rei deve ir para o centro
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (p === '') continue;
      const color = colorOf(p);
      const t = typeOf(p);
      const idx = color === 0 ? i : (7 - (i >> 3)) * 8 + (i & 7); // espelha para as pretas
      const table = t === 'k' && endgame ? PST.kEnd : PST[t];
      const value = VALUE[t] + table[idx];
      score += color === player ? value : -value;
    }
    return score;
  }

  /** Jogadas "barulhentas" para a busca de quiescência: capturas e promoções. */
  function noisyMoves(state) {
    return getMoves(state).filter((m) => m.captured || m.promotion);
  }

  // ---------------------------------------------------------------------------
  // Utilidades para a interface e o servidor
  // ---------------------------------------------------------------------------

  /** Chave da jogada: "origem-destino[promoção]". null se o formato for inválido. */
  function moveKey(move) {
    if (!move || typeof move !== 'object') return null;
    const { from, to, promotion } = move;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) return null;
    if (promotion !== undefined && promotion !== null && !PROMOTIONS.includes(promotion)) return null;
    return `${from}-${to}${promotion || ''}`;
  }

  function statusNote(state) {
    return state.check && state.winner === null ? 'Xeque!' : '';
  }

  const REASONS = {
    checkmate: 'Xeque-mate!',
    stalemate: 'Empate por afogamento.',
    repetition: 'Empate por repetição tripla.',
    fifty: 'Empate pela regra dos 50 lances.',
    material: 'Empate por material insuficiente.',
  };
  function resultDetail(state) {
    return REASONS[state.reason] || '';
  }

  /** Monta um estado a partir de uma posição FEN (usado nos testes). */
  function fromFEN(fen) {
    const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
    const board = [];
    for (const ch of placement.replace(/\//g, '')) {
      if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) board.push('');
      else board.push(ch);
    }
    const t = turn === 'b' ? 1 : 0;
    const cast = castling === '-' ? '' : castling;
    const epSq = ep && ep !== '-' ? parseSquare(ep) : null;
    const state = {
      ...createState(),
      board,
      turn: t,
      castling: cast,
      ep: epSq,
      halfmove: Number(half || 0),
      fullmove: Number(full || 1),
      check: isAttacked(board, findKing(board, t), 1 - t),
    };
    state.history = [positionKey(board, t, cast, effectiveEp(board, t, epSq))];
    return state;
  }

  return {
    id: 'chess',
    name: 'Xadrez',
    playerNames: ['Brancas', 'Pretas'],
    VALUE,
    colorOf,
    typeOf,
    squareName,
    parseSquare,
    isAttacked,
    createState,
    fromFEN,
    getMoves,
    applyMove,
    evaluate,
    evaluateMaterial,
    noisyMoves,
    moveKey,
    statusNote,
    resultDetail,
    // Médio: profundidade 2 só com material. Difícil: alfa-beta com quiescência,
    // aprofundamento iterativo até ~1,5 s, material + posição.
    ai: { mediumDepth: 2, mediumEvaluate: evaluateMaterial, mediumTolerance: 0, hardDepth: 10, timeLimitMs: 1500, quiescence: true },
  };
});
