# A jornada do avulso — o que ela é hoje e por que aparecem tantos

Medido em produção em 24/08/2026, antes de qualquer opinião.

---

## O resumo em uma frase

**Nada no sistema registra que a família pediu.** Como ninguém grava o pedido,
todas as telas passaram a deduzir "avulso" pela ausência de outra coisa — e a
ausência que elas escolheram deixou de significar isso há 25 migrations.

Você está vendo **258 avulsos**. Existem **4**. E nem esses 4 têm prova de que
foram pedidos.

---

## 1. O que "avulso" quer dizer em cada canto do sistema

Há **três definições diferentes** rodando ao mesmo tempo, e só uma delas
pergunta o que você pergunta.

| Onde | Regra | O que responde |
|---|---|---|
| `servicos` | `plano_id is null` | **quebrada** — hoje vale para tudo |
| `familias.regime` | campo declarado: `contrato` / `avulso` / `nao_definido` | a certa, e ninguém a usa |
| `tumulos` | `contratado and valor_mensal > 0` | tem contrato, sim; mas o contrário disso não é "avulso" |

### A definição quebrada

`avulso = !plano_id`. Era verdade até a migration **0100**, quando o contrato
saiu de `planos` e foi morar no túmulo. Desde então o gerador de contrato
escreve, em `src/lib/agenda.ts:293`:

```js
plano_id: null,          // o plano é o próprio túmulo agora
```

O escritor mudou de ideia. Os leitores não foram avisados. **A lavagem de
contrato nasce carimbada com a marca que todas as telas leem como "avulso".**

Medido:

```
serviços no total ...................... 262
  com plano_id ......................       4   ← 4 sobras do plano antigo (Perrela)
  sem plano_id, logo "avulso" .......... 258
    …destes, em jazigo CONTRATADO ...... 258   ← todos
    …destes, com data_plano preenchida . 254   ← o carimbo do contrato
```

Os 4 que sobraram com `plano_id` são lavagens de contrato também — acertaram a
classificação por acidente, sendo o único caso que a regra velha ainda pega.

---

## 2. O que isso quebra, tela por tela

### `/painel/avulsos` — a tela que você viu

Chama `?tipo=avulso&situacao=abertos`, que vira `plano_id is null`. Resultado:
**257 lavagens de contrato agendadas aparecem como pedidos avulsos em aberto**.

A tela existe por um motivo bom — todas as outras listas filtram por data, e um
avulso pedido para daqui a dez dias não aparecia em lugar nenhum. Só que hoje
ela não é a fila dos pedidos: é a agenda inteira, com outro nome.

### `/painel` (Início) — o selo em 293 famílias

`semPlano: !f.contratado` vira `<Selo tom="neutro">avulso</Selo>`.

```
famílias ............................... 363
  contratado = true ....................  70
  contratado = false ................... 293   ← todas recebem o selo "avulso"
  regime = 'avulso' declarado ..........   0   ← nenhuma
  sem nenhum jazigo ....................  122   ← nem clientes são ainda
```

Vazio não é zero, de novo. **293 famílias estão sendo chamadas de avulsas e
nenhuma delas é.** 122 sequer têm jazigo — são cadastro em branco, não regime
de cobrança. E a tela de Conferência já sabe disso: está escrito lá, em
`conferencia/page.tsx:177`, *"Sem contrato e avulso não são a mesma coisa"*.
A regra certa existe, escrita, numa tela só.

### `/api/financeiro/mes` — o número do trabalho

`trabalho.avulsas` conta `!s.plano_id`. Toda lavagem de contrato executada
entra ali. É o mesmo **defeito de forma** de sempre: dois números para o mesmo
fato, e é o errado que aparece no relatório.

### `/api/equipe/remuneracao` — dinheiro, ainda não gasto

`ehAvulso()` é a mesma regra. As regras de pagamento têm `so_avulso` e podem
ter valor diferente para avulso. Hoje `remuneracao_regras` está **vazia**, e
por isso ninguém foi pago errado. **No dia em que você cadastrar a regra da
Nina, todas as lavagens de contrato entram como avulsas no cálculo.** É o
defeito mais caro, e é o único que ainda não custou nada.

### `/api/fila` — meu, de anteontem

O filtro "contrato / avulso" da fila de mensagens usa o critério certo
(`contratado and valor_mensal > 0`), mas **rotula de "avulso" tudo que sobra**.
O corte é bom; o nome está errado pelo mesmo motivo dos outros.

---

## 3. A jornada como foi desenhada — e onde ela para

O caminho existe, e é bom. Ele só não é percorrido.

```
  família pede no WhatsApp
        ↓
  a IA reconhece o pedido           lib/atendimento.ts:418
        ↓
  pedidos_conversa  (status "novo") ← AVISO, sem preço e sem data:
        ↓                             "preço e agenda são decisão de gente"
  alguém decide preço + data        PUT { acao: "registrar" }
        ↓
  serviço  plano_id=null, data_desejada, prioridade 5
        ↓
  o alocador respeita a data pedida e marca desejada_estourada se não couber
        ↓
  executa → cobra uma a uma (conta_corrente, origem 'avulso')
```

Onde ele para, medido:

- **`pedidos_conversa`: 0 linhas.** A entrada inteira está sem uso. Parte disso
  é o apagão de WhatsApp de 04/08 a 22/08 — 19 dias sem mensagem chegando.
- **A tela dos pedidos só existe dentro de uma conversa.** `PedidosAdicionais`
  é montado em `/painel/conversas/[id]` e em nenhum outro lugar. Um pedido que
  a IA reconheceu numa conversa que ninguém abriu **não aparece em tela
  nenhuma**. O aviso foi criado para não deixar o pedido morrer na conversa, e
  morre na conversa.
- **`conta_corrente` com origem `avulso`: 1 linha.** A saída também está
  praticamente sem uso.

### Os 4 avulsos de verdade

```
Nagae      03/08  executado  valor —       data_desejada 03/08
Nagae      10/08  executado  valor —       data_desejada 10/08
Alcantara  08/08  executado  R$ 40,00      data_desejada 08/08
Alcantara  15/08  executado  R$  6,25      data_desejada 15/08
```

Todos em jazigo **contratado** — o que é legítimo: uma lavagem extra fora do
contrato. Mas os dois da Nagae estão sem valor e foram registrados pelo
"registrar limpeza já feita". Provavelmente são lavagem de contrato lançada a
mão, não pedido. **Não dá para saber**, e é exatamente esse o problema: o
sistema não guarda a resposta.

---

## 4. A raiz

`servicos` tem `canal` (`automatico | campo | manual_adm | importacao`) — que
diz **quem digitou**. Não tem nada que diga **por que existe**.

São perguntas diferentes. Uma lavagem digitada por `manual_adm` pode ser
contrato lançado com atraso ou avulso pedido por telefone; hoje as duas ficam
idênticas no banco.

O único sinal honesto que já existe é indireto:

| Nasceu de | `data_plano` | `data_desejada` |
|---|---|---|
| contrato (gerador) | **preenchida** | vazia |
| pedido (as três rotas de pedido) | vazia | **preenchida** |

Funciona para os 262 de hoje. É frágil: depende de duas ausências combinarem,
e a primeira coisa que quebrou aqui foi justamente uma ausência que mudou de
significado.

---

## 5. O que eu proponho

### a) Um campo que responde a pergunta certa — `servicos.origem`

`contrato | pedido | cortesia`, obrigatório, com `default 'contrato'`, e
backfill honesto pelas duas colunas acima. Depois disso, **avulso passa a ser
`origem = 'pedido'`** e ninguém mais deduz nada por ausência.

Trocar em: `/api/servicos`, `/painel/avulsos`, `/api/financeiro/mes`,
`/api/equipe/remuneracao` (`ehAvulso`), `/api/mes` + `/painel` (que devem usar
`familias.regime`, não `!contratado`), e o rótulo do filtro da fila.

### b) O Início para de chamar 293 famílias de avulsas

Três estados, como na Conferência: **contrato**, **avulso**, **a definir**. E
família sem jazigo nenhum não recebe selo de regime — não é regime, é cadastro
pela metade.

### c) A fila dos pedidos sai de dentro da conversa

`pedidos_conversa` com status `novo` vira contador no menu e lista própria. Um
pedido reconhecido pela IA não pode depender de alguém abrir a conversa certa.

### d) `/painel/avulsos` vira o que o nome diz

Com (a), a tela passa a listar só o que foi pedido, e ganha o que falta para
fechar o ciclo: **o preço**. Hoje um avulso pode ser executado com `valor` nulo
e nunca virar cobrança — foi o que aconteceu com os dois da Nagae.

### e) Refazer o roteiro não pode mexer no que a família pediu

**Defeito meu, de ontem.** `sureya_soltar_roteiro` (migration 0125) solta tudo
que está agendado, futuro e não fixado — **sem excluir `data_desejada is not
null`**. O alocador respeita a data pedida ao recolocar, e por isso o estrago é
pequeno; mas com a data pedida caindo hoje ou ontem, o piso empurra para
amanhã, e a família recebeu uma data que o sistema mudou sozinho.

Hoje não custou nada: há **0 avulsos em aberto**. Precisa de conserto antes de
existir o primeiro. É a única coisa aqui que eu recomendo consertar já,
independente do resto.

---

## 6. O que eu NÃO proponho

- **Apagar os 258.** Não há nada errado com eles no banco: são lavagens de
  contrato corretas, com a data teórica certa. O errado é o rótulo.
- **Criar avulso automático.** Você foi claro: avulso é só quando pedem. Nada
  aqui gera avulso sozinho hoje, e nada deve passar a gerar.
- **Mexer em `planos`.** A tabela tem 1 linha e 4 serviços presos a ela. Depois
  de (a), ela deixa de decidir qualquer coisa e pode ser aposentada com calma,
  numa fatia própria.
