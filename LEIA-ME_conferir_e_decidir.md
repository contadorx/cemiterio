# Conferir um comprovante é decidir, não é dizer sim

Você olhou a tela e sentiu falta dos dados. Estava certo: para dizer *"sim,
este dinheiro entrou"* faltava tudo.

**A tela antes:** imagem, valor, data, o E2E, o nome do contato — e dois
botões, **Confirmar pagamento** e **Rejeitar**.

De quem é? Quanto essa família deve? A que o pagamento se refere? Nada disso
estava lá. Confirmar virava um sim automático — e sim automático não é
conferência, é carimbo.

---

## O que a tela mostra agora

**De quem é** — a **família**, não só o contato que apertou o botão. *"Família
Xim · mandado por Josefina"*, com link para a ficha.

**Quanto ela deve** — em aberto, ou saldo a favor dela, ou conta zerada. Sem
esse número, confirmar é um sim no escuro.

**O aviso do seu caso** — quando a família ainda não tem contrato:

> **Esta família ainda não tem contrato.** O pagamento entra como saldo a favor
> dela e fica lá até existir o que abater. → *cadastrar o contrato*

Não é erro — é exatamente a Família Xim, que você ainda não cadastrou. Mas quem
confirma precisa saber, senão o dinheiro some numa conta que não tem contra o
que abater.

## O que você decide, e que agora fica gravado

| campo | por quê |
|---|---|
| **Valor que entrou** | a leitura da IA é um palpite bom, **não um fato**. Quem tem o extrato do banco do lado é você. Corrigiu? A tela mostra *"a leitura dizia R$ 40,00"* |
| **Dia em que caiu** | comprovante de Pix às vezes traz a data do envio, e o dinheiro cai no dia seguinte |
| **De qual jazigo** | só aparece quando a família tem mais de um |
| **A que se refere** | a competência em aberto que este pagamento cobre |

Corrigir o valor **acerta os dois lados** — o razão e o comprovante. Duas
versões do mesmo dinheiro é o pior resultado possível, e é o que aconteceria se
só um fosse atualizado.

### Uma honestidade sobre "a que se refere"

O razão desta casa é um **saldo corrente**, não uma lista de faturas quitadas
uma a uma. Escolher a competência grava uma **referência** no lançamento —
*"isto era o agosto dela"* — e **não** marca aquela competência como paga.

Fiz questão de deixar isso escrito na migração e na tela. Prometer quitação
item a item seria inventar um mecanismo que o sistema não tem, e a tela passaria
a dizer "agosto pago" sem nada por trás. O saldo continua sendo o juiz.

---

## O conserto de ontem já provou que funciona — com dinheiro de verdade

```
11:42:30  o comprovante chegou pelo WhatsApp
13:16:20  virou lançamento no razão
```

Alguém clicou **Confirmar** depois que a 0133 subiu, e os **R$ 40,00 entraram**.
A Família Xim está hoje com R$ 40,00 de saldo a favor — que é o certo, já que
ela não tem contrato para abater.

Não foi teste: foi o app real, com o Pix real.

---

## O que ainda não fiz, e por quê

**Não criei quitação item a item.** É o que faltaria para "agosto pago" ser um
fato e não um rótulo. É uma fatia própria, e mexe no coração do razão — não
cabia dentro desta.

**Não mexi na régua a partir daqui.** Confirmar um pagamento que zera o vencido
já zera o nível de cobrança (isso existe desde antes). O que não existe é
abater uma competência específica.

---

17 verificações em `testes/comprovante_vira_dinheiro.sql` e 8 guardas de tela.
`npm run ci` verde: 227 testes, 123 migrations, placar igual à produção.
