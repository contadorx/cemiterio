# A home — o que foi executado, e o que depende de você

Resposta ao parecer de aquisição e retenção da home. Confirmei as quatro
afirmações no código antes de mexer em qualquer coisa; todas procedem.

---

## O que eu confirmei antes de executar

| Afirmação do parecer | Confere? | Onde |
|---|---|---|
| Fotos reais antes/depois desativadas | **sim** | `site.ts` → `prova.mostrarFotos: false` |
| Aviso do lead aponta para rota 404 | **sim** | `api/contato` mandava para `/painel/leads/<id>`; `middleware.ts` devolve 404 para `/painel/leads` |
| Não existe card de leads no Início | **sim** | saiu quando a tela virou "O mês" — e o comentário da rota ainda o prometia |
| "Já sou cliente" abre WhatsApp genérico | **sim** | três links, topo, meio e rodapé |
| Segundo cemitério é placeholder inativo | **sim** | `marca.ts` → `nome: "NOME DO CEMITÉRIO"`, `ativo: false` |
| R$ 40 veio de um padrão do sistema | **sim** | o próprio comentário de `site.ts` diz isso |

**Um número que o parecer não tinha:** a tabela `leads` já tem **104 linhas** —
todas com `origem = 'whatsapp'`, do tempo do agente de IA. **Nenhuma veio do
site.** Ou seja: o buraco estava aberto e ainda não engoliu nada. Era a hora de
fechá-lo, não depois do primeiro contato perdido.

---

## H0 — o destino do lead. **Feito.**

Era o P0 do parecer, e é o único item que não podia esperar por conteúdo.

**`/painel/contatos`** — a fila mínima. Quem escreveu, o telefone, **o que a
pessoa escreveu na íntegra**, há quanto tempo espera, quantas vezes já se tentou
falar, e a próxima ação por escrito com data. Botões: chamar no WhatsApp (com a
primeira frase pronta), ligar, "marquei que falei", virou cliente, não era para
a gente (com motivo, que fica auditado).

Não é um CRM. O CRM foi desligado porque tinha superfície demais para duas
pessoas, e ressuscitá-lo inteiro para resolver isto seria trocar um problema por
outro maior.

**Duas palavras com significado preciso**, e a diferença importa:

- **atrasado** = chegou há mais de 24 h e **ninguém tentou falar nenhuma vez**.
  É a promessa do site quebrada — não "contato velho". Quem já foi procurado
  duas vezes e não retornou não é culpa da casa, e não fica vermelho.
- **vencido** = você marcou "ligo terça" e a terça passou.

**Os avisos foram corrigidos.** Push e WhatsApp apontam para `/painel/contatos`.

**O Início do painel voltou a ter o bloco**, acima dos números do mês — é a única
coisa daquela tela com relógio correndo.

**A origem passou a ser gravada.** Todo contato do site nasce com
`origem = 'site'`, o cemitério que a pessoa escolheu, e a página/CTA/UTMs em
campos invisíveis. Sem isso, um contato do site seria indistinguível dos 104 do
agente de IA.

**Deriva fechada de passagem.** O banco limpo recusou a migration: seis colunas
de `leads` existiam só em produção (`nome`, `proximo_passo`, `responsavel`,
`ignorado`, `motivo_ignorado`, `cliente_id`). **`/api/contato` escreve em
`nome`** — num ambiente reconstruído do repositório, o formulário gravaria o
contato e perderia o nome da pessoa em silêncio.

Dez conferências novas em `testes/contatos.sql`, todas sobre comportamento:
descartado sai da fila, duas horas não é atraso, trinta horas sem tentativa é,
cinco dias com tentativa não é, a data prometida que passou aparece.

---

## H2 — quem já é cliente. **Feito.**

Os três "Já sou cliente" agora levam a **`/familia`** — a página que já existia e
reenvia o link privado pelo telefone informado. O token nunca aparece na home.

- topo: **Acompanhar minha família**
- meio: **Já é cliente? Receba o seu link de novo**
- rodapé: **Receber de novo o meu link**

E entrou a seção **"Já cuidamos do jazigo da sua família?"**, antes do FAQ —
porque a família atual não vai ler perguntas de quem está decidindo. Cinco
cartões: ver as fotos (→ `/familia`), avisar uma data, mudar a frequência, falar
sobre pagamento, trocar quem recebe as mensagens. Os quatro últimos abrem o
WhatsApp **com o assunto já escrito**: menos digitação para um público idoso, e a
equipe recebe o contexto pronto.

---

## H1 — o que dava para fazer sem conteúdo novo. **Feito em parte.**

**As CTAs deixaram de competir.** "Falar no WhatsApp" e "Pedir um orçamento"
eram o mesmo pedido dito de dois jeitos. Agora dizem o que acontece depois do
clique:

- principal: **Quero saber o valor no WhatsApp**
- secundária: **Prefiro receber uma ligação** — que cai exatamente no formulário,
  cujo título já era "Prefere que a gente ligue?"

Num público idoso, "prefiro uma ligação" não é a opção secundária: para muita
gente é a única.

**"Onde a gente atende" subiu para logo abaixo do hero.** Estava perto do fim,
depois de toda a explicação — e é a primeira pergunta de quem chega por
indicação. Quem lê quatro seções para descobrir que a resposta é não, não volta.

**O formulário passou a perguntar o cemitério** — num `<select>`, não num campo
de texto: escolher não é digitar, e o formulário continua do mesmo tamanho. A
opção **"não sei dizer"** está lá de propósito: sem ela, quem não sabe abandona
ou chuta, e um chute é pior, porque a equipe liga preparada para o lugar errado.

---

## O que **não** executei, e por quê

Nada aqui é dificuldade técnica. É informação que só você tem.

### 1. As fotos reais antes/depois — **precisa dos arquivos**
O mecanismo está pronto e é uma linha: `site.ts` → `prova.mostrarFotos: true`.
Faltam os arquivos em `public/site/`. O parecer pede três casos, e concordo:
manutenção recorrente, primeira limpeza pesada, preparo para uma data.

Para cada um: `antes-N.jpg` e `depois-N.jpg`, **do mesmo ângulo** — é o par que
convence, não a foto bonita —, e a legenda verdadeira. Nome na lápide e placa
borrados. Me mande e eu ligo, com as legendas escritas.

### 2. O preço de R$ 40 — **precisa da sua confirmação**
O código anuncia "a partir de R$ 40 por limpeza" e o próprio comentário avisa
que o número saiu do padrão do banco. Antes de qualquer divulgação:

- R$ 40 é mesmo o **menor** preço praticado hoje?
- a primeira limpeza pesada tem valor à parte? Qual?
- muda alguma coisa entre os dois cemitérios (deslocamento)?

Começar a conversa comercial corrigindo um preço que o site acabou de anunciar é
o pior jeito de começar.

### 3. Equipe e depoimentos — **precisa de conteúdo e autorização**
Foto real da Dona Nadir e da equipe, uma história curta em primeira pessoa, dois
depoimentos autorizados. "Há quanto tempo cada família é atendida" só quando for
comprovável pelo sistema.

### 4. O segundo cemitério — **precisa do nome oficial**
O parecer chama de "Cemitério Santa Lídia". O código não sabe esse nome: está
`"NOME DO CEMITÉRIO"`, `ativo: false`. **Não preenchi** porque publicar nome,
bairro e schema de um lugar que eu não posso conferir é o tipo de erro que vira
página errada indexada no Google.

Me confirme **nome oficial, bairro e cidade** e eu faço o H3 inteiro: landing de
"estamos chegando" (nunca "atendemos"), lista de interesse separada com origem
`santa-lidia`, e sem prometer data.

---

## O funil, e o que ainda não é medido

O parecer está certo em dizer que clique no WhatsApp não é sucesso. Do funil
proposto, o sistema hoje registra:

| Etapa | Registrado? |
|---|---|
| escolheu o cemitério | **sim, agora** (`leads.cemiterio_interesse`) |
| lead recebido | sim |
| responsável avisado | sim (push + WhatsApp, agora com link que abre) |
| primeiro contato | **sim, agora** (`tentativas`, `ultima_tentativa_em`) |
| orçamento enviado | não — cabe em `proxima_acao`, mas como texto livre |
| primeira limpeza | sim (`servicos`) |
| foto entregue | sim (`fila_liberacao` + `sureya_fotos_enviadas`) |
| adesão à recorrência | sim (`familias.contratado`) |
| segunda visita | sim (histórico do jazigo) |

O elo que falta é **ligar o lead ao cliente**: `leads.cliente_id` existe e
ninguém preenche. Sem isso não dá para responder "de cada dez contatos do site,
quantos viraram segunda limpeza?" — que é a única pergunta que decide se vale
gastar em mídia. Não fiz agora porque exige decidir o momento da amarração
(na conversão? no cadastro da família?), e é uma conversa de cinco minutos.
