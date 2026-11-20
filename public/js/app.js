/**
 * Controlador do Hub de Jogos: navegação entre telas, partidas contra o
 * computador (IA roda no navegador) e partidas online (estado no servidor).
 *
 * Cada jogo fornece:
 *   - window.Games[id]   → regras (mesmo arquivo usado pelo servidor)
 *   - window.UI.views[id] → interface: { icon, description, badge(seat), create(container, { onMove }) }
 *
 * Ganchos opcionais das regras, usados quando existem:
 *   game.LEVELS            → mostra o seletor de tabuleiro (Campo Minado)
 *   game.publicState(s)    → o que a interface pode mostrar (esconde segredos)
 *   game.resultDetail(s, seat) / game.statusNote(s) → textos extras no status
 */
(function () {
  'use strict';

  const Games = window.Games;
  const UI = window.UI;
  const GAME_ORDER = ['tictactoe', 'connect4', 'checkers', 'chess', 'minesweeper'].filter((id) => Games[id] && UI.views[id]);
  const CPU_DELAY_MS = 450;
  const DIFFICULTY_LABEL = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };

  const $ = (sel) => document.querySelector(sel);
  const el = {
    screens: { home: $('#screen-home'), mode: $('#screen-mode'), game: $('#screen-game') },
    gameList: $('#game-list'),
    modeTitle: $('#mode-title'),
    difficultyButtons: document.querySelectorAll('[data-difficulty]'),
    difficultyField: $('#difficulty-field'),
    difficultyLabel: $('#difficulty-label'),
    levelField: $('#level-field'),
    levelPicker: $('#level-picker'),
    cpuTypeField: $('#cpu-type-field'),
    cpuTypeButtons: document.querySelectorAll('[data-cpu-type]'),
    cpuHint: $('#cpu-hint'),
    btnPlayCpu: $('#btn-play-cpu'),
    btnCreateRoom: $('#btn-create-room'),
    btnOnlineToggle: $('#btn-online-toggle'),
    onlineBody: $('#online-body'),
    codeHint: $('#code-hint'),
    scoreboard: document.querySelector('.scoreboard'),
    joinForm: $('#join-form'),
    joinCode: $('#join-code'),
    onlineActions: $('#online-actions'),
    onlineWaiting: $('#online-waiting'),
    onlineError: $('#online-error'),
    roomCode: $('#room-code'),
    copyHint: $('#copy-hint'),
    btnCancelRoom: $('#btn-cancel-room'),
    gameTitle: $('#game-title'),
    gameSubtitle: $('#game-subtitle'),
    scoreMe: $('#score-me'),
    scoreDraws: $('#score-draws'),
    scoreOpp: $('#score-opp'),
    oppLabel: $('#opp-label'),
    meLabel: $('#me-label'),
    drawsLabel: $('#draws-label'),
    status: $('#status'),
    board: $('#board'),
    btnAgain: $('#btn-again'),
    btnBackMenu: $('#btn-back-menu'),
    btnMenu: $('#btn-menu'),
    toast: $('#toast'),
  };

  // ---------------------------------------------------------------------------
  // Estado da aplicação
  // ---------------------------------------------------------------------------

  let selectedGameId = null;
  let difficulty = storageGet('hub.difficulty') || 'medium';
  let level = storageGet('hub.level') || 'easy'; // tabuleiro do Campo Minado
  let cpuType = storageGet('hub.cpuType') || 'solo'; // Campo Minado: 'solo' ou 'versus'
  let socket = null;
  let waitingCode = null; // sala criada aguardando adversário
  let currentScreen = 'home';

  /**
   * Sessão de jogo ativa (null fora da tela de jogo).
   * { gameId, game, viewDef, view, mode: 'cpu'|'online', difficulty, options, solo,
   *   seat, state, scores: {me, opponent, draws, best}, matchCount, cpuTimer, pending,
   *   code, ended, endReason, rematchMine, rematchTheirs }
   */
  let session = null;

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* sem armazenamento: ignora */ }
  }

  // ---------------------------------------------------------------------------
  // Navegação
  // ---------------------------------------------------------------------------

  function showScreen(name, { push = true } = {}) {
    currentScreen = name;
    document.body.dataset.screen = name; // o CSS escurece o cenário nas telas de partida
    for (const [key, node] of Object.entries(el.screens)) node.classList.toggle('active', key === name);
    window.scrollTo(0, 0);
    if (push) history.pushState({ screen: name }, '');
  }

  // Botão "voltar" do navegador/celular navega entre as telas do app.
  window.addEventListener('popstate', (e) => {
    const target = (e.state && e.state.screen) || 'home';
    if (currentScreen === 'game' && target !== 'game') endSession();
    if (currentScreen === 'mode' && target === 'home') cancelWaitingRoom();
    if (target === 'game' && !session) return showScreen(selectedGameId ? 'mode' : 'home', { push: false });
    if (target === 'mode' && !selectedGameId) return showScreen('home', { push: false });
    showScreen(target, { push: false });
  });

  function renderHome() {
    el.gameList.innerHTML = '';
    GAME_ORDER.forEach((id, i) => {
      const view = UI.views[id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'game-card';
      card.dataset.game = id;
      card.style.setProperty('--i', i); // atraso da animação de entrada
      card.setAttribute('aria-label', `Jogar ${Games[id].name}`);
      card.innerHTML =
        `<span class="game-card-art">${view.icon}</span>` +
        `<span class="game-card-body"><span class="game-card-title">${Games[id].name}</span>` +
        `<span class="game-card-desc">${view.description}</span></span>` +
        '<span class="game-card-play" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z"/></svg>Jogar</span>';
      card.addEventListener('click', () => openMode(id));
      el.gameList.appendChild(card);
    });
  }

  function openMode(gameId) {
    selectedGameId = gameId;
    const game = Games[gameId];
    el.modeTitle.textContent = game.name;

    // Seletor de tabuleiro (só para jogos com níveis)
    el.levelField.hidden = !game.LEVELS;
    el.levelPicker.innerHTML = '';
    if (game.LEVELS) {
      if (!game.LEVELS[level]) level = 'easy';
      for (const [id, info] of Object.entries(game.LEVELS)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'radio');
        btn.dataset.level = id;
        btn.innerHTML = `${info.label}<small>${info.cols}×${info.rows} · ${info.mines} minas</small>`;
        btn.addEventListener('click', () => {
          level = id;
          storageSet('hub.level', level);
          renderModeOptions();
        });
        el.levelPicker.appendChild(btn);
      }
    }
    // Campo Minado tem "desafio solo" além de "contra a CPU"
    el.cpuTypeField.hidden = game.ai.kind !== 'minesweeper';
    resetOnlinePanel();
    setOnlineOpen(false);
    renderModeOptions();
    showScreen('mode');
  }

  function hasSoloMode(gameId) {
    return Games[gameId].ai.kind === 'minesweeper';
  }

  function renderModeOptions() {
    el.difficultyButtons.forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.difficulty === difficulty));
    });
    el.levelPicker.querySelectorAll('[data-level]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.level === level));
    });
    el.cpuTypeButtons.forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.cpuType === cpuType));
    });
    const solo = selectedGameId && hasSoloMode(selectedGameId);
    el.difficultyField.hidden = !!solo && cpuType === 'solo';
    el.difficultyLabel.textContent = solo ? 'Dificuldade da CPU' : 'Dificuldade';
    el.cpuHint.hidden = !solo;
    el.cpuHint.textContent = cpuType === 'solo'
      ? 'Abra todas as casas sem pisar em minas, contra o relógio.'
      : 'Você e a CPU se alternam no mesmo tabuleiro. Quem pisar numa mina perde.';
  }

  // ---------------------------------------------------------------------------
  // Sessão de jogo (comum aos dois modos)
  // ---------------------------------------------------------------------------

  function beginSession(gameId, mode, options) {
    endSession();
    selectedGameId = gameId;
    const viewDef = UI.views[gameId];
    const solo = !!(options && options.mode === 'solo');
    session = {
      gameId,
      game: Games[gameId],
      viewDef,
      view: null,
      mode,
      difficulty,
      options,
      solo,
      seat: 0,
      state: null,
      scores: { me: 0, opponent: 0, draws: 0, best: null },
      matchCount: 0,
      cpuTimer: null,
      pending: false,
      code: null,
      ended: false,
      endReason: null,
      rematchMine: false,
      rematchTheirs: false,
    };
    [el.scoreMe, el.scoreDraws, el.scoreOpp].forEach((node) => { node.dataset.ready = ''; });
    session.view = viewDef.create(el.board, { onMove: handleUserMove });
    el.gameTitle.textContent = session.game.name;
    el.meLabel.textContent = solo ? 'Vitórias' : 'Você';
    el.drawsLabel.textContent = solo ? 'Recorde' : 'Empates';
    el.oppLabel.textContent = solo ? 'Derrotas' : mode === 'cpu' ? 'Computador' : 'Adversário';
    const levelLabel = options && options.level && session.game.LEVELS ? session.game.LEVELS[options.level].label : '';
    if (mode === 'cpu') {
      el.gameSubtitle.textContent = solo ? `Solo · ${levelLabel}` : [DIFFICULTY_LABEL[difficulty], levelLabel].filter(Boolean).join(' · ');
    } else {
      el.gameSubtitle.textContent = '';
    }
    showScreen('game');
  }

  function endSession() {
    if (!session) return;
    clearTimeout(session.cpuTimer);
    if (session.mode === 'online' && !session.ended && socket) socket.emit('room:leave');
    if (session.view && session.view.destroy) session.view.destroy();
    session = null;
    el.board.innerHTML = '';
  }

  function goToMenu() {
    endSession();
    if (selectedGameId) {
      resetOnlinePanel();
      showScreen('mode');
    } else {
      showScreen('home');
    }
  }

  /** Procura a jogada legal equivalente (mesma chave) — evita aplicar algo inválido. */
  function findLegalMove(game, state, move) {
    if (state.winner !== null) return null;
    const key = game.moveKey(move);
    const legal = game.getMoves(state).find((m) => game.moveKey(m) === key);
    return legal === undefined ? null : legal;
  }

  function isMyTurn() {
    const s = session;
    return !!s && !s.ended && !s.pending && s.state.winner === null && s.state.turn === s.seat;
  }

  function handleUserMove(move) {
    if (!isMyTurn()) return;
    const legal = findLegalMove(session.game, session.state, move);
    if (legal === null) return;

    if (session.mode === 'cpu') {
      applyLocalMove(legal);
      return;
    }

    // Online: envia ao servidor e espera a confirmação (o servidor é quem decide).
    const current = session;
    current.pending = true;
    render();
    socket.timeout(8000).emit('game:move', { move: legal }, (err, res) => {
      if (session !== current) return;
      if (err || !res || !res.ok) {
        current.pending = false;
        toast(err ? 'Sem resposta do servidor.' : res.error || 'Jogada recusada.');
        render();
      }
    });
  }

  function recordResult(state) {
    const s = session;
    if (s.solo && state.winner === s.seat && state.endedAt && state.startedAt) {
      const time = state.endedAt - state.startedAt;
      if (s.scores.best === null || time < s.scores.best) s.scores.best = time;
    }
    if (state.winner === 'draw') s.scores.draws++;
    else if (state.winner === s.seat) s.scores.me++;
    else s.scores.opponent++;
  }

  // ---------------------------------------------------------------------------
  // Modo: contra o computador
  // ---------------------------------------------------------------------------

  function startCpuSession() {
    const options = hasSoloMode(selectedGameId) ? { level, mode: cpuType } : undefined;
    beginSession(selectedGameId, 'cpu', options);
    startCpuMatch();
  }

  function startCpuMatch() {
    const s = session;
    clearTimeout(s.cpuTimer);
    // Alterna quem começa a cada partida (no desafio solo, só há um jogador).
    s.seat = s.solo || s.matchCount % 2 === 0 ? 0 : 1;
    s.matchCount++;
    s.state = s.game.createState(s.options);
    if (s.view.reset) s.view.reset();
    render();
    scheduleCpuMove();
  }

  function applyLocalMove(move) {
    const s = session;
    s.state = s.game.applyMove(s.state, move);
    if (s.state.winner !== null) recordResult(s.state);
    render();
    scheduleCpuMove();
  }

  function scheduleCpuMove() {
    const s = session;
    if (!s || s.mode !== 'cpu' || s.state.winner !== null || s.state.turn === s.seat) return;
    const stateAtSchedule = s.state;
    const startedAt = Date.now();
    computeAiMove(s.gameId, s.state, s.difficulty).then((move) => {
      // Descarta se o usuário saiu ou reiniciou nesse meio-tempo.
      if (session !== s || s.state !== stateAtSchedule || move === null || move === undefined) return;
      // Pequena pausa mínima para a jogada da CPU não parecer instantânea.
      const wait = Math.max(0, CPU_DELAY_MS - (Date.now() - startedAt));
      s.cpuTimer = setTimeout(() => {
        if (session !== s || s.state !== stateAtSchedule) return;
        const legal = findLegalMove(s.game, s.state, move);
        if (legal !== null) applyLocalMove(legal);
      }, wait);
    });
  }

  // ---------------------------------------------------------------------------
  // IA em Web Worker (a tela não trava enquanto o computador pensa)
  // ---------------------------------------------------------------------------

  let aiWorker = null; // null: ainda não criado; false: indisponível (usa a thread principal)
  let aiRequestId = 0;
  const aiPending = new Map();

  function getAiWorker() {
    if (aiWorker !== null) return aiWorker;
    try {
      aiWorker = new Worker('js/ai-worker.js');
      aiWorker.onmessage = (e) => {
        const req = aiPending.get(e.data.id);
        if (!req) return;
        aiPending.delete(e.data.id);
        if (e.data.error) req.resolve(computeAiMoveHere(req));
        else req.resolve(e.data.move);
      };
      aiWorker.onerror = (e) => {
        // Se o Worker falhar, segue jogando na thread principal.
        if (e && e.preventDefault) e.preventDefault();
        aiWorker.terminate();
        aiWorker = false;
        for (const req of aiPending.values()) req.resolve(computeAiMoveHere(req));
        aiPending.clear();
      };
    } catch (err) {
      aiWorker = false;
    }
    return aiWorker;
  }

  function computeAiMoveHere(req) {
    return Games.ai.chooseMove(Games[req.gameId], req.state, req.difficulty);
  }

  function computeAiMove(gameId, state, difficultyLevel) {
    return new Promise((resolve) => {
      const req = { gameId, state, difficulty: difficultyLevel, resolve };
      const worker = getAiWorker();
      if (!worker) {
        // Sem Worker: dá um respiro para a tela desenhar antes de calcular.
        setTimeout(() => resolve(computeAiMoveHere(req)), 30);
        return;
      }
      const id = ++aiRequestId;
      aiPending.set(id, req);
      worker.postMessage({ id, gameId, state, difficulty: difficultyLevel });
    });
  }

  // ---------------------------------------------------------------------------
  // Modo: online
  // ---------------------------------------------------------------------------

  function ensureSocket() {
    if (socket) return socket;
    if (typeof window.io !== 'function') {
      showOnlineError('O modo online não está disponível (servidor não encontrado).');
      return null;
    }
    socket = window.io();

    socket.on('game:start', ({ gameId, code, options, seat, state, scores }) => {
      waitingCode = null;
      const isRematch = session && session.mode === 'online' && session.code === code && !session.ended;
      if (!isRematch) {
        beginSession(gameId, 'online', options);
        session.code = code;
        el.gameSubtitle.textContent = `Sala ${code}`;
      } else if (session.view.reset) {
        session.view.reset();
      }
      Object.assign(session, { seat, state, scores, pending: false, rematchMine: false, rematchTheirs: false });
      render();
    });

    socket.on('game:state', ({ state, scores }) => {
      if (!session || session.mode !== 'online') return;
      Object.assign(session, { state, scores, pending: false });
      render();
    });

    socket.on('game:rematch-requested', () => {
      if (!session || session.mode !== 'online') return;
      session.rematchTheirs = true;
      render();
    });

    socket.on('room:closed', ({ reason }) => {
      if (session && session.mode === 'online') {
        session.ended = true;
        session.endReason = reason === 'disconnected' ? 'opponent-disconnected' : 'opponent-left';
        render();
      }
    });

    socket.on('disconnect', () => {
      if (waitingCode) {
        waitingCode = null;
        resetOnlinePanel();
        showOnlineError('A conexão com o servidor caiu. Tente criar a sala novamente.');
      }
      if (session && session.mode === 'online' && !session.ended) {
        session.ended = true;
        session.endReason = 'connection-lost';
        render();
      }
    });

    return socket;
  }

  function showOnlineError(message) {
    el.onlineError.textContent = message;
    el.onlineError.hidden = !message;
  }

  function resetOnlinePanel() {
    el.onlineActions.hidden = false;
    el.onlineWaiting.hidden = true;
    el.btnCreateRoom.disabled = false;
    el.joinCode.value = '';
    setCodeState('');
    showOnlineError('');
  }

  /** Abre/fecha o painel online (botão "Jogar online"). */
  function setOnlineOpen(open) {
    el.onlineBody.hidden = !open;
    el.btnOnlineToggle.setAttribute('aria-expanded', String(open));
  }

  /** Validação visual do código: '' (neutro), 'valid' (4 letras) ou 'invalid'. */
  function setCodeState(state, message) {
    el.joinCode.dataset.state = state;
    el.joinCode.setAttribute('aria-invalid', String(state === 'invalid'));
    el.codeHint.textContent = message || (state === 'valid' ? 'Código completo. Toque em Entrar na sala.' : 'Digite as 4 letras do código.');
    if (state === 'invalid') {
      // reinicia a animação de "tremida"
      el.joinCode.classList.remove('shake');
      void el.joinCode.offsetWidth;
      el.joinCode.classList.add('shake');
    }
  }

  function cancelWaitingRoom() {
    if (waitingCode && socket) socket.emit('room:leave');
    waitingCode = null;
    resetOnlinePanel();
  }

  function createRoom() {
    const sock = ensureSocket();
    if (!sock) return;
    showOnlineError('');
    el.btnCreateRoom.disabled = true;
    const options = Games[selectedGameId].LEVELS ? { level } : undefined;
    sock.timeout(8000).emit('room:create', { gameId: selectedGameId, options }, (err, res) => {
      el.btnCreateRoom.disabled = false;
      if (err) return showOnlineError('Não foi possível conectar ao servidor.');
      if (!res.ok) return showOnlineError(res.error);
      waitingCode = res.code;
      el.roomCode.textContent = res.code;
      el.copyHint.textContent = 'Toque no código para copiar';
      el.onlineActions.hidden = true;
      el.onlineWaiting.hidden = false;
    });
  }

  function joinRoom(rawCode) {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) return setCodeState('invalid', 'O código tem 4 letras.');
    const sock = ensureSocket();
    if (!sock) return;
    showOnlineError('');
    sock.timeout(8000).emit('room:join', { code }, (err, res) => {
      if (err) return showOnlineError('Não foi possível conectar ao servidor.');
      if (!res.ok) return setCodeState('invalid', res.error);
      // A partida começa com o evento 'game:start'.
    });
  }

  function requestRematch() {
    if (!session || session.ended || session.rematchMine) return;
    session.rematchMine = true;
    socket.emit('game:rematch');
    render();
  }

  // ---------------------------------------------------------------------------
  // Renderização da tela de jogo
  // ---------------------------------------------------------------------------

  function render() {
    const s = session;
    if (!s || !s.state) return;
    const { state } = s;
    const over = state.winner !== null;

    // A interface só recebe o estado público (no Campo Minado, sem as minas).
    const shown = s.game.publicState ? s.game.publicState(state) : state;
    s.view.render(shown, {
      interactive: isMyTurn(),
      seat: s.seat,
      solo: s.solo,
      mode: s.mode,
      oppName: s.mode === 'cpu' ? 'CPU' : 'Adversário',
      ended: s.ended,
    });
    el.board.classList.toggle('disabled', s.ended);

    setScore(el.scoreMe, s.scores.me);
    setScore(el.scoreDraws, s.solo ? formatTime(s.scores.best) : s.scores.draws);
    setScore(el.scoreOpp, s.scores.opponent);
    // Indicador de quem lidera o placar da sessão
    el.scoreboard.classList.toggle('me-leading', s.scores.me > s.scores.opponent);
    el.scoreboard.classList.toggle('opp-leading', s.scores.opponent > s.scores.me);

    const { text, kind, badgeSeat } = statusInfo(s);
    el.status.className = 'status' + (kind ? ' ' + kind : '');
    el.status.innerHTML = '';
    if (badgeSeat !== null) el.status.insertAdjacentHTML('beforeend', s.viewDef.badge(badgeSeat));
    const span = document.createElement('span');
    span.textContent = text;
    el.status.appendChild(span);

    // Botões de fim de partida
    el.btnAgain.hidden = !over || s.ended;
    if (s.mode === 'cpu') {
      el.btnAgain.textContent = 'Jogar de novo';
      el.btnAgain.disabled = false;
    } else {
      el.btnAgain.textContent = s.rematchMine ? 'Aguardando adversário…' : s.rematchTheirs ? 'Aceitar revanche' : 'Revanche';
      el.btnAgain.disabled = s.rematchMine;
    }
    el.btnBackMenu.hidden = !s.ended;
  }

  /** Atualiza um número do placar com um "pulso" quando ele muda. */
  function setScore(node, value) {
    const text = String(value);
    if (node.textContent === text) return;
    const changed = node.textContent !== '' && node.dataset.ready === '1';
    node.textContent = text;
    node.dataset.ready = '1';
    if (changed) {
      node.classList.remove('bump');
      void node.offsetWidth;
      node.classList.add('bump');
    }
  }

  function formatTime(ms) {
    if (ms === null || ms === undefined) return '—';
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function statusInfo(s) {
    const { state, mode } = s;
    const opp = mode === 'cpu' ? 'O computador' : 'O adversário';

    if (s.solo) {
      if (state.winner === null) {
        const text = state.moveCount === 0 ? 'Toque numa casa para começar' : 'Abra todas as casas sem minas';
        return { text, kind: 'my-turn', badgeSeat: null };
      }
      if (state.winner === s.seat) {
        return { text: `Campo limpo em ${formatTime(state.endedAt - state.startedAt)}! 🎉`, kind: 'win', badgeSeat: null };
      }
      return { text: 'Você pisou numa mina! 💥', kind: 'lose', badgeSeat: null };
    }

    if (s.ended) {
      const messages = {
        'opponent-disconnected': 'O adversário se desconectou. Partida encerrada.',
        'opponent-left': 'O adversário saiu da sala. Partida encerrada.',
        'connection-lost': 'Você perdeu a conexão com o servidor. Partida encerrada.',
      };
      return { text: messages[s.endReason] || 'Partida encerrada.', kind: 'draw', badgeSeat: null };
    }

    if (state.winner !== null) {
      let result;
      let kind;
      if (state.winner === 'draw') {
        result = 'Empate!';
        kind = 'draw';
      } else if (state.winner === s.seat) {
        result = 'Você venceu! 🎉';
        kind = 'win';
      } else {
        result = `${opp} venceu.`;
        kind = 'lose';
      }
      const detail = s.game.resultDetail ? s.game.resultDetail(state, s.seat) : '';
      if (detail) result += ' ' + detail;
      if (mode === 'online' && s.rematchTheirs && !s.rematchMine) result += ' O adversário quer revanche!';
      return { text: result, kind, badgeSeat: null };
    }

    const names = s.game.playerNames;
    if (state.turn === s.seat) {
      let text = s.pending ? 'Enviando jogada…' : `Sua vez (${names[s.seat]})`;
      if (!s.pending && s.game.hasCaptures && s.game.hasCaptures(state)) text += ' — captura obrigatória!';
      const note = s.game.statusNote ? s.game.statusNote(state) : '';
      if (note && !s.pending) text += ' — ' + note;
      return { text, kind: 'my-turn', badgeSeat: s.seat };
    }
    const waitText = mode === 'cpu' ? 'Computador pensando…' : 'Vez do adversário';
    return { text: `${waitText} (${names[1 - s.seat]})`, kind: '', badgeSeat: 1 - s.seat };
  }

  let toastTimer = null;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
  }

  // ---------------------------------------------------------------------------
  // Eventos da interface
  // ---------------------------------------------------------------------------

  document.querySelectorAll('[data-action="home"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      cancelWaitingRoom();
      selectedGameId = null;
      showScreen('home');
    })
  );

  el.difficultyButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      difficulty = btn.dataset.difficulty;
      storageSet('hub.difficulty', difficulty);
      renderModeOptions();
    })
  );

  el.cpuTypeButtons.forEach((btn) =>
    btn.addEventListener('click', () => {
      cpuType = btn.dataset.cpuType;
      storageSet('hub.cpuType', cpuType);
      renderModeOptions();
    })
  );

  el.btnPlayCpu.addEventListener('click', () => {
    cancelWaitingRoom();
    startCpuSession();
  });
  el.btnCreateRoom.addEventListener('click', createRoom);
  el.joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    joinRoom(el.joinCode.value);
  });
  el.joinCode.addEventListener('input', () => {
    el.joinCode.value = el.joinCode.value.toUpperCase().replace(/[^A-Z]/g, '');
    setCodeState(el.joinCode.value.length === 4 ? 'valid' : '');
  });
  el.btnOnlineToggle.addEventListener('click', () => {
    const open = el.onlineBody.hidden;
    setOnlineOpen(open);
    if (open) el.btnCreateRoom.focus({ preventScroll: true });
  });
  el.btnCancelRoom.addEventListener('click', cancelWaitingRoom);
  el.roomCode.addEventListener('click', () => {
    const code = el.roomCode.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(
        () => { el.copyHint.textContent = 'Código copiado!'; },
        () => { el.copyHint.textContent = 'Não foi possível copiar.'; }
      );
    }
  });

  el.btnAgain.addEventListener('click', () => {
    if (!session) return;
    if (session.mode === 'cpu') startCpuMatch();
    else requestRematch();
  });
  el.btnMenu.addEventListener('click', goToMenu);
  el.btnBackMenu.addEventListener('click', goToMenu);

  // ---------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------

  if (!DIFFICULTY_LABEL[difficulty]) difficulty = 'medium';
  if (cpuType !== 'solo' && cpuType !== 'versus') cpuType = 'solo';
  renderHome();
  renderModeOptions();
  history.replaceState({ screen: 'home' }, '');
})();
