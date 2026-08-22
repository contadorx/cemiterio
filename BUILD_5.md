# Build 5 — a home diz de quando é o número, e o mês pode recusar

**Estado:** entregue e provado em banco limpo. `0075` aplicada em produção.

---

## 1. CA-02 — a home misturava dois tempos na mesma linha

A auditoria reprovou com essas palavras:

> "lavagens são filtradas pela competência, mas o saldo é calculado sobre todos
> os lançamentos da conta corrente, sem corte temporal aparente. **'falta pagar'
> pode representar saldo atual enquanto 'falta limpar' representa o mês
> escolhido, misturando tempos na mesma linha.**"

Confirmado no código: `/api/mes` filtrava os serviços por `data_executada`
dentro do mês e somava `conta_corrente` **inteira, sem filtro de data**. Abrir
julho em setembro mostrava as limpezas de julho ao lado da dívida de setembro.

### E a soma era uma terceira cópia da regra

Ao ir corrigir, a cópia da home divergia em três pontos — cada um capaz de mudar
o número que a responsável lê:

| # | O que fazia | Consequência |
|---|---|---|
| 1 | pulava `origem = 'lavagem'`, com o comentário *"eles têm valor zero"* | **verdade até a 0073.** Em `modo_cobranca = consumo` — que é o de todas as 298 famílias — a lavagem passou a carregar o valor. A home esconderia a dívida de cada limpeza |
| 2 | não filtrava `status_conc` | comprovante não conferido e até lançamento **rejeitado** entravam no saldo |
| 3 | somava com o sinal invertido | quarta convenção, só dela |

O nº 1 é meu: a 0073 mudou o significado da linha de lavagem e este comentário
ficou para trás. Só apareceu porque fui mexer aqui.

### O conserto

`calcularSaldosPorFamilia(familias, { ate })` passou a ser **a** regra;
`calcularSaldo` e `calcularSaldosEmLote` chamam ela. O `ate` é o corte que
transforma o mês numa fotografia: o saldo do **fim da competência escolhida**,
inclusive quem devia e depois pagou.

E a tela passou a **declarar o momento**, que é o que a auditoria pede:

```
Posição de 31/08/2026 — como a conta fechou em agosto de 2026.
Posição de hoje — setembro de 2026 ainda está em andamento.
```

Teste que trava isso: o saldo numa data passada tem de ser **diferente** do de
hoje. Se fosse igual, o corte seria enfeite.

---

## 2. O funil — `migrations/0075_o_funil_e_o_fechamento.sql`

| Etapa | O que é |
|---|---|
| a identificar | dinheiro no banco sem dono |
| a conciliar | comprovante informado e ainda não conferido |
| em aberto | famílias devendo, **na foto do fim do mês** |
| pronto para fechar | o mês acabou e não há pendência |
| fechado | um fato gravado, com data e autor |

### O buraco que apareceu ao ir fazer

A tela de fechamento existe e gera a cobrança do mês. Mas **não existia registro
de que um mês foi fechado** — nenhuma tabela, nenhuma coluna.

Sem isso, "fechado" não era um estado: era a lembrança de quem apertou o botão.
Rodar o fechamento duas vezes não tinha como ser barrado, e reabrir um mês não
tinha como ser auditado.

### O fechamento pode dizer não

Fechar mês é dizer "esta é a conta". Fechar com uma limpeza executada e não
cobrada é assinar embaixo de um número que ainda vai mudar — e é assim que a
operação perde a confiança no sistema: não porque o número estava errado, mas
porque ele **mudou depois de fechado**.

Quatro divergências barram, e as quatro são trabalho pendente com tela onde se
resolve:

```
lavagem_sem_cobranca    limpeza feita e não cobrada
a_conciliar             comprovante em suspenso
a_identificar           dinheiro no banco sem dono
cobranca_sem_lavagem    cobrança sem o serviço executado (o pior: cobrar por trabalho que não houve)
```

A recusa **diz o que falta**: `ha_pendencias: Limpezas executadas que nao
viraram cobranca (2)`. "Não foi possível fechar" manda a pessoa procurar; dizer
o que falta manda ela resolver.

`p_forcar` existe para aceitar pendência que a responsável decidiu aceitar — e
grava isso na observação. Mas **mês em andamento não fecha nem forçando**:
forçar não serve para inventar o resultado de um mês que ainda está correndo.

Reabrir é legítimo (errar o mês é humano) e **exige motivo**, que fica gravado.

---

## 3. Medido em produção agora

```
famílias em aberto             2       R$ 280,00
limpezas sem cobrança          2    ← agosto seria RECUSADO hoje
```

As duas limpezas sem cobrança são de antes da 0073 e aparecem agora porque
passou a existir quem perguntasse.

---

## 4. Provas no CI

16 novas, rodando em banco reconstruído do zero. As que importam são as recusas:

```
ok  mes em andamento nao fecha, nem forcando
ok  fechar e RECUSADO, e a recusa diz o que falta
ok  o mesmo mes nao fecha duas vezes
ok  reabrir exige motivo
```

Um fechamento que sempre aceita é um botão decorativo, e o estrago dele não
aparece no dia — aparece quando o número já fechado muda depois.

**Total: 133 testes + 49 provas de comportamento em SQL.**

---

## 5. A tela — `src/app/painel/fechamento/Funil.tsx`

O funil entra **antes** da cobrança na tela de fechamento, de propósito: a
primeira pergunta de quem abre essa página é *"posso fechar?"*, não *"quero
lançar"*. Lançar cobrança sem saber o que está pendente é assinar antes de ler.

Duas decisões de desenho, e o porquê:

**A pendência não é um alerta — é uma linha clicável** que leva à tela onde se
resolve. Alerta que não diz o que fazer só ensina a ignorar alerta. Etapa
zerada não vira link: clicar e não achar nada é pior que não poder clicar.

**O botão de fechar fica sempre visível, mesmo bloqueado, com o motivo
embaixo.** Esconder o botão faz a pessoa procurar; mostrar bloqueado com o
motivo faz ela resolver. Quando a função recusa, a tela mostra a recusa inteira
e oferece "fechar mesmo assim" — que grava a pendência na observação.

Botão bloqueado sem motivo é porta trancada sem placa.

E o erro de carregamento aparece com "tentar de novo" em vez de zerar o funil:
**funil vazio se lê como "está tudo resolvido"**, que é exatamente a leitura
errada para uma falha. (É também o que a auditoria pede em CA-03.)

### Um detalhe que travaria o botão para sempre, em silêncio

`quantidade` é `bigint` e `valor` é `numeric`, e os dois saem da mesma função.
Consultando o banco direto, `numeric` volta como string e `bigint` como número —
**não conferi se pelo PostgREST é igual**, e essa incerteza é o problema: um
`=== 1` contra `"1"` deixaria o botão de fechar desabilitado para sempre, sem
erro em lugar nenhum, e a responsável acharia que o mês nunca fica pronto.
`Number()` custa nada e tira a dúvida do caminho.

---

## 6. O que falta
- resolver as 2 limpezas sem cobrança de agosto (decisão de operação: cobrar ou
  marcar como cortesia).
- o resto do glossário (BUILD_4 §8.2).
