# Painel no celular

O painel foi desenhado em tela larga, mas na prática vai ser usado no celular,
andando pelo cemitério. A correção foi por cima, não reescrevendo tudo: uma
folha de estilo (`src/app/painel/EstiloMobile.tsx`) que conserta o que quebra
em tela estreita.

## O problema principal
Havia **dezenas de campos com largura fixa** (`width: 130`, `150`, `210`)
espalhados pelas telas — 22 só na ficha do cliente. Em tela de 360px, três
deles numa linha estouravam a tela.

**Abaixo de 640px:** todo campo ocupa a linha inteira, com 50px de altura e
fonte 16px (abaixo disso o iOS dá zoom sozinho ao focar). Data e hora ficam lado
a lado até 420px, porque cabem e é mais rápido.

## Menu
Eram 12 itens em lista corrida. Agora agrupados por o que se faz:
- **Dia a dia** — Início, Conversas, Agenda, Campo
- **Carteira** — Famílias, Financeiro, Reajustes, Leads
- **Ajustes** — Agente, WhatsApp, Plaquetas, Config

No computador continua uma barra só; no celular vêm os títulos separando, com
52px de altura por item.

## Barras de filtro
Em vez de espremer 6 seletores numa tela de 360px, elas **rolam de lado**.
Cada filtro mantém 160px, que é o mínimo para ler o que está escrito.

## Toque e leitura
| | Antes | Agora |
|---|---|---|
| Altura dos botões | 44px | **48px** (52px no celular) |
| Texto de apoio | 11–13px | **13–15px** |
| Cinza secundário | `#64748b` | **`#475569`** — o painel também é usado no sol |
| Rótulos | 13px normal | **14px seminegrito** |

Mais: sem o realce cinza do toque no Android, sem o atraso de 300ms, e foco
visível ao tocar (importante para quem erra o alvo).

## Barra de salvar e modais
A barra de "salvar tudo" empilha no celular (botão largo é botão fácil) e
respeita a barra de gestos do Android. Modais sobem de baixo, com 94% da altura.

## O que não mudou
As telas em si — a estrutura, as cores, o que aparece onde. A correção é de
ergonomia, não de desenho. Se algo específico ficar ruim de usar no celular,
me diga qual tela que eu ajusto pontualmente.
