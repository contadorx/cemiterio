# Conversas — uma tela só, e a liberação primeiro

## O que eu encontrei antes de mexer

Fui ver o banco antes de montar a tela. O resultado mudou o desenho:

> **164 mensagens paradas** esperando decisão, numa fila que nenhuma tela do
> menu mostrava. **157 eram cobranças**, geradas dia após dia entre **04 e 22 de
> agosto**.

Não é que alguém decidiu não enviá-las. **Ninguém viu.**

Existiam **duas filas** de mensagem esperando aprovação:

| | onde ficava | quem olhava |
|---|---|---|
| foto da lavagem, cobrança da fila | `/painel/fila` | todo dia |
| aniversário, Finados, aviso de saldo, cobrança gentil | aba "Rascunhos da IA", dentro de outro endereço | ninguém |

E pior que o esquecimento: **as proteções não valiam na segunda**. A chave de
"não enviar para esta família", a contagem de tentativas e o destravamento do
que morre no meio do envio existiam numa fila e não na outra.

---

## A porta única

Agora tudo entra pela mesma fila e passa pelo mesmo gatilho: **fotos das
lavagens, cobranças, lembretes, ações comemorativas e convites de serviço**.

**As 164 antigas eu não migrei sozinho.** São 157 cobranças de até 19 dias atrás,
muitas do mesmo cliente em dias seguidos — despejá-las na fila de envio seria
preparar cobranças repetidas para a mesma família. Elas estão numa aba **"Fila
antiga"**, com o número anunciado logo na primeira aba, e **a aba some quando
você zerar a lista**.

---

## A tela

**Menu: "Contatos" virou "Conversas".** `/painel/fila` e `/painel/contatos`
continuam funcionando, redirecionando — estão em links e no seu navegador.

Quatro abas, na ordem do dia:

### 1. Liberação (primeira)

Filtro por tipo em cima, com o número de cada um: **Tudo · Fotos · Cobranças ·
Lembretes · Comemorativas · Serviços · Agradecimentos**. Os números são contados
**sem** o filtro, senão sumiriam justamente quando servem.

Cada mensagem mostra a **última ação desta família**:

```
Última mensagem para esta família: cobrança há 3 dias · deste mesmo tipo, há 12 dias
```

São duas perguntas diferentes e as duas se fazem na hora de liberar: "já mandei
cobrança para essa gente?" e "eu já não falei com essa família esta semana?".
Três mensagens no mesmo dia, cada uma de um tipo, cada uma liberada sozinha sem
que nada dissesse que as outras existiam — é assim que se cansa uma família.

E o **"não enviar mais deste tipo"**, ao lado do "não enviar":

> Descartar resolve a mensagem de hoje. Isto resolve a decisão — há família que
> não quer cobrança por WhatsApp, e família em luto para quem uma mensagem
> comemorativa é uma ofensa. Descartar item a item é lembrar disso todo mês, e
> basta esquecer uma vez.

Vale **na porta**: a próxima nem chega a ser preparada. O que já está na fila
continua lá, para você decidir — sumir com o que você está olhando seria decidir
por você.

*A foto continua com a chave dela* (Config › Fotos e na ficha da família), porque
ela tem três estados — ligada, desligada e "segue a casa" — e este silêncio tem
dois.

### 2. Conversas

Todas as registradas, com **resolver, arquivar, reabrir, fixar e ação em massa**.
Isso já existia no módulo antigo e foi **religado, não reescrito**.

### 3. Contatos do site

Quem escreveu pelo site e ainda espera resposta.

### 4. Fila antiga

O passivo das 164. Some quando zerar.

---

## A IA como assistente

Dentro de uma conversa, ao lado de **Enviar**, o botão **🤖 Sugerir resposta**.

**Não é o robô de volta.** O robô respondia sozinho e foi desligado por um bom
motivo. Este botão escreve **no campo de texto** e para por aí: quem lê, corrige,
apaga e envia é você. A rota não grava mensagem e não chama o WhatsApp.

**O que ela lê:** as últimas 60 mensagens da conversa (o "Me ajuda a escrever"
lia 16 — a pergunta de hoje quase sempre continua uma combinação de semanas
atrás), os jazigos, o saldo, a régua de cobrança, o tratamento da família e o
conhecimento da casa.

**O trabalho não é escrever: é lembrar.** Para responder bem é preciso saber que
esta família tem dois jazigos, que a última limpeza foi há seis dias, que está
R$ 80 adiantada e que a régua dela é "suave" — isso está em cinco telas.

**Ela diz o que não sabe.** Faltando um valor ou uma decisão que é sua, ela
escreve até onde dá e deixa `[confirmar a data com a Sureya]` entre colchetes. E
a tela diz quantas mensagens ela leu, em vez de pedir fé.

Os dois botões têm usos diferentes: *Sugerir resposta* é um clique, para
responder o que a família acabou de perguntar. *Me ajuda a escrever* continua
para quando você já sabe o que dizer e quer três jeitos de dizer.

---

## O que subir

**No Supabase (já aplicada):**
`migrations/0094_a_liberacao_e_uma_porta_so.sql`

| arquivo | o quê |
|---|---|
| `src/lib/proativo.ts` | cobrança, aviso e datas entram na fila única |
| `src/lib/ativacao.ts` | convites comemorativos e de serviço, idem |
| `src/app/api/fila/route.ts` | filtro por tipo, última ação, contagem por tipo |
| `src/app/api/familias/[id]/silenciar/route.ts` | **novo** — não enviar mais deste tipo |
| `src/app/api/conversas/[id]/sugerir/route.ts` | **novo** — a IA assistente |
| `src/app/api/conversas/[id]/ajuda/route.ts` | histórico de 16 → 60 mensagens |
| `src/app/painel/conversas/page.tsx` | a tela com as quatro abas |
| `src/app/painel/conversas/VisaoLiberacao.tsx` | **novo** — a liberação como aba |
| `src/app/painel/conversas/VisaoSite.tsx` | **novo** — contatos do site como aba |
| `src/app/painel/conversas/[id]/page.tsx` | o botão Sugerir resposta |
| `src/app/painel/fila/page.tsx`, `contatos/page.tsx` | viram redirecionamento |
| `src/app/painel/Sidebar.tsx` | "Contatos" → "Conversas", entrada única |

## O portão

```
RESULTADO: 183 passaram, 0 falharam
  tabelas      58  = producao (58)
  funcoes      86  = producao (86)
  gatilhos     18  = producao (18)
  policies    119  = producao (119)
✓ Compiled successfully
```

Sete provas SQL novas na porta: os tipos novos entram, o silêncio barra **antes**
de a mensagem existir, o silêncio é por tipo e não um mudo geral, o que já estava
na fila não some, a última ação não conta o que foi descartado, e a foto continua
passando pela chave dela.
