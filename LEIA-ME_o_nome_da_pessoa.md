# O nome da pessoa se escreve direito

Duas coisas: a **caixa** do nome no cadastro, e o **primeiro nome** na mensagem.

```
110 dos 339 contatos estavam em CAIXA ALTA   (um terço)
 66 das 363 famílias, também
```

Como o nome entra nas mensagens, um terço das famílias recebia **"Olá,
JOSEANE"**. Não é detalhe de tela: é a casa gritando com quem está de luto.

---

## Antes de mexer, li o que estava lá

```
JOSE ANTONIO (DONA DOMINGAS)      Paulo Primo Da Maria Japonesa
CLAUDIA FILHA GISELDA             Jose Do Lado Do Delabeta
CELIA FRENTE ABIGAIL              Idalina Na Frente Do Bozato
```

O campo **não guarda só um nome**: guarda **a referência que acha a pessoa no
cemitério**. *"Celia, a da frente da Abigail."* Isso é conhecimento de campo, e
apagar seria destruir o único jeito de saber de quem se trata.

Então a normalização **só mexe em maiúscula e espaço**. Nenhuma palavra sai,
nenhuma entra, a ordem não muda — e há um teste que prova isso para qualquer
entrada, comparando a contagem de palavras antes e depois.

E é exatamente por isso que a segunda metade do seu pedido está certa: na
mensagem vai **só o primeiro nome**. *"Olá, Paulo"* — nunca *"Olá, Paulo Primo
Da Maria Japonesa"*, que seria constrangedor.

### O que ficou

```
Carlos Cesar Marocci Preto Veleiro  →  "Olá, Carlos."
Paulo Primo da Maria Japonesa       →  "Olá, Paulo."
Jose Antonio (Dona Domingas)        →  "Olá, Jose."
Idalina Na Frente do Bozato         →  "Olá, Idalina."
```

Em produção agora: **0 nomes em caixa alta**, nos contatos e nas famílias. 132
contatos e 141 famílias foram arrumados.

---

## Por que gatilho, e não conserto na tela

São **cinco portas** que escrevem nome: a ficha da família, o contato do site
virando família (de hoje de manhã), a importação de planilha, o espelho do
WhatsApp e o cadastro pelo campo. Consertar numa e deixar quatro escrevendo
torto é o defeito de forma de sempre.

O gatilho pega todas — inclusive as que ainda não existem. E pega **edição**,
não só criação: sem isso, a próxima vez que alguém salvasse a ficha, a caixa
alta voltava.

---

## O "primeiro nome" tinha seis implementações

Aqui, em `ativacao.ts`, em `servico.ts`, em `campanha.ts`, na tela dos contatos
do site e nas duas rotas do campo. **E elas já discordavam:**

- cinco cortavam no primeiro espaço e devolviam **"Sr."** como saudação;
- `campanha.ts` usava `split(" ")`, que em *"Ana  Maria"* (dois espaços)
  devolvia string vazia — a mensagem saía **"Olá, !"**;
- a régua montava a saudação com `split_part`, uma sétima regra.

Agora é **uma só** em TypeScript (`mensagens.ts`), e a gêmea no banco
(`sureya_primeiro_nome`). As duas têm de responder igual caso a caso, e isso é
verificado dos dois lados — porque a **prévia que você lê antes de liberar é
renderizada pelo banco**, e o envio passa pelo TypeScript. Se discordassem,
você aprovaria um texto e a família receberia outro. Sem erro, sem log.

### Um caso que a regra antiga errava

Existem quatro contatos começando por tratamento, escritos de quatro formas:
**"Dona"**, **"Dra"**, **"Sr"**, **"Sr."**. A regra só conhecia a forma **com
ponto** — então *"Sr João"* virava **"Olá, Sr"** e *"Dra Marta"* virava **"Olá,
Dra"**. A exceção existia justamente para evitar isso, e pegava metade dos
casos.

---

## Um teste antigo reprovou, e estava certo

`registro_painel.sql` esperava o responsável gravado como **`CLECIA`**. Com o
gatilho, virou **`Clecia`** — e o teste reprovou o build.

Atualizei a expectativa e **escrevi no arquivo por quê**: a mudança é o
conserto, não um ajuste para o teste passar. O que aquele teste garante
continua igual — o responsável aparece pelo nome, e não como "exatamente um".

---

22 verificações em `testes/nome_proprio.sql` e 10 no simulador.
`npm run ci` verde: **227 testes**, 120 migrations, placar igual à produção.
