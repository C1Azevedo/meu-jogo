/**
 * Dupla Tropical — gráficos em pixel art, todos desenhados em código.
 * Personagens e mundo originais. Cada sprite é uma matriz de caracteres
 * com uma paleta; vira um <canvas> uma única vez e depois só é copiado.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Pixel art
  // ---------------------------------------------------------------------------

  const OUTLINE = '#2a1838';

  // Tuca: bandana laranja, camiseta turquesa, mochila
  const TUCA = { K: OUTLINE, A: '#ff8c42', a: '#d9622b', S: '#ffd2a8', W: '#ffffff', E: '#2a1838', B: '#19c3c8', b: '#0f8f99', P: '#5a3a8a', M: '#b8541c' };
  // Mel: capuz cor de mel com orelhinhas, roupa coral
  const MEL = { K: OUTLINE, A: '#ffc23d', a: '#e09a12', S: '#ffd9b8', W: '#ffffff', E: '#2a1838', B: '#ff5f7e', b: '#d63c5c', P: '#7a2b4a', M: '#b8541c' };

  const HEAD = {
    tuca: [
      '...KKKKKK...',
      '..KAAAAAAKK.',
      '.KAAAAAAAAaK',
      '.KSSSSSSSSKa',
      '.KSWESSWESK.',
      '.KSSSSSSSSK.',
      '..KSSMMSSK..',
    ],
    mel: [
      '.KK......KK.',
      'KaAK....KAaK',
      'KAAAAAAAAAAK',
      'KASSSSSSSSAK',
      'KASWESSWESAK',
      '.KSSSSSSSSK.',
      '..KSSMMSSK..',
    ],
  };
  const BODY = {
    idle: [
      '..KBBBBBBK..',
      '.KBBBBBBBBK.',
      '.KSBBBBBBSK.',
      '..KbBBBBbK..',
      '..KbbKKbbK..',
      '..KbK..KbK..',
      '..KKK..KKK..',
    ],
    walk1: [
      '..KBBBBBBK..',
      '.KBBBBBBBBKS',
      'SKBBBBBBBBK.',
      '..KbBBBBbK..',
      '..KbbKKbbK..',
      '.KbK....KbK.',
      '.KKK....KKK.',
    ],
    walk2: [
      '..KBBBBBBK..',
      '.KBBBBBBBBK.',
      '.KSBBBBBBSK.',
      '..KbBBBBbK..',
      '...KbbbbK...',
      '...KbKKbK...',
      '...KKKKKK...',
    ],
    jump: [
      'SKBBBBBBBBKS',
      '.KBBBBBBBBK.',
      '..KBBBBBBK..',
      '..KbBBBBbK..',
      '..KbbKKbbK..',
      '.KbbK..Kbb..',
      '.KKK....KK..',
    ],
  };

  const CRAB = { K: OUTLINE, R: '#ff5a3c', r: '#c93a24', W: '#ffffff', E: OUTLINE, Y: '#ffe08a' };
  const CRAB_FRAMES = [
    [
      '..W........W..',
      '.KEK......KEK.',
      'KRRK.KKKK.KRRK',
      'KRRKKRRRRKKRRK',
      '.KKRRRRRRRRKK.',
      '..KRRYRRYRRK..',
      '..KRRRRRRRRK..',
      '...KrrrrrrK...',
      '..KrK.KK.KrK..',
      '.KK........KK.',
    ],
    [
      '..W........W..',
      '.KEK......KEK.',
      '.KRRK.KKKK.KRRK',
      'KRRKKRRRRKKRRK',
      '.KKRRRRRRRRKK.',
      '..KRRYRRYRRK..',
      '..KRRRRRRRRK..',
      '...KrrrrrrK...',
      '...KrKKKKrK...',
      '...KK....KK...',
    ].map((r) => r.slice(0, 14)),
  ];
  const JELLY = { K: '#7a2b6e', P: '#ff9ad5', p: '#ff6fbf', W: '#ffffff', E: OUTLINE };
  const JELLY_FRAMES = [
    [
      '...KKKKKK...',
      '..KPPPPPPK..',
      '.KPPWPPPPPK.',
      '.KPPPPPPPPK.',
      '.KPEPPPPEPK.',
      'KPPPPPPPPPPK',
      'KppppppppppK',
      '.KKKKKKKKKK.',
      '.p.p..p.p.p.',
      'p.p..p.p..p.',
      '.p..p...p.p.',
      'p....p.p....',
    ],
    [
      '...KKKKKK...',
      '..KPPPPPPK..',
      '.KPPWPPPPPK.',
      '.KPPPPPPPPK.',
      '.KPEPPPPEPK.',
      'KPPPPPPPPPPK',
      'KppppppppppK',
      '.KKKKKKKKKK.',
      'p.p.p..p.p..',
      '.p.p..p..p.p',
      'p..p.p..p...',
      '..p....p..p.',
    ],
  ];
  const COIN = { K: '#b87a00', Y: '#ffd166', y: '#ffb627', W: '#fff7d6' };
  // Moeda: disco dourado com brilho; os quadros simulam o giro
  const COIN_FRAMES = [
    ['...KKKK...', '.KKYYYYKK.', '.KYWWYYyK.', 'KYWYYYYYyK', 'KYWYYYYYyK', 'KYYYYYYYyK', 'KYYYYYYyyK', '.KYYYYyyK.', '.KKyyyyKK.', '...KKKK...'],
    ['...KKKK...', '..KYYYyK..', '..KWYYyK..', '..KWYYyK..', '..KWYYyK..', '..KYYYyK..', '..KYYYyK..', '..KYYyyK..', '..KyyyyK..', '...KKKK...'],
    ['....KK....', '....KK....', '...KYyK...', '...KWyK...', '...KWyK...', '...KYyK...', '...KYyK...', '...KyyK...', '....KK....', '....KK....'],
    ['...KKKK...', '..KyYYYK..', '..KyYYWK..', '..KyYYWK..', '..KyYYWK..', '..KyYYYK..', '..KyYYYK..', '..KyyYYK..', '..KyyyyK..', '...KKKK...'],
  ];
  const STAR = { K: '#b86b00', Y: '#ffe14d', y: '#ffb627', W: '#ffffff', G: '#5fd35f' };
  const STAR_FRAME = [
    '.....GG.....',
    '.....KK.....',
    '....KYYK....',
    'KKKKYYYYKKKK',
    'KYYYYWYYYYYK',
    '.KYYWYYYYyK.',
    '..KYYYYYyK..',
    '..KYYYYYyK..',
    '.KYYyKKyYyK.',
    '.KyyK..KyyK.',
    'KyK......KyK',
    'KK........KK',
  ];
  const CROWN = { K: '#8a5a00', Y: '#ffd166', R: '#ff3b6b' };
  const CROWN_FRAME = ['K..K..K..K', 'KYKYKYKYYK', 'KYYYRYYYYK', 'KKKKKKKKKK'];

  const cache = new Map();
  /** Converte matriz + paleta num canvas (com versão espelhada). */
  function sprite(key, rows, palette) {
    if (cache.has(key)) return cache.get(key);
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const make = (flip) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const col = palette[row[x]];
          if (!col) continue;
          g.fillStyle = col;
          g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
        }
      });
      return c;
    };
    const s = { right: make(false), left: make(true), w, h };
    cache.set(key, s);
    return s;
  }

  function hero(id, frame) {
    const name = id === 0 ? 'tuca' : 'mel';
    const body = BODY[frame] || BODY.idle;
    return sprite(`hero-${name}-${frame}`, HEAD[name].concat(body), id === 0 ? TUCA : MEL);
  }

  // ---------------------------------------------------------------------------
  // Temas (cores do cenário e dos blocos)
  // ---------------------------------------------------------------------------

  const THEMES = {
    praia: { pit: ['#2f8fd8', '#0f4c8a'], sky: ['#5ec8ff', '#a8e6ff', '#ffe3b3'], far: '#7fb7e0', mid: '#2fae7a', grass: '#46d36b', grassHi: '#9cf07a', dirt: '#e8b26a', dirtDark: '#c98a43', brick: '#ff9a5c', brickDark: '#d9622b', sun: '#fff1a8', props: 'palms' },
    bosque: { pit: ['#1d4a3a', '#0d241c'], sky: ['#7fd6ff', '#c7f0ff', '#e9ffd6'], far: '#6bb08c', mid: '#2f8f5a', grass: '#3fc25e', grassHi: '#a6ee6c', dirt: '#9a6a43', dirtDark: '#734a2c', brick: '#b98552', brickDark: '#8a5a32', sun: '#fff7c2', props: 'trees' },
    caverna: { pit: ['#1a1030', '#07040f'], sky: ['#2b1d4a', '#45306e', '#6b4a8e'], far: '#3d2a63', mid: '#5a3f86', grass: '#a585ff', grassHi: '#d8c8ff', dirt: '#5b4a7a', dirtDark: '#3e3158', brick: '#7c63b8', brickDark: '#56428a', sun: null, props: 'crystals' },
    nuvens: { pit: ['#ffffff', '#ffc6e2'], sky: ['#ffb6d9', '#ffd6ec', '#fff3c4'], far: '#ffffff', mid: '#ffe1f0', grass: '#ffffff', grassHi: '#ffffff', dirt: '#e9e3ff', dirtDark: '#c9bff0', brick: '#ffd166', brickDark: '#e0a83a', sun: '#fffbe0', props: 'clouds' },
    vulcao: { pit: ['#ff7a2f', '#c2241c'], sky: ['#3b0f2e', '#8a1f3a', '#ff7a45'], far: '#5a1830', mid: '#3a1022', grass: '#ff7a45', grassHi: '#ffc04d', dirt: '#4a2a35', dirtDark: '#2e1a22', brick: '#7a3a3a', brickDark: '#4e2222', sun: '#ffcf6b', props: 'rocks' },
  };

  // ---------------------------------------------------------------------------
  // Terreno: a fase inteira é desenhada uma vez num canvas
  // ---------------------------------------------------------------------------

  function renderLevel(level, themeName) {
    const T = 16;
    const th = THEMES[themeName] || THEMES.praia;
    const c = document.createElement('canvas');
    c.width = level.w * T;
    c.height = level.h * T;
    const g = c.getContext('2d');
    const at = (tx, ty) => (ty < 0 || ty >= level.h || tx < 0 || tx >= level.w ? '.' : level.grid[ty][tx]);
    const solidish = (ch) => ch === '#' || ch === '=';
    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        const ch = level.grid[ty][tx];
        const x = tx * T;
        const y = ty * T;
        if (ch === '#') {
          g.fillStyle = th.dirt;
          g.fillRect(x, y, T, T);
          g.fillStyle = th.dirtDark;
          // pedrinhas determinísticas (sem aleatoriedade: mesma fase, mesmo desenho)
          const k = (tx * 7 + ty * 13) % 5;
          g.fillRect(x + 3 + k, y + 5 + (k % 3) * 2, 2, 2);
          g.fillRect(x + 10 - k, y + 11 - (k % 2) * 3, 2, 1);
          if (!solidish(at(tx, ty - 1))) {
            g.fillStyle = th.grass;
            g.fillRect(x, y, T, 5);
            g.fillStyle = th.grassHi;
            g.fillRect(x, y, T, 1);
            g.fillRect(x + ((tx * 5) % 12), y + 5, 2, 2);
            g.fillStyle = th.grass;
            g.fillRect(x + ((tx * 3) % 13), y + 5, 3, 2);
          }
        } else if (ch === '=') {
          g.fillStyle = th.brick;
          g.fillRect(x, y, T, T);
          g.fillStyle = th.brickDark;
          g.fillRect(x, y + 7, T, 1);
          g.fillRect(x, y + 15, T, 1);
          g.fillRect(x + 7, y, 1, 7);
          g.fillRect(x + 3, y + 8, 1, 7);
          g.fillRect(x + 12, y + 8, 1, 7);
          g.fillStyle = 'rgba(255,255,255,.25)';
          g.fillRect(x, y, T, 1);
        } else if (ch === '-') {
          g.fillStyle = '#b97a45';
          g.fillRect(x, y, T, 5);
          g.fillStyle = '#7d4c25';
          g.fillRect(x, y + 4, T, 1);
          g.fillRect(x + 2, y + 5, 2, 3);
          g.fillRect(x + 12, y + 5, 2, 3);
          g.fillStyle = '#e0a56b';
          g.fillRect(x, y, T, 1);
        } else if (ch === 'x') {
          g.fillStyle = '#d9dbe8';
          for (let i = 0; i < 4; i++) {
            g.beginPath();
            g.moveTo(x + i * 4, y + T);
            g.lineTo(x + i * 4 + 2, y + 8);
            g.lineTo(x + i * 4 + 4, y + T);
            g.fill();
          }
          g.fillStyle = '#8b8fa8';
          g.fillRect(x, y + T - 2, T, 2);
        }
      }
    }
    return c;
  }

  // ---------------------------------------------------------------------------
  // Fundo com parallax (camadas que se repetem na horizontal)
  // ---------------------------------------------------------------------------

  function hash(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  function makeLayer(themeName, kind) {
    const th = THEMES[themeName] || THEMES.praia;
    const W = 512;
    const H = 240;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (kind === 'far') {
      g.fillStyle = th.far;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) {
        const y = 120 + Math.sin((x / W) * Math.PI * 4) * 18 + Math.sin((x / W) * Math.PI * 10) * 6;
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.fill();
    } else if (kind === 'mid') {
      g.fillStyle = th.mid;
      if (th.props === 'palms' || th.props === 'trees') {
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) g.lineTo(x, 175 + Math.sin(x / 40) * 10);
        g.lineTo(W, H);
        g.fill();
        for (let i = 0; i < 5; i++) {
          const px = 40 + i * 100 + hash(i) * 30;
          if (th.props === 'palms') {
            g.fillRect(px, 120, 4, 60);
            for (let a = 0; a < 5; a++) {
              g.beginPath();
              const ang = -Math.PI + (a / 4) * Math.PI;
              g.ellipse(px + 2 + Math.cos(ang) * 14, 118 + Math.sin(ang) * 6 + 4, 16, 4, ang / 2, 0, Math.PI * 2);
              g.fill();
            }
          } else {
            g.fillRect(px, 130, 5, 50);
            g.beginPath();
            g.arc(px + 2, 125, 20, 0, Math.PI * 2);
            g.arc(px - 12, 135, 14, 0, Math.PI * 2);
            g.arc(px + 16, 135, 14, 0, Math.PI * 2);
            g.fill();
          }
        }
      } else if (th.props === 'crystals') {
        for (let i = 0; i < 9; i++) {
          const px = i * 60 + hash(i) * 20;
          const h = 30 + hash(i + 9) * 50;
          g.beginPath();
          g.moveTo(px, H);
          g.lineTo(px + 10, H - h);
          g.lineTo(px + 20, H);
          g.fill();
        }
        g.fillStyle = 'rgba(200,170,255,.35)';
        for (let i = 0; i < 12; i++) g.fillRect(hash(i + 3) * W, hash(i + 7) * 110, 2, 2);
      } else if (th.props === 'clouds') {
        g.fillStyle = th.mid;
        for (let i = 0; i < 6; i++) {
          const px = i * 90 + hash(i) * 40;
          const py = 150 + hash(i + 4) * 50;
          g.beginPath();
          g.arc(px, py, 24, 0, Math.PI * 2);
          g.arc(px + 26, py - 8, 30, 0, Math.PI * 2);
          g.arc(px + 54, py, 22, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 12) g.lineTo(x, 180 + hash(x) * 25);
        g.lineTo(W, H);
        g.fill();
      }
    } else if (kind === 'clouds') {
      g.fillStyle = th.props === 'caverna' || th.props === 'crystals' ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,.85)';
      for (let i = 0; i < 4; i++) {
        const px = i * 130 + hash(i + 2) * 50;
        const py = 30 + hash(i + 5) * 50;
        g.beginPath();
        g.ellipse(px, py, 26, 9, 0, 0, Math.PI * 2);
        g.ellipse(px + 16, py - 6, 16, 9, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c;
  }

  const layerCache = new Map();
  function layer(themeName, kind) {
    const key = themeName + kind;
    if (!layerCache.has(key)) layerCache.set(key, makeLayer(themeName, kind));
    return layerCache.get(key);
  }

  /** Desenha o céu e as camadas de parallax. `camX` em pixels do mundo. */
  function drawBackground(g, themeName, camX, viewW, viewH, time) {
    const th = THEMES[themeName] || THEMES.praia;
    const grad = g.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, th.sky[0]);
    grad.addColorStop(0.6, th.sky[1]);
    grad.addColorStop(1, th.sky[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, viewW, viewH);
    if (th.sun) {
      g.fillStyle = th.sun;
      g.beginPath();
      g.arc(viewW * 0.78, 50, 22, 0, Math.PI * 2);
      g.fill();
    }
    const drawLayer = (img, factor, drift) => {
      const off = -(((camX * factor + drift) % img.width) + img.width) % img.width;
      for (let x = off; x < viewW; x += img.width) g.drawImage(img, Math.floor(x), viewH - img.height);
    };
    drawLayer(layer(themeName, 'clouds'), 0.1, time * 6);
    drawLayer(layer(themeName, 'far'), 0.25, 0);
    drawLayer(layer(themeName, 'mid'), 0.5, 0);
  }

  /** Faixa do abismo (mar, lava...) atrás do chão: só aparece onde há buraco. */
  function drawPit(g, themeName, x, w, top, time) {
    const th = THEMES[themeName] || THEMES.praia;
    const grad = g.createLinearGradient(0, top, 0, top + 40);
    grad.addColorStop(0, th.pit[0]);
    grad.addColorStop(1, th.pit[1]);
    g.fillStyle = grad;
    g.fillRect(x, top, w, 40);
    // espuma/brilho ondulando
    g.fillStyle = 'rgba(255,255,255,.45)';
    for (let i = 0; i < w; i += 12) {
      const xx = Math.floor((x + i) / 12) * 12;
      g.fillRect(xx + Math.sin(time * 2 + xx) * 2, top + 3 + Math.sin(time * 3 + xx * 0.3) * 1.5, 5, 1);
    }
  }

  window.CoopSprites = {
    drawPit,
    THEMES,
    hero,
    crab: (f) => sprite('crab' + f, CRAB_FRAMES[f % 2], CRAB),
    jelly: (f) => sprite('jelly' + f, JELLY_FRAMES[f % 2], JELLY),
    coin: (f) => sprite('coin' + f, COIN_FRAMES[f % 4], COIN),
    star: () => sprite('star', STAR_FRAME, STAR),
    crown: () => sprite('crown', CROWN_FRAME, CROWN),
    palettes: { tuca: TUCA, mel: MEL },
    renderLevel,
    drawBackground,
  };
})();
