# A foto do comprovante se lê sem IA

Nenhum dado tocado. Nenhuma mensagem sai daqui.

---

## A frase que mudou o desenho

Eu tinha proposto pedir o PDF para as famílias. Você respondeu:

> *"faz o ocr da imagem, pois pedir é complicado para idosos"*

Está certo. Quem manda comprovante aqui cuida do túmulo de alguém há trinta
anos e não vai aprender a exportar PDF porque o sistema prefere assim. O
sistema é que se vira. E a conta pesa do seu lado:

| | |
|---|---|
| arquivos que as famílias mandaram | 90 |
| **em JPEG (foto)** | **67** |
| em PDF | 23 |

Dois terços chegam como foto.

---

## O que eu medi antes de escrever a regra

Construí dois casos que parecem o que chega e passei o OCR neles — Chromium
renderizando um comprovante na largura de um celular e comprimindo como o
WhatsApp comprime.

**Print de tela** (texto digital, 50 KB):

| | |
|---|---|
| valor | `R$ 40,00` certo |
| data | `07/11/2026` certo |
| pagador | `Katia Ferreira dos Santos` certo |
| rótulos `PAGADOR`/`RECEBEDOR` | certos |
| **identificador do Pix** | `...abcdef012ab` lido como `...abcdef**o**12ab` — **errado** |

**Foto da tela** (torta, com reflexo e moiré, 23 KB):

| | |
|---|---|
| valor e data | certos |
| os dois nomes | certos |
| **rótulos** | **sumiram** |
| identificador | virou `"io DA TRANSA"` |

Dessas duas medições saíram as duas regras da peça.

---

## Regra 1 — o OCR nunca devolve o identificador do Pix

No print, um `0` virou `o`. **Um caractere** — e o E2E continua com 32 posições,
passando por qualquer conferência de forma.

Só que o E2E é a chave **mais forte** da conciliação: a fonte 0 da
triangulação, a única que não é palpite. Um E2E errado não deixa de casar —
ele casa **errado**, com cara de certeza, e credita o pagamento de uma família
na conta de outra.

Perder o identificador custa um pouco de automação. Aceitar um identificador
possivelmente errado custa dinheiro na conta da pessoa errada. Não é um empate.

## Regra 2 — sem rótulo, quem pagou sai por eliminação

Na foto, `PAGADOR` e `RECEBEDOR` somem: são cinza pequeno, e é justamente isso
que não sobrevive ao brilho e à compressão. Sobram dois nomes sem etiqueta — e
pegar o primeiro poria **o seu nome** em cima de metade dos pagamentos, fazendo
a triangulação casar tudo com tudo.

Mas a casa a gente conhece: **ela recebe todos**. Tiro o nome dela dos
candidatos; sobrando exatamente um, foi ele quem pagou. Sobrando zero ou dois,
devolvo nulo — dedução que precisa escolher entre dois já não é dedução.

E a confiança **nunca chega a "alta"** numa foto. Ler foto é reconhecimento,
não transcrição: fica em "média", que preenche a tela e deixa a conciliação
depender de valor e nome. Quem confere continua olhando o papel.

### Uma coisa depende de você

A 0166 criou `orgs.nome_no_recebimento`: **como o banco escreve o nome de quem
recebe o Pix** — o titular da conta, não a marca. Está vazia, e cai para
"Zelo & Memória", que provavelmente não é o que o banco imprime.

Enquanto estiver assim, a dedução não acontece e **foto sem rótulo volta sem o
nome do pagador** — o valor e a data saem do mesmo jeito. Me diga o nome que
aparece como recebedor nos comprovantes e eu preencho.

---

## Três defeitos que os testes acharam em mim

1. **`07 de novembro de 2026` virava nome.** Tem duas palavras e letras
   suficientes. Agora linha com dígito não é candidata a nome.
2. **`"io DA TRANSA"` também virava nome** — o que sobrou de "ID DA TRANSACAO"
   depois do OCR. Com dois candidatos, a dedução desistia de um caso que
   resolvia. Agora exijo duas palavras de três letras.
3. **Um guarda meu quebrou pelo motivo errado.** Ele comparava
   `indexOf("extrairComprovante(midia)")`, e quando a chamada ganhou um segundo
   argumento o `indexOf` virou −1: a comparação passou a ser "algo < −1",
   sempre falsa. Deu vermelho — e podia ter dado **verde** pelo motivo oposto
   se o outro lado também sumisse. Agora exige que os dois existam.

---

## E um buraco maior, achado de raspão

A 0166 tinha um `select` de prova citando `marca_nome`. O harness reprovou:
**"column marca_nome does not exist"**. Em produção ela existe e cinco arquivos
de `src/` a usam. Em migration nenhuma.

Com ela vieram outras seis: `marca_assinatura`, `chave_pix`, `site`,
`custo_ia_por_chamada`, `assuntos_sempre_manual`, `palavras_criticas`.

É a pergunta central do Build 0 de novo — *o repositório reconstrói o banco?* —
já respondida com "não" três vezes, e uma delas exatamente assim: *"32 colunas
e 15 funções só existiam dentro do banco"*.

**Por que voltou sem ninguém ver:** o placar do harness conta tabelas, funções,
gatilhos e policies. Nunca contou coluna. Um `add column` feito à mão no painel
do Supabase passa por baixo dele inteiro, e só aparece no dia em que alguém
reconstrói o banco e uma tela quebra.

As sete entraram na 0166 com o tipo e o padrão lidos de produção, e há um
guarda novo: toda coluna de `orgs` citada em `src/` tem de nascer de uma
migration.

---

## O preço, dito em voz alta

O projeto tinha **dez dependências**, de propósito. Agora tem **doze**: o motor
do OCR e os dados de português (1,4 MB, a versão compacta — a completa tem
6,8 MB e só ganha em texto manuscrito, que não é o nosso caso).

Os dados vêm do pacote, **não de um CDN**: dependência de rede no meio do
recebimento de um comprovante quebraria calada no dia em que o CDN caísse.

Uma leitura leva **0,6 a 1,0 segundo**. E o `next.config.js` precisou dizer ao
Next para empacotar o motor e o idioma — nenhum `import` aponta para eles, e
sem isso o build passaria, o deploy subiria, e a primeira foto falharia **em
produção** procurando um arquivo que ficou para trás.

**A IA continua existindo como plano B**, para o que o OCR não alcança: foto
escura demais, reconhecimento abaixo de 60, PDF escaneado. Com a chave
desligada, esses casos caem na sua mão — e agora a conversa diz isso com todas
as letras.

`npm run ci` verde: 431 testes (15 novos), 13 guardas novos, 146 migrations.
**0166 já aplicada em produção.**
