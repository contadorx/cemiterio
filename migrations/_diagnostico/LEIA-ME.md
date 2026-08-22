# Diagnósticos — fora da trilha automática

Os arquivos desta pasta **não alteram nada**. São só `SELECT`.

Eles estavam misturados às migrations numeradas, e o Build 0 pede o contrário:

> "Criar baseline versionada e **eliminar scripts de diagnóstico/decisão da
> trilha automática**." — `ROADMAP_BUILDS.md`, Build 0, entrega 4

Enquanto ficavam junto, qualquer pessoa que rodasse "todas as migrations em
ordem" executava consultas de investigação achando que estava aplicando schema —
e, pior, contava esses arquivos como parte da trilha, o que fazia a numeração
parecer completa quando não era.

## O que veio para cá

| Arquivo | O que é |
|---|---|
| `0027_DECISAO_valor_vigente_diagnostico.sql` | Levanta os três significados em uso de `planos.valor_vigente` para a responsável decidir. Zero linhas de DDL/DML. |
| `0046_EXTRAIR_do_banco.sql` | Copia de volta as 24 funções `sureya_*` que nasceram no SQL Editor e nunca voltaram ao repositório. Só `SELECT`. |

## O que NÃO veio, e por quê

`0038_DECISAO_valor_vigente_preco_por_limpeza.sql` **continua na trilha**. Apesar
do nome, ele aplica a decisão da 0027 e tem 5 comandos de DDL/DML de verdade.
Tirá-lo daqui quebraria o schema de quem reconstruísse o banco pelas migrations.

## O que substituiu esses arquivos

`migrations/0053_baseline_extrair_do_banco.sql` faz o que a 0046 fazia e mais:
tabelas, colunas, constraints, índices, RLS, policies, grants, funções
`security definer`, triggers, enums, buckets de Storage e histórico de
migrations — mais a seção 2, que cruza o que o **código** lê com o que o
**banco** tem.

Foi essa seção que nasceu de duas divergências já confirmadas por leitura
estática: `tumulos.proximo_servico` (corrigida pela migration 0052) e as seis
colunas de contrato de `familias`, que o código usa para fechar o mês e que não
existem em migration nenhuma.
