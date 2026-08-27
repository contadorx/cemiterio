# Build F — cadastrar é uma tarefa só

CA-05, a primeira fatia de CA-11, e a metade do "Fazer este agora" que era tela
e não regra.

## Cadastrar uma família (CA-05)

Era **uma tela só, longa**: nome, tratamento, telefone, jazigo novo ou
existente, quadra, rua, falecido, frequência, valor, primeira lavagem e
consentimento — e, na mesma área, uma aba de importar planilha. A Sureya usa
isso no telefone, com a família do outro lado esperando.

Dois problemas, e o segundo é o grave:

1. um erro no fim obriga a reler a tela inteira para achar onde foi;
2. **quando dá certo pela metade, ela não sabe o que existe.** A rota cria a
   família, depois o jazigo, depois o plano — cada um pode falhar sozinho, e a
   resposta vinha `ok: true` com um aviso que passava como recado qualquer.

### Quatro passos, com conferência antes de gravar

| | |
|---|---|
| **1. Família** | quem é, e por onde falar |
| **2. Jazigo** | onde fica, ou qual dos capturados no campo |
| **3. Contrato** | com que frequência, por quanto, a partir de quando |
| **4. Conferir** | tudo junto na tela, antes de existir |

*"Nada foi gravado ainda. Confira e toque em cadastrar."*

Cada passo valida só o que é dele: errar o valor no passo 3 não faz voltar ao
nome. Dá para **voltar** pelos números da trilha, mas não pular para a frente —
pular sem passar pela validação do meio recriaria o buraco que isto conserta.

**Seguir sem jazigo continua sendo um caminho**, e a tela diz isso em vez de
tratar como erro: é o caso mais comum quando ela cadastra durante a ligação. No
resumo aparece o selo *"sem jazigo"* e o aviso de que a família vai aparecer em
"cadastro incompleto" até alguém ligar um.

### Quando entra pela metade

Vira uma **tela**, não um recado que some em quatro segundos:

> **Entrou pela metade**
> A família Silva foi cadastrada, mas nem tudo entrou junto:
> **O jazigo NÃO entrou.** …
> Dá para terminar na ficha dela, sem cadastrar de novo — cadastrar de novo
> criaria uma segunda família com o mesmo nome.

### Por que não virou transação única

A auditoria pedia isso também. **Medi antes de escrever a migração:** existem
122 famílias sem jazigo nenhum na produção, e você já explicou o que são —
*"ele não tem contrato pq eu ainda não cadastrei"*. É cadastro pela metade **de
propósito**, não sobra de gravação que falhou no meio.

Ou seja: não achei prova de que o sucesso parcial esteja sujando os dados. Uma
migração que mexe na criação de família por causa de um risco não medido é risco
trocado por risco. O que este build faz é o que a medição sustenta — validar
antes de gravar, o que evita quase toda falha parcial, e quando ela mesmo assim
acontecer, dizer com todas as letras o que existe e o que não.

Se um dia aparecer uma família criada sem jazigo que você **não** quis criar
assim, isso é a prova que falta, e aí a migração se justifica.

### Planilha virou porta própria

"+ Nova família / importar" era um botão só, abrindo um cartão com duas abas.
São trabalhos de momentos opostos: um é com a família na linha, o outro é uma
migração que se faz uma vez. Dividir a mesma área fazia a planilha aparecer
quando ela queria cadastrar uma senhora.

Agora são dois botões, e o `Importar` perdeu **193 linhas** — a metade dele que
era o formulário antigo.

## CA-11 — a primeira fatia

A auditoria manda migrar por fluxo, **começando por formulários e ações
críticas**. Cadastrar família é os dois. O componente novo usa só as peças de
`pecas.tsx` (`Cartao`, `Campo`, `Entrada`, `Selecao`, `Botao`, `Selo`) e não tem
uma linha de estilo em objeto.

Isso não fecha CA-11 — Agenda, Famílias e Financeiro continuam em `ui.tsx`. É a
fatia que a própria auditoria pede primeiro, e agora existe um formulário de
referência para as próximas.

## O "Fazer este agora"

Você perguntou se aqueles jazigos eram prioridade. Não eram. Esta é a metade da
resposta que é tela:

- o **botão** virou link discreto. Ele aparecia em 9 de 10 cartões e não dizia
  nada sobre o jazigo — bloco com seta, em quase tudo, é lido como distintivo.
  Continua fazendo exatamente o mesmo;
- o que **é** prioridade ganhou selo próprio, forte, acima dos outros avisos:
  *"⚠ PRIORIDADE — ficou para depois 3×"*.

**A outra metade continua esperando você**, e está no `ROADMAP_UX.md`: hoje só
levanta prioridade o que a Nina adiou duas vezes. Família que ligou pedindo,
data de memória chegando e atrasado do mês passado não levantam. Isso é régua de
negócio, não ajuste de tela — me diga quais casos devem levantar e eu monto.

## Provas

11 guardas novas, entre elas que o último passo confere antes de gravar, que dá
para voltar mas não pular para a frente, que o sucesso pela metade vira tela, e
que o cadastro novo não tem estilo em objeto.

`npm run ci` verde: 253 testes, placar igual à produção. Sem migração.

## O placar

| | quantas |
|---|---|
| Aplicado | **24** |
| Parcial | 1 (CA-11 — a fatia dos formulários) |
| Não se prova lendo código | 1 (CA-12) |

CP-03 ("dois toques concluem") sai da lista de tarefas: a câmera do celular pede
confirmação e isso não está na nossa mão. É métrica, não conserto.

**O que sobra de verdade:**

- **CA-11 inteiro** — migrar Agenda, Famílias e Financeiro de `ui.tsx` para as
  peças. É trabalho grande e sem risco de dados; vale fazer quando não houver
  coisa melhor na fila.
- **CA-12** — sentar com a Sureya num aparelho, com teclado aberto e voltando do
  navegador.
- **A régua de prioridade** — sua decisão.
