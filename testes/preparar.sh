#!/bin/bash
# Prepara a regressão para rodar onde o projeto estiver.
#
# ---- O QUE ESTE ARQUIVO FAZIA, E POR QUE PAROU DE FAZER ----
#
# Ele reescrevia os testes na chegada, trocando um caminho absoluto pelo
# caminho de verdade. A ideia era boa e a execução tinha um furo silencioso:
# procurava `/root/cc/walkstamp`, um caminho ANTERIOR, enquanto os arquivos já
# carregavam `/root/walkstamp`. Resultado: "reapontados 0 arquivos", ninguém lê
# o zero, e a suíte inteira continuava presa a uma máquina só — a promessa do
# LEIA-ME, de preparar o projeto onde ele estiver, era falsa havia tempo.
#
# O conserto não foi ajustar o caminho procurado: foi tirar a procura do
# desenho. Os testes agora perguntam onde estão, em `testes/_caminhos.mjs`, que
# deduz a raiz de `import.meta.url` e DESCOBRE o Chromium no disco em vez de
# citar um número de versão. Um script que reescreve o código-fonte para que
# ele funcione é uma correção que precisa ser refeita a cada cópia; um código
# que se localiza sozinho não precisa de script nenhum.
#
# Sobrou para cá o que é de verdade preparação: conferir o que falta e gerar as
# amostras. Rodar duas vezes não faz mal.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"

echo "projeto em: $RAIZ"

falta=0
node -e 'import("playwright").then(()=>0,()=>process.exit(1))' 2>/dev/null \
  || { echo "  FALTA  playwright     ->  npm i -D playwright"; falta=1; }
command -v python3 >/dev/null || { echo "  FALTA  python3"; falta=1; }
command -v ffmpeg  >/dev/null || echo "  aviso  ffmpeg ausente — as amostras de vídeo não serão geradas"

# Onde está o navegador. A mesma pergunta que `_caminhos.mjs` responde para os
# testes — feita aqui para que a resposta apareça ANTES de trinta arquivos
# falharem com a mesma linha.
NAV="$(node -e "import('$AQUI/_caminhos.mjs').then(m=>console.log(m.CHROME_WS||'(o playwright decide)'))" 2>/dev/null || true)"
echo "navegador : ${NAV:-(não encontrado)}"
if [ -z "$NAV" ]; then
  echo "  Se a suíte reclamar do executável, instale com:  npx playwright install chromium"
  echo "  ou aponte o seu:  export CHROME=/caminho/do/chrome"
fi

# Os vídeos de amostra que sete testes carregam de /tmp. Sem eles a esteira
# acusa ENOENT — e ENOENT na saída da esteira é indistinguível de defeito do
# produto para quem acabou de abrir o zip.
python3 "$AQUI/amostras.py" || echo "  (amostras não geradas — falta ffmpeg ou Pillow?)"

echo
[ "$falta" = 1 ] && echo "resolva o que está marcado como FALTA antes de rodar." && exit 1
echo "agora:  bash $AQUI/rapido.sh app     # a esteira curta da ferramenta"
echo "        bash $AQUI/rodar.sh          # a regressão inteira (~40 min)"
