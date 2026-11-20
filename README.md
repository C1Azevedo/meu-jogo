# Hub de Jogos

Jogo da Velha, Ligue 4, Damas, Xadrez e Campo Minado no navegador: contra o computador (3 dificuldades) ou online 1x1 com um amigo, usando um código de sala.

- **Servidor:** Node.js, Express e Socket.IO
- **Front-end:** HTML, CSS e JavaScript puro (sem framework, sem etapa de build)
- **Responsivo:** feito para funcionar bem no celular
- **Visual:** tema neon "Miami anos 80", com ilustrações e cenário originais em SVG/CSS

## Rodar localmente

Pré-requisito: [Node.js](https://nodejs.org/) 18 ou mais recente.

```bash
npm install
```

```bash
npm start
```

Depois é só abrir <http://localhost:3000>.

Para testar o modo online sozinho, abra duas abas (ou uma aba normal e uma anônima): crie a sala em uma e entre com o código na outra. Para jogar com alguém na mesma rede Wi-Fi, a outra pessoa acessa `http://SEU-IP-LOCAL:3000`.

Outros comandos:

```bash
npm test      # roda os testes (regras, IA e servidor online)
```

```bash
npm run dev   # reinicia o servidor sozinho quando um arquivo muda
```

A porta pode ser trocada com a variável `PORT` (ex.: `PORT=8080 npm start`).

## Como jogar

1. **Início:** escolha o jogo.
2. **Modo:**
   - **Contra o computador:** escolha *Fácil*, *Médio* ou *Difícil* e toque em *Jogar*. Quem começa alterna a cada partida.
   - **Jogar online:** *Criar sala* gera um código de 4 letras para passar ao amigo; ele digita o código e toca em *Entrar*.
3. **Partida:** a barra de status mostra de quem é a vez e o resultado. O placar conta as partidas da sessão. No fim, use *Jogar de novo* (computador) ou *Revanche* (online; a partida recomeça quando os dois aceitam, e quem jogou em segundo passa a começar).

Se o adversário fechar a página ou cair a conexão, a partida é encerrada e aparece um aviso.

### Dificuldades

| Nível   | Como a IA joga |
|---------|----------------|
| Fácil   | Na maioria das vezes joga aleatoriamente. Às vezes aproveita uma vitória imediata, mas não se defende: erra de propósito. |
| Médio   | Olha 2 lances à frente (3 nas Damas): ganha quando pode e bloqueia as ameaças óbvias. |
| Difícil | Minimax com poda alfa-beta e aprofundamento iterativo. No Jogo da Velha a busca é completa (não perde nunca). No Ligue 4, nas Damas e no Xadrez a busca vai aprofundando até esgotar o tempo (cerca de 1,5 s). |

No Xadrez:

- **Fácil:** joga quase ao acaso, com erros de propósito.
- **Médio:** minimax de profundidade 2 que só conta material.
- **Difícil:** alfa-beta com material e posição das peças (tabelas por casa), mais uma busca de quiescência que continua analisando as capturas no fim da busca. Assim a IA não avalia a posição no meio de uma troca de peças. Em 1,5 s ela chega a 4 ou 5 lances de profundidade.

A IA roda num **Web Worker** (`public/js/ai-worker.js`), fora da thread da interface, então a tela nunca trava enquanto o computador pensa. Se o navegador não suportar Workers, a IA roda na thread principal.

No Campo Minado a IA não usa minimax, e sim dedução (veja abaixo).

### Regras das Damas (regras brasileiras)

- Tabuleiro 8×8, peças nas casas escuras; as brancas começam.
- A pedra anda uma casa na diagonal, para frente.
- **Captura obrigatória.** A pedra captura para frente e para trás.
- **Capturas múltiplas** na mesma jogada. Toque em cada casa onde a peça pousa, na ordem.
- **Lei da maioria:** havendo mais de uma captura possível, é obrigatório escolher a que captura mais peças.
- As peças capturadas só saem do tabuleiro no fim da jogada e não podem ser puladas duas vezes.
- **Promoção a dama** quando a pedra termina a jogada na última linha. A **dama é voadora**: anda e captura a qualquer distância na diagonal.
- Perde quem fica sem peças ou sem movimentos. Empate depois de 20 lances seguidos de cada lado só com damas e sem captura.

### Xadrez

Regras completas:

- Todos os movimentos, xeque e xeque-mate. Peça cravada não pode deixar o rei em xeque.
- **Roque** pequeno e grande. Não vale se o rei estiver em xeque ou passar por casa atacada, e o direito se perde quando o rei ou a torre se movem, ou quando a torre é capturada.
- **En passant**, só no lance imediatamente seguinte.
- **Promoção** do peão: aparece uma janela para escolher dama, torre, bispo ou cavalo.
- **Empates:** afogamento, **repetição tripla**, **regra dos 50 lances** e material insuficiente (por exemplo, rei contra rei). Para simplificar, a repetição tripla e os 50 lances encerram a partida automaticamente, sem precisar reivindicar.

Na tela: o tabuleiro fica virado para quem joga de pretas. Ao tocar numa peça, aparecem as casas possíveis (ponto para casa livre, anel para captura). O último lance fica marcado, o rei em xeque fica em vermelho, a barra de status avisa "Xeque!" e cada lado mostra as peças que capturou e a vantagem de material. No online, quem cria a sala joga de brancas e a revanche troca as cores.

O gerador de jogadas é conferido nos testes com **perft**: a contagem de todas as posições possíveis a partir de posições de referência ("Kiwipete" e outras) bate com os valores conhecidos.

### Campo Minado

- **Tabuleiros:** Fácil (9×9, 10 minas), Médio (16×16, 40 minas) e Difícil (30×16, 99 minas).
- O primeiro clique nunca cai em mina e sempre abre uma área: as minas só são sorteadas depois dele, longe da casa clicada.
- Casas sem minas ao redor abrem as vizinhas automaticamente.
- **Bandeira:** clique direito, toque longo no celular ou o botão ⛏️/🚩 da barra, que alterna o que o toque faz. As bandeiras ficam só no seu aparelho.
- Cronômetro e contador de minas restantes (minas menos bandeiras).

Modos:

- **Desafio solo:** abra todas as casas sem minas. O placar mostra vitórias, derrotas e o melhor tempo da sessão.
- **Contra a CPU:** você e a CPU se alternam no mesmo tabuleiro, e quem pisar numa mina perde. Se o campo for limpo sem explosão, vence quem abriu mais casas. Dificuldades da CPU:
  - **Fácil:** chuta casas ao acaso.
  - **Médio:** usa deduções simples (um número já cercado pelas suas minas libera as outras vizinhas; um número com tantas vizinhas fechadas quanto minas faltando marca todas como minas) e só chuta quando não há casa segura.
  - **Difícil:** deduções por restrições e probabilidade. A IA enumera todas as combinações de minas possíveis na "fronteira" (casas fechadas vizinhas de números), pondera pelo número de jeitos de distribuir as minas restantes no interior e abre a casa com menor chance de mina. Jogando sozinha, vence cerca de 95% das partidas no Fácil, 80% no Médio e 35% no Difícil.
- **Online:** mesmas regras do modo contra a CPU. Quem cria a sala escolhe o tabuleiro.

A IA joga de forma justa: ela só enxerga o mesmo que você (as casas abertas), nunca as minas.

### Ligue 4

Tabuleiro de 6×7. Vence quem alinhar 4 peças na horizontal, na vertical ou em qualquer uma das diagonais. Com o tabuleiro cheio e ninguém alinhado, dá empate.

## Visual

O tema é inspirado na estética neon de Miami nos anos 80 (pôr do sol tropical, palmeiras, skyline e brilho de fliperama). Todas as ilustrações são originais, feitas em SVG e CSS; não há imagens nem marcas de terceiros.

- **Tokens de design:** todas as cores (rosa neon `#FF1493`, magenta `#D900FF`, roxo profundo `#18082E`, roxo `#32105C`, turquesa `#00E5E5`, laranja `#FF8C42`, dourado `#FFD166`), gradientes, brilhos, fontes e as cores dos tabuleiros ficam em `public/css/tokens.css`. Para ajustar o tema, basta mexer nesse arquivo.
- **Fontes locais:** Anton (títulos) e Inter (textos) ficam em `public/fonts/`, com licença SIL OFL. Nada vem de CDN, então os jogos contra o computador funcionam sem internet (o app está pronto para virar PWA).
- **Cenário:** céu de pôr do sol, sol retrô com faixas, skyline com janelas neon, água com reflexo e palmeiras, tudo num SVG leve dentro do `index.html`. Nas telas de partida o cenário fica coberto por um véu escuro, para nunca competir com o tabuleiro.
- **Legibilidade dos tabuleiros:** o brilho neon fica só na moldura; as casas são opacas e de alto contraste. No Xadrez, as casas são rosa claro e lilás, as peças brancas têm contorno escuro e as pretas têm uma borda clara.
- **Layout:**
  - Celular: cartões horizontais e tabuleiro na largura toda.
  - Notebook, desktop e tablet deitado: placar e status numa coluna lateral, com o tabuleiro grande ao lado e limitado pela altura da tela, para caber inteiro.
  - Telas de toque: casas do Campo Minado com pelo menos 26 px.
- **Animações:** são sutis (entrada das telas e dos cartões, brilho pulsante, elevação no hover, pulso do placar, do turno e do xeque). Com `prefers-reduced-motion` ativado, todas são desligadas.

## Organização do código

```
server.js             Servidor Express + Socket.IO (salas, validação das jogadas, revanche, desconexão)
games/                Lógica pura dos jogos e da IA, compartilhada entre servidor e navegador
  tictactoe.js          Regras do Jogo da Velha
  connect4.js           Regras do Ligue 4
  checkers.js           Regras das Damas
  minesweeper.js        Regras do Campo Minado (inclui o estado público, sem as minas)
  chess.js              Regras do Xadrez
  ai.js                 IA: minimax com poda alfa-beta e IA de dedução do Campo Minado
public/               Front-end estático
  index.html            As três telas (início, modo e jogo) e o cenário em SVG
  css/tokens.css        Tokens de design: cores, gradientes, brilhos e @font-face
  css/style.css         Base, cenário, tela inicial e componentes compartilhados
  css/games.css         Tabuleiros e peças de cada jogo
  fonts/                Anton e Inter (woff2) e suas licenças OFL
  js/app.js             Navegação, modo contra o computador, modo online e placar
  js/tictactoe.js       Interface do Jogo da Velha
  js/connect4.js        Interface do Ligue 4
  js/checkers.js        Interface das Damas
  js/minesweeper.js     Interface do Campo Minado
  js/chess.js           Interface do Xadrez
  js/ai-worker.js       Web Worker que roda a IA fora da thread da interface
test/                 Testes automatizados (node --test)
```

Cada arquivo em `games/` segue a mesma interface (`createState`, `getMoves`, `applyMove`, `evaluate`, `moveKey`) e funciona tanto com `require()` no Node quanto com `<script>` no navegador. Assim, a IA roda no navegador e o servidor valida as jogadas online com exatamente as mesmas regras.

Ganchos opcionais, usados por jogos que precisam deles:

- `publicState(state)`: o que pode ser mostrado ao jogador. No Campo Minado, é o estado sem as minas.
- `onlineOptions(options)`: valida as opções que o cliente manda ao criar a sala (por exemplo, o nível do tabuleiro).
- `LEVELS`: mostra o seletor de tabuleiro na tela de modo.
- `resultDetail(state, seat)` e `statusNote(state)`: textos extras na barra de status (por exemplo, "Xeque!" e o motivo do empate).
- Em `game.ai`: `mediumEvaluate` (avaliação própria do nível médio) e `quiescence` (busca de quiescência no difícil, usando `noisyMoves`).

**O servidor nunca confia no cliente.** No modo online, o estado da partida fica no servidor. O cliente só manda a jogada que quer fazer. O servidor confere se é a vez daquele jogador e procura a jogada entre as jogadas legais calculadas por ele. Se não encontrar, recusa. Na jogada aceita, ele aplica a versão que ele mesmo calculou (por exemplo, as peças capturadas nas Damas) e envia o novo estado para os dois jogadores.

No Campo Minado o tabuleiro fica só no servidor. Os jogadores recebem apenas o estado público (casas abertas e seus números), e as posições das minas só são enviadas quando a partida termina. Os testes registram todas as mensagens que chegam aos clientes e conferem que nenhuma delas contém as minas.

### Adicionar um jogo novo

1. Crie `games/meujogo.js` com a mesma interface dos outros jogos (copie `tictactoe.js` como modelo).
2. Registre o jogo em `GAMES`, no topo de `server.js`.
3. Crie `public/js/meujogo.js` com a interface (`icon`, `description`, `badge`, `create`).
4. Inclua os dois scripts em `public/index.html`, adicione o id em `GAME_ORDER` (`public/js/app.js`) e o arquivo de regras no `importScripts` de `public/js/ai-worker.js`.

## Deploy no Render

O [Render](https://render.com) roda o servidor Node com suporte a WebSocket, inclusive no plano gratuito.

1. Suba este projeto para um repositório no GitHub.
2. No Render, clique em **New → Web Service** e conecte o repositório.
3. Configure:
   - **Language / Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (serve para começar)
   - Opcional: em **Advanced → Health Check Path**, use `/healthz`.
4. Clique em **Create Web Service**. Quando terminar, o Render mostra a URL pública (algo como `https://hub-de-jogos.onrender.com`). Mande o link para o seu amigo e joguem online.

Observações:

- Não é preciso configurar a porta: o Render define a variável `PORT` e o servidor já usa essa variável.
- No plano gratuito, o serviço "dorme" depois de um tempo sem acesso. O primeiro acesso depois disso pode levar cerca de um minuto.
- As salas ficam na memória do servidor. Se ele reiniciar ou dormir, as partidas online em andamento são encerradas. Para este projeto isso basta, e por isso use **uma única instância**: com várias instâncias, cada uma teria as próprias salas.
- A cada `git push` na branch configurada, o Render faz o deploy de novo automaticamente.
