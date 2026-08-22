#!/bin/bash
# Monta o tour final a partir do bruto: acelera SÓ a varredura e codifica.
#
# A varredura leva 16 segundos e é uma barra andando. Num vídeo de 45 segundos
# que roda em laço na home, são 16 segundos em que a página parece travada —
# e quem chega fecha a aba antes de ver o documento sair. Acelerar o resto
# seria mentir sobre a velocidade da ferramenta; acelerar a espera é o mesmo
# corte que qualquer demonstração faz, e é honesto porque o que se pula é
# literalmente uma barra de progresso.
#
# O resto fica em 1x: os cliques, a escolha do cenário, a grade de quadros e o
# prompt acontecem na velocidade real.
set -e
L="$1"
BRUTO="/tmp/tour-bruto-$L.webm"
MARCAS="/tmp/tour-marcas-$L.json"
DEST="/root/cc/walkstamp/public/demo"
[ -f "$BRUTO" ] || { echo "falta $BRUTO"; exit 1; }

INI=$(python3 -c "import json;print(json.load(open('$MARCAS'))['scanIni'])")
FIM=$(python3 -c "import json;print(json.load(open('$MARCAS'))['scanFim'])")
VEL=4.0

rm -rf /tmp/mt && mkdir -p /tmp/mt
# antes da varredura, em 1x
ffmpeg -y -v error -i "$BRUTO" -t "$INI" -c:v libvpx-vp9 -crf 30 -b:v 0 -cpu-used 4 -an /tmp/mt/a.webm
# a varredura, acelerada
ffmpeg -y -v error -ss "$INI" -to "$FIM" -i "$BRUTO" \
  -vf "setpts=PTS/$VEL" -r 25 -c:v libvpx-vp9 -crf 30 -b:v 0 -cpu-used 4 -an /tmp/mt/b.webm
# depois da varredura, em 1x
ffmpeg -y -v error -ss "$FIM" -i "$BRUTO" -c:v libvpx-vp9 -crf 30 -b:v 0 -cpu-used 4 -an /tmp/mt/c.webm

printf "file '/tmp/mt/a.webm'\nfile '/tmp/mt/b.webm'\nfile '/tmp/mt/c.webm'\n" > /tmp/mt/lista.txt
ffmpeg -y -v error -f concat -safe 0 -i /tmp/mt/lista.txt -c copy /tmp/mt/junto.webm

# o webm final, com qualidade de entrega
ffmpeg -y -v error -i /tmp/mt/junto.webm \
  -c:v libvpx-vp9 -b:v 0 -crf 41 -row-mt 1 -deadline good -cpu-used 3 -pix_fmt yuv420p \
  -an "$DEST/tour.$L.webm"
# e o mp4, para quem não decodifica VP9
ffmpeg -y -v error -i /tmp/mt/junto.webm \
  -c:v libx264 -profile:v baseline -level 3.1 -crf 31 -preset slow -pix_fmt yuv420p \
  -movflags +faststart -an "$DEST/tour.$L.mp4"
# o cartaz: o primeiro quadro em que já há conteúdo, e não a tela pela metade
ffmpeg -y -v error -ss 2.2 -i /tmp/mt/junto.webm -frames:v 1 -q:v 3 "$DEST/tour.$L.jpg"

D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DEST/tour.$L.webm")
printf '%s  %ss  webm %s  mp4 %s  jpg %s\n' "$L" "${D%.*}" \
  "$(du -h "$DEST/tour.$L.webm" | cut -f1)" \
  "$(du -h "$DEST/tour.$L.mp4" | cut -f1)" \
  "$(du -h "$DEST/tour.$L.jpg" | cut -f1)"
