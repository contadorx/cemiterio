#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Monta o tour final: acelera o trecho da varredura e gera mp4, webm e capa."""
import json, subprocess, sys, pathlib, os

L = sys.argv[1]
VEL = 3.2                      # a barra de progresso não precisa correr em tempo real
D = '/root/cc/clipcontext/public/demo'
bruto = f'/tmp/tour-bruto-{L}.webm'
m = json.load(open(f'/tmp/tour-marcas-{L}.json'))
ini, fim = m['scanIni'] + 1.2, m['scanFim']    # 1,2 s em tempo real antes de acelerar

def run(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-900:])

# três pedaços: antes, a varredura acelerada, e o resto
run('ffmpeg','-y','-i',bruto,'-t',f'{ini:.3f}','-an','-c:v','libvpx-vp9','-crf','30','-b:v','0','/tmp/p1.webm','-loglevel','error')
run('ffmpeg','-y','-ss',f'{ini:.3f}','-to',f'{fim:.3f}','-i',bruto,
    '-filter:v',f'setpts=PTS/{VEL}','-an','-c:v','libvpx-vp9','-crf','30','-b:v','0','/tmp/p2.webm','-loglevel','error')
run('ffmpeg','-y','-ss',f'{fim:.3f}','-i',bruto,'-an','-c:v','libvpx-vp9','-crf','30','-b:v','0','/tmp/p3.webm','-loglevel','error')

with open('/tmp/lista-tour.txt','w') as f:
    for p in ('/tmp/p1.webm','/tmp/p2.webm','/tmp/p3.webm'):
        f.write(f"file '{p}'\n")

# WebM final (VP9) e MP4 (H.264), 1000x700 como o antigo
run('ffmpeg','-y','-f','concat','-safe','0','-i','/tmp/lista-tour.txt',
    '-vf','fps=25,scale=1000:700','-c:v','libvpx-vp9','-crf','34','-b:v','0','-row-mt','1',
    '-an',f'{D}/tour.{L}.webm','-loglevel','error')
run('ffmpeg','-y','-f','concat','-safe','0','-i','/tmp/lista-tour.txt',
    '-vf','fps=25,scale=1000:700,format=yuv420p','-c:v','libx264','-preset','slow','-crf','28',
    '-an','-movflags','+faststart',f'{D}/tour.{L}.mp4','-loglevel','error')
# capa: o primeiro quadro em que o vídeo de exemplo já está carregado
run('ffmpeg','-y','-ss','4.2','-i',f'{D}/tour.{L}.mp4','-frames:v','1','-q:v','4',
    f'{D}/tour.{L}.jpg','-loglevel','error')

dur = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',
                      f'{D}/tour.{L}.mp4'], capture_output=True, text=True).stdout.strip()
kb = lambda p: os.path.getsize(p)//1024
print(f'{L}: {float(dur):.1f}s   mp4 {kb(f"{D}/tour.{L}.mp4")} KB   '
      f'webm {kb(f"{D}/tour.{L}.webm")} KB   jpg {kb(f"{D}/tour.{L}.jpg")} KB')
