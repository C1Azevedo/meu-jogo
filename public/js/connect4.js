/* Interface do Ligue 4. A lógica fica em /games/connect4.js. */
(function () {
  'use strict';
  const UI = (window.UI = window.UI || { views: {} });
  const { rows: ROWS, cols: COLS } = window.Games.connect4;

  function discSvg(seat, extraClass) {
    return `<svg class="${extraClass || ''}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" class="c4-fill-${seat}"/></svg>`;
  }

  UI.views.connect4 = {
    // Ilustração original do cartão na tela inicial
    icon:
      '<svg class="icon" viewBox="0 0 160 120" aria-hidden="true"><rect x="24" y="14" width="112" height="94" rx="12" fill="var(--c4-board)" stroke="var(--c4-board-edge)" stroke-width="3"/><circle cx="37.5" cy="27" r="6.5" fill="var(--c4-hole)"/><circle cx="54.5" cy="27" r="6.5" fill="var(--c4-hole)"/><circle cx="71.5" cy="27" r="6.5" fill="var(--c4-hole)"/><circle cx="88.5" cy="27" r="6.5" fill="var(--c4-hole)"/><circle cx="105.5" cy="27" r="6.5" fill="var(--c4-hole)"/><circle cx="122.5" cy="27" r="6.5" fill="var(--c4-hole)"/><circle cx="37.5" cy="44" r="6.5" fill="var(--c4-hole)"/><circle cx="54.5" cy="44" r="6.5" fill="var(--c4-hole)"/><circle cx="71.5" cy="44" r="6.5" fill="var(--c4-hole)"/><circle cx="88.5" cy="44" r="6.5" fill="var(--c4-hole)"/><circle cx="105.5" cy="44" r="6.5" fill="var(--c4-red)" stroke="var(--white)" stroke-width="2"/><circle cx="122.5" cy="44" r="6.5" fill="var(--c4-hole)"/><circle cx="37.5" cy="61" r="6.5" fill="var(--c4-hole)"/><circle cx="54.5" cy="61" r="6.5" fill="var(--c4-hole)"/><circle cx="71.5" cy="61" r="6.5" fill="var(--c4-hole)"/><circle cx="88.5" cy="61" r="6.5" fill="var(--c4-red)" stroke="var(--white)" stroke-width="2"/><circle cx="105.5" cy="61" r="6.5" fill="var(--c4-yellow)"/><circle cx="122.5" cy="61" r="6.5" fill="var(--c4-hole)"/><circle cx="37.5" cy="78" r="6.5" fill="var(--c4-hole)"/><circle cx="54.5" cy="78" r="6.5" fill="var(--c4-yellow)"/><circle cx="71.5" cy="78" r="6.5" fill="var(--c4-red)" stroke="var(--white)" stroke-width="2"/><circle cx="88.5" cy="78" r="6.5" fill="var(--c4-yellow)"/><circle cx="105.5" cy="78" r="6.5" fill="var(--c4-yellow)"/><circle cx="122.5" cy="78" r="6.5" fill="var(--c4-hole)"/><circle cx="37.5" cy="95" r="6.5" fill="var(--c4-yellow)"/><circle cx="54.5" cy="95" r="6.5" fill="var(--c4-red)" stroke="var(--white)" stroke-width="2"/><circle cx="71.5" cy="95" r="6.5" fill="var(--c4-yellow)"/><circle cx="88.5" cy="95" r="6.5" fill="var(--c4-yellow)"/><circle cx="105.5" cy="95" r="6.5" fill="var(--c4-red)"/><circle cx="122.5" cy="95" r="6.5" fill="var(--c4-hole)"/><circle cx="122" cy="8" r="6.5" fill="var(--c4-red)"/></svg>',
    description: 'Solte as peças e alinhe 4 em qualquer direção.',

    badge(seat) {
      return discSvg(seat, 'badge');
    },

    create(container, { onMove }) {
      container.innerHTML = '';
      const board = document.createElement('div');
      board.className = 'c4-board';
      const columns = [];
      const cells = []; // cells[index] = elemento da casa
      for (let c = 0; c < COLS; c++) {
        const col = document.createElement('button');
        col.type = 'button';
        col.className = 'c4-col';
        col.dataset.col = c;
        col.setAttribute('aria-label', `Coluna ${c + 1}`);
        for (let r = 0; r < ROWS; r++) {
          const cell = document.createElement('div');
          cell.className = 'c4-cell';
          col.appendChild(cell);
          cells[r * COLS + c] = cell;
        }
        board.appendChild(col);
        columns.push(col);
      }
      container.appendChild(board);

      board.addEventListener('click', (e) => {
        const col = e.target.closest('.c4-col');
        if (col && !col.disabled) onMove(Number(col.dataset.col));
      });

      let animatedMove = null;

      return {
        reset() {
          animatedMove = null;
        },
        render(state, { interactive, seat }) {
          board.classList.toggle('interactive', interactive);
          board.dataset.me = seat;
          const winSet = new Set(state.winLine || []);
          for (let c = 0; c < COLS; c++) {
            columns[c].disabled = !interactive || state.board[c] !== null;
            let landing = -1;
            for (let r = ROWS - 1; r >= 0; r--) {
              if (state.board[r * COLS + c] === null) { landing = r; break; }
            }
            for (let r = 0; r < ROWS; r++) {
              const index = r * COLS + c;
              const cell = cells[index];
              const value = state.board[index];
              if (cell._value !== value) {
                cell.innerHTML = value === null ? '' : discSvg(value, 'c4-disc');
                cell._value = value;
              }
              cell.classList.toggle('win', winSet.has(index));
              cell.classList.toggle('next', r === landing);
              // Anima só a peça que acabou de cair.
              if (index === state.lastMove && animatedMove !== state.lastMove && value !== null) {
                const disc = cell.firstElementChild;
                disc.style.setProperty('--drop', r + 1);
                disc.classList.add('drop');
                animatedMove = state.lastMove;
              }
            }
          }
          if (state.lastMove === null) animatedMove = null;
        },
        destroy() {},
      };
    },
  };
})();
