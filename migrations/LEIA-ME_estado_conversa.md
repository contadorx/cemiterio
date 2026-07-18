# "Respondi e continuou esperando" — causa e correção

## O que estava acontecendo (duas causas)

### 1. Dois sistemas de status brigando
A tela tinha **duas famílias de colunas** descrevendo a mesma coisa:
- `aguardando_desde` / `ultimo_autor` / `ultima_msg_em` — escritas pelo app,
  e só em alguns caminhos
- `estado` / `respondida_em` / `ultima_msg_cliente_em` — escritas pelo gatilho

Quem pintava a tela era a primeira. Quando você respondia por um caminho que não
atualizava aquela coluna, a conversa continuava marcada como "esperando".

### 2. Comparação de horários que dava falso
O estado era calculado com `respondida_em > ultima_msg_cliente_em`. No Postgres,
`now()` devolve o horário do **início da transação** — então responder logo após
a mensagem chegar deixava os dois horários **idênticos**, e "maior que" dava
falso. Reproduzi isso no banco antes de corrigir.

## A correção
**O gatilho passou a ser o único dono de todas as colunas de estado.** O app não
escreve mais nada disso à mão: só grava a mensagem, e o resto se acerta sozinho.

Os horários passaram a usar `clock_timestamp()` (horário real do momento) em vez
de `now()`. E o estado virou uma **coluna explícita**, não uma comparação:

| Estado | Quando |
|---|---|
| `sem_resposta` | a família falou e ninguém respondeu |
| `lida_sem_resposta` | alguém abriu, mas não respondeu |
| `respondida` | saiu resposta — sua, da IA ou de rascunho aprovado |
| `sem_movimento` | conversa sem mensagens |

Todas as conversas existentes foram recalculadas a partir das mensagens reais.

## Terceira correção: a lista não recarregava
Ao voltar da conversa para a lista, ela mostrava o estado de antes. Agora a lista
se atualiza sozinha ao voltar para a tela (ao trocar de aba, voltar ao app ou
usar o botão voltar do navegador).

## Na tela
A linha de status ficou uma só:
- **⬅ esperando resposta há 3h** (laranja; vermelho depois de 24h)
- **⬅ esperando resposta agora · você já viu** (quando abriu mas não respondeu)
- **✓ você respondeu** / **✓ a IA respondeu**
- **sem movimento**

Antes havia bolinhas 🔴🟡 no nome e uma etiqueta separada, dizendo a mesma coisa
em dois lugares — e às vezes discordando entre si.
