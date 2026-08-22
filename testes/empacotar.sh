#!/bin/bash
# MONTA O ZIP DE ENTREGA E O AUDITA — nesta ordem, sem pular a segunda parte.
#
# O pacote é montado DE DENTRO da pasta do projeto, nunca da pasta acima.
# Montado de fora, os padrões de `naovai.txt` não casam com o prefixo dos
# caminhos e as chaves privadas vão junto. Já aconteceu uma vez.
#
# E depois se CONFERE, não se confia: `emitir-licenca.py`, as duas chaves
# Ed25519, `node_modules`, `.next`, `.env` e `PLANO-TIME` têm que contar zero.
#
# Esta auditoria era feita à mão a cada entrega. Uma verificação que depende de
# alguém lembrar é uma verificação que um dia não acontece — e o dia em que ela
# não acontece é o dia em que a chave privada viaja.
#
#   bash testes/empacotar.sh                  # -> /tmp/walkstamp.zip
#   bash testes/empacotar.sh /tmp/outro.zip
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
DESTINO="${1:-/tmp/walkstamp.zip}"

cd "$RAIZ" || exit 1
rm -f "$DESTINO"
zip -qr "$DESTINO" . -x@testes/naovai.txt || { echo "zip falhou"; exit 1; }

echo "pacote: $DESTINO  ($(du -h "$DESTINO" | cut -f1))"
echo

LISTA="$(unzip -Z1 "$DESTINO")"
# O conteúdo vai para um arquivo, e não para uma variável: um zip tem bytes nulos
# e a substituição de comando os descarta com um aviso — o que significa auditar
# um texto diferente do que está no pacote.
#
# E o PRÓPRIO auditor sai da varredura: ele é o arquivo que lista os padrões
# proibidos, então ele casa com todos eles. Um alarme que sempre toca é um alarme
# desligado.
TMPC="$(mktemp)"
trap 'rm -f "$TMPC"' EXIT
unzip -p "$DESTINO" -x 'testes/empacotar.sh' 2>/dev/null > "$TMPC"
ruim=0

# --- 1. arquivos que não podem estar lá, POR NOME ---------------------------
# Expressões, e não pedaços de texto: `.env` como pedaço casa com
# `.env.exemplo`, que é justamente o arquivo que DEVE viajar — o modelo que
# ensina quais variáveis existem, sem valor nenhum dentro.
proibidos=(
  'emitir-licenca[.]py'
  'PLANO-TIME'
  '^node_modules/'
  '^[.]next/'
  '^[.]env$|^[.]env[.]local$|^[.]env[.].*[.]local$'
  '^MELHORIAS[.]md$'
  '^[.]git/'
)
for p in "${proibidos[@]}"; do
  n=$(printf '%s\n' "$LISTA" | grep -cE -- "$p")
  if [ "$n" -ne 0 ]; then
    echo "  VAZOU  $p  -> $n arquivo(s)"
    printf '%s\n' "$LISTA" | grep -E -- "$p" | head -5 | sed 's/^/         /'
    ruim=$((ruim+1))
  else
    printf '  ok     %s conta zero\n' "$p"
  fi
done

# --- 2. as chaves privadas, POR CONTEÚDO ------------------------------------
#
# Conferir só o nome do arquivo protege contra o descuido de ontem, não contra o
# de amanhã: uma chave colada dentro de um README passa por qualquer lista de
# nomes. O que não pode viajar é o MATERIAL — então se procura o material.
#
# E procura-se o MATERIAL, não a palavra. A primeira versão disto procurava
# "sk_live_" e acusava `CONFIGURAR-TUDO.md`, que escreve `sk_live_…` para
# ensinar; e "whsec_", que aparece em `stripehook.mjs` como
# `whsec_um_segredo_de_teste`. Onze alarmes falsos numa auditoria de doze linhas
# é uma auditoria que ninguém lê até o fim.
echo
padroes=(
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'PRIVADA_B64[^=]*=[^A-Za-z0-9]*[A-Za-z0-9+/]{40,}'
  'SUPABASE_SERVICE_ROLE[^=]*=[^A-Za-z0-9]*eyJ[A-Za-z0-9_-]{20,}'
  'sk_(live|test)_[A-Za-z0-9]{20,}'
  'whsec_[A-Za-z0-9]{20,}'
  'BREVO_API_KEY[^=]*=[^A-Za-z0-9]*xkeysib-[A-Za-z0-9]{10,}'
)
for p in "${padroes[@]}"; do
  n=$(grep -acE -- "$p" "$TMPC")
  if [ "$n" -ne 0 ]; then
    echo "  VAZOU  conteúdo casando /$p/  -> $n linha(s)"
    grep -aoE -- "$p" "$TMPC" | head -3 | cut -c1-60 | sed 's/^/         /'
    ruim=$((ruim+1))
  else
    printf '  ok     nada casa /%s/\n' "$p"
  fi
done

# --- 3. o que TEM que estar lá ---------------------------------------------
#
# A auditoria só sabia dizer o que sobrou. Faltou é igualmente caro e menos
# visível: um zip sem os testes entrega o produto sem a rede que prova que ele
# funciona, e foi por isso que os testes saíram de /tmp.
echo
obrigatorios=(
  'public/app.html'
  'offline/walkstamp-offline.html'
  'build.py'
  'src/template.html'
  'testes/rodar.sh'
  'testes/rapido.sh'
  'testes/preparar.sh'
  'testes/amostras.py'
  'testes/proxy.mjs'
  'testes/LEIA-ME.md'
  'DESEMPENHO.md'
)
for p in "${obrigatorios[@]}"; do
  if printf '%s\n' "$LISTA" | grep -qx -- "$p"; then
    printf '  ok     %s está no pacote\n' "$p"
  else
    echo "  FALTA  $p"
    ruim=$((ruim+1))
  fi
done
n=$(printf '%s\n' "$LISTA" | grep -c '^testes/.*\.mjs$')
if [ "$n" -lt 90 ]; then
  echo "  FALTA  só $n testes .mjs no pacote (esperado 90+)"
  ruim=$((ruim+1))
else
  printf '  ok     %s testes .mjs viajam junto\n' "$n"
fi

echo
if [ "$ruim" -eq 0 ]; then
  echo "Auditoria do pacote: limpa."
else
  echo "$ruim problema(s). O pacote NÃO deve ser entregue."
  exit 1
fi
