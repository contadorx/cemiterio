# Um pagamento cobre vários meses

**Migration 0144, aplicada. Nenhum dado de produção tocado — a fila continua com os 6 comprovantes intactos.**

---

## O que estava errado

O seletor *"A que se refere"* era de **escolha única**. E quando nada era apontado, um gatilho (`sureya_carimbar_competencia`) carimbava o **mês do Pix**.

Ou seja: a opção *"sem apontar — só entra no saldo"*, que a tela oferecia, **nunca existiu**. O lançamento saía carimbado assim mesmo — e os 6 comprovantes da fila estão todos com competência **agosto/2026**.

O saldo da família continuava certo (ele é soma, não pareamento). Mas o **relatório por competência — o que a Sureya confere** — passava a mentir. **Dinheiro no lugar errado do calendário é pior que dinheiro nenhum: ele parece certo.**

O caso que forçou isso é literal. A Thaís escreveu:

> *"Por favor me passe o pix e o valor pra eu fazer o pagamento **referente julho-dezembro**"*

R$ 240. **Seis competências num pagamento só**, e não havia como dizer isso.

---

## O que passa a acontecer

Um pagamento vira **várias linhas de crédito**, uma por competência, todas amarradas ao mesmo comprovante. É o modelo que o sistema já tem — o saldo é soma de lançamentos — em vez de uma tabela nova de "parcelas", que seria uma segunda verdade sobre o mesmo dinheiro.

Na tela: **"A que meses se refere"**, com **de** e **até**, e um botão **"Ver como fica"**.

### Quanto vai para cada mês

| Situação do mês | Quanto recebe |
|---|---|
| **Já tem mensalidade lançada** | o valor da mensalidade — essa é a verdade que o sistema tem, não um rateio meu |
| **Ainda não tem** | divide igualmente o que sobrar |

O segundo caso é o da Thaís: o túmulo dela nem contratado está. Dividir igual é transparente **e converge**: quando o contrato nascer com R$ 40/mês, os débitos encontram os créditos exatos. Se nascer com outro valor, a soma continua certa e a diferença vira adiantamento — que é o que ela é.

**O que não couber em mês nenhum vira uma linha de adiantamento, com esse nome.** Sumir com a sobra dentro do último mês faria aquele mês mentir.

### A prévia é a mesma conta da execução

"Ver como fica" chama a **mesma função**, em modo ensaio (`p_ensaio`), que calcula e devolve **sem escrever nada**.

Não é zelo: prévia e execução com contas diferentes seria a sexta vez que este projeto paga por duas implementações da mesma regra (0092, 0105, 0106, 0115, 0137, 0140, 0142) — e desta vez apareceria como *"a prévia dizia outra coisa"*, em cima de dinheiro.

Ensaiei no comprovante real da Thaís, em produção. Resultado: **6 linhas de R$ 40, de julho a dezembro**. E a fila continuou com 6 comprovantes — nada foi escrito.

---

## O que está provado

**15 asserções em base limpa** (`testes/comprovante_varios_meses.sql`), com o caso da Thaís reproduzido:

- o ensaio **não cria crédito nenhum** e não mexe no estado do comprovante — abrir uma prévia não pode virar lançar dinheiro;
- R$ 240 viram **seis linhas**, e **julho recebe crédito**, não só agosto;
- **a soma bate ao centavo**: R$ 100 em três meses somam R$ 100, não R$ 99,99 — o centavo da divisão vai para o último mês, senão a conferência acusa diferença para sempre;
- **a linha pendente do webhook sai** — se ficasse, o mesmo dinheiro estaria contado duas vezes no saldo;
- **conferir de novo é recusado** — sem isso, o saldo mentiria *a favor* da família, que é o erro que ninguém reclama e por isso ninguém descobre;
- **o mês que já tem dívida manda no valor**, e o que sobra vai para o mês sem dívida;
- **três datas do mesmo mês viram uma competência** — "julho, julho, agosto" gastaria julho duas vezes e deixaria agosto sem nada, e o total ainda fecharia;
- `anon` não executa: é uma função que **move dinheiro**.

**6 guardas estáticas**, entre elas que a prévia é a mesma função em modo ensaio (e não uma segunda conta na tela), que o ensaio não audita nem fecha nada, e que mexer nos campos apaga a prévia velha — deixá-la faria confirmar olhando para um rateio que já não é o que vai acontecer.

**CI verde: 295 testes, 0 falhas.** Placar do banco igual a produção: tabelas 70, funções 144, gatilhos 27, policies 171.

---

## Uma coisa que a tela passou a fazer sozinha

O mês que já vem preenchido deixou de ser o do Pix e passou a ser **o primeiro mês em aberto** da família.

Para quem paga em agosto a mensalidade de julho — que é a regra da casa, não a exceção — o padrão antigo jogava o dinheiro no mês errado por omissão, e os dois meses ficavam torcidos.
