# Avulso é o que alguém pediu

Sua frase, que virou a regra: *"avulso tem o estado do túmulo, mas o serviço
somente o solicitado"*.

São duas perguntas, e o sistema respondia as duas com o mesmo campo. Por isso
errava as duas.

| | pergunta | onde mora |
|---|---|---|
| **Túmulo** | tem contrato, ou é avulso? | `tumulos.contratado` + `valor_mensal` — já existia |
| **Serviço** | nasceu do contrato, ou alguém pediu? | `servicos.origem` — **novo** |

---

## O que mudou na sua tela

**Avulsos** listava 257 lavagens de contrato agendadas. Agora lista **0** — e
zero aqui é a resposta certa: ninguém pediu nada ainda. A tela diz isso com
todas as letras, para você não achar que ela quebrou.

**Início** punha o selo `avulso` em 293 famílias. Agora:

```
122  sem jazigo   ← cadastro pela metade, não regime de cobrança
172  avulso       ← têm jazigo, nenhum contratado. Estas são de verdade.
 69  contrato
```

**Financeiro** contava toda lavagem de contrato executada como "avulsa" no
número do mês. Agora conta só as pedidas.

**Remuneração** usava a mesma conta errada — e isso decide **pagamento**. As
regras têm `só avulso` e podem ter valor diferente por avulso. Não custou nada
até hoje só porque `remuneracao_regras` está vazia; no dia em que você
cadastrar a regra da Nina, custaria.

---

## As três respostas, e por que a terceira existe

`contrato` · `pedido` · `nao_definido`

Das 5 lavagens que restaram em produção, **4 não têm como saber**. Elas têm
`data_desejada` — mas isso não é prova de pedido: o "registrar limpeza já
feita" preenche esse campo mecanicamente, com a data que a pessoa digitou. Duas
delas vieram por ali, sem valor.

Marcar as 4 como `pedido` seria inventar quatro fatos. Como `contrato`,
também. Então elas dizem `nao_definido`, e **não contam como avulsas** em lugar
nenhum. Vazio não é zero — a mesma regra da margem (0120), da natureza (0122) e
do fecha (0124), e o mesmo desenho que `familias.regime` já usava.

Depois do backfill, em produção: **1 contrato, 4 não definido, 0 pedido.**

## Quem escreve o quê, daqui em diante

| porta | grava | por quê |
|---|---|---|
| gerador de contrato (`gerarServicosDevidos`) | `contrato` | está escrito por extenso, não deixado no default |
| 🧽 Nova limpeza avulsa (`/api/servico`) | `pedido` | essa tela só abre quando alguém pede |
| pedido da conversa (`/api/pedidos-conversa`) | `pedido` | é o caso mais literal |
| registrar limpeza já feita | **o estado do jazigo** | ninguém pediu nada: alguém está lançando o que já aconteceu. Jazigo com contrato → contrato; sem → pedido |

Essa última linha é a sua frase inteira funcionando: o estado do túmulo decide
quando não houve pedido.

---

## Por que isso não volta a quebrar

O defeito original não deu erro nenhum. `avulso = plano_id is null` esteve
**certo por 25 migrations**, e continuou parecendo certo depois de parar de
ser: na 0100 o contrato mudou de casa, o gerador passou a escrever `plano_id:
null` de propósito, e a conta simplesmente passou a responder "sim" para tudo.
Nada quebrou. Ninguém procurou.

Então as guardas não checam se a coluna nova está sendo usada — checam se a
conta velha **voltou**:

- `testes/origem_do_servico.sql` — 12 verificações no banco, entre elas *"lavagem
  de contrato sem plano_id NÃO é pedido"*, que é o defeito inteiro numa linha.
- 11 guardas estáticas em `checar-ficha.mjs`, uma por leitor, cada uma exigindo
  a regra nova **e** proibindo a antiga no mesmo arquivo.

`npm run ci` verde: 217 testes, 117 migrations, placar igual à produção.

---

## Duas coisas que apareceram no caminho

**O arquivo mudou de forma.** `servicos_arquivados` (0127) nasceu de um `like
servicos` — cópia da forma naquele dia, não vínculo vivo. A coluna `origem`
entrou no fim de `servicos`, mas no arquivo entrou **depois** de `arquivado_em`
e `motivo`. As duas ordens deixaram de bater: arquivar com `select s.*, now(),
'…'` posicional gravaria `origem` dentro de `arquivado_em`. Quem descobriu foi o
teste, não eu — e agora a migração avisa e o teste guarda a porta. A receita de
restaurar do LEIA-ME da 0127 continua valendo (ela vai no sentido contrário).

**Família Zaratini.** Marcada como `contratado` e `regime = contrato`, com
**zero jazigos**. Não é defeito do código — é cadastro: contrato sem jazigo não
gera lavagem nem competência. Com a regra nova ela aparece como "sem jazigo",
que é a verdade. Vale uma olhada quando você passar por ela.

---

# Na agenda também

*"agenda também, somente os avulso solicitados"*

A agenda continua misturando as duas — é uma rota só, e a Nina lava contrato e
pedido do mesmo jeito. O que não podia é as duas serem **a mesma linha na
tela**: adiar uma lavagem de contrato encurta o intervalo até a próxima; adiar
um pedido é furar uma data que alguém combinou com a família. Decisões
diferentes precisam de linhas diferentes.

- cada linha pedida ganha o selo **🙋 pedido**, com a data pedida no tooltip;
- e há o recorte **só pedidos**, ao lado de "atrasadas" e "sem pessoa".

## A caixa que fabricava avulso saiu

Havia na agenda um **"Incluir os avulsos neste mês (Finados, Dia das Mães…)"**
que criava, de uma vez, uma lavagem para todo mundo — e chamava isso de avulso.

Era a **única máquina do sistema que produzia avulso sem ninguém pedir**, o
oposto exato da regra. E usava uma *quarta* definição de avulso: plano com
cadência não recorrente. Com um único plano vivo, e mensal, ela não fazia nada
havia meses — falhava em silêncio, que é como esse tipo de coisa se esconde.

O Finados continua atendido, e melhor: **cada família que pede ganha o seu
pedido**, com a data dela e o preço dela.

## O que eu NÃO mexi, e você precisa saber

O botão **"Gerar o mês"** ainda lê a tabela `planos` — o mundo de antes da
0100. Medido:

```
1 plano vivo · jazigo Perrela · cadência mensal · R$ 15,00
o MESMO jazigo tem contrato no túmulo: quinzenal, R$ 60,00/mês
```

São **dois geradores sobre o mesmo jazigo**. Apertar "Gerar o mês" hoje cria
uma lavagem mensal de R$ 15,00 por cima das quinzenais do contrato — que, pela
0104, nascem sem valor nenhum, porque o dinheiro vem da competência.

Não é o rótulo do avulso, então não entrou nesta fatia. Mas é o mesmo defeito
de forma: dois caminhos para o mesmo ato, que começam iguais e terminam
discordando. Aposentar `planos` é uma fatia curta — me diga e eu faço.
