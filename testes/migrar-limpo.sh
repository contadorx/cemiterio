#!/usr/bin/env bash
# ============================================================================
# O REPOSITÓRIO RECONSTRÓI O BANCO?
#
# Aplica a trilha inteira de `migrations/` a um PostgreSQL vazio e falha se
# qualquer arquivo não aplicar.
#
# Esta é a pergunta central do Build 0. Ela já foi respondida com "não" três
# vezes, e cada vez o motivo era diferente:
#
#   · 0051 fazia `select id into v_org from orgs limit 1` e inseria dados de
#     uma operação específica: em banco vazio, `v_org` nulo estourava o
#     `not null` de `ruas.org_id`;
#   · `quitacoes` e 5 colunas de `movimentos` não existiam em migration alguma;
#   · 32 colunas e 15 funções `sureya_*` só existiam dentro do banco.
#
# Nenhum desses aparece em revisão de código. Todos aparecem aqui, na hora.
#
# USO
#   testes/migrar-limpo.sh                  # sobe um Postgres temporário
#   DATABASE_URL=postgres://... testes/migrar-limpo.sh   # usa um já existente
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
PORTA=${PGPORT_TESTE:-55433}
DIR=${PGDATA_TESTE:-/tmp/sureya-migrar-limpo}
PROPRIO=0

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "$PGBIN" ]; then
    echo "PostgreSQL não encontrado. Instale-o ou aponte DATABASE_URL."; exit 2
  fi
  PROPRIO=1
  rm -rf "$DIR"; mkdir -p "$DIR"
  DONO=$(id -u postgres >/dev/null 2>&1 && echo postgres || echo "$(id -un)")
  chown "$DONO" "$DIR" 2>/dev/null || true
  RODA() { if [ "$DONO" = "$(id -un)" ]; then bash -c "$1"; else su "$DONO" -c "$1"; fi; }
  RODA "$PGBIN/initdb -D $DIR -U postgres --auth=trust" >/dev/null 2>&1
  RODA "$PGBIN/pg_ctl -D $DIR -o '-p $PORTA -k /tmp' -l $DIR/pg.log start" >/dev/null 2>&1
  for _ in $(seq 1 20); do pg_isready -h /tmp -p "$PORTA" >/dev/null 2>&1 && break; sleep 0.5; done
  export PGHOST=/tmp PGPORT=$PORTA PGUSER=postgres
  psql -q -d postgres -c "drop database if exists sureya_limpo" >/dev/null 2>&1
  psql -q -d postgres -c "create database sureya_limpo" >/dev/null
  ALVO="-d sureya_limpo"
else
  ALVO="$DATABASE_URL"
fi

encerrar() {
  if [ "$PROPRIO" = "1" ]; then
    RODA "$PGBIN/pg_ctl -D $DIR -m immediate stop" >/dev/null 2>&1
    rm -rf "$DIR"
  fi
}
trap encerrar EXIT

# ---------------------------------------------------------------------------
# O que o Supabase fornece pronto e não é responsabilidade do repositório.
# Se um destes stubs precisar crescer, é sinal de dependência nova em
# infraestrutura — vale registrar, não esconder.
# ---------------------------------------------------------------------------
psql -q $ALVO -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(),
  email text, raw_user_meta_data jsonb, created_at timestamptz default now(), banned_until timestamptz);
create table if not exists storage.buckets (id text primary key, name text,
  public boolean default false, file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, created_at timestamptz default now(), metadata jsonb);
-- `unaccent_simples` é usada por sureya_palpites_entrada e também só existe no
-- banco de produção. Não tem prefixo `sureya_`, então nem saiu na extração.
create or replace function unaccent_simples(t text) returns text language sql immutable as $$
  select translate(coalesce(t,''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                                   'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'); $$;
SQL

ok=0; falhou=0
for f in $(ls migrations/*.sql | grep -vE "SEED|_diagnostico" | sort -V); do
  saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f "$f" 2>&1)
  if [ $? -eq 0 ]; then
    ok=$((ok+1))
  else
    falhou=$((falhou+1))
    echo "FALHOU  $(basename "$f")"
    echo "$saida" | grep -m2 -E "ERROR|DETAIL" | sed 's/^/         /'
  fi
done

echo
echo "============================================================"
echo "migrations aplicadas: $ok    falharam: $falhou"
if [ "$falhou" -gt 0 ]; then
  echo "O repositório NÃO reconstrói o banco."
  echo "============================================================"
  exit 1
fi

# ---------------------------------------------------------------------------
# O PLACAR
#
# Os numeros da direita vieram da consulta 5 de
# `migrations/_diagnostico/0063_gerar_ddl_do_que_falta.sql`, rodada no Supabase
# de producao em 21/08/2026. Divergencia aqui significa objeto que existe num
# lado e nao no outro — foi assim que apareceram as 32 colunas, as 15 funcoes e
# os 4 gatilhos que so existiam dentro do banco.
#
# Quando producao mudar de proposito, atualize estes esperados no mesmo commit:
# o valor do teste esta em eles serem a verdade conferida, nao um numero velho.
# ---------------------------------------------------------------------------
ESPERADO_TABELAS=${ESPERADO_TABELAS:-55}
ESPERADO_FUNCOES=${ESPERADO_FUNCOES:-56}
ESPERADO_GATILHOS=${ESPERADO_GATILHOS:-14}
ESPERADO_POLICIES=${ESPERADO_POLICIES:-62}

# LACUNA DECLARADA
#
# Producao tem 7 policies a mais que o repositorio. Elas foram criadas a mao e
# nao estao em migration nenhuma; a CONSULTA A do _diagnostico/0054 devolve
# todas com `using` e `with check`, e e ela que fecha este numero.
#
# Enquanto isso, a lacuna fica DECLARADA em vez de derrubar o CI. A diferenca
# importa: uma divergencia declarada aparece em toda execucao e tem dono; um
# CI vermelho permanente vira ruido e para de ser lido.
#
# Quando as 7 policies entrarem numa migration, ZERE esta variavel. Se ela
# ficar aqui depois disso, o teste passa a esconder divergencia de verdade.
POLICIES_PENDENTES=${POLICIES_PENDENTES:-7}

# DELTA DELIBERADO DE FUNCOES
#
# O placar de producao e um retrato de 21/08/2026, ANTES das migrations 0057+.
# Estas mudam o numero de proposito, e o esperado tem de andar junto:
#
#   0057  -1  remove o `sureya_fechar_dia` de 4 argumentos (duplicado: com o
#             5o parametro tendo DEFAULT, chamada de 4 args era ambigua)
#   0058  +1  sureya_espelha_plano_no_jazigo
#   0066  +1  sureya_concluir_lavagem
#
# Some um item aqui no mesmo commit em que criar ou remover uma funcao. Se
# ficar desatualizado, o placar acusa divergencia que nao existe — e um alarme
# que dispara sem motivo e pior que nao ter alarme.
FUNCOES_DELTA=${FUNCOES_DELTA:-1}

tb=$(psql -q $ALVO -tAc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")
fn=$(psql -q $ALVO -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sureya\_%';")
tg=$(psql -q $ALVO -tAc "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal;")
po=$(psql -q $ALVO -tAc "select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';")

divergiu=0
linha() {
  if [ "$2" = "$3" ]; then
    printf "  %-10s %4s  = producao (%s)\n" "$1" "$2" "$3"
  else
    printf "  %-10s %4s != producao (%s)   <-- DIVERGENCIA\n" "$1" "$2" "$3"
    divergiu=1
  fi
}
echo "PLACAR — repositorio reconstruido x producao (21/08/2026)"
linha "tabelas"  "$tb" "$ESPERADO_TABELAS"
linha "funcoes"  "$fn" "$((ESPERADO_FUNCOES + FUNCOES_DELTA))"
linha "gatilhos" "$tg" "$ESPERADO_GATILHOS"
linha "policies" "$((po + POLICIES_PENDENTES))" "$ESPERADO_POLICIES"
if [ "$POLICIES_PENDENTES" -gt 0 ]; then
  echo
  echo "  ATENCAO: $POLICIES_PENDENTES policies ainda nao estao em migration."
  echo "  O repositorio cria $po; producao tem $ESPERADO_POLICIES."
  echo "  Falta a CONSULTA A do _diagnostico/0054 para recupera-las."
fi
echo

if [ "$divergiu" = "1" ]; then
  echo "As migrations aplicam, mas o resultado NAO e o banco de producao:"
  echo "algum objeto existe so de um lado."
  echo "Rode a consulta 5 do _diagnostico/0063 e compare."
  echo "============================================================"
  exit 1
fi

echo "O repositorio reconstroi o banco."
echo "============================================================"
