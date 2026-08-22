# O estúdio — como os dois vídeos do site são feitos

Os vídeos de `public/demo/` não são gravados à mão. São **gerados**, e os
geradores estão aqui. Um vídeo de produto feito à mão envelhece em silêncio: o
aplicativo muda, o vídeo continua mostrando a tela de seis meses atrás, e
ninguém percebe porque nada quebra.

Aqui, se o aplicativo mudar de forma incompatível, o roteiro quebra na hora de
gravar — que é o único jeito honesto de manter isto atualizado.

## Os dois vídeos, e o que cada um é

**`exemplo.<lang>.webm` / `.mp4` / `.vtt`** — o vídeo que o botão *"Usar vídeo de
exemplo"* carrega dentro da ferramenta. É **um sistema sendo percorrido**: abrir
a lista de pedidos de compra de uma intranet, criar um pedido, preencher,
**levar uma recusa do sistema**, corrigir e sair com um número de protocolo.

> Ele já foi a gravação de um relatório trimestral — slides passando. Aquilo
> mostrava a ferramenta funcionando e mostrava o **produto errado**: quem procura
> "evidência de teste" ou "instrução de trabalho" não grava slides, grava um
> sistema. Um exemplo que não parece o trabalho de quem chega faz a pessoa
> concluir que a ferramenta é para outra coisa.

A recusa no meio é deliberada: é o quadro que interessa numa evidência, é o que
a marcação manual existe para pegar e o que o comentário existe para explicar.

**`tour.<lang>.webm` / `.mp4` / `.jpg`** — o vídeo que roda em laço na home. É o
Playwright abrindo o `app.html` publicado e percorrendo o aplicativo de verdade:
escolher o cenário, carregar o exemplo, extrair os quadros, conferir, gerar.

## Refazer tudo, do zero

```bash
cd /root/cc/walkstamp

# 1. o sistema de mentira precisa estar servido em algum lugar
mkdir -p /tmp/sistema && cp estudio/sistema-de-mentira.html /tmp/sistema/app.html

# 2. gravar o exemplo nas cinco línguas (~30 s de vídeo cada)
for L in pt en es de fr; do node estudio/gravar-exemplo.mjs $L; done

# 3. codificar os exemplos
for L in pt en es de fr; do
  ffmpeg -y -v error -i /tmp/exemplo-bruto-$L.webm \
    -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -deadline good -cpu-used 3 \
    -pix_fmt yuv420p -an public/demo/exemplo.$L.webm
  ffmpeg -y -v error -i /tmp/exemplo-bruto-$L.webm \
    -c:v libx264 -profile:v baseline -level 3.1 -crf 26 -preset slow \
    -pix_fmt yuv420p -movflags +faststart -an public/demo/exemplo.$L.mp4
done

# 4. a legenda: ela NÃO é gerada. Se o percurso mudar, os cinco .vtt
#    de public/demo/ mudam à mão, e o teste tourvid.mjs cobra o assunto.

# 5. montar a ferramenta com o exemplo novo, e só então gravar o tour
python3 build.py
for L in pt en es de fr; do node estudio/gravar-tour.mjs $L; done
for L in pt en es de fr; do bash estudio/montar-tour.sh $L; done

# 6. e conferir
python3 build.py && node /tmp/tourvid.mjs   # com o site de pé na 8802
```

## A ordem importa

O tour mostra a ferramenta processando **o exemplo**. Gravar o tour antes de
codificar o exemplo novo produz um tour que mostra o vídeo antigo — e os dois
parecem certos isoladamente.

## O que o `montar-tour.sh` faz, e por quê

Ele acelera **só a varredura** — os 16 segundos de barra de progresso entre o
clique em "Transcrever e extrair frames" e os quadros aparecerem. Num vídeo de
45 segundos que roda em laço no alto da home, são 16 segundos em que a página
parece travada, e quem chega fecha a aba antes de ver o documento sair.

O resto fica em 1x. Acelerar os cliques seria mentir sobre a velocidade da
ferramenta; acelerar uma barra de progresso é o corte que qualquer demonstração
faz, e é honesto porque o que se pula é literalmente uma espera.

Os instantes do corte não são chutados: o `gravar-tour.mjs` anota
`scanIni`/`scanFim` num `.json` enquanto grava, e o `montar-tour.sh` lê de lá.

## Nada de marca real

O sistema é uma intranet inventada — "Intranet · Compras", fornecedor
"TecnoParts". Um vídeo de demonstração com o logo de outra empresa é um
problema jurídico à espera.
