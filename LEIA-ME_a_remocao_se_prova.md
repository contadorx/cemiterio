# A remoção a pedido alcança o que ficou, e se prova

*Migration 0140 · 27 de agosto*

## O item era "exercitar a remoção com uma família de teste"

O caminho existia desde a migration 0010, foi reforçado na 0078 e de novo na
0135. **Nunca tinha rodado.** E não dava para rodar: descobri, indo fazer, que
**não existe botão nenhum no painel** — só "Exportar os dados" e "Excluir
ficha", que é outra coisa.

Então rodei em produção, dentro de um bloco desfeito: anonimizei uma cliente
real e depois varri **toda coluna de texto do banco** atrás do nome e do
telefone dela. Ler a função não teria bastado — o que ela esquece não aparece
nela.

## O que sobrou, medido

| onde | quantos | |
|---|---|---|
| `leads.telefone` | 1 | o número dela, inteiro |
| `leads.nome_wa` | 2 | uma é ela; a outra é **outra pessoa** |
| `interacoes_ia.rascunho` | 3 | rascunhos que a chamam pelo nome, com valores |
| `eventos_webhook.telefone` | 3 | o número no log cru do WhatsApp |
| `familias.nome` | 1 | "Família Kátia" |
| `familias.observacoes` | 1 | "Criada automaticamente a partir do cadastro de Kátia" |

## O pior deles estava escondido em código que parece certo

A função fazia, nesta ordem:

```sql
update clientes set telefone = 'anon:...' where id = p_cliente;
...
update leads ... where telefone in (select telefone from clientes where id = p_cliente);
```

Quando o segundo `update` roda, a subconsulta já lê `anon:cd2a22148280`. Medi
no ensaio: **ela casa zero linhas**. A limpeza dos leads nunca funcionou, desde
que foi escrita — e não havia como saber lendo, porque a linha está lá e parece
certa.

## O conserto tem duas partes, e a segunda importa mais

**(1) Alcançar o que ficou.** Os telefones são capturados **antes** de qualquer
escrita. Os rascunhos da IA, o log do webhook e o lead entram na limpeza. E a
família batizada com o nome dela deixa de carregá-lo.

**(2) A remoção passa a se provar.** `sureya_anonimizar_cliente` agora
**devolve o que sobrou** — ela mesma roda a varredura, com o nome e o telefone
que ainda tem na mão. Consertar a função resolve os seis casos de hoje;
devolver a varredura resolve o sétimo, o que vai aparecer na tabela que alguém
criar mês que vem e esquecer de incluir aqui.

O laudo fica na tela e vai para a auditoria. Um pedido de remoção é a única
operação deste sistema em que alguém pode ter de **provar**, meses depois, que
foi feita — e "apertei o botão e ele ficou verde" não é prova de nada.

## Telefone é defeito; nome é para conferir

O telefone é inequívoco: se aparece, sobrou dado dela. O nome não — "Kátia"
também é o começo de "Kátia C. Lima", que é **outra pessoa** e não pediu nada.
Por isso o laudo separa os dois, e só o telefone conta como falha. Alarme que
grita por menção de terceiro ensina a ignorar alarme.

Depois do conserto, o mesmo ensaio: **zero por telefone**, e o único item
restante é justamente a outra Kátia — a classificação funcionando.

## A família não é apagada, mas perde o nome dela

A família é o contrato e pode ter outras pessoas. O que sai é o nome: ela passa
a se chamar **"Família do jazigo Q1-R1-001"**. Renomear para "família removida"
deixaria você sem saber de quem é o jazigo que a Nina continua lavando toda
semana. Na observação, troca-se **só o nome** — o resto do que estiver escrito
ali pode ser sobre outra pessoa da família.

## Três coisas que apareceram de raspão

**A remoção não tinha botão.** Agora tem, e é distinto de "Excluir ficha": um
remove o que identifica a pessoa e mantém contrato e histórico de pagamento
(que a lei manda guardar); o outro apaga o cadastro.

**Uma coluna que só existia em produção.** `interacoes_ia.motivo_retencao`
existe no banco e **nenhuma migration a cria** — foi acrescentada pelo painel do
Supabase. A migration 0120 já a **lê**, mas dentro do corpo de uma função, que o
Postgres não valida na criação: num banco reconstruído do zero a trilha passa e
a função explodiria na primeira chamada. Entrou na trilha.

**Três definições de "hoje" no código.** O CI reprovou uma alocação correta às
00h46 de UTC — 21h46 em São Paulo: o alocador pôs uma lavagem em 27/08, que é
hoje em São Paulo, e o teste comparou com 28/08, que é hoje em UTC.
`diaOperacao` existe desde a 0114 e foi escrita para exatamente isso; o arquivo
de testes e uma função do motor de datas eram os dois últimos lugares com a
definição antiga. Três horas por dia, todo dia, os dois discordavam.

## O que fica na sua mão

Se quiser ver funcionando antes de a primeira família pedir: cadastre uma
família de teste com telefone e uma conversa, e aperte **Remover os dados a
pedido da família** na ficha dela. O laudo aparece embaixo do botão. É a mesma
operação que rodará no dia real.
