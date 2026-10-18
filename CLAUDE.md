# Notas do projeto

## Status

- **API do Claude (agente semanal em `agente/`)**: em standby a pedido do usuário. Não mexer nem ativar até ele pedir.

## Paginação das edições (implementar na próxima alteração do código das edições)

Regras do processo gráfico, passadas pelo usuário:

- **Sempre de 4 em 4 páginas.** Toda edição e todo caderno têm um número de páginas múltiplo de 4.
- **Aumentar páginas em uma edição** pode ser feito de duas formas:
  1. **Inserir 4 páginas num caderno existente** (por exemplo, um caderno de 8 vira de 12).
  2. **Criar um caderno novo (caderno C)** com 4 ou 8 páginas.
- **Cor flexível:** cada página pode ser colorida ou preto e branco, e isso precisa poder ser reconfigurado.
- **Imposição (páginas casadas):** sempre que a paginação for reconfigurada, recalcular os pares. Num caderno de N páginas, a página `i` é casada com a página `N + 1 - i`. Exemplo de um caderno de 8 páginas:

  | Par | Páginas |
  |---|---|
  | 1 | 1-8 |
  | 2 | 2-7 |
  | 3 | 3-6 |
  | 4 | 4-5 |

  Os pares são calculados **dentro de cada caderno**, com a numeração do próprio caderno. Quando entram 4 páginas num caderno existente, todos os pares daquele caderno mudam (um caderno de 12 fica 1-12, 2-11, 3-10, 4-9, 5-8, 6-7).

- **A confirmar com o usuário:** se a cor é decidida por par casado (as duas páginas do par saem na mesma chapa, então colorir uma permitiria colorir a outra sem custo extra) e em que ponto do caderno as 4 páginas novas entram (no miolo ou em outro lugar).

## Quadro de diagramação: indicador de cabe / não cabe

No quadro em que o usuário arrasta para definir os espaços da página:

- Quando um espaço **já tem uma matéria atribuída**, mostrar um indicador por cor que reage **em tempo real** enquanto o espaço é aumentado ou diminuído:
  - **uma cor** enquanto o espaço **não é suficiente** para o conteúdo da matéria;
  - **outra cor** quando o espaço **chega ao tamanho suficiente** para o texto caber.
- Espaços sem matéria atribuída não mostram o indicador.

- **A confirmar com o usuário:** como medir se o texto cabe (contagem de caracteres ou linhas por coluna, corpo da fonte, colunas do espaço, título, foto e legenda); quais cores usar (sugestão: vermelho/laranja para "não cabe" e verde para "cabe"); e se deve haver um terceiro estado para **sobra de espaço** demais.

## Página A2 (padrão fixo)

A A2 da Gazeta tem sempre o mesmo conteúdo: **Editorial, Mural, A Semana e Expediente**.

- **Layout atual:** cabeçalho "A2 | EDITORIAL" com data. Editorial em 4 colunas no alto, à esquerda. Mural em coluna cinza à direita, na altura toda da página. A Semana embaixo do Editorial, com cerca de 16 notas curtas em 2 colunas. Expediente em faixa no rodapé.
- **Volume típico:** Editorial com cerca de 2.500 caracteres; Mural com 6 a 7 notas locais; A Semana com 14 a 18 notas.
- **Layout escolhido: opção B.** É a estrutura atual com toques da página de Opinião do O Estado (CE):
  - cabeçalho "A2 | EDITORIAL" com uma caixa de "Frase da semana";
  - rótulo "EDITORIAL" pequeno acima do título do Editorial, em 4 colunas no alto à esquerda;
  - Mural na coluna direita, na altura toda;
  - A Semana embaixo do Editorial, em 2 blocos por tema (por exemplo, Economia e Brasil/Mundo/Cultura/Esporte), com um número em destaque no bloco;
  - Expediente no rodapé.
- **Expediente fixo:** faz parte do layout. O texto não muda de edição para edição e não precisa ser enviado.

### Coleta da A2 durante a semana

- **Como funciona:** o usuário vai enviando, ao longo da semana, as **notas do Mural**, o **Editorial** e as **notas de A Semana**. A plataforma guarda tudo na edição.
- **Produzir a página:** quando tudo estiver enviado, o usuário aperta o botão de produzir a página, como nas outras páginas.
- **Mostrar o que falta:** a plataforma deve indicar o que já chegou e o que falta, usando os volumes típicos acima (Editorial; Mural com 6 a 7 notas; A Semana com 14 a 18 notas).
- **Onde está a plataforma:** ela não está neste repositório, e sim nos artifacts do claude.ai.
  - **Painel de Redação:** https://claude.ai/artifact/CLharYPmRu6Zzevs5vpuwQ. Tem as pautas (`db`, coleção `pautas`, tamanho "mural") e produz matérias pelo trigger `trig_01Kkf9jvjo7585VWZr4Lmdx9`.
  - **Painel de Fechamento:** https://claude.ai/artifact/BLWAjr8Wa3ACBcWpzJ4uYE. Tem a grade de páginas com arrastar (4 colunas × 16 linhas, proporção 29,7 × 50 cm), a folha de Mural e os fixos.
  - **A confirmar:** qual dos dois tem o botão de produzir a página.
- **Por enquanto:** o usuário vai mandar o material da A2 subindo **arquivos de texto** na plataforma, onde já existe envio de arquivos (no Painel de Redação há "Importar blocos" e uma área para soltar arquivos). Não há implementação nova para isso agora.
- **Depois:** criar na aplicação um **módulo de produção dos textos**. Ainda sem escopo; o usuário vai detalhar.

## Pendências

O usuário ainda vai passar outros ajustes antes da implementação. Não editar o código das edições até ele liberar.
