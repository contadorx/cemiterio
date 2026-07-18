# Lista fechada — todas as telas no ar

## App da Nina — refeito
**Resumo curto**: saudação, quantos jazigos hoje, e só o NÚMERO dos que pedem
atenção. O detalhe saiu do resumo e foi para o card de cada jazigo — que é onde
a informação serve, na hora de fazer.

**Card do jazigo**: QD · RUA em cima, nome do falecido, e os avisos ali mesmo
(🌷 data de memória · ⏰ ficou pra depois 3x · 📷 primeira visita). Agrupado
por rua, na ordem em que se anda.

**Fluxo novo**: ▶ Começar → confirma o jazigo (lê o QR da plaqueta ou confere
pela foto; pode seguir sem) → foto do antes → cronômetro rodando no card →
📸 Finalizar com a foto. O tempo entre os dois vira produtividade.

**Não deu**: botão em todo card, com motivos prontos (chuva, acabou a água,
não achei, acesso fechado, não deu tempo, não estava passando bem). Volta para
a fila de amanhã com prioridade e vira ocorrência classificada.

**Sair** no canto. **PWA** com o nome Zelo & Memória.

## Admin no campo
Menu → 📍 Campo. O dono abre a mesma tela da Nina para testar ou cobrir uma
falta. Com `?executora=ID` assume a rota de alguém.

## Financeiro → Resultado por jazigo
Receita × custo (tempo medido × custo/hora + material), do pior para o melhor,
com quantos estão no prejuízo. Avisa quando há jazigos **sem tempo medido** —
esses mostram margem cheia, que não é real.

## Custo de IA — medido, não estimado
O cartão passa a dizer "medido" quando há tokens registrados, com o total de
tokens do mês. Enquanto não houver medição, mostra "estimado" e usa o valor
antigo.

## Materiais
Campo **"gasto por limpeza"** editável, que mostra "dura ~20 limpezas".
Botão **Comprei** por item: registra quantidade e valor, repõe o estoque,
recalcula o custo unitário e **compara com as limpezas do período para sugerir o
gasto real** — você aprova ou deixa como está.

## Leads e prospecção
Duas naturezas separadas na mesma tela:
- **Escreveram no WhatsApp** (borda laranja) — a IA não respondeu, porque pode
  ser alguém da vida pessoal da Sureya.
- **Prospecção** (borda verde) — cadastrada por ela, com o contexto que conhece.

Botão **✨ Sugerir mensagem**: a IA escreve a primeira abordagem a partir do
contexto. O texto aparece num campo editável — ela lê, ajusta e só então abre no
WhatsApp com a mensagem pronta.

## Planos
Menu → Planos: valor, periodicidade, pago até, próxima lavagem e próxima
cobrança, tudo editável na linha.
