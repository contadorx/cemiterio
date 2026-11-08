# O PDF é um arquivo, e não uma imagem quebrada

Nenhum dado tocado. Nenhuma mensagem sai daqui.

---

## O que você viu, e o que era

Na conversa aparecia o ícone de imagem quebrada com o texto
*"imagem enviada pela família"*. Fui atrás, e o arquivo estava **inteiro**:

| | |
|---|---|
| existe no balde | sim |
| o endereço está no formato certo | sim |
| o link assina certo | sim |
| tipo | **`application/pdf`** |
| tamanho | 19,7 KB |

O defeito não era o arquivo nem o link. Era a etiqueta: a tela desenhava
**toda** mídia com `<img src=...>`, e navegador nenhum renderiza PDF dentro de
um `<img>`. O que sobra é o ícone quebrado e o texto alternativo.

E não era um caso só:

> Das **25** mídias que as famílias mandaram, **6 são PDF**.
> Seis comprovantes invisíveis desde sempre, cada um deles inteiro no balde.

## O conserto

**O tipo é decidido na rota, não na tela.** O endereço guardado termina em
`.pdf`; o link assinado que vai para a tela leva `?token=` atrás, e aí a
extensão deixa de ser o fim da string. Perguntar à tela o que ela não tem mais
como saber é exatamente como este defeito nasceria de novo — então a rota manda
`midia_tipo` junto.

Imagem continua no `<img>`. PDF ganha quadro próprio, com o documento de
verdade dentro e um link **"abrir o PDF em tamanho cheio"** embaixo, para quem
precisa ler o valor. Celular que não embute PDF recebe uma frase dizendo isso —
nunca um quadro branco calado.

---

## O segundo defeito, que estava junto

Fui conferir se o PDF tinha virado comprovante. Não tinha. E aí apareceu outra
coisa:

> **Zero comprovantes registrados desde que a chave da IA foi desligada** — e
> nenhum aviso, em lugar nenhum.

`extrairComprovante` pega qualquer falha — chave fora, modelo fora do ar,
arquivo recusado — e devolve `eh_comprovante: false`. Que é **exatamente a mesma
resposta** de "li o papel e não é um comprovante".

As duas coisas viravam a mesma frase na conversa: *"a família mandou uma
imagem"*. A Sureya não tinha como saber se precisava olhar o papel ou se o
sistema estava cego.

Agora são três respostas, porque são três coisas:

| o que aconteceu | o que a conversa diz |
|---|---|
| li, e é comprovante | `[comprovante de Pix recebido: R$ 40,00, 07/11 — registrado…]` |
| li, e não é comprovante | `[a família mandou um arquivo (PDF) — está aqui na conversa]` |
| **não consegui ler** | `[… NÃO CONSEGUI LER: a leitura automática está fora do ar, então isto pode ser um comprovante. Olhe o arquivo.]` |

E "imagem" virou **"arquivo (PDF)"** quando é PDF. Chamar um PDF de imagem é
mandar procurar o que não está lá.

---

## O que isso quer dizer para a chave da IA

A chave continua desligada, e a decisão é sua. O que mudou é que o sistema
**avisa** quando está cego, em vez de responder como se tivesse olhado. Esses
seis PDFs e tudo que chegar enquanto a chave estiver fora continuam precisando
de um par de olhos — e agora a conversa diz isso com todas as letras.

`npm run ci` verde: 400 testes (10 novos), 7 guardas novos, 145 migrations
aplicando.
