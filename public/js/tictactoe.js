/* Interface do Jogo da Velha. A lógica fica em /games/tictactoe.js. */
(function () {
  'use strict';
  const UI = (window.UI = window.UI || { views: {} });

  const X_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="mark-x" d="M24 24 L76 76 M76 24 L24 76"/></svg>';
  const O_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="mark-o" cx="50" cy="50" r="28"/></svg>';

  UI.views.tictactoe = {
    icon:
      '<svg class="icon" viewBox="0 0 100 100" aria-hidden="true">' +
      '<path d="M37 12v76M63 12v76M12 37h76M12 63h76" stroke="currentColor" stroke-opacity=".25" stroke-width="5" stroke-linecap="round"/>' +
      '<path class="mark-x" style="stroke-width:7" d="M16 16l14 14M30 16L16 30"/>' +
      '<circle class="mark-o" style="stroke-width:6" cx="50" cy="50" r="8"/>' +
      '<path class="mark-x" style="stroke-width:7" d="M70 70l14 14M84 70L70 84"/></svg>',
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
