# Jira e a conta que falta

Escrito em 15/08/2026, depois de duas perguntas que têm a mesma raiz: *"a falta do login é bem
estranha em tempos de SaaS"* e *"o pessoal usa Jira como plano de testes, dá para integrar?"*

As duas pedem um pedacinho de servidor. A decisão foi cruzar essa linha — **com a linha desenhada
com precisão.**

---

## 1. O reenquadramento que importa

A promessa de hoje é *"não temos seus arquivos porque não temos servidor"*. É verdadeira e é forte,
mas ela responde a uma pergunta que a segurança da informação **não faz**. O que eles perguntam é:
**o que o seu servidor guarda?**

"Não temos servidor" é uma resposta que impressiona um desenvolvedor e deixa um comprador
corporativo desconfortável — porque não é assim que nenhum fornecedor dele funciona. Já:

> Temos um servidor de conta e licença. Ele guarda o e-mail de quem comprou e o que foi comprado.
> **Ele nunca recebe vídeo, áudio, imagem, transcrição ou documento** — esses continuam sendo
> processados no navegador de quem usa, e dá para conferir com o F12.

…é uma resposta **normal**, que cabe num formulário de avaliação de fornecedor, e que continua
sendo o argumento mais forte do mercado. A frase não fica mais fraca. Fica mais fácil de comprar.

## 2. O que muda, e o que não muda

**Não muda:** a ferramenta continua **sem login**. Abrir, gravar, gerar e baixar sem conta nenhuma —
o funil de cima e a versão offline dependem disso, e um login obrigatório mataria os dois no mesmo
dia. Nenhum conteúdo passa a sair da máquina.

**Muda:** quem **compra** ganha uma área. Entra por link mágico no e-mail (sem senha para vazar),
vê a licença, os assentos, reemite a chave que perdeu e revoga a de quem saiu do time. É o que a
chave sozinha não sabe fazer, e é a única lacuna real do desenho sem conta.

Um efeito colateral que vale: **hoje não dá para revogar nada.** Chave é chave. O portal resolve
isso — e resolver isso é o que permite vender para uma empresa que tem rotatividade.

## 3. Jira — o que dá, o que não dá, e por quê

Pesquisado em 15/08/2026, na documentação da Atlassian:

- **A API do Jira Cloud aceita chamada direta do navegador.** `api.atlassian.com` faz *CORS
  whitelisting* justamente para permitir requisições de aplicações que rodam no navegador, com
  token Bearer. Anexar um arquivo num chamado a partir da aba, sem passar por nós, é possível.
- **A troca do código por token exige `client_secret`.** O fluxo OAuth 2.0 (3LO) da Atlassian não
  documenta PKCE para cliente público. Ou seja: existe **um** passo que não pode acontecer no
  navegador — e ele precisa de uma função nossa.

O desenho fica igual ao do Google Drive, com uma diferença a favor: **a função só vê o código do
OAuth.** O PDF vai do navegador direto para o Atlassian. Uma função serverless de vinte linhas na
Vercel, que não guarda nada.

Para quem roda **Jira Data Center** (ainda comum em empresa grande no Brasil) existe um caminho sem
servidor nenhum: o administrador libera a origem no CORS e a pessoa usa um token pessoal. Vale
perguntar qual dos dois é o caso antes de assumir.

E um detalhe que decide o alvo: em time que usa **Xray** ou **Zephyr**, o plano de teste não é um
chamado comum — a evidência vai num *Test Execution*, e essas ferramentas têm API própria.
**Perguntar antes de construir.**

---

## 4. A ordem, e o que já está pronto

### Feito hoje, sem servidor nenhum

**O documento encaixa no Jira sem integração.** O nome do arquivo já carrega o caso e a chave do
chamado — `evidencia-CT-014-Criar-pedido-NAT-1234.docx` se explica sozinho na lista de anexos, que é
onde alguém vai procurá-lo daqui a três meses. E entrou o botão **Resumo para o Jira**: o texto sai
na marcação de wiki que o Jira entende, com a tabela de passos, tempo decorrido e hora de relógio,
pronto para colar no comentário. Arrastar o PDF ao lado leva três segundos.

**Link já preenchido.** `?modelo=evidencia&caso=CT-014&chamado=NAT-1234&sistema=S4P/100` — uma
automação do Jira, uma planilha ou o próprio chamado mandam o link pronto, e quem executa não
digita nada. É o que faz um time inteiro produzir evidência no mesmo padrão sem ninguém ser
treinado. Parâmetro inválido é ignorado em silêncio, e a tela avisa quantos campos vieram do link —
para ninguém achar que a ferramenta adivinhou.

Junto saiu um defeito antigo: a coluna de hora por passo, no CSV, tinha o rótulo **"Início da
gravação"**. Numa evidência, uma coluna que diz "início da gravação" com uma hora diferente em cada
linha é pior que não ter coluna. Virou "Hora de relógio", e "Hora" virou "Tempo decorrido".

### A seguir, nesta ordem

1. **Anexar no chamado de verdade** — botão que sobe o PDF para o Jira por OAuth. Precisa da função
   de troca de token. É o item que transforma "ferramenta que eu uso" em "ferramenta que está no
   nosso processo".
2. **Portal do cliente** — link mágico, licença, assentos, revogação. Supabase, que já está no ar.
3. **Descobrir o alvo certo** na segunda: Jira puro, Xray ou Zephyr. Uma pergunta na reunião
   economiza uma semana de código no lugar errado.

---

## 5. É Zephyr — e isso muda a recomendação

Confirmado com o Leandro em 15/08/2026: o cliente usa **Zephyr**. Pesquisado no mesmo dia, e a
descoberta inverte a ordem que eu tinha proposto.

**O Zephyr Scale Cloud aparentemente não faz CORS.** Há pedido público de clientes na comunidade da
SmartBear pedindo que `api.zephyrscale.smartbear.com` libere origens de navegador, e ele ficou sem
resposta oficial. Se o navegador não pode chamar a API direto, a única forma de anexar seria o
documento **passar pelo nosso servidor**.

Isso não é um detalhe de implementação. É a diferença entre os dois caminhos:

| | quem carrega o documento | a promessa |
|---|---|---|
| Jira Cloud | navegador → Atlassian. Nossa função só troca o token do OAuth | **intacta** |
| Zephyr Scale Cloud | navegador → **nós** → SmartBear | **quebrada** |

**Então não construo o anexo automático no Zephyr.** Um proxy que recebe evidência de teste de
cliente é exatamente o que a página de segurança promete que não existe, e trocar isso por um botão
de conveniência seria vender a única vantagem estrutural do produto por um clique.

### O que a restrição empurra para cima

A camada do **link** — que era o degrau 2 da lista — vira o degrau 1, e é o Leandro quem enxergou
primeiro: *"essa camada de copiar o link público serve para o gratuito e nos demais sistemas de
teste? isso seria um baita diferencial para o gratuito."* Serve, e é.

Um link não depende de API, de CORS, de permissão nem de projeto aprovado. Funciona no **Zephyr**,
no **Xray**, no **Jira** puro, no **TestRail**, no **Azure DevOps**, no **qTest** e numa planilha —
todos ao mesmo tempo, sem construir nada para nenhum. Onde a integração é bloqueada pela TI, ele
continua funcionando. É a única "integração" que atravessa a política de segurança de qualquer
empresa, porque não é integração.

**E fica no plano gratuito**, o que contraria o que foi publicado na página de preços na véspera — o
"link de equipe pré-configurado" estava listado no plano Time. A correção foi feita e o raciocínio
é de distribuição: o link é o que faz o Walkstamp caber no processo que a equipe já tem, e uma
ferramenta que só funciona sozinha não serve para equipe nenhuma. Cobrar por ele mataria a cunha
justamente onde ela entra. O que continua pago é o que um indivíduo não precisa e uma empresa sim:
marca do cliente no documento, vocabulário compartilhado, pacote offline para a TI, modelo de
documento próprio.

### O que foi construído

Uma página pública, `/link`, nos três idiomas: o coordenador preenche caso, chamado, sistema, modelo
de saída e idioma, e leva o endereço pronto para colar no Zephyr. Sem cadastro e sem licença.

A página também explica as duas formas de usar dentro do Zephyr — colado num passo do *test script*,
ou montado por automação a partir dos campos do próprio caso — e diz o que o link **não** faz: ele
não anexa nada de volta. O caminho de volta continua sendo arrastar o arquivo, três segundos, e
funciona em qualquer ferramenta, inclusive nas que a empresa não deixa integrar.

### O que ainda vale perguntar na segunda

- **Zephyr Scale ou Zephyr Squad?** São produtos diferentes, com APIs diferentes.
- **Cloud ou Data Center?** No Data Center o administrador deles pode liberar CORS, e aí o anexo
  automático volta a ser possível **sem servidor nosso** — que é o único desenho que eu aceitaria.
- **Onde a evidência é anexada hoje?** Na execução do Zephyr, ou no chamado do Jira ligado a ela? Se
  for no chamado, o caminho do Jira Cloud (que tem CORS) resolve, e a Zephyr nem precisa entrar.
