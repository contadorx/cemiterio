# Decisões da responsável

Decisões de negócio que valem acima de auditoria, roadmap e da minha leitura do
código. Quando uma delas colidir com uma recomendação, **a decisão ganha** — e
eu paro e pergunto em vez de aplicar a recomendação.

Cada entrada registra: a decisão, quem decidiu, quando, e **onde ela vai bater**.

---

## D-01 · A dívida é da família, com um responsável financeiro

> *"É a família, mas sempre tem um responsável financeiro."*

**Quem:** responsável · **Quando:** 22/08/2026 · **Estado:** implementada

`conta_corrente` é a fonte da verdade, no grão da família. `movimentos` vira
legado. O responsável não é quem *deve* — é para **quem se fala**: uma dívida,
uma cobrança.

Implementação e consequências em `BUILD_4.md` §8.

---

## D-02 · O botão de cadastrar jazigo NÃO sai do campo

**Quem:** responsável · **Quando:** 22/08/2026 · **Estado:** anotada, nada a fazer agora

O botão **continua no campo**. Não remover.

Se um build precisar mexer nele — mover, recolher, esconder atrás de outra
tela — **eu pergunto antes**, e não aplico por conta própria.

### Onde isso vai aparecer

A auditoria de UX do campo pede, em dois lugares, que ferramentas ocasionais
saiam do caminho da rota:

| Onde | O que a auditoria pede |
|---|---|
| `AUDITORIA_UX_CAMPO.md` · CP-01 (linha ~113) | reprova a tela porque cadastro de jazigo é uma das cinco áreas antes do primeiro cartão |
| `AUDITORIA_UX_CAMPO.md` · §7, item 4 (linha ~250) | *"Uma área recolhida `Mais opções` contém apoio, materiais, **cadastrar jazigo** e puxar mais"* |

Ou seja: a auditoria **não pede para remover** — pede para **recolher** dentro
de `Mais opções`. São coisas diferentes, e é por isso que a pergunta importa.
Quando o build de UX do campo chegar, a pergunta a fazer é:

> Recolher para dentro de `Mais opções` já é tirar do campo, ou o botão tem de
> continuar visível na primeira tela?

Até você responder, **fica como está**.
---

## D-03 · As fotos ficam com link público

> *"Vamos deixar público para não complicar. A maioria dos usuários são pessoas
> idosas, e pedir mais segurança desequilibra o acesso."*

**Quem:** responsável · **Quando:** 22/08/2026 · **Estado:** vale; entrega 3 do Build 6 sai do escopo

A foto da limpeza vai para a família por link direto no WhatsApp. A família
toca e abre — sem login, sem senha, sem app. **É assim que continua.**

O roadmap pedia buckets privados com URL assinada (Build 6, entrega 3). Essa
entrega está **encerrada por decisão**, não esquecida.

### O que exatamente está sendo aceito (medido em 22/08)

Não é "qualquer um vê as fotos de todo mundo". Conferi:

| | |
|---|---|
| RLS em `storage.objects` | **ligada**, com zero policies |
| Listar o conteúdo do balde | **não dá** — a listagem passa por RLS e volta vazia |
| Caminho do arquivo | `{org}/{servicoId}/depois-{timestamp}.jpg` — o `servicoId` é UUID |
| Arquivos hoje | 409 em `servicos`, 1 em `comprovantes` |

Ou seja: **não dá para descobrir os links, só para usar um link que você já
tem.** O que está sendo aceito é que quem receber o link — encaminhado num
grupo de família, por exemplo — abre a foto, e para sempre.

Para foto de túmulo limpo, é um risco proporcional. É essa a decisão.

### O ponto que continua aberto, e por quê

O balde `comprovantes` guarda **comprovante de Pix** — documento de banco, com
nome, valor e às vezes pedaço de CPF. É outra classe de coisa.

E ele não tem o problema de acesso que motivou a decisão: a família **envia** o
comprovante pelo WhatsApp e nunca precisa abrir de volta. Quem lê é só o painel.
Tornar **esse** balde privado não faz idoso nenhum digitar senha — não muda nada
para ninguém, exceto para quem achar o link.

Hoje é 1 arquivo. Se um dia você quiser, é uma migration pequena. Enquanto não
disser, fica público como o resto.

### O que isso obriga

A política de retenção e consentimento (Build 6, entrega 4) precisa **dizer isso
por escrito**: as fotos ficam acessíveis por link permanente a quem o tiver.
Sem esse parágrafo, a política afirma uma proteção que o sistema não faz.

---

## D-04 · A chave de envio de fotos é da FAMÍLIA, e a geral é só o padrão

**Pedido, 22/08:** *"queria uma chave para ligar e desligar o envio de fotos do
início e do fim, uma chave geral e uma por família que sobrepõe — claro, eu
quero ver para confirmar a atividade de campo."*

**O que foi construído (0085):**

| | |
|---|---|
| `orgs.enviar_fotos_familia` | a chave geral, ligada de fábrica |
| `familias.enviar_fotos` | por família — `null` = segue a geral, e **sobrepõe** nos dois sentidos |
| Onde a regra age | `sureya_envia_fotos()`, consultada pelo gatilho da fila **e** pelo envio automático |

**Três estados, não dois.** `null` não é "desligado": é "segue a casa". Guardar
`false` no lugar de nulo faria toda família cadastrada antes desta migration
parar de receber foto no dia em que alguém religasse a geral.

**O que a chave NÃO desliga.** A limpeza acontece inteira: débito, extrato,
remuneração, material, e as duas fotos gravadas no serviço e visíveis no painel.
É exatamente o que ela pediu — conferir o trabalho de campo sem a família
receber. O que para é a mensagem nascer.

**Por que não reusei `disparos_ativos`.** Aquela é chave de emergência: corta
todo envio automático de todo mundo, e é por cliente (`envio_automatico`), não
por família. Esta é de política, tem o grão da carteira, e vale também para a
fila de liberação — que é manual e não passa por aqueles freios.

---

## D-05 · A seta continua, e o mapa entra ao lado dela

**Do campo, 22/08:** *"a navegação foi bem ruim, as setas ficam malucas, talvez
um mapa de ponto a ponto seja melhor."*

Antes de trocar a seta pelo mapa, fui ver por que ela estava maluca. **Não era o
GPS.** O ângulo ia de 0 a 360 e a seta tem `transition: transform`: ao cruzar o
norte, 359° → 1° é animado pelo navegador como 358° para trás. Uma tremida de
dois graus virava quase uma volta na tela. Isso está consertado
(`desenrolarAngulo`), junto com a leitura velha (`maximumAge: 0` e média
ponderada pela precisão) e com a seta que apontava o ruído quando ela estava
parada (agora congela e diz que congelou).

**Mesmo consertada, a seta tem um limite que não se conserta:** ela precisa
saber para onde o APARELHO aponta. Sem bússola calibrada, e parada, essa
informação não existe — e boa parte dos Android não entrega orientação absoluta.

Por isso o mapa entrou **ao lado**, não no lugar: norte para cima, imagem aérea
atrás, os dois pontos e a linha entre eles. Não depende de bússola nenhuma. Abre
sozinho acima de 25 m, que é a distância em que "para que lado eu ando?" ainda é
a pergunta; perto, quem manda é a foto da lápide.

**A linha é reta, e é dita como reta na tela.** Não conheço os muros nem onde há
passagem entre quadras. Uma curva inventada mandaria contornar por onde não se
passa — pior que a reta honesta.

---

## D-06 · A foto é um gesto, não um relatório mensal

**Pedido, 22/08:** *"preciso que tenha a indicação da última data de foto
enviada para decidir ou não enviar — não quero manter a frequência toda data."*

**O que NÃO foi construído:** nenhuma regra automática. Não há bloqueio, não há
"a cada N dias o sistema segura a mensagem". A decisão continua sendo dela, uma
mensagem por vez — o que faltava era o número em cima do qual decidir.

**O que foi construído (0087):** toda mensagem de foto na fila mostra, acima das
fotos, quando aquela **família** recebeu foto pela última vez, há quantos dias, e
quantas já recebeu. Para família com mais de uma pedra (são cinco hoje), mostra
também a data **deste jazigo** quando ela difere — "recebeu há 8 dias" pode ter
sido da outra pedra, e aí a resposta muda.

**Nunca recebeu é outra coisa que recebeu há muito tempo.** A view devolve
ausência de linha, não zero, e a tela diz "Primeira foto desta família" em verde.
Tratar as duas como a mesma coisa faria a tela afirmar que a família recebeu foto
hoje quando ela nunca recebeu nenhuma.

**Dois caminhos, não um.** A foto chega à família pela fila de liberação
(`decidido_em`, que só sobrevive em quem saiu mesmo) **ou** pelo envio automático
da conclusão (`servicos.notificado_cliente`, carimbado por `data_executada`).
Olhar só a fila diria "nunca recebeu" para quem recebeu pelo outro caminho — data
errada com cara de certa, que é pior que data nenhuma.

**O aviso amarelo tem um número que a casa escolhe** (Config › Mensagens, padrão
30 dias, zero desliga). Ele só pinta a linha, para achar de relance numa fila de
vinte as que provavelmente vão ser descartadas. A data aparece com aviso ou sem.

---

## D-07 · A limpeza anotada pelo painel passa pela mesma porta do campo

**Pedido, 22/08:** *"queria ter como cadastrar um serviço realizado pelo painel,
com data e foto, para ir para fila e registrar lavagem."*

Ao ir construir, achei que já existia — e existia pela metade. `POST /api/servico`
com `dataExecutada` criava o serviço `executado` e **inseria em `conta_corrente`
com um insert próprio**. Ou seja: uma segunda implementação da regra de dinheiro,
exatamente o que a 0073 veio acabar ao criar a porta única `sureya_lancar`. Além
disso não aceitava foto (logo, a família nunca recebia), não calculava
remuneração da executora e não baixava material.

**Uma limpeza registrada pelo painel valia menos que a mesma limpeza registrada
pelo campo, e a diferença não aparecia em tela nenhuma.**

A porta nova (`/api/servico/registrar-feito`) cria o serviço **já `executado`,
com a data informada**, e chama `sureya_concluir_lavagem` — a mesma transação do
campo. Criar já executado não é atalho: a função é convergente e, vendo o serviço
executado, ela **não reescreve o status** — e é dentro desse `update` que mora
`data_executada = now()`. Criar pendente apagaria a data retroativa. É o único
jeito de a data sobreviver sem acrescentar parâmetro à função, que é o que criaria
a ambiguidade de sobrecarga que já custou caro aqui.

**A foto é opcional.** Sem ela a limpeza é registrada inteira — cobrança,
extrato, remuneração, material, histórico, urgência do jazigo — e só não há
mensagem para aprovar. A tela diz isso antes e depois de salvar.

**Nada é enviado.** `notificarFamilia` não é chamada: registro retroativo entra
na fila e espera aprovação. Uma limpeza de três semanas atrás não deve disparar
mensagem sozinha.

**`sureya_datar_lavagem` (0088)** fecha o buraco que sobrou: a transação carimba
`current_date` nos lançamentos. Numa limpeza do mês corrente não muda nada; numa
de agosto anotada em setembro, muda a **competência** — e competência errada é
cobrança no mês errado.

---

## D-08 · O lote da fila é sequencial, e dá para parar no meio

**Pedido:** *"na fila cria um marcar e enviar tudo."*

Caixa de seleção em cada cartão, "marcar todas", e — nascido do pedido anterior —
**"marcar só as N sem aviso"**, que exclui de uma vez as famílias que receberam
foto há menos dias que o limiar da casa. Sem esse atalho, marcar todas e
desmarcar as amarelas uma a uma é justamente o trabalho que o lote deveria estar
tirando.

**Sequencial, não em paralelo.** Cada envio sobe as fotos pela Evolution — são
megabytes por mensagem, na mesma linha de WhatsApp dela. Vinte de uma vez
derrubaria a instância, e a fila voltaria com vinte erros de rede que não são
erros de verdade.

**Dá para parar no meio**, e o que já saiu não volta — não há como desfazer um
WhatsApp. O resumo do fim nomeia **quem** falhou, não só quantas: "18 de 20"
sem dizer quais duas obriga a conferir as vinte na mão.

---

## D-09 · Organização nova nascia sem os textos da casa

Não foi pedido: apareceu escrevendo o teste da D-07, num banco limpo. O
povoamento da 0085 é um laço sobre as organizações que **existiam** no instante
em que ela rodou. Uma organização criada depois nasce sem modelo nenhum, e
`sureya_texto_modelo` cai na frase antiga — o mesmo bilhete de sistema que a
0085 inteira existiu para tirar do caminho.

Em produção há uma organização só, então nunca ia morder aqui. Ia morder na
primeira restauração de backup em ambiente novo, na homologação, e no dia em que
existir uma segunda operação — **em silêncio**, porque ninguém abre o cadastro de
textos para conferir se está vazio.

Fechado com gatilho (`trg_textos_iniciais`), e não com mais um bloco de
povoamento: bloco resolve hoje e quebra na próxima organização. A lista de textos
mora numa função só (`sureya_semear_textos`), que o gatilho e o povoamento das
antigas chamam — duas cópias da lista neste repositório seria o começo de duas
listas diferentes.

---

## D-10 · A família é a entidade; o contato é uma consequência

**O que ele disse, 22/08:** *"Tenho o jazigo e tenho família, e família é um
contato — o problema é que por vezes eu não tenho o contato. Preciso que a
família seja o NOME da família e que tenha contatos abaixo dela, que podem ou
não existir. Nos contatos tenho que ter um contato financeiro, que pode mudar ao
longo do tempo."*

**O que o banco dizia:** 298 famílias e **298 contatos — um para um, exato**. Não
era coincidência: `sureya_familia_para_cliente` (0062) criava uma família a cada
contato que nascia sem uma, batizada com o sobrenome dele. A família não era uma
entidade — era o apelido de um contato. E como `clientes.telefone` é NOT NULL,
**não havia caminho para cadastrar a família de quem não se tem telefone**. Daí
81 dos 204 jazigos capturados no campo, parados.

**A inversão (0091):**

| | antes | agora |
|---|---|---|
| quem nasce primeiro | o contato | a **família**, só com o nome |
| o jazigo aponta para | o contato | a **família** |
| `tumulos.cliente_id` | o vínculo | campo **derivado** — o contato financeiro atual, mantido pelo banco |
| quem paga | um booleano no contato | `familias.responsavel_id` + **log com data e motivo** |

`cliente_id` não sumiu de propósito: virar campo derivado é o que faz todo o
código que já o lê continuar funcionando, sem reescrever o sistema para o
cadastro destravar hoje.

**O efeito invisível que isto obrigou a consertar.**
`sureya_concluir_lavagem` decidia lançar o débito com
`if v_s.cliente_id is not null`. Família sem contato → `cliente_id` nulo → a
limpeza aconteceria, a foto sairia, e **a cobrança não existiria**, calada.
Quando o contato aparecesse meses depois, o histórico estaria vazio.

A dívida é da **família** desde a 0071 (D-01), e `conta_corrente.familia_id` já
era NOT NULL enquanto `cliente_id` era anulável: o teste certo sempre foi a
família. Corrigido — e é a conferência mais importante de
`testes/familia_sem_contato.sql`.

**Por substituição, e não recopiando a função.** São 274 linhas; copiá-las para
a migration cria uma segunda cópia no repositório, e cópia envelhece em
silêncio — a deriva que este banco já pagou caro três vezes. A migration lê a
definição viva, troca a condição e falha se não reconhecer o texto original.

**O log existe porque "muda ano após ano" é um fato com data.** Um campo sozinho
só sabe o presente, e a pergunta que aparece é sempre sobre o passado: *para quem
foi a cobrança de março?*

---

## D-11 · A limpeza não tem dono; quem começa, assume

**O que ele disse, 23/08:** *"Nos serviços está o nome da Nina — na verdade não
quero nomear. Limpeza é limpeza. No calendário posso ou não definir a usuária
que vai lavar, até porque tenho pessoas não fixas. Quero deixar que a limpeza
aconteça, e a possibilidade de definir em lote quem limpa na agenda."*

**O que o alocador fazia:** escrevia `executora_id: turno.userId` em toda
lavagem que agendava. Toda limpeza nascia com o nome de alguém colado nela —
o que pressupõe equipe fixa.

**Agora ele não toca no campo.** Três consequências, todas desejadas:

| | |
|---|---|
| serviço sem dono | aparece para **toda** a equipe — `/api/agenda/dia` e o briefing já devolviam `executora_id is null` |
| quem começa, assume | `sureya_iniciar_lavagem` (0068) já fazia `executora_id = coalesce(executora_id, quem_chamou)` |
| decisão de gente fica | o alocador não desfaz atribuição manual, do mesmo jeito que já respeita `fixado_em` |

Ou seja: **quem lavou deixa de ser um plano e passa a ser um fato**, registrado
no momento em que a pessoa toca em "começar". É o que serve para gente não fixa,
e é o que faz a remuneração ir para quem realmente trabalhou.

**A capacidade continua valendo.** Os turnos ainda dizem quantas limpezas cabem
no dia; o que saiu foi o nome no papel, não o limite.

**A ordem do dia virou do DIA.** Ela era numerada de 1 em diante **por pessoa** —
com duas ajudantes, duas listas começavam em "1" e a ordem deixava de ser um
roteiro. Agora é 1..N para o dia inteiro, que é a sequência em que se anda pelo
cemitério.

**Em lote, na agenda.** Caixa por linha, "marcar o dia" no cabeçalho de cada dia
(é como ela pensa: *"quinta é da Ana"*), e uma barra com a equipe ativa. A
primeira opção da lista é **"deixar em aberto"**, porque é o estado normal.
Serviço já executado fica fora da seleção: ali `executora_id` é o registro de
quem lavou, e reescrever pagaria uma pessoa pelo trabalho de outra.

---

### Um teste que passava por acaso

Ao trocar isso, o teste *"distribuiu entre as ajudantes ativas"* continuou verde
— e não deveria. Ele conferia
`new Set(agendados.map(s => s.executora_id)).size >= 2`, e passava com
`{null, undefined}`: dois "vazios" diferentes contam como dois elementos no
`Set`. Ele afirmava que a distribuição acontecia enquanto ninguém estava
atribuído.

Substituído por quatro conferências que cobram o comportamento de verdade: o
alocador não carimba ninguém, a capacidade da equipe ativa continua limitando o
dia, a atribuição manual sobrevive à alocação, e mesmo atribuída a lavagem entra
na rota.

---

## D-12 · A conversa volta, o CRM não

**O que ele pediu, 23/08:** *"Em Contatos quero que entre todas as conversas e
respostas de WhatsApp com o módulo de conversa que ficou escondido, somente de
contatos e celulares registrados. Isso vai facilitar a comunicação."* — e, em
seguida: *"inclua nesse os contatos do site também."*

**O que estava acontecendo.** `/painel/conversas` foi desligada junto com o
agente de IA — era tela de CRM, com abas de leads, rascunhos e gestão de
atendimento. Mas **o webhook nunca parou**: toda mensagem que chega continua
sendo gravada, o áudio continua sendo transcrito, e o que ela responde direto do
celular continua entrando como saída.

Ou seja: a conversa existia e ninguém conseguia ler. Medido em 23/08 — **15
conversas com mensagem, 5 delas esperando resposta**, invisíveis.

**"Somente de contatos e celulares registrados" já é como o sistema funciona**,
por construção e não por filtro:

| telefone | vira |
|---|---|
| reconhecido | `conversas` + `mensagens` |
| não reconhecido | `leads` — que é de onde vem o contato do site |

As duas fontes aparecem na mesma lista, porque as duas são gente com quem a casa
já tem contato. Quem não está em nenhum dos dois lugares não existe para esta
tela.

**Duas abas em Contatos:** *Esperando resposta* (a fila do site, que já existia)
e *Conversas* (o histórico, para ler e responder). Começa em "esperando" de
propósito: quem abre esta tela veio ver o que falta.

**Conversa sem mensagem não é conversa.** São 162 linhas em `conversas` e 15 com
mensagem — a tabela ganhou uma linha por família na época da IA, escrevendo
alguém ou não. Listar todas encheria a tela com 147 nomes vazios e as cinco que
importam sumiriam no meio. A lista mostra só quem já trocou mensagem, e o vazio
diz onde começar uma conversa nova.

**Enviar primeiro, gravar depois.** Ao contrário, um erro do WhatsApp deixaria no
histórico uma mensagem que a família nunca recebeu — e é justamente o histórico
que ela usa para decidir o que dizer em seguida. Se a mensagem sai e a gravação
falha, a tela diz **"foi enviada, não mande de novo"** em vez de fingir que nada
aconteceu.

**O que NÃO voltou:** rascunhos da IA, escalonamento, abas de gestão, resposta
automática. Nada sai sem alguém escrever e tocar em enviar — mesma regra da fila
de liberação, e pelo mesmo motivo.

**Na leitura, de onde veio a mensagem importa** e está escrito em cada balão:
áudio transcrito não é o que a pessoa digitou; o que saiu do celular dela não
passou por esta tela; e o que a IA respondeu na época do robô não foi ela.

---

## D-13 · Uma lavagem por jazigo por dia — e uma definição só de "fora do lugar"

**O que se mediu**, em produção, em 23/08/2026, antes de mexer em qualquer coisa:

| jazigo | data marcada | data que o plano pedia |
|---|---|---|
| Perrela | 24/08 | 01/08 |
| Perrela | 24/08 | 09/08 |
| Perrela | 24/08 | 17/08 |
| Perrela | 24/08 | 25/08 |
| Souza | 17/08 *(passou)* | 17/08 |
| Nagae | 17/08 *(passou)* | 17/08 |

Quatro lavagens do mesmo jazigo no mesmo dia, e duas paradas numa segunda-feira
que já tinha passado.

**Por que o botão "Reorganizar a agenda" não resolvia.** Não era intermitente,
era aritmética. A tela contava com uma regra e o banco movia com outra:

- o contador chamava de fora do lugar tudo que caísse em dia não trabalhado
  **ou** que já tivesse passado;
- `sureya_reorganizar_agenda` só mexia no que caísse em dia não trabalhado.

17/08/2026 foi uma **segunda-feira** — dia de trabalho. O contador via as duas
(estavam no passado); a função não via nenhuma. As duas respostas estavam certas
para perguntas diferentes, e por isso o aviso nunca podia zerar.

E havia um terceiro estado que ninguém contava nem movia: a pilha do Perrela.

**A decisão.** A regra passa a existir **uma vez**, no banco
(`sureya_agenda_fora_do_lugar`, 0092), e as duas pontas leem dela. A tela não
decide mais nada sobre isso — só pergunta. Uma lavagem está fora do lugar quando
está **atrasada**, **repetida no mesmo jazigo no mesmo dia**, ou **em dia que não
se trabalha**; e o aviso nomeia qual das três, porque são três conversas
diferentes.

**Uma lavagem por jazigo por dia** não é preferência de rota: é o que o serviço
é. Lavar o mesmo túmulo duas vezes na mesma manhã não entrega nada na segunda
vez, e a família é cobrada pelas duas. A regra entrou no alocador
(`src/lib/agenda.ts`) e como piso na função do banco.

**Por que nos dois lugares.** A função do banco sozinha não converge: as três
excedentes do Perrela têm data de plano no passado, então "o dia mais cedo
possível" é o **mesmo dia** para as três — elas voltavam para a fila empilhadas
do jeito que estavam, e cada clique repetia "3 movidas" para sempre. A função
garante o piso (não empilhar); o alocador escolhe **bem** o dia, porque é ele
que conhece capacidade, rua e serpentina.

**O alocador passou a enxergar o que não remexe.** Ele só reescreve o que está
`pendente` e solto, mas contava a capacidade do dia como se estivesse vazio — o
que já estava `agendado`, e o que alguém fixou à mão (D-04/0041), não ocupavam
lugar nenhum na conta. Um dia com 20 vagas e 12 lavagens marcadas recebia mais
20. Agora a ocupação existente entra na conta, por dia e por jazigo.

**O que o "reorganizar" faz e o que não faz.** Ele devolve as lavagens para
`pendente` com a data que o plano pedia — `data_plano`, nunca `data_prevista`,
que é reescrita pelo alocador a cada passada e faria a função ler a data que ela
mesma escreveu. Quem escolhe o dia é o alocador, que roda logo em seguida. Duas
cabeças decidindo o mesmo dia foi o que produziu a pilha.

---

## D-14 · A agenda abre pela família, não pelo contato

A linha da agenda mostrava jazigo, contato e valor — e escrevia `Q{quadra}` sobre
um código que já vinha `"Quadra 1"`, produzindo **"QQuadra 1"** em toda linha.

Faltavam as duas coisas que ela precisa para montar o dia:

- **a família**, que desde D-10 é a entidade: o contato pode não existir, ou ser
  outro no ano que vem. Uma agenda que abre pelo contato mostra o que muda e
  esconde o que fica;
- **a rua**, de onde sai a ordem do dia (0047). Sem ela, 1º, 2º e 3º parecem
  arbitrários — não dá para ver que são a mesma caminhada.

O prefixo da quadra passou a morar na API, não na tela: o nome de uma quadra é o
que o banco diz que ele é, e não pode haver duas opiniões sobre isso.

**O atraso virou número visível.** `atrasoDias` compara `data_plano` com o dia em
que a lavagem caiu. É o único sinal que denuncia a lavagem empurrada — antes ele
só aparecia quando a família reclamava.

**Gerar ganhou períodos curtos (3, 7, 14 dias).** Existiam só 30, 60 e 90: para
conferir se a régua de um jazigo estava certa era preciso despejar um trimestre
inteiro na agenda e limpar na mão depois. Gerando pouco, a janela da tela
acompanha o que foi gerado — senão o resultado aparece diluído em trinta dias e
parece que nada aconteceu.

**Os controles.** Eram quatro botões e uma caixa de seleção em toda linha, com
`Excluir` em vermelho sempre à vista: o que se faz todo dia (remarcar) tinha o
mesmo peso do que quase nunca se faz e não se desfaz. Ficou `Remarcar` à mostra e
o resto atrás de "mais".

**O estorno foi ligado.** A rota `/api/servico/[id]/estornar` existia e **nenhuma
tela a chamava** — a função estava escrita na página, completa, e nunca foi
ligada a um botão. Uma lavagem registrada por engano só se desfazia no banco.

---

## D-15 · O jazigo salvo que continuava órfão — e a última lavagem

**O que você viu:** salvava a família no jazigo, ele continuava aparecendo como
sem família. DAMO 2 era o exemplo.

**O que estava no banco.** O jazigo *Américo damo* (Q4-T6-010) estava
corretamente ligado à família **DAMO 2**. O `familia_id` estava lá. **O salvamento
sempre funcionou — a pergunta é que estava errada.**

Três telas perguntavam `cliente_id is null` para saber se o jazigo tinha família.
Desde a **D-10 / 0091**, `cliente_id` é o **contato**, derivado da família — e ele
é nulo justamente nas famílias que ainda não têm com quem falar, que são a razão
de a 0091 existir. O jazigo ficava preso na lista de órfãos para sempre.

Eram **6 jazigos** nesse estado em 23/08, todos na Quadra 4:

| jazigo | família |
|---|---|
| Generoso (Q4-R10-003) | GENEROSO MARGARIDA |
| Indefinido-RRua 10 (Q4-R10-007) | MARIA CATADORA |
| Bueno camargo (Q4-R11-004) | BUENO CAMARGO |
| Harles (Q4-R13-001) | BRANCO MAGRICELA |
| figueiredo (Q4-R13-002) | FIGUEIREDO |
| Américo damo (Q4-T6-010) | **DAMO 2** |

**Nenhum dado precisou ser corrigido.** Os seis somem da lista assim que o
código subir. Os três lugares: a lista de "vincular jazigo do campo"
(`/api/tumulos`), o filtro **Sem família** da tela de jazigos (`/api/jazigos`) e o
mapa (`/api/localizacao`), que dizia "sem família vinculada" olhando o nome do
contato.

A view `sureya_jazigos_sem_familia`, criada na 0091, já fazia a pergunta certa e
**não era usada por ninguém**. Passa a ser: a definição de "sem família" existe
uma vez só.

### A última lavagem

Não havia resposta em tela nenhuma para "quando este jazigo foi lavado pela
última vez?". `tumulos.ultima_lavagem_informada` é **outra coisa**: é o que a
família disse no cadastro, não o que a equipe fez — e por isso ficou em outro
campo, dizendo que foi ela quem informou.

**Uma view, não um campo** (`sureya_ultima_lavagem_jazigo`, 0093). Um campo em
`tumulos` teria de ser mantido em toda conclusão, todo estorno e toda mudança de
data — três lugares para esquecer, e um número errado na tela é pior do que
número nenhum.

**Estorno não conta.** Uma lavagem estornada foi anulada e o valor voltou como
crédito para a família. Continuar dizendo que o jazigo foi lavado naquele dia é
afirmar o que a própria casa já disse que não aconteceu — e faria a agenda pular
uma lavagem devida.

**"Registrada no campo" é um fato, não um enfeite.** Não existe coluna de origem,
mas existe `iniciado_em`, que só é carimbado pelo botão **Começar** do aplicativo
de campo (0068). Lavagem anotada pelo painel nasce executada, sem início. As duas
valem; só uma delas tem hora, foto e quem fez, e a tela diz qual é qual.

**O dia é o de São Paulo.** `data_executada` é `timestamptz`: uma lavagem
concluída às 21h30 de Brasília é 00h30 do dia seguinte em UTC, e a tela mostraria
a lavagem de ontem com a data de hoje — o mesmo erro que já custou a lista vazia
do aplicativo de campo.

Na agenda, a linha se acende quando a última lavagem está a **7 dias ou menos**
da que está marcada. Não é erro — pode ser um pedido da família —, é a pergunta
que alguém precisa fazer antes de a equipe andar até lá.

---

## D-16 · Uma fila só, e a liberação primeiro

**O que se mediu**, em produção, em 23/08/2026:

> **164 mensagens paradas**, esperando decisão, numa fila que nenhuma tela do
> menu mostrava. **157 eram cobranças**, geradas dia após dia entre 04 e 22 de
> agosto.

Não é que alguém decidiu não enviá-las. **Ninguém viu.**

### Por que existiam duas filas

Mensagem para família saía por dois caminhos, cada um com sua tela:

| | onde | quem olhava |
|---|---|---|
| `fila_liberacao` | `/painel/fila` | todo dia |
| `interacoes_ia` | aba "Rascunhos da IA", dentro de `/painel/conversas` | ninguém |

A segunda nasceu quando a IA respondia sozinha e precisava de aval. O robô foi
desligado (D-12); a fila ficou, e `proativo.ts` e `ativacao.ts` continuaram
escrevendo nela — aniversário, Finados, aviso de saldo, cobrança gentil.

Pior que o esquecimento: **as proteções não valiam ali**. A chave de "não enviar
para esta família" (0085), a contagem de tentativas e o destravamento do que
morre no meio do envio (0077) existiam numa fila e não na outra. Uma mensagem
comemorativa podia sair para uma família em luto sem passar por nenhuma das
duas.

### A decisão

`fila_liberacao` passa a ser a **porta única** (0094). Dois tipos novos —
`comemorativa` e `servico` — e `proativo.ts`/`ativacao.ts` enfileiram por ela.
Tudo passa pelo mesmo gatilho.

**As 164 não foram migradas automaticamente.** São 157 cobranças de até 19 dias
atrás, muitas do mesmo cliente em dias seguidos: despejá-las numa fila de envio
seria preparar cobranças repetidas para a mesma família. Elas aparecem numa aba
**"Fila antiga"**, com o número anunciado na primeira aba, e **somem quando a
lista zerar** — a aba existe para o passivo ser pago, não para virar mais um
lugar permanente de olhar.

### "Não enviar mais disso"

Descartar resolve a mensagem de hoje; não resolve a decisão. Há família que não
quer cobrança por WhatsApp, e família em luto para quem uma mensagem
comemorativa é uma ofensa — e nesses casos descartar item a item é lembrar
disso todo mês. Basta esquecer uma vez.

`familias.silenciar` é um **array de tipos**, e não uma coluna booleana por
tipo: tipo novo não deve pedir migration nova. E vale **na porta** — o gatilho
devolve NULL no insert, e a mensagem não chega a existir. Não é filtro de tela.

**A foto não entrou nesse array.** A chave dela (0085) é de **três** estados —
ligada, desligada e "segue a casa", que é o padrão de quase todas as famílias —
e o array é de dois. Absorver uma na outra perderia o estado do meio.

### A última ação

A pergunta antes de liberar não é só "já mandei foto?": é **"eu já não falei com
essa gente esta semana?"**. Três mensagens no mesmo dia, cada uma de um tipo,
cada uma liberada sozinha sem que nada na tela dissesse que as outras duas
existiam — é assim que se cansa uma família.

`sureya_ultima_acao_familia` responde as duas: a última de qualquer tipo e a
última **do mesmo tipo**. Só conta o que foi **enviado**: descartada não chegou
em ninguém, e contá-la faria a tela dizer que a família recebeu o que a Sureya
decidiu não mandar.

### A ordem das abas é a ordem do dia

1. **Liberação** — o que está pronto e depende de um toque. Vem primeiro porque
   é o que tem prazo: do outro lado há gente esperando resposta já escrita.
2. **Conversas** — quem falou com a gente. Resolver, arquivar, fixar, ação em
   massa: tudo isso já existia no módulo antigo e foi religado, não reescrito.
3. **Contatos do site** — quem chegou agora e ainda não é ninguém aqui.
4. **Fila antiga** — o passivo, que some quando zerar.

`/painel/fila` e `/painel/contatos` continuam de pé, redirecionando. Uma tela que
some vira 404 justamente para quem já sabia usá-la.

---

## D-17 · A IA como assistente — ela escreve, quem manda é a pessoa

**Não é o robô de volta.** O robô antigo respondia sozinho e foi desligado por
um bom motivo (D-12): conversa automática com família idosa e enlutada quebra
exatamente o que faz o cliente ficar.

O botão **Sugerir resposta** escreve **no campo de texto** e para por aí. Quem
lê, corrige, apaga e envia é a pessoa. Nada nessa rota grava mensagem, nada
chama o WhatsApp — ela devolve texto. A diferença é de desenho, não de
configuração.

**O que a IA lê:** as últimas 60 mensagens da conversa (eram 16 no "Me ajuda a
escrever" — a pergunta de hoje quase sempre continua uma combinação de semanas
atrás), os jazigos, o saldo, a régua de cobrança, o tratamento da família e o
conhecimento da casa.

**Por que vale a pena.** O trabalho não é escrever: é lembrar. Para responder
bem é preciso saber que esta família tem dois jazigos, que a última limpeza foi
há seis dias, que ela está R$ 80 adiantada e que a régua dela é "suave" — isso
está em cinco telas. A proposta chega com tudo considerado, e o minuto é gasto
corrigindo o tom em vez de abrindo abas.

**Ela diz o que não sabe.** Quando falta um valor, uma data ou uma decisão que é
da casa, a instrução é não inventar: escrever até onde dá e deixar
`[confirmar a data com a Sureya]` entre colchetes. E a tela diz quantas
mensagens foram lidas, em vez de pedir fé.

**Dois botões, dois usos.** *Sugerir resposta* é um clique, para o caso comum —
responder o que a família acabou de perguntar. *Me ajuda a escrever* continua
para quando ela já sabe o que quer dizer e quer três jeitos de dizer.

---

## D-18 · A conferência separa o que trava do que avisa

Da ficha da família **ALCANTARA**, em produção:

```
contrato        sem contrato — as limpezas serao cobradas como avulso   atencao
plano com datas nenhum plano ativo                                      nao se aplica
```

**"Sem contrato" e "avulso" não são a mesma coisa.** A primeira é uma lacuna; a
segunda é uma decisão. As duas moravam no mesmo `contratado = false`, e por isso
a família que ninguém decidiu ainda aparecia verde, como se estivesse resolvida.

`familias.regime` passa a ter três estados: **contrato**, **avulso** e
**não definido** — e não definido é **pendência**. Quem já tem contrato foi
migrado; o resto ficou não definido de propósito. Marcar todo mundo como avulso
seria inventar uma decisão que ninguém tomou, e é justamente essa decisão que a
conferência existe para cobrar.

**Cada item declara se é obrigatório.** Antes tudo que não fosse `ok` tinha o
mesmo peso, e um consentimento não registrado — que é um aviso — segurava a
família do mesmo jeito que um telefone faltando. Agora:

| trava o piloto (pendente) | só avisa (atenção) |
|---|---|
| responsável financeiro | plano com as datas |
| telefone de quem responde | saldo de abertura |
| jazigo cadastrado | consentimento registrado |
| jazigo com quadra e identificação | |
| contrato ou avulso | |
| valor da limpeza | |

**O valor da limpeza mudou de lado.** Era "não se aplica" quando não havia
contrato. Mas **avulso cobra por lavagem**: sem valor, a limpeza acontece e o
lançamento sai zerado. É o jeito mais silencioso de trabalhar de graça.

**O título diz de quem é.** Era `ALCANTARA · 1 jazigo · 1 pessoa · sem contrato`
— nome e contagem. Agora é **`ALCANTARA — CLECIA`**, com as contagens na segunda
linha, onde contagem deve ficar. Quem vai ligar precisa do nome de quem atende.

**Os blocos vêm preenchidos.** Cada família era um clique para expandir e só
então uma ida ao servidor: trinta famílias eram sessenta cliques antes de ler a
primeira linha. O servidor manda os checklists das 60 primeiras junto com a
lista; o que passa do teto continua abrindo sob demanda, e a tela diz isso.

**O ok é um fato com data e autor**, e é **recusado pelo banco** enquanto houver
pendência obrigatória: dar ok no que está incompleto é pior que não conferir,
porque fica registrado que foi conferido. Desfazer é sempre permitido — quem
conferiu pode ter percebido que errou.

---

## D-19 · Excluir uma pessoa não pode levar os jazigos junto

`DELETE /api/clientes/[id]` fazia, no meio da limpeza:

```ts
await db.from("tumulos").delete().eq("cliente_id", params.id);
```

Isso nasceu quando o jazigo pertencia a uma **pessoa**. Desde a D-10/0091 o
jazigo pertence à **família**, e `tumulos.cliente_id` é só o contato derivado
dela. Medido em 23/08: **245 túmulos com `cliente_id` preenchido**.

Excluir o responsável apagaria os jazigos da família junto — o cadastro do
campo, o GPS, a foto da lápide, a ordem na rua — sem erro e sem aviso. Hoje cada
família tem uma pessoa só, então nunca aconteceu; **bastava cadastrar o segundo
contato para virar perda de dado real**, que é exatamente o que esta leva
habilita.

O jazigo agora é **solto** da pessoa e continua com a família.

### Editar e remover pessoas

`PATCH` e `DELETE` em `/api/familias/[id]/contatos`, com três recusas:

- **O responsável não sai assim.** Passe a responsabilidade primeiro (ou deixe a
  família sem responsável, que é estado legítimo desde a 0091) — tem de ser uma
  escolha, não efeito colateral.
- **Telefone repetido é recusado.** Duas fichas com o mesmo número fazem a
  resposta do WhatsApp cair na errada.
- **Pessoa com lançamento no nome não é apagada: é solta da família.** O extrato
  continua inteiro e a pessoa some da ficha, que é o que se queria.

### A ficha da família

O "abrir" da conferência ia para `/painel/clientes?familiaId=…` — **um parâmetro
que aquela tela não lê**. Caía na lista inteira e a família se perdia no meio de
trezentas. Na prática o link não abria nada.

`/painel/conferencia/[id]` é a bancada de conserto: tem exatamente o que a
conferência cobra — pessoas, quem responde, regime, consentimento, jazigos com o
que falta — e nada além. O caminho de volta está em cima **e** embaixo: quem
corrige três coisas não vai rolar até o topo para voltar.

---

## D-20 · Canal e competência: as duas colunas que faltavam para conferir

**O que se mediu em produção, em 23/08/2026, antes de mexer:**

**1. `conta_corrente.competencia` estava NULA em 100% dos lançamentos.** A coluna
existe desde a 0073 e nunca foi preenchida — nem nos oito lançamentos que há. E
`competencias` tem zero linhas: nenhum mês foi fechado. **Relatório por
competência era impossível: não havia por onde agrupar.**

**2. Lavagem registrada fora do campo não virava dinheiro.** As três lavagens do
jazigo Nagae:

| dia | valor | veio do campo? | lançamento |
|---|---|---|---|
| 03/08 | — | não | **nenhum** |
| 10/08 | — | não | **nenhum** |
| 22/08 | R$ 25,00 | sim | sim |

Duas de três aconteceram e a família nunca foi cobrada. **Não há erro em lugar
nenhum**: o serviço foi marcado como executado por fora, sem valor, e o dinheiro
simplesmente não existiu. São R$ 50,00 da Família Andre.

### Canal é um eixo diferente de origem

`origem` diz **por que** o dinheiro se mexeu (lavagem, pagamento, ajuste,
abertura). `canal` diz **como o registro chegou**: automático (a esteira da
competência), campo (o aplicativo), manual_adm (alguém digitou) ou importação
(veio do caderno).

A tentação era enfiar os dois no mesmo enum. Daria uma lista de dez valores em
que não se filtra nem um nem outro — e para conferir precisa-se dos **dois ao
mesmo tempo**: *"as lavagens (origem) que entraram pelo campo (canal) em
agosto (competência)"*.

O que já existia ganhou canal **pelo que se pode provar**, não por chute: quem
tem `iniciado_em` passou pelo campo (só `sureya_iniciar_lavagem` carimba
aquilo); o resto foi registrado no painel; a abertura de saldo veio do caderno.

### A competência nunca mais é nula

Gatilho `BEFORE INSERT OR UPDATE` carimba a partir da data, e **sempre o
primeiro dia do mês** — guardar 17/08 e 03/08 como competências diferentes
faria "agosto" virar trinta grupos no relatório. Está no banco e não na
aplicação porque vale para todo caminho de escrita, inclusive os que ainda vão
nascer.

### A lavagem sem cobrança fica visível, não é corrigida sozinha

`sureya_lavagens_sem_cobranca` mostra quais são. **Não lança sozinha**: qual é o
valor certo — o do jazigo, o do plano, uma cortesia? — é decisão de quem está
conferindo. A tela sugere o do jazigo e a pessoa confirma.

Quando ela confirma, o lançamento passa pela **mesma porta do resto do dinheiro**
(`sureya_lancar`, D-01), e na **competência do dia da lavagem**, não na de hoje:
lançar em agosto uma limpeza de agosto conferida em setembro é o que mantém o
mês fechado fechado.

### O ok por evento

`conta_corrente.conferido_em` existia desde a 0073 e **nenhuma tela a escrevia**.
Agora escreve — no extrato da família e no relatório, nos dois lugares em que se
está olhando o lançamento.

### O relatório não é o export da contabilidade

Já havia `/api/financeiro/export`: CSV do mês por `data`, para o contador. Este
responde a pergunta da conferência, com três colunas que o outro não tem
(competência, canal, conferido).

**Excel sem biblioteca.** SpreadsheetML 2003 escrito à mão. As alternativas
eram: uma dependência de planilha para um export só (num projeto que cuida do
tamanho da superfície, não se paga) ou a tabela HTML servida como Excel — que
abre com aviso de "formato não corresponde à extensão" toda vez e **transforma
número em texto**, que é exatamente o que quebra a conferência.

**Exportar leva o filtro junto.** Um botão que exporta sempre tudo, ao lado de
filtros que mostram uma parte, entrega um arquivo que não é o que está na tela —
e quem confere descobre isso depois de somar a coluna errada.

---

## D-21 · O WhatsApp mora em Configurações

Estava em `/painel/whatsapp`, rota solta, fora do menu, alcançável só por link.
Ficou assim quando o agente de IA foi desligado — a tela foi junto — e depois
voltou a ser essencial: é a única onde se reconecta a instância da Evolution,
que é quem entrega as fotos do antes e depois.

Uma tela essencial que só se acha por link é uma tela que ninguém acha na hora
que precisa. Quando o WhatsApp cai, o que se procura é "configurações", não um
endereço decorado. A rota antiga continua de pé, redirecionando — ela está em
links dentro do sistema, inclusive no aviso da fila.

---

## D-22 · A ficha da família é uma só — reproduzi-la foi decisão errada

Eu tinha feito, em `/painel/conferencia/[id]`, uma "bancada de conserto":
pessoas, regime e jazigos. A ideia era não duplicar a ficha grande. O efeito foi
o oposto do pretendido: **uma segunda verdade sobre a mesma família**, sem
contrato, sem limpezas, sem fechamento do mês — e cada coisa que faltasse
mandava quem estava corrigindo para a ficha original no meio do serviço.

Reverti. A ficha de verdade é `/painel/clientes/[id]`, e o botão de conferido
mora nela, ao lado do que se corrige.

### O que fazia a ficha confundir família com contato

Ela era endereçada pela **pessoa**, e as consultas seguiam:

| bloco | vinha por | devia vir por |
|---|---|---|
| extrato | família *(corrigido antes)* | família |
| **jazigos** | **`cliente_id`** | família |
| **planos** | **`cliente_id`** | família |

`tumulos.cliente_id` é, desde a 0091, o contato **derivado** da família. Medido
em 23/08:

- **25 jazigos** pertencem a uma família e têm `cliente_id` nulo — **não
  apareciam em ficha nenhuma**;
- **24 famílias** não têm responsável — e como o endereço exigia um id de
  pessoa, **essas famílias não tinham ficha**.

E havia um efeito mudo, pior que os dois: trocar quem responde pela família
fazia os jazigos "mudarem de dono" na tela, porque o campo derivado é reescrito
junto. A ficha dizia coisas diferentes antes e depois de uma troca que não mexeu
em jazigo nenhum.

**Agora o grão de tudo é a família.** `cliente_id` sobrou para as mensagens, que
são de uma pessoa mesmo — quem escreveu foi ela.

### O endereço aceita os dois

`/painel/clientes/<id>` tenta cliente primeiro (é o caminho antigo, e o que
chega nos links guardados) e, não achando, tenta família. Abrindo pela família,
a ficha usa o responsável para o que é de pessoa — WhatsApp, régua de cobrança,
instruções da IA — e funciona **sem nenhum**, que é estado legítimo desde a 0091
e antes derrubava a tela na primeira linha (`c.telefone` de cara).

### O ok mora onde se corrige

Corrigir e carimbar são o mesmo minuto de trabalho. Ir até a conferência para
dar o ok no que se acabou de arrumar é uma viagem que ninguém faz — foi assim
que `conferido_em` existiu desde a 0073 sem nenhuma tela escrevendo nele.

A barra na ficha mostra o que falta em palavras de quem vai fazer, traz a
escolha **contrato ou avulso** (a decisão que mais falta e não tinha onde ser
tomada ali), e o botão só acende sem pendência obrigatória — a recusa é do
banco, não da tela.

`?de=conferencia` é o caminho de volta: quem chegou pela conferência volta para
ela; quem chegou pela lista volta para a lista.

### Os planos vêm pelos dois caminhos

O plano pendura no cliente e aponta para um jazigo, e nada obriga `tumulo_id` a
estar preenchido. Buscar só pelo jazigo faria um plano sem jazigo sumir, calado;
só pelo cliente perderia o plano de uma família cujo responsável mudou. Busca
pelos dois e tira a repetição.

---

## D-23 · O rótulo mentia: "Dados da família" editava a pessoa

A ficha da Família Andre não deixava corrigir o contato. Fui olhar, e eram
**três** coisas — uma delas regressão minha.

**1. O nome da família não era editável em lugar nenhum do sistema.** A rota
`PATCH /api/familias/[id]` existia e **não aceitava `nome`**; e nenhuma tela a
chamava. O único cartão que parecia servir chamava-se **"Dados da família"** e
editava `clientes` — o CONTATO. Quem abrisse para corrigir "Família Andre"
acabava renomeando a pessoa.

O caso é literal: a Família Andre tem **uma pessoa chamada "Nagae"** e um jazigo
chamado "Nagae". O sobrenome está na pessoa e o primeiro nome está na família —
trocados, e sem como desfazer pela tela.

O cartão passou a se chamar **"Dados do contato"**, e a família ganhou o seu.

**2. As pessoas eram só leitura.** Dava para *adicionar* contato e *trocar quem
acerta a conta*, e não dava para corrigir o nome de quem já estava lá nem
remover ninguém. As rotas `PATCH` e `DELETE` de `/api/familias/[id]/contatos`
eu tinha escrito na leva anterior — e elas ficaram **órfãs** quando removi a
ficha reproduzida, que era a única tela que as chamava. Regressão minha, e do
tipo pior: o código existe, compila, e não está ligado a nada.

**3. O salvar falhava calado.** `await fetch(...)` sem ler a resposta: dando
erro, a tela fechava o editor, recarregava e mostrava o valor **antigo**. A
pessoa vê "não aconteceu nada" e não tem como saber por quê. **Falha muda numa
tela de edição é o mesmo que a edição não existir** — e foi provavelmente o que
transformou os defeitos 1 e 2 na frase "não consigo editar o contato".

### O portão ganhou uma prova disto

`npm run checar` agora confere que **cada edição da ficha está ligada a uma rota
que aceita aquele campo**. Compilar não provava nada aqui: o cartão mal rotulado
compilava, as rotas órfãs compilavam, e o `BarraConferencia` chegou a existir no
arquivo **sem ser renderizado** — por um lote de edição que morreu antes de
gravar e que eu não conferi.

São 14 verificações, e três delas pegaram exatamente esses casos.

---

## D-24 · O contrato é do túmulo, e a lavagem desconta o mês

**Duas linhas da ALCANTARA contam a história inteira:**

| data | | valor | o quê |
|---|---|---|---|
| 02/08 | crédito | R$ 25,00 | **pagamento** recebido |
| 08/08 | débito | R$ 40,00 | lavagem do jazigo Alcantara |

O combinado era R$ 25 **por mês**. A lavagem debitou R$ 40 — que não veio de
lugar nenhum do contrato: `tumulos.valor_lavagem` estava nulo e a cascata caiu
no último degrau, `coalesce(orgs.valor_referencia, 40)`.

**E havia um erro pior à espera.** A cascata de `sureya_concluir_lavagem` fazia:

```
if v_valor = 0 and plano_id is not null then
  v_valor := coalesce(plano.valor_vigente, plano.valor_mensal)
```

Pega o valor **mensal** e cobra como se fosse o de **uma** lavagem. Um contrato
de R$ 25/mês com lavagem semanal debitaria R$ 100 no mês — **quatro vezes o
combinado**. Não apareceu ainda só porque a ALCANTARA não tem plano.

### As decisões

**O valor combinado é mensal e é do túmulo.** 24 famílias têm mais de um jazigo
(uma tem três), com ritmos e preços diferentes. Guardar o valor na família
obriga a inventar um rateio na hora de cobrar; guardar no túmulo é o que a
conversa já é: *"esse aqui é vinte e cinco por mês"*.

**Cada lavagem desconta a fração do mês.** R$ 25/mês semanal = **R$ 6,25** por
lavagem. É a conta que se faz de cabeça, e passa a ser a que o sistema faz.

**Quatro semanas no mês, e não 4,28.** O calendário diria 30/7; a combinação com
a família é "quatro vezes por mês". Usar o calendário encheria o extrato de
centavos que ninguém confere contra o caderno — e conferir contra o caderno é a
operação inteira do piloto.

**`valor_lavagem` não sai.** Continua sendo o preço de uma ida **avulsa**, onde
não há mês para dividir. Dois preços porque são dois negócios, e quem decide
qual vale é o **regime** da família.

**O ritmo virou item obrigatório da conferência**: ele é o divisor. Sem
periodicidade não há como dividir o mensal, e a lavagem cai no valor cheio.

### Uma decisão anterior foi revertida — de propósito

Em `/api/tumulos/[id]` estava escrito, com todas as letras:

> "o contrato é da família... o PATCH **NÃO** aceita mais `valor_lavagem`. Se
> aceitasse, a duplicação voltaria pela porta dos fundos."

O motivo era bom. O que mudou não foi o código, foi o negócio: com N túmulos por
família, um valor por família não descreve o combinado.

O risco de duplicação continua real, e o que o desarma é a 0100: existe **uma**
função que responde quanto custa uma lavagem (`sureya_valor_da_lavagem`), e a
cobrança inteira passa por ela. O número gravado no túmulo é o que ela lê — não
há segunda opinião.

**Um detalhe que quase custou caro:** `periodicidade` é o enum `sureya_cadencia`,
e o Postgres não converte enum para `text` sozinho na resolução de função. Sem o
`::text` explícito, `sureya_valor_da_lavagem` estouraria com *"function does not
exist"* — **e só na hora de cobrar**. Apareceu ao testar contra o dado real.

### O saldo por túmulo

`sureya_saldo_por_tumulo` soma por jazigo. **Isto não muda quem deve**: o devedor
continua sendo a família (D-10), e `conta_corrente.familia_id` continua NOT NULL.
O que muda é a atribuição — e é o que permite responder *"esse aqui está pago e
aquele não"*, a pergunta que aparece quando a família quer cancelar um dos três.

O que não tem túmulo aparece num balde chamado pelo nome. Um pagamento de R$ 100
não é de nenhum jazigo em particular até alguém dizer que é, e distribuir por
conta própria seria inventar uma decisão de dinheiro.

---

## D-25 · Quem lava não se decide no cadastro

O campo do ritmo dizia **"A Nina limpa"**. São duas coisas erradas numa frase:
prende o cadastro a uma pessoa (a equipe não é fixa — D-11, "limpeza é limpeza")
e mistura o **contrato** com a **escala**.

O que se cadastra ali é o ritmo combinado com a família. Quem vai lavar em cada
data é decidido na agenda, e pode ser ninguém até alguém começar. O rótulo virou
**"Este túmulo é lavado"**.

No mesmo espírito: **o WhatsApp saiu do menu**. Ele já é uma aba de
Configurações desde a D-21, e ter as duas entradas era duas portas para a mesma
casa. O endereço continua de pé, redirecionando.

E a **lista de famílias** passou a mostrar `(Família - X)` com `(Responsável -
Y)` embaixo. Ela se chama "Famílias" e mostrava o nome da **pessoa** — procurar
"Alcantara" não achava nada quando o contato se chama "Clecia".

---

## D-26 · "Quem responde" e "quem paga" são duas perguntas

A ficha oferecia o botão **"também acerta a conta"**, a rota aceitava, e o
segundo clique morria no banco:

```sql
CREATE UNIQUE INDEX idx_familia_um_responsavel
  ON clientes (familia_id) WHERE responsavel_financeiro = true;
```

Um índice **único** parcial. O limite estava uma camada abaixo da tela, e voltava
como violação de chave — um erro que não fala do que a Sureya tentou fazer.

O índice não era um descuido: ele é de quando havia **uma** pergunta só. Hoje são
duas, e este é o ponto da decisão:

| | quem é | quantos |
|---|---|---|
| `familias.responsavel_id` | **quem responde** — o titular, aparece no cabeçalho, recebe a cobrança, tem histórico com data (D-13) | **um** |
| `clientes.responsavel_financeiro` | **quem pode acertar a conta** — o filho que paga um mês, a filha que paga o outro | **vários** |

A 0102 tirou o teto e **manteve o piso**: uma família com gente nunca fica sem
ninguém que acerte a conta — é a condição que `sureya_alertas` e
`sureya_familias_sem_responsavel` verificam, e sem ela a cobrança não sabe com
quem falar. Antes o piso vinha de graça: com um só, desmarcar era **trocar**,
nunca esvaziar. Agora precisa de guarda própria (`trg_guarda_quem_acerta_a_conta`),
e ela **recusa** em vez de escolher um substituto — adivinhar quem paga é
exatamente a pergunta que a Sureya está respondendo.

### O estrago que saiu junto

`sureya_definir_responsavel_interno` **apagava a marca de todos** antes de marcar
o novo titular. Não por escolha: o índice único recusaria os dois entre as
escritas. Sem ele, essa limpeza vira perda de cadastro — marcar três filhos,
trocar o titular por outro motivo, e os três perdem a marca sem ninguém pedir.
Agora o titular **entra** na lista; ninguém sai dela.

### A tela não repõe o limite

Havia na ficha uma recusa própria — desmarcar o titular era proibido pela tela.
Ela era **mais dura que a regra da casa**. Saiu. O limite verdadeiro é um só e
mora no gatilho; a rota apenas traduz a recusa para o português. Tela que proíbe
o que o banco permite é o pior dos casos: ninguém entende por quê.

**Medido antes de mexer** (produção, 23/08): 365 famílias, 341 marcados, **zero**
famílias com mais de um marcado, zero titulares sem a marca, zero famílias com
gente e sem pagador. Dado limpo — não havia o que consertar, só o que liberar.
E o motivo de o teto nunca ter aparecido: **nenhuma família tinha mais de um
contato**. O limite só apareceria no dia em que a Sureya cadastrasse o segundo.

---

## D-27 · Havia dois motores de data, e o que rodava era o errado

O produto de memória estava **inteiro no banco e invisível no app**. As 0095 e
0096 criaram `falecidos`, `eventos_memoria`, as quatro supressões e a biblioteca
de textos — e nenhum arquivo do app citava nada disso. Nem tela, nem rota, nem
job.

Ao ligar, apareceu o que estava embaixo: **dois motores de data**.

| | `gatilhosDeData` (2024) | o da 0096 |
|---|---|---|
| lê | `tumulos.datas_gatilho` | `falecidos` |
| formato | MM-DD, **sem ano** | `date`, com ano e precisão |
| grão | uma lista por **túmulo** | uma linha por **pessoa** |
| antecedência | sempre 7 dias | 10 · 20 (marco) · 3 · 15 |
| textos | dentro do TypeScript | biblioteca no banco |
| supressões | **nenhuma** | as quatro obrigatórias |

O que rodava todo dia no cron era o da esquerda. A especificação diz, sobre os
limites de luto e frequência: *"são obrigatórios, não configuráveis para cima"*.
Aquele motor não os tem — mandaria a mensagem de aniversário para quem enterrou
alguém há três semanas.

Ele nunca fez isso porque `datas_gatilho` está vazio nos 270 túmulos. Não era
um recurso funcionando: era uma **arma carregada** esperando alguém preencher o
campo. E as duas memórias estavam vazias — o momento mais barato que existe para
ficar com uma verdade só. O da 0096 assumiu; o velho ficou no arquivo, sem
chamador, com a nota do porquê.

### O ano não é detalhe

`datas_gatilho` guardava só o dia do ano. Sem o ano não há *"completam-se 7
anos"*, não há marco de 1 ano, e — o que decide — **não há como saber se o luto
é recente**. A zona de silêncio (< 90 dias bloqueia tudo, < 6 meses bloqueia
oferta) é uma conta com a data real. Em MM-DD ela é impossível.

### O motor não conseguia rodar onde precisava

As duas funções abrem com `v_org := current_org_id()`, que é
`select org_id from membros where user_id = auth.uid()`. Numa sessão do painel
resolve; **num cron não** — a service role tem `auth.uid()` nulo, e a chamada
morria em `sem_org` antes da primeira linha de trabalho. O motor foi escrito
para uma sessão e agendado para um job. A 0103 acrescentou `p_org`.

O erro era alto, e isso é bom. O problema não era silêncio — era não haver
caminho nenhum.

### O que destrava tudo é o cadastro

Medido em 23/08: os **65 falecidos** vieram do texto `tumulos.falecido_nome` e
chegaram **sem nenhuma data** — zero nascimentos, zero falecimentos. O motor
está certo e faminto. Por isso a tela `/painel/memoria` põe *"quem ainda não tem
data"* **antes** do calendário: um calendário vazio, sozinho, parece defeito; ao
lado da lista de quem falta, vira fila de trabalho.

E os cinco textos de memória, semeados pela 0096, estavam barrados por uma lista
de tipos em `/api/config/textos`. Existiam, eram usados, e ninguém da casa
conseguia relê-los. Texto que fala de luto é o pior candidato a ficar escondido.

---

## D-28 · A cobrança é do contrato; a limpeza é entrega

O razão respondia por duas perguntas ao mesmo tempo:

| | |
|---|---|
| **dinheiro** | quanto a família deve pelo contrato |
| **serviço** | quais limpezas aconteceram |

Enquanto a limpeza lançava o débito, a segunda escrevia na primeira. As
consequências não eram teóricas:

- uma limpeza **adiada barateava o mês**
- uma limpeza **anotada em atraso virava dívida retroativa**
- e o **contrato virava o resultado da operação**, quando é o contrário: ele é
  o combinado, e a operação é o que a casa entrega por ele

O código já sabia. Dentro de `sureya_concluir_lavagem`, no bloco 4, estava
escrito: *"Quem gera a dívida é a competência. Se a lavagem também lançasse
valor, a família seria cobrada duas vezes pelo mesmo serviço."* O caminho da
competência existia, era o certo, e **nada o alimentava**.

Agora alimenta: `sureya_cobrar_competencias` lança, por túmulo, o valor
combinado do período, na periodicidade de pagamento da família. A limpeza não
encosta mais no saldo.

### O teto que ninguém via (de novo)

Havia **dois** índices únicos para o mesmo `origem='competencia'`:

```
idx_cc_competencia_familia   (familia_id, competencia)
idx_cc_competencia_unica     (tumulo_id,  competencia)
```

O primeiro limita a família a **uma** cobrança por mês — e a D-24 diz que
contrato, pagamento e lavagem são por túmulo, *"pois tem famílias com N
túmulos"*. Ensaiado em produção e desfeito: a segunda cobrança do mesmo mês
volta com `duplicate key ... idx_cc_competencia_familia`. Com ele de pé, o
modelo novo não tinha como existir. É a mesma forma da D-26.

### Duas datas que eram uma

`inicio_cobranca` respondia por *quando o dinheiro começa* e *quando a rota
começa*. Elas não coincidem — a família assina hoje, a primeira limpeza é
semana que vem, a cobrança começa no mês que vem. Separadas em
`proxima_cobranca` (que o cobrador **anda sozinho**) e `inicio_agendamento`.

### Meses parados saem um a um

Se a casa passar meses sem rodar o cron, somar tudo num lançamento com a data
de hoje perderia a competência de cada mês — e o relatório por competência, que
é o que a Sureya confere, mentiria. O cobrador anda mês a mês.

### O que se mediu, e o que se estornou

O razão inteiro tinha **11 lançamentos**, todos em 2026-08: 5 débitos de
lavagem (R$ 121,25), 4 pagamentos, 1 abertura, 1 avulso. **Nenhuma competência.**
Os 5 débitos foram **estornados** (não apagados): eles cobravam limpezas que a
competência de agosto cobraria de novo. Apagar deixaria o saldo certo e a
história muda.

**Um índice quase estragou o estorno, e o harness não pegou.** A primeira versão
estornava com `origem='ajuste'`, e `idx_cc_ajuste_mes` é único por
(familia_id, competencia): uma família tinha três débitos no mesmo mês, e o
segundo estorno colidia. No banco limpo as famílias do teste eram distintas, e
a colisão só existe quando a mesma família repete competência — o caso real. O
estorno passou a nascer com a mesma origem do que reverte, e com `servico_id`
nulo: o vínculo certo é o ponteiro `estorna_lancamento`, não a repetição da
chave do serviço.

### Estado hoje

270 túmulos, **5 contratados**, **2 com valor** — e os dois vencem em 01/09.
Ensaiado em produção e desfeito: em 01/09 o cobrador lança R$ 25 (Alcantara) e
R$ 30 (Bruniera), e a segunda rodada lança zero.

---

## D-29 · O painel do mês, e o risco que inverteu

Uma tela para as cinco perguntas que se faz ao abrir o mês: **quanto fechou**,
**quem não pagou e há quanto tempo**, **a casa entregou o que cobrou**, **quanto
custou**, **do que o negócio vive**.

### Um número, uma conta

Todo valor sai de `sureya_painel_do_mes` — uma função. Cada cartão com a sua
própria consulta é como o aviso da agenda ficou meses sem zerar: o contador e o
movedor usavam definições diferentes de "fora do lugar" (0092). Um painel cujos
números **discordam entre si** é pior que nenhum painel — ele ensina a não
confiar na tela inteira. Por isso o teste cobra as somas cruzadas: o aging tem
de somar o em aberto, a lista de devedores tem de dar o mesmo total, e a quebra
das lavagens tem de fechar com as executadas.

### Receita e recebido não batem, e é assim mesmo

**Receita** é por **competência** — o mês a que a cobrança se refere. **Recebido**
é por **data** — o dia em que o dinheiro entrou. Um pagamento de julho que caiu
em agosto aparece no recebido de agosto e na competência de julho. A tela diz
isso onde os dois números aparecem, senão a diferença vira suspeita de defeito.

A idade da dívida conta da **competência em aberto mais antiga**, não do último
lançamento: quem deve desde março e pagou parte em agosto continua sendo uma
dívida de março.

### O risco inverteu

Enquanto a limpeza gerava a cobrança (até a D-28), o risco era **lavagem sem
cobrança** — serviço entregue e não faturado. `Mes.tsx` tinha esse alarme, e ele
estava certo.

Agora o contrato cobra sozinho, nenhuma limpeza gera débito, e aquele alarme
acusaria **todas as limpezas, para sempre**. Um aviso que nunca zera é pior que
aviso nenhum: ensina a ignorar a tela. Ele saiu.

O risco não sumiu — virou o contrário, e é mais grave: **cobrado e não
entregue**. A casa debita o mês e pode não ter ido ao jazigo. Isso não existia
antes, ninguém avisa, e por isso é cartão de primeira linha no painel.

### Vazio não é zero

Medido em 23/08: `lancamentos` tem **zero linhas**. As onze categorias de
despesa existem desde sempre — *Materiais*, *Pagamento da ajudante*, Transporte,
Impostos — e nenhuma recebeu lançamento. `conta_equipe`, `compras_material`,
`remuneracao_regras` e `materiais` também estão vazias.

Mostrar "R$ 0,00 de material" seria apresentar **ausência de registro como
medição**, e a margem sairia inflada com cara de fato. Onde não há registro, a
tela diz que não há, explica o que isso significa e mostra o caminho — e o
cartão de resultado muda de nome: enquanto ninguém lançar despesa, ele se chama
*"Receita (sem custos lançados)"*, não *"Resultado do mês"*.

É a mesma regra da D-27: a função devolve a **contagem** de lançamentos junto do
total, justamente para a tela conseguir distinguir os dois casos.

### O que mais deu para medir

- **Contrato por mês** — o que entra se ninguém sair. Nenhuma tela mostrava.
- **Prontos para cobrar** — contratado **não é** cobrável: falta valor ou falta
  data. É o que explica um mês menor sem nada estar quebrado (hoje: 2 de 5).
- **Campo × anotada** — só `iniciado_em` prova que alguém esteve no jazigo.
  Separadas, dá para confiar na primeira; somadas, em nenhuma.
- Ticket médio, jazigos sem família, famílias com contrato.

---

## D-30 · A lista contradizia a ficha

O usuário abriu a família **BRUNIERA**. A ficha dizia *"conferida em 23/08 ·
nada obrigatório faltando"*, contrato, R$ 30/mês, toda semana, cobrar a partir
de 09/2026, início dos agendamentos 31/08. A lista, no mesmo minuto, dizia
**"iniciar controle · sem plano · Sem data de lavagem · Sem data de cobrança"**,
e a contava em *Falta contrato (1)*.

Nada estava quebrado nos dados. As duas telas faziam **contas diferentes sobre
os mesmos fatos** — o terceiro defeito com esta forma em quatro semanas (0092 na
agenda, 0105 no painel, este na lista).

### A conta olhava para campos que a decisão esvaziou

```
contratoOk = fam.contratado && fam.valor_mensal > 0
             && fam.freq_pagamento && fam.inicio_cobranca
             && algum tumulo.contratado com periodicidade
```

Três das quatro condições perguntam à **família**. A D-24 moveu o contrato para
o **túmulo** e a 0100/0104 completaram. Medido na BRUNIERA:

| na família | | no túmulo | |
|---|---|---|---|
| `valor_mensal` | null | `valor_mensal` | 30,00 |
| `freq_pagamento` | null | `periodicidade` | semanal |
| `inicio_cobranca` | null | `proxima_cobranca` | 2026-09-01 |

E o *"sem plano · sem data"* vinha da tabela `planos`, que tem **zero linhas**
para as famílias novas. A definição virou `sureya_etapas_das_familias` — uma só,
no banco, respeitando o **regime** (avulso não tem mensalidade para faltar).

### O filtro filtrava outra coisa

Dois defeitos somados, ambos invisíveis:

1. **A busca não achava família.** `c.nome` é o nome do *contato*; o nome da
   família só era anexado **depois** do filtro. Procurar "BRUNIERA" não achava a
   família BRUNIERA — só "adriana" funcionava. A tela se chama *Famílias*.
2. **O seletor de periodicidade nunca casava.** Ele manda o enum (`mensal`) e a
   lista guardava o texto humanizado (*"uma vez por mês"*). Agora o valor cru
   serve ao filtro e o rótulo serve à tela. Faltavam também `semanal` e
   `quinzenal` nas opções — os dois ritmos mais usados.

Os filtros também rodavam **antes** do enriquecimento, então mordiam o dado
velho. Passaram para depois.

### O que a correção revelou — e não foi consertado sozinho

Três famílias têm `regime='contrato'` e o valor mensal **na família, nulo no
túmulo**: **Andre R$ 100 · Anninha R$ 20 · Perrela R$ 15**. A 0100 moveu o
conceito e não migrou o dado. Como `sureya_cobrar_competencias` (0104) lê o
túmulo, elas **nunca seriam cobradas** — e a lista antiga chamava a Andre de
*"operacional"*, escondendo isso por completo.

Não foram remendadas de ofício. Copiar `familias.valor_mensal` para o túmulo é
uma decisão de dinheiro, e a Perrela tem **dois** túmulos — copiar dobraria o
contrato. A lista passou a acusar as três com o próximo passo escrito
("completar valor, ritmo e próxima cobrança no jazigo"), que é onde a decisão
deve ser tomada por quem sabe o combinado.

### O selo passou a dizer a tarefa

*"Iniciar controle"* é um rótulo de estado. *"Completar valor, ritmo e próxima
cobrança no jazigo"* é uma tarefa. E quem já tem o ok da conferência ganhou o
selo **conferida** — era a contradição que apareceu na tela.

---

## D-31 · A cobrança a cada N meses, e o que mais saiu desta rodada

**O caso:** uma família pagou **4 meses em agosto**; as limpezas começam já, a
próxima cobrança é dezembro, e daí a cada 4 meses. Não deu — `sureya_freq_pagamento`
é um enum fechado (mensal/trimestral/semestral/anual) e **quatro meses não está
lá**. O vocabulário foi escrito adivinhando, e a primeira família real que
combinou outra coisa não coube.

Virou **número**, não mais um valor no enum: acrescentar `quadrimestral`
resolveria esta e adiaria o problema até alguém combinar cinco. E foi para o
**túmulo**, junto do resto do contrato (D-24) — era a última peça que ainda
morava na família, e por isso não aparecia na caixa onde se foi procurá-la.
Nulo = segue o combinado da família.

Verificado em produção e desfeito: nada até 30/11, **uma cobrança de R$ 200 em
dezembro** rotulada "(4 meses)", próxima em abril/2027.

### O painel estava no lugar errado — erro meu

O painel do mês nasceu como aba do Financeiro. O menu já tinha **"O mês"** como
primeira entrada, e era ali que se procurava: ficaram **três portas** para a
mesma pergunta. Subiu para `/painel`, acima da lista de trabalho — ler primeiro,
agir depois. O Financeiro ficou com o que é ação.

Junto saiu um defeito que eu mesmo criei: ao tornar o painel a aba padrão,
"Fechar o mês" continuou gravando o endereço limpo, que passou a abrir outra
aba. Link compartilhado e F5 levavam a pessoa para a tela errada.

### Os grupos da liberação são a base da régua

Fotos dos serviços · Cobrança · **Inadimplente** · Ações · Demais.
**"Inadimplente" não é um tipo de mensagem** — é um corte por *saldo* dentro das
cobranças. Sem ele, a cobrança de rotina e a de quem deve há três meses chegavam
na mesma lista e saíam com o mesmo clique, com o mesmo tom.

E entrou o **descartar em lote**: descartar existia uma a uma, e revisar trinta
comemorativas custava trinta confirmações — que é como se aprende a clicar "ok"
sem ler. Continua com confirmação única, nomeando quantas e para quem.

**Uma regressão da 0102 apareceu aqui:** `cobrancaGentil` seleciona
`responsavel_financeiro = true` e dependia — sem dizer — do índice único que a
0102 derrubou de propósito. Com dois pagadores, a família receberia **duas
cobranças pela mesma dívida**. Hoje há 341 pagadores e zero famílias com mais de
um: arma carregada, não recurso quebrado. Agora é uma por família, para o titular.

### Nada sai sozinho

*"nenhuma mensagem deve ir automática até o app se provar na operação."*

Os três caminhos automáticos — a resposta da IA, a fila de envios e a foto da
conclusão — passam por `orgs.disparos_ativos`. O envio pela tela **não passa**:
usa o WhatsApp direto. Então a chave foi **desligada** em produção: nada
automático, manual continua inteiro. A tela de liberação passou a dizer isso —
sem a faixa, "não chegou" viraria chamado.

Medido antes: chave ligada, **zero** clientes em modo automático (a IA nunca
enviou sozinha), e **1 item pendente** na fila de envios que o cron do minuto
despacharia.

### Duplicadas pedem fusão, não exclusão

31 nomes repetidos, **97 famílias** — "Família Cemitério" sozinha aparece ~30
vezes, resto de importação. E o que mudou a solução: **nenhuma está vazia** — 97
têm contato, 48 têm jazigo, **zero têm lançamento**.

Um "excluir" que respeita o dado recusaria as 97; um que não respeita levaria 48
jazigos junto — o desenho que já mordeu esta casa quando apagar uma pessoa
apagava os jazigos dela. Então entraram as **duas**: `sureya_fundir_familias`
move tudo para a que fica, e `sureya_excluir_familia` só apaga o que está
realmente vazio, **recusando com o motivo escrito** ("2 jazigos") para a pessoa
saber ir fundir.

As zero com lançamento são a boa notícia: fundir hoje não mistura histórico de
dinheiro de ninguém. É a hora mais barata que vai existir. Ensaiado com um par
real e desfeito: 365 → 364 famílias, contato e jazigo movidos, zero órfãos.

---

## D-32 · "Em dia" era uma afirmação falsa

**O caso:** a família Cordeiro, cadastrada com cobrança desde julho porque pagou
em junho. Medido em 23/08: contratado, R$ 30/mês, **próxima cobrança 01/07**,
**zero lançamentos**, e a ficha dizendo **"Em dia"**.

O cadastro estava certo. O motor estava certo — ensaiado e desfeito, ele
lançaria 07/2026 R$30 + 08/2026 R$30 = **R$ 60**, exatamente o que o usuário
esperava. **Não existia caminho para ele rodar quando a pessoa precisa**:
`sureya_cobrar_competencias` só era chamada pelo cron das 6h. Quem configurava
a cobrança hoje descobria amanhã se tinha acertado.

E o pior não era a espera: **saldo zero porque nada foi lançado não é o mesmo
que quitado.** Uma família com dois meses a lançar aparecia igual a uma que
pagou tudo, e a inadimplência ficava invisível justamente onde se olha.

Duas peças: o cobrador passou a aceitar **uma família** (para o botão agir só
ali) e nasceu `sureya_cobrancas_a_lancar`, que **responde sem cobrar** — abrir
uma ficha nunca pode criar dívida. A ficha agora avisa *"2 competências a
lançar — R$ 60"* com o botão ao lado.

### A régua vive no banco

Era três nomes fixos (suave/padrão/firme) com os degraus **dentro do
TypeScript**: quantos dias, que texto, em que ordem. Personalizar exigia mexer
em código — o oposto de *"vou ajustando"*. E ela só sabia perseguir quem **já**
devia: a cobrança do serviço prévio não existia.

Agora cada degrau é uma linha de `regua_degraus`, com **um eixo só e o zero no
vencimento**: dias negativos são antes (o aviso), positivos são depois (a
cobrança). Dois campos separados — "tipo" + "dias" — deixariam criar "aviso
prévio, 5 dias depois", que não quer dizer nada.

**O vencimento não é a competência.** `competencia` é sempre o dia 1º (o gatilho
da 0098 carimba assim, e está certo: competência é mês). Mas ninguém vence no
dia 1º — daí `orgs.dia_vencimento`. Sem ele, o degrau de "3 dias depois" cairia
no dia 4 de todo mês, chamando de atrasado quem ainda tem uma semana.

**A régua enfileira, nunca envia.** Não há caminho dela para o WhatsApp: ela
escreve na fila de liberação, que é a porta única desde a 0094. Quatro travas,
cada uma por um erro concreto: uma por degrau por competência (rodar duas vezes
não cobra duas vezes), uma por família por dia (três túmulos em atraso não viram
três mensagens na mesma manhã), só quem ainda deve (quem pagou ontem não recebe
hoje) e respeito à régua `nao_cobrar`.

### Duplicadas: select na frente, e o esconderijo aberto

O bloco "Ajustes da família" era recolhido, com o argumento de que "coisas de
fazer uma vez" não podiam competir com o dia a dia. O argumento não sobreviveu
ao uso: **esconder três botões atrás de um quarto botão não protege ninguém**.
Aberto.

E a lista de famílias ganhou **caixa de seleção por linha e exclusão em lote** —
nasceu das 97 duplicadas, com "Família Cemitério" aparecendo ~30 vezes. O lote
usa a **mesma porta** da ficha, a que recusa quem não está vazia: um lote que
apagasse à força levaria os 48 jazigos junto. E ele **relata**: quantas saíram
e, para cada recusada, o motivo — sem isso, "excluí 30 e sumiram 12" seria um
mistério.

---

## D-33 · Uma competência por mês do período, e o pós-pago

**O caso Anninha:** paga a cada seis meses, **depois do serviço** — pagou em
junho pelo semestre que terminou, e paga em dezembro pelo próximo.

O ritmo estava certo: R$ 240 em dezembro, próxima em junho/2027. Duas coisas
não estavam.

### A competência empilhava seis meses num mês

Os R$ 240 entravam como **uma linha** de competência 12/2026 — mas cobrem
julho a dezembro. No Painel do mês, julho a novembro apareciam com R$ 0 dessa
família e dezembro com R$ 240. A regra do painel é *"receita da competência = o
mês a que a cobrança se refere"*, e ela se referia a seis.

Agora o ciclo vira **N lançamentos**, um por mês, no valor mensal, **todos com o
mesmo vencimento**. A receita fica no mês em que o serviço foi prestado, a
inadimplência aparece mês a mês, e o extrato diz de que mês é cada real. Para
contrato mensal (N = 1) nada muda.

O vencimento único é o que mantém a régua coerente: a família paga **uma vez**;
se cada linha vencesse no seu mês, a régua cobraria seis vezes.

### O sistema assumia pré-pago sem dizer

O cobrador cobrava em P e andava N meses — logo o período seria P..P+N-1. Quem
paga depois do serviço tem período P-N+1..P. **As duas leituras dão o mesmo
ritmo e meses diferentes**, e nada no cadastro dizia qual era: cobrando em
dezembro a cada 6 meses, o pré-pago cobre dez–mai e o pós-pago cobre jul–dez.
Funcionava por coincidência de a próxima data cair certa.

Virou `tumulos.cobranca_no_fim`. Verificado em produção e desfeito: a Anninha
agora produz **07 a 12/2026, R$ 40 cada, todas vencendo em 01/12**.

### O R$ 240 de "situação inicial" — e por que foi apagado, não estornado

Era lixo de digitação, e coincidia com o valor do contrato semestral — some com
ele quando vier. **Apagado, não estornado:** `idx_cc_uma_abertura` é único por
família, então um estorno deixaria o débito de pé e ela nunca mais poderia
registrar uma situação inicial correta. Lançamento que nunca representou nada
se apaga; o que representou, se estorna.

### Os grupos da liberação sumiam quando vazios

Herdei do filtro por tipo antigo um `return null` para o grupo zerado. Ali fazia
sentido — os tipos são muitos e vão e vêm. Aqui é uma **taxonomia fixa de
cinco**: com a fila vazia (o caso de hoje, medido: zero mensagens), sumia tudo
menos "Tudo", e quem abria concluía que os grupos não existiam. Era exatamente
o que estava sendo relatado.

Os cinco aparecem sempre, com **(0)** quando vazios — *"não há cobrança de
inadimplente hoje"* é uma resposta; sumir não é. E a fila vazia passou a
explicar-se, em vez de ficar branca.

E o menu ganhou a **bolinha** com quantas esperam liberação: como nada sai
sozinho, a fila só anda quando alguém abre a tela — sem um número visível,
"abrir Conversas para ver" vira um hábito que se perde, e a foto da limpeza
espera dias.

---

## D-34 · A segunda porta da IA

A "Fila antiga" era uma aba com os rascunhos da IA em **lista solta** — texto
sem a pergunta que o originou. Ela nasceu como remendo para expor 164 mensagens
que o sistema havia preparado numa segunda fila sem tela nenhuma, e cumpriu o
papel: medido em 23/08, **as 162 estão todas decididas** (aprovadas ou
descartadas) e a lista está vazia.

Mantê-la seria manter aberta a **segunda porta** — a mesma que a 0094 fechou
para as mensagens e deixou aberta para a IA. Foi por ela que os rascunhos se
acumularam sem ninguém ver: uma lista de textos soltos não dá para julgar,
porque julgar uma resposta exige a pergunta.

**A sugestão passou a morar dentro da conversa**, embaixo da última mensagem,
com duas coisas que a lista não tinha:

- **o texto** que a IA escreveu, não só o aviso de que existe algo
- **o motivo pelo qual ela segurou** — *"a IA ficou em dúvida"*, *"disparos
  automáticos desligados"*, *"contato em modo copiloto"* pedem decisões
  diferentes, e sem o motivo todas parecem a mesma

O aviso do passivo continua na primeira aba, mas agora aponta para onde se
decide, não para uma lista paralela.

### O que já estava certo, e vale registrar

Nada dispara sozinho, e não por acidente: `atendimento.ts` só envia quando
`disparos_ativos` **e** o contato está em modo automático **e** a IA está
confiante. Medido: **zero** contatos em modo automático e a chave mestra
desligada — a IA nunca enviou nada por conta própria (`enviou_direto` = 0).

Restam **1 mídia pendente** em `fila_envios` (de 22/08) e **1 foto descartada**
em `fila_liberacao`. A mídia fica onde está enquanto a chave estiver desligada;
ela sai sozinha no dia em que a casa religar, e é o comportamento esperado —
está anotado aqui para que não vire surpresa.

---

## D-35 · Descartar não descartava

**O caso:** *"tinha uma foto eu descartei, então deveria ser descartada também
né"*. Estava certo. Medido em 23/08:

```
fila_liberacao   1 foto DESCARTADA    servico 1b54c69d…
fila_envios      1 midia PENDENTE     .../1b54c69d…/depois-….jpg
```

A mesma foto, em duas filas, com **decisões opostas**.

As duas não são redundantes, e por isso a confusão é fácil: `fila_liberacao`
espera uma **pessoa aprovar**; `fila_envios` é de coisa **já aprovada cuja
entrega falhou** e está tentando de novo — esta tinha duas tentativas. Quando a
mensagem volta para a tela e é descartada, o descarte apagava só a intenção. A
tentativa seguia viva do outro lado e **sairia sozinha no dia em que a entrega
voltasse a funcionar**.

Faltava o vínculo: `fila_envios` guardava telefone e payload, e para saber de
que serviço era a mídia só olhando o caminho do arquivo. Agora tem
`servico_id`, e o descarte alcança as duas filas.

O backfill usa exatamente a amarração frágil que a coluna vem substituir — mas
para o que **já** estava na fila não há outra fonte, e deixar a linha de hoje
sem vínculo manteria o defeito vivo justamente no caso que o revelou.

`proximo_retry` é NOT NULL e fica onde está: quem drena filtra por
`status = 'pendente'`, então mudar o status já para a tentativa. Zerar a data
exigiria afrouxar a coluna sem ganho nenhum.

### Como registrar quem pagou o ano inteiro adiantado

O caso Virgínia — pagou em janeiro/2026 por jan–dez, R$ 40/mês. Medido: no
banco ela **não tem contrato nenhum salvo** (`contratado = false`, valor e
ritmo nulos); os números na tela eram placeholders. A conferência já acusava.

O caminho é registrar **a verdade inteira**, não só o estado final:

1. ritmo da limpeza, valor mensal **R$ 40**, marcar *entra na rota*
2. **cobrar a cada 12 meses**, pagamento **no início do período** (adiantado)
3. próxima cobrança em **janeiro/2026** — e não em 2027
4. *Lançar as cobranças vencidas* → nascem **12 competências de R$ 40**
5. registrar o **pagamento de R$ 480 com data de janeiro/2026**

Ensaiado em produção e desfeito: 12 competências jan–dez/26, saldo final
**R$ 0,00**, e a próxima cobrança vira **01/01/2027 sozinha**.

Pôr direto "próxima cobrança em 2027" também deixaria ela em dia — e apagaria
2026 inteiro: nem a receita dos doze meses no painel, nem o registro de que ela
pagou. O saldo ficaria certo pelo motivo errado.
