#!/bin/bash
# Regressão do Walkstamp. Os `shot*` e `dbg*` são de inspeção visual e de
# diagnóstico — não entram, porque não afirmam nada.
#
# O site virou Next.js. Sete testes deixaram de ler `public/` e passaram a falar
# com um Next de verdade na 8802 — por isso ele sobe aqui, uma vez, antes de tudo.
# A raiz vem de onde ESTE arquivo está, e não escrita por extenso: a suíte
# inteira deixou de depender de uma máquina só.
cd "$(dirname "$(cd "$(dirname "$0")" && pwd)")" || exit 1
echo "montando a ferramenta e o site…"
python3 build.py > /tmp/build.log 2>&1 || { echo "build.py falhou:"; cat /tmp/build.log; exit 1; }
npx next build > /tmp/nextbuild.log 2>&1 || { echo "next build falhou:"; tail -20 /tmp/nextbuild.log; exit 1; }
fuser -k 8802/tcp 2>/dev/null; sleep 1
npx next start -p 8802 > /tmp/next.log 2>&1 &
NEXT=$!
for i in $(seq 1 30); do
  curl -sf -o /dev/null http://localhost:8802/precos && break
  sleep 1
done
trap 'kill $NEXT 2>/dev/null' EXIT

cd "$(cd "$(dirname "$0")" && pwd)"
TESTES="smoke.mjs saidas.mjs passos.mjs evidencia.mjs modelos.mjs cenarios.mjs
         juntos.mjs reabrir.mjs trocar.mjs scorm.mjs pptx.mjs miudos.mjs miudos2.mjs
         ignorar.mjs tarjaauto.mjs revisao.mjs multiidioma.mjs
         clipe.mjs canais.mjs capitulos.mjs comparar.mjs
         juntar.mjs webcam.mjs portal.mjs chamadoconta.mjs cabecalho.mjs seo.mjs stripehook.mjs ux.mjs ficha.mjs sessao.mjs
         onda1.mjs onda2.mjs onda4.mjs
         destaque.mjs tapado.mjs marcados.mjs traducao.mjs vocab.mjs jira.mjs
         idiomas.mjs paginas.mjs linkpage.mjs timepag.mjs licenca.mjs liclink.mjs
         licauto.mjs medicao.mjs legal.mjs a11y.mjs dobra.mjs pdfev.mjs
         semframes.mjs semsom.mjs repetido.mjs pausa.mjs curta.mjs retrato.mjs
         hostil.mjs preview.mjs rodada.mjs linhas.mjs verificador.mjs
         venda.mjs vitrine.mjs fluxo.mjs roteiro.mjs faxina.mjs formato.mjs comentario.mjs
         travado.mjs promptcx.mjs cabec.mjs ajuda.mjs cinco.mjs appidioma.mjs gravando.mjs janelinha.mjs marca.mjs figuras.mjs dobrafig.mjs
         compartilhar.mjs contradicao.mjs negocio.mjs celular.mjs barraapp.mjs paridade.mjs teto.mjs ritmo.mjs rolar.mjs isca.mjs blog.mjs cenario1.mjs organiza.mjs acabamento.mjs convite.mjs email.mjs tourvid.mjs semmarca.mjs lente2.mjs
         memoria.mjs pesagem.mjs espelho.mjs grade.mjs varredura.mjs audio.mjs plano.mjs faixa.mjs reuniao.mjs diagchamado.mjs modelo.mjs espera.mjs passomulti.mjs pessoas.mjs matriz.mjs espera2.mjs anotacao.mjs roteirojanela.mjs quedaplaca.mjs conclusao.mjs parar.mjs entrada.mjs indice.mjs figura.mjs resumo.mjs perna.mjs saidarec.mjs chaves.mjs planos.mjs"
falhou=""
for t in $TESTES; do
  [ -f "$t" ] || { echo "??  $t não existe"; continue; }
  printf '%-20s ' "$t"
  saida=$(timeout 400 node "$t" 2>&1)
  if [ $? -eq 0 ]; then echo "ok"
  else
    echo "FALHOU"
    echo "$saida" | grep -E 'FALHA|Error|error:' | head -6 | sed 's/^/      /'
    falhou="$falhou $t"
  fi
done
echo
[ -z "$falhou" ] && echo "Regressão inteira: verde." || echo "Falharam:$falhou"
