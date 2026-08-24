# O whats chega?

**Resposta curta: chega hoje. Não chegou por dezenove dias, e ninguém soube.**

## O que eu medi antes de escrever qualquer linha

`eventos_webhook`, evento por evento, dia por dia:

| dia | eventos | | dia | eventos |
|---|---|---|---|---|
| 18/07 | 53 | | 29/07 | 57 |
| 19/07 | 52 | | 30/07 | 96 |
| 20/07 | 194 | | 31/07 | 90 |
| 26/07 | 10 | | 01/08 | 117 |
| 27/07 | 165 | | 02/08 | 132 |
| 28/07 | 124 | | 03/08 | 55 |
| | | | **04/08 a 22/08** | **nada** |
| | | | 23/08 | 70 |

Dezenove dias sem um único evento. E depois:

- última mensagem de **entrada** gravada: **02/08 15:10**
- comprovantes na vida inteira do sistema: **1** (02/08)
- `erros_log`: **0**
- no dia 23/08: 70 eventos, **1 lead**, **1 mensagem**, **68 sem rastro nenhum**

A Josiane está cadastrada certinho — `Família JOSIANE`, `5511995147659`,
responsável financeira. Ela tem três conversas vazias, criadas pela rotina da
manhã em 04, 05 e 06 de agosto, e **zero mensagens**. O comprovante dela caiu
no buraco.

## O sistema sabia. E não contou.

Esta é a parte que dói:

- `rotinas` guardava o carimbo do webhook desde sempre
- `LIMITE_MINUTOS.webhook` já era **48 horas**
- `IMPACTO_ROTINA.webhook` já dizia, escrito: *"mensagem de família pode estar
  chegando e não entrando no sistema"*
- `/api/rotinas` já calculava tudo isso — com um comentário no código dizendo
  *"o Início só precisa disto para decidir se mostra a faixa vermelha"*

**Nenhuma tela chamava essa rota.** O alarme foi construído inteiro e nunca
ligado no fio. Dezenove dias passaram por baixo dele.

## O segundo buraco, mais fundo

Dos 70 eventos de ontem, 68 não deixaram rastro. Isso não era bug — era o
desenho. O webhook decidia o destino de cada mensagem (grupo, eco, lead,
gravada), devolvia a palavra ao Evolution e esquecia. `eventos_webhook`
guardava só o id, e só **depois** dos filtros de grupo e de vazio.

Consequência: com a pergunta *"o comprovante da Josiane chegou?"*, não havia
resposta possível. Nem sim, nem não. Só dedução — e dedução, nesta semana, já
me fez errar duas vezes sobre o menu das Flores.

---

# O que mudou

## 1. Toda mensagem deixa dito por onde saiu

`eventos_webhook` ganhou **telefone** e **desfecho**, e a linha é escrita
**antes** dos filtros. Os desfechos possíveis: `grupo`, `vazio`,
`sem_mensagem`, `duplicado`, `espelho_cliente`, `espelho_eco`, `espelho_lead`,
`espelho_nada`, `lead`, `ignorado`, `escalado`, `gravada`, `erro`.

Duas perguntas passam a ter resposta:

- `sureya_rastro_telefone('5511995147659')` — *"e a mensagem deste número?"*
- `sureya_saude_whatsapp()` — *"há quanto tempo está calado, e o que entrou"*

**E um defeito de dinheiro saiu junto.** A linha de dedupe era gravada *antes*
do processamento. Se o processamento morria no meio, o Evolution reenviava e a
segunda chance era recusada como duplicada — a mensagem morria calada. Agora
`erro` não tranca: só o que terminou é que tranca.

## 2. O alarme ligado no fio

- **No Início**, acima de tudo: uma faixa quando alguma rotina parou, quando o
  WhatsApp está calado, ou quando ele está *falando e não gravando* (o caso do
  dia 23/08: carimbo verde, sistema surdo).
- **Em Configurações → WhatsApp**: um bloco novo, *"Está chegando alguma
  coisa?"*, com a quebra dos últimos 7 dias por desfecho. Porque "conectado"
  não é "chegando", e as duas coisas já discordaram.
- **Na aba Diagnóstico**: um ponto vermelho quando há o que ver.

A faixa **some quando está tudo bem**. Faixa de sistema que fica sempre na tela
vira moldura, e moldura ninguém lê.

## 3. A análise do comprovante, agora pelas duas portas

A leitura por IA **nunca saiu do código** — `atendimento.ts` sempre chamou
`extrairComprovante` para imagem de número conhecido. O problema é que ela
tinha **uma porta só**, e essa porta ficou fechada dezenove dias.

E quando você anexava o print à mão pela ficha, o sistema guardava a imagem e
mais nada: valor e data você digitava, olhando a tela.

Agora, ao escolher a imagem no cartão **Conta corrente → Pagamento**, ela é
lida na hora e **valor e data se preenchem sozinhos**. Você confere e lança.

Três cuidados que ficaram no código:

- **só preenche campo vazio** — se você já digitou o valor, a leitura não apaga
- **confiança baixa não preenche campo de dinheiro** — valor errado
  pré-preenchido é pior que campo vazio, porque o vazio obriga a olhar
- **falhar não impede o lançamento** — IA fora do ar, teto de custo do dia
  atingido: você digita e anexa do mesmo jeito, o dinheiro entrou na conta
  igual

**E o mesmo Pix não entra duas vezes.** Com as duas portas valendo, a família
manda a foto no WhatsApp e você anexa o print do mesmo pagamento — sem trava,
seriam dois créditos no razão dela. O identificador da transação (o E2E, que
vem impresso no comprovante) tranca. Comprovante *sem* identificador continua
entrando normalmente: nem todo print traz o E2E, e recusar por isso seria
trocar crédito em dobro por crédito nenhum.

## 4. Configurações reorganizada

Eram **quinze botões numa fileira só**, em ordem de chegada — cada tela nova
empurrada para o fim da fila. "Régua de cobrança" caía entre "WhatsApp" e
"Flores e extras". Quem procurava alguma coisa lia os quinze rótulos.

O agrupamento não é por "temas parecidos". É pela **pergunta que você está
fazendo** quando abre Configurações:

| grupo | a pergunta | abas |
|---|---|---|
| **A casa** | como o negócio é montado | A Casa · Equipe · Cemitérios · Dias e horários · Campo |
| **O dinheiro** | quanto custa e como cobro | Régua de cobrança · Flores e extras |
| **A conversa** | o que sai daqui para a família | WhatsApp · Mensagens · Campanhas · Avaliações · Indicações |
| **O sistema** | está funcionando, e eu consigo provar | Privacidade · Auditoria · Diagnóstico |

A ordem dos grupos é a ordem de quem mexe mais. Preço de flor muda quando o
fornecedor muda; a lista de cemitérios não muda quase nunca.

**E consertei um defeito que apareceu no caminho.** A escolha de qual tela
desenhar era uma corrente de sete `aba !== ...` — uma lista do que ficava *de
fora*. Toda tela nova tinha de lembrar de se excluir dali, e duas não
lembraram: **Cemitérios e Régua de cobrança mostravam, coladas embaixo, a
lista de erros do sistema**. Agora a lista é do que *entra*.

---

# O que isto NÃO faz

**Nenhuma mensagem passa a sair sozinha.** A chave de disparos continua onde
estava, o aviso em massa continua caindo na fila de liberação, e o comando
continua sendo seu. Isto aqui só **enxerga**.

---

# O que fazer agora

1. Abra **Configurações → WhatsApp** e veja o bloco *"Está chegando alguma
   coisa?"*. Se a última mensagem for de muitas horas atrás, reconecte por ali.
2. O comprovante da Josiane: anexe pela ficha dela, em **Conta corrente →
   Pagamento**. A leitura preenche valor e data.
3. Daqui para frente, se uma família disser "eu mandei", dá para saber. É
   `sureya_rastro_telefone` com o número dela.

# Ficou pendente

- O rastro começa **hoje**. Não dá para recuperar o que foi perdido entre 04 e
  22 de agosto — aquelas mensagens não existem em lugar nenhum do sistema.
- Se alguma família escreveu de um **número que não está no cadastro**, ela
  virou "lead" e a mensagem foi para `leads.mensagens`, não para uma conversa.
  Vale conferir os oito leads que se mexeram no dia 23/08.
