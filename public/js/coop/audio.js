/**
 * Dupla Tropical — som 100% sintetizado com Web Audio (nenhum arquivo de áudio).
 * Efeitos curtos com osciladores/ruído e uma música original em loop, tocada por
 * um sequenciador com agendamento antecipado (não "engasga" se a tela pesar).
 * O botão de mudo fica salvo no aparelho.
 */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('coop.muted') === '1'; } catch (e) { /* ignora */ }

  /** Cria o contexto de áudio (precisa de um toque/clique do usuário). */
  function unlock() {
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.55;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.22;
      musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (seed / 0x7fffffff) * 2 - 1;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  // No celular, qualquer toque na tela do jogo também destrava o som
  document.addEventListener('pointerdown', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); }, { passive: true });

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function tone(freq, dur, opts = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const v = (opts.vol || 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(opts.bus || sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, opts = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filter || 'lowpass';
    filter.frequency.value = opts.freq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(opts.bus || sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function arp(notes, step, opts = {}) {
    notes.forEach((n, i) => tone(midi(n), opts.dur || step * 1.4, { ...opts, delay: (opts.delay || 0) + i * step }));
  }

  const SFX = {
    jump: (v = 1) => tone(320, 0.13, { to: 640, vol: 0.18 * v, type: 'square' }),
    coin: () => { tone(988, 0.06, { vol: 0.2 }); tone(1319, 0.16, { vol: 0.2, delay: 0.06 }); },
    stomp: () => { noise(0.08, { freq: 900, vol: 0.35 }); tone(220, 0.14, { to: 90, type: 'triangle', vol: 0.4 }); },
    hurt: () => tone(440, 0.35, { to: 110, type: 'sawtooth', vol: 0.2 }),
    rescue: () => arp([72, 76, 79, 84], 0.06, { type: 'triangle', vol: 0.3 }),
    power: () => arp([72, 76, 79, 84, 79, 84, 88], 0.045, { type: 'square', vol: 0.16 }),
    checkpoint: () => arp([79, 84], 0.09, { type: 'triangle', vol: 0.32 }),
    door: () => { tone(110, 0.4, { to: 220, type: 'triangle', vol: 0.4 }); noise(0.3, { freq: 400, vol: 0.2 }); },
    flag: () => arp([76, 79, 84], 0.08, { type: 'square', vol: 0.16 }),
    clear: () => arp([72, 76, 79, 84, 79, 84, 88, 91], 0.09, { type: 'square', vol: 0.18, dur: 0.16 }),
    gameover: () => arp([67, 64, 60, 55], 0.18, { type: 'triangle', vol: 0.35, dur: 0.3 }),
    bosshit: () => { noise(0.15, { freq: 600, vol: 0.4 }); tone(150, 0.25, { to: 70, type: 'square', vol: 0.3 }); },
    bossdown: () => { arp([84, 79, 76, 72, 67, 64, 60], 0.06, { type: 'square', vol: 0.18 }); arp([72, 76, 79, 84, 88], 0.1, { type: 'triangle', vol: 0.3, delay: 0.5 }); },
    victory: () => arp([72, 72, 72, 76, 79, 79, 76, 79, 84], 0.13, { type: 'square', vol: 0.2, dur: 0.2 }),
    thud: () => noise(0.12, { freq: 300, vol: 0.4 }),
    level: () => arp([79, 84], 0.1, { type: 'triangle', vol: 0.3 }),
  };

  // ---------------------------------------------------------------------------
  // Música original: 4 compassos em loop (colcheias), melodia + baixo + chimbal
  // ---------------------------------------------------------------------------
  const MELODY = [
    76, 0, 79, 76, 74, 72, 74, 0,
    76, 79, 81, 79, 76, 0, 74, 0,
    72, 0, 74, 76, 79, 0, 76, 74,
    72, 74, 72, 69, 72, 0, 0, 0,
  ];
  // Variação "tensa" para o vulcão do chefe (tom menor)
  const MELODY_BOSS = [
    69, 0, 72, 69, 71, 72, 74, 0,
    76, 0, 74, 72, 71, 0, 68, 0,
    69, 72, 76, 0, 74, 72, 71, 0,
    69, 0, 64, 0, 69, 0, 0, 0,
  ];
  const BASS = [48, 0, 55, 0, 45, 0, 52, 0, 41, 0, 48, 0, 43, 0, 50, 0];
  const BASS_BOSS = [45, 0, 45, 52, 41, 0, 41, 48, 43, 0, 43, 50, 40, 0, 44, 0];
  const THEME_MUSIC = {
    praia: { transpose: 0, bpm: 132 },
    bosque: { transpose: -2, bpm: 126 },
    caverna: { transpose: -5, bpm: 112 },
    nuvens: { transpose: 3, bpm: 138 },
    vulcao: { transpose: 0, bpm: 146, boss: true },
  };

  let musicTimer = null;
  let nextTime = 0;
  let step = 0;
  let current = THEME_MUSIC.praia;

  function scheduleMusic() {
    if (!ctx) return;
    const eighth = 60 / current.bpm / 2;
    while (nextTime < ctx.currentTime + 0.15) {
      const mel = current.boss ? MELODY_BOSS : MELODY;
      const bass = current.boss ? BASS_BOSS : BASS;
      const m = mel[step % mel.length];
      if (m) tone(midi(m + current.transpose), eighth * 0.9, { type: 'square', vol: 0.12, bus: musicBus, delay: nextTime - ctx.currentTime });
      if (step % 2 === 0) {
        const b = bass[(step / 2) % bass.length];
        if (b) tone(midi(b + current.transpose), eighth * 1.8, { type: 'triangle', vol: 0.32, bus: musicBus, delay: nextTime - ctx.currentTime });
      }
      if (step % 2 === 1) noise(0.03, { filter: 'highpass', freq: 7000, vol: 0.08, bus: musicBus, delay: nextTime - ctx.currentTime });
      nextTime += eighth;
      step++;
    }
  }

  window.CoopAudio = {
    unlock,
    play(name, arg) {
      if (!ctx || muted || !SFX[name]) return;
      SFX[name](arg);
    },
    music(on, theme) {
      clearInterval(musicTimer);
      musicTimer = null;
      if (!on) return;
      current = THEME_MUSIC[theme] || THEME_MUSIC.praia;
      if (!ctx) unlock();
      if (!ctx) return;
      nextTime = ctx.currentTime + 0.1;
      step = 0;
      musicTimer = setInterval(scheduleMusic, 40);
    },
    setTheme(theme) {
      current = THEME_MUSIC[theme] || THEME_MUSIC.praia;
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('coop.muted', muted ? '1' : '0'); } catch (e) { /* ignora */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
      return muted;
    },
    isMuted: () => muted,
  };
})();
