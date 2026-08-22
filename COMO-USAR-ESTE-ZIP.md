# O que tem neste arquivo

Este é o **projeto inteiro do Walkstamp**, não só o site gerado. Como os repositórios
do git foram removidos, este zip é a cópia completa: dá para descompactar, publicar e
recompilar sem depender de mais nada.

## Para publicar agora

O que a Vercel serve é a pasta `public/`, com o `vercel.json` ao lado dela (é ele que faz
os endereços ficarem sem `.html` e que manda os cabeçalhos de segurança).

Se você publica arrastando a pasta, arraste a **raiz** deste zip — não só a `public/`,
senão o `vercel.json` fica de fora e os endereços quebram.

## Para recompilar

```
python3 build.py
```

Não precisa instalar nada: o script só usa a biblioteca padrão do Python. Ele lê
`src/` e escreve `public/` e `offline/`. Toda a identidade — nome, domínio, CNPJ,
e-mail, chaves do Supabase — está nas primeiras linhas do `build.py`, e é o único
lugar onde essas coisas existem.

> **Não apague a pasta `public/` para "gerar do zero".** O `build.py` regenera as
> páginas HTML, mas os arquivos estáticos — `site.css`, os logotipos, os favicons e a
> pasta `demo/` com os vídeos — moram lá e não são gerados por ele. O script escreve
> por cima do que existe; é assim que ele deve ser rodado.

## As pastas

| pasta | o que é |
|---|---|
| `public/` | **o site publicado**: a ferramenta, as páginas nos três idiomas, o sitemap |
| `offline/` | o arquivo único que roda sem rede, para quem não pode usar CDN |
| `src/` | a fonte de tudo: `template.html` é a ferramenta inteira, `site/` são as páginas |
| `vendor/` | a biblioteca de PDF, servida do próprio domínio em vez de CDN |
| `brand/` | logotipos, favicons e o gerador deles; a página da proposta de marca |
| `media/` | mídia de origem; `antigo/` guarda as peças da época do ClipContext |

## Os documentos

Estratégia e decisões, cada um respondendo a uma pergunta:

| arquivo | responde |
|---|---|
| `CONCORRENTES.md` | quem são, quanto cobram, onde perdem |
| `O-QUE-FAZER.md` | o que fazer com isso, e o que **não** fazer |
| `EVIDENCIA-DE-TESTE.md` | o caso de uso de UAT e o que o produto precisou ganhar |
| `DOMINIO-E-EMAIL.md` | o passo a passo de domínio, DNS e caixa de e-mail |
| `MEDICAO.md` | o que é medido, onde, e como conferir |
| `ONDE-ESTAMOS.md` | a análise de situação e atratividade |
| `MELHORIAS.md` | a auditoria de experiência, com o que ainda falta |
| `ARQUITETURA-PAGO.md` | custo por vídeo e o desenho do plano pago |
| `DESEMPENHO.md` | onde o tempo é gasto e o que foi otimizado |
| `README.md` | a documentação técnica do projeto |

Vários deles estão no `.gitignore` de propósito: são de estratégia, e um repositório
público guardaria o histórico para sempre. Se um dia publicar algum, tire da lista com
intenção — não por descuido.

## Para conferir que ele funciona

```bash
bash testes/preparar.sh     # reaponta a regressão e gera os vídeos de amostra
npm install                 # o playwright, que os testes usam
python3 build.py
bash testes/rapido.sh app   # ~3m30 — o comportamento
bash testes/rapido.sh medir # ~12 min — as réguas, quando você mexe na mecânica
bash testes/rodar.sh        # a regressão inteira, ~50 min
```

`testes/LEIA-ME.md` explica as duas esteiras e diz **o que não roda a partir deste
zip**: os três testes de licença e um bloco do `semmarca` dependem de
`emitir-licenca.py` e de `PLANO-TIME.md`, que guardam as chaves privadas e não podem
viajar aqui. Eles pulam dizendo isso, em vez de morrer com um erro que parece defeito
do produto.

## Para montar o próximo zip

```bash
bash testes/empacotar.sh          # -> /tmp/walkstamp.zip, montado de dentro e AUDITADO
```

Ele monta de dentro da raiz (montar da pasta de cima já vazou as chaves uma vez),
confere por nome **e por conteúdo** — procura o material da chave, não a palavra —, e
cobra também o que tem que estar lá: sem os testes, o pacote entrega o produto sem a
rede que prova que ele funciona.
