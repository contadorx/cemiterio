#!/usr/bin/env python3
"""OS VIDEOS DE AMOSTRA QUE A REGRESSAO CONSOME.

Sete testes carregam um `.webm` de `/tmp` com `setInputFiles`. Esses arquivos
nasceram a mao numa maquina e nunca viajaram no zip: quem abria o pacote rodava
`rapido.sh app` e via seis testes caindo com `ENOENT /tmp/amostra.webm` — e o
diagnostico honesto ("falta a amostra") e indistinguivel, na saida da esteira, de
"o produto quebrou".

E o mesmo defeito que fez os testes sairem de `/tmp` para dentro do projeto: um
insumo que nao viaja junto com o codigo e um insumo que existe uma vez so.

Roda sozinho (`python3 testes/amostras.py`) e e chamado por `preparar.sh`.
Refaz apenas o que falta, a menos que venha `--forcar`.
"""
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

FONTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONTE_R = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FPS = 10


def fonte(tam, negrito=True):
    caminho = FONTE if negrito else FONTE_R
    try:
        return ImageFont.truetype(caminho, tam)
    except OSError:
        return ImageFont.load_default()


def tela(w, h, fundo, titulo, linhas, barra=None, destaque=None):
    """Uma tela de aplicativo de mentira: cabecalho, corpo, rodape.

    Ela existe para o detector de mudanca ter o que detectar — cor de fundo,
    bloco de texto e um retangulo de destaque mudam juntos entre uma cena e
    outra, que e o que acontece quando alguem troca de tela de verdade.
    """
    im = Image.new('RGB', (w, h), fundo)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, int(h * 0.11)], fill=(28, 32, 74))
    d.text((int(w * 0.03), int(h * 0.028)), titulo, font=fonte(max(12, h // 22)),
           fill=(255, 255, 255))
    y = int(h * 0.18)
    for t in linhas:
        d.text((int(w * 0.05), y), t, font=fonte(max(10, h // 30), False),
               fill=(30, 30, 40))
        y += int(h * 0.075)
    if destaque:
        x0, y0, x1, y1 = destaque
        d.rectangle([int(w * x0), int(h * y0), int(w * x1), int(h * y1)],
                    fill=(230, 96, 40))
    if barra is not None:
        # a barra de tarefas: os ultimos 5,6% da altura, que e exatamente a
        # faixa que `IGNORAR.baixo` zera na assinatura (linha 17 de 18)
        alt = max(4, round(h * 0.056))
        d.rectangle([0, h - alt, w, h], fill=(10, 10, 12))
        d.text((int(w * 0.72), h - alt + max(0, (alt - h // 26) // 2)), barra,
               font=fonte(max(9, h // 26)), fill=(255, 255, 255))
    return im


def escrever(caminho, quadros, com_audio, dur):
    """PNGs -> webm VP8. VP8 e nao VP9 porque o Chromium sem hardware decodifica
    os dois, e o VP8 sai em segundos em vez de minutos numa maquina de CI."""
    tmp = tempfile.mkdtemp(prefix='walkstamp-amostra-')
    try:
        for i, q in enumerate(quadros):
            q.save(os.path.join(tmp, '%05d.png' % i))
        cmd = ['ffmpeg', '-y', '-loglevel', 'error',
               '-framerate', str(FPS), '-i', os.path.join(tmp, '%05d.png')]
        if com_audio:
            cmd += ['-f', 'lavfi', '-t', str(dur),
                    '-i', 'sine=frequency=320:sample_rate=48000']
            cmd += ['-c:a', 'libopus', '-b:a', '32k', '-ac', '1']
        cmd += ['-c:v', 'libvpx', '-b:v', '900k', '-deadline', 'realtime',
                '-cpu-used', '8', '-pix_fmt', 'yuv420p', caminho]
        subprocess.run(cmd, check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


CENAS = [
    ((242, 244, 250), 'Portal de Compras — Pedidos',
     ['Pedido 4500012345', 'Fornecedor: ACME Industrial', 'Status: em aprovacao'],
     (0.05, 0.62, 0.55, 0.72)),
    ((214, 236, 222), 'Portal de Compras — Aprovacao',
     ['Aprovador: L. Oliveira', 'Centro de custo: 1200', 'Valor: 18.400,00'],
     (0.45, 0.42, 0.95, 0.55)),
    ((250, 232, 214), 'Portal de Compras — Recebimento',
     ['Nota fiscal 998877', 'Quantidade recebida: 40', 'Divergencia: nenhuma'],
     (0.05, 0.30, 0.90, 0.40)),
    ((222, 220, 248), 'Portal de Compras — Fatura',
     ['Fatura 7001', 'Vencimento: 2026-09-30', 'Bloqueio: nao'],
     (0.30, 0.70, 0.70, 0.82)),
    ((252, 248, 214), 'Portal de Compras — Relatorio',
     ['Periodo: agosto', 'Pedidos: 128', 'Media de aprovacao: 2,4 dias'],
     (0.05, 0.45, 0.45, 0.60)),
]


def cenas(w, h, quantas, segundos_por_cena, barra=False):
    quadros = []
    for i in range(quantas):
        fundo, titulo, linhas, destaque = CENAS[i % len(CENAS)]
        im = tela(w, h, fundo, titulo, linhas,
                  barra='12:0%d' % i if barra else None, destaque=destaque)
        quadros += [im] * int(segundos_por_cena * FPS)
    return quadros


def so_relogio(w, h, segundos):
    """Uma tela parada em que SO o relogio da barra de baixo muda.

    O teste `ignorar.mjs` pede as duas coisas do mesmo arquivo: contando a tela
    inteira tem que sair quadro repetido (>=3), e ignorando a faixa de baixo
    quase tudo tem que sumir. Por isso o corpo e pixel a pixel identico o tempo
    todo e a unica coisa viva mora nos ultimos 5,6% da altura.
    """
    base = tela(w, h, (245, 245, 248), 'Sistema — tela parada',
                ['Nada nesta area muda.', 'A barra de baixo muda a cada segundo.'],
                barra=None, destaque=None)
    quadros = []
    alt = max(4, round(h * 0.056))
    for s in range(segundos):
        im = base.copy()
        d = ImageDraw.Draw(im)
        d.rectangle([0, h - alt, w, h], fill=(8, 8, 10))
        # A FAIXA INTEIRA muda, e ela muda em BLOCO CHEIO.
        #
        # Duas versoes anteriores nao provavam nada, e o motivo e o mesmo nas
        # duas: a assinatura que decide o que e passo tem 32 por 18: cada celula
        # e a MEDIA de 20 por 20 pixels, e so conta como mudada quando algum
        # canal se move mais de 24 em 255.
        #
        #   - "12:00:07" num canto: onze caracteres em 19% da largura, dos quais
        #     dois mudavam. Meia celula.
        #   - um digito por celula, ponta a ponta: melhor, mas o traco do glifo
        #     ocupa ~10% da celula, entao a media dela andava menos de 10.
        #
        # Uma barra de tarefas de verdade muda em bloco: janela que abre, icone
        # que acende, notificacao que aparece. E o bloco cheio e o unico jeito de
        # a celula inteira se mover. O relogio continua desenhado por cima —
        # a parte [2] do teste confere que a faixa CHEGA no documento.
        celulas = 32
        for i in range(celulas):
            tom = (s * 61 + i * 97) % 256
            d.rectangle([int(w * i / celulas), h - alt,
                         int(w * (i + 1) / celulas) - 1, h],
                        fill=(tom, (tom * 3) % 256, (tom * 7) % 256))
        d.text((int(w * 0.06), h - alt - 1), '12:%02d:%02d' % (s // 60, s % 60),
               font=fonte(alt), fill=(255, 255, 255))
        quadros += [im] * FPS
    return quadros


def longo(w, h, minutos, segundos_por_cena):
    """UMA HORA DE VÍDEO, para medir a varredura do passo 2.

    Ninguém tinha medido esse caminho com material de verdade: ele não é o da
    gravação de tela, é `seek` + assinatura, e o `seek` é assíncrono. Uma hora de
    reunião gravada é o caso real, e um vídeo de dez segundos não diz nada sobre
    ele.

    Não é gerado por padrão: são 120 cenas e um arquivo de dezenas de megabytes.
    `python3 testes/amostras.py --longo` faz.
    """
    quadros = []
    cenas = int(minutos * 60 / segundos_por_cena)
    for i in range(cenas):
        fundo, titulo, linhas, destaque = CENAS[i % len(CENAS)]
        # o número da cena entra no texto: sem isso, cenas do mesmo índice
        # ficariam pixel a pixel idênticas e o detector veria menos trocas do
        # que existem — o teste mediria um vídeo mais fácil do que a realidade
        im = tela(w, h, fundo, '%s — cena %d' % (titulo, i + 1),
                  [l + '  #' + str(i + 1) for l in linhas],
                  barra='%02d:%02d' % (i // 60, i % 60), destaque=destaque)
        quadros.append(im)
    return quadros


def escrever_longo(caminho, quadros, segundos_por_cena, dur):
    tmp = tempfile.mkdtemp(prefix='walkstamp-longo-')
    try:
        for i, q in enumerate(quadros):
            q.save(os.path.join(tmp, '%05d.png' % i))
        # COM SOM, e ESTEREO a 48 kHz — que e o que sai de uma gravacao de tela
        # de verdade. Um video mudo mediria a decodificacao de audio pela
        # metade: sem canal para misturar e sem reamostragem para fazer.
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error',
             '-framerate', '1/%d' % segundos_por_cena,
             '-i', os.path.join(tmp, '%05d.png'),
             '-f', 'lavfi', '-t', str(dur),
             '-i', 'sine=frequency=300:sample_rate=48000',
             '-f', 'lavfi', '-t', str(dur),
             '-i', 'sine=frequency=440:sample_rate=48000',
             '-filter_complex', '[1:a][2:a]join=inputs=2:channel_layout=stereo[a]',
             '-map', '0:v', '-map', '[a]',
             '-c:a', 'libopus', '-b:a', '48k',
             '-c:v', 'libvpx', '-b:v', '350k', '-deadline', 'realtime',
             '-cpu-used', '8', '-r', '5', '-pix_fmt', 'yuv420p', caminho],
            check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    forcar = '--forcar' in sys.argv
    if '--longo' in sys.argv:
        alvo = '/tmp/longo.webm'
        if os.path.exists(alvo) and not forcar:
            print('  amostra longa: já estava em ' + alvo)
        else:
            escrever_longo(alvo, longo(640, 360, 60, 30), 30, 3600)
            print('  amostra: %s  %.1f MB' % (alvo, os.path.getsize(alvo) / 1048576))
        return
    alvos = {
        '/tmp/amostra.webm':
            (lambda: cenas(1280, 720, 5, 2.0), True, 10),
        '/tmp/cinco.webm':
            (lambda: cenas(1280, 720, 5, 2.4), True, 12),
        '/tmp/retrato.webm':
            (lambda: cenas(480, 854, 3, 2.0), True, 6),
        '/tmp/so-relogio.webm':
            (lambda: so_relogio(640, 360, 12), False, 12),
    }
    feitos = []
    for caminho, (montar, audio, dur) in alvos.items():
        if os.path.exists(caminho) and not forcar:
            continue
        escrever(caminho, montar(), audio, dur)
        feitos.append(caminho)

    # CINCO MINUTOS DE FALA, e nao dez segundos.
    #
    # `parar.mjs` cobra o botao que para a transcricao ENTRE um trecho e o
    # seguinte — e para isso e preciso haver um seguinte. A janela do Whisper e
    # de 30 segundos: a amostra de dez da UMA janela, e num video de uma janela
    # a unica coisa que da para provar sobre parar entre janelas e que o teste
    # nao provou nada.
    #
    # Sai barato porque e escrito como o video longo: um PNG por cena, com o
    # `-framerate 1/N` esticando cada um pelos seus trinta segundos. Dez
    # imagens, 300 segundos, dez janelas de transcricao.
    longa = '/tmp/fala-longa.webm'
    if not os.path.exists(longa) or forcar:
        escrever_longo(longa, longo(640, 360, 5, 30), 30, 300)
        feitos.append(longa)

    # o nome hostil e uma copia: o que o teste `hostil.mjs` exercita e o nome do
    # arquivo atravessando a ferramenta, nao o conteudo
    hostil = '/tmp/a&b <c> "d".webm'
    if not os.path.exists(hostil) or forcar:
        shutil.copyfile('/tmp/amostra.webm', hostil)
        feitos.append(hostil)

    if feitos:
        for f in feitos:
            print('  amostra: %s  %.0f KB' % (f, os.path.getsize(f) / 1024))
    else:
        print('  amostras: ja estavam todas em /tmp')


if __name__ == '__main__':
    main()
