# Já aplicado em produção (06/11/2026)

Os três rodaram e foram conferidos — a tabela de prova está no
`LEIA-ME_de_quem_e_este_pix.md`. Os arquivos ficam aqui porque são a mesma
coisa que as migrations, prontos para colar caso algum banco novo precise
deles.

## O que cada um fez

Ordem em que foram rodados:

| # | arquivo | o que faz |
|---|---|---|
| 1 | `0163_funcoes_apelidos_banco.sql` | as duas funções que guardam e esquecem de quem é um nome do extrato |
| 2 | `0164_identificar_entrada_meses.sql` | identificar a entrada dizendo **a que meses** ela se refere, com ensaio |
| 3 | `0165_nome_de_quem_pagou.sql` | a coluna `comprovantes.nome_pagador` |

Nenhum dos três tocou em dado nenhum: criaram funções, uma coluna e um índice.

## Como saber que deu certo

```sql
select
  (select count(*) from information_schema.columns
    where table_name = 'comprovantes' and column_name = 'nome_pagador')      as coluna_nome_pagador,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'sureya_aprender_apelido_banco',
      'sureya_esquecer_apelido_banco',
      'sureya_identificar_entrada_meses'))                                    as funcoes_novas;
```

Tem de voltar `coluna_nome_pagador = 1` e `funcoes_novas = 3`.

## Depois disso

O extrato de outubro **nunca foi importado** — `entradas_banco` está com zero
linhas. O caminho é: Financeiro → Entradas → importar o PDF (ou o OFX, que é
melhor: traz o E2E do Pix e aí a conciliação acerta sem adivinhar) → e então o
painel "De quem é cada Pix" tem o que mastigar.
