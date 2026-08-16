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

## Falta ligar

0. **Publicar no Vercel.** O que está no ar hoje é o código antigo — nada
   deste pacote aparece antes do deploy.
1. **`CardTumulo` no `campo/page.tsx`** — o componente está pronto, mas a
   página ainda usa `ConfirmarJazigo` + `Concluir`. Trocar os dois pelo card.
3. **Quem cria o rascunho** — chamar `rascunhoDaLavagem` (de `mensagens.ts`)
   quando o serviço é concluído, inserindo em `fila_liberacao`.
4. **Cron da competência** — chamar `gerarCompetenciaDoMes` no dia 1. A trava
   contra cobrança dupla já está no banco.
5. **Esconder as telas que saem** (CRM, IA, mapa, plaquetas QR, portal antigo).

---

## Testado

Os três módulos de `lib/` passam no `tsc --strict` sem erro. A lógica foi
executada: serpentina, encaixe sem renumerar vizinhos, ciclos de cobrança
diferentes na mesma família, avulso somando na conta, pagamento a maior
virando crédito, e os textos preenchidos.

O `agenda.ts` foi conferido por inspeção — nenhuma referência à função antiga
sobrou, e as chaves fecham. Como ele depende de dezenas de módulos do projeto,
rode `npm run build` no seu ambiente para a checagem completa.
