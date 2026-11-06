# De quem é este Pix, e a que meses ele se refere

**0163 + 0164.** Nenhum dado foi tocado. Nenhuma mensagem sai daqui.

---

## O que foi medido antes de escrever uma linha

Extrato do Bradesco, outubro/2026, 17 páginas:

| | |
|---|---|
| Pix recebidos | **248** |
| Valor recebido | **R$ 19.805,00** |
| Cobrado pelo sistema no mês | R$ 3.400,00 |
| **Registrado pelo sistema** | **R$ 0,00** |
| Nomes distintos de pagadores | 196 |
| Jazigos contratados | 113 |
| Nomes que **casam** com o cadastro | 69 |
| Nomes que **não** casam | **127** |

E os 127 não são falha de cadastro. São duas coisas:

1. **Quem paga não é quem está cadastrado.** "A Kátia é responsável da família
   Tonelloti e pagou para os Tonelloti." O banco imprime o nome de quem manda
   o Pix; o cadastro tem o nome de quem contratou.
2. **O Bradesco corta o nome em ~21 letras.** `SANDRA REGINA M DE LI`.
   Comparar por igualdade não acha ninguém.

E muita gente pagou o **anual**.

---

## As quatro fontes, por ordem de força

A conciliação não adivinha. Ela pergunta a quatro lugares, nesta ordem:

**0. O identificador do Pix (o E2E).** Certeza, não palpite. Medido em
produção: **20 de 20** comprovantes lidos guardam o E2E. Quando o extrato traz
o mesmo identificador na linha, não há o que adivinhar — é o número que o Banco
Central deu àquele pagamento. O PDF do Bradesco imprime só um nº de documento
curto, então esta fonte quase nunca acende lendo PDF; **no OFX ela acende**, e
quando acende não erra. (Seis dígitos de "docto" não são aceitos como
identificador: casariam com qualquer coisa.)

**1. O comprovante, por valor *e nome*.** A família mandou a foto no WhatsApp; aquela conversa já
está ligada ao cliente, e o cliente à família e aos jazigos. Se existe um
comprovante de R$ 40 do dia 03 e o extrato tem um Pix de R$ 40 no dia 03, é o
mesmo dinheiro — e aí o nome do banco deixa de ser a chave e passa a ser
confirmação.

O valor bate **ao centavo**, e a data com dois dias de folga (a família manda a
foto quando lembra). "Mais ou menos R$ 40" casaria o pagamento de uma família
com o comprovante de outra, e as duas sairiam quitadas — uma delas sem ter pago.

**O valor faz o candidato; o nome decide.** Isto mudou depois que você
perguntou: *"ele não consegue olhar os dados do comprovante mais o que tem no
extrato? Não pelo valor, mas valor e nome."* Estava certo — o valor sozinho
empata, e era aí que a conciliação desistia.

O nome vem de dois lugares, e eles não valem o mesmo:

- **`nome_pagador`, lido no próprio comprovante** (0165): é o nome que o banco
  imprimiu de quem pagou, a mesma coisa que o extrato traz. Discordar aqui é
  prova de que são pagamentos **diferentes**, e o candidato sai.
- **o nome da família no cadastro**: confirma quando bate, mas **não acusa**
  quando não bate — quem paga muitas vezes não é quem contratou.

A comparação é **palavra por palavra**, porque o banco abrevia e trunca:

| extrato | cadastro | |
|---|---|---|
| `KATIA F DOS SANTOS` | Katia **Ferreira** dos Santos | bate |
| `SANDRA REGINA M DE LI` | Sandra Regina **Mendes** de **Lima** | bate |
| `MARIA SILVA` | Maria Souza | não bate |
| `MARIA` | Maria Tonelloti | não bate — uma palavra só não afirma nada |

**Empate que o nome não separou não vira sorteio.** Escolher "o primeiro"
acertaria metade das vezes e erraria a outra metade em silêncio. Aí o
comprovante não decide: cai para a fonte seguinte.

**Ausência não é discordância.** Os 20 comprovantes que já existem não têm nome
lido — a leitura nunca pedia. Eles continuam valendo pelo valor; só não têm essa
prova a favor. E não vale reler imagem antiga para preencher coluna: seria gastar
IA em cima de pagamento já conferido.

**Candidato único com nome divergente ainda é palpite** — o valor continua
valendo — mas a tela **diz** que o comprovante aponta outra pessoa, em vez de
apresentar o palpite como confirmado.

**2. A lição aprendida.** Alguém já disse, uma vez, de quem é aquele nome. É o
que faz 196 nomes virarem trabalho de um mês só — no mês seguinte quase tudo
entra sabendo.

**3. O nome no cadastro.** Por prefixo, porque o banco trunca. Só quando há **um**
candidato: dois irmãos com o mesmo sobrenome produzem dois, e aí o nome não
decide. Esta é a fonte mais fraca e a tela diz isso em voz alta — o selo é
"só pelo nome", em amarelo.

Quando nenhuma alcança, a entrada volta **sem palpite**. Isso é resposta, não
falha: melhor a pergunta aberta que um chute com cara de certeza.

---

## Você sugere, eu confirmo. Sempre.

Nada é creditado por conta própria. O caminho na tela tem três passos, e o do
meio existe só para você ler:

1. **"A que meses se refere?"** — abre os meses em aberto da família, já
   marcados **do mais antigo até o dinheiro acabar**. É o que a família faz
   quando paga o anual: ela não escolhe meses no meio. Mas é sugestão, e os
   marcadores ficam abertos.
2. **"Ver o que vai acontecer"** — mostra, linha por linha, o que vai ser
   escrito: cada competência, quanto recebe, se quita ou abate parte, e a
   sobra. Essa prévia sai da **mesma função** que grava, com a escrita
   desligada (`p_ensaio`). Uma prévia calculada por outro caminho mentiria
   exatamente no dia em que os dois divergissem.
3. **"Confirmar e creditar"** — só aqui algo é escrito.

E a lição só é guardada **quando você confirma**, nunca no ensaio e nunca
sozinha. Aprender sozinho faria o sistema estudar os próprios palpites: o nome
do cadastro, que é a fonte mais fraca, viraria lição confirmada sem ninguém
olhar.

---

## O anual

Um Pix de R$ 480 não é "um crédito de R$ 480": são doze competências. Quem abre
a ficha depois precisa ver os doze meses quitados, não um número grande sem
endereço.

`sureya_identificar_entrada_meses` recebe **quais** débitos o dinheiro paga,
pode apontar um **serviço** (a ação de flores, um avulso) e tem ensaio. O
crédito nasce carimbado na competência **mais antiga que ele paga** — carimbar
no mês do extrato faria o relatório por competência mentir em onze dos doze
meses. O que não couber aparece como **sobra**, e não escondido dentro do
último mês.

---

## Defeitos encontrados no caminho (e consertados)

**Um teste de dinheiro estava verde testando outra coisa.**
`painel_do_mes.sql` e `cobranca_por_competencia.sql` usavam o **mesmo UUID**
(`...0161`). Os testes rodam todos contra o mesmo banco, em sequência, e o
`on conflict do nothing` virou um no-op: o caso da Áurea — contrato antigo,
pré-pago, R$ 40, agosto — nunca entrou, e o assert passou meses cobrando o
jazigo do outro teste, de R$ 100 e competência do mês corrente. Ids trocados, e
agora há um guarda (`testes/checar-uuids-dos-testes.js`) que reprova UUID
repetido entre arquivos.

**O CI estava vermelho desde a 0154.** O teste `baldes_fechados` dizia "serviços
continua aberto de propósito" e avisava: *no dia em que alguém fizer o build de
fechar, eu vou falhar, e a falha é o lembrete de vir aqui*. A 0154 fechou o
balde e ninguém voltou. Voltei: o assert agora cobra o estado novo.

**`sureya_debitos_em_aberto` mentia fora de sessão.** Ela usava
`current_org_id()`, que é nulo sem sessão do painel (lição da 0103) — e o
`where` com org nula não dá erro: devolve **zero** débitos. A conciliação, que
tem a org na mão, veria a família sem nada em aberto e jogaria o anual inteiro
como adiantamento. Errado, e calado. Agora recebe `p_org`.

---

## Duas implementações da mesma regra: não

A forma normalizada do nome (maiúsculo, sem acento, sem espaço dobrado) tem
**um dono só**, e ele é `normalizarNomeBanco()` em `src/lib/triangulacao.ts`.
O banco **não** normaliza: ele **confere a forma** com um `check` e recusa o
que chegar fora dela. Escrever a mesma regra também em SQL seria o defeito de
forma que já custou nove migrations (0092, 0105, 0106, 0115, 0137, 0140, 0141,
0142, 0148).

Pelo mesmo motivo, a porta antiga `sureya_identificar_entrada(entrada, cliente)`
continua existindo com a mesma assinatura e o mesmo retorno — mas não tem mais
regra própria: ela **delega**.

---

## Aplicado em produção, e conferido

0163, 0164 e 0165 estão no banco de produção. A prova, lida depois de aplicar:

| | |
|---|---|
| `comprovantes.nome_pagador` | existe |
| `apelidos_banco` | existe, com 5 policies |
| funções novas | 3 de 3 |
| `sureya_debitos_em_aberto` | agora com `p_org` |
| porta antiga delega | sim |
| portas abertas para o anônimo | **0** |
| tabelas / funções `sureya_*` | 71 / 154 — igual ao harness local |

E a função rodando em cima de dado de verdade: numa família com dívida aberta,
**2 débitos, os 2 com competência preenchida**. Nada foi escrito para provar
isso — a prévia é leitura, e a trava de entrada inexistente recusa sem gravar.

## E o extrato de outubro nunca foi importado

Medido agora: **`entradas_banco` tem zero linhas.** O PDF foi lido — a leitura
funciona, 288 movimentos, saldo fechando — mas a importação nunca foi
confirmada. Sem isso a triangulação não tem o que mastigar.

**Se der, importe o OFX em vez do PDF.** O OFX traz o E2E do Pix no FITID, e aí
a fonte 0 acende: conciliação por identificador não é palpite, é certeza. O PDF
só imprime um nº de documento curto, e a conta volta a depender de valor e
nome.
