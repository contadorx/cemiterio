# Build E — vocabulário e casa arrumada

CA-14, CA-09, CP-10 e o que sobrou do Build C. **Você me deixou escolher as
palavras; aqui está a escolha, com a razão de cada uma.**

## As cinco palavras

Contei antes de escolher. Só no painel: **"em aberto" 41×, "saldo" 61×,
"recebido" 22×, "devendo" 21×, "atrasado" 27×, "falta pagar" 5×, "a receber"
2×**. Sete palavras para três ideias, e nenhum lugar dizendo qual é qual.

O risco não é estético. **"Saldo"** aparecia como o que a família deve, o que
ela tem a favor, e o caixa do mês — em telas vizinhas, com o mesmo nome. Ler
*"saldo R$ 2.315"* e entender *"temos isso no caixa"* quando é *"isso está na
rua"* é uma decisão errada com dinheiro na mesa.

| palavra | o que é | o que ela substitui |
|---|---|---|
| **a receber** | lançado na conta da família e ainda não entrou | em aberto, falta pagar, devendo, atrasado |
| **recebido** | entrou e já está na conta dela | — já era a palavra certa |
| **a identificar** | caiu no banco e ainda não se sabe de quem é | não tinha nome fixo |
| **conferido** | alguém olhou e confirmou que está certo | conciliado |
| **saldo da família** | a posição dela hoje: a receber, ou a favor | "saldo" solto, sem dono |

### Onde eu discordo da auditoria

Ela propunha **`conciliado`**. Escolhi **`conferido`**, por três razões medidas:

1. **O banco já fala assim.** `comprovantes.status` tem o valor `a_conferir`, e
   `conta_corrente` tem `conferido_em`, `conferido_por`, `nota_conferencia`.
   Adotar "conciliado" custaria renomear um enum em produção para trocar uma
   palavra que funciona por uma que não.
2. **A tela já fala assim:** "conferir" aparece 52× no painel, contra 4× de
   "conciliar" e 1× de "conciliação".
3. **"Conciliação" é palavra de contabilidade**, e quem usa isto não é
   contadora. "Conferir" é literalmente o que ela faz: olha o comprovante e diz
   se está certo.

### Duas coisas que eu **não** troquei, de propósito

"Em aberto" tem outro sentido no sistema, e ele está certo:

- na **agenda**, *"deixar em aberto (qualquer pessoa)"* quer dizer **sem
  pessoa definida** — não é dinheiro;
- em **Extras**, *"Pedidos em aberto"* quer dizer **não entregue** — também
  não é dinheiro.

Trocar essas duas teria sido aplicar a regra sem ler o que ela diz.

O vocabulário vive em `src/lib/vocabulario.ts`, num lugar só. Não é economia de
letra: é para que trocar uma palavra amanhã seja trocar uma linha, e não caçar
41 ocorrências torcendo para achar todas.

Junto veio `frasedoSaldo()`. A convenção de sinal é `negativo = a receber`, e
ela **já foi invertida por engano em três rotas** (0105, 0106, 0122). Agora
nenhuma tela precisa lembrar do sinal: passa o número, recebe a frase.

## O funil (CA-09)

O Financeiro abria direto em "Fechar o mês". Não estava errado — era uma
**resposta antes da pergunta**. Dá para fechar o mês com dinheiro do banco ainda
sem dono, e nada na tela dizia isso.

Agora a primeira coisa são quatro números, que são o vocabulário em ordem:

| | | |
|---|---|---|
| **1. A identificar** | Caiu no banco. De quem é? | → Conferir entradas |
| **2. A conferir** | Chegou com dono. Está certo? | → Conferir entradas |
| **3. A receber** | Está lançado e não entrou. | → Famílias, já filtrada |
| **4. Fechar o mês** | Tudo conferido? Então dá para fechar. | → Fechar o mês |

Medido hoje na produção: **0 · 0 · 22 famílias (R$ 2.315,00) · o mês**.

Três coisas que valem dizer:

- **Cada número vem da mesma regra da tela que ele abre.** "A receber" usa
  `calcularSaldosPorFamilia` — a mesma função da ficha e da lista; "fechar" usa
  `previewCompetencia`, a mesma prévia da tela de fechamento. Uma segunda conta
  aqui começaria igual e terminaria discordando, como já aconteceu três vezes
  neste projeto.
- **Etapa que não deu para ler mostra "?", não zero.** É o "vazio não é zero"
  de novo, agora no funil.
- **A etapa vazia fica na tela, em cinza.** Aqui, ao contrário do "Precisa de
  você", sumir seria errado: o funil é uma sequência, e sequência com buraco não
  se lê. *"0 a identificar"* é informação boa — quer dizer que o banco está em
  dia.

A etapa 3 leva para `/painel/clientes?atalho=em_aberto`, já filtrada e ordenada
por quem deve mais. Sem isso o clique traria a lista inteira e você refaria o
filtro à mão — que é o que o funil existe para evitar.

## CP-10 — 724 linhas apagadas

`CardTumulo.tsx` (167), `Concluir.tsx` (290), `ConfirmarJazigo.tsx` (189) e
`DistanciaAoVivo.tsx` (78). Nenhuma importada por nada.

Elas ficaram "por via das dúvidas" quando a câmera passou a viver dentro dos
botões do cartão, e viraram armadilha: **eu mesmo quase consertei a tela errada
ao mexer na fila do Build B**, e por isso pus um aviso no topo do arquivo
naquele dia. O aviso era remendo; o conserto é apagar. O histórico do git guarda
o que elas faziam, e é lá que se procura.

## Os 99 `alert` que sobraram do Build C

Convertidos — **o painel tem zero diálogos do navegador agora.**

Não foi em massa. O script converteu automaticamente só os inequívocos (os que
acompanham um `!r.ok`, e as validações de formulário do tipo "Informe a
quantidade"), e **parou em 26 ambíguos, que eu li um a um**. Entre eles:

- *"Família e jazigo cadastrados, mas o plano não foi criado"* → **aviso**, não
  recibo verde: deu certo pela metade;
- *"5 convertido(s), 2 não deu"* → **aviso**, pelo mesmo motivo;
- *"12 movida(s) para 03/09"* → **ok**.

Marcar qualquer um desses como sucesso verde seria o defeito que eu disse que
queria evitar.

## O que fica para depois, e por quê

**CA-05 (cadastro em etapas)** e **CA-11 (unificação visual)** não entraram.
Não é falta de tempo: os dois são reescritas de superfície grande — o formulário
inteiro de cadastro, e a migração de três telas de estilo em objeto para o mesmo
vocabulário visual das outras catorze. Fazer os dois no fim de um build que já
mexeu em 40 arquivos seria empilhar risco sem necessidade. Cada um merece o
próprio.

**CA-12** não é código: é sentar com a Sureya num aparelho de verdade, com
teclado aberto e voltando do navegador.

## Provas

15 guardas novas. Duas varrem o diretório inteiro: **nenhum `alert` do navegador
no painel** (65 arquivos) e **o cartão do campo tem uma implementação só**.

Uma guarda antiga **falhou, e estava certa em falhar**: ela esperava "em aberto"
e "saldo a favor dela" na tela de conferência. Atualizei a expectativa e escrevi
no arquivo por que — a tela mudou de propósito, não a guarda por conveniência.

`npm run ci` verde: 253 testes, placar igual à produção. Sem migração.

## O placar das 26 contraprovas

| | quantas |
|---|---|
| Aplicado | **22** |
| Não aplicado | 3 (CA-05, CA-11, CP-03) |
| Não se prova lendo código | 1 (CA-12) |

CP-03 ("dois toques concluem") nunca foi conserto: a câmera do celular pede
confirmação e isso não está na nossa mão. Vira métrica, não tarefa.
