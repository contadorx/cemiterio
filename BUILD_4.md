# Build 4 — verdade financeira

**Estado:** decisão tomada em 22/08/2026, implementada no razão, e as leituras
migradas (11 arquivos). Faltam as escritas e o congelamento do razão antigo.

> **A decisão, nas palavras da responsável:**
> *"É a família, mas sempre tem um responsável financeiro."*

---

## 1. Por que este build começa com uma decisão, e não com código

O roadmap põe a aprovação da regra como entrega nº 1, antes de qualquer
implementação. Não é formalidade: existem hoje **dois razões financeiros
paralelos**, e escolher qual é a verdade muda o que 23 arquivos fazem.

Este documento mede a divergência para a decisão ser tomada olhando número, e
não impressão.

---

## 2. A medição, em produção (22/08/2026)

```
movimentos       2 linhas    saldo  +20,00
conta_corrente   6 linhas    saldo −170,00
```

Por família:

| Família | `movimentos` | `conta_corrente` | Situação |
|---|---:|---:|---|
| **Anninha** | 0 linhas · **0,00** | 1 linha · **−240,00** | só no razão novo |
| Andre | 0 linhas · 0,00 | 3 linhas · +50,00 | só no razão novo |
| COSLOP | 1 · +60,00 | 1 · +60,00 | o mesmo evento, duas vezes |
| NENE | 1 · −40,00 | 1 · −40,00 | o mesmo evento, duas vezes |

### 2.1 A consequência que já está acontecendo

`calcularSaldo()` (`src/lib/financeiro.ts:11`) lê **`movimentos`**. É a função
que a régua de cobrança, o aviso de saldo baixo e a ficha da família usam.

**A Família Anninha deve 240,00 e a cobrança automática não a enxerga.** Para
`calcularSaldo()` ela tem zero lançamento e saldo zero. A dívida está no razão
novo, e quem cobra lê o antigo.

Não é hipótese: é a linha de cima da tabela.

### 2.2 Não é espelho — é duplicata

Os dois primeiros eventos existem nas duas tabelas:

```
01/08  débito  40,00  "Limpeza executada"                                (movimentos)
01/08  débito  40,00  "Limpeza executada · migrado do controle anterior" (conta_corrente)
02/08  crédito 60,00  "Comprovante de Pix (aguardando conferência)"      (movimentos)
02/08  crédito 60,00  "... · migrado do controle anterior"               (conta_corrente)
```

O sufixo conta a história: alguém migrou `movimentos` → `conta_corrente` e
**não parou de escrever em `movimentos`**.

Hoje nenhum código soma os dois — conferi arquivo por arquivo, e é só isso que
impede o saldo de dobrar. **Basta alguém somar uma vez** para a família ser
cobrada em dobro pela mesma limpeza.

### 2.3 O mesmo conceito, duas implementações

Saldo de abertura é o exemplo mais limpo:

| Rota | Grava em | origem | Descrição |
|---|---|---|---|
| `/api/clientes/[id]/saldo-abertura` → `sureya_saldo_abertura` | `movimentos` | `ajuste` | "Saldo de abertura (migração)" |
| `/api/conta-corrente` (ação `abertura`) | `conta_corrente` | `abertura` | "Situação inicial · em aberto" |

Duas rotas, dois razões, dois enums, o mesmo conceito de negócio. Os 240,00 da
Anninha entraram pela segunda.

### 2.4 O tamanho da divisão

**15 arquivos** leem ou escrevem `movimentos`. **8** leem ou escrevem
`conta_corrente`. A divisão atravessa o produto no meio.

E os enums são diferentes:

```
sureya_origem_movimento    pix_comprovante | conciliacao_manual | psp_auto | servico | ajuste
sureya_origem_lancamento   competencia | avulso | pagamento | ajuste | abertura | lavagem
```

---

## 3. Por que agora é a hora

**Oito linhas, para 298 famílias.** Migrar oito é trivial; migrar oito mil,
depois do piloto, não é.

A janela para decidir barato é agora — e ela fecha no dia em que a operação
começar a lançar de verdade.

---

## 4. A recomendação

**`conta_corrente` como fonte da verdade. `movimentos` congelado como legado.**

Os motivos, em ordem de peso:

1. **O grão certo é a família.** É como a operação fala ("a família Silva está
   devendo"), é o que o cadastro já cria sozinho (gatilho
   `sureya_familia_para_cliente`), e é o que a auditoria pergunta primeiro:
   *"quem é devedor: pessoa ou família"*. `movimentos` é por pessoa.
2. **`conta_corrente` tem `competencia`; `movimentos` não.** Sem competência
   não existe fechamento de mês — e fechamento é metade do Build 4.
3. **É para onde a atividade recente foi** (6 linhas contra 2), e para onde a
   migração de dados já apontou uma vez.
4. `quitacoes` — pagamento parcial, um Pix pagando várias lavagens — já foi
   escrita contra `movimentos`, e é a peça que precisará mudar de lado. Vale
   saber disso antes, não depois.

**O que a escolha custa:** `calcularSaldo()` e os outros 14 arquivos passam a
ler `conta_corrente`. É trabalho mecânico e conhecido — e é o único jeito de a
régua de cobrança parar de ignorar dívida como a da Anninha.

**O que não fazer:** manter os dois e "somar quando precisar".

---

## 5. O que esta entrega inclui

| Arquivo | O que faz |
|---|---|
| `migrations/0069_origem_abertura_no_enum.sql` | `abertura` está em produção e em migration nenhuma. Sem isto, ambiente reconstruído recusa a rota de saldo inicial. **Roda sozinho** (`alter type`). |
| `migrations/0070_divergencia_financeira.sql` | Duas views de leitura: `sureya_divergencia_financeira` (saldo por família nos dois razões) e `sureya_lancamentos_duplicados`. Não altera dado. |

As views ficam permanentes: depois da migração elas passam a ser o teste de que
a divergência foi a zero, e continuam vigiando.

---

## 6. O que vem depois da decisão

Na ordem, e só depois de a responsável escolher:

1. **Glossário assinado** — devedor, pré/pós-pago, competência × vencimento,
   parcial, adiantado, avulso, desconto, estorno, reembolso, inadimplência,
   fechamento e reabertura. O roadmap pede isso por escrito, e a auditoria de
   UX (CA-14) mostra por quê: convivem hoje "falta pagar", "em aberto",
   "saldo", "entrada", "recebimento", "conciliação" e "fechamento" sem
   glossário.
2. **Migrar `calcularSaldo()`** e os 14 arquivos para o razão escolhido.
3. **Congelar o razão perdedor** — revogar escrita por policy, como foi feito
   com o campo na 0067. Congelar por policy é melhor que apagar: o histórico
   fica legível e nenhuma escrita nova entra.
4. **Corrigir a home (CA-02)** — hoje ela mistura lavagens de uma competência
   com saldo de outro momento. Ou rotula "saldo atual", ou calcula a posição no
   fechamento da competência. Enquanto os dois razões existirem, não dá para
   corrigir: não se sabe qual saldo mostrar.
5. **Funil** — a identificar → a conciliar → em aberto → pronto para fechar →
   fechado.
6. **Relatório de divergência** bloqueando o fechamento enquanto houver
   diferença.
7. **Conferir saldo inicial família por família** antes da migração real.

---

## 7. A pergunta, em uma linha

> A dívida é **da família** ou **da pessoa**?

Respondida essa, o resto do Build 4 é execução.


---

## 8. A decisão, e o que ela virou

### 8.1 As duas regras

| | |
|---|---|
| **O saldo é da família** | `conta_corrente` é a fonte da verdade. `movimentos` vira legado. |
| **Toda família tem um responsável** | Ele não é quem *deve* — é quem *responde*. A dívida continua da família mesmo que o responsável mude. |

O invariante já se sustenta hoje, conferido em produção: **298 famílias, zero
sem responsável, zero com mais de um**, e o índice `idx_familia_um_responsavel`
já existia. Nenhum lançamento órfão nos dois razões — o mapeamento é total.

### 8.2 Glossário (entrega nº 1 do roadmap)

| Termo | Significado acordado |
|---|---|
| **devedor** | a **família**. Nunca a pessoa. |
| **responsável financeiro** | a pessoa da família a quem a cobrança se dirige. Exatamente um por família (`clientes.responsavel_financeiro`). |
| **saldo** | soma do razão da família, só `confirmado`. Negativo = em aberto. |
| **a conferir** | crédito informado e ainda não batido com o extrato. **Não é saldo.** |
| **razão** | `conta_corrente`. Por família, com competência. |
| **razão antigo** | `movimentos`. Por pessoa, sem competência. Em aposentadoria. |
| **competência** | o período a que a dívida pertence (`conta_corrente.competencia`). Nula em pagamento, avulso e ajuste. |
| **modo de cobrança** | `consumo` = cada lavagem vira dívida. `competencia` = o mês vira dívida e a lavagem é registro. |

O que **ainda não tem definição acordada** e o roadmap pede: pré/pós-pago,
vencimento (distinto de competência), pagamento parcial e adiantado, desconto,
estorno, reembolso, inadimplência, fechamento e reabertura. Nenhum desses está
implementado de forma que dependa de decisão agora — mas o Build 4 não fecha
sem eles por escrito.

### 8.3 O que foi implementado

**`migrations/0071_a_divida_e_da_familia.sql`**

- `conta_corrente.status_conc` — o razão novo não tinha o conceito de "a
  conferir". Sem ele, mudar o cálculo de razão faria todo comprovante não
  conferido virar dinheiro na hora, que é justamente o que a conferência
  existe para impedir.
- `conta_corrente.movimento_id` + índice único — a chave do espelho. Heurística
  não serve: a família que paga R$ 40 duas vezes no mesmo dia teria o segundo
  pagamento descartado como duplicata.
- **Espelho `movimentos` → `conta_corrente`**, com mapeamento explícito entre os
  dois enums de origem. Mesmo recurso da 0058 e pelo mesmo motivo: são 15
  arquivos escrevendo no razão antigo, e um gatilho fecha a classe inteira
  enquanto eles migram um a um.
- Segundo gatilho para **mudança de status**: comprovante que sai de
  `a_conferir` para `confirmado` vira saldo, e o razão novo precisa saber.
- Os dois pares já duplicados são **casados antes** do backfill, senão
  entrariam uma terceira vez.
- `sureya_familias_sem_responsavel` — o invariante virou view. Hoje volta
  vazia; o valor está em avisar no dia em que deixar de voltar.

**`src/lib/financeiro.ts` — `calcularSaldo()`**

Passou a resolver a família da pessoa e somar o razão da família. Continua
recebendo `clienteId` porque é o que as cinco chamadas têm na mão; duas pessoas
da mesma família agora devolvem o **mesmo** saldo — que é o ponto da decisão.

Duas mudanças de comportamento deliberadas:

- **erro de leitura deixou de virar saldo zero.** Saldo zero significa "em dia"
  para a régua de cobrança. Uma falha que devolvesse zero calaria a cobrança de
  uma família inadimplente — o mesmo modo de falha que deixou a agenda parada.
  Agora levanta.
- **`semFamilia`** no retorno: pessoa sem família devolve zero por ausência de
  dado, não por estar em dia, e quem chama consegue distinguir.

### 8.4 A consequência que o teste revelou: uma dívida, uma cobrança

Escrevi um teste para prender o invariante da decisão — pai e filha na mesma
família têm de devolver o mesmo saldo:

```ts
const sPai   = await fin.calcularSaldo("c-lin");
const sFilha = await fin.calcularSaldo("c-lin2");
checar("a divida e da FAMILIA: pai e filha veem o mesmo saldo",
       sPai.saldo === sFilha.saldo && sPai.saldo === -720, ...);
```

Ele passou — e **quebrou outro**:

```
público 'em aberto' pega só quem tem saldo negativo
  — pegou c-ant,c-neu,c-avu,c-sua,c-lin,c-lin2
```

Isso não era teste para consertar. Era a decisão mostrando uma consequência que
o código ainda não tinha: **`campanha.ts` e `proativo.ts` percorrem pessoas.**
Enquanto o saldo era por pessoa, uma pessoa devedora = uma cobrança. Agora que o
saldo é da família, uma família de quatro geraria **quatro cobranças pela mesma
dívida** — quatro mensagens no WhatsApp, para o mesmo débito, no mesmo dia.

É a metade que faltava da regra que você deu. "É a família" define quem deve;
"sempre tem um responsável financeiro" define **para quem se fala**. Os dois
lugares passaram a filtrar por `responsavel_financeiro`:

```ts
// src/lib/proativo.ts — UMA COBRANCA POR FAMILIA, PARA QUEM RESPONDE POR ELA.
.eq("responsavel_financeiro", true)
```

```ts
// src/lib/campanha.ts — público "em aberto"
if (!respondem.has(c.id)) continue;
```

O invariante `idx_familia_um_responsavel` (um responsável por família, já em
produção) é o que garante que esse filtro não deixe família devedora sem
cobrança nem crie duas. `sureya_familias_sem_responsavel` é o alarme do dia em
que ele deixar de valer.

### 8.5 Testado num banco reconstruído do zero

| Teste | Resultado |
|---|---|
| Anninha: dívida só no razão novo | saldo da família **−240,00**, 0 linhas no razão antigo |
| Pagamento lançado no razão **antigo** | chega no novo com `movimento_id` preenchido |
| Saldo depois | **−140,00** |
| Comprovante `a_conferir` | saldo **não muda** (−140,00); `a conferir` = 500,00 |
| Ao confirmar o comprovante | saldo vira **360,00** |
| Espelhar duas vezes | 3 linhas — não duplica |
| `sureya_familias_sem_responsavel` | vazia |
| Pai e filha na mesma família | **mesmo saldo** (−720,00) — o invariante da decisão |
| Família com dois membros, cobrança automática | **uma** mensagem, para o responsável |

### 8.6 As 11 leituras migradas, e o que cada número virou

Com o razão trocado, os quatro números que a operação olha mudam assim — medido
em produção em 22/08:

| Número | Lia `movimentos` | Lê `conta_corrente` | O que faltava |
|---|---|---|---|
| Recebido no mês | 60,00 | **160,00** | o pagamento de 100,00 de 08/08 |
| Executado no mês | 40,00 | **90,00** | as duas lavagens de 25,00 |
| A receber | 40,00 | **280,00** | os 240,00 da Anninha |
| Famílias em aberto | por pessoa | por família | uma dívida, uma linha |

**Arquivos migrados (11):** `clientes` (lista e ficha), `indicadores`,
`financeiro/mes`, `financeiro/relatorio`, `financeiro/gestao`,
`financeiro/export`, `financeiro/recibo`, `hoje`, `servicos`, `clientes/lgpd`,
e as libs `reajuste` e `avaliacao-periodica`.

#### A armadilha que a migração destapou: `origem = 'abertura'`

Em produção há um débito de **R$ 240,00 carimbado 17/08/2026** que é dívida
anterior ao sistema inteiro — a data é a do dia em que alguém digitou.

Para o **saldo**, ela conta: a família deve mesmo.
Para qualquer relatório **por período**, ela não pode contar. Medindo:

```
executado em agosto, com o filtro:   R$  90,00   ← trabalho de verdade
executado em agosto, sem o filtro:   R$ 330,00   ← e 240 disso é história
```

Trocar o razão sem essa regra teria feito agosto fechar com **mais que o triplo**
do trabalho que existiu. É a mesma confusão que a auditoria descreve na home
(CA-02): misturar o que aconteceu no mês com o que a família devia desde sempre.

A regra mora em `ehDoPeriodo()` (`src/lib/financeiro.ts`), num lugar só. Se
aparecer outra origem de história migrada, é lá que ela entra — e todos os
relatórios acertam juntos.

#### Três buracos que só apareceram ao migrar

1. **A trava de exclusão olhava um razão só.** `DELETE /api/clientes/[id]`
   recusava excluir quem tem lançamento — contando `movimentos`. A Anninha, com
   a dívida inteira no razão novo, **passava pela trava** e seria excluída com o
   histórico junto. Agora conta os dois.
2. **Pagamento sem recibo possível.** `/api/financeiro/recibo` só procurava em
   `movimentos`. O pagamento de 100,00, que existe só no razão novo, devolvia
   `nao_e_pagamento`: a família pagava e não tinha como receber comprovante.
   Agora procura nos dois, e o titular é o responsável financeiro. De quebra,
   comprovante `a_conferir` deixou de virar recibo — recibo é a casa dizendo
   "recebi", e dizer isso antes de bater o extrato é o que a conferência existe
   para impedir.
3. **A exportação LGPD vinha incompleta.** Exportava `movimentos` da pessoa. Para
   quem tem a vida financeira no razão novo, o campo financeiro do arquivo vinha
   vazio — o direito de acesso falhando exatamente onde mais importa. Agora leva
   os dois, e o razão da família vai identificado como tal, porque é um extrato
   **compartilhado**, não um registro individual.

#### O que a cobertura de teste alcança — e o que não alcança

O `simular.ts` exercita `src/lib/*`, **não as rotas**. Das 11 migrações, só
`reajuste` e `financeiro` são alcançadas por ele: as outras nove passaram por
tipagem e leitura, não por teste. Isso está dito aqui porque "128 passaram" não
significa que as rotas foram provadas.

O que ganhou teste foi o invariante que sustenta as nove: **`calcularSaldo()` e
`calcularSaldosEmLote()` têm de devolver o mesmo número para toda pessoa da
massa.** São duas implementações da mesma regra — uma por pessoa (a ficha), uma
em lote (as listas). Se divergirem, a lista mostra um número e a ficha da mesma
pessoa mostra outro, que é o sintoma exato que este build existiu para acabar.

### 8.7 O que falta, na ordem

1. ~~**Migrar os arquivos** que ainda leem `movimentos`~~ — **feito (8.6)**. As
   leituras acabaram. Restam as **escritas**: uma em TypeScript
   (`src/lib/conciliacao.ts`) e as funções SQL. Todas continuam válidas porque o
   gatilho da 0071 espelha cada linha para o razão da família.
2. **Congelar `movimentos`** — só depois de migrar essas escritas. Congelar por
   policy é melhor que apagar: o histórico fica legível.
3. **Corrigir a home (CA-02)** — hoje mistura lavagens de uma competência com
   saldo de outro momento. Só dá para corrigir agora que existe um saldo só.
4. **Funil** — a identificar → a conciliar → em aberto → pronto para fechar →
   fechado.
5. **O resto do glossário** (8.2), por escrito.

### 8.8 Uma pergunta que ficou aberta

`familias.modo_cobranca` separa dois mundos: `consumo` (cada lavagem vira
dívida) e `competencia` (o mês vira dívida, a lavagem é só registro).

Hoje `sureya_concluir_lavagem` lança débito **sempre** (exceto pré-pago). Com o
espelho ligado, esse débito chega no razão novo — e no modo `competencia` vai
**somar** com o lançamento do mês.

Isso ainda não acontece: das 298 famílias, 3 têm contrato e nenhuma competência
foi lançada. Mas acontece no dia em que o fechamento de mês rodar.

**No modo `competencia`, a lavagem deve gerar débito?** Minha leitura do código
diz que não — o comentário da própria 0066 escreve isso com todas as letras.
Mas quem decide é você, e a correção é de uma linha.
