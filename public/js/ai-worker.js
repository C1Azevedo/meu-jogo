/**
 * Web Worker da IA: roda a busca fora da thread da interface, para a tela
 * nunca travar enquanto o computador pensa (importante no Xadrez).
 * Usa exatamente os mesmos arquivos de regras e IA do servidor.
 *
 * Mensagem recebida: { id, gameId, state, difficulty }
 * Resposta:          { id, move }  ou  { id, error }
 */
/* global importScripts */
importScripts(
  '/games/tictactoe.js',
  '/games/connect4.js',
  '/games/checkers.js',
  '/games/minesweeper.js',
  '/games/ai.js'
);

self.onmessage = (event) => {
  const { id, gameId, state, difficulty } = event.data;
  try {
    const game = self.Games[gameId];
    const move = self.Games.ai.chooseMove(game, state, difficulty);
    self.postMessage({ id, move });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
