# Base real importada — planilha Controle_2026 (18/07/2026)

## O que entrou
- **59 clientes** e **62 jazigos** (3 pessoas cuidam de mais de um jazigo).
- **R$ 2.410** de referência mensal — bate exatamente com a soma da planilha.
- Quadras **QD 1** (ruas 1 a 8) e **QD 3** (rua 9).
- Tratamento por família ("a senhora" 40 · "o senhor" 19 · "a Dra" 3).
- Observações da planilha preservadas em `clientes.observacoes`.

## Regras de conversão
- **Valor**: a coluna "Valor Mensal" virou `planos.valor_mensal`.
  A cobrança do ciclo (`valor_vigente`) = valor_mensal × meses da cadência.
  Ex.: CIDA, bimestral, R$ 70/mês → R$ 140 por cobrança.
- **Periodicidade**: normalizada (maiúsculas, "semestre"→semestral, "trimestre"→trimestral).
  Sem periodicidade, "N/A", "Contratação Pontual" e status "Esporádico" → **avulso**.
- **Avulsos** (9) entram com `regua_cobranca = nao_cobrar` e `ativacao_ativa = true`:
  a IA não cobra, ela **convida** de 6 em 6 meses e nas datas especiais.
- **Sem telefone** (5 famílias): cadastradas com `ativo_ia = false` e telefone
  provisório `sem-tel-N`. A IA não age nelas até você preencher o número.

## Clientes com mais de um jazigo
- **LINEU** — Família LINEU BAIXINHO e Família BOSCARIOL (QD 1 · RUA 1)
- **Dra. YONE** — Família DELL ANTONIA (RUA 1) e dois jazigos na RUA 8

## Dados de teste
Tudo que existia antes foi renomeado com o prefixo **[TESTE]** (14 clientes,
5 quadras, 1 cemitério, leads, campanhas e materiais). Para apagar depois:

```sql
delete from clientes where nome like '[TESTE]%';
delete from quadras where codigo like '[TESTE]%';
delete from cemiterios where nome like '[TESTE]%';
delete from materiais where nome like '[teste]%';
```
(as tabelas filhas caem em cascata)
