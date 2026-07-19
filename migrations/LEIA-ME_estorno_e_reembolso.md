# Corrigir registro errado · reembolso da Nina

## 1. Registro errado: estornar, não apagar
Você levantou o ponto certo — um registro errado prejudica a família. Mas a
resposta não é apagar: **apagar esconde o erro**. Se ela recebeu uma foto e um
débito indevidos, sumir com o registro deixa o portal com buraco e o saldo sem
explicação.

**Agora existe "↩ Registrei errado"** nas lavagens já executadas. Ele:
1. Anula a lavagem, mas o registro **continua visível** com o motivo
2. Devolve o valor cobrado como **crédito de correção** na conta da família
3. Deixa o rastro: `estorna_movimento` liga o crédito ao débito original

O extrato dela passa a contar a história inteira: houve uma cobrança, houve um
erro, e ele foi corrigido. É melhor do que um buraco inexplicável.

**O motivo é obrigatório** — ele aparece no extrato da família. Não dá para
estornar duas vezes.

## 2. Conta da ajudante — Financeiro → Conta da equipe
Quando a Nina compra material do próprio bolso, o dinheiro dela fica no negócio
até você pagar. Isso precisa aparecer em algum lugar.

**"+ Ela comprou material":** escolhe quem, o quê, quanto e quando. Isso faz
duas coisas ao mesmo tempo:
- o material **entra no estoque** (e o custo unitário é recalculado)
- o valor vira **dívida com ela**

**Pagar:** o botão mostra quanto está em aberto e desde quando. Aceita
**pagamento parcial** — quita do lançamento mais antigo para o mais novo, e
quebra o último se sobrar. A saída entra no caixa classificada como
"Pagamento da ajudante", então aparece no resultado do mês.

O cartão no topo mostra **quanto está em aberto com a equipe** — é dinheiro dela
que está no seu negócio, e vale enxergar.

## Um erro de PL/pgSQL que vale registrar
O estorno não funcionou na primeira tentativa: em PL/pgSQL, `record IS NOT NULL`
só é verdadeiro quando **todos** os campos são não-nulos. Como o movimento tem
colunas opcionais vazias, o teste dava falso mesmo tendo achado a linha.
O certo é usar `FOUND`. Ambos os fluxos foram testados no banco antes de entregar.
