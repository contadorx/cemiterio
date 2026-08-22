# Gestão do roteiro, idade de lavagem e avulsos — avaliação

Pedido: *"uma ficha com a roteirização e gestão completa, com idade de lavagem e
inteligência para indicar o melhor roteiro. Alocação de avulsos também."*

Escrito em 22/08/2026, a partir do que o banco tem hoje.

---

## 1. O que eu medi antes de opinar

| | |
|---|---|
| Túmulos cadastrados | **124** (eram 68 de manhã — o cadastro está andando) |
| Contratados | **3** |
| **Nunca lavados** | **123** |
| Serviços executados no histórico inteiro | **2** |
| Ruas | 41, sendo **16 compartilhadas** entre quadras |
| Túmulos com posição dentro da rua | 54 de 124 |

---

## 2. A pergunta da "inteligência", respondida com franqueza

**Não dá para aprender o melhor roteiro com dois serviços executados.**

Qualquer coisa que se chamasse de inteligência aqui estaria ajustando ruído: com
duas lavagens não há como saber quanto tempo leva uma limpeza, quanto se anda
entre dois túmulos, nem em que ordem o dia rende mais.

E o mais importante: **você não precisa disso para ter um bom roteiro.** O que
resolve o problema agora é uma **política explícita** — regras que você lê,
entende e discorda se quiser. Uma política tem três vantagens sobre um modelo,
nesta operação:

- a Sureya consegue **explicar para a família** por que o túmulo dela é o
  próximo, e isso é metade do produto;
- quando erra, dá para **apontar a regra errada** e mudar. Modelo errado só dá
  para retreinar;
- funciona no **primeiro dia**, sem histórico.

Daqui a um ano, com mil lavagens registradas, dá para medir o tempo real por
túmulo e por rua e afinar os números da política. Aí sim há o que aprender — e
serão os mesmos campos, calibrados. Nada do que proponho abaixo é jogado fora.

---

## 3. O número que deve reger tudo: **urgência**, não idade

Idade de lavagem sozinha engana. Um túmulo mensal com 40 dias está atrasado; um
anual com 300 dias está em dia. Comparar os dois pela idade põe o errado na
frente.

O número que ordena bem é a razão:

```
urgencia = idade_em_dias / intervalo_contratado_em_dias
```

| urgência | leitura |
|---|---|
| `< 0,8` | em dia — não precisa entrar no roteiro |
| `0,8 a 1,0` | está chegando a hora |
| `1,0` | venceu hoje |
| `> 1,0` | **atrasado**, e o quanto passa de 1 é o quanto está atrasado |
| `> 2,0` | passou do dobro do combinado — isto vira reclamação |

A vantagem prática: **é um número só, comparável entre contratos diferentes.**
Ordenar a carteira inteira por ele responde "o que fazer primeiro" sem discussão.

O sistema já tem `sureya_intervalo_dias` (migration 0057), que traduz
`semanal/quinzenal/mensal/...` em dias. A conta encaixa no que existe.

---

## 4. A decisão que só você pode tomar

**De quando conta a idade de um túmulo que nunca foi lavado?** São 123 de 124.

| Opção | O que significa | Efeito |
|---|---|---|
| **(a) do início do contrato** | o relógio começa quando a família contratou | o mais justo com a família — ela paga desde aquele dia |
| **(b) do cadastro no sistema** | o relógio começa quando o túmulo entrou aqui | fácil, mas pune quem foi cadastrado primeiro |
| **(c) de uma data que a família informa** | "a última limpeza foi em março" | o mais verdadeiro, e o mais caro de coletar |

**Minha recomendação: (a), com (c) como exceção.** O contrato é o que define a
obrigação, e a data dele já está no cadastro. Quando a família disser uma data
melhor, ela entra num campo e passa a valer.

Sem essa decisão, os 123 entram todos com a mesma urgência e o roteiro do
primeiro mês vira ordem alfabética disfarçada.

> Isto precisa de um campo novo: `tumulos.ultima_lavagem_informada`. Hoje não
> existe.

---

## 5. Como montar o dia — a política em quatro passos

**1. Quem é candidato.** Túmulo contratado com `urgencia >= 0,8`. Avulso pedido
entra sempre (§6).

**2. Quanto cabe.** A capacidade já é calculada (`lib/capacidade.ts`): limpezas
por dia × dias de trabalho. O dia enche até esse número, não além.

**3. Quem entra, entre os candidatos.** Por urgência decrescente — **mas com um
desempate por proximidade**. Se o 12º e o 30º da fila estão na mesma rua, e o 12º
entra, o 30º entra junto. Andar até a rua é o caro; o segundo túmulo dela é
barato.

Isto é a única "inteligência" que vale a pena hoje, e é uma regra de três linhas:
**preencher o dia com vizinhos do que já entrou, enquanto couber.**

**4. Em que ordem andar.** Isto já existe e é bom: quadra → rua → posição na rua,
com serpentina (ruas alternadas ao contrário, para uma emendar na outra). As 16
ruas compartilhadas entre quadras já são tratadas como uma parada só.

O que sabota este passo hoje: **70 de 124 túmulos não têm posição dentro da rua**.
Sem ela o túmulo vai para o fim da própria rua em ordem arbitrária — é o que
faz a caminhada dar voltas dentro de uma rua que deveria ser uma linha reta.

---

## 6. Avulsos: alocar por **proximidade**, não por data

É aqui que está o ganho maior, e é contraintuitivo.

Um avulso tem uma data desejada, e o instinto é encaixá-lo nessa data. Mas o
custo de um avulso não é a limpeza — é **a viagem até a rua dele**. Se a Nina já
vai estar na Quadra 2 Rua 5 na quinta, o avulso daquela rua custa dez minutos.
Na terça, custa uma manhã.

**A regra: entre os dias possíveis dentro do prazo do avulso, escolha aquele cujo
roteiro já passa mais perto.** "Mais perto" em três níveis:

```
1. mesma rua       → praticamente de graça
2. mesma quadra    → barato
3. mesmo cemitério → o normal
```

Quando o avulso não couber em nenhum dia sem estourar a capacidade, o sistema
deve **dizer isso** e oferecer as duas saídas: adiar um contratado de baixa
urgência, ou pôr o avulso fora da rota (e mostrar quanto custa).

Hoje o avulso "só entra se pedirem explicitamente" (`lib/agenda.ts`) — ou seja, é
manual e sem nenhuma noção de proximidade.

---

## 7. A ficha do jazigo — que não existe

Você pediu "uma ficha com isso". **Hoje não há tela de um jazigo**;
`/painel/jazigos` é uma lista. Tudo o que está acima precisa aterrissar em algum
lugar, e o lugar é essa ficha:

| Bloco | O que mostra |
|---|---|
| **Identidade** | quadra, rua, posição na rua, identificação, falecido, foto |
| **Situação** | contratado ou não, periodicidade, valor |
| **Idade e urgência** | última lavagem, dias desde então, urgência, próxima prevista |
| **Onde entra no roteiro** | em que dia está agendado e em que posição |
| **Histórico** | cada lavagem com data, quem fez, antes/depois |
| **Dinheiro** | o que este jazigo gerou para a família |
| **Pendências** | sem posição na rua, sem foto, sem GPS, sem valor |

O bloco de pendências é o que transforma a ficha em ferramenta: é onde os
"70 sem posição na rua" viram uma lista que alguém resolve.

---

## 8. O que eu construiria, em ordem

| # | O quê | Por quê primeiro |
|---|---|---|
| 1 | `tumulos.ultima_lavagem_informada` + a decisão do §4 | sem isso, urgência não existe para 123 túmulos |
| 2 | View `sureya_urgencia_jazigos` — idade, urgência, próxima | é o insumo de tudo o mais |
| 3 | **Ficha do jazigo** | onde tudo aterrissa, e onde as pendências viram trabalho |
| 4 | Ordenar a rua inteira de uma vez | resolve os 70 sem posição, que é o que faz a rota dar voltas |
| 5 | Preenchimento do dia com vizinhos (§5.3) | ganho real de caminhada, três linhas |
| 6 | Alocação de avulso por proximidade (§6) | o maior ganho, mas depende de 4 e 5 estarem bons |

### 8.1 O item 0, que não estava na lista — e era o mais barato

Ao conferir se a "Principal" existia em todas as quadras, apareceu uma coisa
que não estava neste documento: **doze ruas atravessavam duas quadras cada e
não tinham `chave_fisica`** — Ruas 1 a 6 (Quadra 1 + 2) e Ruas 8 a 13
(Quadra 3 + 4). São 78 dos 127 túmulos cadastrados.

Sem chave, `ordenarPorEndereco` trata cada metade como uma parada diferente: a
Nina desce a Rua 3 do lado da Quadra 1, vai embora para outra quadra, e volta
na Rua 3 do lado da Quadra 2 mais tarde. É o mesmo vaivém que a 0051 tinha
corrigido para a Rua 7 e as Transversais — estas doze ficaram de fora porque em
agosto ainda não estavam cadastradas.

A 0084 costurou as doze e criou a Principal nas quatro quadras (existia só na
Quadra 1, e quem cadastrasse um jazigo na Principal do lado da Quadra 3 não
achava a rua na lista).

**Efeito no roteiro de hoje: nenhum** — Quadra 2 e Quadra 4 estão com zero
túmulos, todo o cadastro está na 1 e na 3. A costura passa a valer sozinha
conforme os jazigos do outro lado entrarem. É o item mais barato da lista e o
único que não precisou de tela nenhuma.

Fica em aberto uma consequência, anotada em `PENDENCIAS.md` (n): `ordem_na_rua`
continua sendo contada por metade, então quando as Quadras 2 e 4 forem
cadastradas as duas metades vão numerar do começo e o roteiro vai intercalá-las.
Resolver isso exige decidir uma regra por tipo de chave — rua cortada pela
Principal (metades em sequência) versus rua de divisa (metades lado a lado).

---

**Os itens 1 a 3 eu faço agora.** O 4 é uma tela pequena. O 5 e o 6 mexem no
gerador da agenda e merecem entrar depois de o piloto mostrar quanto tempo uma
limpeza leva de verdade — porque é esse número que decide quanto cabe num dia, e
hoje ele é uma estimativa.

---

## 9. O que eu **não** recomendo

| | Por quê |
|---|---|
| Roteiro por GPS / caixeiro-viajante | o cemitério é uma grade, não uma cidade. Quadra→rua→posição já é a resposta ótima, e é explicável |
| Modelo que aprende a ordem | 2 lavagens de histórico. Voltamos a isso com mil |
| Ordenar a carteira por idade pura | põe o anual de 300 dias na frente do mensal de 40 |
| Encaixar avulso na data pedida | é o que faz atravessar o cemitério por um túmulo |
