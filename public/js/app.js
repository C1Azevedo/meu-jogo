/**
 * Controlador do Hub de Jogos: navegação entre telas, partidas contra o
 * computador (IA roda no navegador) e partidas online (estado no servidor).
 *
 * Cada jogo fornece:
 *   - window.Games[id]   → regras (mesmo arquivo usado pelo servidor)
 *   - window.UI.views[id] → interface: { icon, description, badge(seat), create(container, { onMove }) }
 */
(function () {
  'use strict';

  const Games = window.Games;
  const UI = window.UI;
  const GAME_ORDER = ['tictactoe', 'connect4', 'checkers'].filter((id) => Games[id] && UI.views[id]);
  const CPU_DELAY_MS = 450;
  const DIFFICULTY_LABEL = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };

  const $ = (sel) => document.querySelector(sel);
  const el = {
    screens: { home: $('#screen-home'), mode: $('#screen-mode'), game: $('#screen-game') },
    gameList: $('#game-list'),
    modeTitle: $('#mode-title'),
    difficultyButtons: document.querySelectorAll('[data-difficulty]'),
    btnPlayCpu: $('#btn-play-cpu'),
    btnCreateRoom: $('#btn-create-room'),
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
  let socket = null;
  let waitingCode = null; // sala criada aguardando adversário
  let currentScreen = 'home';

  /**
   * Sessão de jogo ativa (null fora da tela de jogo).
   * { gameId, game, viewDef, view, mode: 'cpu'|'online', difficulty, seat, state,
   *   scores: {me, opponent, draws}, matchCount, cpuTimer, pending, code,
   *   ended, endReason, rematchMine, rematchTheirs }
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
    for (const id of GAME_ORDER) {
      const view = UI.views[id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'game-card';
      card.innerHTML = `${view.icon}<h3>${Games[id].name}</h3><p>${view.description}</p>`;
      card.addEventListener('click', () => openMode(id));
      el.gameList.appendChild(card);
    }
  }

  function openMode(gameId) {
    selectedGameId = gameId;
    el.modeTitle.textContent = Games[gameId].name;
    resetOnlinePanel();
    showScreen('mode');
  }

  function renderDifficulty() {
    el.difficultyButtons.forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.difficulty === difficulty));
    });
  }

  // ---------------------------------------------------------------------------
  // Sessão de jogo (comum aos dois modos)
  // ---------------------------------------------------------------------------

  function beginSession(gameId, mode) {
    endSession();
    selectedGameId = gameId;
    const viewDef = UI.views[gameId];
    session = {
      gameId,
      game: Games[gameId],
      viewDef,
      view: null,
      mode,
      difficulty,
      seat: 0,
      state: null,
      scores: { me: 0, opponent: 0, draws: 0 },
      matchCount: 0,
      cpuTimer: null,
      pending: false,
      code: null,
      ended: false,
      endReason: null,
      rematchMine: false,
      rematchTheirs: false,
    };
    session.view = viewDef.create(el.board, { onMove: handleUserMove });
    el.gameTitle.textContent = session.game.name;
    el.oppLabel.textContent = mode === 'cpu' ? 'Computador' : 'Adversário';
    el.gameSubtitle.textContent = mode === 'cpu' ? DIFFICULTY_LABEL[difficulty] : '';
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
    if (state.winner === 'draw') s.scores.draws++;
    else if (state.winner === s.seat) s.scores.me++;
    else s.scores.opponent++;
  }

  // ---------------------------------------------------------------------------
  // Modo: contra o computador
  // ---------------------------------------------------------------------------

  function startCpuSession() {
    beginSession(selectedGameId, 'cpu');
    startCpuMatch();
  }

  function startCpuMatch() {
    const s = session;
    clearTimeout(s.cpuTimer);
    // Alterna quem começa a cada partida.
    s.seat = s.matchCount % 2 === 0 ? 0 : 1;
    s.matchCount++;
    s.state = s.game.createState();
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
    s.cpuTimer = setTimeout(() => {
      // Descarta se o usuário saiu ou reiniciou nesse meio-tempo.
      if (session !== s || s.state !== stateAtSchedule) return;
      const move = Games.ai.chooseMove(s.game, s.state, s.difficulty);
      if (move !== null && move !== undefined) applyLocalMove(move);
    }, CPU_DELAY_MS);
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

    socket.on('game:start', ({ gameId, code, seat, state, scores }) => {
      waitingCode = null;
      const isRematch = session && session.mode === 'online' && session.code === code && !session.ended;
      if (!isRematch) {
        beginSession(gameId, 'online');
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
    showOnlineError('');
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
    sock.timeout(8000).emit('room:create', { gameId: selectedGameId }, (err, res) => {
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
    if (!/^[A-Z]{4}$/.test(code)) return showOnlineError('O código tem 4 letras.');
    const sock = ensureSocket();
    if (!sock) return;
    showOnlineError('');
    sock.timeout(8000).emit('room:join', { code }, (err, res) => {
      if (err) return showOnlineError('Não foi possível conectar ao servidor.');
      if (!res.ok) return showOnlineError(res.error);
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

    s.view.render(state, { interactive: isMyTurn(), seat: s.seat });
    el.board.classList.toggle('disabled', s.ended);

    el.scoreMe.textContent = s.scores.me;
    el.scoreDraws.textContent = s.scores.draws;
    el.scoreOpp.textContent = s.scores.opponent;

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

  function statusInfo(s) {
    const { state, mode } = s;
    const opp = mode === 'cpu' ? 'O computador' : 'O adversário';

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
      if (mode === 'online' && s.rematchTheirs && !s.rematchMine) result += ' O adversário quer revanche!';
      return { text: result, kind, badgeSeat: null };
    }

    const names = s.game.playerNames;
    if (state.turn === s.seat) {
      return { text: s.pending ? 'Enviando jogada…' : `Sua vez (${names[s.seat]})`, kind: 'my-turn', badgeSeat: s.seat };
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
      renderDifficulty();
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
  renderHome();
  renderDifficulty();
  history.replaceState({ screen: 'home' }, '');
})();
