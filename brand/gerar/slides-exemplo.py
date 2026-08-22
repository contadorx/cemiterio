#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconstrói os slides do vídeo de exemplo na paleta Tinta.

O áudio original é preservado: só a imagem é redesenhada. Cinco telas de dez
segundos, 960x540, iguais em estrutura às antigas — o que muda é a cor.
"""
import json, pathlib, sys
sys.path.insert(0, '/tmp')
from paletas import PALETAS

C = PALETAS['tinta']['claro']

TEXTOS = {
 'pt': {
  'rodape': 'ClipContext · demonstração',
  's1': ('Relatório trimestral', 'Resultados e próximos passos'),
  's2': ('Receita por trimestre', ['T1','T2','T3','T4'], '1 / 4 · receita'),
  's3': ('Crescimento no trimestre', '+48%', 'acima da meta de 30% definida em janeiro', '2 / 4 · destaque'),
  's4': ('Onde perdemos tempo', [('Retrabalho de dados',62),('Aprovações',48),('Reuniões sem pauta',71)], '3 / 4 · atenção'),
  's5': ('Próximos passos', ['Automatizar a carga de dados','Reduzir o ciclo de aprovação','Rever a agenda semanal'], '4 / 4 · próximos passos'),
 },
 'en': {
  'rodape': 'ClipContext · demo',
  's1': ('Quarterly report', 'Results and next steps'),
  's2': ('Revenue per quarter', ['Q1','Q2','Q3','Q4'], '1 / 4 · revenue'),
  's3': ('Growth this quarter', '+48%', 'above the 30% target set in January', '2 / 4 · highlight'),
  's4': ('Where we lose time', [('Data rework',62),('Approvals',48),('Meetings with no agenda',71)], '3 / 4 · attention'),
  's5': ('Next steps', ['Automate the data load','Shorten the approval cycle','Revisit the weekly schedule'], '4 / 4 · next steps'),
 },
 'es': {
  'rodape': 'ClipContext · demostración',
  's1': ('Informe trimestral', 'Resultados y próximos pasos'),
  's2': ('Ingresos por trimestre', ['T1','T2','T3','T4'], '1 / 4 · ingresos'),
  's3': ('Crecimiento del trimestre', '+48%', 'por encima de la meta del 30% fijada en enero', '2 / 4 · destacado'),
  's4': ('Dónde perdemos tiempo', [('Rehacer datos',62),('Aprobaciones',48),('Reuniones sin agenda',71)], '3 / 4 · atención'),
  's5': ('Próximos pasos', ['Automatizar la carga de datos','Reducir el ciclo de aprobación','Revisar la agenda semanal'], '4 / 4 · próximos pasos'),
 },
}

BARRAS = [('120k', 120), ('190k', 190), ('240k', 240), ('355k', 355)]

CSS = f"""
  *{{box-sizing:border-box;margin:0}}
  body{{width:960px;height:540px;overflow:hidden;background:{C['bg']};color:{C['ink']};
       font:16px/1.5 Inter,"DejaVu Sans",ui-sans-serif,system-ui,sans-serif;
       -webkit-font-smoothing:antialiased}}
  .slide{{width:960px;height:540px;position:relative;padding:54px 62px;
         border-top:5px solid {C['accent']};background:{C['bg']}}}
  h1{{font-size:44px;letter-spacing:-1.1px;font-weight:700}}
  h2{{font-size:27px;letter-spacing:-.5px;font-weight:700;margin-bottom:34px}}
  .sub{{color:{C['muted']};font-size:17px;margin-top:10px}}
  .risco{{width:74px;height:5px;background:{C['accent']};border-radius:3px;margin-top:26px}}
  .pe{{position:absolute;left:62px;bottom:34px;color:{C['muted']};font-size:13px}}
  .centro{{display:flex;flex-direction:column;justify-content:center;height:100%;padding-bottom:40px}}

  /* colunas */
  .cols{{display:flex;align-items:flex-end;gap:44px;height:250px;padding-left:26px}}
  .col{{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}}
  .col b{{font-size:15px;font-weight:600;margin-bottom:9px;color:{C['ink']}}}
  .col i{{display:block;width:74px;border-radius:4px 4px 0 0;background:{C['accent']};opacity:.42}}
  .col.forte i{{opacity:1}}
  .col span{{font-size:14px;color:{C['muted']};margin-top:11px}}
  .eixo{{border-bottom:1px solid {C['line']};margin:0 0 0 26px;width:470px}}

  /* destaque */
  .grande{{font-size:78px;font-weight:800;color:{C['accent']};letter-spacing:-2.5px}}
  .prog{{width:640px;height:5px;background:{C['line']};border-radius:3px;margin-top:34px;overflow:hidden}}
  .prog i{{display:block;height:100%;width:62%;background:{C['accent']};border-radius:3px}}

  /* barras horizontais */
  .linha{{display:flex;align-items:center;gap:20px;margin-bottom:30px}}
  .linha .rot{{width:270px;font-size:17px}}
  .linha .trilho{{flex:1;max-width:390px;height:22px;background:{C['line']};border-radius:5px;overflow:hidden}}
  .linha .trilho i{{display:block;height:100%;background:{C['accent']};border-radius:5px}}
  .linha .pct{{color:{C['muted']};font-size:15px;width:48px;text-align:right}}

  /* lista numerada */
  .item{{display:flex;align-items:center;gap:19px;margin-bottom:16px;font-size:19px;
        background:#e6e7f2;border-left:5px solid {C['accent']};border-radius:0 9px 9px 0;
        padding:17px 22px}}
  .num{{flex:none;width:33px;height:33px;border-radius:50%;background:{C['accent']};
       color:{C['accent_ink']};display:grid;place-items:center;font-size:15px;font-weight:700}}
"""

def slides(L):
    t = TEXTOS[L]
    pe = f'<div class="pe">{{}}</div>'
    out = []

    s1 = t['s1']
    out.append(f'''<div class="slide"><div class="centro">
      <h1>{s1[0]}</h1><p class="sub">{s1[1]}</p><div class="risco"></div>
    </div>{pe.format(t['rodape'])}</div>''')

    tit, eixo, rod = t['s2']
    maxv = max(v for _, v in BARRAS)
    cols = ''.join(
      f'<div class="col{" forte" if i==len(BARRAS)-1 else ""}"><b>{rot}</b>'
      f'<i style="height:{round(v/maxv*205)}px"></i><span>{eixo[i]}</span></div>'
      for i, (rot, v) in enumerate(BARRAS))
    out.append(f'''<div class="slide"><h2>{tit}</h2>
      <div class="cols">{cols}</div><div class="eixo"></div>{pe.format(rod)}</div>''')

    tit, num, sub, rod = t['s3']
    out.append(f'''<div class="slide"><h2>{tit}</h2>
      <p class="grande">{num}</p><p class="sub" style="margin-top:16px">{sub}</p>
      <div class="prog"><i></i></div>{pe.format(rod)}</div>''')

    tit, itens, rod = t['s4']
    linhas = ''.join(
      f'<div class="linha"><span class="rot">{r}</span>'
      f'<span class="trilho"><i style="width:{v}%"></i></span>'
      f'<span class="pct">{v}%</span></div>' for r, v in itens)
    out.append(f'''<div class="slide"><h2>{tit}</h2>{linhas}{pe.format(rod)}</div>''')

    tit, itens, rod = t['s5']
    lis = ''.join(f'<div class="item"><span class="num">{i+1}</span><span>{x}</span></div>'
                  for i, x in enumerate(itens))
    out.append(f'''<div class="slide"><h2>{tit}</h2>{lis}{pe.format(rod)}</div>''')
    return out

if __name__ == '__main__':
    saida = pathlib.Path('/tmp/slides'); saida.mkdir(exist_ok=True)
    for L in TEXTOS:
        for i, s in enumerate(slides(L), 1):
            html = f'<!DOCTYPE html><html lang="{L}"><head><meta charset="utf-8">' \
                   f'<style>{CSS}</style></head><body>{s}</body></html>'
            (saida / f'{L}-{i}.html').write_text(html, encoding='utf-8')
    print('slides HTML gerados em /tmp/slides')
