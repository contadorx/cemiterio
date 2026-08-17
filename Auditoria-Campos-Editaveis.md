# Auditoria dos campos editáveis

Varredura de todas as telas ativas, cruzando **o que o formulário envia** com
**o que a API aceita** e **o que chega ao banco**.

---

## Dois bugs encontrados e corrigidos

### 1. "Registrar limpeza" não registrava nada como feito

O botão que criei na ficha mandava `dataExecutada`, mas a rota `/api/servico`
só conhecia `dataPrevista` — e criava o serviço com status **pendente**.

Na prática: a Sureya anotava uma limpeza que já tinha feito, e ela aparecia na
agenda da Nina como se ainda faltasse. Trabalho duplicado no cemitério.

A rota agora distingue as duas situações, que são mesmo diferentes:

| Campo | Significa | Nasce como |
|---|---|---|
| `dataPrevista` | agendar algo que **ainda vai** ser feito | pendente |
| `dataExecutada` | registrar algo que **já foi** feito | executado |

### 2. Escolher a família na tela Jazigos deixava o túmulo invisível

O cartão de jazigo tem um seletor de família, e ele gravava só `cliente_id`.
O `familia_id` ficava nulo — e como a conta corrente e a tela do mês penduram
na **família**, o túmulo sumia da ficha logo depois de ser vinculado.

É o mesmo erro que eu já tinha corrigido no vínculo pela ficha, chegando por
outra porta. Agora a derivação está **no PATCH do túmulo**, que é por onde todo
caminho passa: qualquer tela que mude o dono acerta a família junto.

Desvincular também foi tratado — o túmulo volta a ser órfão de verdade, e não
meio-órfão com a família de um dono que já saiu.

---

## O que foi conferido e está correto

| Tela | Campos | Situação |
|---|---|---|
| Ficha · dados da família | nome, WhatsApp, observações | chegam ao banco |
| Ficha · túmulo | valor, base do valor, periodicidade, frequência, tem plano, falecido, nome na pedra, quadra, rua | chegam ao banco |
| Ficha · conta corrente | valor, descrição, data | chegam ao banco |
| Jazigos · cartão | identificação, rua, número, quadra, falecido, família, observações | chegam ao banco |

O PATCH de túmulo grava hoje: `cliente_id`, `familia_id`, `contratado`,
`falecido_nome`, `freq_pagamento`, `identificacao`, `lat`, `lng`,
`ordem_na_rua`, `periodicidade`, `rua`, `rua_id`, `valor_base`,
`valor_lavagem`, `numero`, `observacoes`, `quadra_id`, fotos e GPS.

---

## O que continua protegido de propósito

- **`tipo` e `origem` de um lançamento não se editam.** Virar débito em crédito
  mudaria o saldo sem deixar rastro; para isso, apaga-se e lança de novo.
- **O valor de uma mensalidade não se edita no extrato.** Ele vem do plano do
  túmulo; mudar só o lançamento criaria divergência entre o que o plano diz e
  o que a família deve.
- **O registro de lavagem não é clicável.** É o espelho do serviço executado,
  não um lançamento de dinheiro.
- **Quadra e rua nunca são digitadas**, sempre escolhidas de lista. Foi
  digitação livre que transformou quatro quadras em treze.

---

## Testado no banco de produção

- Trocar o dono de um túmulo leva a família junto → **sim**
- Limpeza com `dataExecutada` nasce **executada**, não pendente → **sim**

Os dois testes foram desfeitos em seguida.

`next build` executado: passou limpo.
