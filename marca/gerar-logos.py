#!/usr/bin/env python3
"""O pacote de marca — os arquivos que vão para as redes sociais.

POR QUE ISTO É UM SCRIPT, e não uma pasta de arquivos soltos.

Um pacote de logo entregue à mão apodrece na primeira mudança: alguém acerta a
cor no SVG do LinkedIn e não no do YouTube, e seis meses depois a marca tem dois
azuis. Aqui o desenho mora num lugar só — as constantes do topo — e as vinte e
poucas peças saem dele. Mudar o azul é mudar uma linha e rodar de novo.

POR QUE O NOME VIRA CONTORNO (path), e não texto.

O site escreve "Walkstamp" com a pilha do sistema (`ui-sans-serif, system-ui,
-apple-system, Segoe UI, Roboto`) — o que faz o nome sair em Segoe no Windows,
SF no Mac e Roboto no Android. Isso é ótimo para uma página e péssimo para uma
marca: um logo que muda de forma conforme a máquina não é um logo.

Então o pacote fixa o nome em **Inter** (licença SIL OFL, pode distribuir) e o
converte para contorno. O arquivo resultante não depende de fonte nenhuma —
abre igual no Canva, no Figma, no PowerPoint e na tela de upload do LinkedIn,
que é onde o texto costuma sumir.

Rodar:  python3 marca/gerar-logos.py
Saída:  marca/pacote/  (e o .zip ao lado)
"""
import json
import pathlib
import shutil
import subprocess
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

RAIZ = pathlib.Path(__file__).resolve().parent
SAIDA = RAIZ / "pacote"

# ------------------------------------------------------------------ a marca
AZUL = "#3A3F9E"
TINTA = "#15171C"
BRANCO = "#FFFFFF"
PAPEL = "#F7F8FA"

NOME_A, NOME_B = "Walk", "stamp"
SITE = "walkstamp.com"
FRASE = {
    "pt": "Você percorre a tela. Ele carimba cada passo.",
    "en": "You walk the screen. It stamps every step.",
}

INTER_SEMI = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
INTER_BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
INTER_REG = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"


# ------------------------------------------------------- nome viram contornos
def texto_em_path(txt: str, arquivo_fonte: str, tamanho: float,
                  espaco: float = 0.0) -> tuple[str, float]:
    """Devolve (path `d`, largura). O `y` cresce para baixo, como em SVG."""
    fonte = TTFont(arquivo_fonte)
    upm = fonte["head"].unitsPerEm
    k = tamanho / upm
    glifos = fonte.getGlyphSet()
    cmap = fonte.getBestCmap()
    hmtx = fonte["hmtx"]

    partes, x = [], 0.0
    for ch in txt:
        nome = cmap.get(ord(ch))
        if nome is None:
            x += tamanho * 0.5
            continue
        caneta = SVGPathPen(glifos)
        glifos[nome].draw(caneta)
        d = caneta.getCommands()
        if d:
            # escala e vira o eixo y; translada para a posição da letra
            partes.append(f'<path transform="translate({x:.3f} 0) scale({k:.6f} {-k:.6f})" d="{d}"/>')
        x += hmtx[nome][0] * k + espaco
    if partes:
        x -= espaco
    return "".join(partes), x


def nome_svg(tamanho: float, cor_a: str, cor_b: str, espaco: float = -0.6) -> tuple[str, float]:
    """"Walk" + "stamp", um em cada peso e cor, já em contorno."""
    pa, wa = texto_em_path(NOME_A, INTER_SEMI, tamanho, espaco)
    pb, wb = texto_em_path(NOME_B, INTER_BOLD, tamanho, espaco)
    corpo = (f'<g fill="{cor_a}">{pa}</g>'
             f'<g fill="{cor_b}" transform="translate({wa + espaco:.3f} 0)">{pb}</g>')
    return corpo, wa + espaco + wb


# -------------------------------------------------------------- o símbolo
def simbolo(fundo: str, marca: str, fraco: str | None = None) -> str:
    """O quadrado de 64×64: o documento, as duas linhas e o selo do relógio.

    `fraco` é a segunda linha de texto, mais apagada. Numa versão de uma cor só
    ela não pode virar opacidade — sobre fundo colorido a transparência mostra o
    fundo e a linha "some". Por isso a cor entra por argumento."""
    f2 = fraco or marca
    op = "" if fraco else ' opacity=".62"'
    return (
        f'<rect width="64" height="64" rx="15" fill="{fundo}"/>'
        f'<rect x="13" y="12" width="38" height="21" rx="3" fill="{marca}"/>'
        f'<rect x="13" y="39" width="38" height="4.5" rx="2.25" fill="{marca}"/>'
        f'<rect x="13" y="47" width="22" height="4.5" rx="2.25" fill="{f2}"{op}/>'
        f'<circle cx="48" cy="48" r="9.5" fill="{marca}"/>'
        f'<circle cx="48" cy="48" r="7.6" fill="{fundo}"/>'
        f'<path d="M48 43.6V48l3 2" stroke="{marca}" stroke-width="1.9" stroke-linecap="round" fill="none"/>'
    )


def svg(vb: str, w: float, h: float, corpo: str, fundo: str | None = None) -> str:
    at = f'<rect width="100%" height="100%" fill="{fundo}"/>' if fundo else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" '
            f'width="{w:g}" height="{h:g}" role="img" aria-label="Walkstamp">'
            f'{at}{corpo}</svg>\n')


# ------------------------------------------------------------ as peças
def horizontal(cor_a: str, cor_b: str, ico_fundo: str, ico_marca: str,
               ico_fraco: str | None = None) -> str:
    corpo_nome, larg = nome_svg(29, cor_a, cor_b)
    total = 80 + larg
    return svg(f"0 0 {total:.1f} 64", round(total, 1), 64,
               simbolo(ico_fundo, ico_marca, ico_fraco)
               + f'<g transform="translate(80 42)">{corpo_nome}</g>')


def vertical(cor_a: str, cor_b: str, ico_fundo: str, ico_marca: str,
             ico_fraco: str | None = None) -> str:
    corpo_nome, larg = nome_svg(26, cor_a, cor_b)
    larguraT = max(larg, 64)
    cx = larguraT / 2
    return svg(f"0 0 {larguraT:.1f} 108", round(larguraT, 1), 108,
               f'<g transform="translate({cx - 32:.2f} 0)">{simbolo(ico_fundo, ico_marca, ico_fraco)}</g>'
               + f'<g transform="translate({cx - larg / 2:.2f} 100)">{corpo_nome}</g>')


def avatar(fundo: str, marca: str, fraco: str | None = None) -> str:
    """A foto de perfil.

    Toda rede recorta a foto de perfil em CÍRCULO. O símbolo cheio, que encosta
    nas quinas do quadrado, perde o canto do documento e um pedaço do selo
    nesse recorte — some justamente a parte que dá nome à marca. Aqui o desenho
    encolhe e recentra para caber dentro do círculo com folga.

    A conta: o desenho ocupa x[13,57.5] e y[12,57.5], centro (35.25, 34.75), com
    meia-diagonal 31,8. A 0,86 ela vira 27,4 — dentro do raio de 32 com folga de
    quatro e meio, que é o bastante para o antisserrilhado do recorte redondo
    não comer a ponta do selo. Abaixo disso o desenho encolhe à toa: numa lista
    do LinkedIn a foto de perfil aparece com 48 px de lado, e ali cada por cento
    de área conta."""
    s = 0.86
    dx = 32 - 35.25 * s
    dy = 32 - 34.75 * s
    interno = simbolo(fundo, marca, fraco)
    # o quadrado de fundo do símbolo não entra: quem faz o fundo aqui é a rede
    interno = interno.split("/>", 1)[1]
    return svg("0 0 64 64", 64, 64,
               f'<rect width="64" height="64" fill="{fundo}"/>'
               f'<g transform="translate({dx:.3f} {dy:.3f}) scale({s})">{interno}</g>')


PECAS = {
    "walkstamp-simbolo":            lambda: svg("0 0 64 64", 64, 64, simbolo(AZUL, BRANCO)),
    "walkstamp-simbolo-branco":     lambda: svg("0 0 64 64", 64, 64, simbolo("none", BRANCO, BRANCO)),
    "walkstamp-horizontal":         lambda: horizontal(TINTA, AZUL, AZUL, BRANCO),
    "walkstamp-horizontal-branco":  lambda: horizontal(BRANCO, BRANCO, "none", BRANCO, BRANCO),
    "walkstamp-horizontal-preto":   lambda: horizontal(TINTA, TINTA, "none", TINTA, TINTA),
    "walkstamp-vertical":           lambda: vertical(TINTA, AZUL, AZUL, BRANCO),
    "walkstamp-vertical-branco":    lambda: vertical(BRANCO, BRANCO, "none", BRANCO, BRANCO),
    "walkstamp-avatar":             lambda: avatar(AZUL, BRANCO),
}


# ------------------------------------------------------- as capas das redes
def capa(w: int, h: int, lang: str, seguro: tuple[int, int, int, int] | None = None,
         alinhar: str = "centro") -> str:
    """Fundo da marca, logo em branco e a frase.

    Três coisas que este desenho resolve, e que a primeira versão errava:

    1. `seguro` é a área que a rede garante NÃO cortar. O conteúdo nasce dentro
       dela, e não centrado no arquivo. O banner do YouTube é o caso extremo:
       2560×1440 na TV, mas no celular ele mostra só 1546×423 do miolo — o que
       estiver fora disso alguém vê e alguém não.

    2. O tamanho do logo sai de uma FRAÇÃO da área segura, não de uma escala
       calculada por tentativa. Sem isso o banner do YouTube saía com a marca do
       tamanho de uma unha no meio de um campo azul vazio.

    3. O símbolo entra INVERTIDO — quadrado branco, desenho azul. Sobre o azul
       da marca, a versão de contorno branco perde a moldura do documento e o
       anel do relógio se funde com o traço: de longe vira uma mancha. Invertido
       ele mantém a forma que a marca tem em todo lugar."""
    x0, y0, x1, y1 = seguro or (0, 0, w, h)
    cw, ch = x1 - x0, y1 - y0
    faixa = ch < 240          # LinkedIn 1128×191 e parentes: só cabe uma linha

    logo_h = min(ch * (0.46 if faixa else 0.30), cw * 0.13)
    corpo_nome, larg_nome = nome_svg(29, BRANCO, BRANCO)
    k = logo_h / 64
    larg_logo = (80 + larg_nome) * k
    marca = (f'{simbolo(BRANCO, AZUL, AZUL)}'
             f'<g transform="translate(80 42)">{corpo_nome}</g>')

    frase = FRASE.get(lang, FRASE["pt"])
    t_frase = logo_h * (0.30 if faixa else 0.34)
    p_frase, w_frase = texto_em_path(frase, INTER_REG, t_frase, 0)
    t_site = logo_h * 0.26
    p_site, w_site = texto_em_path(SITE, INTER_SEMI, t_site, 0)

    if alinhar == "direita":
        # O LinkedIn desenha o logo da PÁGINA por cima do canto de baixo à
        # esquerda da capa. Centrar aqui é aceitar que um dia ele encoste.
        cx = x0 + cw * 0.60
    else:
        cx = x0 + cw / 2

    # A marca d'água: o símbolo gigante sangrando pela direita, a 7% de branco.
    # Ela existe para o campo não ser um retângulo chapado — e a 7% não compete
    # com nada, que é o ponto. Na faixa baixa ela não entra: não há altura para
    # ela ser outra coisa que não sujeira.
    agua = ""
    if not faixa:
        # Ela se apoia no ARQUIVO inteiro, não na área segura: a área segura é
        # onde o texto tem que caber, e o fundo é o que sobra dela. No banner do
        # YouTube — 2560×1440 de arquivo para 1546×423 de miolo — amarrar a
        # marca d'água ao miolo deixava dois terços da imagem em azul chapado.
        lado = h * 1.25
        agua = (f'<g opacity=".07" transform="translate({w - lado * 0.42:.1f} '
                f'{h / 2 - lado / 2:.1f}) scale({lado / 64:.4f})">'
                f'{simbolo("none", BRANCO, BRANCO)}</g>')

    if faixa:
        y = y0 + ch / 2
        conteudo = (
            f'<g transform="translate({cx - larg_logo / 2:.1f} {y - logo_h * 0.98:.1f}) scale({k:.4f})">{marca}</g>'
            f'<g fill="{BRANCO}" opacity=".82" transform="translate({cx - w_frase / 2:.1f} {y + logo_h * 0.72:.1f})">{p_frase}</g>'
        )
    else:
        alturaT = logo_h + logo_h * 0.95 + logo_h * 0.75
        topo = y0 + (ch - alturaT) / 2
        conteudo = (
            f'<g transform="translate({cx - larg_logo / 2:.1f} {topo:.1f}) scale({k:.4f})">{marca}</g>'
            f'<g fill="{BRANCO}" opacity=".88" transform="translate({cx - w_frase / 2:.1f} {topo + logo_h * 1.72:.1f})">{p_frase}</g>'
            f'<g fill="{BRANCO}" opacity=".58" transform="translate({cx - w_site / 2:.1f} {topo + logo_h * 2.42:.1f})">{p_site}</g>'
        )
    return svg(f"0 0 {w} {h}", w, h, agua + conteudo, fundo=AZUL)


# ----------------------------------------------- as medidas de cada rede
# Conferidas em agosto de 2026. Onde a rede publica um mínimo, o pacote entrega
# mais: o arquivo grande encolhe bem, o pequeno esticado não tem conserto.
REDES = {
    "linkedin": [
        ("linkedin-logo-empresa-400.png",        "avatar", 400, 400),
        ("linkedin-capa-empresa-1128x191.png",   "capa",  1128, 191),
        ("linkedin-foto-perfil-400.png",         "avatar", 400, 400),
        ("linkedin-capa-perfil-1584x396.png",    "capa",  1584, 396),
    ],
    "x": [
        ("x-perfil-400.png",                     "avatar", 400, 400),
        ("x-header-1500x500.png",                "capa",  1500, 500),
    ],
    "instagram": [
        ("instagram-perfil-1080.png",            "avatar", 1080, 1080),
    ],
    "facebook": [
        ("facebook-perfil-1000.png",             "avatar", 1000, 1000),
        ("facebook-capa-1640x624.png",           "capa",  1640, 624),
    ],
    "youtube": [
        ("youtube-perfil-800.png",               "avatar", 800, 800),
        ("youtube-banner-2560x1440.png",         "capa",  2560, 1440),
    ],
    "bluesky": [
        ("bluesky-perfil-1000.png",              "avatar", 1000, 1000),
        ("bluesky-banner-3000x1000.png",         "capa",  3000, 1000),
    ],
    "tiktok": [
        ("tiktok-perfil-1000.png",               "avatar", 1000, 1000),
    ],
}

# O YouTube mostra o banner inteiro só na TV. No celular ele corta para o miolo
# — 1546×423 no centro. O que estiver fora disso alguém vai ver, e alguém não.
SEGURO = {"youtube-banner-2560x1440.png": (507, 508, 2053, 931)}

# O LinkedIn desenha o logo da PÁGINA por cima do canto de baixo à esquerda da
# capa da empresa. Só esta peça foge do centro.
ALINHAR = {"linkedin-capa-empresa-1128x191.png": "direita"}


# ------------------------------------------------------------- rasterizar
def png(svg_txt: str, destino: pathlib.Path, w: int, h: int, transparente: bool) -> None:
    """Chromium desenha, e é ele quem tem que estar certo: é o mesmo motor que
    vai desenhar o logo no navegador de quem abrir a página."""
    html = (f'<!doctype html><meta charset="utf-8">'
            f'<style>html,body{{margin:0;padding:0;'
            f'background:{"transparent" if transparente else PAPEL}}}'
            f'svg{{display:block;width:{w}px;height:{h}px}}</style>{svg_txt}')
    tmp = destino.with_suffix(".html")
    tmp.write_text(html, encoding="utf-8")
    subprocess.run([sys.executable, str(RAIZ / "_tirar.py"), str(tmp), str(destino),
                    str(w), str(h), "1" if transparente else "0"], check=True)
    tmp.unlink()


def main() -> None:
    if SAIDA.exists():
        shutil.rmtree(SAIDA)
    (SAIDA / "svg").mkdir(parents=True)
    (SAIDA / "png").mkdir(parents=True)

    peca_svg = {}
    for nome, fn in PECAS.items():
        s = fn()
        peca_svg[nome] = s
        (SAIDA / "svg" / f"{nome}.svg").write_text(s, encoding="utf-8")

    # PNG transparente das peças, em três tamanhos — para quem não abre SVG
    for nome, s in peca_svg.items():
        import re as _re
        m = _re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', s)
        vw, vh = float(m.group(1)), float(m.group(2))
        for alt in (256, 512, 1024):
            larg = round(vw * alt / vh)
            png(s, SAIDA / "png" / f"{nome}-{alt}.png", larg, alt, transparente=True)

    for rede, itens in REDES.items():
        pasta = SAIDA / "redes" / rede
        pasta.mkdir(parents=True, exist_ok=True)
        for arquivo, tipo, w, h in itens:
            if tipo == "avatar":
                png(peca_svg["walkstamp-avatar"], pasta / arquivo, w, h, transparente=False)
            else:
                for lang in ("pt", "en"):
                    alvo = pasta / (arquivo if lang == "pt" else arquivo.replace(".png", "-en.png"))
                    png(capa(w, h, lang, SEGURO.get(arquivo),
                             ALINHAR.get(arquivo, "centro")), alvo, w, h, transparente=False)

    (SAIDA / "medidas.json").write_text(
        json.dumps({r: [{"arquivo": a, "largura": w, "altura": h} for a, _, w, h in i]
                    for r, i in REDES.items()}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    print("pacote em", SAIDA)


if __name__ == "__main__":
    main()
