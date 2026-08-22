#!/bin/bash
# Sobras que tapam a home.
#
# O site já foi HTML estático gerado pelo build.py, e naquele tempo a home
# morava em `public/index.html`. Quando virou Next.js esses arquivos deixaram de
# ser gerados — mas descompactar um zip por cima ACRESCENTA e SOBRESCREVE, nunca
# remove. Então eles continuam lá, e a Vercel serve arquivo antes de rota: a
# home em português abre a versão velha, e /en abre a nova.
#
# Rode isto DENTRO da pasta que você publica.
#
#   bash LIMPAR-SOBRAS.sh          -> só mostra o que achou
#   bash LIMPAR-SOBRAS.sh --apagar -> apaga

cd "$(dirname "$0")" || exit 1
achou=0

echo "procurando em public/…"
for f in $(find public -name '*.html' ! -name 'app.html' 2>/dev/null); do
  echo "  sobra: $f"; achou=1
done
for L in en es de fr; do
  [ -d "public/$L" ] && { echo "  sobra: public/$L/"; achou=1; }
done

# a versão antiga também podia deixar isto na raiz
for f in index.html precos.html privacidade.html termos.html seguranca.html \
         verificar.html comparativo.html link.html time.html; do
  [ -f "$f" ] && { echo "  sobra: $f"; achou=1; }
done
for L in en es de fr; do
  [ -d "$L" ] && [ -f "$L/index.html" ] && { echo "  sobra: $L/"; achou=1; }
done

if [ "$achou" = 0 ]; then
  echo "nada. a home velha não vem daqui."
  exit 0
fi

if [ "$1" = "--apagar" ]; then
  find public -name '*.html' ! -name 'app.html' -delete 2>/dev/null
  for L in en es de fr; do rm -rf "public/$L"; done
  rm -f index.html precos.html privacidade.html termos.html seguranca.html \
        verificar.html comparativo.html link.html time.html
  for L in en es de fr; do [ -f "$L/index.html" ] && rm -rf "$L"; done
  echo
  echo "apagado. publique de novo — e, se a home continuar velha, faça"
  echo "Redeploy com \"Use existing build cache\" DESMARCADA."
else
  echo
  echo "rode com --apagar para remover."
fi
