# Dá para identificar um comprovante sem IA?

**Em PDF, dá. E dá bem.** Em foto, não — e eu digo por quê.

Nenhum dado tocado. Nenhuma mensagem sai daqui. Nenhuma dependência nova.

---

## Por que dá

Um comprovante em PDF **não é uma foto**. Ele tem texto dentro: o banco
escreveu `R$ 40,00`, `07/11/2026` e o identificador do Pix ali, em caracteres.
Mandar isso para um modelo de visão é pagar para alguém ler em voz alta o que
já está escrito.

É a mesma decisão da 0161, quando o extrato do Bradesco deixou de ir para a IA:
`textoDoPdf` tira o texto com o zlib que já vem no Node, e a IA virou plano B.

E vale mais agora do que então:

| | |
|---|---|
| mídias que as famílias mandaram | 25 |
| **delas, em PDF** | **6** |
| comprovantes registrados desde que a chave foi desligada | **0** |

## O que o leitor acha, e com que cuidado

- **o valor** — e não o maior número do papel. Comprovante tem tarifa, saldo e
  valor; prefiro o que tem rótulo de valor.
- **a data** — de preferência a que está **dentro do E2E**, porque foi o Banco
  Central que a escreveu, e não o desenho do PDF.
- **o identificador do Pix (E2E)** — só na forma inteira: `E` + 8 dígitos de
  ISPB + 12 de `AAAAMMDDHHMM` + 11 livres, 32 ao todo. Casar frouxo plantaria
  um identificador falso, e o identificador é a chave **mais forte** da
  conciliação: errado, ele casa o pagamento de uma família com o de outra com
  cara de certeza.
- **o nome de quem pagou** — por rótulo (`Pagador`, `Origem`, `Debitado`), e
  nunca o do recebedor. A Sureya é a recebedora de **todo** comprovante que
  chega; confundir os dois devolveria o nome dela em cima de cada pagamento, e
  a triangulação passaria a casar tudo com tudo.

E o leitor **fica modesto quando não sabe**: sem rótulo de pagador, o nome volta
nulo em vez de chutado. Nome chutado aqui não deixa um campo vazio — ele
descarta o comprovante certo na conciliação do mês seguinte, calado.

A confiança sai do que foi achado, não de otimismo:

| achou | confiança | o que acontece |
|---|---|---|
| valor + data + E2E | alta | registra sozinho, aguardando sua conferência |
| valor + data | média | registra, e a conciliação depois depende de valor e nome |
| o resto | baixa | **não preenche nada** — e aí sim vale uma chamada de modelo |

## Dois defeitos que os testes acharam em mim

**1. `de` casando dentro de palavra.** Sem borda, o rótulo do pagador batia
dentro de "Vali**de**:" e de "Da**dos de** quem pagou" — e o leitor devolvia
`"quem pagou"` e `"Assinatura do responsavel"` como se fossem nomes de pessoas.
Lendo o código, a linha parecia certa. Só rodando contra PDF de verdade apareceu.

**2. O E2E que eu mesmo escrevi errado.** O leitor recusou o identificador de um
dos arquivos de teste. Fui conferir achando que era o leitor: o arquivo é que
tinha 29 caracteres em vez de 32. **O errado era o teste**, e o leitor estava
certo em recusar.

## Como isso foi provado

Cinco PDFs **de verdade** — fluxo comprimido com zlib, texto posicionado com
Td/Tj, igual ao que um banco produz. O caminho exercitado é o mesmo que roda em
produção, do deflate até a remontagem das linhas; nada entrega o texto pronto.
Os nomes são inventados: comprovante real tem nome e CPF de família real, e
isso não entra no repositório.

| arquivo | o que ele testa | resultado |
|---|---|---|
| blocos | pagador e recebedor em blocos | R$ 40,00 · 07/11 · E2E · Katia Ferreira dos Santos · **alta** |
| em linha | rótulo e nome na mesma linha | R$ 120,00 · 03/11 · E2E · Josiane Aparecida Lima · **alta** |
| com tarifa | saldo de R$ 2.540 e tarifa no papel | **R$ 80,00** — nem o maior nem o primeiro · **alta** |
| magro | sem E2E e sem rótulo de pagador | R$ 40,00 · 10/11 · **nome nulo** · média |
| orçamento | um PDF com `R$` que **não** é pagamento | **não é comprovante**, e sem nome |

Gerados por `testes/fixtures/fazer-comprovantes-pdf.mjs`.

---

## O que isto **não** resolve

**Foto não.** Print de celular, JPEG, PNG: não há texto para extrair. OCR seria
dependência nova num projeto que tem dez, de propósito. Dos 25 arquivos
recebidos, **19 são imagem** — esses continuam dependendo da IA ou de uma
pessoa digitando.

Se quiser resolver as fotos também sem IA, o caminho honesto não é OCR: é pedir
o PDF. Quase todo banco oferece "compartilhar comprovante" em PDF, e uma frase
na conversa ("se der, manda o comprovante em PDF que eu já registro sozinho")
converteria boa parte dos 19 — de graça, e com leitura exata em vez de
adivinhada.

**E a IA continua existindo como plano B**, para PDF escaneado (que é imagem com
capa de PDF) e para leitura de confiança baixa. Confiança baixa não preencheria
campo nenhum de todo jeito, então aí vale gastar a chamada.

`npm run ci` verde: 416 testes (16 novos), 8 guardas novos, 145 migrations.
