# Build 2 — lavagem confiável ponta a ponta

> **A lista de pendências deste arquivo pode estar velha.** O inventário
> conferido e atualizado é o `PENDENCIAS.md`.

**Estado:** núcleo e lote 2 entregues e testados em banco limpo. Falta a
conferência no ambiente real.

---

## 1. Problema e risco que resolve

A auditoria descreve o P0 nº 2 assim:

> "Depois que o serviço vira `executado`, uma nova tentativa retorna
> `jaExecutado` e não necessariamente repara tudo que falhou após essa
> transição. Impacto: lavagem executada sem débito, sem fila, sem material ou
> sem remuneração."

E o P0 nº 3:

> "Uma pessoa de campo pode assumir ou concluir serviço de outra pessoa se
> obtiver/adivinhar o UUID."

Os dois estavam no mesmo arquivo. `src/app/api/servico/concluir/route.ts` fazia
**oito** coisas em sequência — upload, transição, extrato, fila, débito, valor,
remuneração, material — com **seis** delas dentro de `try/catch` mudos. E a
transição era:

```ts
.update({ ..., executora_id: auth.userId })
.eq("id", servicoId)
.neq("status", "executado")
```

O filtro é só id + status. **Nunca compara `executora_id` com quem está
chamando** — apenas sobrescreve.

---

## 2. O que foi entregue

### 2.1 A transação — `migrations/0066_concluir_lavagem_transacional.sql`

`sureya_concluir_lavagem()` faz, numa função PL/pgSQL (portanto **uma
transação**):

1. autoriza — admin opera qualquer serviço; campo só o que é dela, ou um ainda
   sem dono, que ela reserva ao concluir;
2. transiciona o status, com `select ... for update` travando a linha;
3. resolve e congela o valor (serviço → plano → **jazigo** → referência da casa —
   `tumulos.valor_lavagem` entrou na cascata porque desde a 0049 é de lá que a
   cobrança lê);
4. lança o débito;
5. registra a lavagem no extrato da família (valor zero, de propósito: quem gera
   a dívida é a competência);
6. enfileira a mensagem — **outbox, nada é enviado aqui**;
7. carimba a remuneração pela regra da 0031;
8. baixa o material e grava o custo.

**Convergente, não apenas idempotente.** Chamar de novo num serviço já executado
não devolve "já foi": confere cada efeito e **cria o que estiver faltando**,
devolvendo a lista do que reparou. É isso que torna uma falha parcial antiga
recuperável — basta a pessoa de campo tocar de novo.

### 2.2 As chaves que tornam a idempotência real

Sem restrição única, "confere se já existe e insere" é uma corrida: dois toques
simultâneos passam os dois pelo `if not exists`.

```sql
uq_movimentos_debito_por_servico   movimentos(servico_id) where tipo='debito'
uq_fila_liberacao_servico_tipo     fila_liberacao(servico_id, tipo)
uq_conta_corrente_lavagem          conta_corrente(servico_id) where origem='lavagem'
```

A terceira exigiu **acrescentar `servico_id` a `conta_corrente`**: a tabela não
guardava a referência, então não havia chave possível.

### 2.3 A reconciliação

A view `sureya_lavagens_incompletas` cruza serviço executado × foto × valor ×
débito × extrato × mensagem × remuneração × material. Toda linha que voltar é
uma lavagem com efeito faltando — e cada uma é reparável chamando a função de
novo com o mesmo id.

**Antes do piloto, tem de voltar vazia.**

### 2.4 A rota

`src/app/api/servico/concluir/route.ts` virou uma chamada só. Continuam fora da
transação, de propósito: o **upload** (Storage não participa de transação de
banco) e o **GPS/aviso à família** (efeitos externos, que não podem prender a
transação nem desfazer a lavagem se falharem).

O erro `42501` vira **403**, para a tela distinguir "não é seu" de "deu erro".

---

## 3. Testes executados

Num PostgreSQL 16 com a trilha inteira aplicada do zero:

| Teste | Resultado |
|---|---|
| Ana tenta concluir o serviço da Nina | `ERROR: servico_de_outra_executora` ✅ |
| Nina conclui o próprio | valor 55, débito, extrato, fila, remuneração 16,50 (30% de 55), material 3,00 ✅ |
| Clique duplo | nada duplicado; estoque intacto ✅ |
| **8 conclusões simultâneas** | **1 transição, 7 "já executado", 1 de cada efeito, material consumido uma vez** ✅ |
| Falha parcial (apaguei débito e mensagem) | recriou os dois e informou: *"debito estava faltando: lancado agora"*, *"mensagem da familia estava faltando: entrou na fila"* ✅ |
| Reconciliação após o reparo | zero divergências ✅ |
| Admin conclui serviço de terceiro | permitido ✅ |

---

## 4. Dois bugs que só apareceram porque foi testado

### 4.1 O extrato da família nunca funcionou

A migration 0049 criou `sureya_origem_lancamento` com quatro valores:
`('competencia', 'avulso', 'pagamento', 'ajuste')`.

O código insere um **quinto** em `conta_corrente.origem`, em dois lugares
(`servico/concluir:128` e `servico/route:161`):

```ts
origem: "lavagem",
```

Os dois estão dentro de `try/catch` mudo, e o comentário do código culpa o
índice único:

> "Índice único barrou (reprocessamento) ou algo falhou: é só o registro visual
> do extrato."

Não é o índice. É o enum recusando:

```
ERROR: invalid input value for enum sureya_origem_lancamento: "lavagem"
```

**A linha "Limpeza realizada" nunca apareceu no extrato de família nenhuma**,
desde que o recurso foi escrito. A família vê a cobrança do mês e não vê as
limpezas que a geraram. Corrigido na `0065` (arquivo separado: `alter type add
value` não roda dentro de transação).

### 4.2 Mais uma coluna à deriva

`servicos.cobranca_liberada_em` — escrita por duas rotas quando o plano é
`contra_foto`, e criada por migration nenhuma. Sem ela, a conclusão desse tipo
de plano falha inteira. Foi a **33ª** coluna encontrada; acrescentada à `0061`.

E um bug meu, pego pelo teste do clique duplo: `text[] || 'literal'` é ambíguo
no PostgreSQL — resolve como `array || array` e estoura *malformed array
literal*. Sete concatenações ganharam `::text`.

---

## 5. Explicitamente fora do escopo

- ~~`concluir-admin` chamando a mesma função~~ — **feito no lote 2 (seção 8)**;
- ~~`iniciar` validando atribuição no banco~~ — **feito no lote 2**, migration 0068;
- outbox de WhatsApp com retry e estado legível é Build 6;
- classificar falha transitória × permanente e o painel de pendências é Build 6.

---

## 6. Rollback

| Migration | Rollback |
|---|---|
| `0065` | Nenhum. Não se remove valor de enum no PostgreSQL — e não se deve: o código depende dele. |
| `0066` | `drop function sureya_concluir_lavagem(...)`, `drop view sureya_lavagens_incompletas`, e reverter a rota para o commit anterior. Os três índices únicos podem ficar: eles só impedem duplicata. |
| `0068` | `drop function sureya_iniciar_lavagem(uuid, text)` e reverter `campo/iniciar/route.ts`. Nenhum dado é alterado pela migration em si. |

`conta_corrente.servico_id` também pode ficar — é aditiva e nulável.

---

## 7. Critério de go/no-go

| Critério do roadmap | Situação |
|---|---|
| RPC transacional de conclusão | ✅ `0066` |
| Autorização por atribuição no banco | ✅ testado |
| Chaves únicas por efeito | ✅ três índices |
| Clique duplo não duplica | ✅ testado |
| Concorrência não duplica | ✅ 8 simultâneas |
| Falha injetada é reparada | ✅ convergência testada |
| Reconciliação diária | ✅ view criada |
| Upload fora da transação | ✅ |
| Rodar tudo no ambiente real | ✅ `0066` e `0068` em produção; a matriz de autorização rodou lá (`BUILD_7.md` §2.1) |
| `concluir-admin` usando a mesma função | ✅ lote 2 |
| `iniciar` validando atribuição | ✅ `0068`, testado |
| Correlação por `servico_id` e etapa | ❌ Build 6 |

**Parecer: núcleo do Build 2 pronto e provado em banco limpo.** O que falta é
ambiente: rodar as migrations no Supabase, repetir os sete testes lá, e igualar
as duas portas de conclusão.

---

## 8. Lote 2 — as duas portas que faltavam

### 8.1 O `iniciar` escapava de tudo

`campo/iniciar/route.ts` usava `supabaseAdmin()` — service role, que **ignora
RLS por completo**. Nenhuma policy da 0067 alcançava aquela rota. E o que ela
fazia era:

```ts
const patch = { executora_id: auth.userId };
await adm.from("servicos").update(patch).eq("id", b.servicoId)
```

Sem comparar `executora_id` com quem chamava — apenas sobrescrevendo. Era a
metade do P0 nº 3 que continuava aberta **depois** da 0066 e da 0067: bastava
chamar `/api/campo/iniciar` com o UUID de outra pessoa para tomar o serviço
dela, junto com a foto do antes, o cronômetro e a remuneração da conclusão.

`migrations/0068_iniciar_lavagem_transacional.sql` cria
`sureya_iniciar_lavagem`, com a mesma regra do concluir, e a rota passou a
chamá-la **com a sessão da pessoa** em vez da chave mestra.

Testado num banco reconstruído do zero:

| Teste | Resultado |
|---|---|
| Ana começa o serviço da Nina | `ERROR: servico_de_outra_executora` |
| Nina começa o próprio | ok, foto do antes gravada |
| Nina toca de novo | `ja_iniciado`, **mesma hora** — o cronômetro não reinicia |
| Ana pega serviço sem dono | `reservado`, passa a ser dela, `pendente` → `agendado` |
| Nina tenta pegar o que virou da Ana | `ERROR: servico_de_outra_executora` |
| Admin começa qualquer um | permitido, e **não rouba** a executora |

### 8.2 As duas portas de conclusão se comportavam diferente

`concluir-admin` tinha a própria cópia dos oito passos. A cópia divergia em
coisas que ninguém notava:

- **não criava o rascunho da mensagem.** Lavagem concluída pelo painel nunca
  aparecia na fila de liberação — a família simplesmente não recebia a foto.
  Pela porta do campo, aparecia.
- não registrava a lavagem no extrato da família;
- débito, remuneração e consumo eram outra implementação da mesma regra, com as
  mesmas falhas silenciosas em `try/catch`.

Agora as duas chamam `sureya_concluir_lavagem`. Divergir de novo exigiria mudar
a função — que é onde a regra deve morar.

### 8.3 O que o painel informa, e por que é gravado ANTES

Duração digitada à mão (`duracao_ajustada` + `motivo_ajuste`) e quem executou
(`executoraId` — quem estava na escala, não quem clicou). Os dois são gravados
antes da chamada, **não como parâmetro novo da função**.

Isso é deliberado. Acrescentar parâmetro com `DEFAULT` criaria uma segunda
assinatura de `sureya_concluir_lavagem`, e uma chamada com os 6 argumentos
antigos passaria a casar com as duas — `function is not unique`. Foi exatamente
o que aconteceu com `sureya_fechar_dia`, que existia em duas versões e obrigou a
rota do campo a carregar um fallback que nunca pôde funcionar.

Gravar antes é seguro: são fatos sobre um serviço que ainda não foi concluído.
Se a transação falhar, nada foi concluído e os dois campos ficam inertes.

### 8.4 Um bug meu, pego pelo teste

`returns table(iniciado_em ...)` declara uma **variável PL/pgSQL** com o nome da
coluna. Dentro do `update`, o Postgres recusou:

```
column reference "iniciado_em" is ambiguous
It could refer to either a PL/pgSQL variable or a table column.
```

Eu tinha até escrito um comentário avisando dessa colisão — e mesmo assim caí
nela. As colunas passaram a ser qualificadas (`servicos.iniciado_em`).

### 8.5 O que ainda falta do Build 2

- correlação por `servico_id` e etapa nos logs (Build 6);
- classificar falha transitória × permanente e o painel de pendências (Build 6);
- rodar os testes acima no ambiente real.
