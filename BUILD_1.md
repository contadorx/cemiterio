# Build 1 — acesso e proteção de dados

**Estado:** **1a entregue**. **1b parcialmente entregue** — o acesso anônimo às
funções está fechado (0057) e o contrato voltou a chegar no jazigo (0058). As
*policies* por papel seguem bloqueadas aguardando a **Consulta A**.

---

## 1. Problema e risco que resolve

A auditoria coloca isto como o P0 número um, e a leitura do repositório
confirma linha a linha. A RLS de hoje nasce na migration 0001 (linhas 274–292)
e é sempre a mesma:

```sql
create policy <tabela>_org on <tabela>
  using      (org_id = current_org_id())
  with check (org_id = current_org_id());
```

**Uma policy por tabela, permissiva, para todas as operações, sem uma palavra
sobre papel.** Isso isola uma organização da outra — e não separa a conta de
campo da conta de administração.

A separação real existe só em `exigirAdmin()` (`src/lib/roles.ts`), no
TypeScript. Só que o navegador da pessoa de campo carrega a URL do projeto, a
chave anônima e o token de sessão — tudo que é preciso para chamar o PostgREST
direto, sem passar por rota nenhuma. O que protege o financeiro hoje é a tela
não mostrar o botão.

---

## 2. Por que 1a e 1b, e não um build só

Para escrever a policy certa é preciso saber qual policy existe hoje. `drop
policy` no escuro derruba a operação: se a policy real tiver outro nome, outra
condição, ou se alguma tabela tiver ganhado policy depois da 0001, o `drop`
erra o alvo e o `create` deixa a tabela mais aberta do que estava.

Voltaram a seção 16 (volume por tabela) e a **Consulta C** (o código das ~50
funções). A Consulta C destravou a metade do 1b que vive nas funções — ver a
seção 9. Falta a **Consulta A**, que é a das *policies*.

Não é atraso: 1a resolve sozinha uma falha de acesso que estava aberta.

---

## 3. O que foi entregue (1a)

### 3.1 O banco passou a saber quem é quem

`migrations/0055_papel_e_membro_ativo.sql` cria:

| Função | Devolve |
|---|---|
| `current_member_role()` | `admin`, `campo` ou `NULL` |
| `is_admin()` | booleano, nunca nulo |
| `is_campo()` | booleano, nunca nulo |

Todas `security definer` com `search_path` fixo, `execute` revogado de `public`
e concedido nominalmente. `anon` continua podendo executar de propósito: sem
sessão elas devolvem `NULL`/`false`, e negar o `execute` faria a policy estourar
erro de permissão em vez de negar em silêncio — erro de permissão em policy
denuncia que o objeto existe.

Sem essas funções, a policy do 1b não teria como ser escrita.

### 3.2 Desligar passou a desligar

`membros.ativo` existe desde a migration 0011 e **não era consultado em lugar
nenhum da autenticação**:

- `current_org_id()` (0001, linha 47) devolvia a org sem olhar `ativo`;
- `src/lib/roles.ts:autenticar()` selecionava apenas `papel,nome`.

Marcar alguém como inativo mudava a listagem da equipe na tela e mais nada: a
sessão seguia válida, as rotas seguiam respondendo e cada policy
`org_id = current_org_id()` seguia liberando.

Corrigido dos dois lados no mesmo commit:

- **banco** — `current_org_id()` agora exige `and ativo`. Como toda policy
  existente chama essa função, a checagem vale para **todas as tabelas de uma
  vez**, sem tocar em policy nenhuma.
- **API** — `autenticar()` lê `ativo` e devolve `403 membro_inativo`.

> ⚠️ **Mudança de comportamento.** Depois da 0055, quem estiver com
> `ativo = false` perde acesso na hora. Rode antes:
> `select user_id, nome, papel, ativo from membros order by ativo, nome;`
> e corrija quem estiver inativo por engano.
>
> Isto revoga acesso a **dados**, não o token do Auth: a sessão continua
> tecnicamente válida até expirar. Revogar a sessão no Auth (banir/remover o
> usuário) fica no 1b.

### 3.3 A contraprova, que é o critério de saída

`testes/contraprova-autorizacao.ts` (`npm run contraprova`).

Não usa o simulador. Fala com o Supabase real pelo mesmo caminho que o
navegador da pessoa de campo pode usar: URL + chave anônima + token de sessão.
É literalmente o ataque descrito no P0.

Verifica, por nível:

**P0** — anônimo não lê `clientes`, `familias`, `tumulos`, `servicos`,
`conta_corrente`, `movimentos`, `membros`; campo não lê financeiro
(`conta_corrente`, `movimentos`, `comprovantes`, `entradas_banco`,
`lancamentos`); `is_admin()` é falso para campo; campo não altera cadastro de
família; campo não conclui serviço de outra executora.

**P1** — campo não lê administração (`config_ia`, `campanhas`, `leads`,
`conversas`, `mensagens`); campo não lê telefone de família; o banco reconhece
os dois papéis; **e o admin continua enxergando tudo que precisa** — se o 1b
apertar demais, é aqui que aparece.

As duas escritas de teste são desfeitas na hora e avisadas no log. Sai com
código 1 se houver qualquer FALHA P0.

Hoje, contra o banco atual, **espera-se FALHA na maior parte dos itens de
campo**: as policies por papel ainda não existem. Esse resultado é a linha de
base do 1b.

---

## 4. O que falta (1b) e o que destrava

`migrations/_diagnostico/0054_baseline_em_3_consultas.sql` — a `0053` tinha 16
seções e o SQL Editor mostra um resultado por vez, o que na prática eram 16
execuções. A `0054` devolve **um JSON por consulta, três consultas no total**.

A **Consulta A** é a que destrava o 1b: RLS por tabela, cada policy com seu
`using`/`with check`, grants por papel, funções `security definer` com
`search_path` e quem pode executá-las, buckets e policies de Storage.

Com ela em mãos, o 1b entrega:

1. policies por operação (`select`/`insert`/`update`/`delete`) em vez de uma
   `all` permissiva;
2. campo escrevendo só início, conclusão, ocorrência, foto e consumo do serviço
   **atribuído a ele** — `executora_id = auth.uid()`;
3. `iniciar`/`concluir` validando organização, papel, atividade e atribuição no
   banco, não só em TypeScript;
4. revisão dos grants e das RPCs `security definer`, revogando o que não for
   necessário;
5. revogação de sessão no Auth ao desligar alguém;
6. convite ou senha temporária forte no lugar da senha inicial de seis
   caracteres; MFA para admin;
7. segredo fora de query string em crons e webhook (header/HMAC).

---

## 5. Migration e rollback

| Migration | Efeito | Rollback |
|---|---|---|
| `0055` | `create or replace` de 4 funções + grants + índice | Recriar `current_org_id()` sem `and ativo` (o corpo original está na 0001, linha 47). As outras três podem ser removidas com `drop function`: nenhuma policy as usa ainda. |
| `0056` | Nenhum enquanto as PARTES 2 e 3 estiverem comentadas | `update tumulos set proximo_servico = null where contratado;` e recomeçar |
| `0057` | Revoga/concede EXECUTE; remove o `sureya_fechar_dia` de 4 args; corrige 2 funções | `grant execute on all functions in schema public to authenticated;` devolve o estado anterior (amplo demais — é rollback de emergência, não destino) |
| `0058` | Cria gatilho em `planos` + uma passada de espelho | `drop trigger trg_espelha_plano_no_jazigo on planos;` — o espelho já aplicado permanece, e é o estado correto |

`0056` é a companheira operacional da `0052`: como `planos` tem 1 linha, quase
todo jazigo contratado ficaria com `proximo_servico` nulo — e o gerador trata
nulo como **devido hoje** (`agenda.ts:226`). Sem ela, a primeira rodada depois
da 0052 joga a carteira inteira na rota do mesmo dia. As duas partes que
escrevem estão comentadas de propósito.

---

## 6. Ordem de execução no Supabase

```
1. backup validado
2. 0054 Consulta A, B e C   → só leitura; guardar os três JSON
3. 0053 §1                  → só leitura; a lista completa de colunas
4. conferir membros:  select user_id, nome, papel, ativo from membros;
5. 0055                     → papéis no banco + desligamento que desliga
6. npm run contraprova      → a linha de base: o que ainda está aberto
7. 0057                     → fecha as funções para anônimo (P0)
8. npm run contraprova      → os itens de ANÔNIMO devem virar PASSA
9. 0052                     → a coluna que falta (P0 da agenda)
10. 0058                    → o plano volta a chegar no jazigo (P0)
11. 0056 PARTE 1            → quantos ficariam "devidos hoje"
12. 0056 PARTE 2 e/ou 3     → o ponteiro por decisão
13. /api/agenda/gerar com horizonte 1  → ensaio curto antes do mês inteiro
```

A 0057 vem antes da 0052 de propósito: fechar porta aberta para a internet tem
precedência sobre religar a agenda.

O passo 6 é o que transforma "acho que está aberto" em uma lista de portas com
nome.

---

## 7. Critério de go/no-go do Build 1

| Critério | Situação |
|---|---|
| Helpers de papel no banco, com validação de membro ativo | ✅ `0055` |
| Desligar revoga acesso a dados imediatamente | ✅ banco + API |
| Contraprova executável, independente da interface | ✅ `npm run contraprova` |
| Funções fechadas para anônimo/`PUBLIC` | ✅ `0057` |
| Contrato escrito em `planos` chega em `tumulos` | ✅ `0058` |
| Policies por operação | ❌ **depende da Consulta A** |
| Guarda `is_admin()` dentro das ~35 funções administrativas | ❌ próximo lote |
| Campo escreve só no serviço atribuído a ele | ❌ 1b |
| Grants e RPCs `security definer` revisados | ❌ 1b — depende da Consulta A |
| Revogação de sessão no Auth ao desligar | ❌ 1b |
| Senha/convite/MFA | ❌ 1b |
| Segredo fora de query string | ❌ 1b |
| Matriz anônimo/campo/admin passando | ❌ espera-se falhar hoje; é a linha de base |

**Parecer: Build 1 não fecha.** A fundação está de pé e uma falha real de acesso
foi fechada. A fronteira por papel — o P0 de fato — depende de três JSON.

---

## 8. Achados de baseline confirmados até aqui

O volume por tabela (seção 16), sozinho, já provou três coisas.

### 8.1 A agenda parada tem impressão digital

68 jazigos, 298 famílias, `fila_liberacao` vazia, `erros_log` vazio — e
**10 serviços no banco inteiro**.

Se o gerador estivesse rodando, 68 jazigos contratados produziriam dezenas por
mês. Dez é o número de quem cria serviço na mão. É o efeito visível do P0
corrigido pela `0052`: a consulta falhava, o erro era descartado, e a geração
devolvia zero em silêncio.

`erros_log` com zero linhas fecha o argumento: não é que o erro passou
despercebido — ele nunca foi registrado.

### 8.2 `planos` é legado morto

**1 linha.** O contrato vivo está em `tumulos`, como a migration 0049 pretendia.
Isso confirma que a `0052` corrige na direção certa — e que o backfill dela vai
alcançar quase ninguém, que é exatamente o motivo da `0056` existir.

Também deixa uma pergunta aberta para o Build 4: `capacidade.ts` e `proativo.ts`
**ainda leem `planos`**. Rodando contra uma tabela de 1 linha, a capacidade
calculada e a régua de cobrança estão trabalhando praticamente no vazio.

### 8.3 Uma tabela inteira só existe no banco

`quitacoes` (56 kB, 0 linhas) está no banco e **não tem `create table` em
nenhuma migration**. Ela só é citada em prosa, no
`migrations/LEIA-ME_entrada_identificada.md`:

> "Uma tabela nova (`quitacoes`) liga cada crédito aos débitos que ele pagou.
> Isso permite pagamento parcial de uma lavagem, um Pix pagando várias
> lavagens, saber de cada lavagem quanto já foi pago. Testado no banco."

Testado no banco, e só no banco. É a peça central do pagamento parcial e da
conciliação — o coração do Build 4 — e o repositório não sabe que ela existe.

Somando: **`quitacoes` (tabela) + as seis colunas de contrato de `familias` +
`tumulos.proximo_servico` + as 24 funções `sureya_*` da migration 0046.**
Restaurar um backup a partir do repositório não reconstrói este sistema. É o
P0 nº 4 da auditoria, agora com nome e sobrenome.

---

## 9. O que a Consulta C revelou (dump das funções)

Voltaram ~50 funções `sureya_*`. Quase todas `SECURITY DEFINER` — rodam com os
privilégios do dono e **ignoram RLS**. Nelas, RLS não protege nada: o que
protege é o `GRANT EXECUTE`.

### 9.1 P0 — as funções de dinheiro estão abertas para `PUBLIC`

No PostgreSQL, função nova nasce com `GRANT EXECUTE TO PUBLIC`. A migration
0016 sabia disso e escreveu:

> "As funções das migrations 0001–0006 nasceram sem revoke from public, então
> PUBLIC mantinha EXECUTE e o anon herdava."

Ela revogou **cinco**. Depois vieram as migrations 0017–0051 com dezenas de
funções novas — incluindo todas as de dinheiro. Só a 0014 e a 0038 voltaram a
revogar algo.

Ficaram executáveis por `PUBLIC` (logo, por `anon` — a chave que está no
navegador de qualquer visitante): `sureya_pagamento_avulso`,
`sureya_entrada_identificada`, `sureya_registrar_entrada_banco`,
`sureya_pagar_equipe`, `sureya_estornar_servico`, `sureya_excluir_servico`,
`sureya_anonimizar_cliente`, `sureya_saldo_abertura`, `sureya_aplicar_reajuste`.

O que segura a maioria hoje é `current_org_id()` devolver `NULL` sem sessão.
Mas `sureya_registrar_indicacao` e as `sureya_portal_*` **não dependem de
sessão** — acham a org pelo token ou pelo código. Depender de um efeito
colateral como fronteira de segurança não é fronteira.

**`migrations/0057_fecha_a_porta_das_funcoes.sql`** inverte o padrão: revoga de
`public`, `anon` e `authenticated` em toda função `sureya_*` que exista no
banco (inclusive as que nunca estiveram no repositório — escrever a lista à mão
deixaria de fora justamente a esquecida), e libera nominalmente.

O mapa de quem precisa do quê saiu do código, rota por rota:

| Quem chama | Funções | Fonte |
|---|---|---|
| `anon` (chave pública) | `sureya_portal_cabecalho`, `_historico`, `_irmaos`, `sureya_responder_avaliacao`, `sureya_registrar_indicacao` | `api/{portal,avaliar,indicar}/route.ts` criam o cliente com `SUPABASE_ANON_KEY` |
| `campo` (`exigirLogado`) | `sureya_puxar_servicos`, `sureya_conversa_equipe`, `sureya_fechar_dia`, `sureya_registrar_gps` | 4 rotas |
| `admin` (`exigirAdmin`) | as outras ~35 | 27 rotas |

Não há `.rpc(` em nenhum `.tsx`: nenhuma função é chamada do navegador.

### 9.2 O que a 0057 ainda NÃO fecha

`authenticated` inclui campo **e** admin, e nenhuma dessas funções olha
`papel`. Depois da 0057, uma conta de campo ainda chama
`sureya_pagamento_avulso` direto pelo PostgREST.

A correção é `if not is_admin() then raise exception 'somente_admin'; end if;`
dentro de cada função administrativa — as funções vieram na 0055. Isso exige
reemitir cada uma com o corpo inteiro, em lotes, começando pelas de dinheiro.

**Não farei isso por regex sobre `pg_get_functiondef()`.** Reescrever 50 funções
de segurança com expressão regular em produção troca um risco conhecido por um
pior.

### 9.3 P0 — o contrato é escrito em `planos` e lido em `tumulos`

A 0049 mudou a **leitura** do contrato para `tumulos`. A **escrita** ficou em
`planos`, em seis funções e duas rotas:

```
sureya_lead_vira_cliente        insert into planos
sureya_reagenda_apos_execucao   update planos set proximo_servico   (gatilho)
sureya_remarcar_servico         update planos set proximo_servico
sureya_pular_servico            update planos set proximo_servico
sureya_aplicar_reajuste         update planos set valor_vigente
sureya_adiar_reajuste           update planos set reajuste_adiado_ate
POST /api/planos                insert into planos
/api/tumulos/importar           insert into planos
```

É o mesmo bug que o comentário do `agenda.ts` diz ter resolvido — voltando pela
outra porta. Consequências: **lead convertido nunca entra na agenda** (104 leads
no banco), concluir não avança o ponteiro que a agenda lê, remarcar e pular não
replanejam nada, e o reajuste muda um valor que não é o cobrado.

**`migrations/0058_espelha_plano_no_jazigo.sql`** põe um gatilho em `planos` que
espelha o contrato para `tumulos`. Fecha a classe inteira em vez de remendar
seis funções e deixar a sétima quebrada. Direção única (`planos` → `tumulos`),
porque o caminho contrário já existe em `agenda.ts:296` e espelhar nos dois
sentidos criaria laço.

Isto **não** decide qual tabela é a fonte da verdade — essa é a decisão do
Build 4, a mesma que a auditoria pede para `movimentos` × `conta_corrente`. O
espelho só impede que a divergência continue produzindo agenda vazia.

### 9.4 `sureya_fechar_dia` existe duas vezes

```
(uuid, date, text, text)                        ← antiga
(uuid, date, text, text, boolean default false) ← atual
```

Com o quinto argumento tendo `DEFAULT`, uma chamada de quatro argumentos casa
com as duas e o PostgreSQL recusa: *function is not unique*.

O código já convive com isso: `api/campo/fechar-dia/route.ts` chama com cinco
argumentos e, **se der erro, tenta de novo com quatro** (linha 52). Esse
segundo caminho não pode funcionar — é a cicatriz de alguém ter batido nisso e
contornado por fora. A versão antiga também ignora `motivo_nao_feito`, então o
"Começou a chover" que a pessoa digitou some do adiamento.

A 0057 remove a antiga. Depois disso o fallback vira código morto.

### 9.5 Semanal e quinzenal não existem para o replanejamento

A 0047b acrescentou `semanal` e `quinzenal` ao enum `sureya_cadencia`.
`sureya_intervalo_dias` nunca soube: para essas duas cai no `else 0`. E quem
chama trata zero como "não faço nada":

```
sureya_pular_servico           if v_intervalo <= 0 then return null
sureya_remarcar_servico        if v_intervalo <= 0 then ... 0 seguintes
sureya_reagenda_apos_execucao  if v_intervalo <= 0 then return new
```

Em contrato semanal ou quinzenal: remarcar não replaneja, pular não avança,
concluir não agenda a próxima. Sem erro. Corrigido na 0057, junto com
`sureya_descreve_frequencia`, que também não tinha as duas cadências.

### 9.6 Mais coisas que só existem no banco

- **`unaccent_simples()`** — usada por `sureya_palpites_entrada`, não aparece
  em migration nenhuma e não tem prefixo `sureya_`, então nem saiu na Consulta C.
- **`sureya_saldo_abertura`** usa `sureya_tipo_movimento`,
  `sureya_origem_movimento` e `sureya_status_conc`, enquanto `conta_corrente`
  usa `sureya_tipo_lancamento` e `sureya_origem_lancamento`. São **dois modelos
  financeiros paralelos** vivos ao mesmo tempo — o `movimentos` × `conta_corrente`
  da auditoria, agora com os enums à vista.

A lista de coisas que existem só no banco chega a: **`quitacoes` (tabela), as 6
colunas de contrato de `familias`, `unaccent_simples()`, e ~50 funções
`sureya_*`.** A Consulta C é o texto que precisa virar migration versionada —
guarde o resultado dela, é o insumo do arquivo que fecha o Build 0.
