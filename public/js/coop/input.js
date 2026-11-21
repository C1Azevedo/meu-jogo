/**
 * Dupla Tropical — controles.
 *  - Computador: setas ou WASD para andar; espaço, W ou seta para cima para pular.
 *  - Celular: botões na tela, com multitoque (cada dedo é rastreado pelo pointerId,
 *    e dá para deslizar o polegar de "esquerda" para "direita" sem soltar).
 */
(function () {
  'use strict';
  const keys = new Set();
  const touches = new Map(); // pointerId -> 'left' | 'right' | 'jump'
  let enabled = false;
  let pad = null;

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyK: 'jump',
  };

  window.addEventListener('keydown', (e) => {
    if (!enabled) return;
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault(); // não rola a página com espaço/setas
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  });
  // Ao trocar de aba ou perder o foco, solta tudo (evita "andar sozinho")
  window.addEventListener('blur', () => { keys.clear(); touches.clear(); refresh(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); touches.clear(); refresh(); } });

  function keyAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest && el.closest('[data-key]');
    return btn && pad && pad.contains(btn) ? btn.dataset.key : null;
  }

  function refresh() {
    if (!pad) return;
    const active = new Set(touches.values());
    pad.querySelectorAll('[data-key]').forEach((b) => b.classList.toggle('pressed', active.has(b.dataset.key)));
  }

  function attach(container) {
    pad = container;
    const down = (e) => {
      const k = keyAt(e.clientX, e.clientY);
      if (!k) return;
      e.preventDefault();
      touches.set(e.pointerId, k);
      if (navigator.vibrate && k === 'jump') navigator.vibrate(8);
      refresh();
    };
    const move = (e) => {
      if (!touches.has(e.pointerId)) return;
      const k = keyAt(e.clientX, e.clientY);
      // Deslizar entre os botões de direção troca a direção; fora dos botões, mantém
      if (k && k !== touches.get(e.pointerId) && k !== 'jump' && touches.get(e.pointerId) !== 'jump') {
        touches.set(e.pointerId, k);
        refresh();
      }
    };
    const up = (e) => {
      if (touches.delete(e.pointerId)) refresh();
    };
    container.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    container.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  window.CoopInput = {
    attach,
    setEnabled(v) {
      enabled = v;
      if (!v) { keys.clear(); touches.clear(); refresh(); }
    },
    read() {
      const t = new Set(touches.values());
      return {
        left: keys.has('left') || t.has('left'),
        right: keys.has('right') || t.has('right'),
        jump: keys.has('jump') || t.has('jump'),
      };
    },
    /** Usado pelos testes automáticos (Playwright) e pelo modo de demonstração. */
    _touches: touches,
  };
})();
