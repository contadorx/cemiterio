# A promessa tem dono e prazo — e a IA passa a saber o preço

**Migrations 0142 e 0143. Nenhum dado de produção foi tocado: a tabela nova
tem zero linhas.**

---

## O que eu medi, em 29/08, em produção

Peguei as **25 últimas respostas da IA a mensagens de família** e li uma por uma.

| | |
|---|---|
| respostas lidas | 25 |
| prometiam voltar depois | **11 (44%)** |
| diziam um prazo | **0** |
| deixavam algum registro | **0** |

A frase é sempre a mesma: *"deixa eu conferir isso direitinho e já te falo."*
Ela sai, a família espera — e do lado de cá **não existia nada**. Nem lista, nem
relógio, nem quem. A promessa evaporava no instante em que era feita.

E tem um detalhe que dói mais. Uma dessas onze respondia à pergunta **"qual o
valor dos 2 vasos?"**. A resposta prometeu conferir.

**"Troca de vaso: R$ 60,00" estava cadastrado em `servicos_extras` desde sempre.**

A IA não estava sendo prudente. Ela estava prometendo voltar por um dado que a
casa já tinha na mão e que ninguém tinha colocado na frente dela.

Outras **seis** das onze eram *"recebi seu comprovante, vou conferir e te
confirmo"*. Essa promessa é estruturalmente verdadeira — o comprovante fica
`a_conferir` até alguém confirmar. O problema não é a frase: é que **conferir
não devolvia nada para a família**. Medido junto: **94 lançamentos, ZERO
conferidos.**

---

## Por que isso não se resolve proibindo a frase

Foi a primeira coisa que eu pensei, e está errada.

Às vezes conferir **é** a coisa certa a dizer. Uma IA proibida de dizer "vou
conferir" vai inventar um número — que é exatamente o defeito que o prompt
inteiro foi escrito para evitar.

O conserto são duas coisas diferentes, e as duas precisam existir:

1. **Dar à IA o que ela não tinha.** Metade das promessas era por falta de dado.
2. **Dar dono e prazo ao que sobrar.** Do jeito que uma pessoa faria: anotando.

---

## Peça 1 — o que a IA sabe antes de responder

Três blocos novos chegam ao contexto dela, e **só quando há o que dizer** (bloco
vazio é token pago para nada, e ruído que ela tenta interpretar):

- **A tabela de extras da casa** — nome e preço de cada serviço cadastrado.
  Junto vem uma regra dura: *"preço que está na tabela é preço da casa:
  **responda o valor**, não prometa conferir."*
- **Os pedidos desta família ainda em aberto** — com ocasião e prazo. Sem isso,
  a mensagem seguinte virava assunto novo e a família repetia o que já tinha dito.
- **Os comprovantes que ela mandou e ainda não foram conferidos** — valor e data.
  Sem isso, a IA podia pedir de novo o que já tinha chegado.

Um cuidado que virou teste: comprovante cujo **valor não foi lido** aparece como
*"valor não lido"*, nunca como **R$ 0,00**. Vazio não é zero — e "recebi seu
comprovante de R$ 0,00" é pior que não dizer nada.

## Peça 2 — a promessa vira uma linha

A IA agora é **obrigada** a declarar, em toda resposta, duas coisas: se prometeu
voltar, e sobre o quê. São campos obrigatórios da ferramenta — campo opcional é
campo que não vem.

Quando a mensagem **sai**, a promessa vira uma linha em `compromissos`, com:

- **o que** foi prometido, em uma frase;
- **o texto que a família leu** — sem ele, "confirmar o valor dos vasos" não diz
  o que ela está esperando ouvir;
- **até quando**: um dia útil. Quem ouve "já te falo" espera hoje ou amanhã.

### Ela nasce no ENVIO, não no rascunho

Rascunho descartado não prometeu nada a ninguém. Anotar na hora de rascunhar
encheria a lista de dívidas que a família nunca ouviu.

### Onde ela aparece

**No "Precisa de você", como a primeira fila** — antes de tudo, porque do outro
lado tem gente esperando resposta que já foi prometida.

**Dentro da conversa, ACIMA das mensagens.** Quem abre a conversa para responder
precisa saber o que já foi prometido **antes** de escrever. Embaixo da rolagem,
seria lida depois do envio — quando não serve mais.

### Dois botões, e eles dizem coisas diferentes

- **"Já respondi isso"** — a família ouviu a resposta.
- **"Não cabe mais"** — a promessa perdeu sentido (ela resolveu sozinha, o
  assunto morreu).

Um botão só de "feito" misturaria os dois, e daqui a três meses ninguém saberia
se a família foi respondida ou se a pendência foi varrida para debaixo do tapete.
O banco recusa fechar sem dizer qual dos dois foi.

### Fechar aqui NÃO manda nada

Continua valendo o combinado: **o disparo é manual, pela fila das conversas.**
Fechar um compromisso é dizer o que aconteceu com o assunto; a resposta, se
houver, sai pelo campo de texto, com o seu toque. Um botão de "já respondi" que
disparasse texto sozinho seria uma segunda porta de envio — que é o defeito que
a 0094 fechou.

---

## Para dar para medir de novo

A marca fica em **dois lugares**: em `compromissos` quando a mensagem sai, e na
própria `interacoes_ia` **sempre** (`prometeu_voltar`, `promessa_sobre`).

Se a única marca fosse a linha de compromisso, daqui a um mês não daria para
responder a pergunta que importa — *"melhorou?"* —, porque as respostas que
prometeram e não viraram compromisso sumiriam da conta. Medir só o que deu certo
é como contar só as lavagens que deixaram foto.

As 145 linhas antigas entram como `false` sabendo-se que é chute. **A medição de
"melhorou" começa da data desta migration**, não do início do mundo.

---

## O que está provado

**14 asserções no banco** (`testes/compromissos.sql`), rodando em base limpa:

- a promessa aberta aparece; a cumprida sai; a do vizinho não aparece;
- **vencer hoje ainda não é atraso** — e vencida ontem é. O "hoje" é o de
  Brasília, não o de UTC: das 21h à meia-noite o dia em UTC já virou, e a
  promessa de hoje apareceria vermelha na véspera. Alarme errado a noite inteira
  ensina a não olhar o alarme;
- o mais vencido vem primeiro;
- fechar sem dizer o desfecho é **recusado**; desfecho inventado é **recusado**;
  promessa sem assunto é **recusada**;
- `anon` não executa a lista — ela devolve nome de família e o que foi prometido
  a ela. `SECURITY DEFINER` ignora RLS, e o Supabase concede EXECUTE a `anon` por
  padrão em `public`: migration que não revoga, publica (lição da 0129).

**15 asserções no código** (`testes/simular.ts` seções 12c e 12d,
`testes/checar-ficha.mjs`):

- sem catálogo, o prompt não inventa tabela de preços; com catálogo, o preço
  chega e ela é mandada **responder**, não prometer conferir;
- comprovante sem valor lido diz isso, não R$ 0,00;
- nenhum bloco novo aparece quando não há dados;
- a IA é obrigada a declarar se prometeu e sobre o quê;
- prometeu sem dizer o quê **não** vira pendência — uma lista que não diz o que
  fazer se aprende a ignorar inteira;
- a promessa é anotada na rota de **aprovar** (o envio);
- fechar um compromisso não chama nenhuma função de envio;
- a caixa fica **antes** das mensagens na tela da conversa.

**Placar do banco reconstruído**: tabelas 70, funções 143, gatilhos 27, policies
171 — todos iguais a produção. CI inteira verde: 276 testes, 0 falhas.

---

## O que eu ainda não fiz

A terceira peça que eu propus: **a bancada de calibração** — uma tela onde você
pega uma conversa real, muda o tom ou o conhecimento base num rascunho, e vê a
resposta **antes e depois, lado a lado**, sem mandar nada para ninguém. É a
próxima.
