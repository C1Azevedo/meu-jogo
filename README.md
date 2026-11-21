# Hub de Jogos

Jogo da Velha, Ligue 4, Damas, Xadrez e Campo Minado no navegador: contra o computador (3 dificuldades) ou online 1x1 com um amigo, usando um código de sala. E a **Dupla Tropical**, um jogo de plataforma cooperativo online para dois celulares.

- **Servidor:** Node.js, Express e Socket.IO
- **Front-end:** HTML, CSS e JavaScript puro (sem framework, sem etapa de build)
- **Responsivo:** feito para funcionar bem no celular
- **Visual:** cartaz de outdoor ao pôr do sol na costa tropical, com ilustrações e cenário originais em SVG/CSS

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

## Dupla Tropical (plataforma cooperativa online)

Tuca e Mel atravessam uma ilha tropical juntos: pegam moedas, desviam de caranguejos e águas-vivas e precisam chegar **os dois** à bandeira. Cada pessoa joga no próprio celular (ou computador). Personagens, mundo, desenhos e músicas são originais, feitos em código.

### Como jogar

1. Na tela inicial, escolha **Dupla Tropical**, a fase inicial e toque em **Criar sala**.
2. O parceiro escolhe **Dupla Tropical**, digita o código de 4 letras e toca em **Entrar na sala**. (Se ele digitar o código na tela de outro jogo, o hub leva para a sala certa.)
3. No celular, jogue com a tela **deitada**. Se estiver em pé, o jogo pede para girar.

| | Celular | Computador |
|---|---|---|
| Andar | botões ◀ ▶ (dá para deslizar o polegar de um para o outro) | setas ou A/D |
| Pular | botão **Pular** (quanto mais tempo segurar, mais alto) | espaço, W ou seta para cima |

Os botões da tela aceitam vários dedos ao mesmo tempo (segurar "direita" e apertar "pular", por exemplo). O botão 🔊 liga e desliga o som, e a escolha fica salva no aparelho.

### Cooperação

- **Ombros:** pulando sozinho, dá para subir 3 blocos; em cima dos ombros do parceiro, 4. Quem está em cima é carregado quando o de baixo anda.
- **Botão no alto:** um sobe nos ombros do outro e aperta o botão que abre a porta para o parceiro passar.
- **Porta de dois botões:** só abre com os dois botões apertados **ao mesmo tempo** (um caixote também aperta um botão). Depois de aberta, fica aberta.
- **Bloco pesado (2×):** só se move com os dois empurrando juntos. Encostado na parede, vira degrau para subir 5 blocos.
- **Bolha:** quem cai num buraco, encosta em inimigo ou em espinhos vira uma bolha que flutua até o parceiro. Basta encostar nela para resgatar. Só há **fim de jogo** se os dois estiverem em bolha ao mesmo tempo, ou se o tempo acabar. Aí os dois votam em "Tentar de novo" e recomeçam do último **checkpoint**, com as moedas já pegas.

Itens e inimigos: **moedas**, **carambola estelar** (8 s de invencibilidade e mais velocidade: derruba inimigos encostando), **caranguejo-beliscão** (pule em cima dele), **água-viva** (flutua para cima e para baixo), **espinhos** e o chefe **Rei Beliscão**. O chefe precisa de 3 pisões, fica invencível um instante depois de cada um e mais rápido a cada vida perdida. A porta da saída abre quando ele cai.

O placar é compartilhado: moedas, tempo restante e bolhas (mortes). Ele aparece no alto da tela, junto com o **ping**.

### As 5 fases

1. **Praia do Coqueiro:** ensina pulo, vãos, caranguejos e a porta de dois botões.
2. **Bosque das Bromélias:** ombros, botão no alto, águas-vivas e caixote.
3. **Caverna de Cristal:** bloco pesado, espinhos e dois checkpoints.
4. **Ponte das Nuvens:** tudo junto, com mais vãos.
5. **Covil do Rei Beliscão:** o caminho até a arena e a luta contra o chefe.

### Online: como funciona

- **Servidor autoritativo** (`coop-server.js`, namespace Socket.IO `/coop`): guarda o mundo e simula física e colisões a **30 ticks/s** com o mesmo motor do cliente (`games/platformer.js`). O cliente só manda as teclas apertadas, numeradas. Entradas repetidas, fora de ordem ou com campos forjados são ignoradas.
- **Previsão local:** o próprio personagem anda na hora, rodando o mesmo motor no celular. Quando chega o estado oficial, o cliente volta para a posição do servidor e reaplica as teclas que o servidor ainda não processou. A pequena diferença que sobra é desfeita aos poucos.
- **Interpolação:** o parceiro, os inimigos e os caixotes são desenhados uns 100 ms no passado, entre dois estados recebidos, para o movimento ficar suave mesmo com rede irregular.
- **Queda e atraso:**
  - Se alguém perde a conexão, o jogo **pausa** para os dois e a vaga fica guardada por **30 s**. O celular reconecta sozinho (ou pelo botão "Reconectar agora"). Se a pessoa recarregar a página, também volta automaticamente para a mesma sala.
  - Se alguém fica 3 s sem mandar nada (rede muito lenta, aba em segundo plano), o jogo pausa e volta sozinho quando a conexão melhora.

### Criar uma fase nova

As fases ficam em `games/platformer-levels.js`, como **texto**: cada fase é uma lista de 15 linhas, todas do mesmo tamanho, e cada caractere é um bloco. Para criar uma fase, copie uma existente, edite o mapa e acrescente no fim da lista. Ela aparece sozinha no seletor de fase.

```
.  vazio              #  chão              =  tijolo            -  plataforma vazada
o  moeda              x  espinhos          *  carambola estelar
c  caranguejo         j  água-viva         K  chefe
k  caixote            H  bloco pesado 2×2 (canto de cima à esquerda)
_  botão de pressão   D  porta (cada botão abre a porta mais próxima; porta sem botões abre com o chefe derrotado)
C  checkpoint         F  bandeira final    1 2  início da Tuca e do Mel
```

Limites da física para desenhar: sozinho sobe 3 blocos, nos ombros 4, do bloco pesado 5; vão de até 3 blocos; espinhos de até 2. Rode `npm test`: o teste confere se a fase é válida e um **robô cooperativo** (`test/helpers/coop-bot.js`) joga as fases com os dois personagens, subindo nos ombros, apertando botões e empurrando o bloco pesado. O teste falha se alguma fase não puder ser concluída.

## Visual

O tema lembra um cartaz de outdoor ao pôr do sol numa cidade costeira tropical: céu rosa e laranja, nuvens iluminadas por baixo, mar azul-turquesa e palmeiras. A inspiração é só estética. Todas as ilustrações são originais, feitas em SVG e CSS; não há logotipos, personagens, fontes ou imagens de terceiros.

- **Tokens de design:** todas as cores ficam em `public/css/tokens.css`: preto `#000000` (calhas e sombras), crepúsculo `#2B1450`, flamingo `#FF4F9A`, tangerina `#FF8A3D`, luz dourada `#FFD27A`, lagoa `#22C7C4`, areia `#FFF4E6` e verde de placar `#7CDB6A`. Os gradientes, sombras, fontes e as cores dos tabuleiros também ficam lá. Para ajustar o tema, basta mexer nesse arquivo.
- **Fontes locais:** Anton (letreiros) e Inter (textos) ficam em `public/fonts/`, com licença SIL OFL. Nada vem de CDN, então os jogos contra o computador funcionam sem internet (o app está pronto para virar PWA).
- **Tela inicial em mosaico:** cada jogo é um painel de cartaz com sua própria cor de céu, separado dos outros por calhas pretas. Xadrez e Dupla Tropical são os painéis grandes. O título "Hub de Jogos" tem o pôr do sol pintado dentro das letras e sombra preta dura.
- **Menus:** cantos retos, botões que parecem adesivos (borda e sombra pretas), e a opção escolhida vira uma faixa clara com texto preto. A dificuldade aparece como estrelas de "nível de procurado". O código da sala aparece numa placa de carro.
- **Partida:** o placar usa números grandes de painel de jogo (verde para você, rosa para o adversário). O aviso de turno fica numa caixa escura e o resultado vira uma faixa de cartaz (dourada na vitória, vermelha na derrota).
- **Cenário:** céu de fim de tarde, sol com halo, nuvens em faixas, skyline com janelas acesas, mar com reflexo e palmeiras, tudo num SVG leve dentro do `index.html`. Nas telas de partida o cenário fica coberto por um véu escuro, para nunca competir com o tabuleiro.
- **Legibilidade dos tabuleiros:** a moldura é preta e grossa; as casas são opacas e de alto contraste. No Xadrez, as casas são areia e rosa queimado, as peças brancas têm contorno escuro e as pretas têm uma borda clara.
- **Layout:**
  - Celular: mosaico em duas colunas e tabuleiro na largura toda.
  - Notebook, desktop e tablet deitado: placar e status numa coluna lateral, com o tabuleiro grande ao lado e limitado pela altura da tela, para caber inteiro.
  - Telas de toque: casas do Campo Minado com pelo menos 26 px.
- **Animações:** poucas e ligadas a ações (aproximação da arte no hover, pulso do placar, entrada da faixa de resultado, tabuleiro e xeque). Com `prefers-reduced-motion` ativado, todas são desligadas.

## Organização do código

```
server.js             Servidor Express + Socket.IO (salas, validação das jogadas, revanche, desconexão)
games/                Lógica pura dos jogos e da IA, compartilhada entre servidor e navegador
  tictactoe.js          Regras do Jogo da Velha
  connect4.js           Regras do Ligue 4
  checkers.js           Regras das Damas
  minesweeper.js        Regras do Campo Minado (inclui o estado público, sem as minas)
  chess.js              Regras do Xadrez
  platformer.js         Motor da Dupla Tropical (física, colisões, regras; servidor e previsão no cliente)
  platformer-levels.js  As fases da Dupla Tropical (dados em texto)
coop-server.js        Salas em tempo real da Dupla Tropical (30 ticks/s, pausa e reconexão)
  ai.js                 IA: minimax com poda alfa-beta e IA de dedução do Campo Minado
public/               Front-end estático
  index.html            As três telas (início, modo e jogo) e o cenário em SVG
  css/tokens.css        Tokens de design: cores, gradientes, sombras e @font-face
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
  js/platformer.js      Cartão e seletor de fase da Dupla Tropical no hub
  js/coop/sprites.js    Pixel art, terreno e cenário com parallax (tudo desenhado em código)
  js/coop/input.js      Teclado e botões de toque com multitoque
  js/coop/audio.js      Efeitos e música sintetizados com Web Audio
  js/coop/game.js       Cliente: canvas, previsão local, interpolação, placar e avisos
test/                 Testes automatizados (node --test)
  helpers/coop-bot.js   Robô cooperativo que prova que todas as fases têm solução
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
- O Render tem suporte a WebSocket, que a Dupla Tropical usa para o tempo real. Num servidor gratuito, o ping costuma ficar entre 50 e 150 ms, e a previsão local esconde esse atraso no próprio personagem.
- As salas ficam na memória do servidor. Se ele reiniciar ou dormir, as partidas online em andamento são encerradas. Para este projeto isso basta, e por isso use **uma única instância**: com várias instâncias, cada uma teria as próprias salas.
- A cada `git push` na branch configurada, o Render faz o deploy de novo automaticamente.
