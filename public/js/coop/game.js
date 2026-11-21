/**
 * Dupla Tropical — cliente (canvas + rede).
 *
 * Rede:
 *   - O servidor é a autoridade e manda o estado a 30 ticks/s.
 *   - PREVISÃO LOCAL: o próprio personagem anda na hora, com o mesmo motor do
 *     servidor (Games.platformer.stepPlayer). Cada entrada leva um número; quando
 *     o estado do servidor chega, o cliente volta para a posição oficial e
 *     reaplica as entradas que o servidor ainda não processou (reconciliação).
 *     A pequena diferença que sobra é desfeita aos poucos, para não "pular".
 *   - INTERPOLAÇÃO: o parceiro, os inimigos e os caixotes são desenhados ~100 ms
 *     no passado, entre dois estados recebidos, para o movimento ficar suave.
 */
(function () {
  'use strict';
  const E = window.Games.platformer;
  const LEVELS = window.Games.platformerLevels;
  const SP = window.CoopSprites;
  const Input = window.CoopInput;
  const sound = (name, arg) => { if (window.CoopAudio) window.CoopAudio.play(name, arg); };

  const T = E.TILE;
  const LEVEL_H = 15 * T; // altura das fases
  /** Altura do mundo visível: telas baixas (celular deitado) mostram menos blocos,
   *  para os personagens ficarem maiores; a câmera acompanha na vertical. */
  const viewHeight = () => (cssH < 520 ? 11 * T : cssH < 760 ? 13 * T : LEVEL_H);
  const INTERP_DELAY = 100; // ms
  const NAMES = E.playerNames;

  const $ = (s) => document.querySelector(s);
  const el = {
    screen: $('#screen-coop'),
    canvas: $('#coop-canvas'),
    coins: $('#coop-coins'),
    time: $('#coop-time'),
    deaths: $('#coop-deaths'),
    level: $('#coop-level'),
    ping: $('#coop-ping'),
    mute: $('#coop-mute'),
    exit: $('#coop-exit'),
    touch: $('#coop-touch'),
    overlay: $('#coop-overlay'),
    ovTitle: $('#coop-ov-title'),
    ovText: $('#coop-ov-text'),
    ovPrimary: $('#coop-ov-primary'),
    ovSecondary: $('#coop-ov-secondary'),
    partners: $('#coop-partners'),
  };
  const ctx = el.canvas.getContext('2d');

  /** Estado do cliente. */
  const S = {
    socket: null,
    inGame: false,
    code: null,
    seat: 0,
    token: null,
    world: null, // mundo local: mapa + último estado do servidor + previsão do próprio personagem
    levelIndex: -1,
    levelCanvas: null,
    theme: 'praia',
    snaps: [], // [{t, s}] estados recebidos, para interpolação
    last: null, // último estado recebido
    pending: [], // entradas ainda não confirmadas pelo servidor
    seq: 0,
    acc: 0,
    lastFrame: 0,
    ownPrev: null,
    ownCur: null,
    err: { x: 0, y: 0 }, // correção de previsão sendo desfeita aos poucos
    camX: 0,
    particles: [],
    ping: null,
    votes: [],
    closed: null,
    connLost: false,
    banner: null,
    hudCache: {},
  };

  // ---------------------------------------------------------------------------
  // Conexão
  // ---------------------------------------------------------------------------

  function ensureSocket() {
    if (S.socket) return S.socket;
    if (typeof window.io !== 'function') return null;
    const sock = window.io('/coop', { reconnectionDelay: 500, reconnectionDelayMax: 2000 });
    S.socket = sock;
    sock.on('coop:start', enterGame);
    sock.on('coop:state', onState);
    sock.on('coop:votes', ({ seats }) => { S.votes = seats; });
    sock.on('coop:closed', ({ reason }) => {
      S.closed = reason;
      clearSession();
      if (!S.inGame && window.Hub) window.Hub.coopWaitingClosed(reason);
    });
    sock.on('disconnect', () => { if (S.inGame) S.connLost = true; });
    sock.on('connect', () => {
      // Voltou a conexão: retoma a mesma sala com o token
      if (S.inGame && S.code && S.token && !S.closed) rejoin();
    });
    setInterval(() => {
      if (!sock.connected || !S.code) return;
      const t0 = performance.now();
      sock.timeout(4000).emit('coop:ping', Date.now(), (err) => { if (!err) S.ping = Math.round(performance.now() - t0); });
    }, 1000);
    return sock;
  }

  function rejoin() {
    S.socket.timeout(5000).emit('coop:rejoin', { code: S.code, token: S.token }, (err, res) => {
      if (err) return;
      if (res && res.ok) S.connLost = false;
      else { S.closed = 'timeout'; clearSession(); }
    });
  }

  function saveSession() {
    try { sessionStorage.setItem('coop.session', JSON.stringify({ code: S.code, token: S.token, seat: S.seat, at: Date.now() })); } catch (e) { /* ignora */ }
  }
  function clearSession() {
    try { sessionStorage.removeItem('coop.session'); } catch (e) { /* ignora */ }
  }

  /** Tela cheia + paisagem no celular (precisa ser chamado dentro do toque do usuário). */
  function prepareMobile() {
    if (window.CoopAudio) window.CoopAudio.unlock();
    if (!matchMedia('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req && !document.fullscreenElement) {
      Promise.resolve(req.call(root)).then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => {});
    }
  }

  function create(level) {
    prepareMobile();
    const sock = ensureSocket();
    if (!sock) return Promise.resolve({ ok: false, error: 'Servidor indisponível.' });
    S.closed = null;
    return new Promise((resolve) => {
      sock.timeout(8000).emit('coop:create', { level }, (err, res) => {
        if (err) return resolve({ ok: false, error: 'Não foi possível conectar ao servidor.' });
        if (res.ok) { S.code = res.code; S.token = res.token; S.seat = res.seat; }
        resolve(res);
      });
    });
  }

  function join(code) {
    prepareMobile();
    const sock = ensureSocket();
    if (!sock) return Promise.resolve({ ok: false, error: 'Servidor indisponível.' });
    S.closed = null;
    return new Promise((resolve) => {
      sock.timeout(8000).emit('coop:join', { code }, (err, res) => {
        if (err) return resolve({ ok: false, error: 'Não foi possível conectar ao servidor.' });
        if (res.ok) { S.code = res.code; S.token = res.token; S.seat = res.seat; }
        resolve(res);
      });
    });
  }

  function leave() {
    if (S.socket && S.code) S.socket.emit('coop:leave');
    stop();
    clearSession();
    S.code = null;
    S.token = null;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Partida
  // ---------------------------------------------------------------------------

  function setupLevel(index) {
    S.levelIndex = index;
    S.world = E.createWorld(LEVELS, index);
    S.theme = S.world.level.theme;
    S.levelCanvas = SP.renderLevel(S.world.level, S.theme);
    S.pending = [];
    S.snaps = [];
    S.particles = [];
    S.err = { x: 0, y: 0 };
    S.banner = { text: `Fase ${index + 1} · ${S.world.level.name}`, until: performance.now() + 2800 };
    S.camX = 0;
  }

  function enterGame({ code, seat, token, state }) {
    S.code = code;
    S.seat = seat;
    S.token = token;
    S.closed = null;
    S.connLost = false;
    S.votes = [];
    saveSession();
    setupLevel(state.level);
    applyServerState(state, true);
    const own = S.world.players[S.seat];
    S.ownPrev = { x: own.x, y: own.y };
    S.ownCur = { x: own.x, y: own.y };
    if (!S.inGame) {
      S.inGame = true;
      if (window.Hub) window.Hub.enterCoop();
      Input.setEnabled(true);
      resize();
      S.lastFrame = performance.now();
      requestAnimationFrame(frame);
      if (window.CoopAudio) window.CoopAudio.music(true, S.theme);
    }
  }

  function stop() {
    S.inGame = false;
    Input.setEnabled(false);
    if (window.CoopAudio) window.CoopAudio.music(false);
  }

  const canPredict = (snap) => snap && snap.status === 'playing' && !snap.pause;

  function onState(snap) {
    if (!S.inGame || !S.world) return;
    if (snap.level !== S.levelIndex) {
      setupLevel(snap.level);
      sound('level');
    }
    S.snaps.push({ t: performance.now(), s: snap });
    if (S.snaps.length > 40) S.snaps.splice(0, S.snaps.length - 40);
    handleEvents(snap.events);
    applyServerState(snap, false);
  }

  /** Aplica o estado oficial e refaz a previsão do próprio personagem. */
  function applyServerState(snap, hard) {
    const w = S.world;
    const own = w.players[S.seat];
    const before = { x: own.x, y: own.y };
    E.applySnapshot(w, snap);
    S.last = snap;
    S.pending = S.pending.filter((p) => p.seq > snap.ack[S.seat]);
    if (canPredict(snap) && own.state === 'alive') {
      for (const p of S.pending) {
        w.events = [];
        E.stepPlayer(w, own, p.input);
      }
    }
    const dx = before.x - own.x;
    const dy = before.y - own.y;
    if (hard || Math.hypot(dx, dy) > 48 || own.state !== 'alive') {
      S.err = { x: 0, y: 0 };
    } else {
      S.err.x += dx;
      S.err.y += dy;
    }
    S.ownPrev = { x: own.x, y: own.y };
    S.ownCur = { x: own.x, y: own.y };
  }

  /** Um passo do cliente (30/s): lê os controles, envia e prevê o próprio movimento. */
  function clientTick() {
    const snap = S.last;
    if (!S.world || !snap || !canPredict(snap) || S.connLost) return;
    const input = Input.read();
    S.seq++;
    S.pending.push({ seq: S.seq, input });
    if (S.pending.length > 90) S.pending.shift();
    S.socket.emit('coop:input', { s: S.seq, l: input.left, r: input.right, j: input.jump });
    const own = S.world.players[S.seat];
    S.ownPrev = { x: own.x, y: own.y };
    if (own.state === 'alive') {
      S.world.events = [];
      E.stepPlayer(S.world, own, input);
      for (const ev of S.world.events) if (ev.type === 'jump' && ev.p === S.seat) sound('jump');
    }
    S.ownCur = { x: own.x, y: own.y };
  }

  // ---------------------------------------------------------------------------
  // Eventos do servidor → sons e partículas
  // ---------------------------------------------------------------------------

  function burst(x, y, colors, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const v = speed * (0.5 + Math.random() * 0.7);
      S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.6 + Math.random() * 0.3, max: 0.9, color: colors[i % colors.length], size: 2 });
    }
  }

  function playerCenter(i) {
    const p = S.world.players[i];
    return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }

  function handleEvents(events) {
    for (const ev of events || []) {
      switch (ev.type) {
        case 'jump': if (ev.p !== S.seat) sound('jump', 0.5); break;
        case 'coin': sound('coin'); burst(ev.x, ev.y, ['#ffd166', '#fff7d6', '#ffb627'], 8, 70); break;
        case 'stomp': sound('stomp'); burst(ev.x, ev.y, ['#ffffff', '#ffd2a8'], 6, 60); break;
        case 'hurt': case 'fall': { sound('hurt'); const c = playerCenter(ev.p); burst(c.x, c.y, ['#ffffff', '#9be7ff'], 10, 80); break; }
        case 'rescue': { sound('rescue'); const c = playerCenter(ev.p); burst(c.x, c.y, ['#9be7ff', '#ffffff', '#ff9ad5'], 12, 90); break; }
        case 'power': sound('power'); break;
        case 'checkpoint': sound('checkpoint'); break;
        case 'door': sound('door'); break;
        case 'flag': sound('flag'); break;
        case 'clear': sound('clear'); break;
        case 'gameover': sound('gameover'); break;
        case 'bosshit': sound('bosshit'); break;
        case 'bossdown': sound('bossdown'); break;
        case 'victory': sound('victory'); break;
        case 'thud': sound('thud'); break;
        default: break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Interpolação
  // ---------------------------------------------------------------------------

  function interpPair(renderT) {
    const b = S.snaps;
    if (!b.length) return null;
    let k = b.length - 1;
    while (k > 0 && b[k].t > renderT) k--;
    const s0 = b[k];
    const s1 = b[k + 1] || s0;
    const a = s1.t === s0.t ? 1 : Math.max(0, Math.min(1, (renderT - s0.t) / (s1.t - s0.t)));
    return { s0: s0.s, s1: s1.s, a };
  }
  function lerpPos(o0, o1, a) {
    if (!o0) return o1;
    if (!o1) return o0;
    if (Math.abs(o1.x - o0.x) > 48 || Math.abs(o1.y - o0.y) > 48) return o1; // teletransporte: sem deslizar
    return { ...o1, x: o0.x + (o1.x - o0.x) * a, y: o0.y + (o1.y - o0.y) * a };
  }

  // ---------------------------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------------------------

  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = el.canvas.clientWidth || window.innerWidth;
    cssH = el.canvas.clientHeight || window.innerHeight;
    el.canvas.width = Math.round(cssW * dpr);
    el.canvas.height = Math.round(cssH * dpr);
  }
  window.addEventListener('resize', () => { if (S.inGame) resize(); });

  function frame(now) {
    if (!S.inGame) return;
    const dt = Math.min(0.1, (now - S.lastFrame) / 1000);
    S.lastFrame = now;
    S.acc += dt;
    let n = 0;
    while (S.acc >= E.DT && n < 5) {
      clientTick();
      S.acc -= E.DT;
      n++;
    }
    if (n === 5) S.acc = 0;
    const decay = Math.pow(0.0005, dt); // desfaz ~99,9% da correção por segundo
    S.err.x *= decay;
    S.err.y *= decay;
    try {
      render(now, S.acc / E.DT, dt);
    } catch (e) {
      console.error(e);
    }
    updateHud();
    updateOverlay();
    requestAnimationFrame(frame);
  }

  function render(now, alpha, dt) {
    const w = S.world;
    if (!w || !S.last) return;
    if (el.canvas.width !== Math.round(el.canvas.clientWidth * dpr)) resize();
    const VH = viewHeight();
    const scale = el.canvas.height / VH;
    const viewW = el.canvas.width / scale;
    const L = w.level;
    const levelW = L.w * T;
    const ip = interpPair(now - INTERP_DELAY);

    // Posições para desenhar
    const own = w.players[S.seat];
    const predicting = canPredict(S.last) && own.state === 'alive';
    let ownPos;
    if (predicting && S.ownPrev && S.ownCur) {
      ownPos = { ...own, x: S.ownPrev.x + (S.ownCur.x - S.ownPrev.x) * alpha + S.err.x, y: S.ownPrev.y + (S.ownCur.y - S.ownPrev.y) * alpha + S.err.y };
    } else {
      ownPos = ip ? lerpPos(ip.s0.players[S.seat], ip.s1.players[S.seat], ip.a) : own;
    }
    const mate = ip ? lerpPos(ip.s0.players[1 - S.seat], ip.s1.players[1 - S.seat], ip.a) : w.players[1 - S.seat];
    const players = [];
    players[S.seat] = ownPos;
    players[1 - S.seat] = mate;

    // Câmera segue o próprio personagem (cada celular tem a sua)
    const target = Math.max(0, Math.min(levelW - viewW, ownPos.x + 6 - viewW / 2 + (ownPos.facing || 1) * 24));
    S.camX = levelW <= viewW ? (levelW - viewW) / 2 : S.camX + (target - S.camX) * Math.min(1, dt * 6);
    if (!Number.isFinite(S.camX)) S.camX = target;
    const camX = Math.round(S.camX * scale) / scale;
    // Câmera vertical (só quando a tela mostra menos que a fase inteira)
    const targetY = Math.max(0, Math.min(LEVEL_H - VH, ownPos.y + 7 - VH * 0.55));
    S.camY = S.camY === undefined ? targetY : S.camY + (targetY - S.camY) * Math.min(1, dt * 5);
    const camY = Math.round(S.camY * scale) / scale;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    SP.drawBackground(ctx, S.theme, camX, viewW, VH, now / 1000);

    ctx.translate(-camX, -camY);
    SP.drawPit(ctx, S.theme, camX, viewW, L.h * T - 26, now / 1000);
    const sx = Math.max(0, Math.floor(camX));
    const sw = Math.min(S.levelCanvas.width - sx, Math.ceil(viewW) + 2);
    if (sw > 0) ctx.drawImage(S.levelCanvas, sx, 0, sw, LEVEL_H, sx, 0, sw, LEVEL_H);

    const visible = (x, wd) => x + wd > camX - 16 && x < camX + viewW + 16;
    const t = now / 1000;

    // Portas e botões
    L.doors.forEach((d, i) => {
      if (w.doors[i] && w.doors[i].open) return;
      const x = d.tx * T;
      if (!visible(x, T)) return;
      for (let k = 0; k < d.hTiles; k++) {
        const y = (d.ty + k) * T;
        ctx.fillStyle = '#5a3a8a';
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(x + 2, y, 2, T);
        ctx.fillRect(x + 7, y, 2, T);
        ctx.fillRect(x + 12, y, 2, T);
        ctx.fillStyle = '#2a1838';
        ctx.fillRect(x, y + 7, T, 2);
      }
    });
    L.plates.forEach((pl, i) => {
      const x = pl.tx * T;
      if (!visible(x, T)) return;
      const y = pl.ty * T + T;
      const down = w.plates[i];
      ctx.fillStyle = '#6b6f86';
      ctx.fillRect(x + 1, y - 3, T - 2, 3);
      ctx.fillStyle = down ? '#39f5a1' : '#ff3b6b';
      ctx.fillRect(x + 3, y - (down ? 4 : 6), T - 6, down ? 1 : 3);
    });

    // Checkpoints e bandeira
    L.checkpoints.forEach((cp) => {
      const x = cp.tx * T + 6;
      if (!visible(x, 16)) return;
      const base = (cp.ty + 1) * T;
      const active = w.checkpoint >= 0 && L.checkpoints.findIndex((c) => c.id === w.checkpoint) >= L.checkpoints.indexOf(cp);
      ctx.fillStyle = '#e8e2f5';
      ctx.fillRect(x, base - 36, 2, 36);
      ctx.fillStyle = active ? '#19c3c8' : '#9a94b0';
      ctx.beginPath();
      ctx.moveTo(x + 2, base - 36);
      ctx.lineTo(x + 13, base - 31 + Math.sin(t * 6) * 1);
      ctx.lineTo(x + 2, base - 26);
      ctx.fill();
    });
    if (L.flag && visible(L.flag.x, 40)) {
      const fx = L.flag.tx * T + 7;
      const base = (L.flag.ty + 1) * T;
      ctx.fillStyle = '#fff7d6';
      ctx.fillRect(fx, base - 80, 3, 80);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(fx + 1.5, base - 82, 3, 0, Math.PI * 2);
      ctx.fill();
      const wave = Math.sin(t * 5) * 2;
      ctx.fillStyle = '#ff5f7e';
      ctx.beginPath();
      ctx.moveTo(fx + 3, base - 78);
      ctx.lineTo(fx + 24, base - 72 + wave);
      ctx.lineTo(fx + 3, base - 62);
      ctx.fill();
      ctx.fillStyle = '#19c3c8';
      ctx.fillRect(fx + 6, base - 74, 6, 6);
    }

    // Moedas e itens
    const coinFrame = Math.floor(t * 8) % 4;
    for (const coin of L.coins) {
      if (w.coinsTaken.includes(coin.id) || !visible(coin.x, 10)) continue;
      const s = SP.coin(coinFrame);
      ctx.drawImage(s.right, coin.x, coin.y + Math.sin(t * 3 + coin.x) * 1);
    }
    w.items.forEach((it) => {
      if (it.taken || !visible(it.x, 12)) return;
      ctx.drawImage(SP.star().right, it.x, it.y + Math.sin(t * 4) * 2);
    });

    // Caixotes (interpolados)
    w.crates.forEach((c, i) => {
      const pos = ip ? lerpPos(ip.s0.crates[i], ip.s1.crates[i], ip.a) || c : c;
      if (!visible(pos.x, c.w)) return;
      drawCrate(pos.x, pos.y, c);
    });

    // Inimigos (interpolados)
    w.enemies.forEach((e, i) => {
      const s0 = ip && ip.s0.enemies[i];
      const s1 = ip && ip.s1.enemies[i];
      const pos = s1 ? lerpPos(s0, s1, ip.a) : e;
      if (!pos.alive || !visible(pos.x, e.w)) return;
      drawEnemy(e, pos, t);
    });

    // Jogadores
    [1 - S.seat, S.seat].forEach((i) => drawPlayer(i, players[i], t));

    // Partículas
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i];
      p.life -= dt;
      if (p.life <= 0) { S.particles.splice(i, 1); continue; }
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Seta indicando o parceiro fora da tela
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const mx = mate.x - camX;
    if (mx < -8 || mx > viewW + 8) {
      const left = mx < 0;
      const ax = left ? 10 : viewW - 10;
      const ay = Math.max(30, Math.min(VH - 30, mate.y + 7 - camY));
      ctx.fillStyle = (1 - S.seat) === 0 ? '#19c3c8' : '#ff5f7e';
      ctx.beginPath();
      ctx.moveTo(ax + (left ? -6 : 6), ay);
      ctx.lineTo(ax + (left ? 4 : -4), ay - 7);
      ctx.lineTo(ax + (left ? 4 : -4), ay + 7);
      ctx.fill();
      ctx.font = 'bold 7px Inter, sans-serif';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.fillText(NAMES[1 - S.seat], ax + (left ? 6 : -6), ay + 3);
    }

    // Faixa com o nome da fase
    if (S.banner && now < S.banner.until) {
      const a = Math.min(1, (S.banner.until - now) / 500);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(24, 8, 46, .78)';
      ctx.fillRect(0, VH / 2 - 22, viewW, 34);
      ctx.fillStyle = '#ffd166';
      ctx.font = '16px Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(S.banner.text.toUpperCase(), viewW / 2, VH / 2 + 1);
      ctx.globalAlpha = 1;
    }
    if (S.last.status === 'levelclear') {
      ctx.fillStyle = 'rgba(24, 8, 46, .7)';
      ctx.fillRect(0, VH / 2 - 30, viewW, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FASE CONCLUÍDA!', viewW / 2, VH / 2 - 4);
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`${S.last.levelCoins} moedas nesta fase`, viewW / 2, VH / 2 + 10);
    }
  }

  function drawCrate(x, y, c) {
    if (c.heavy) {
      ctx.fillStyle = '#7c7f99';
      ctx.fillRect(x, y, c.w, c.h);
      ctx.fillStyle = '#a3a6c2';
      ctx.fillRect(x + 2, y + 2, c.w - 4, 3);
      ctx.fillStyle = '#56596f';
      ctx.fillRect(x, y + c.h - 3, c.w, 3);
      ctx.fillStyle = '#3d3f52';
      [[4, 8], [c.w - 7, 8], [4, c.h - 9], [c.w - 7, c.h - 9]].forEach(([rx, ry]) => ctx.fillRect(x + rx, y + ry, 3, 3));
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 6px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('2×', x + c.w / 2, y + c.h / 2 + 2);
    } else {
      ctx.fillStyle = '#c98a43';
      ctx.fillRect(x, y, c.w, c.h);
      ctx.fillStyle = '#8a5a2c';
      ctx.strokeStyle = '#8a5a2c';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, c.w - 1, c.h - 1);
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 1);
      ctx.lineTo(x + c.w - 1, y + c.h - 1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillRect(x + 1, y + 1, c.w - 2, 1);
    }
  }

  function drawEnemy(e, pos, t) {
    const blink = pos.inv > 0 && Math.floor(t * 12) % 2 === 0;
    if (blink) return;
    if (e.type === 'jelly') {
      ctx.drawImage(SP.jelly(Math.floor(t * 4)).right, pos.x, pos.y);
    } else if (e.type === 'boss') {
      const s = SP.crab(Math.floor(t * 5));
      const img = (pos.dir || -1) > 0 ? s.right : s.left;
      ctx.drawImage(img, pos.x - 1, pos.y, 42, 30);
      ctx.drawImage(SP.crown().right, pos.x + 15, pos.y - 5);
      // vida do chefe
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k < pos.hp ? '#ff3b6b' : 'rgba(0,0,0,.35)';
        ctx.fillRect(pos.x + 8 + k * 9, pos.y - 10, 7, 3);
      }
    } else {
      const s = SP.crab(Math.floor(t * 6));
      ctx.drawImage((pos.dir || -1) > 0 ? s.right : s.left, pos.x, pos.y);
    }
  }

  function drawPlayer(i, p, t) {
    if (!p) return;
    const color = i === 0 ? '#19c3c8' : '#ff5f7e';
    if (p.state === 'bubble') {
      const r = 13 + Math.sin(t * 6) * 1;
      const cx = p.x + 6;
      const cy = p.y + 7 + Math.sin(t * 3) * 2;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(SP.hero(i, 'idle').right, p.x, p.y + Math.sin(t * 3) * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(155, 231, 255, .35)';
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(cx - 7, cy - 8, 3, 2);
      label(i, cx, cy - r - 3, color, 'Me salva!');
      return;
    }
    if (p.invuln > 0 && Math.floor(t * 14) % 2 === 0) return;
    let frameName = 'idle';
    if (!p.onGround) frameName = 'jump';
    else if (Math.abs(p.vx) > 10) frameName = Math.floor(t * 9) % 2 ? 'walk1' : 'walk2';
    const s = SP.hero(i, frameName);
    if (p.star > 0) {
      ctx.fillStyle = `hsla(${(t * 600) % 360}, 100%, 65%, .55)`;
      ctx.beginPath();
      ctx.arc(p.x + 6, p.y + 7, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.drawImage((p.facing || 1) > 0 ? s.right : s.left, Math.round(p.x), Math.round(p.y));
    label(i, p.x + 6, p.y - 4, color, i === S.seat ? 'Você' : NAMES[i]);
  }

  function label(i, x, y, color, text) {
    ctx.font = 'bold 6px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(24,8,46,.6)';
    const wd = ctx.measureText(text).width + 4;
    ctx.fillRect(x - wd / 2, y - 6, wd, 8);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // ---------------------------------------------------------------------------
  // Placar (HUD) e avisos
  // ---------------------------------------------------------------------------

  function setText(node, key, value) {
    if (S.hudCache[key] === value) return;
    S.hudCache[key] = value;
    node.textContent = value;
  }

  function updateHud() {
    const s = S.last;
    if (!s) return;
    setText(el.coins, 'coins', String(s.stats.coins));
    const tm = Math.ceil(s.time);
    setText(el.time, 'time', `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`);
    el.time.parentElement.classList.toggle('low', tm <= 30 && s.status === 'playing');
    setText(el.deaths, 'deaths', String(s.stats.deaths));
    setText(el.level, 'level', `Fase ${s.level + 1}/${LEVELS.length}`);
    const ping = S.ping === null ? '— ms' : `${S.ping} ms`;
    setText(el.ping, 'ping', ping);
    el.ping.dataset.quality = S.ping === null ? '' : S.ping < 100 ? 'good' : S.ping < 250 ? 'ok' : 'bad';
    const partners = s.players.map((p, i) => `${i}:${p.state}:${s.online ? s.online[i] : true}`).join('|');
    if (S.hudCache.partners !== partners) {
      S.hudCache.partners = partners;
      el.partners.innerHTML = s.players
        .map((p, i) => {
          const st = s.online && !s.online[i] ? 'offline' : p.state;
          const tag = st === 'offline' ? 'sem conexão' : st === 'bubble' ? 'na bolha' : i === S.seat ? 'você' : 'ok';
          return `<span class="coop-mate p${i} ${st}"><i></i>${NAMES[i]} <small>${tag}</small></span>`;
        })
        .join('');
    }
  }

  let overlayKey = '';
  function showOverlay(key, title, text, primary, secondary) {
    el.overlay.hidden = false;
    if (overlayKey === key + text + (primary && primary.label)) return;
    overlayKey = key + text + (primary && primary.label);
    el.overlay.dataset.kind = key;
    el.ovTitle.textContent = title;
    el.ovText.textContent = text;
    const setBtn = (btn, cfg) => {
      btn.hidden = !cfg;
      if (!cfg) return;
      btn.textContent = cfg.label;
      btn.disabled = !!cfg.disabled;
      btn.onclick = cfg.onClick;
    };
    setBtn(el.ovPrimary, primary);
    setBtn(el.ovSecondary, secondary);
  }
  function hideOverlay() {
    el.overlay.hidden = true;
    overlayKey = '';
  }

  const exitBtn = { label: 'Sair', onClick: () => exitToMenu() };

  function updateOverlay() {
    const s = S.last;
    if (S.closed) {
      const msg = { left: 'Seu parceiro saiu da sala.', timeout: 'O parceiro não voltou a tempo e a sala foi encerrada.' }[S.closed] || 'A sala foi encerrada.';
      return showOverlay('closed', 'Partida encerrada', msg, { label: 'Voltar ao menu', onClick: () => exitToMenu() });
    }
    if (S.connLost) {
      return showOverlay('conn', 'Conexão perdida', 'Tentando reconectar… Sua vaga fica guardada por 30 segundos.', {
        label: 'Reconectar agora',
        onClick: () => { if (S.socket.connected) rejoin(); else S.socket.connect(); },
      }, exitBtn);
    }
    if (!s) return hideOverlay();
    if (s.pause) {
      const who = s.pause.seat === S.seat ? 'Você' : NAMES[s.pause.seat];
      if (s.pause.reason === 'disconnected') {
        return showOverlay('pause', 'Jogo pausado', `${who} perdeu a conexão. Esperando a volta por até ${s.pause.left} s…`, null, exitBtn);
      }
      if (s.pause.reason === 'lag') {
        const text = s.pause.seat === S.seat ? 'Sua conexão está muito lenta. O jogo volta sozinho quando ela melhorar.' : `A conexão de ${who} está lenta. O jogo volta sozinho…`;
        return showOverlay('pause', 'Conexão lenta', text, null, exitBtn);
      }
      return showOverlay('resume', 'Prontos?', 'Voltando ao jogo…', null, null);
    }
    if (s.status === 'gameover') {
      const reason = s.reason === 'time' ? 'O tempo acabou.' : 'Os dois viraram bolha ao mesmo tempo.';
      const mine = S.votes.includes(S.seat);
      return showOverlay('gameover', 'Fim de jogo', `${reason} Vocês voltam do último checkpoint.`, {
        label: mine ? `Esperando ${NAMES[1 - S.seat]}…` : `Tentar de novo (${S.votes.length}/2)`,
        disabled: mine,
        onClick: () => S.socket.emit('coop:retry'),
      }, exitBtn);
    }
    if (s.status === 'victory') {
      const mine = S.votes.includes(S.seat);
      const tm = s.stats.time;
      return showOverlay('victory', 'Vocês venceram! 🏝️', `O Rei Beliscão foi derrotado! Moedas: ${s.stats.coins} · Tempo: ${Math.floor(tm / 60)}min ${tm % 60}s · Bolhas: ${s.stats.deaths}`, {
        label: mine ? `Esperando ${NAMES[1 - S.seat]}…` : `Jogar de novo (${S.votes.length}/2)`,
        disabled: mine,
        onClick: () => S.socket.emit('coop:retry'),
      }, exitBtn);
    }
    hideOverlay();
  }

  function exitToMenu() {
    leave();
    hideOverlay();
    if (window.Hub) window.Hub.exitCoop();
  }

  // ---------------------------------------------------------------------------
  // Botões da tela
  // ---------------------------------------------------------------------------

  Input.attach(el.touch);
  el.exit.addEventListener('click', exitToMenu);
  el.mute.addEventListener('click', () => {
    if (!window.CoopAudio) return;
    const muted = window.CoopAudio.toggleMute();
    el.mute.setAttribute('aria-pressed', String(muted));
    el.mute.setAttribute('aria-label', muted ? 'Ligar o som' : 'Desligar o som');
  });
  if (window.CoopAudio) el.mute.setAttribute('aria-pressed', String(window.CoopAudio.isMuted()));

  window.Coop = {
    create,
    join,
    leave,
    isActive: () => S.inGame,
    /** Para testes automáticos e depuração no console. */
    _state: S,
  };
})();
