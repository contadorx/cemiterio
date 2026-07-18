# O erro do campo · frequência das lavagens

## 1. O erro — encontrado pelo próprio registro
A tela de erro funcionou e gravou o problema. Em Config → Diagnóstico:

```
Cannot read properties of undefined (reading 'map')  ·  /campo
```

**Causa:** quando simplifiquei o briefing, tirei o campo `atencoes` — mas o
componente `Assistente` continuava lendo `b.atencoes.map(...)`. O TypeScript não
pega porque o dado vem de `fetch`, tipado como `any`. O build passava e a tela
quebrava no celular.

**Corrigido**, e mais: criei `npm run checar`, que varre o código procurando
`.map` / `.join` / `.length` sobre dados de fetch sem proteção. Achou **16 casos
iguais** espalhados pelo painel — todos blindados. É o tipo de erro que só
aparece quando o dado vem vazio, então podia estourar a qualquer momento.

Rode `npm run checar` junto com o build daqui em diante.

## 2. Quantas lavagens no período
O mecanismo existia mas com nome errado: a coluna se chamava `qtd_por_passagem`
("quantas numa ida"), enquanto o código sempre a usou como "quantas vezes no
ciclo". Por causa do nome, nunca foi para a tela — os 62 planos estavam todos
em 1.

Agora é `lavagens_por_ciclo`, com **atalhos para os combinados reais**:

| Atalho | Vira |
|---|---|
| Toda semana | mensal · 4 lavagens |
| A cada 15 dias | mensal · 2 lavagens |
| Uma vez por mês | mensal · 1 |
| A cada 2 meses | bimestral · 1 |
| A cada 3 meses | trimestral · 1 |
| 2 vezes por ano | semestral · 1 |
| 1 vez por ano | anual · 1 |
| Só quando pedirem | avulso |

Ao escolher, aparece a confirmação em português:

> **duas vezes por mês (a cada 15 dias)**
> A Nina volta a cada ~15 dias · 24 lavagens por ano · cobrança mensal

Se precisar de algo fora dos atalhos, dá para combinar período e quantidade à
mão (ex.: trimestral com 6 lavagens).

**Importante:** período e frequência são coisas separadas. O período diz **quando
cobrar**; a frequência diz **quantas vezes ir**. Mensal com 4 lavagens = cobra
uma vez por mês, mas a Nina vai toda semana.

O gerador de agenda já respeita: divide o período pelo número de lavagens e
distribui. Testado com 8 verificações.
