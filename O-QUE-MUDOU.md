# O que mudou — Zelo & Memória

**Este zip é o projeto inteiro, com a MESMA estrutura de raiz do `src.zip` que
você enviou** — `src/`, `migrations/`, `package.json`, `public/` e o resto no
mesmo lugar.

O pacote anterior estava embrulhado numa pasta `src-atualizado/`, e por isso
não sobrescreveu nada: ao descompactar, ele criava uma pasta nova ao lado da
sua em vez de substituir os arquivos. Se aquele pacote foi extraído no
repositório, **apague a pasta `src-atualizado/`** antes de usar este.

## Como aplicar

Descompacte por cima da raiz do repositório, aceitando substituir. Depois
`npm run build` e deploy.

## Exatamente o que muda

**4 arquivos alterados**
- `src/lib/agenda.ts` — a rota do dia passa a sair do endereço, não do GPS
- `src/middleware.ts` — as telas desligadas devolvem 404
- `src/app/painel/ui.tsx` — menu de 12 para 8 itens
- `src/app/painel/page.tsx` — links órfãos removidos

**6 arquivos/pastas novos**
- `src/lib/rota.ts` · `src/lib/conta-corrente.ts` · `src/lib/mensagens.ts`
- `src/app/campo/CardTumulo.tsx`
- `src/app/painel/fila/` · `src/app/api/fila/`

**4 migrations novas** em `migrations/` (todas já aplicadas no Supabase)

Nenhum outro arquivo do projeto foi tocado.

---

## Já aplicado no banco (projeto `cemiterio`)

Estas migrations **já rodaram** no Supabase. Estão aqui só para o repositório
voltar a reproduzir o produto.

| Migration | Situação |
|---|---|
| `0047_roteiro_por_endereco.sql` | já estava aplicada |
| `0047b_cadencia_semanal.sql` | já estava aplicada |
| planta do cemitério (quadras + ruas) | **aplicada agora** |
| `0049_familia_tumulo_conta_corrente.sql` | **aplicada agora** |
| `0050_fila_liberacao.sql` | **aplicada agora** |
| família por cliente existente | **aplicada agora** |

### Estado atual do banco

- 4 quadras · 39 ruas com ordem de caminhada
- 65 clientes · 65 famílias, cada cliente já é responsável financeiro da sua
- 0 túmulos — zerados a seu pedido, prontos para o recadastro
- Backup do que foi apagado em `backup_20260816` (tumulos, planos, servicos,
  gps_leituras, quadras)

---

## Arquivos ALTERADOS

### `src/lib/agenda.ts`

A mudança mais importante do pacote. `ordenarPorProximidade` foi substituída
por `ordenarPorEndereco`.

O que havia: a rota do dia era calculada por vizinho-mais-próximo em lat/lng.
Dois defeitos que custavam caro no chão do cemitério. Primeiro, túmulo sem
coordenada ia para o **fim da fila**, solto, fora de qualquer rua — e a Nina
descobria isso andando. Segundo, o GPS não conhece muro: enxergava um túmulo
do outro lado da divisa como "logo ali" e mandava ela bater na parede.

Agora a ordem é a que ela realmente caminha: **rua (ordem cadastrada) →
posição na rua**. Com serpentina — ruas alternadas são percorridas ao
contrário, para ela emendar uma na outra em vez de voltar ao começo.

Túmulo ainda sem rua fecha o dia em ordem alfabética: é um aviso visível de
cadastro incompleto, não um item perdido no meio da lista.

Também mudaram os três `select` que buscam serviços, para trazerem
`rua_id`, `ordem_na_rua` e `ruas(ordem)`.

---

## Arquivos NOVOS

### `src/lib/rota.ts`

- `ordenarRota` — quadra → rua → posição, com serpentina
- `posicionarNaRua` — deriva a ordem do GPS do cadastro, projetando as
  coordenadas sobre o eixo da rua
- `encaixarPeloGps` — onde entra um túmulo novo. **Nenhum vizinho é
  renumerado, nunca**: o novo recebe o ponto médio entre os dois vizinhos
- `resumirDia` / `fraseDoDia` — "Quadra 1 — Ruas 3, 4 e 5"
- `gerarCodigo` — `Q1-R5-007`, baseado na **ordem de cadastro**, não na
  posição, para que o código nunca mude depois de impresso na ficha

### `src/lib/conta-corrente.ts`

Lavagem lança débito, pagamento lança crédito, o saldo diz se está em dia.

O débito nasce do **período devido**, não do serviço executado — a lavagem
pode falhar (foto não sobe, sem sinal, esqueceu de tocar no botão), e o
financeiro não pode ficar refém do operacional.

Avulso entra na mesma conta como débito único, sem competência.

`situacao()` devolve a frase que a Sureya lê: "Em dia", "Em aberto ·
R$ 240,00", "Pago adiantado". Nada de "inadimplente".

### `src/lib/mensagens.ts`

Os quatro textos com as variáveis preenchidas. **Nenhum modelo de linguagem é
chamado.** `primeiroNome` preserva o tratamento: "Sr. João Batista da Silva"
vira "Sr. João", não "Sr.".

### `src/app/campo/CardTumulo.tsx`

O card de dois toques: `📷 TIRAR FOTO E COMEÇAR` e `📷 TIRAR FOTO E TERMINAR`,
mais `Não deu para fazer`. Um toque abre a câmera direto; sem tela
intermediária, sem botão "salvar". Só um botão aparece por vez — não existe
escolha a fazer.

A foto vem **primeiro** no card porque é assim que a Nina reconhece o túmulo.

### `src/app/painel/fila/page.tsx` e `src/app/api/fila/route.ts`

A fila de liberação. A Sureya vê a prévia exata — fotos e texto já com o nome
preenchido —, pode editar, e escolhe enviar ou descartar. O envio abre o
WhatsApp com o texto pronto, então a mensagem sai da conta dela, com a cara
dela.

O `update` só age em registro `aguardando`, o que protege contra clique duplo
reenviando a mesma mensagem para a família.

---

## Telas desligadas (novo)

### `src/app/painel/ui.tsx` — menu de 12 para 8 itens

Ficaram: **Início · Agenda · Liberação · Avulsos · Campo · Famílias ·
Financeiro · Config**.

Saíram do menu: Atendimento e WhatsApp (o agente de IA foi desligado — no
lugar entrou a Liberação), Plaquetas (a plaquinha de 4 cm aprovada não tem QR)
e Jazigos (virou um bloco dentro da ficha da família, não sumiu).

### `src/middleware.ts` — as rotas desligadas devolvem 404

CRM de leads, reajustes, agente, atendimento, conversas, WhatsApp, mapa,
plaquetas, jazigos, planos, portal antigo, avaliações, indicações e o
resolvedor de QR.

**Por que 404 e não apenas sumir do menu:** link antigo, favorito no celular e
histórico do navegador continuam funcionando. Meio-desligado é pior que
ligado, porque ninguém sabe o que está no ar.

**Nada foi apagado.** O código continua no repositório, os dados continuam no
banco. Religar é tirar a linha da lista `DESLIGADAS`.

### `src/app/painel/page.tsx` — links órfãos removidos

O card "esperando resposta" agora aponta para a Liberação; o aviso de leads
novos saiu; o card de rascunhos aponta para a fila.

---

## Cadastro em campo alinhado à estrutura nova (build mais recente)

**Era a peça que faltava antes do recadastro.** O cadastro ainda criava quadra
por texto livre — foi exatamente assim que quatro quadras viraram treze
(`QD 1`, `Q1`, `Qd 1`, `Q01`, `Quadra 1` eram o mesmo lugar). E não preenchia
`rua_id`, `ordem_na_rua` nem `codigo`, então o roteiro novo não funcionaria.

### `src/app/api/tumulos/route.ts`
- Quadra **escolhida da lista**, nunca criada por digitação. Se o código não
  existe, a resposta devolve as quadras disponíveis.
- Rua obrigatória e validada contra a tabela `ruas`.
- `ordem_na_rua` calculada pelo GPS via `encaixarPeloGps` — o novo entra
  **entre** os vizinhos certos, sem renumerar nenhum.
- `codigo` gerado a partir do contador `ruas.seq_cadastro`.

### `src/app/campo/CapturarJazigo.tsx`
Quadra e rua viraram **listas suspensas**. Trocar de quadra recarrega as ruas
e limpa a escolha, porque a "Rua 5" da Quadra 1 e a da Quadra 2 são trechos
físicos diferentes.

### `src/app/api/ruas/route.ts` (novo)
Lista as ruas de uma quadra, na ordem de caminhada.

### `src/app/api/tumulos/[id]/gps/route.ts`
Recalcula a posição do túmulo quando a coordenada chega **depois** do
cadastro. Sem isso, quem salva a ficha e só então marca o GPS ficaria no fim
da rua para sempre. Se o recálculo falhar, o GPS continua salvo — é melhoria,
não requisito.

---

## FASE 1 — o ciclo da lavagem fechado

### 1.1 · Campo de dois toques — `src/app/campo/page.tsx`

O fluxo antigo tinha cinco passos, cada um uma tela: confirmar o jazigo, tirar
a foto, começar, abrir a tela de conclusão, tirar a foto de novo, revisar,
enviar.

Agora são **dois botões, com a câmera dentro de cada um**:

- `📷 TIRAR FOTO E COMEÇAR`
- `📷 TIRAR FOTO E TERMINAR`
- `Não deu para fazer`

Um toque abre a câmera. Ela fotografa, confirma na própria câmera, e o app já
registrou. Só um botão aparece por vez — não existe escolha a fazer.

As telas `ConfirmarJazigo` e `Concluir` saíram do caminho, mas **os arquivos
continuam no repositório**: se a confirmação por QR fizer falta, é só voltar a
chamá-las.

O GPS agora corre por fora e **nunca segura o envio** — ele é opcional, entra
só numa média. Segurar a Nina parada no sol esperando sinal era o pior negócio
possível. A fila offline continua intacta.

### 1.2 · Rascunho automático na fila — `src/app/api/servico/concluir/route.ts`

A tela da fila existia, mas nada a alimentava: ela estaria sempre vazia.

Agora, ao concluir uma lavagem, o sistema monta o rascunho com as fotos e o
texto já preenchido e insere em `fila_liberacao` como `aguardando`. **Nada é
enviado aqui.** Fica parado até a Sureya aprovar, uma mensagem por vez.

O destinatário é quem recebe fotos, não necessariamente quem paga: é o filho
que acerta a conta, mas às vezes é a neta que acompanha o cuidado.

Todo o bloco vai em `try/catch` mudo: se o rascunho não nascer, a lavagem
continua registrada e a foto salva. O operacional nunca cai por causa do
recado.

### 1.3 · Briefing da manhã — `src/lib/briefing.ts` e a tela de campo

A frase que ela lê no portão, antes de dar o primeiro passo:

> **Hoje: Quadra 1 — Ruas 3, 4 e 5**

Vem **antes** do número de jazigos, porque saber que "são 11" não ajuda a se
posicionar; saber para onde andar, sim.

As ruas saem na ordem em que se caminha (`ruas.ordem`), não na ordem do nome —
a Rua 7 pode ser a terceira a ser percorrida. E a frase só abrevia para
"Ruas 3, 4 e 5" quando todas são numeradas: com uma transversal no meio, sai
"Rua 8 e Transversal 3", que é como se fala.

---

## FASE 2 — conta corrente e cobrança

### 2.1 · Migração *(já aplicada no banco)*

Os 2 lançamentos de `movimentos` foram convertidos para `conta_corrente`,
passando de **por cliente** para **por família** — porque o túmulo pertence à
família e quem paga pode ser outra pessoa da mesma casa.

A tabela `movimentos` **não foi apagada**: fica como histórico e rede de
segurança.

### 2.2 e 2.4 · `src/app/api/conta-corrente/route.ts` (novo)

`GET` devolve o extrato da família com o saldo somado **no servidor** — o
saldo é o que a Sureya lê antes de ligar, não pode depender de a lista ter
sido paginada.

`POST` lança **pagamento** ou **avulso**. O débito por competência não passa
por aqui: ele nasce do fechamento do ciclo, não de um clique.

A frase é escrita para ser dita ao telefone: "Em dia", "Em aberto ·
R$ 240,00", "Pago adiantado · R$ 20,00 a favor". Nunca "inadimplente".

### 2.3 · `src/app/api/financeiro/competencia/route.ts` (novo)

`GET` é a **prévia** — mostra o que entraria sem gravar nada, já descontando
o que foi lançado antes. `POST` lança de verdade.

Os inserts vão **um a um, de propósito**. Em lote, um único conflito
derrubaria a transação inteira e o mês ficaria sem cobrança nenhuma — o erro
mais caro possível. Assim o que já existia é pulado e o resto entra.

**A trava contra cobrar duas vezes foi testada no banco de produção**: criei
um túmulo de teste, lancei a mesma competência duas vezes e o Postgres barrou
a segunda. O túmulo de teste foi removido em seguida.

### 2.5 · `src/app/painel/fechamento/page.tsx` (novo) + menu

A tela do mês: gerar a cobrança do período e ver quem está em aberto.

A prévia vem **antes** de gravar, sempre — lançar dívida na conta de 65
famílias sem olhar o que vai entrar é o tipo de botão que ninguém deveria ter.

A lista de em aberto é ordenada pela **dívida mais antiga**, não pelo valor:
quem deve há três meses precisa de uma conversa diferente de quem esqueceu o
mês corrente, e é a antiguidade que revela isso.

### Correções encontradas no caminho

- A tela da fila estava **sem o menu**: a Sureya entraria e não teria como
  sair. Corrigido.
- `painel.dica` não existe no `ui.tsx` — o estilo estava indefinido.
- O import de `PainelNav` estava como default; é named export.

---

## FASE 3 — a ficha da família redesenhada

### 3.1 · Blocos da IA removidos

Saíram: atendimento da IA (modo copiloto, instruções por contato), memória
destilada, "treinar com histórico", chave de envio automático, score de
entendimento e o card de últimas mensagens.

**O botão "Abrir conversa" estava quebrado** — apontava para
`/painel/conversas`, que passou a devolver 404 quando o agente foi desligado.
No lugar entrou um botão de **WhatsApp** que abre a conversa com a família
direto.

`ChaveEnvio` continua no arquivo, marcado como desligado: a lógica de
ligar/desligar por contato volta a servir se um dia existir envio programado.

### 3.2 · Cabeçalho com o saldo em destaque

O saldo agora vem em corpo 30, com a frase em português: "Em dia", "Em aberto
· R$ 240,00", "Pago adiantado · R$ 20,00 a favor". Antes ele dividia espaço
com o score da IA — que aparecia **maior que o dinheiro**.

Atenção ao sinal: a API de cliente devolve crédito como positivo, o oposto da
conta corrente. A ficha inverte (`devendo = -d.saldo`) para que "em aberto"
signifique a mesma coisa nas duas telas.

### 3.3 · Bloco "Pessoas da família"

Lista quem paga e quem acompanha, com as etiquetas *paga* e *recebe fotos*.
Só aparece quando existe mais de uma pessoa — com uma só, não ocupa espaço.

Precisou de duas correções na API: `/api/clientes/[id]` não devolvia
`familia_id` (o extrato ficaria mudo) e `/api/clientes` não tinha filtro por
família.

### 3.4 · Ordem invertida: túmulos antes do dinheiro

Antes: pagamentos → IA → túmulos. Agora: **cabeçalho → pessoas → túmulos →
conta corrente → limpezas → ajustes**.

Primeiro o que foi contratado, depois o que isso gerou de dívida. A ordem
antiga mostrava o dinheiro sem mostrar o que foi vendido.

O novo bloco **Conta corrente** substitui "Pagamentos recebidos": débito e
crédito lado a lado, cada débito com a sua competência e o seu túmulo, mais os
botões de registrar pagamento e lançar avulso.

### 3.5 · Ajustes recolhidos

Régua de cobrança, saldo de abertura, privacidade e excluir entraram numa
gaveta fechada por padrão. São coisas de configurar uma vez, e ocupavam o fim
da ficha competindo com o que se usa todo dia.

### Correção encontrada no caminho

`useRouter` ficou importado sem uso depois de remover o `abrirConversa` —
quebraria o lint no build. Removido.

---

## CORREÇÃO IMPORTANTE — a fila agora envia as FOTOS

**Falha do que eu tinha entregado:** a fila mandava pelo link `wa.me`, que
carrega **só texto**. As fotos do antes e do depois — o motivo da mensagem
existir — ficariam para trás, e a Sureya teria que anexá-las à mão depois de
aprovar. Isso devolveria exatamente o trabalho que a fila existe para tirar.

### `src/app/api/fila/route.ts`

O envio passou para a **Evolution**, usando `enviarWhatsappMidia`, que já
existia no projeto. A legenda vai na primeira foto: a família abre a conversa
e vê a imagem com a palavra junto, como quem manda uma foto para um parente —
não um texto seguido de anexos soltos.

Isto **não é o agente de IA de volta**. Nada sai sozinho: cada envio é
consequência direta de a Sureya olhar a prévia e tocar em "Enviar".

Três proteções:

- **Reserva antes de enviar.** O item muda para `enviando` e só o primeiro
  pedido consegue. Sem isso, um clique duplo mandaria a mesma foto duas vezes
  — e o WhatsApp não tem desfazer.
- **Volta para a fila se falhar.** Marcar como enviada uma mensagem que não
  saiu faria a família sumir da lista sem ter recebido nada, e ninguém
  descobriria.
- **Mensagem específica para WhatsApp caído**, em vez de um erro genérico.

Foi preciso acrescentar o valor `enviando` ao enum `sureya_status_fila`
*(já aplicado no banco)*.

### `/painel/whatsapp` voltou

Eu havia desligado essa tela junto com o agente. **Ela é a única forma de
reconectar a instância da Evolution** — e a Evolution voltou a ser essencial
para entregar as fotos. Sem ela, um WhatsApp caído virava beco sem saída.
Voltou ao menu e saiu da lista de rotas bloqueadas.

### Aviso de conexão na própria fila

A listagem devolve o estado da instância, e a tela mostra uma faixa quando o
WhatsApp está caído, com link para reconectar. Sem isso, a Sureya revisaria
todas as mensagens e só descobriria o problema no último clique.

---

## SITUAÇÃO INICIAL E REGISTRO DE LAVAGEM

### Situação inicial da família *(já aplicado no banco)*

O sistema entra em operação com contas já em andamento: uma família deve três
meses, outra pagou o ano adiantado. Sem poder lançar isso, o extrato começaria
mentindo — todo mundo "em dia" no primeiro dia.

Na ficha, o botão **"Situação inicial"** aparece enquanto a família ainda não
tem uma. O sinal do número decide o lado:

- `240` → a família **deve** R$ 240
- `-80` → a família tem **R$ 80 a favor** (pagou adiantado)

É lançada **uma vez só**. Um índice único no banco recusa a segunda — lançar
duas dobraria a dívida inicial de alguém, e pareceria um lançamento legítimo
no extrato. *(Testado em produção: a segunda foi barrada.)*

O botão some depois de lançada, para não convidar ao erro.

### Lavagens no extrato, com valor zero

Cada limpeza concluída passa a aparecer na conta corrente como
`Limpeza realizada · Q1-R5-007`, com **valor zero**.

Assim a Sureya vê tudo numa lista só: *limpou dia 15, limpou dia 22, cobrou no
fim do mês*.

**O saldo ignora esses registros**, e isso é o ponto central. Quem gera a
dívida é a competência; se a lavagem também lançasse valor, a família seria
cobrada duas vezes pelo mesmo serviço — uma pela execução e outra pelo
fechamento do mês. O filtro é explícito no cálculo, não confia só no zero.

Na tela a lavagem aparece como **"✓ serviço feito"**, e não como "+ R$ 0,00",
que pareceria uma cobrança de valor zero.

*(Testado em produção: duas lavagens registradas não alteraram o saldo.)*

---

## VERIFICAÇÃO COMPLETA — o que foi encontrado e corrigido

Varredura de links quebrados, becos sem saída, consistência de linguagem e
riscos de build.

### 1. O site público levava a família para um 404 *(o mais grave)*

Três links **"Já sou cliente"** na home e um na página do cemitério apontavam
para `/familia` — o portal, que está desligado. Qualquer família que clicasse
via um 404, e o site promete isso em três lugares diferentes.

Agora apontam para o **WhatsApp**, que é onde a Sureya realmente atende.
Quando o portal existir (Fase 4), voltam para lá.

### 2. O mapa desligado continuava acessível por uma porta lateral

A tela `/painel/clientes` tinha uma aba **"Mapa"** que renderizava
`VisaoMapa` — ou seja, o mapa com pinos continuava no ar por dentro, mesmo com
a rota `/painel/mapa` devolvendo 404. Aba e import removidos.

### 3. O menu dizia uma coisa e a tela dizia outra

O item de menu é **"Famílias"**, mas o título da tela era **"Carteira"**. A
Sureya clicava numa palavra e chegava noutra. Título corrigido.

### 4. Linguagem uniformizada

O sistema usa **"jazigo"** em toda parte (33 vezes só na ficha, e em todo o app
da Nina). Eu havia introduzido "túmulo" em dois pontos, criando uma tela meio
a meio. Desfeito — melhor uma palavra só.

**Fica a decisão para vocês:** o código diz "jazigo", mas você e a Sureya
falam "túmulo" o tempo todo. Para a Nina, "túmulo" é provavelmente mais
direto. É uma troca em todos os textos visíveis — faço se quiserem, mas de uma
vez, não pela metade.

### 5. Sem imports órfãos

Varri os doze arquivos alterados: nenhum import sem uso. Era o risco real de
`npm run build` falhar depois das remoções.

### O que ficou íntegro

- As dez rotas do menu existem
- Nenhuma tela ativa do painel está sem navegação
- A Nina tem volta ao painel, sair, cadastro de jazigo, frase do dia e os dois
  toques
- A tela de recibo abre em aba nova, por isso não precisa de menu

---

## VERIFICAÇÃO COMPLETA — o que a varredura encontrou

Varredura automática por link quebrado, beco sem saída, import órfão e
chamada a API inexistente, em todo o `src/`.

### Corrigido: link quebrado em `PedidosAdicionais.tsx`

O botão **"abrir conversa"** levava para `/painel/conversas`, desligada — daria
404. Removido junto com o import de `Link`, que ficaria órfão e quebraria o
lint no build.

Esse componente aparece na tela inicial, então o botão morto estava à vista de
todo dia.

### Corrigido: duas portas para dinheiro

Era o pior problema de usabilidade do conjunto. O menu tinha **"Financeiro"** e
**"Fechamento"**, e o Financeiro ainda tinha uma aba chamada **"O mês"** — três
entradas para a mesma coisa, sem nenhuma pista de qual abrir.

Agora dinheiro tem **uma porta só**: o Financeiro, com "Fechar o mês" como
primeira aba. A página `/painel/fechamento` continua existindo para quem
chegar por link ou favorito.

### Corrigido: abas do Financeiro de sete para quatro

Quatro serviam ao escopo que saiu: gestão por categoria contábil, conta da
equipe, pagamento da equipe e reajustes. Ficaram **Fechar o mês · O mês ·
Conferir entradas · Resultado por jazigo**. As removidas continuam no arquivo.

### Menu final — 9 itens

`Início · Agenda · Liberação · Avulsos · 📍 Campo · Famílias · Financeiro ·
WhatsApp · Config`

### Verificado e sem problema

- Nenhum outro link aponta para tela desligada
- Nenhum import órfão nos arquivos editados
- Nenhuma chamada `fetch()` para API inexistente
- Nenhuma tela do painel sem menu (o recibo abre em aba nova, de propósito)
- A Nina tem saída do campo de volta para o painel
- Chaves e fragmentos JSX balanceados em todos os arquivos tocados

---

## FASE 4 — a tela "O Mês" e o portal

### 4.1 · `src/app/painel/page.tsx` reescrito + `src/app/api/mes/route.ts` (novo)

O início do painel agora responde de cima para baixo a única pergunta que
importa no dia a dia: **quem foi limpo e quem pagou**.

Uma linha por família, com as duas colunas escritas por extenso ("feita" /
"falta", "em dia" / o valor). Um ✓ e um ✗ sozinhos exigiriam decorar qual é
qual.

**As pendências sobem.** Quem está devendo E sem limpeza aparece primeiro; o
filtro abre em "Só as pendentes". Assim a tela serve sem rolar.

No topo, três números: falta limpar, falta pagar e quanto isso soma. O que
havia antes — capacidade do dia, rascunhos da IA, leads novos e indicadores de
gestão — era de um sistema fora de escopo, e nada dizia se o mês estava
fechando.

O bloco `Rotinas` foi preservado: é diagnóstico de cron, e some sozinho quando
está tudo certo.

### 4.2 · Portal da família com o antes e o depois

A função `sureya_portal_historico` no banco devolvia **só a foto do depois**.
Agora devolve o par *(já aplicado)*. Precisou de `drop` + `create` na mesma
transação — o Postgres não deixa mudar o tipo de retorno, e fazer as duas
juntas evita que a função fique ausente para o portal.

Na tela, antes e depois aparecem lado a lado com legenda. Quando a foto do
antes falta — a Nina consegue começar sem foto se a câmera falhar ou a mão
estiver suja — mostra só o depois, sem quebrar.

**O portal saiu da lista de rotas bloqueadas.** Eu o havia desligado; ele
voltou porque a pedra suja ao lado da pedra limpa é o que mostra o cuidado, e
porque tira peso da Sureya: quem quiser conferir, confere sozinho. Acesso por
link sem senha — idoso não guarda senha.

O bloco que gera e copia o link já existia na ficha, por túmulo.

---

## FECHAMENTO AUTOMÁTICO DO MÊS

### `src/lib/competencia.ts` (novo) + `src/app/api/cron/mensal/route.ts` (novo)

O endpoint de competência existia, mas ninguém o chamava: a Sureya precisava
lembrar de clicar todo dia 1. Agora roda sozinho.

**A regra saiu da rota e foi para o lib**, porque agora tem dois donos — o
cron e o botão da tela. Duplicar cálculo de dinheiro em dois lugares é como um
deles acaba divergindo do outro sem ninguém notar.

**Por que automatizar isto, se decidimos não automatizar mensagens:** a
diferença é quem recebe. Mensagem automática vai para a família, e é ali que o
robô estraga o vínculo — por isso a fila de liberação existe. Este cron não
fala com ninguém: só escreve na conta corrente, que é ferramenta interna. E é
justamente o esquecimento do lançamento que faz o dinheiro sumir em silêncio.

**Nada é cobrado sozinho por causa disso.** O débito entra no extrato; a
mensagem de cobrança continua saindo só quando a Sureya aprova na Liberação —
e a tela agora diz isso com todas as letras.

Agendado em `vercel.json` para **dia 1 às 8h de São Paulo** (11h UTC). Rodar
duas vezes é inofensivo: o índice único recusa o repetido e o resultado diz
quantos foram pulados.

**Testado com três ciclos diferentes:** o semanal/mensal cobra todo mês
(R$ 160); o mensal/anual iniciado em agosto cobra só em agosto (R$ 720); o
quinzenal/trimestral iniciado em junho fecha em setembro e dezembro (R$ 300).
Os túmulos de teste foram removidos.

---

## BUILD CORRIGIDO E VALIDADO

O deploy quebrou em dois pontos. Os dois estão corrigidos, e desta vez o
`next build` foi **executado de verdade aqui**: passou limpo, sem erro e sem
um único warning.

### 1. `PainelFechamento is not a valid Page export field`

Um arquivo `page.tsx` do Next só pode exportar `default` e alguns campos
reservados (`metadata`, `dynamic`, `revalidate`…). Eu exportei o componente
dali para o Financeiro reusar — e isso derruba o build.

O componente foi para **`src/app/painel/fechamento/Fechamento.tsx`**. A
`page.tsx` ficou só com o `default`, e o Financeiro importa do arquivo novo.

Varri **todos** os `page.tsx`, `layout.tsx` e `route.ts` do projeto atrás do
mesmo padrão: nenhum outro caso.

### 2. Três referências órfãs em `campo/page.tsx`

`setFinalizando` e `setConfirmando` sobraram em dois lugares depois que os
modais saíram: no link direto `?servico=ID` e no botão "começar" do
*Como chegar*.

Não dava para simplesmente apagar — os dois casos precisam levar a Nina até o
jazigo certo. Agora ambos **destacam o cartão e o puxam para a tela**
(`scrollIntoView` com contorno azul). Com a câmera dentro do botão não existe
mais tela intermediária para abrir; o que faz sentido é mostrar onde tocar.

### Como isso passou batido antes

Eu vinha verificando por inspeção — contagem de chaves, busca por referências
órfãs — porque não havia `node_modules` no ambiente. Instalei as dependências
e rodei `tsc --noEmit` e `next build` completos. Os dois erros apareceram em
segundos.

**Daqui em diante, todo pacote passa pelo build antes de ser entregue.**

---

## A RUA 7 É DIVISA — corrigido

### O problema

A Rua 7 separa as quadras de baixo das de cima. Os túmulos de um lado dela são
da Quadra 1; os do outro lado, da Quadra 3. Mas é **uma rua só no chão**: a
Sureya percorre uma vez e limpa os dois lados.

Duas falhas:

1. No cadastro, a Rua 7 só existia nas quadras 1 e 2. Faltava nas de cima.
2. Pior: o roteiro mandaria a Nina **andar a Rua 7 duas vezes no mesmo dia** —
   uma no bloco da Quadra 1, outra no da Quadra 3 — porque a ordem era quadra
   primeiro, rua depois.

### A solução — `ruas.chave_fisica` *(já aplicada no banco)*

Ruas que são o mesmo caminho no chão compartilham uma chave. O roteiro agrupa
por ela e trata o conjunto como **uma parada só**, posicionada onde a primeira
metade cai na caminhada.

- Rua 7 criada nas quadras 3 e 4, com ordem 0 — subindo o cemitério, ela é a
  primeira rua das quadras de cima.
- `rua7-direita` amarra Quadra 1 + Quadra 3; `rua7-esquerda` amarra 2 + 4. Os
  lados seguem separados porque a Principal passa no meio.
- Fica nula para rua comum: nada muda para as outras.

### No código

A divisão por quadra saiu do alocador e passou para dentro de
`ordenarPorEndereco`. Enquanto o dia era partido por quadra **antes** de
ordenar, nenhuma rua compartilhada conseguiria se juntar.

**Testado:** com túmulos na Rua 5, 6 e 7 da Quadra 1 e na Rua 7 e 8 da Quadra
3, a ordem sai `Rua 5 → Rua 6 → Rua 7 (Q1) → Rua 7 (Q3) → Rua 8`. A Rua 7
aparece uma vez, com os dois lados juntos, no lugar certo.

`next build` executado: passou limpo.

### As transversais também *(aplicado)*

Mesma natureza: cada transversal corre da Rua 1 à Rua 13, atravessando a
divisa, e estava partida na altura da Rua 7. O caso já era real — a
Transversal 3 tinha 11 túmulos numa metade e 1 na outra.

As seis receberam a chave `transversal-N`. Os lados não se juntam entre si: a
Principal passa no meio, e a Transversal 1 da direita não tem relação com a 4
da esquerda.

**Oito ruas físicas amarradas no total:** `rua7-direita`, `rua7-esquerda` e
`transversal-1` a `transversal-6`.

Registrado em `migrations/0051_ruas_fisicas_compartilhadas.sql` para o
repositório reproduzir o produto.

**Testado com o cenário real do banco:** cada rua física aparece uma vez só,
como bloco contíguo. A Transversal 3 sai invertida (Quadra 3 → Quadra 1) pela
serpentina, o que é o certo: a Nina termina a Rua 7 no lado de cima e desce
limpando, em vez de voltar ao começo à toa.

---

## CARA DE SISTEMA — a fundação visual

O painel não tinha esqueleto: cada tela desenhava a si mesma com objetos de
estilo em linha, sem coluna de navegação, sem tokens, sem ícones. Por isso
parecia um conjunto de páginas soltas, e não um sistema.

### O que entrou

**Tailwind + `src/app/tema.css`.** As cores viraram variáveis CSS num arquivo
só. Um tema escuro — ou um contraste maior para a Sureya ler no sol do
cemitério — passa a ser um bloco de CSS, não uma revisão de vinte telas. O
tema escuro já está escrito.

A marca saiu do logotipo: azul-marinho do escudo e dourado do raminho. O
dourado é **acento** — filete, ícone, destaque —, nunca fundo de texto: em
corpo pequeno ele não alcança contraste, e num serviço de memória o excesso
de ouro vira ostentação.

**`Sidebar.tsx` + `AppShell.tsx` + `painel/layout.tsx`.** Coluna escura fixa
no desktop, gaveta no celular. A coluna é escura nos dois temas de propósito:
é ela que separa "onde eu ando" de "o que eu estou fazendo".

Os nove itens vieram em três grupos (Dia a dia · Carteira · Ajustes) porque
lista corrida não tem hierarquia — a Sureya lia todos toda vez para achar um.

O item ativo ganha **filete dourado** além da cor de fundo: cor sozinha não
basta para quem não distingue bem tons sobre escuro.

Vive num `layout.tsx`, e não em cada tela, para a navegação **não remontar** a
cada troca de página. Era esse remonte que fazia cada tela parecer um site
diferente.

**`globals.css`.** Anel de foco na cor da marca (o padrão do navegador some
sobre fundo escuro) e alvo de toque mínimo de 44px — a Nina usa de pé, no sol,
às vezes de luva.

### Como a troca foi feita sem quebrar nada

O `PainelNav` das quinze telas passou a **não renderizar nada**, e o menu vive
no shell. Assim a mudança aconteceu sem editar quinze arquivos de uma vez, e
sem risco de deixar alguma tela sem navegação no caminho. Conforme cada tela
for reescrita no visual novo, a chamada sai junto.

`next build` executado: passou limpo.

### O que vem a seguir

A ficha da família reescrita neste visual, e a limpeza dos campos inúteis —
levantei **18 campos no editor de túmulo/plano, dos quais cerca de 7
importam**. Sobraram do sistema antigo: datas de nascimento e falecimento
(eram gatilho de mensagem automática), número do jazigo (duplica a
identificação), tratamento, régua de cobrança, dias entre lembretes, máximo de
lembretes e convite a cada N meses.

---

## A FICHA DA FAMÍLIA REESCRITA

**De 2.518 linhas para 450.** O peso da tela caiu de 20,1 kB para 5,19 kB.

### A ordem, agora

Cabeçalho com a situação → túmulos → conta corrente → limpezas.

Primeiro quem é a família, depois o que ela contratou, depois o que foi feito,
e só então se está pago. A ficha antiga fazia o contrário: pagamentos na
quarta posição, túmulos na sexta — o dinheiro antes do que foi vendido.

### Os campos que morreram

O editor de túmulo/plano tinha 18 campos. Ficaram 7, e todos são usados toda
semana. Saíram, com o motivo:

| Campo | Por que sai |
|---|---|
| Número do jazigo | duplicava a identificação |
| Nascimento e falecimento | eram gatilho de mensagem automática, desligada |
| Tratamento | idem |
| Régua de cobrança | automação de lembrete, desligada |
| Dias entre lembretes · máx. de lembretes | idem |
| Convite a cada N meses | campanha de ativação, desligada |
| Lavagens no período · Dá por mês | derivados da periodicidade |
| Pago até · Próxima cobrança | a conta corrente responde melhor |

Os três atributos que sobram — **valor por limpeza**, **a Nina limpa** e **a
família paga** — ficam lado a lado e visivelmente separados. É isso que impede
o erro de tratar periodicidade e cobrança como a mesma coisa.

Escrevi os rótulos em linguagem de conversa: "toda semana", "a cada quinze
dias", "uma vez por ano" — e não `semanal`/`quinzenal`/`anual`.

### `src/app/painel/pecas.tsx` (novo)

Cartão, campo, entrada, seleção, botão e selo, num lugar só. Existem porque
cada tela vinha desenhando o próprio cartão com estilo em linha, e por isso
duas telas do mesmo sistema nunca ficavam iguais.

O **selo carrega o significado no texto** ("em dia", "sem plano · avulso"),
não só na cor: cor sozinha não atravessa daltonismo nem tela no sol.

### `src/app/api/tumulos/[id]/route.ts`

O PATCH não aceitava `valor_lavagem`, `periodicidade` nem `freq_pagamento` —
sem isso a ficha nova não teria como salvar. Agora aceita, e também
`familia_id`.

### A ficha antiga

Guardada em `_arquivo/ficha-antiga.tsx.txt`, **fora do `src/`** para o Next
não tentar compilá-la. Nada foi perdido.

`next build` executado: passou limpo.

---

## A IDENTIFICAÇÃO ERA OBRIGATÓRIA — e não devia

**O erro foi meu.** O campo nasceu obrigatório supondo que o túmulo tivesse
número gravado. Não tem. E campo obrigatório sem resposta verdadeira produz
resposta falsa: no primeiro cadastro apareceram `A`, `A2`, `A3`… só para
conseguir salvar.

Olhando os 71 túmulos cadastrados, porém, **62 não eram lixo**: eram
sobrenomes — Almeida, Barreta, Benedetti. Isso é o que está escrito na pedra,
e ajuda a Nina a confirmar que chegou no lugar certo. Só 9 eram provisórios.

### O que mudou *(banco já aplicado)*

- `identificacao` deixou de ser obrigatória.
- Os 9 provisórios viraram nulo — todos têm código, nada se perdeu.
- Os 62 sobrenomes ficaram como estavam.
- O rótulo virou **"Nome escrito na pedra (opcional)"**, no cadastro de campo
  e na ficha.

Quem identifica o túmulo continua sendo o `codigo` (Q1-R5-007) e a foto.

### Editar o que já foi cadastrado

A ficha agora edita **quadra, rua e nome na pedra** — é lá que o erro
acontece, porque o cadastro é feito de pé, no cemitério.

Ao trocar de rua, o PATCH atualiza o `rua_id` junto com o texto. Gravar só o
texto deixaria o túmulo escrito "Rua 5" e ainda sendo percorrido na Rua 2. A
posição vira nula: ele entrou numa rua nova e vai para o fim dela até a Sureya
arrastar — melhor que herdar uma posição de outra rua.

O código aparece discreto no cartão, para conferência.

---

## TELAS MIGRADAS PARA O VISUAL NOVO

`O mês` e `Liberação` — as duas que a Sureya abre todo dia — foram reescritas
com as peças de `pecas.tsx`.

Na tela do mês, as duas colunas viraram **selos com texto**: "limpa", "falta
limpar", "em dia", o valor. Cor sozinha não atravessa daltonismo nem tela no
sol.

Faltam `Famílias`, `Agenda`, `Avulsos`, `Financeiro` e `Config` — todas
funcionam, só ainda usam o estilo antigo por dentro. O shell já as envolve,
então a navegação é a mesma.

`next build` executado: passou limpo.

---

## TODAS AS TELAS NO VISUAL NOVO

Duas estratégias, conforme o risco de cada tela.

### Reescritas com `pecas.tsx`

`O mês` · `Liberação` · `Ficha da família`

São as três que a Sureya abre todo dia. Ganharam cartões, selos e botões do
sistema novo.

### Reestilizadas pela raiz

`Famílias` · `Agenda` · `Avulsos` · `Financeiro` · `Config`

Somam mais de 2.300 linhas — só o Config tem 1.157. **Reescrever à mão
arriscaria perder função**, e a de Famílias carrega o vínculo de jazigo órfão,
que está em uso agora, no meio do recadastro.

Em vez disso, reapontei a origem das cores no `ui.tsx`: `cor.navy`, `cor.card`
e companhia deixaram de ser hex cravado e passaram a ler os tokens do
`tema.css`. Todas as telas que usam esses objetos passaram a falar a mesma
língua visual — e o tema escuro alcança elas de graça, sem uma linha nova.

Também alinhei cartão, título, entrada e botão com o desenho das peças novas,
e neutralizei `wrap`/`conteudo`: o shell já dá fundo, largura e espaçamento, e
sem isso as telas antigas desenhavam uma segunda moldura dentro da primeira.

### Cores soltas

Havia **269 hexes cravados** nas telas. Mapeei os recorrentes com significado
claro — vermelho de erro, âmbar de pendência, verde de "em dia", cinzas de
superfície — para os tokens: **172 trocadas em 21 arquivos**.

As 97 restantes estão quase todas em telas desligadas (leads, conversas,
plaquetas, jazigos), onde não vale gastar risco.

### O app da Nina não foi tocado

`/campo` tem estilos e layout próprios, e o shell do painel não o envolve.
Ele foi desenhado para uso de pé, no sol, com botão grande — misturar com o
visual de escritório seria piorar.

`next build` executado: passou limpo.

---

## A FICHA VOLTOU A TER FUNÇÃO

**Erro meu.** Ao enxugar de 2.518 para 450 linhas eu cortei função junto com o
excesso. Sumiram, sem aviso: editar a família, pessoas, adicionar túmulo,
registrar limpeza à mão, link do portal, exportar dados e excluir.

Cortar cadastro morto é diferente de cortar o que se usa. Errei a mão.

### O que voltou

| Bloco | O que faz |
|---|---|
| **Dados da família** | editar nome, WhatsApp e observações — a coisa mais básica que se faz aqui |
| **Pessoas da família** | o filho que paga, a neta que acompanha (só aparece com mais de uma) |
| **Adicionar túmulo** | quadra e rua das listas, para não repetir a bagunça de digitação |
| **Registrar limpeza** | nem toda limpeza passa pelo app da Nina — a Sureya faz uma de vez em quando |
| **Link do portal** | gera e copia o link sem senha que a família abre |
| **Exportar dados · Excluir** | dentro de "Ajustes", recolhido |

### A conta corrente sempre esteve lá

Fica **entre os túmulos e as limpezas**, com o extrato e os três botões:
registrar pagamento, lançar avulso e situação inicial.

Se ela não aparecia, é porque a família não tinha vínculo — nesse caso o
cartão explica em vez de sumir. Vale conferir se o que está no ar já é esta
versão: até publicar, o site mostra a ficha antiga.

### O tamanho certo

450 linhas era pouco demais; 2.518 era o inchaço antigo. Ficou em **903** — e
a diferença para as 2.518 não é função, é o cadastro morto (datas de gatilho,
tratamento, régua de cobrança, lembretes, ativação) mais os blocos da IA.

`next build` executado: passou limpo.

---

## O COMPROVANTE SEM WHATSAPP — lacuna fechada

### O problema, que era grave

O comprovante só entrava por **um** caminho: a família mandava a foto do Pix
no WhatsApp e o agente de IA lia (`lib/atendimento.ts`). Os dois lados desse
caminho estão desligados — o agente por decisão nossa, e a instância pode cair
a qualquer momento, como está agora.

Ou seja: **não havia como registrar um comprovante.** O dinheiro entrava na
conta da Sureya e o sistema não sabia.

### `src/app/api/comprovantes/anexar/route.ts` (novo)

Ela tira uma foto da tela — ou escolhe o print que a família mandou no
WhatsApp pessoal dela — e anexa. Funciona com a instância de pé ou caída, sem
depender de nenhuma automação.

O status nasce **`confirmado`**, e não `a_conferir`: quem anexou foi a própria
Sureya, olhando. O `a_conferir` existia para o que o robô lia sozinho e podia
errar.

### Na ficha

O botão **"Anexar comprovante"** aparece dentro do formulário de pagamento —
no mesmo gesto, e não num fluxo à parte. Anexar depois é o tipo de tarefa que
ninguém volta para fazer.

A imagem sobe **antes** do lançamento. Se ela falhar, nada é gravado e a
Sureya tenta de novo; na ordem inversa, ela ficaria com um pagamento
registrado sem prova e sem saber.

No extrato, cada lançamento com comprovante ganha **"ver comprovante"**. A URL
vai junto na resposta da API — mostrar "tem comprovante" sem poder abrir seria
pior que não mostrar nada.

### Onde fica a conta corrente

**Dentro da ficha da família**, entre os túmulos e as limpezas. É lá que a
pergunta nasce ("esta família está em dia?"), então é lá que a resposta tem de
estar.

A visão de todas as famílias em aberto fica em **Financeiro → Fechar o mês**.

`next build` executado: passou limpo.

---

## OS TÚMULOS DO CAMPO PRECISAM CHEGAR NA FAMÍLIA

### O que o banco mostrou

**Os 71 túmulos cadastrados no campo estão todos órfãos** — nenhum com
família. Como a conta corrente e a tela do mês penduram na FAMÍLIA, o trabalho
da Nina existia no banco e era invisível no sistema. É por isso que as fichas
apareciam vazias.

### `src/lib/jazigo.ts` — o vínculo gravava só metade

Ao ligar um jazigo a uma família, o código gravava `cliente_id` e **não**
`familia_id`. Mesmo vinculando à mão, o túmulo continuaria fora da conta
corrente.

Corrigido nos dois caminhos: ao vincular um órfão e ao criar um jazigo novo.

### Adicionar túmulo agora abre nos do campo

Duas portas, e **a ordem importa**:

1. **Cadastrados no campo** — a lista dos órfãos, com busca por nome na pedra,
   quadra ou rua. Um toque liga à família.
2. **Criar novo** — o formulário, para o que não foi cadastrado ainda.

Abre na primeira, com o contador ao lado. Se abrisse no formulário, a Sureya
cadastraria de novo o que já existe — e o cemitério acabaria com dois
registros para a mesma pedra, cada um com metade da história.

Quando não há nenhum órfão esperando, abre direto em "Criar novo": lista vazia
não ajuda ninguém.

### Mais de um túmulo por família

Já funcionava e continua: a ficha lista todos, cada um com sua foto, seu
endereço e seus três valores. O botão "Adicionar" não tem limite.

**Testado no banco:** o vínculo preenche cliente e família juntos. O teste foi
desfeito.

`next build` executado: passou limpo.

---

## OS JAZIGOS DO CAMPO AGORA SÃO EDITÁVEIS

### O erro

Eu desliguei a tela `/painel/jazigos` achando que duplicava a ficha da
família. **Não duplica.** É a única tela onde se edita um jazigo que ainda
não tem família — e é exatamente esse o estado dos 71 que a Nina cadastrou no
campo.

Resultado: corrigir a rua de um jazigo órfão era impossível. Ele não aparece
em ficha nenhuma, e a tela que serviria estava devolvendo 404.

### O que voltou

`Jazigos` saiu da lista de rotas bloqueadas e entrou no menu, em *Carteira*.

Ela já trazia o filtro **"Sem família"**, as fotos lado a lado para comparar,
apagar GPS e separar jazigo duplicado.

### O que faltava nela

Ela não editava **quadra, rua e nome na pedra** — só apagava foto e posição.
Acrescentei o bloco *"Corrigir endereço"*, com quadra e rua em lista (nunca
digitação, para não repetir a bagunça que gerou treze quadras) e o nome na
pedra opcional.

Como o PATCH já atualiza o `rua_id` junto com o texto, corrigir a rua aqui
reposiciona o jazigo no roteiro do dia.

### O caminho, agora

1. **Jazigos → filtro "Sem família"** — corrigir endereço do que veio torto
2. **Ficha da família → Adicionar → "Cadastrados no campo"** — ligar à família

`next build` executado: passou limpo.

---

## O BOTÃO DE SALVAR — dois erros meus

### 1. Na ficha, a edição estava atrás de um chevron mudo

O cartão do túmulo tinha só uma setinha `⌄` no canto, com rótulo invisível
para leitor de tela e nada escrito. Quem olha vê um enfeite, não um botão — e
sem abrir a gaveta, não existe formulário nem botão de salvar.

Agora é um botão com a palavra: **Editar** / **Fechar**, com o ícone só
acompanhando.

### 2. Na tela Jazigos, eu criei um bloco duplicado

O cartão **já tinha** o formulário completo — quadra, número, rua, falecido,
família e observações — com botão de salvar. Eu adicionei um segundo bloco
"Corrigir endereço" por cima, sem ver o que já existia. Removido.

O que ficou é melhor que o meu: tem também o seletor de **família**, que
resolve o vínculo dos órfãos ali mesmo, sem precisar abrir a ficha.

### 3. O botão apagado parecia ausente

Ele fica desabilitado até algo mudar, e nesse estado usa o estilo secundário —
cinza-claro, escrito só "Salvar". Um botão cinza sem explicação lê-se como
"não tem botão".

Agora o texto diz o estado: **"Salvar (nada mudou ainda)"** → **"Salvar
alterações"** → **"Salvando…"**.

Varri as duas telas: nenhum botão restou só com ícone.

`next build` executado: passou limpo.

---

## DOIS ERROS QUE A TELA DA "PERRELA" REVELOU

### 1. A conta corrente sumia em cliente novo

Eu criei famílias para os 65 clientes que existiam — e não para os que
viessem depois. O primeiro cadastro novo nasceu sem família, e a conta
corrente pendura na FAMÍLIA: por isso o cartão dizia "ainda não está
vinculada".

**A correção foi um gatilho no banco**, não um remendo no código. Cliente é
criado por vários caminhos — painel, campo, importação — e consertar um
deixaria os outros quebrados, com o erro voltando em silêncio meses depois.
Agora toda pessoa nasce com família, venha de onde vier, e a primeira da casa
já entra como responsável financeiro.

Os 66 clientes atuais estão com família, e os túmulos deles também.

### 2. O valor estava sendo multiplicado

Eu modelei só "valor por lavagem", e o sistema multiplicava pela
periodicidade. Mas a Sureya contrata **pelo mês**: *"R$ 40 por mês, e eu vou
lá toda semana"*.

No modelo antigo esse contrato virava **R$ 160** — quatro vezes o combinado,
numa cobrança que a família não reconheceria. Erro caro e silencioso.

Agora o campo pergunta a base, porque os dois modos existem no mundo:

- **por mês, não importa quantas limpezas** *(padrão — é como ela vende)*
- **o preço de cada limpeza**

E, antes de salvar, a ficha escreve o resultado: *"Dá R$ 40,00 por mês"*. É a
única forma de perceber na hora que se combinou uma coisa e o sistema entendeu
outra.

Registros antigos, sem a base definida, são lidos como **mês** — o mais
conservador: cobra a menos, nunca a mais.

**Testado:** R$ 40/mês com limpeza semanal cobra R$ 40; R$ 40/lavagem com
limpeza semanal cobra R$ 160; R$ 60/mês pago no ano cobra R$ 720.

`next build` executado: passou limpo.

---

## A DATA DO PAGAMENTO

### O que faltava

O formulário não tinha campo de data — gravava sempre o dia do lançamento. O
Pix costuma cair antes de a Sureya sentar para registrar, então o extrato
guardava a data errada, e a conferência com o banco não batia.

A API já aceitava `data`; o formulário é que nunca enviava.

### O campo

**"Quando o dinheiro entrou"**, com a dica *"a data do Pix, não a de hoje"*.
Nasce preenchido com hoje, que é o caso comum, e a data do comprovante
acompanha a do pagamento.

### E se errar mesmo assim

Não dava para corrigir nem apagar um lançamento — o único conserto seria mexer
no banco. Uma pessoa que não pode corrigir o próprio erro passa a evitar
registrar, e aí o extrato deixa de valer.

Agora **cada valor do extrato é clicável** e abre data, valor e descrição, com
o botão de apagar ao lado.

Duas coisas ficam protegidas, de propósito:

- **`tipo` e `origem` não se editam.** Transformar um débito em crédito mudaria
  o saldo sem deixar rastro; para isso, apaga-se e lança de novo.
- **O valor de uma mensalidade não se edita ali.** Ele vem do plano do túmulo,
  e mudar só o lançamento criaria divergência entre o que o plano diz e o que
  a família deve. A mensagem manda ajustar o plano na ficha.
- **O registro de lavagem não é clicável**: é o espelho do serviço executado,
  não um lançamento de dinheiro.

**Testado no banco:** lançamento criado, data e valor corrigidos, apagado
depois.

`next build` executado: passou limpo.

---

## "COMEÇAR A COBRAR A PARTIR DE"

### O que estava errado

O ciclo era ancorado no `created_at` do túmulo — a data em que ele foi
**digitado** no sistema. Isso é acidente do cadastro, não fato do contrato.

Duas consequências:

1. **Cobrança retroativa.** Uma família cadastrada hoje, com o fechamento
   rodado para um mês passado, receberia débito de um período em que ainda não
   era cliente.
2. **Ciclo errado.** Um plano anual assinado em março, mas digitado em agosto,
   passaria a cobrar em agosto — e a família reclamaria com razão.

### O campo

**"Começar a cobrar a partir de"**, no bloco do túmulo, ao lado da
periodicidade. É um seletor de mês, porque competência é mês e não dia —
guardar "15/03" faria a comparação com "2026-03-01" falhar em silêncio, então
a API normaliza sempre para o dia 1.

Ele faz duas coisas: **barra qualquer competência anterior** e **ancora o
ciclo**.

No cartão aparece um selo "desde mar/26", para não precisar abrir a gaveta.

### Nada muda para quem já está cadastrado

Os túmulos existentes receberam o mês do próprio cadastro — exatamente o que o
gerador já usava. Ninguém muda de situação por causa desta migration.

### Testado

| Caso | Resultado |
|---|---|
| Mensal começando em set/26 | não cobra jul e ago; cobra set e out |
| Anual assinado em mar/26, digitado em ago | cobra mar/26 e mar/27; **não** cobra ago |
| Trimestral começando em mai/26 | cobra mai, ago e nov; não cobra abr nem jun |
| Registro antigo, sem início | segue como antes |

`next build` executado: passou limpo.

---

## PÔR NA CONTA O QUE JÁ VENCEU

### O problema

O fechamento automático roda no dia 1 e olha o **mês corrente**. Mas a Sureya
está cadastrando agora contratos que começaram meses atrás: uma família que
paga desde março entra no sistema em agosto, e o extrato dela nasceria vazio —
como se nada fosse devido.

Definir "começar a cobrar em março" não bastava: ninguém ia gerar março a
julho.

### O botão

No bloco do túmulo aparece **"Pôr na conta 6 meses · R$ 240,00"**, já com a
contagem e o total. Ele percorre da data de início até o mês corrente e lança
tudo que aquele plano teria gerado.

Três cuidados:

- **Só aparece quando há mês em aberto.** Se está tudo em dia, não ocupa
  espaço nem convida a clicar à toa.
- **Confirma antes**, dizendo a faixa e o total: *"6 cobranças — mar/26 até
  ago/26 — somando R$ 240,00"*. Lançar dívida sem ver o que entra é o tipo de
  botão que ninguém deveria ter.
- **Não duplica.** A trava é o índice único `(tumulo_id, competencia)`: rodar
  depois do fechamento automático, ou duas vezes seguidas, não repete nada.

O mês corrente entra, porque a manutenção dele já está contratada — é o mesmo
critério do fechamento do dia 1.

### Testado

| Contrato desde mar/26, cadastrado em ago/26 | Lança |
|---|---|
| R$ 40/mês, pago por mês | mar, abr, mai, jun, jul, ago · **R$ 240** |
| R$ 60/mês, pago por trimestre | mar e jun · **R$ 360** |
| R$ 50/mês, pago no ano | mar · **R$ 600** |

`next build` executado: passou limpo.

---

## O VALOR ESTAVA EM DOIS LUGARES — e cada metade do sistema lia um

Sua pergunta achou o problema mais sério que restava.

### O que estava acontecendo

O plano vivia em **duas tabelas**:

| | Lia de | Campos |
|---|---|---|
| **Cobrança** | `tumulos` | valor_lavagem, valor_base, periodicidade, freq_pagamento |
| **Agenda** | `planos` | cadencia, valor_vigente |

Na prática: a Sureya configurava *"limpa toda semana, R$ 40 por mês"* na
ficha, o valor entrava na conta corrente — e **a Nina nunca recebia o
serviço**, porque a geração de agenda procurava em `planos`, onde não havia
nada.

Pior: `DIAS_CICLO` nem conhecia `semanal` e `quinzenal`. Um plano semanal seria
ignorado mesmo se existisse na tabela antiga.

### A escolha: o plano mora no TÚMULO

É onde a Sureya edita, onde o valor já estava, e é o objeto que existe no
mundo — `planos` era uma camada a mais entre a pedra e o dinheiro. A tabela
não foi apagada; fica como histórico.

O que mudou em `src/lib/agenda.ts`:

- a geração lê `tumulos` (contratado + periodicidade), não `planos`
- `semanal` (7 dias) e `quinzenal` (15) entraram no ciclo
- a checagem de duplicata passou a ser **por túmulo**; era por `plano_id`, que
  agora nasce nulo — sem isso a mesma limpeza seria criada a cada rodada
- nunca gera antes do **início da cobrança**: agenda retroativa encheria a
  lista da Nina de dias que já passaram

### Trocar a periodicidade agora tem efeito imediato

Mudar de mensal para semanal reinicia o ponteiro da agenda para hoje. Antes,
nada aconteceria até o ponteiro antigo vencer — a Sureya faria a troca e não
veria efeito por semanas.

### Um achado nos dados reais

**Dois dos três túmulos contratados estão sem periodicidade.** Com "tem plano"
marcado e valor definido, mas sem dizer quando limpar, eles não entram na
agenda **nem** na cobrança — e nada avisava.

Agora o cartão mostra o selo **"falta dizer quando limpar"**, e salvar um plano
pela metade é barrado com a explicação.

`next build` executado: passou limpo.

---

## O CONTRATO É DA FAMÍLIA. O TRABALHO É DO TÚMULO.

### A regra confirmada

- A Sureya combina **um valor** com a família, mesmo que ela tenha dois
  túmulos.
- Mas **cada túmulo pode ser limpo num ritmo diferente** — um toda semana,
  outro uma vez por mês.

Eu tinha posto os dois no túmulo. Com duas pedras na mesma família, isso
geraria **duas cobranças onde existe uma só**: a família receberia o dobro.

### A divisão certa

| Onde | O quê |
|---|---|
| `familias` | valor mensal · frequência de pagamento · início da cobrança · tem plano |
| `tumulos` | periodicidade da limpeza · a Nina limpa este túmulo |

E some a pergunta *"por mês ou por lavagem"*: no nível da família não existe
"a lavagem" — cada túmulo tem a sua. O valor da família é sempre mensal.

### Na ficha

Entrou o cartão **Contrato**, logo abaixo dos dados da família, com valor,
quando cobrar e desde quando. O botão **"Pôr na conta"** mudou-se para lá,
porque quem deve é a família.

O bloco do túmulo ficou com o endereço, o falecido, o nome na pedra e uma
pergunta só: **de quanto em quanto tempo a Nina limpa**.

### A trava mudou de lugar junto

A proteção contra cobrar duas vezes era `(tumulo_id, competencia)`. Com a
cobrança na família, o `tumulo_id` nasce nulo nesses lançamentos — e índice
único ignora nulo, então a proteção sumiria justamente onde mais importa.
Agora é `(familia_id, competencia)`.

### Migração sem perda *(já aplicada)*

O valor que estava nos túmulos subiu para a família. Quando havia mais de um
túmulo com valor, os valores foram **somados** — era isso que a Sureya
receberia hoje, e reduzir por conta própria mudaria o combinado sem avisar.

As três famílias com plano ficaram: Andre R$ 25/mês, Anninha R$ 20/mês
(semestral) e Perrela R$ 15/mês.

### Testado

| Caso | Resultado |
|---|---|
| Família com 2 túmulos, R$ 40/mês | **1** lançamento de R$ 40 (era 2 de 40) |
| Trimestral R$ 60/mês desde mar/26 | cobra mar, jun, set · R$ 180 cada |
| Família sem plano | não cobra |

`next build` executado: passou limpo.

---

## O VALOR NEM SEMPRE É MENSAL

Eu só aceitava valor por mês e multiplicava pelo ciclo. Mas o combinado nem
sempre é dito assim: *"R$ 600 por semestre"* existe, e obrigar a Sureya a
dividir de cabeça para digitar R$ 100 é pedir erro — ainda mais quando a
divisão não é exata.

Agora o campo pergunta o que o número significa:

- **por mês** — a cobrança é ele vezes os meses do ciclo *(padrão)*
- **o valor de cada cobrança** — sai exatamente esse valor

E, antes de salvar, a ficha escreve o resultado: *"A família recebe R$ 600,00
a cada seis meses"*.

## A LIMPEZA REGISTRADA À MÃO NÃO APARECIA NO EXTRATO

Bug meu. O registro de lavagem na conta corrente era criado quando **a Nina
concluía pelo app** — mas não quando **a Sureya registrava à mão**. A limpeza
ficava só na lista de serviços e sumia do extrato, que é onde ela olha o
histórico da família.

Corrigido: os dois caminhos agora criam o registro. Valor zero, como sempre —
quem gera a dívida é a competência.

---

## ESCOLHER O JAZIGO DO CAMPO — com foto e vários de uma vez

São **68 jazigos** esperando família, e a lista era de texto: uma linha por
jazigo, com quadra e rua. Só que "Quadra 1 · Rua 2" se repete dezenas de vezes
e nove deles nem têm nome na pedra — escolher assim é adivinhar.

**67 dos 68 têm foto de referência.** É ela que a Sureya reconhece.

### O que mudou

**Grade com foto.** Cada jazigo vira um cartão com a imagem, o endereço e o
nome na pedra por baixo. Toca para marcar; o escolhido ganha borda e um ✓ no
canto.

**Busca por qualquer coisa.** Código, nome na pedra, falecido, quadra, rua. E
todos os termos precisam bater: *"rua 5 almeida"* é mais específico que *"rua
5"* — é assim que se estreita uma lista grande.

**Vários de uma vez.** Marque quantos quiser e ligue todos num toque. Uma
família costuma ficar com dois ou três jazigos, e abrir e fechar o formulário
a cada pedra era o trabalho que a tela deveria poupar.

**"Marcar estes"** marca só o que está **filtrado**. Com a lista estreitada
por busca, marcar os 68 seria o oposto do que ela quer.

### No servidor

O vínculo em lote roda **um a um por dentro**, de propósito: se o terceiro
falhar, os dois primeiros já entraram e a resposta diz qual não foi. Em lote
verdadeiro, um erro derrubaria todos e a Sureya não saberia onde parou.

Falha parcial mostra o aviso e segue com o que entrou — esconder isso faria
ela ligar de novo o que já estava ligado.

`next build` executado: passou limpo.

---

## LIMPEZA DOS RESÍDUOS DA MUDANÇA

Depois de mover o contrato para a família, sobraram três pontas que
recriariam a duplicação se ficassem.

**O PATCH do túmulo ainda aceitava `valor_lavagem`, `valor_base`,
`freq_pagamento` e `inicio_cobranca`.** Se alguém gravasse um valor ali, nada
seria cobrado — a cobrança lê a família — e o número ficaria na tela mentindo.
Agora o PATCH recusa esses campos. As colunas continuam no banco como
histórico.

**A agenda gravava valor no serviço.** O dinheiro vem da competência da
família; um valor no serviço seria um segundo número para a mesma coisa, e
seria ele que apareceria nos relatórios, divergindo do que a família deve.
Agora nasce nulo.

**A ficha tinha um cálculo órfão** (`porMes`) e a API do cliente carregava
sete colunas que ninguém mais lê. Removidos.

Varredura final: `valor_lavagem` não aparece em nenhum caminho ativo — só no
comentário que explica por que ele não é mais aceito.

---

## AS LIMPEZAS NÃO APARECIAM — dois erros meus

### 1. O filtro procurava um campo que não existe

A rota `/api/servicos` entrega os campos **prontos para a tela**, e ali
`data_executada` vira **`executadaEm`**. Meu filtro procurava o nome do banco,
que nunca chega no navegador — então a lista vinha **sempre vazia**, mesmo com
a limpeza gravada corretamente.

Conferi no banco: a limpeza do André de 03/08 estava lá, executada, com
cliente e túmulo certos. O registro funcionava; quem mentia era a tela.

Também troquei o filtro da consulta para `situacao=feitos`, que já faz esse
recorte no servidor.

### 2. A tela engolia erro nos dois sentidos

`registrar()` era um `await fetch(...)` solto, sem olhar a resposta: se a
gravação falhasse, o formulário fechava e nada era dito. Foi por isso que
**quatro limpezas foram registradas e só uma entrou** — as outras três
falharam em silêncio.

E o carregamento tinha `.catch(() => {})`, então erro de API virava lista
vazia com a mensagem tranquilizadora "nenhuma limpeza registrada ainda".

Agora os dois caminhos mostram o que deu errado.

---

## A CONTA CORRENTE MOSTRA O CONSUMO

### O que faltava

A cobrança por competência lança o mês inteiro de uma vez: débito de R$ 100 em
agosto, crédito de R$ 100 quando a família paga, saldo zero. Correto quanto ao
contrato — e **mudo sobre o serviço**.

O extrato não respondia à pergunta que a família faz: *"paguei 100, quantas
limpezas já recebi? sobrou quanto?"*.

### Como ficou

**Cada limpeza lança um débito com o seu valor.** O pagamento credita. O saldo
passa a ser a sobra.

O valor de uma limpeza sai do contrato da família dividido pelas limpezas que
cabem no mês, somando todos os túmulos:

| Contrato | Ritmo | Cada limpeza |
|---|---|---|
| R$ 100/mês | 1 túmulo semanal | R$ 25 |
| R$ 100/mês | 1 semanal + 1 mensal | R$ 20 |

Sobre usar **4 semanas e não 4,33**: o número exato faria a limpeza valer
R$ 23,09 e o extrato viraria centavos quebrados que ninguém confere. Com 4, a
família às vezes ganha uma quinta limpeza sem débito — erra a favor dela, que
é o lado certo de errar.

### Os dois modos não convivem

Somados, cobrariam duas vezes o mesmo serviço. Por isso a escolha é explícita
no contrato, e o padrão é **consumo**:

- **cada limpeza desconta do que foi pago** — o saldo mostra a sobra
- **o mês inteiro entra de uma vez** — independentemente das limpezas

No modo consumo o botão "Pôr na conta" some (não existe mês em aberto) e o
fechamento automático ignora a família.

### O André, corrigido *(banco já ajustado)*

As duas limpezas estavam com valor zero — foram lançadas antes disto existir.
Recalculei e sincronizei todas as limpezas executadas que não tinham registro
no extrato.

O extrato dele agora é: limpeza 03/08 R$ 25 · pagamento 08/08 R$ 100 · limpeza
10/08 R$ 25 → **R$ 50 a favor**.

## O MENU NÃO CABIA NA TELA

Dez itens, três títulos de grupo, cabeçalho e o "Sair" passavam da altura da
janela e a coluna ganhava barra de rolagem. Compactei espaçamento, altura de
item e tamanho de fonte e ícone — sem tirar nada.

---

## O QUE FALTA

### Depende de você

1. **Publicar no Vercel.** Nada deste pacote aparece antes do deploy — e é a
   explicação mais provável para "não consigo editar o jazigo".
2. **A planilha de suporte**, para eu montar a importação das situações
   iniciais das 66 famílias em lote.
3. **Reconectar o WhatsApp** em Config → WhatsApp, quando for conveniente. A
   fila enche normalmente sem ele; só o envio espera.

### Depende de uso

4. **Rodar um mês inteiro** e anotar o que fez falta. Só depois disso vale
   arquivar o código das áreas desligadas.

### O que já está pronto e testado

Roteiro por endereço com ruas físicas compartilhadas · campo de dois toques ·
fila de liberação com envio de fotos pela Evolution · conta corrente por
família com competência, avulso, abertura e correção de lançamento ·
comprovante anexado à mão · fechamento automático no dia 1 · tela "O Mês" ·
portal com antes e depois · ficha reescrita · visual de sistema com coluna
escura e tema escuro pronto.
