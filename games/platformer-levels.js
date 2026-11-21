/**
 * Dupla Tropical — fases (dados puros).
 *
 * Cada fase é um objeto { name, theme, time, map }:
 *   - name:  nome mostrado no início da fase
 *   - theme: cenário de fundo ('praia', 'bosque', 'caverna', 'nuvens', 'vulcao')
 *   - time:  tempo limite em segundos
 *   - map:   linhas de texto, todas com o mesmo tamanho, 15 linhas de altura.
 *            Cada caractere é um bloco de 16 px:
 *
 *   .  vazio              #  chão              =  tijolo            -  plataforma vazada
 *   o  moeda              x  espinhos          *  carambola estelar (poder por 8 s)
 *   c  caranguejo         j  água-viva         K  chefe (Rei Beliscão)
 *   k  caixote (1 jogador empurra)             H  bloco pesado 2x2 (os dois empurram juntos)
 *   _  botão de pressão   D  porta (abre quando TODOS os botões entre a porta anterior e
 *                                   ela estão apertados ao mesmo tempo; sem botões, abre
 *                                   quando o chefe é derrotado)
 *   C  checkpoint         F  bandeira final    1 2  início da Tuca e do Mel
 *
 * Alturas (física): pulando sozinho, alcança 3 blocos; nos ombros do parceiro, 4;
 * em cima do bloco pesado, 5. O maior vão que dá para pular com segurança é de 3 blocos.
 *
 * Para criar uma fase nova: copie uma fase, edite o mapa e acrescente no fim da lista.
 * O teste test/platformer.test.js confere se toda fase é válida.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Games = root.Games || {}).platformerLevels = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return [
    {
      name: 'Praia do Coqueiro',
      theme: 'praia',
      time: 200,
      map: [
        '........................................................................................................................',
        '........................................................................................................................',
        '........................................................................................................................',
        '........................................................................................................................',
        '........................................................................................................................',
        '........................................................................................................................',
        '.....................................................ooo................................................................',
        '....................................................-----...............................................................',
        '..............................oooooo....................................................................................',
        '...............................................ooo.........ooo..............................oo..........................',
        '..................................==..........-----.......-----.............................==..........................',
        '........oooooooo................====..................................oooooooooo............==....oooooooooooo..........',
        '...1.2........................======........................................................==....................F.....',
        '######################..################...#######################..################...#################################',
        '######################..################...#######################..################...#################################'
      ]
    }
  ];
});
