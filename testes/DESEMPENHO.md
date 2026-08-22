
### A etiqueta do plano saiu do cabeçalho (mesma rodada)

Ela era a última peça que ainda fazia o menu da ferramenta ser diferente do das
outras telas: um botão a mais, de largura variável — o nome do cliente vai
dentro dele —, no meio de um menu que passou a ser o mesmo em toda parte. Uma
moldura igual em quatro telas que ganha uma peça só numa delas volta a ser
quatro molduras.

Ela foi para a **barra lateral, uma linha abaixo do e-mail**: é lá que a
pergunta "em nome de quem estou vendo isto" já é respondida, e é lá que o painel
da conta também a responde. E lá ela não repete o nome do cliente — o e-mail
está uma linha acima —, então diz só **"Plano Team"**, com as mesmas palavras
que o painel usa.

Ela continua sendo **botão**, e não texto: clicar abre a caixa da licença, que é
onde se troca a chave e se vê o cliente. Era o que a etiqueta do cabeçalho
fazia, e o caminho não podia sumir junto com ela.

**Duas fontes, uma regra de desempate.** O servidor sabe o que a CONTA tem
(`/api/menu` passou a devolver o rótulo pronto); a licença guardada sabe o que
foi ATIVADO nesta máquina. Elas discordam no caso normal do primeiro dia — chave
de Time colada num navegador cuja conta ainda não virou Time. Ganha o que está
ativo aqui: dizer "Plano Free" ao lado de recursos de Time destravados seria a
tela contradizendo a si mesma.

O `testes/barraapp.mjs` tem uma lista fechada dos campos que `/api/menu` pode
devolver — ela existe para que uma entrada nova seja uma decisão, e não um
descuido. `plano` entrou por ali: é da mesma classe do `email`, o que a pessoa
já lê no primeiro parágrafo da própria conta, e viaja como **rótulo**, sem
`motivo`, `vence_em` ou `assinante` junto.

### E o blog era a QUARTA casca

O menu do blog não tinha o próprio blog. Faltar justo ali é o pior dos casos:
quem está lendo um post não tem como voltar para a lista sem o botão de voltar
do navegador. A régua passou a medir as quatro telas — site, ferramenta, conta e
blog — e as quatro batem: logo em x=272, menu terminando em 1168, cabeçalho e
rodapé de 940.

## A caixa de anotação voltou — e agora ela diz que guardou

A versão antiga saiu por um motivo verdadeiro: **"confusa, e não ajuda"**. Vale
escrever o que exatamente era confuso, porque é a lista do que esta versão
precisou consertar para poder voltar.

Era um campo de **uma linha**. Uma linha ensina a escrever pouco — e o que se
pede ali ("o que aconteceu nesta tela") não cabe em quarenta caracteres.

Não dizia **sobre o quê**. Marcar um passo e acrescentar uma tela àquele passo
são dois gestos diferentes que abriam o mesmo campo vazio: escrever ali era
apostar em qual dos dois quadros o texto ia parar.

E não tinha **botão nenhum**. O texto era guardado sozinho, em algum momento que
a pessoa não via. Guardar virava um ato de fé — e a fé é o que quebra quando a
aba fecha.

### O que ela é agora

Ela aparece **quando há o que comentar**, e não antes: marcar um passo ou
acrescentar uma tela é o que a acende. Antes disso ela não existe na tela, e é
por isso que ela não confunde mais quem ainda não marcou nada.

Ela **se apresenta**: *"Anotação do Passo 2"* quando o quadro abre um passo,
*"Tela 2 do Passo 2"* quando ele é mais uma tela do passo em curso. A distinção
não é enfeite — o primeiro quadro de um passo vira o TÍTULO do passo no
documento, e os outros viram legenda. São dois textos com destinos diferentes, e
agora a caixa diz qual dos dois está sendo escrito.

O **botão tem três estados**, e é ele a resposta para "ele salvou?":

| estado | o que quer dizer |
|---|---|
| desligado | não há nada novo para guardar |
| cheio, "Salvar anotação" | há texto escrito esperando |
| contorno, "✓ Salvo" | está no quadro |

E ao lado do botão está **escrito**, em palavras: *"Anotação salva em: Passo 2.
Ela sai no documento."* — com o nome CURTO do alvo. A primeira versão da frase
repetia o rótulo inteiro e saía *"salva em: Anotação do Passo 2 — descreva o que
aconteceu"*, que manda descrever o que a pessoa acabou de descrever.

### A perda silenciosa

Digitar, não apertar Salvar e marcar o próximo passo. Este é o único defeito
desta tela que o produto não pode ter, porque ele **não avisa**: a pessoa
descobre o buraco quando abre o documento, horas depois, e não tem como saber
qual texto era.

`anotApontar` guarda o que estava escrito ANTES de trocar de alvo. A régua cobra
exatamente isso: escreve na tela 2, aperta "marcar" sem salvar, e conta as
anotações nos quadros — têm que ser duas.

### E na janelinha também

Durante a gravação a aba do produto está **atrás** da tela compartilhada. Um
campo que só existe lá é um campo que não existe — foi o argumento que levou o
"marcar" e o "pausar" para a janelinha, e ele vale igual para o texto. Os dois
campos mostram o mesmo conteúdo e chamam a mesma função: o texto mora no quadro,
não em nenhum dos dois.

Duas coisas saíram daí:

**A confirmação nascia invisível.** O `notaMsg` tinha a classe `.pe`, e
`body.gravando .pe{display:none}` esconde aquela família durante a gravação —
que é o único momento em que essa frase é escrita. Dizer "salvei" numa linha
que não aparece é o mesmo que não dizer. Ela ganhou classe própria.

**A janela cresceu 22px**, de 278 para 300. O bloco novo — rótulo, duas linhas
de texto, botão e confirmação — custa mais do que o campo de uma linha que
havia ali. A alternativa era tirar 2px do respiro de cada botão existente para
pagar a conta, e isso é degradação silenciosa de tudo o mais. O que foi feito
sem custo para os outros: o bloco foi **embrulhado** (gasta o respiro do corpo
uma vez em vez de quatro), botão e confirmação foram para a **mesma linha**, e
na janelinha o rótulo usa o nome curto e a confirmação tem duas palavras. Isso
devolveu 24 dos 46px; os 22 restantes a janela pagou.

O teto do `testes/janelinha.mjs` subiu junto, com o motivo escrito ao lado —
para que a próxima subida precise de um motivo tão bom quanto.

### E, no fim, o documento

É a razão de tudo isto, e é a última afirmação da régua: `testes/anotacao.mjs`
grava, escreve três anotações, baixa o `.docx` e lê o `word/document.xml`. As
três estão lá. O PDF e o `.zip` leem o mesmo `f.nota` — é o caminho que o
`testes/evidencia.mjs` já cobrava.
