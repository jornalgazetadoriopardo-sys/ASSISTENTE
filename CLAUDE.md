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

## Pendências

O usuário ainda vai passar outros ajustes antes da implementação. Não editar o código das edições até ele liberar.
