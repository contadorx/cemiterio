#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Paletas candidatas para o ClipContext, com validação de contraste WCAG."""

def hx(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))

def lum(c):
    def f(v):
        v /= 255
        return v/12.92 if v <= 0.03928 else ((v+0.055)/1.055)**2.4
    r, g, b = hx(c) if isinstance(c, str) else c
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)

def razao(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi+0.05)/(lo+0.05)

# ---------------------------------------------------------------------------
# ATUAL — para referência. Terracota #c2603a sobre papel quente #faf9f7:
# é exatamente a combinação que a Anthropic usa.
# ---------------------------------------------------------------------------
PALETAS = {
'atual': {
  'nome': 'Atual — terracota sobre papel quente',
  'claro': dict(bg='#faf9f7', panel='#ffffff', ink='#1f1e1c', muted='#6b6862',
                line='#e5e2dc', accent='#c2603a', accent_ink='#ffffff',
                warn='#8a6d1f', err='#b3402a'),
  'escuro': dict(bg='#1a1917', panel='#232220', ink='#f0eee9', muted='#a09c94',
                 line='#35332f', accent='#d97757', accent_ink='#1a1917',
                 warn='#d4b25f', err='#e8846b'),
},

# ---------------------------------------------------------------------------
# A — TINTA. Índigo profundo sobre cinza levemente azulado.
# Metáfora do documento: tinta sobre papel. Nenhuma IA grande ocupa esse tom
# (azul claro é Copilot, gradiente azul-roxo é Gemini; índigo escuro e chapado
# não é de ninguém). Neutros frios matam de vez o parentesco com o papel quente.
# ---------------------------------------------------------------------------
'tinta': {
  'nome': 'Tinta — índigo profundo, neutros frios',
  'claro': dict(bg='#f7f8fa', panel='#ffffff', ink='#15171c', muted='#5c6473',
                line='#e0e3ea', accent='#3a3f9e', accent_ink='#ffffff',
                warn='#8a6a12', err='#b32a3a'),
  'escuro': dict(bg='#121419', panel='#1a1d24', ink='#e9ebf1', muted='#949bab',
                 line='#282c36', accent='#737cf0', accent_ink='#121419',
                 warn='#d8bd63', err='#ef8484'),
},

# ---------------------------------------------------------------------------
# B — CARMIM. Vinho profundo sobre cinza puro.
# É a faixa mais vazia do mercado de IA — ninguém grande usa vermelho escuro.
# Lê como editorial e arquivo, que combina com um produto que gera documentos.
# O tom de erro precisa sair do vermelho para não competir: vira laranja-queimado.
# ---------------------------------------------------------------------------
'carmim': {
  'nome': 'Carmim — vinho profundo, cinza puro',
  'claro': dict(bg='#f9f8f8', panel='#ffffff', ink='#191717', muted='#63605f',
                line='#e6e3e3', accent='#9d1c40', accent_ink='#ffffff',
                warn='#8a6512', err='#a8500f'),
  'escuro': dict(bg='#161415', panel='#1e1c1d', ink='#efecec', muted='#9d9897',
                 line='#312e2f', accent='#d95c78', accent_ink='#161415',
                 warn='#d9b95f', err='#e79a5e'),
},

# ---------------------------------------------------------------------------
# C — ARDÓSIA. Grafite azulado com verde-musgo escuro de destaque.
# Ferramenta séria, sem cor de campanha. O verde é escuro e dessaturado o
# bastante para não lembrar o verde de assistente da OpenAI.
# ---------------------------------------------------------------------------
'ardosia': {
  'nome': 'Ardósia — grafite frio, verde-musgo',
  'claro': dict(bg='#f7f8f8', panel='#ffffff', ink='#14181a', muted='#5b6569',
                line='#e1e5e6', accent='#2f6b4f', accent_ink='#ffffff',
                warn='#87680f', err='#b03636'),
  'escuro': dict(bg='#111517', panel='#191e20', ink='#e8edee', muted='#909a9d',
                 line='#262c2f', accent='#4bb886', accent_ink='#111517',
                 warn='#d5b95f', err='#ec8080'),
},
# ---------------------------------------------------------------------------
# D — AMEIXA. Violeta-ameixa profundo sobre cinza levemente arroxeado.
# O roxo de IA é sempre claro e em gradiente (Gemini, Copilot Studio). Ameixa
# escuro e chapado lê como editorial, não como assistente.
# ---------------------------------------------------------------------------
'ameixa': {
  'nome': 'Ameixa — violeta profundo, cinza frio',
  'claro': dict(bg='#f9f8fa', panel='#ffffff', ink='#191620', muted='#635e6d',
                line='#e6e2ea', accent='#6b2d7b', accent_ink='#ffffff',
                warn='#84660f', err='#b03434'),
  'escuro': dict(bg='#151319', panel='#1d1a22', ink='#eeebf2', muted='#9c96a6',
                 line='#2f2b36', accent='#c07fd6', accent_ink='#151319',
                 warn='#d6b95f', err='#ec8080'),
},

# ---------------------------------------------------------------------------
# E — ÂMBAR. Grafite frio com âmbar dourado de destaque.
# Mantém uma cor quente de acento, mas sobre neutros francamente frios — é o
# contraste quente/frio que quebra o parentesco, já que a associação vinha do
# conjunto terracota + papel quente, não da temperatura sozinha.
# ---------------------------------------------------------------------------
'ambar': {
  'nome': 'Âmbar — grafite frio, âmbar dourado',
  'claro': dict(bg='#f7f8f9', panel='#ffffff', ink='#15181b', muted='#5b636a',
                line='#e2e5e8', accent='#96620a', accent_ink='#ffffff',
                warn='#7d6410', err='#b03636'),
  'escuro': dict(bg='#121517', panel='#1a1e21', ink='#e9edf0', muted='#929aa1',
                 line='#272c30', accent='#e0a83c', accent_ink='#121517',
                 warn='#d3bb63', err='#ec8080'),
},
}

# ---------------------------------------------------------------------------
PARES = [
    ('texto sobre fundo',        'ink',    'bg',        7.0),
    ('texto sobre painel',       'ink',    'panel',     7.0),
    ('secundário sobre fundo',   'muted',  'bg',        4.5),
    ('acento como link',         'accent', 'bg',        4.5),
    ('acento sobre painel',      'accent', 'panel',     4.5),
    ('texto do botão',           'accent_ink', 'accent', 4.5),
    ('aviso sobre fundo',        'warn',   'bg',        4.5),
    ('erro sobre fundo',         'err',    'bg',        4.5),
]

if __name__ == '__main__':
    import sys
    # A REGRESSÃO LÊ DAQUI.
    #
    # O `testes/preview.mjs` repinta o site e a ferramenta em cada paleta para
    # inspeção visual. Ele lia isto de um `/tmp/paletas.json` escrito à mão uma
    # vez, que não viajava no zip: quem abria o pacote via o teste morrer com
    # ENOENT, e quem mexesse numa cor aqui repintaria com as cores velhas sem
    # saber. Duas listas, uma delas de mentira. Agora é uma.
    if '--json' in sys.argv:
        import json
        print(json.dumps(PALETAS, ensure_ascii=False))
        sys.exit(0)
    ruim = 0
    for chave, p in PALETAS.items():
        print(f"\n=== {p['nome']} ===")
        for modo in ('claro', 'escuro'):
            c = p[modo]
            linha = []
            for rot, a, b, minimo in PARES:
                r = razao(c[a], c[b])
                marca = 'ok' if r >= minimo else 'X'
                if r < minimo and chave != 'atual':
                    ruim += 1
                linha.append(f'{rot}={r:.2f}{marca}')
            print(f'  {modo:7s} ' + '  '.join(linha))
    print()
    if ruim:
        print(f'{ruim} par(es) abaixo do mínimo nas paletas propostas')
        sys.exit(1)
    print('Todas as paletas propostas passam nos mínimos.')
