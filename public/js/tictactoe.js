/* Interface do Jogo da Velha. A lógica fica em /games/tictactoe.js. */
(function () {
  'use strict';
  const UI = (window.UI = window.UI || { views: {} });

  const X_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="mark-x" d="M24 24 L76 76 M76 24 L24 76"/></svg>';
  const O_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="mark-o" cx="50" cy="50" r="28"/></svg>';

  UI.views.tictactoe = {
    // Ilustração original do cartão na tela inicial
    icon:
      '<svg class="icon" viewBox="0 0 160 120" aria-hidden="true"><path d="M64 14v92M96 14v92M34 44h92M34 76h92" stroke="var(--neon-cyan)" stroke-width="4" stroke-linecap="round"/><path d="M40 20l18 18M58 20l-18 18M71 51l18 18M89 51l-18 18M102 82l18 18M120 82l-18 18" stroke="var(--neon-pink)" stroke-width="7" stroke-linecap="round"/><circle cx="111" cy="29" r="10" fill="none" stroke="var(--neon-cyan)" stroke-width="6"/><circle cx="49" cy="60" r="10" fill="none" stroke="var(--neon-cyan)" stroke-width="6"/><path d="M40 20L120 100" stroke="var(--gold)" stroke-width="3" stroke-linecap="round" opacity=".9"/></svg>',
    description: 'Clássico 3×3: faça uma linha com 3.',

    /** Ícone pequeno da peça de cada jogador (usado na barra de status). */
    badge(seat) {
      return (seat === 0 ? X_SVG : O_SVG).replace('<svg', '<svg class="badge"');
    },

    create(container, { onMove }) {
      container.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'ttt-board';
      grid.setAttribute('role', 'grid');
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'ttt-cell';
        cell.dataset.index = i;
        grid.appendChild(cell);
        cells.push(cell);
      }
      container.appendChild(grid);

      grid.addEventListener('click', (e) => {
        const cell = e.target.closest('.ttt-cell');
        if (cell && !cell.disabled) onMove(Number(cell.dataset.index));
      });

      return {
        render(state, { interactive }) {
          const winSet = new Set(state.winLine || []);
          state.board.forEach((value, i) => {
            const cell = cells[i];
            if (cell._value !== value) {
              // Só redesenha quando muda, para a animação tocar apenas na jogada nova.
              cell.innerHTML = value === 0 ? X_SVG : value === 1 ? O_SVG : '';
              cell._value = value;
            }
            cell.disabled = !interactive || value !== null;
            cell.classList.toggle('win', winSet.has(i));
            cell.classList.toggle('last', state.lastMove === i);
            const row = Math.floor(i / 3) + 1;
            const col = (i % 3) + 1;
            const label = value === 0 ? 'X' : value === 1 ? 'O' : 'vazia';
            cell.setAttribute('aria-label', `Linha ${row}, coluna ${col}: ${label}`);
          });
        },
        destroy() {},
      };
    },
  };
})();
