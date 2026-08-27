# Build D — a tela começa no trabalho

CP-01, CP-02, CP-09, CA-04 e CA-06.

**Duas coisas aqui não são o que a auditoria pediu — são o que você corrigiu.**
Estão marcadas abaixo.

## Campo

### A rota começa logo depois do resumo (CP-01)

Antes do primeiro cartão havia cinco áreas para rolar, de pé, com o balde na
outra mão: convite de instalação, briefing com três ações, pedido de material e
cadastro de jazigo.

Desceram para **"Mais opções"**, depois da lista: o convite de instalar o app,
o pedido de material e o assistente (falar com o apoio, puxar mais, encerrar o
dia). Encerrar o dia é a última coisa que ela faz — morar antes da lista era
esquisito de qualquer forma.

> **Sua correção (27/08):** *"e no aplicativo de campo eu uso cadastrar
> jazigos"*.
>
> A auditoria mandava **Cadastrar jazigo** para "Mais opções" junto com o
> resto. Ele **ficou**, e ficou antes da lista. Ferramenta que se usa todo dia
> não é ferramenta ocasional.

Uma coisa subiu em vez de descer: **o que está faltando**. Vinha dentro do
assistente; agora é uma linha no topo, ao lado de "Hoje: Quadra 1 — Ruas 3, 4 e
5". Saber que acabou a água antes de andar até a quadra é diferente de
descobrir lá.

### "Não deu para fazer" saiu de perto do polegar (CP-02)

Ficava no mesmo bloco da ação principal, mesma largura, mesmo peso — três
caminhos visíveis, e a saída de exceção roubando espaço de quem só quer lavar o
jazigo. Virou um link discreto embaixo, longe do dedo que vai na foto.

### Uma foto grande, o resto em "ver mais" (CP-09)

Eram três miniaturas de 104px em carrossel. Ajudavam a reconhecer o jazigo — e
por isso ficam —, mas empurravam a ação para baixo: numa rota longa o próximo
cartão estava sempre a uma rolagem de distância. E 104px não serve para
reconhecer lápide no sol.

**O ganho está em qual foto é a grande, e isso muda com o momento:**

| | foto principal | por quê |
|---|---|---|
| antes de começar | **onde fica** | a de longe, com os vizinhos — é a que acha o túmulo no corredor |
| depois de começar | **antes (hoje)** | ela já achou o jazigo; agora o que importa é comparar |

## Painel

### Famílias: busca e três atalhos (CA-04)

Antes da lista havia três abas, cinco etapas, busca, situação, quadra, rua,
periodicidade, vencimento, ordenação, teste e limpar — uma central de filtros
para atravessar toda vez que a pergunta era *"quem está devendo?"*.

Agora: busca, e três atalhos — **Em aberto**, **Cadastro incompleto**,
**Próxima lavagem**.

Os filtros **não saíram**. Eles servem, e quem monta uma cobrança por quadra
precisa deles. Desceram para "Mais filtros", que **abre sozinho quando algum
está em uso** — filtro escondido e ativo é a lista curta sem explicação, e a
pessoa procurando a família que "sumiu".

### Agenda: o trabalho antes da máquina que o fabrica (CA-06)

> **Sua correção (27/08):** *"tem decisões importantes no admin com relação a
> agenda de limpeza, considere elas"*.
>
> A auditoria pedia uma **segunda tela** — "Planejar agenda" — com gerar,
> reorganizar e diagnosticar atrás de uma ação secundária. Não foi feito assim.
> São decisões que você toma olhando o trabalho, e um segundo clique entre a
> pergunta e a resposta é pior do que a rolagem.

O conserto virou de **ordem**, não de porta. "Gerar limpezas" vivia **entre o
resumo e a lista dos dias**: para ver o que seria lavado amanhã era preciso
atravessar a máquina que fabrica a agenda. Agora o trabalho vem primeiro, e a
máquina fica no fim da mesma tela — **inteira e aberta**, no lugar em que ela
é de fato usada: depois de olhar o que já existe.

**O que continua em cima de tudo:** a saúde do roteiro. Ela não é planejamento
— é o aviso de que o que está na tela abaixo já não vale, e isso precisa ser
lido antes, não depois.

E o texto do vazio mudou junto: dizia *"Gere as limpezas aqui em cima"*, e
agora aponta para o fim da tela. Texto que aponta para onde a coisa não está é
pior do que texto nenhum.

## Provas

15 guardas novas, entre elas duas que existem só para segurar as suas
correções contra uma releitura futura da auditoria:

- **cadastrar jazigo NÃO foi para "Mais opções"** — compara a posição das duas
  no arquivo;
- **a máquina da agenda continua na mesma tela, aberta** — reprova se alguém a
  puser dentro de um `<details>` ou de uma tela nova.

As outras: a rota vem antes das ferramentas; o que está faltando continua no
topo; a foto principal muda depois de começar; os filtros abrem sozinhos quando
algum está em uso; a saúde do roteiro continua acima da lista.

`npm run ci` verde: 253 testes, placar igual à produção. Sem migração.

## Onde o roadmap está

| Build | |
|---|---|
| A — falha não pode parecer vazio | entregue |
| B — o campo não perde trabalho | entregue |
| C — uma porta só para o que não tem volta | entregue |
| **D — a tela começa no trabalho** | **entregue** |
| E — vocabulário e casa arrumada | depende de você |

**O Build E começa com uma pergunta sua, não com código:** fixar as cinco
palavras — `a receber`, `recebido`, `a identificar`, `conciliado`,
`saldo da família`. O Financeiro como funil (CA-09) é essas palavras em ordem;
sem elas eu escolho sozinho e você herda a escolha.

Continua guardado, também esperando você: o **"Fazer este agora"** não é
prioridade e parece que é (ver `ROADMAP_UX.md`).
