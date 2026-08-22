# Leva 4 — multi-cemitério (sistema e site)

**Build:** `npm run build` limpo · `npm run checar` sem avisos · páginas conferidas rodando de verdade (`next start`).

**Uma migration: `0044_multi_cemiterio.sql`.** Ela só **adiciona** colunas e preenche as novas a partir do que já existe. Nenhuma linha é alterada ou apagada.

**Enquanto você não rodar a 0044, nada muda.** Todo o código tem plano B: se as colunas não existirem, o sistema se comporta exatamente como hoje.

**E mesmo depois de rodar, nada muda até você configurar.** Com um cemitério só cadastrado, o resultado é idêntico ao de sempre.

---

## O que estava quebrado

`cemiterio_id` existia **só em `quadras`**. Túmulo, serviço, plano e membro não sabiam de cemitério nenhum. Na prática, com dois locais:

- **A rota do dia agrupava por `quadras.ordem`** — um inteiro global. Duas quadras de cemitérios diferentes com a mesma ordem viravam um bloco só, e a sequência do dia podia ser **A → B → A**, atravessando a cidade no meio da manhã.
- **O deslocamento entre cemitérios custava zero** para o alocador (a proximidade só é calculada dentro da quadra).
- **A capacidade era uma só** para todos os locais — um cemitério atendido só às terças some dentro do total da casa.
- **Três portas de cadastro escolhiam o cemitério com `order("nome").limit(1)`**: o primeiro em ordem alfabética, sempre. Com dois, o cadastro caía no lugar errado em silêncio, criava a quadra "Q-12" lá também, e o mesmo jazigo passava a existir duas vezes — em cemitérios diferentes, onde nenhuma trava enxerga.
- **O alerta de duplicata mentia:** "o número 45 aparece 3x no cemitério" quando eram 3 cemitérios.
- **O importador cravava o nome** "Cemitério da Saudade — Vila Vitória, Mauá" no código.
- **A IA do WhatsApp afirmava para o cliente** que atende o Cemitério da Saudade.

---

## Os dois mecanismos — os dois opcionais

Você escolhe na prática, sem eu mexer no código de novo. Ambos ficam em **Config → Cemitérios**.

### a) Dias fixos por cemitério
"Segunda e quarta no Saudade, terça e quinta no outro." A equipe inteira vai junta. É o mais simples de operar e o que menos gasta deslocamento.
Na tela: os botões dos dias da semana em cada cemitério. **Desmarcar todos volta ao padrão** (vai em qualquer dia de trabalho) — não deixa o cemitério órfão.

### b) Cada pessoa num cemitério
"A Nadir fica no Saudade, a ajudante no outro", no mesmo dia. Cada uma recebe só a rota do local dela.
Na tela: os botões com os nomes da equipe, dentro de cada cemitério. **Quem não estiver marcado em lugar nenhum atende todos.**

### Os dois juntos também funcionam
E há um detalhe que só aparece quando você combina os dois: **uma pessoa sem vínculo tem UM dia só**. Se dois cemitérios estiverem abertos na mesma terça, o alocador não conta a capacidade dela duas vezes — senão a rota nasceria impossível de cumprir. Há um contador compartilhado justamente para isso.

---

## O que mudou no sistema

**A rota do dia agora é montada por cemitério.** Dentro de cada um, a ordem da quadra volta a significar "a sequência em que se anda por aquele cemitério". A lógica de data pedida pela família (1ª passada) e do resto preenchendo (2ª passada) continua igual — só que por local.

**A capacidade foi reescrita, e não era só o cemitério.** Duas coisas estavam erradas ali desde antes:

- **A equipe não contava.** Usava só `orgs.limpezas_por_dia` (o padrão da casa), enquanto o alocador soma a capacidade de **cada ajudante ativa**. Com duas pessoas em campo, o painel mostrava metade do que a agenda distribuía, e o "cabem X túmulos novos" saía pela metade.
- **Havia duas colunas de jornada.** Aqui lia-se `dias_trabalhados_semana`; no alocador, `dias_semana` (a lista). Tirar o sábado numa não mexia na outra. Agora as duas leem a mesma lista.

E o Início passa a mostrar a **carga por cemitério** quando há mais de um — é lá que o gargalo aparece.

**As portas de cadastro pararam de adivinhar.** Uma função só (`resolverCemiterio`) responde "qual cemitério?": o informado; se só existe um, é ele; **com vários e nenhum informado, RECUSA** e diz quais são. Vale para o cadastro pela ficha, pelo campo e pela importação.

**Onde o cemitério aparece agora:** na rota do dia da Nina (as faixas viram "Cemitério · Quadra · Rua", mas **só quando o dia tem mais de um** — com um só seria ruído), no briefing, e no alerta de duplicata, que passou a contar por cemitério.

**Rede de segurança no banco:** um gatilho faz o serviço herdar o cemitério do túmulo, e o túmulo, da quadra. Assim, qualquer caminho que esqueça de preencher (SQL na mão, RPC antiga) não cria buraco.

---

## O que mudou no site

**Uma página por cemitério** — `/cemiterio/da-saudade`, com title, descrição, ficha do Google (`LocalBusiness` com bairro e cidade) e link de WhatsApp próprios. É assim que se ganha busca local: quem digita o nome do cemitério cai numa página que fala **daquele lugar**, não numa home genérica.

O conteúdo é o **mesmo** da home — mesma promessa, mesmo preço, mesmo "como funciona". Só o lugar muda. Página de SEO com texto diferente do que a empresa entrega funciona por seis meses e queima o nome depois.

**Nova seção "Onde a gente atende"** na home, logo antes do FAQ — é a última pergunta prática antes de chamar no WhatsApp.

**O FAQ da cobertura parou de responder "provavelmente não".** Era: *"Se o seu jazigo for em outro, fale com a gente mesmo assim — a resposta pode ser não"*. Agora: a lista do que se atende, mais *"a resposta pode ser 'ainda não', mas vai ser honesta, e a gente avisa quando chegar lá"*.

**A melhor frase da página foi reescrita para sobreviver à expansão.** Ela dizia: *"conhecemos ESTE cemitério quadra por quadra"* — e deixava de ser verdade no dia em que o segundo abrisse. Virou: *"em cada cemitério onde entramos, mapeamos quadra por quadra antes de aceitar o primeiro cliente"*. Mantém a força e vira um compromisso de método, não um acidente de tamanho.

**O hero fala de região** (`Mauá`) em vez de cravar um cemitério, e o olho lista os cemitérios a partir do cadastro.

**Título mais buscável:** `Limpeza de túmulo em Mauá — Zelo & Memória`. "Túmulo" é a palavra que a pessoa digita; "jazigo" é a que vocês usam por dentro.

**A IA do WhatsApp** parou de afirmar que atende o Cemitério da Saudade: agora lê a lista, e foi instruída a **não inventar** cobertura — se perguntarem de um cemitério que não está lá, ela diz que ainda não, com honestidade.

**Sitemap e robots** já incluem as páginas por cemitério.

---

## Como abrir o segundo cemitério (o passo a passo)

1. **Cadastre no painel:** Config → Cemitérios → "Cadastrar outro cemitério". É isto que faz a **agenda** passar a existir para ele.
2. **A partir daí, o cadastro de jazigo passa a perguntar** em qual cemitério fica — em vez de escolher sozinho.
3. **Configure a divisão** (opcional): os dias, o vínculo da equipe, ou nenhum dos dois.
4. **Para o site:** acrescente um item em `MARCA.cemiterios`, em `src/lib/marca.ts` — tem um comentário lá explicando os campos. A página `/cemiterio/<slug>` nasce sozinha, entra no sitemap e ganha ficha própria no Google.

> O item 4 é a única parte que ainda passa por código. É de propósito: o site é uma vitrine e não pode depender do banco estar de pé para carregar. São seis linhas num arquivo, com o modelo do lado.

---

## Conferência depois de subir

1. Rode a 0044 e confira a consulta **3.1** — tem que voltar **zero** nas duas colunas.
2. Consulta **3.2**: o retrato por cemitério. Com um só, tudo deve estar lá dentro.
3. Início → "Carga × capacidade": o número deve **subir** se você tem mais de uma ajudante ativa (antes contava só o padrão da casa).
4. Cadastre um segundo cemitério de teste e tente criar um jazigo sem escolher o local → tem que **recusar** e dizer quais são.
5. Abra `/cemiterio/da-saudade` e `/sitemap.xml`.
6. Desative o cemitério de teste e apague depois — nada é perdido.

---

## O que ainda falta

| O quê | Tamanho | Nota |
|---|---|---|
| **A tela "como foi o mês"** | G | Continuam 9 telas e 15+ cliques, e `financeiro/relatorio` lê todos os movimentos de todos os tempos — não existe foto do passado. É a maior melhoria de CONTROLE que sobrou. |
| **Deslocamento entre cemitérios** | M | Hoje "um dia = um cemitério" resolve na prática. Se um dia a equipe atender dois no mesmo dia sem vínculo por pessoa, aí vale calcular a ordem entre os locais. |
| **Repositório não reproduz o produto** | M | 11 tabelas e 24 RPCs sem migration; a 0031 quebra em ambiente novo. |
| **Exclusões sem trilha** | P | Conversa em massa, lançamento e conta da equipe apagam sem passar por `auditoria`. |
| **`consumo.ts`** | P | Baixa estoque sem registro por serviço; estornar não repõe. |
