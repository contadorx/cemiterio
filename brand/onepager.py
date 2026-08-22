#!/usr/bin/env python3
"""Uma página, para deixar com o time de teste — e para ele encaminhar."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

AZUL  = (0x3A/255, 0x3F/255, 0x9E/255)
TINTA = (0x1F/255, 0x24/255, 0x30/255)
CINZA = (0x5C/255, 0x64/255, 0x73/255)
LINHA = (0xE0/255, 0xE3/255, 0xEA/255)

W, H = A4
M = 18 * mm
CW = W - 2 * M

c = canvas.Canvas("/home/claude/walkstamp-uma-pagina.pdf", pagesize=A4)
c.setTitle("Walkstamp — evidência de teste sem sair do computador")
c.setAuthor("Walkstamp")
c.setSubject("Uma página para o time de teste")

y = H - M


def marca(x, yy, s):
    """O mesmo logotipo do produto, desenhado com primitivas."""
    k = s / 64.0
    c.setFillColorRGB(*AZUL)
    c.roundRect(x, yy, s, s, 15 * k, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.roundRect(x + 13 * k, yy + s - 33 * k, 38 * k, 21 * k, 3 * k, fill=1, stroke=0)
    c.roundRect(x + 13 * k, yy + s - 43.5 * k, 38 * k, 4.5 * k, 2 * k, fill=1, stroke=0)
    c.setFillColorRGB(0.706, 0.714, 0.855)
    c.roundRect(x + 13 * k, yy + s - 51.5 * k, 22 * k, 4.5 * k, 2 * k, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.circle(x + 48 * k, yy + s - 48 * k, 9.5 * k, fill=1, stroke=0)
    c.setFillColorRGB(*AZUL)
    c.circle(x + 48 * k, yy + s - 48 * k, 7.6 * k, fill=1, stroke=0)
    c.setStrokeColorRGB(1, 1, 1)
    c.setLineWidth(1.6 * k)
    c.setLineCap(1)
    c.line(x + 48 * k, yy + s - 48 * k, x + 48 * k, yy + s - 43 * k)
    c.line(x + 48 * k, yy + s - 48 * k, x + 52 * k, yy + s - 48 * k)


def texto(txt, tam=9.6, cor=CINZA, fonte="Helvetica", larg=None, lh=None, ind=0):
    global y
    larg = larg or (CW - ind)
    lh = lh or tam * 1.42
    c.setFont(fonte, tam)
    c.setFillColorRGB(*cor)
    for linha in simpleSplit(txt, fonte, tam, larg):
        c.drawString(M + ind, y, linha)
        y -= lh
    return y


def titulo(txt, tam=12.4, espaco=7):
    global y
    y -= espaco
    c.setFont("Helvetica-Bold", tam)
    c.setFillColorRGB(*TINTA)
    c.drawString(M, y, txt)
    y -= tam * 1.5


def regua(espaco=6):
    global y
    y -= espaco
    c.setStrokeColorRGB(*LINHA)
    c.setLineWidth(0.6)
    c.line(M, y, W - M, y)
    y -= espaco + 3


def marcador(txt, tam=9.6):
    global y
    c.setFillColorRGB(*AZUL)
    c.circle(M + 2.2, y + 3.1, 1.5, fill=1, stroke=0)
    texto(txt, tam=tam, ind=9)


# ---------------------------------------------------------------- cabeçalho
marca(M, y - 13 * mm, 13 * mm)
c.setFont("Helvetica-Bold", 21)
c.setFillColorRGB(*AZUL)
c.drawString(M + 17 * mm, y - 7.5 * mm, "Walk")
lw = c.stringWidth("Walk", "Helvetica-Bold", 21)
c.setFillColorRGB(*TINTA)
c.drawString(M + 17 * mm + lw, y - 7.5 * mm, "stamp")
c.setFont("Helvetica", 9.6)
c.setFillColorRGB(*CINZA)
c.drawString(M + 17 * mm, y - 12 * mm, "walkstamp.com  ·  ferramenta gratuita, sem cadastro")
y -= 20 * mm

c.setFont("Helvetica-Bold", 15.5)
c.setFillColorRGB(*TINTA)
c.drawString(M, y, "Evidência de teste que sai pronta da própria execução")
y -= 8.6 * mm

texto("Você grava a tela e narra o que está fazendo. Sai um PDF (ou Word) com cada tela que mudou, "
      "a hora de relógio de cada passo e o que foi dito naquele momento, embaixo da imagem "
      "correspondente. Nada é digitado duas vezes.", tam=10.4, lh=15)

regua()

# ---------------------------------------------------------------- o que resolve
titulo("O que ele resolve")
for t in [
    "O ciclo de dar print, colar no Word e escrever embaixo, repetido dezenas de vezes por caso de teste.",
    "A evidência que chega ao auditor sem hora, sem contexto e sem quem executou.",
    "A tela com dado de produção que não podia ter ido junto — dá para tarjar antes de gerar, e a "
    "tarja é queimada na imagem, não uma camada por cima.",
    "A dúvida de “esse anexo é mesmo o que saiu da máquina de quem testou?” — cada imagem "
    "sai com uma impressão digital SHA-256, e há uma página que confere o pacote inteiro.",
]:
    marcador(t)
    y -= 1.5

regua()

# ---------------------------------------------------------------- segurança
titulo("Para quando a segurança da informação perguntar")
texto("Não existe upload. O vídeo é lido pelo navegador, os frames são extraídos ali, o áudio é "
      "transcrito ali, e o documento é montado na memória da aba. Não há servidor de processamento "
      "e não há conta — então não há o que vazar do nosso lado, porque não há um nosso lado.",
      tam=9.8, lh=14.2)
y -= 3
texto("E não é preciso acreditar nisso: abra a ferramenta, pressione F12, vá até a aba Rede, carregue "
      "um vídeo grande e gere o PDF. A coluna do que foi enviado continua em zero.",
      tam=9.8, lh=14.2, fonte="Helvetica-Oblique")
y -= 3
texto("Existe também uma versão offline: um arquivo HTML único, com a ferramenta inteira dentro, "
      "para a TI escanear, versionar e distribuir internamente. O detalhamento — o que sai da máquina "
      "e quando, e quais certificações nós NÃO temos — está em walkstamp.com/seguranca.",
      tam=9.8, lh=14.2)

regua()

# ---------------------------------------------------------------- como testar
titulo("Como testar em cinco minutos")
for i, t in enumerate([
    "Abra walkstamp.com/app no Chrome ou no Edge.",
    "Clique em Gravar a tela, execute um caso de teste de verdade e narre em voz alta.",
    "Pare, escolha o modelo de saída “Evidência de teste” e preencha caso, sistema e executado por.",
    "Gere o PDF e leve para a pessoa que hoje recebe a sua evidência. A opinião dela é a que decide.",
], start=1):
    c.setFont("Helvetica-Bold", 9.6)
    c.setFillColorRGB(*AZUL)
    c.drawString(M, y, f"{i}.")
    texto(t, ind=11)
    y -= 1.5

regua()

# ---------------------------------------------------------------- preço
titulo("O que custa")
texto("A ferramenta é gratuita e vai continuar sendo — ela não nos custa nada, porque o processamento "
      "é do seu computador. O que é pago é o pacote de equipe: logo e identidade do cliente no "
      "documento, link com a configuração igual para todo o time, vocabulário do domínio compartilhado "
      "(ME21N, KI235 e afins param de sair errados) e o pacote offline para a TI distribuir. "
      "R$ 349 por pessoa por ano, a partir de 5 pessoas — e mesmo pagando, nada sai da máquina.",
      tam=9.8, lh=13.6)

regua()

# ---------------------------------------------------------------- contato
titulo("Quem responde", espaco=5)
texto("Feito e mantido por uma pessoa, que responde — inclusive a avaliação de fornecedor, pedido da "
      "versão offline e dúvida da segurança da informação.", tam=9.8, lh=14.2)
y -= 3
c.setFont("Helvetica-Bold", 10.2)
c.setFillColorRGB(*AZUL)
c.drawString(M, y, "privacidade@walkstamp.com")
c.setFont("Helvetica", 9.6)
c.setFillColorRGB(*CINZA)
c.drawString(M + c.stringWidth("privacidade@walkstamp.com", "Helvetica-Bold", 10.2) + 10, y,
             "·  walkstamp.com/seguranca  ·  walkstamp.com/verificar")

# ---------------------------------------------------------------- rodapé
y = M + 12
c.setStrokeColorRGB(*LINHA)
c.setLineWidth(0.6)
c.line(M, y + 9, W - M, y + 9)
marca(M, y - 2, 7 * mm)
c.setFont("Helvetica", 8.6)
c.setFillColorRGB(*CINZA)
c.drawString(M + 9.5 * mm, y + 2.6,
             "Este resumo foi escrito à mão. Os documentos que a ferramenta gera saem do seu navegador.")
c.setFont("Helvetica-Bold", 8.6)
c.setFillColorRGB(*AZUL)
c.drawRightString(W - M, y + 2.6, "walkstamp.com")

c.showPage()
c.save()
print("ok")
