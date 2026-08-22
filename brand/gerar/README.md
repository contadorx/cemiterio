# Como os vídeos são gerados

Nada aqui é gravado à mão. Os três vídeos do projeto saem de script, o que
importa por um motivo prático: **numa troca de paleta eles precisam ser
refeitos**, e sem script isso vira um dia de trabalho manual.

## Vídeo de exemplo — `public/demo/exemplo.{pt,en,es}.{mp4,webm}`

Cinco telas de dez segundos, narradas, que a pessoa usa para experimentar a
ferramenta sem arquivo próprio.

```bash
python3 brand/gerar/slides-exemplo.py     # monta os 15 HTML em /tmp/slides
node    brand/gerar/render-slides.mjs     # renderiza os PNG a 2x
```

Depois, para cada idioma, o áudio original é reaproveitado — a narração não
muda quando a cor muda:

```bash
ffmpeg -y -i public/demo/exemplo.pt.mp4 -vn -acodec copy /tmp/slides/audio-pt.aac
ffmpeg -y -f concat -safe 0 -i /tmp/slides/lista-pt.txt -i /tmp/slides/audio-pt.aac \
  -vf "scale=960:540,fps=12,format=yuv420p" -c:v libx264 -preset slow -crf 26 \
  -c:a copy -shortest -movflags +faststart public/demo/exemplo.pt.mp4
```

**Cuidado com a detecção de cena.** Este vídeo é a vitrine do recurso: se duas
telas seguidas ficarem parecidas demais, a varredura perde a transição e o
exemplo passa a subestimar a própria ferramenta. Na primeira versão em índigo
isso aconteceu — as telas 4 e 5 tinham a mesma estrutura (título e três linhas à
esquerda) e a diferença ficou em 4,01, abaixo do limiar de 5,5 da sensibilidade
padrão. A tela 5 ganhou cartões com fundo tingido para mudar a mancha na página.
**Meça antes de publicar**: a assinatura é 32x18 em RGB e o diff é a média das
diferenças absolutas, exatamente como em `src/template.html`.

## Tour da landing — `public/demo/tour.{pt,en,es}.{mp4,webm,jpg}`

Um roteiro que percorre o app de verdade, com cursor sintético (o Playwright não
grava o ponteiro do sistema).

```bash
node   brand/gerar/tour.mjs pt          # grava o bruto e anota os tempos
python3 brand/gerar/montar-tour.py pt   # acelera a varredura e gera mp4/webm/capa
```

O trecho da varredura é acelerado 3,2x na montagem: a barra de progresso
comunica o que precisa em quatro segundos, e em tempo real são onze. O corte usa
os tempos que o próprio roteiro anotou, não um palpite.

## GIF de divulgação — `media/clipcontext-demo.{gif,mp4}`

Sai do tour em inglês:

```bash
cp public/demo/tour.en.mp4 media/clipcontext-demo.mp4
ffmpeg -y -i media/clipcontext-demo.mp4 -vf "fps=8,scale=600:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=128" /tmp/pal.png
ffmpeg -y -i media/clipcontext-demo.mp4 -i /tmp/pal.png \
  -lavfi "fps=8,scale=600:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 media/clipcontext-demo.gif
```

Paleta adaptativa e 8 quadros por segundo seguram o arquivo perto de 2,4 MB.
Sem `palettegen`, o mesmo GIF passa de 4 MB.
