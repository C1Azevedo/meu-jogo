/* Interface do Xadrez. A lógica fica em /games/chess.js.
 *
 * Toque numa peça sua para ver as casas possíveis (pontos = casa livre,
 * anel = captura) e toque no destino. Na promoção, escolha a peça.
 * Quem joga de pretas vê o tabuleiro invertido.
 */
(function () {
  'use strict';
  const UI = (window.UI = window.UI || { views: {} });
  const game = window.Games.chess;

  // Mesmo desenho (preenchido) para as duas cores; a cor vem do CSS.
  // ︎ pede a versão "texto" do símbolo (evita virar emoji no celular).
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const PIECE_NAME = { k: 'rei', q: 'dama', r: 'torre', b: 'bispo', n: 'cavalo', p: 'peão' };
  const ORDER = { q: 0, r: 1, b: 2, n: 3, p: 4 };

  function pieceHtml(p, extra) {
    const color = game.colorOf(p) === 0 ? 'w' : 'b';
    return `<span class="cs-piece ${color}${extra ? ' ' + extra : ''}">${GLYPH[game.typeOf(p)]}︎</span>`;
  }

  UI.views.chess = {
    icon:
      '<svg class="icon" viewBox="0 0 100 100" aria-hidden="true">' +
      '<rect x="8" y="8" width="84" height="84" rx="10" fill="var(--cs-light)"/>' +
      '<path d="M8 8h21v21H8zM50 8h21v21H50zM29 29h21v21H29zM71 29h21v21H71zM8 50h21v21H8zM50 50h21v21H50zM29 71h21v21H29zM71 71h21v21H71z" fill="var(--cs-dark)"/>' +
      '<text x="50" y="72" font-size="58" text-anchor="middle" fill="#fafafa" stroke="#222" stroke-width="2.5" font-family="DejaVu Sans, Segoe UI Symbol, Noto Sans Symbols 2, serif">♞︎</text>' +
      '</svg>',
    description: 'Regras completas: roque, en passant, promoção e empates.',

    badge(seat) {
      return `<svg class="badge" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" class="ck-badge-${seat}"/></svg>`;
    },

    create(container, { onMove }) {
      container.innerHTML = `
        <div class="cs-wrap">
          <div class="cs-side cs-top"></div>
          <div class="cs-holder">
            <div class="cs-board" role="grid" aria-label="Tabuleiro de xadrez"></div>
            <div class="cs-promo" hidden>
              <p>Promover para:</p>
              <div class="cs-promo-options"></div>
              <button type="button" class="btn btn-ghost cs-promo-cancel">Cancelar</button>
            </div>
          </div>
          <div class="cs-side cs-bottom"></div>
        </div>`;
      const board = container.querySelector('.cs-board');
      const top = container.querySelector('.cs-top');
      const bottom = container.querySelector('.cs-bottom');
      const promo = container.querySelector('.cs-promo');
      const promoOptions = container.querySelector('.cs-promo-options');

      let selected = null;
      let pendingPromotion = null; // jogadas de promoção aguardando a escolha da peça
      let current = null;

      function legalMoves() {
        return current && current.ctx.interactive ? game.getMoves(current.state) : [];
      }

      function clearSelection() {
        selected = null;
        pendingPromotion = null;
        promo.hidden = true;
      }

      board.addEventListener('click', (e) => {
        const square = e.target.closest('.cs-square');
        if (!square || !current || !current.ctx.interactive || pendingPromotion) return;
        const index = Number(square.dataset.index);
        const moves = legalMoves();
        const toHere = selected === null ? [] : moves.filter((m) => m.from === selected && m.to === index);

        if (toHere.length === 1) {
          clearSelection();
          onMove({ from: toHere[0].from, to: toHere[0].to });
          return;
        }
        if (toHere.length > 1) {
          // Promoção: pergunta qual peça.
          pendingPromotion = toHere;
          showPromotion();
          return;
        }
        if (moves.some((m) => m.from === index)) selected = selected === index ? null : index;
        else selected = null;
        draw();
      });

      function showPromotion() {
        const seat = current.ctx.seat;
        promoOptions.innerHTML = '';
        for (const t of ['q', 'r', 'b', 'n']) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'cs-promo-btn';
          btn.setAttribute('aria-label', PIECE_NAME[t]);
          btn.innerHTML = pieceHtml(seat === 0 ? t.toUpperCase() : t);
          btn.addEventListener('click', () => {
            const move = pendingPromotion.find((m) => m.promotion === t);
            clearSelection();
            draw();
            if (move) onMove({ from: move.from, to: move.to, promotion: t });
          });
          promoOptions.appendChild(btn);
        }
        promo.hidden = false;
      }
      container.querySelector('.cs-promo-cancel').addEventListener('click', () => {
        clearSelection();
        draw();
      });

      function sideHtml(label, seat, capturedBy, advantage, active) {
        const pieces = capturedBy
          .slice()
          .sort((x, y) => ORDER[game.typeOf(x)] - ORDER[game.typeOf(y)])
          .map((p) => pieceHtml(p, 'small'))
          .join('');
        const adv = advantage > 0 ? `<span class="cs-adv">+${Math.round(advantage / 100)}</span>` : '';
        return `<span class="cs-name${active ? ' active' : ''}">${UI.views.chess.badge(seat)} ${label}</span>` +
          `<span class="cs-captured" aria-label="Peças capturadas">${pieces}${adv}</span>`;
      }

      function draw() {
        const { state, ctx } = current;
        const seat = ctx.seat;
        const flip = seat === 1;
        const moves = legalMoves();
        const movable = new Set(moves.map((m) => m.from));
        if (selected !== null && !movable.has(selected)) selected = null;
        const targets = new Map(); // destino → é captura?
        if (selected !== null) {
          for (const m of moves) if (m.from === selected) targets.set(m.to, !!m.captured);
        }
        const last = state.lastMove;
        const checkSquare = state.check ? state.board.indexOf(state.turn === 0 ? 'K' : 'k') : -1;

        let html = '';
        for (let dr = 0; dr < 8; dr++) {
          for (let dc = 0; dc < 8; dc++) {
            const r = flip ? 7 - dr : dr;
            const c = flip ? 7 - dc : dc;
            const index = r * 8 + c;
            const p = state.board[index];
            const classes = ['cs-square', (r + c) % 2 === 1 ? 'dark' : 'light'];
            if (last && (index === last.from || index === last.to)) classes.push('last');
            if (index === selected) classes.push('selected');
            if (targets.has(index)) classes.push(targets.get(index) ? 'capture' : 'target');
            if (index === checkSquare) classes.push('check');
            if (ctx.interactive && movable.has(index)) classes.push('movable');
            let coords = '';
            if (dc === 0) coords += `<span class="cs-rank">${8 - r}</span>`;
            if (dr === 7) coords += `<span class="cs-file">${'abcdefgh'[c]}</span>`;
            const label = p ? `${game.squareName(index)}: ${PIECE_NAME[game.typeOf(p)]} ${game.colorOf(p) === 0 ? 'branco' : 'preto'}` : game.squareName(index);
            html += `<div class="${classes.join(' ')}" data-index="${index}" aria-label="${label}">${coords}${p ? pieceHtml(p) : ''}</div>`;
          }
        }
        board.innerHTML = html;
        board.classList.toggle('interactive', !!ctx.interactive);

        // Peças capturadas e diferença de material
        const material = (list) => list.reduce((sum, p) => sum + game.VALUE[game.typeOf(p)], 0);
        const mine = material(state.captured[seat]);
        const theirs = material(state.captured[1 - seat]);
        const names = game.playerNames;
        const over = state.winner !== null;
        top.innerHTML = sideHtml(`${ctx.oppName} · ${names[1 - seat]}`, 1 - seat, state.captured[1 - seat], theirs - mine, !over && state.turn !== seat);
        bottom.innerHTML = sideHtml(`Você · ${names[seat]}`, seat, state.captured[seat], mine - theirs, !over && state.turn === seat);
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
