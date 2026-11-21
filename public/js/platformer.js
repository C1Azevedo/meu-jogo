/* Dupla Tropical no hub: cartão da tela inicial e seletor de fase.
 * O jogo em si fica em js/coop/ (canvas, controles, rede e som). */
(function () {
  'use strict';
  const UI = (window.UI = window.UI || { views: {} });
  const game = window.Games.platformer;
  const levels = window.Games.platformerLevels;

  // Seletor "Fase inicial" na tela de modo (usa o mesmo componente do Campo Minado)
  game.LEVELS = {};
  levels.forEach((lv, i) => {
    game.LEVELS[String(i)] = { label: `Fase ${i + 1}`, detail: lv.name };
  });
  game.levelFieldLabel = 'Fase inicial';

  UI.views.platformer = {
    realtime: true, // jogo em tempo real: só online, com tela própria
    // Ilustração original do cartão: os dois heróis, uma moeda e uma palmeira
    icon:
      '<svg class="icon" viewBox="0 0 160 120" aria-hidden="true">' +
      '<rect x="14" y="92" width="132" height="14" rx="3" fill="#46d36b"/><rect x="14" y="98" width="132" height="10" fill="#e8b26a"/>' +
      '<rect x="98" y="66" width="40" height="8" rx="2" fill="#b97a45"/>' +
      '<path d="M128 92V40" stroke="#7d4c25" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M128 40c-12-10-26-8-32 0 10-4 22-3 32 0zm0 0c10-12 24-12 30-4-10-2-20 0-30 4zm0 0c-4-12 2-22 10-26-4 8-6 16-10 26z" fill="#2fae7a"/>' +
      // Tuca (bandana laranja, roupa turquesa)
      '<g transform="translate(44 62)"><rect x="2" y="12" width="16" height="16" rx="5" fill="#19c3c8" stroke="#2a1838" stroke-width="2"/>' +
      '<circle cx="10" cy="8" r="9" fill="#ffd2a8" stroke="#2a1838" stroke-width="2"/><path d="M1 6a9 9 0 0118 0z" fill="#ff8c42" stroke="#2a1838" stroke-width="2"/>' +
      '<circle cx="7" cy="9" r="1.6" fill="#2a1838"/><circle cx="13" cy="9" r="1.6" fill="#2a1838"/><path d="M4 28v4M16 28v4" stroke="#2a1838" stroke-width="3"/></g>' +
      // Mel (capuz cor de mel com orelhas), pulando
      '<g transform="translate(78 30)"><rect x="2" y="13" width="16" height="15" rx="5" fill="#ff5f7e" stroke="#2a1838" stroke-width="2"/>' +
      '<circle cx="3" cy="2" r="3.5" fill="#ffc23d" stroke="#2a1838" stroke-width="2"/><circle cx="17" cy="2" r="3.5" fill="#ffc23d" stroke="#2a1838" stroke-width="2"/>' +
      '<circle cx="10" cy="8" r="9" fill="#ffc23d" stroke="#2a1838" stroke-width="2"/><circle cx="10" cy="10" r="6" fill="#ffd9b8"/>' +
      '<circle cx="7.5" cy="10" r="1.5" fill="#2a1838"/><circle cx="12.5" cy="10" r="1.5" fill="#2a1838"/><path d="M0 16l-4-6M20 16l4-6" stroke="#2a1838" stroke-width="3" stroke-linecap="round"/></g>' +
      '<circle cx="66" cy="22" r="7" fill="#ffd166" stroke="#b87a00" stroke-width="2"/><rect x="65" y="18" width="2" height="8" fill="#b87a00"/>' +
      '<path d="M100 22l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#ffe14d" stroke="#b86b00" stroke-width="1.5"/></svg>',
    description: 'Plataforma cooperativa online: dois celulares, uma aventura.',
    badge(seat) {
      return `<svg class="badge" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="${seat === 0 ? '#19c3c8' : '#ff5f7e'}"/></svg>`;
    },
    // O hub não cria uma "view" de tabuleiro para jogos em tempo real
    create() {
      return { render() {}, destroy() {} };
    },
  };
})();
