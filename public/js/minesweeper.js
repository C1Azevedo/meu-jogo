/* Interface do Campo Minado. A lógica fica em /games/minesweeper.js.
 *
 * - Toque/clique abre a casa.
 * - Bandeira: clique direito, toque longo (celular) ou o botão "🚩" para
 *   alternar o modo do toque. As bandeiras são só visuais e ficam neste
 *   aparelho (no modo contra, cada jogador tem as suas).
 * - A interface recebe apenas o estado público: as minas só aparecem no fim.
 */
(function () {
  'use strict';
  const UI = (window.UI = window.UI || { views: {} });
  const LONG_PRESS_MS = 420;

  function formatClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  UI.views.minesweeper = {
    // Ilustração original do cartão na tela inicial
    icon:
      '<svg class="icon" viewBox="0 0 160 120" aria-hidden="true"><rect x="30" y="12" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="51" y="12" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="72" y="12" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="93" y="12" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="114" y="12" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="30" y="33" width="19" height="19" rx="3" fill="var(--ms-open)"/><text x="39.5" y="47.5" font-size="13" font-weight="800" text-anchor="middle" fill="var(--ms-n1)" font-family="Inter, system-ui, sans-serif">1</text><rect x="51" y="33" width="19" height="19" rx="3" fill="var(--ms-open)"/><text x="60.5" y="47.5" font-size="13" font-weight="800" text-anchor="middle" fill="var(--ms-n2)" font-family="Inter, system-ui, sans-serif">2</text><rect x="72" y="33" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="93" y="33" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="114" y="33" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="30" y="54" width="19" height="19" rx="3" fill="var(--ms-open)"/><text x="39.5" y="68.5" font-size="13" font-weight="800" text-anchor="middle" fill="var(--ms-n1)" font-family="Inter, system-ui, sans-serif">1</text><rect x="51" y="54" width="19" height="19" rx="3" fill="var(--ms-open)"/><text x="60.5" y="68.5" font-size="13" font-weight="800" text-anchor="middle" fill="var(--ms-n1)" font-family="Inter, system-ui, sans-serif">1</text><rect x="72" y="54" width="19" height="19" rx="3" fill="var(--ms-open)"/><text x="81.5" y="68.5" font-size="13" font-weight="800" text-anchor="middle" fill="var(--ms-n3)" font-family="Inter, system-ui, sans-serif">3</text><rect x="93" y="54" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="114" y="54" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="30" y="75" width="19" height="19" rx="3" fill="var(--ms-open)"/><rect x="51" y="75" width="19" height="19" rx="3" fill="var(--ms-open)"/><rect x="72" y="75" width="19" height="19" rx="3" fill="var(--ms-open)"/><text x="81.5" y="89.5" font-size="13" font-weight="800" text-anchor="middle" fill="var(--ms-n1)" font-family="Inter, system-ui, sans-serif">1</text><rect x="93" y="75" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><rect x="114" y="75" width="19" height="19" rx="3" fill="var(--ms-hidden)" stroke="var(--ms-hidden-edge)" stroke-width="1"/><path d="M118 20v15" stroke="var(--white)" stroke-width="2"/><path d="M118 20l10 4-10 4z" fill="var(--neon-pink)"/><path d="M115 94 L130.0 94.0" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><path d="M115 94 L125.6 104.6" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><path d="M115 94 L115.0 109.0" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><path d="M115 94 L104.4 104.6" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><path d="M115 94 L100.0 94.0" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><path d="M115 94 L104.4 83.4" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><path d="M115 94 L115.0 79.0" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><path d="M115 94 L125.6 83.4" stroke="var(--orange)" stroke-width="3" stroke-linecap="round"/><circle cx="115" cy="94" r="10" fill="var(--purple-ink)" stroke="var(--orange)" stroke-width="2.5"/><circle cx="111" cy="90" r="2.5" fill="var(--gold)"/></svg>',
    description: 'Abra o campo sem pisar nas minas. Solo, contra a CPU ou online.',

    badge(seat) {
      return `<svg class="badge" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" class="ms-badge-${seat}"/></svg>`;
    },

    create(container, { onMove }) {
      container.innerHTML = `
        <div class="ms-wrap">
          <div class="ms-bar">
            <span class="ms-stat" title="Minas restantes">💣 <strong class="ms-mines">0</strong></span>
            <span class="ms-stat" title="Tempo">⏱ <strong class="ms-time">0:00</strong></span>
            <span class="ms-stat ms-versus" hidden></span>
            <button type="button" class="btn ms-flag-toggle" aria-pressed="false" title="Alternar entre abrir e marcar bandeira">⛏️ Abrir</button>
          </div>
          <div class="ms-scroll"><div class="ms-grid" role="grid"></div></div>
          <p class="ms-help muted small">Bandeira: clique direito ou toque longo.</p>
        </div>`;
      const grid = container.querySelector('.ms-grid');
      const minesEl = container.querySelector('.ms-mines');
      const timeEl = container.querySelector('.ms-time');
      const versusEl = container.querySelector('.ms-versus');
      const flagToggle = container.querySelector('.ms-flag-toggle');

      let flags = new Set();
      let flagMode = false;
      let current = null; // { state, ctx }
      let cells = [];
      let builtFor = null; // "colsxrows" do tabuleiro montado
      let localStart = null; // início do cronômetro neste aparelho
      let timer = null;
      let longPressTimer = null;
      let longPressFired = 0; // horário do último toque longo (para ignorar o clique seguinte)

      function build(state) {
        grid.innerHTML = '';
        grid.style.setProperty('--cols', state.cols);
        cells = [];
        for (let i = 0; i < state.cells.length; i++) {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'ms-cell';
          cell.dataset.index = i;
          grid.appendChild(cell);
          cells.push(cell);
        }
        builtFor = `${state.cols}x${state.rows}`;
      }

      function canFlag(index) {
        return current && current.state.winner === null && !current.ctx.ended && current.state.cells[index] === -1;
      }

      function toggleFlag(index) {
        if (!canFlag(index)) return;
        if (flags.has(index)) flags.delete(index);
        else flags.add(index);
        draw();
      }

      function open(index) {
        if (!current || !current.ctx.interactive || flags.has(index)) return;
        if (current.state.cells[index] !== -1) return;
        onMove(index);
      }

      grid.addEventListener('click', (e) => {
        const cell = e.target.closest('.ms-cell');
        if (!cell) return;
        if (Date.now() - longPressFired < 600) return; // o toque longo já marcou a bandeira
        const index = Number(cell.dataset.index);
        if (flagMode) toggleFlag(index);
        else open(index);
      });

      grid.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest('.ms-cell');
        if (!cell) return;
        e.preventDefault();
        if (Date.now() - longPressFired < 600) return; // Android dispara contextmenu no toque longo
        toggleFlag(Number(cell.dataset.index));
      });

      // Toque longo no celular = bandeira
      let pressStart = null;
      grid.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        const cell = e.target.closest('.ms-cell');
        if (!cell) return;
        pressStart = { x: e.clientX, y: e.clientY };
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          longPressFired = Date.now();
          toggleFlag(Number(cell.dataset.index));
          if (navigator.vibrate) navigator.vibrate(20);
        }, LONG_PRESS_MS);
      });
      const cancelPress = () => clearTimeout(longPressTimer);
      grid.addEventListener('pointerup', cancelPress);
      grid.addEventListener('pointercancel', cancelPress);
      grid.addEventListener('pointerleave', cancelPress);
      grid.addEventListener('pointermove', (e) => {
        if (pressStart && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) cancelPress();
      });

      flagToggle.addEventListener('click', () => {
        flagMode = !flagMode;
        flagToggle.setAttribute('aria-pressed', String(flagMode));
        flagToggle.textContent = flagMode ? '🚩 Bandeira' : '⛏️ Abrir';
      });

      function tick() {
        if (!current) return;
        const { state } = current;
        if (state.winner !== null && state.startedAt && state.endedAt) {
          timeEl.textContent = formatClock(state.endedAt - state.startedAt);
        } else if (localStart !== null && !current.ctx.ended) {
          timeEl.textContent = formatClock(Date.now() - localStart);
        } else if (localStart === null) {
          timeEl.textContent = '0:00';
        }
      }

      function draw() {
        const { state, ctx } = current;
        if (builtFor !== `${state.cols}x${state.rows}`) build(state);

        const over = state.winner !== null;
        const mineSet = new Set(state.mineMap || []);
        grid.classList.toggle('interactive', !!ctx.interactive);
        grid.classList.toggle('versus', !ctx.solo);

        for (let i = 0; i < cells.length; i++) {
          const cell = cells[i];
          const v = state.cells[i];
          let cls = 'ms-cell';
          let html = '';
          let label;
          if (v >= 0) {
            cls += ` open n${v}`;
            if (!ctx.solo && state.owner[i] !== null) cls += ` own${state.owner[i]}`;
            html = v > 0 ? String(v) : '';
            label = v > 0 ? `${v} minas ao redor` : 'vazia';
          } else if (over && mineSet.has(i)) {
            cls += i === state.exploded ? ' mine exploded' : flags.has(i) ? ' flag found' : ' mine';
            html = flags.has(i) && i !== state.exploded ? '🚩' : '💣';
            label = 'mina';
          } else if (flags.has(i)) {
            cls += over ? ' flag wrong' : ' flag';
            html = '🚩';
            label = 'bandeira';
          } else {
            cls += ' hidden';
            label = 'fechada';
          }
          if (i === state.lastMove) cls += ' last';
          if (cell.className !== cls) cell.className = cls;
          if (cell.innerHTML !== html) cell.innerHTML = html;
          cell.setAttribute('aria-label', label);
        }

        // Barra de informações
        let flagCount = 0;
        flags.forEach((i) => { if (state.cells[i] === -1) flagCount++; });
        minesEl.textContent = state.mineCount - flagCount;
        versusEl.hidden = !!ctx.solo;
        if (!ctx.solo) {
          versusEl.innerHTML =
            `${UI.views.minesweeper.badge(ctx.seat)} Você <strong>${state.opened[ctx.seat]}</strong>` +
            ` · ${UI.views.minesweeper.badge(1 - ctx.seat)} ${ctx.oppName} <strong>${state.opened[1 - ctx.seat]}</strong>`;
        }
        flagToggle.disabled = over || !!ctx.ended;

        // Cronômetro: começa na primeira casa aberta e para no fim.
        if (state.moveCount > 0 && localStart === null) localStart = Date.now();
        clearInterval(timer);
        timer = null;
        if (state.moveCount > 0 && !over && !ctx.ended) timer = setInterval(tick, 500);
        tick();
      }

      return {
        reset() {
          flags = new Set();
          localStart = null;
        },
        render(state, ctx) {
          if (state.moveCount === 0) {
            // Nova partida: limpa bandeiras e cronômetro.
            flags = new Set();
            localStart = null;
          }
          current = { state, ctx };
          draw();
        },
        destroy() {
          clearInterval(timer);
          clearTimeout(longPressTimer);
        },
      };
    },
  };
})();
