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
