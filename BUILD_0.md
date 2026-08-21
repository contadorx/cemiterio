# Build 0 — base verificável

**Data:** 21/08/2026
**Gate:** nenhuma mudança crítica de segurança, banco ou financeiro começa antes
deste build fechar.
**Formato:** segue o roteiro do `ROADMAP_BUILDS.md`, seção 13.

---

## 1. Problema e risco que resolve

O Build 0 existe para responder a uma pergunta simples: **o repositório
descreve o sistema que está no ar?**

Enquanto a resposta for "não sei", nenhum dos builds seguintes tem chão. Uma
policy de RLS escrita contra um schema que não é o real não protege nada; uma
RPC transacional escrita contra colunas que não existem falha em produção; e um
backup restaurado a partir das migrations não reconstrói o sistema.

A execução deste build mostrou que a resposta hoje é **não** — e não por pouco.

---

## 2. O que foi feito

### 2.1 A suíte automatizada passou a rodar

Estado anterior, exatamente como a auditoria descreveu:

```
npm run checar   → 1 acesso desprotegido: src/app/painel/fila/page.tsx:112
npm run testar   → sh: 1: tsx: not found
```

Correções:

- **`tsx` fixado em `4.19.2`** nas `devDependencies`. Estava só no script.
- **`src/app/painel/fila/page.tsx`** — `item.fotos` vinha de `fetch` tipado como
  `string[]`, mas a API pode devolver ausente ou nulo. O tipo passou a ser
  `string[] | null` e as três leituras foram protegidas. Agora é o TypeScript
  que cobra a proteção, não a sorte.
- **`npm run tipos`** (`tsc --noEmit`) e **`npm run ci`** adicionados como
  scripts, para a pessoa rodar localmente a mesma coisa que o CI roda.

### 2.2 A suíte, ao rodar pela primeira vez, reprovou 13 de 123

Este é o achado central do build. As 13 falhas tinham **duas causas diferentes**,
e distingui-las é o que separa "fixture velha" de "produção quebrada".

#### Causa A — massa de teste desatualizada (9 falhas, produto sadio)

A migration `0030` criou `clientes.envio_automatico` com `default true`. A massa
de `testes/simular.ts` nunca ganhou a coluna. Como `src/lib/proativo.ts:111` e
`src/lib/ativacao.ts:101,127` filtram por `.eq("envio_automatico", true)`, todo
filtro devolvia zero — e cobrança, régua de cobrança e convites "passavam" nos
testes sem nunca terem rodado.

Corrigido na massa. Em produção a coluna existe com default `true`: **nada a
fazer no produto.**

#### Causa B — o banco não tem uma coluna que o código escreve (4 falhas, P0 real)

A migration `0049` mudou o contrato de casa: `valor_lavagem`, `periodicidade`,
`freq_pagamento` e `contratado` saíram de `planos` e foram para `tumulos`. O
código foi junto. O comentário do próprio `agenda.ts` explica por quê:

> "Isto lia `planos`, enquanto a ficha e a cobrança gravavam em `tumulos`. A
> Sureya configurava 'limpa toda semana', o valor entrava na conta corrente — e
> a Nina nunca recebia o serviço."

**Uma coluna ficou para trás: `proximo_servico`.** Ela existe em `planos`
(migration 0001, linha 127) e não é criada em `tumulos` por nenhuma das 46
migrations. E o código a lê e escreve mesmo assim:

- `src/lib/agenda.ts:207` — `select "...,periodicidade,proximo_servico"` em `tumulos`
- `src/lib/agenda.ts:296` — `update tumulos set proximo_servico = ...`

Em produção o PostgREST responde **400 — `column tumulos.proximo_servico does
not exist`**. E o código descartava o `error`, lendo só o `data`, que vinha
nulo. O laço não roda nenhuma vez e a função devolve:

```json
{"criados":0,"planosAtivos":0,"planosNoHorizonte":0,"jaExistiam":0,"falhas":0}
```

Um zero com cara de "não havia nada a fazer". **O cron diário fica verde, a tela
diz "0 planos ativos" e nenhuma família é agendada — todos os dias, sem um único
sinal em lugar nenhum.**

É o mesmo modo de falha que a `AUDITORIA_GOLIVE` chama de prejuízo invisível,
mas uma etapa antes da que ela examinou: o serviço nem chega a ser criado.

Duas correções:

1. **`migrations/0052_agenda_proximo_servico_no_tumulo.sql`** — cria a coluna,
   traz o ponteiro que já existia em `planos` (menor data entre os planos ativos
   do jazigo: adiantar uma limpeza é recuperável, esquecê-la não) e cria o
   índice parcial da consulta do gerador.
2. **`src/lib/agenda.ts`** — o `error` dessa consulta deixou de ser engolido.
   Agora vai para `erros_log` e volta no diagnóstico como `falhas: 1`. Um zero
   por falha nunca mais vai parecer um zero por ausência de trabalho.

### 2.3 A mesma classe de problema, maior, em `familias`

Ao escrever a baseline apareceu a segunda divergência — e essa **não foi
corrigida de propósito**.

A migration `0049` cria `familias` com seis colunas: `id`, `org_id`, `nome`,
`observacoes`, `created_at`, `updated_at`. O código usa **outras seis** que não
aparecem em migration nenhuma:

| Coluna | Onde o código usa |
|---|---|
| `contratado` | `lib/competencia.ts:39`, `api/financeiro/fechar-mes:41`, `api/mes:97` |
| `valor_mensal` | `lib/competencia.ts:37`, `api/familias/[id]:60` |
| `valor_base` | `api/familias/[id]:63` |
| `freq_pagamento` | `lib/competencia.ts:37`, `api/familias/[id]:65` |
| `inicio_cobranca` | `lib/competencia.ts:37`, `api/familias/[id]:72` |
| `modo_cobranca` | `lib/competencia.ts:41`, `api/familias/[id]:64` |

É o contrato e a regra de cobrança da família inteira — o que fecha o mês.

**Por que não escrevi essa migration:** tipo, default, constraint e valores em
uso só existem no banco. Deduzi-los seria inventar schema financeiro e arriscar
conflitar com o que está gravado. O caminho correto é o inverso: extrair do
banco (seção 2 da `0053`), conferir, e só então versionar o que voltou.

Isto confirma, com evidência concreta, o P0 nº 4 da auditoria: **as migrations
não comprovam o banco de produção.** Junto com as 24 funções `sureya_*` que a
`0046` já havia registrado como existentes só no SQL Editor, a conclusão é
direta: hoje, restaurar um backup a partir do repositório **não** reconstrói o
sistema.

### 2.4 Baseline, CI e ambientes

- **`migrations/0053_baseline_extrair_do_banco.sql`** — 16 seções, só `SELECT`,
  segura em produção: tabelas, colunas, constraints, índices, RLS, policies,
  grants, funções `security definer` com `search_path`, triggers, enums, buckets
  de Storage e policies de Storage, histórico de migrations, extensões e volume.
  A seção 2 cruza o que o código lê com o que o banco tem, nos dois sentidos.
  A seção 9 devolve o `CREATE FUNCTION` completo das funções que só existem no
  banco — é o texto que precisa virar migration versionada.
- **`.github/workflows/ci.yml`** — `npm ci` → `checar` → `tipos` → `testar` →
  `build`, em Node 22, sem nenhum segredo.
- **`.env.example`** — inventário completo das 20 variáveis, com a separação de
  desenvolvimento/homologação/produção escrita como regra e o aviso de que uma
  instância de Evolution de produção em ambiente de ensaio manda mensagem para
  família real.
- **`migrations/_diagnostico/`** — `0027_DECISAO` e `0046_EXTRAIR` saíram da
  trilha automática (são só `SELECT`). `0038_DECISAO` ficou: apesar do nome,
  aplica DDL de verdade.

---

## 3. Explicitamente fora do escopo

- Escrever a migration das seis colunas de `familias` — depende da extração.
- Versionar as 24 funções `sureya_*` — depende da seção 9 da `0053`.
- Qualquer mudança de RLS, policy ou grant — é o Build 1.
- Tornar a conclusão da lavagem transacional — é o Build 2.
- Redesenhar tela, ligar disparo, migrar carteira, alterar saldo real.
- Resolver a convivência entre `planos` e `tumulos` como fonte do contrato (ver
  seção 6): é decisão de produto, e o Build 4 é o lugar dela.

---

## 4. Migration e rollback

| Migration | Efeito | Rollback |
|---|---|---|
| `0052` | `add column if not exists` + `update` de backfill + índice parcial | `drop index idx_tumulos_contrato_agenda; alter table tumulos drop column proximo_servico;` — a coluna é nova e nenhuma outra escreve nela; `planos.proximo_servico` continua intacta como origem do backfill |
| `0053` | nenhum — só `SELECT` | não se aplica |

A `0052` é idempotente: rodar duas vezes não repete o backfill (`where
t.proximo_servico is null`).

**Ordem obrigatória:** backup validado → `0053` (extrair e guardar a baseline) →
`0052` → conferência (a) a (d) no rodapé da `0052`.

---

## 5. Telemetria e alerta necessários

O que este build entrega:

- `gerarServicosDevidos()` devolve `falhas > 0` e grava em `erros_log` quando
  não consegue ler os contratos. Antes devolvia `0` calado.

O que ainda falta (entra no Build 6, mas o insumo nasce aqui):

- alerta quando `POST /api/agenda/gerar` retornar `planosAtivos: 0` **e** existir
  jazigo com `contratado = true` — a contradição que denunciaria a 0052 antes de
  qualquer pessoa perceber;
- heartbeat dos cinco crons do `vercel.json`, com alarme por atraso.

---

## 6. Testes automatizados

```
npm ci        → instalação limpa a partir do package-lock
npm run checar → 0 acessos desprotegidos a .map/.join em dado de fetch
npm run tipos  → tsc --noEmit limpo
npm run testar → 123 passaram, 0 falharam   (antes: 110 passaram, 13 falharam)
npm run build  → build de produção fecha
```

**Ressalva honesta e importante:** a massa de teste agora inclui
`tumulos.proximo_servico`, ou seja, representa o schema **depois** da migration
0052. A suíte verde prova que o código está correto para o schema pretendido —
**não** prova que o banco de produção já está nesse estado. Só a conferência (a)
a (d) do rodapé da `0052`, rodada no Supabase real, prova isso.

---

## 7. Contraprova humana

Rodar no Supabase de produção, em leitura, e guardar os CSVs:

1. `0053` seção 2 — a lista de divergências entre código e banco.
2. `0053` seção 5 e 6 — quantas tabelas estão sem RLS e quantas policies só
   comparam `org_id`, sem distinguir `campo` de `admin`. **Este é o insumo direto
   do Build 1.**
3. `0053` seção 8 e 9 — as funções `security definer`, quem pode executá-las, e
   o código-fonte das que só existem no banco.
4. `0053` seção 12 — quantos buckets estão com `public = true`.
5. `0053` seção 14 — confirmar se existe qualquer controle de migration.

Depois: backup, restauração em projeto separado, e rodar a seção 1 nos dois para
provar que a restauração devolve o mesmo schema.

---

## 8. Critério de go/no-go

| Critério do roadmap | Situação |
|---|---|
| Pipeline verde a partir de clone limpo | ✅ `npm ci` + `npm run ci` |
| Suíte corrigida e executável | ✅ 123/123 |
| Diagnóstico fora da trilha automática | ✅ `migrations/_diagnostico/` |
| Ambientes separados documentados | ✅ `.env.example` |
| Schema real comparado à baseline, sem diferença desconhecida | ❌ **depende de rodar a `0053` no Supabase** |
| Backup restaurado e consultável | ❌ não executado — sem acesso ao ambiente |
| Nenhuma chave de produção no ambiente de ensaio | ❌ a conferir no ambiente |
| Dados de teste cobrindo os fluxos críticos | ❌ **bloqueado**: o seed atual (`SEED_dados_teste.sql`) escreve em `planos` e é anterior à 0049; refazê-lo exige antes saber o schema real de `familias` |

**Parecer: Build 0 NÃO fechado.** A metade que depende do repositório está
pronta e provada. A metade que depende do ambiente não pode ser feita a partir
do código — e é justamente ela que este build existe para forçar.

**O Build 1 não deve começar antes da seção 7.** Escrever policy de RLS sem
saber quais colunas e funções existem de verdade é repetir, na camada de
segurança, o erro que a 0052 corrigiu na de agenda.

---

## 9. Evidências anexadas ao encerramento

Faltam três, todas do ambiente: os CSVs da `0053`, o resultado da conferência
(a)–(d) da `0052` e o log da restauração de backup.
