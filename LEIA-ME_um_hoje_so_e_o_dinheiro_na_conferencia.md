# Um "hoje" só, e o dinheiro dentro da conferência

*28 de agosto · sem migration, sem nenhum dado tocado*

## O pedido

Trazer os números da família para dentro da conferência, para não precisar sair
da tela ao bater o extrato contra o caderno.

## O que apareceu no caminho, e é maior

Fui usar a rota que calcula o saldo e encontrei, na linha que decide **o que
está vencido**:

```ts
const hoje = new Date().toISOString().slice(0, 10);
```

`toISOString()` devolve o dia em **UTC**. Às 21h de Brasília o dia já virou lá.
Então, das 21h à meia-noite, uma competência que vence **hoje** já entrava como
dívida — e a família aparecia *"Em aberto"* na véspera.

`diaOperacao()` existe desde a 0114 e foi escrita para exatamente esse bug.
Ainda assim, **13 arquivos** continuavam calculando o dia em UTC:

| onde | o que decidia errado |
|---|---|
| `lib/financeiro.ts` | o motor do dinheiro — cobrança e classificação |
| `api/conta-corrente` | **o que está vencido** |
| `api/mes` | quem o painel pinta de vermelho |
| `api/fila`, `api/memoria`, `api/flores`, `api/precisa-de-voce` | o que aparece hoje |
| 6 outros | data padrão de lançamento, comprovante, próxima lavagem |

Três horas por dia, todo dia, o sistema operava com a data de amanhã. **20 usos
trocados pela porta única.**

E a guarda é **negativa**, de propósito: ela não cobra que exista a função
certa, cobra que **não exista a errada**. Foi assim que o defeito sobreviveu à
0114 — a função foi criada, e as chamadas antigas ficaram.

## O dinheiro na conferência

A ficha copiada continua recusada: uma cópia é uma segunda verdade sobre a
mesma família. O que entrou foi só o que a conferência precisa — **a frase do
saldo**, do jeito que se diz ao telefone:

> *Em aberto · R$ 240,00* &nbsp;·&nbsp; *Em dia · R$ 80,00 a vencer* &nbsp;·&nbsp; *Pago adiantado · R$ 50,00 a favor*

Com um link **ver o extrato** ao lado, que leva à ficha de verdade e volta.

**A regra do saldo saiu para `lib/saldo.ts`.** A ficha e a conferência chamam a
mesma função — recalcular na segunda tela seria a segunda conta sobre os mesmos
fatos, e quando duas contas discordam sobre dinheiro alguém liga para uma
família cobrando o que ela já pagou.

**Uma consulta, não 363.** Os lançamentos vêm de uma vez e o saldo sai por
família. Uma chamada por família seriam 363 idas ao servidor para ler a
primeira linha.

**E falha não vira R$ 0,00.** Se a conta não puder ser lida, a tela diz que não
soube. Saldo zerado por erro de rede, numa tela onde se dá o ok, faria você
aprovar achando que a família está quite.

## O que ficou provado

Oito asserts novos sobre a regra do saldo, entre eles os dois que importam:

- um débito que vence **hoje** já conta como vencido;
- o **mesmo** débito, lido com o dia anterior, ainda não venceu — que é
  exatamente a diferença que o UTC produzia entre 21h e a meia-noite.

CI verde, 261 asserts.
