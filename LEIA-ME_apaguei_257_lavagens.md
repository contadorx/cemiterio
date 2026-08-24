# Apaguei as 257 lavagens — o que saiu, o que ficou, e como voltar

24/08/2026. Você mandou: *"tira eles, eles não são agenda"*.

---

## O que saiu

**257 lavagens**, todas com o mesmo perfil:

- status `agendado` (nenhuma executada)
- **zero fotos**
- **zero centavos** em conta corrente
- nenhum pagamento da Nina carimbado

Não sumiram: foram copiadas para **`servicos_arquivados`** antes do delete, com
data e motivo. A cópia veio primeiro; o delete só rodou depois de ela existir.

Fiz o ensaio antes — a mesma cópia e o mesmo delete dentro de um bloco que se
desfaz — e os números do ensaio foram exatamente os do ato: 257 copiadas, 257
apagadas, 5 sobrando.

## O que ficou, e por quê

**5 lavagens executadas.** Elas não estavam na tela que te incomodou: a tela de
Avulsos abre em "abertos", e executada não aparece ali. E carregam coisa que
não se recria:

```
1 foto
3 lançamentos em conta corrente — R$ 71,25
```

Apagar essas seria apagar dinheiro recebido e a prova de um trabalho feito.
Conferi depois: **nenhum lançamento ficou órfão**, os R$ 71,25 continuam
ligados ao serviço deles.

Se você quiser essas 5 fora também, é uma frase — mas aí decidimos junto o que
fazer com os R$ 71,25 antes, não depois.

## Como voltar atrás

```sql
insert into servicos
select (jsonb_populate_record(null::servicos,
          to_jsonb(a) - 'arquivado_em' - 'motivo')).*
  from servicos_arquivados a
 where a.motivo like '%0127%';
```

Não é receita de papel: rodei ela em produção dentro de um bloco que se desfaz,
e ela devolveu as **257** linhas certas. A primeira versão que escrevi aqui era
SQL inválido — testei justamente por isso.

Na prática: me peça e eu devolvo.

---

## O QUE VOCÊ PRECISA SABER ANTES DE AMANHÃ 09:00

**Elas voltam.**

O cron diário roda `gerarServicosDevidos(30)` toda manhã por volta das 09:00.
Os 79 túmulos contratados continuam devendo lavagem a cada quinze dias (68
deles), semanal (9) ou mensal (2) — e é isso que o gerador escreve. Ele vai
recriar as mesmas 257 amanhã de manhã.

Apagar não foi o conserto da tela de Avulsos. **O conserto é o rótulo**: essas
lavagens são de contrato, e a tela as chama de avulsas porque lê
`plano_id is null`, que desde a migração 0100 vale para tudo (ver
`ANALISE_AVULSOS.md`).

Três caminhos, e a escolha é sua:

1. **Consertar o rótulo** — campo `servicos.origem`, e a tela de Avulsos passa
   a listar só o que foi pedido. As lavagens voltam amanhã e ficam onde devem
   ficar: na agenda. É o que eu faria.
2. **Parar o gerador** — as lavagens não voltam. E a Nina fica sem lista de
   trabalho: os 79 contratos param de virar serviço.
3. **Não fazer nada** — amanhã às 09:00 a tela de Avulsos volta a mostrar 257.
