#!/bin/sh
# Reconstrói o banco do zero, a partir do que está no Git e só disso.
#
# É esta a pergunta que o B3 existe para responder: "se a base sumir hoje, o
# repositório a levanta de novo?". Uma resposta escrita num README é uma
# opinião; esta é a resposta que roda.
#
#   uso: reconstruir.sh [nome-do-banco]   (padrão: walkstamp_prova)
set -e
AQUI=$(cd "$(dirname "$0")" && pwd)
BANCO=${1:-walkstamp_prova}
: "${PGHOST:=/tmp/pgsock}" "${PGPORT:=5433}" "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER

psql -q -Atc "drop database if exists $BANCO" postgres
psql -q -Atc "create database $BANCO" postgres

psql -q -v ON_ERROR_STOP=1 -f "$AQUI/00-ambiente.sql" "$BANCO" >/dev/null

n=0
for f in "$AQUI"/../migrations/*.sql; do
  n=$((n+1))
  if ! psql -q -v ON_ERROR_STOP=1 -f "$f" "$BANCO" >/tmp/mig.log 2>&1; then
    echo "PAROU em $(basename "$f")"; tail -12 /tmp/mig.log; exit 1
  fi
  # E anota, como o `supabase db push` anotaria.
  ver=$(basename "$f" .sql | cut -d_ -f1)
  nome=$(basename "$f" .sql | cut -d_ -f2-)
  psql -q -Atc "insert into supabase_migrations.schema_migrations (version, name)
                values ('$ver', '$nome') on conflict (version) do nothing" "$BANCO"
done
echo "$n migrações aplicadas em $BANCO"
