# A limpeza avulsa tem botão

Você perguntou onde ficava. **A resposta é: não existia.**

`POST /api/servico` foi escrita exatamente para isso — o cabeçalho dela até
diz *"agora tem botão na ficha da família"* — e **nenhuma tela a chamava**.

Pior: o texto vazio da tela de Avulsos prometia o botão com todas as letras
(*"elas nascem na ficha da família, no botão 🧽 Nova limpeza avulsa"*). Esse
texto é meu, de ontem. Estava mentindo, e já foi corrigido.

---

## O botão, na ficha da família

O cartão **Limpezas** agora tem dois botões, porque são dois atos diferentes e
antes um só parecia servir para ambos:

| | o que faz |
|---|---|
| **Marcar avulsa** | a que **vai** ser feita — entra pendente, o alocador põe no roteiro |
| **Registrar feita** | a que **já** aconteceu — entra executada, aceita foto |

O formulário tem os quatro campos que você pediu:

- **Qual túmulo** — os da família
- **Para quando** — a data que a família pediu; o alocador nunca passa dela
- **Valor** — o preço desta limpeza
- **Quem pediu** — a pessoa, dentre os contatos da família
- **Recebimento** — antes ou depois

---

## "Antes" faz alguma coisa, não é rótulo

Guardar a palavra e cobrar do mesmo jeito na conclusão seria enfeite. Então:

- **antes** → a dívida entra no extrato **agora**, com o preço digitado. A
  partir daí a régua de cobrança enxerga, e a família pode pagar antes da
  limpeza.
- **depois** → nada agora; a cobrança nasce quando a limpeza for concluída.

Sem valor **não há débito**: cobrar R$ 0,00 é pior que não cobrar, porque
parece cobrança feita. A tela diz isso quando acontece.

### O preço é o do serviço — e isso não é detalhe

A rota antiga usava `valorDaLimpeza()`, que devolve **zero** para família que
não seja contratada em modo consumo. Uma avulsa para quem **não tem contrato**
— o caso mais comum — viraria um débito de **R$ 0,00**: trabalho feito que
nunca vira dinheiro. É a pendência 21, aberta há meses.

A cascata da conclusão já começava certo (`coalesce(nullif(v_s.valor, 0), 0)` —
o valor do próprio serviço). O que faltava era alguém preencher esse valor.
Agora o formulário preenche.

---

## O "quem pediu" é conferido

Numa família com quatro pessoas, *"foi a Sônia que pediu"* é a diferença entre
saber e adivinhar na hora de cobrar.

Sem escolha, herda quem acerta a conta do jazigo. Com escolha, a rota **confere
se o contato é mesmo daquela família** — um id de outra passaria pelo banco (a
coluna só exige que exista) e poria o pedido no nome de um estranho.

---

## O vocabulário já existia, preso numa tabela morta

`sureya_momento_cobranca` (`antes` | `depois` | `contra_foto`) existe desde
sempre — e morava **só em `planos`**. A conclusão lia assim:

```sql
select coalesce(p.momento_cobranca::text, 'depois') into v_momento
  from planos p where p.id = v_s.plano_id;
```

Como `plano_id` é nulo em toda lavagem desde a 0100, isso resolvia **sempre**
para `'depois'`. **Pré-pago e contra-foto eram código morto** — mais um órfão
da mudança de casa do contrato, e ninguém tinha percebido.

Então não há palavra nova aqui: o momento desceu de `planos` para `servicos`,
que é onde você pediu que ficasse. O plano legado continua na cascata, depois
do serviço, para as quatro lavagens que ainda têm `plano_id` não mudarem de
comportamento.

---

## Dois achados no caminho

**Um tipo que só existia em produção.** Ao aplicar a migração no banco limpo:
`type "sureya_momento_cobranca" does not exist`. A trilha cria
`planos.momento_cobranca` como **text** (0026); alguém converteu a coluna para
enum **direto no banco, sem migração**.

O placar do harness nunca pegou porque ele conta **objetos** — tabelas,
funções, gatilhos, policies — e não o tipo de uma coluna. E a 0062 usa
`::sureya_momento_cobranca` dentro de um corpo plpgsql, onde o cast só é
resolvido em execução: passou dez migrations invisível. Agora o tipo está na
trilha.

*Fica dito e não consertado:* `planos.momento_cobranca` continua `text` na
trilha e enum em produção. Igualar mexe na tabela legada que ainda dobra a
geração no jazigo Perrela — é da fatia que aposenta `planos`.

**Eu tropecei três vezes na mesma pedra.** Uma guarda que proíbe um texto achou,
no comentário que **explicava** a troca, a citação do que fora trocado — no
`semPlano`, no "Virou cliente" e agora no botão da avulsa.

E o ajudante que resolve isso (`semComentarios`) **já existia no topo do
arquivo**, com a lição escrita ao lado: *"explicar num comentário por que o
texto saiu derruba o teste, e a lição fica sem lugar para morar"*. Eu não o usei
— e na terceira vez ainda declarei um segundo com o mesmo nome, que quebrou o
arquivo. Removido; as guardas usam o que já estava lá.

---

9 guardas estáticas e 5 verificações em SQL. `npm run ci` verde: 227 testes,
121 migrations, placar igual à produção.
