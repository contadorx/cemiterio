# A família chega ao app de campo

*28 de agosto · sem migration, sem nenhum dado tocado*

## O buraco

A família é a entidade do sistema desde a D-10: dela é o contrato, é ela que
aparece na agenda do painel, na conferência e na cobrança.

O app de campo era **o único lugar que não a mostrava**. Medido: `/api/agenda/dia`
devolvia jazigo, quadra, rua, falecido e contato — **zero menção a família**. A
Nina lavava o jazigo *da família Nakandakari* e a tela dela não dizia de quem
estava cuidando.

## O que mudou

A família entra no cartão do jazigo e na tela de "como chegar".

**O título continua sendo o que está escrito na lápide.** É por ele que ela
reconhece a pedra na frente dela — trocar pelo nome da família faria a Nina
procurar no cemitério por um nome que não está gravado em lugar nenhum. A
família vem na linha de baixo, que é a pergunta seguinte: *de quem estou
cuidando?*

**Ela vem do túmulo, não do serviço.** `servicos.cliente_id` é quem **pediu**:
faz sentido num avulso e é nulo na lavagem de contrato, que é a maioria do dia
dela. Lendo dali, o cartão ficaria vazio justamente nas lavagens de sempre.

E a linha não aparece quando não há o que dizer — linha vazia num cartão que se
lê de relance é ruído.

## O que eu achei no caminho, e o erro que eu cometi

Você tinha pedido, junto, para tirar o WhatsApp do menu. **Eu tirei do lugar
errado.**

`ui.tsx` tinha uma lista de menu completa, comentada e plausível — e
`PainelNav`, que a renderizaria, **devolve `null`** desde que o menu virou a
coluna do `AppShell`. A lista estava morta havia tempo, e tinha divergido do
menu de verdade (`Sidebar.tsx`): trazia *WhatsApp* e *Liberação*, e não trazia
Conversas, Jazigos, Conferência nem Memória.

Editei essa lista, achei que tinha feito, e não teria mudado nada na tela.

**No menu de verdade o WhatsApp já não estava** — a tarefa estava feita e o
backlog é que não sabia. O estrago da lista morta não é o byte parado: é que
ela se lê como viva e faz o próximo perder a tarde, exatamente como me fez
perder. Apaguei a lista e deixei escrito no lugar dela onde mora o menu.

Uma guarda estática passa a cobrar que não exista uma segunda lista de menu, e
outra que o menu de verdade não ganhe entrada própria de WhatsApp de volta.

## O caminho do WhatsApp continua inteiro

`/painel/whatsapp` ainda responde (redireciona para a aba), o ponto vermelho do
Diagnóstico continua chamando quando a instância cai, e o aviso da fila de
liberação continua levando direto ao botão de reconectar.

## O que olhar

Abra o app de campo com a agenda de um dia que tenha lavagem. Cada cartão deve
mostrar, embaixo do nome da lápide, **família Fulano · o código do jazigo**. Se
alguma linha aparecer vazia ou com "família null", me diga — é bug meu.
