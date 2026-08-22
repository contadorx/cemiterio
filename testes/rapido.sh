#!/bin/bash
# A pista rápida. `rodar.sh` roda os 74 e leva ~20 min; isto roda só o que o
# que você mexeu pode ter quebrado, e leva 1 a 3.
#
#   rapido.sh app        -> a ferramenta, só o comportamento (~4 min)
#   rapido.sh medir      -> as réguas: memória, peso, espelho, espera (~12 min)
#   rapido.sh site       -> o site (build + next build + os testes de página)
#   rapido.sh a.mjs b.mjs -> exatamente esses
#
# Com 2 CPUs, dois de cada vez é o teto: mais que isso e os testes começam a
# estourar o tempo por disputa de máquina, não por defeito. É ELE que manda no
# relógio desta pista — não o número de arquivos.
#
# POR QUE `barraapp`, `paridade` E `roteiro` NAO ESTAO EM `app`.
# Eles falam com o Next em localhost, e `app` roda com SITE=0 — quer dizer, sem
# servidor nenhum de pe. Ali eles NUNCA puderam passar: a pista curta terminava
# em "2 FALHOU" em toda execucao, por motivo que nao era defeito do produto.
#
# Isso e pior do que parece, e o `chaves.mjs` ja tinha escrito por que: "um
# aviso que nao reprova e um aviso que se aprende a rolar para baixo". Uma
# esteira que sempre acaba em vermelho ensina quem a roda a ignorar vermelho —
# e ai o vermelho de verdade passa junto. Eles moram no grupo `site`, que sobe
# o Next antes de comecar.
#
# POR QUE `app` E `medir` SÃO SEPARADOS. Cinco arquivos respondiam por dois
# terços do tempo do `app`, e nenhum deles pergunta "isto ainda funciona?":
# `espera.mjs` roda uma hora de vídeo, `espelho.mjs` grava quatro vezes,
# `memoria.mjs` e `pesagem.mjs` são réguas. Eles medem, e medir é o que se faz
# ao MUDAR a mecânica — não a cada ajuste de tela. Continuam obrigatórios no
# `rodar.sh`, que é o portão da entrega.
# A raiz vem de onde ESTE arquivo está, e não escrita por extenso: a suíte
# inteira deixou de depender de uma máquina só.
cd "$(dirname "$(cd "$(dirname "$0")" && pwd)")" || exit 1
GRUPO="$1"; shift

case "$GRUPO" in
  app)  TESTES="smoke.mjs saidas.mjs passos.mjs dobra.mjs travado.mjs gravando.mjs
                janelinha.mjs comentario.mjs marcados.mjs revisao.mjs marca.mjs
                formato.mjs promptcx.mjs appidioma.mjs compartilhar.mjs celular.mjs teto.mjs rolar.mjs cenario1.mjs organiza.mjs acabamento.mjs lente2.mjs traducao.mjs passomulti.mjs pessoas.mjs matriz.mjs espera2.mjs conclusao.mjs parar.mjs entrada.mjs indice.mjs figura.mjs resumo.mjs perna.mjs cartao.mjs etapas.mjs" ; SITE=0 ;;
  medir) TESTES="memoria.mjs pesagem.mjs espelho.mjs modelo.mjs espera.mjs ritmo.mjs" ; SITE=0 ;;
  site) TESTES="cinco.mjs ajuda.mjs vitrine.mjs venda.mjs paginas.mjs idiomas.mjs figuras.mjs dobrafig.mjs
                linkpage.mjs legal.mjs contradicao.mjs negocio.mjs isca.mjs blog.mjs convite.mjs email.mjs tourvid.mjs semmarca.mjs
                barraapp.mjs paridade.mjs roteiro.mjs planos.mjs" ; SITE=1 ;;
  *)    TESTES="$GRUPO $*" ; SITE=1 ;;
esac

echo "montando…"
python3 build.py > /tmp/build.log 2>&1 || { echo "build.py falhou:"; tail -5 /tmp/build.log; exit 1; }
if [ "$SITE" = 1 ]; then
  npx next build > /tmp/nextbuild.log 2>&1 || { echo "next build falhou:"; tail -12 /tmp/nextbuild.log; exit 1; }
  fuser -k 8802/tcp 2>/dev/null; sleep 1
  npx next start -p 8802 > /tmp/next.log 2>&1 &
  NEXT=$!
  trap 'kill $NEXT 2>/dev/null' EXIT
  for i in $(seq 1 30); do curl -sf -o /dev/null http://localhost:8802/precos && break; sleep 1; done
fi

cd "$(cd "$(dirname "$0")" && pwd)"
printf '%s\n' $TESTES | xargs -P 2 -I{} sh -c '
  s=$(timeout 400 node "{}" 2>&1)
  if [ $? -eq 0 ]; then printf "%-18s ok\n" "{}"
  else printf "%-18s FALHOU\n" "{}"; echo "$s" | grep -E "FALHA|Error" | head -4 | sed "s/^/     /"; fi' 2>&1
