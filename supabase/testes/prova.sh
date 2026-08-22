#!/bin/sh
# ============================================================================
# A PROVA DO BANCO, inteira, num comando.
#
#   1. reconstrói o esquema do zero, só com o que está no Git;
#   2. compara a impressão digital do resultado com `esperado.txt`;
#   3. roda a prova de comportamento das funções.
#
# Ela responde a pergunta do B3 — "se a base sumir hoje, o repositório a
# levanta de novo?" — com um código de saída, e não com um parágrafo.
#
#   uso:  PGHOST=/tmp/pgsock PGPORT=5433 sh supabase/testes/prova.sh
#
# Precisa de um Postgres 15+ acessível como superusuário. Ele NÃO fala com a
# produção: o banco é local, descartável, e é criado e destruído aqui.
# ============================================================================
set -e
AQUI=$(cd "$(dirname "$0")" && pwd)
BANCO=${BANCO:-walkstamp_prova}
: "${PGHOST:=/tmp/pgsock}" "${PGPORT:=5433}" "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER BANCO

if ! psql -Atc 'select 1' postgres >/dev/null 2>&1; then
  echo "sem Postgres em $PGHOST:$PGPORT — a prova do banco NAO rodou"; exit 1
fi

echo "[1] reconstruindo do zero"
sh "$AQUI/reconstruir.sh" "$BANCO" | sed 's/^/     /'

echo "[2] conferindo a impressao digital do esquema"
psql -F'  ' -A -t -f "$AQUI/impressao.sql" "$BANCO" > /tmp/impressao-obtida.txt
if diff -u "$AQUI/esperado.txt" /tmp/impressao-obtida.txt > /tmp/impressao.diff; then
  sed 's/^/     ok   /' "$AQUI/esperado.txt"
else
  echo "     O ESQUEMA MUDOU. esperado a esquerda, obtido a direita:"
  sed 's/^/     /' /tmp/impressao.diff
  echo
  echo "     Se a mudanca for de proposito, regenere a expectativa:"
  echo "       psql -F'  ' -A -t -f $AQUI/impressao.sql $BANCO > $AQUI/esperado.txt"
  exit 1
fi

echo "[3] provando o comportamento das funcoes"
psql -q -v ON_ERROR_STOP=1 -f "$AQUI/10-fumaca.sql" "$BANCO" 2>&1 \
  | sed 's/^psql:[^ ]* NOTICE:  //' | sed 's/^/     /'

echo
echo "Prova do banco: passou."
