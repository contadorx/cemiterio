# O banco, versionado

**Antes:** `supabase/` tinha `functions/` e **zero `.sql`**, contra mais de vinte
RPCs `walkstamp_*` chamados pelo código. A camada de dados paga era artesanal e
**não podia ser reconstruída a partir do Git** — não havia como promover de
homologação para produção, revisar uma política de acesso, nem voltar de um erro.

**Agora:** 42 migrações versionadas, e um comando que prova que elas reconstroem
a produção.

```sh
PGHOST=/tmp/pgsock PGPORT=5433 sh supabase/testes/prova.sh
```

Ele levanta o esquema do zero num Postgres local, compara a impressão digital do
resultado com a expectativa gravada, e roda 40 afirmações sobre o comportamento
das funções. Sai com 0 ou com o diff na tela. Não fala com a produção.

---

## De onde vieram as 38 primeiras

Não foram escritas de memória. A base guarda o SQL de cada migração que aplicou,
em `supabase_migrations.schema_migrations.statements`, e foi de lá que elas
saíram — **verbatim**. Cada arquivo foi conferido por md5 contra o que a base
diz que aplicou:

```sh
sh supabase/conferir.sh      # 38 conferem, 0 faltam, 0 diferem
```

`MANIFESTO.md5` guarda os 38 hashes. Ele não é decoração: a primeira tentativa
de recuperar o conteúdo foi por base64 e chegou corrompida — o md5 pegou, e por
isso o método mudou. Um arquivo que "parece o SQL certo" não é o SQL certo.

## E as três últimas

São o que a comparação encontrou de fora do Git.

**`20260821203000_trazer_para_o_git_o_nps_do_painel`** — três objetos existiam em
produção e nenhuma migração os criava:

| | |
|---|---|
| `walkstamp.negocio_painel_base()` | a consulta grande do painel, renomeada |
| `walkstamp.negocio_nps()` | o cálculo de NPS a partir das notas |
| `walkstamp.negocio_painel()` | virou um invólucro de duas linhas |

Foram escritos direto no editor de SQL do painel. Se a base tivesse sido perdida
ontem, o painel voltaria **sem o NPS** e com a consulta antiga — e ninguém
saberia dizer o que faltou, porque não havia com o que comparar. É um no-op em
produção: o rename é guardado por `if not exists` e as funções entram por
`create or replace` com o corpo idêntico ao que já roda.

**`20260821203100_rls_em_todas_as_tabelas_do_esquema`** — a primeira migração do
projeto escreveu a regra ("RLS ligada e nenhuma policy, só o service_role
enxerga"). Ela valeu para as quatro tabelas daquele dia; das catorze seguintes,
**sete ficaram sem**: `cliente`, `config`, `emissao`, `fatura`, `modelo_doc`,
`recado`, `usuario`.

Isto **não é um buraco aberto** — medido na produção, `anon` e `authenticated`
não têm USAGE no esquema `walkstamp` e não têm SELECT em nenhuma das dezoito
tabelas, e o PostgREST só expõe `public`. É a segunda tranca. A parede é uma
linha de `grant` que um dia alguém concede sem pensar, e nesse dia a diferença
entre as onze e as sete é a diferença entre nada vazar e vazar fatura, usuário e
chamado.

**`20260821203200_limpar_os_dois_chamados_de_prova`** — **a única das três que
mexe em dado.** `20260816001623_prova_do_chamado` abriu dois chamados de mentira
e respondeu um; a limpeza que veio junto é anterior e nunca os varreu. Medido:
a produção tem 5 chamados, dos quais 2 são estes. E a consequência não é
cosmética — `chamado_resposta()` calcula o tempo médio a partir de uma resposta
que ninguém escreveu, e **esse número aparece na página pública**, que existe
justamente para não prometer prazo inventado.

## A paridade, medida

A mesma consulta (`testes/impressao.sql`) rodou nos dois lados. Com as 39
primeiras migrações, contra a produção de 21/08/2026:

| categoria | quantos | bate |
|---|---:|---|
| balde | 2 | sim |
| coluna | 157 | sim |
| função | 85 | sim |
| índice | 39 | sim |
| permissão | 255 | sim |
| restrição | 54 | sim |
| RLS | 18 | sim |
| sequência | 16 | sim |

**As oito.** As três migrações seguintes ainda **não foram aplicadas**. Depois
do `db push`, e só isto muda:

| migração | o que muda na produção |
|---|---|
| `…203100` RLS | `rls` vai de 11 tabelas ligadas para 18 |
| `…203200` limpeza | `walkstamp.recado` perde as 2 linhas de teste |
| `…203300` search_path | 13 funções ganham `proconfig`; comportamento igual |

A `…203000` (o NPS) não muda nada: ela descreve o que já está lá.

## O que o linter do Supabase diz, e o que fazer com cada coisa

`get_advisors` sobre a produção, triado:

- **`rls_enabled_no_policy` · 11 tabelas · INFO** — é o desenho, escrito na
  primeira migração do projeto: RLS ligada e *nenhuma* política, porque só o
  `service_role` lê estas tabelas e todo o resto passa pelas funções. Depois da
  `…203100` serão 18. Não é defeito.
- **`function_search_path_mutable` · 13 funções · WARN** — real, e é o que a
  `…203300` resolve.
- **`anon_security_definer_function_executable` · 6 funções · WARN** — são
  exatamente as seis que o navegador *deve* chamar: `walkstamp_evento`,
  `walkstamp_interesse`, `walkstamp_recado`, `walkstamp_chamado_ver`,
  `walkstamp_chamado_tempo` e `walkstamp_chamado_resposta`. Cada uma tem, na
  migração que a criou, o parágrafo dizendo por quê. A prova de comportamento
  afirma esta lista pelo nome: se ela crescer, `prova.sh` reprova.
- **`auth_leaked_password_protection` · WARN** — é um botão do painel, não
  esquema, e o produto entra por link mágico e não por senha. Fica com você,
  e o custo de ligar é um clique.

## O que fazer com isto

```sh
supabase link --project-ref kjlnyyblhanficgpends
supabase db push          # aplica as 3 novas; as 38 já constam como aplicadas
supabase db reset         # local: refaz do zero e roda o seed.sql
```

`config.toml` fixa o `project_id`, a versão do Postgres e — o que mais importa —
deixa escrito que a API expõe **só `public`**. É essa a parede que segura o
esquema `walkstamp` fora do alcance do navegador, e ela precisava estar em
algum lugar do repositório para não ser desfeita sem querer.

`seed.sql` monta um ambiente de desenvolvimento com as três formas de conta que o
produto conhece — Time com admin e membro, Personal, e um roteiro em andamento —
mais faturas, chamados com nota e marcos de uso, para o painel de negócio abrir
com números em vez de zeros. Tudo em `.example`, que é reservado por RFC: se uma
linha dele aparecer na produção, o domínio a denuncia sozinha.

## Os arquivos

| | |
|---|---|
| `migrations/` | as 42, em ordem de versão |
| `MANIFESTO.md5` · `conferir.sh` | a conferência das 38 contra a base |
| `testes/prova.sh` | reconstrói, compara e prova — o comando que importa |
| `testes/reconstruir.sh` | só o passo 1, para depurar uma migração |
| `testes/00-ambiente.sql` | o andaime: papéis, Storage, e a armadilha do Supabase |
| `testes/impressao.sql` · `esperado.txt` | a impressão digital e a expectativa |
| `testes/10-fumaca.sql` | as 40 afirmações de comportamento |
| `seed.sql` · `config.toml` | desenvolvimento local |

### Uma palavra sobre o andaime

`testes/00-ambiente.sql` reproduz de propósito o
`alter default privileges ... grant execute on functions to anon, authenticated`
que o Supabase deixa armado. Sem ele, as três travas do histórico que levantam
exceção quando uma função fica aberta ao navegador **passariam por vacuidade** —
num Postgres pelado nenhuma função nasce concedida a `anon`, então a busca por
funções abertas voltaria vazia e o teste diria "verde" sobre uma fechadura que
ninguém testou.

### O que a reconstrução carrega junto

Replicar o histórico inteiro executa também as migrações de prova de 15 e 16 de
agosto. Elas se limpam quase todas; sobram as duas linhas em `walkstamp.recado`
que a última migração remove. Fora isso, um banco reconstruído nasce vazio.
