# -*- coding: utf-8 -*-
"""Gera a marca do Walkstamp: SVG, favicon .ico, apple-touch-icon e a marca do rodapé.

O desenho: a mesma tela do ClipContext (é o que a ferramenta faz — telas), com um
selo de relógio no canto. O relógio é o "stamp": a hora carimbada em cada passo,
que é justamente o que separa uma pilha de prints de uma evidência.

Sem cairosvg no ambiente, o raster é desenhado à mão com PIL — o desenho é
geométrico simples e sai idêntico.
"""
import pathlib
from PIL import Image, ImageDraw

ACENTO = (58, 63, 158)      # #3A3F9E
BRANCO = (255, 255, 255)
AQUI = pathlib.Path(__file__).resolve().parent.parent

MARCA_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Walkstamp">
  <rect width="64" height="64" rx="15" fill="{fundo}"/>
  <rect x="13" y="12" width="38" height="21" rx="3" fill="{frente}"/>
  <rect x="13" y="39" width="38" height="4.5" rx="2.25" fill="{frente}"/>
  <rect x="13" y="47" width="22" height="4.5" rx="2.25" fill="{frente}" opacity=".62"/>
  <circle cx="48" cy="48" r="9.5" fill="{fundo2}"/>
  <circle cx="48" cy="48" r="7.6" fill="{fundo}"/>
  <path d="M48 43.6V48l3 2" stroke="{frente}" stroke-width="1.9" stroke-linecap="round" fill="none"/>
</svg>
'''

def svg(fundo='#3A3F9E', frente='#fff', fundo2='#fff'):
    return MARCA_SVG.format(fundo=fundo, frente=frente, fundo2=fundo2)

def horizontal(cor_texto, sufixo):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 268 64" width="268" height="64" role="img" aria-label="Walkstamp">
  <rect width="64" height="64" rx="15" fill="#3A3F9E"/>
  <rect x="13" y="12" width="38" height="21" rx="3" fill="#fff"/>
  <rect x="13" y="39" width="38" height="4.5" rx="2.25" fill="#fff"/>
  <rect x="13" y="47" width="22" height="4.5" rx="2.25" fill="#fff" opacity=".62"/>
  <circle cx="48" cy="48" r="9.5" fill="#fff"/>
  <circle cx="48" cy="48" r="7.6" fill="#3A3F9E"/>
  <path d="M48 43.6V48l3 2" stroke="#fff" stroke-width="1.9" stroke-linecap="round" fill="none"/>
  <text x="80" y="42" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
        font-size="29" font-weight="600" letter-spacing="-.6" fill="{cor_texto}">Walk<tspan font-weight="700" fill="#3A3F9E">stamp</tspan></text>
</svg>
'''

def desenhar(lado, fundo=ACENTO, opaco=True):
    """Mesma geometria do SVG, em 4× para suavizar na redução."""
    E = 4
    im = Image.new('RGBA', (64*E, 64*E), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = lambda x: [v*E for v in x]
    d.rounded_rectangle(r([0, 0, 63, 63]), radius=15*E, fill=fundo if opaco else fundo + (255,))
    d.rounded_rectangle(r([13, 12, 50, 32]), radius=3*E, fill=BRANCO)
    d.rounded_rectangle(r([13, 39, 50, 43]), radius=2*E, fill=BRANCO)
    d.rounded_rectangle(r([13, 47, 34, 51]), radius=2*E, fill=BRANCO + (158,))
    d.ellipse(r([38.5, 38.5, 57.5, 57.5]), fill=BRANCO)
    d.ellipse(r([40.4, 40.4, 55.6, 55.6]), fill=fundo)
    d.line(r([48, 44.4, 48, 48]), fill=BRANCO, width=int(1.9*E))
    d.line(r([48, 48, 50.8, 49.9]), fill=BRANCO, width=int(1.9*E))
    return im.resize((lado, lado), Image.LANCZOS)

def main():
    (AQUI / 'logo-mark.svg').write_text(svg(), encoding='utf-8')
    (AQUI / 'logo-mark-mono.svg').write_text(svg(fundo='#15171C', frente='#fff', fundo2='#fff'), encoding='utf-8')
    (AQUI / 'logo-horizontal.svg').write_text(horizontal('#15171C', 'claro'), encoding='utf-8')
    (AQUI / 'logo-horizontal-dark.svg').write_text(horizontal('#E9EBF1', 'escuro'), encoding='utf-8')
    (AQUI / 'favicon.svg').write_text(svg(), encoding='utf-8')

    # .ico com os tamanhos que o navegador realmente usa
    desenhar(256).save(AQUI / 'favicon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])

    # o iOS não respeita alfa e compõe sobre preto: opaco e sangrando até a borda
    tt = Image.new('RGB', (180, 180), ACENTO)
    m = desenhar(180)
    tt.paste(m, (0, 0), m)
    tt.save(AQUI / 'apple-touch-icon.png')

    # marca do rodapé do .docx, em cinza para não competir com o texto
    desenhar(96).save(AQUI / 'marca-rodape.png')
    print('marca gerada:', ', '.join(sorted(p.name for p in AQUI.glob('logo*') )),
          '+ favicon.svg, favicon.ico, apple-touch-icon.png, marca-rodape.png')

if __name__ == '__main__':
    main()
