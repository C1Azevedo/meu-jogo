/* Interface das Damas. A lógica fica em /games/checkers.js.
 *
 * Como jogar: toque numa peça sua (as que podem se mover ficam destacadas) e
 * depois na casa de destino. Em capturas múltiplas, toque em cada casa onde a
 * peça pousa, em ordem; a jogada é enviada quando a sequência termina.
 */
(function () {
  'use strict';
  const UI = (window.UI = window.UI || { views: {} });
  const game = window.Games.checkers;
  const SIZE = game.size;

  const CROWN =
    '<svg class="ck-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.5-10-4.5 4-3-7-3 7-4.5-4z"/></svg>';

  function pieceHtml(value) {
    if (!value) return '';
    const cls = game.owner(value) === 0 ? 'p0' : 'p1';
    return `<div class="ck-piece ${cls}${game.isKing(value) ? ' king' : ''}">${game.isKing(value) ? CROWN : ''}</div>`;
  }

  UI.views.checkers = {
    // Ilustração original do cartão na tela inicial
    icon:
      '<svg class="icon" viewBox="0 0 160 120" aria-hidden="true"><rect x="22" y="20" width="116" height="80" rx="6" fill="none" stroke="var(--neon-pink)" stroke-width="3"/><rect x="26" y="24" width="18" height="18" fill="var(--ck-light)"/><rect x="44" y="24" width="18" height="18" fill="var(--ck-dark)"/><rect x="62" y="24" width="18" height="18" fill="var(--ck-light)"/><rect x="80" y="24" width="18" height="18" fill="var(--ck-dark)"/><rect x="98" y="24" width="18" height="18" fill="var(--ck-light)"/><rect x="116" y="24" width="18" height="18" fill="var(--ck-dark)"/><rect x="26" y="42" width="18" height="18" fill="var(--ck-dark)"/><rect x="44" y="42" width="18" height="18" fill="var(--ck-light)"/><rect x="62" y="42" width="18" height="18" fill="var(--ck-dark)"/><rect x="80" y="42" width="18" height="18" fill="var(--ck-light)"/><rect x="98" y="42" width="18" height="18" fill="var(--ck-dark)"/><rect x="116" y="42" width="18" height="18" fill="var(--ck-light)"/><rect x="26" y="60" width="18" height="18" fill="var(--ck-light)"/><rect x="44" y="60" width="18" height="18" fill="var(--ck-dark)"/><rect x="62" y="60" width="18" height="18" fill="var(--ck-light)"/><rect x="80" y="60" width="18" height="18" fill="var(--ck-dark)"/><rect x="98" y="60" width="18" height="18" fill="var(--ck-light)"/><rect x="116" y="60" width="18" height="18" fill="var(--ck-dark)"/><rect x="26" y="78" width="18" height="18" fill="var(--ck-dark)"/><rect x="44" y="78" width="18" height="18" fill="var(--ck-light)"/><rect x="62" y="78" width="18" height="18" fill="var(--ck-dark)"/><rect x="80" y="78" width="18" height="18" fill="var(--ck-light)"/><rect x="98" y="78" width="18" height="18" fill="var(--ck-dark)"/><rect x="116" y="78" width="18" height="18" fill="var(--ck-light)"/><circle cx="53" cy="33" r="7" fill="var(--ck-black)" stroke="var(--ck-black-edge)" stroke-width="1.5"/><circle cx="89" cy="33" r="7" fill="var(--ck-black)" stroke="var(--ck-black-edge)" stroke-width="1.5"/><circle cx="125" cy="33" r="7" fill="var(--ck-black)" stroke="var(--ck-black-edge)" stroke-width="1.5"/><circle cx="71" cy="51" r="7" fill="var(--ck-black)" stroke="var(--ck-black-edge)" stroke-width="1.5"/><circle cx="35" cy="87" r="7" fill="var(--ck-white)" stroke="var(--ck-white-edge)" stroke-width="1.5"/><circle cx="71" cy="87" r="7" fill="var(--ck-white)" stroke="var(--ck-white-edge)" stroke-width="1.5"/><circle cx="107" cy="51" r="7" fill="var(--ck-white)" stroke="var(--ck-white-edge)" stroke-width="1.5"/><path d="M102.5 53.5h9l1-6-3 2.5-2.5-4-2.5 4-3-2.5z" fill="var(--gold)"/><circle cx="89" cy="69" r="7" fill="var(--ck-white)" stroke="var(--ck-white-edge)" stroke-width="1.5"/><circle cx="125" cy="69" r="7" fill="var(--ck-black)" stroke="var(--ck-black-edge)" stroke-width="1.5"/></svg>',
    description: 'Regras brasileiras: captura obrigatória e dama voadora.',

    badge(seat) {
      return `<svg class="badge" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" class="ck-badge-${seat}"/></svg>`;
    },

    create(container, { onMove }) {
      container.innerHTML = '';
      const board = document.createElement('div');
      board.className = 'ck-board';
      container.appendChild(board);

      let selected = null; // casa da peça selecionada
      let partial = []; // casas já escolhidas da sequência de captura
      let current = null; // { state, ctx }

      function clearSelection() {
        selected = null;
        partial = [];
      }

      function legalMoves() {
        return current && current.ctx.interactive ? game.getMoves(current.state) : [];
      }

      function candidates(moves) {
        if (selected === null) return [];
        return moves.filter((m) => m.from === selected && partial.every((p, i) => m.path[i] === p));
      }

      board.addEventListener('click', (e) => {
        const square = e.target.closest('.ck-square');
        if (!square || !current || !current.ctx.interactive) return;
        const index = Number(square.dataset.index);
        const moves = legalMoves();
        const cands = candidates(moves);
        const targets = new Set(cands.map((m) => m.path[partial.length]));

        if (targets.has(index)) {
          partial.push(index);
          const remaining = cands.filter((m) => m.path[partial.length - 1] === index);
          const done = remaining.find((m) => m.path.length === partial.length);
          if (done) {
            clearSelection();
            onMove(done);
            return;
          }
        } else if (moves.some((m) => m.from === index)) {
          selected = selected === index && partial.length === 0 ? null : index;
          partial = [];
        } else if (partial.length === 0) {
          clearSelection();
        }
        draw();
      });

      function draw() {
        const { state, ctx } = current;
        const flip = ctx.seat === 1; // quem joga de pretas vê suas peças embaixo
        const moves = legalMoves();
        const movable = new Set(moves.map((m) => m.from));
        if (selected !== null && !movable.has(selected)) clearSelection();
        // Se só uma peça pode jogar (ex.: captura obrigatória), já deixa selecionada.
        if (selected === null && movable.size === 1) selected = [...movable][0];

        const cands = candidates(moves);
        const targets = new Set(cands.map((m) => m.path[partial.length]));
        const capturedSoFar = new Set(cands.length ? cands[0].captures.slice(0, partial.length) : []);
        const hopPosition = partial.length ? partial[partial.length - 1] : null;

        const last = state.lastMove;
        const lastSquares = new Set(last ? [last.from, ...last.path] : []);

        board.classList.toggle('interactive', !!ctx.interactive);
        let html = '';
        for (let dr = 0; dr < SIZE; dr++) {
          for (let dc = 0; dc < SIZE; dc++) {
            const r = flip ? SIZE - 1 - dr : dr;
            const c = flip ? SIZE - 1 - dc : dc;
            const index = r * SIZE + c;
            const dark = (r + c) % 2 === 1;
            let value = state.board[index];
            // Durante uma captura múltipla, mostra a peça no ponto atual do caminho.
            if (hopPosition !== null) {
              if (index === selected) value = 0;
              if (index === hopPosition) value = state.board[selected];
            }
            const classes = ['ck-square', dark ? 'dark' : 'light'];
            if (lastSquares.has(index)) classes.push('last');
            if (movable.has(index) && hopPosition === null) classes.push('movable');
            if (index === selected && hopPosition === null) classes.push('selected');
            if (index === hopPosition) classes.push('selected');
            if (targets.has(index)) classes.push('target');
            if (capturedSoFar.has(index)) classes.push('captured');
            html += `<div class="${classes.join(' ')}" data-index="${index}">${pieceHtml(value)}</div>`;
          }
        }
        board.innerHTML = html;
      }

      return {
        reset() {
          clearSelection();
        },
        render(state, ctx) {
          if (!current || current.state !== state) clearSelection();
          current = { state, ctx };
          draw();
        },
        destroy() {},
      };
    },
  };
})();
