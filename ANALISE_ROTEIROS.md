# A inteligência de roteiros — como é hoje e o que a deixaria melhor

Medido em produção em 24/08/2026, antes de qualquer opinião.

---

## 1. Como funciona hoje

São **duas etapas separadas**, e essa separação é acertada — vale entender qual
faz o quê antes de mexer.

### Etapa 1 · `gerarServicosDevidos` — *o que* é devido

Para cada túmulo contratado com valor, caminha a periodicidade a partir de
`periodo_inicio` e cria uma lavagem `pendente` para cada data devida dentro do
horizonte. Grava `data_plano` — **a data teórica, congelada no nascimento**.

Não escolhe dia nenhum. Só diz "isto é devido em tal data".

### Etapa 2 · `alocarAgenda` — *quando* e *em que ordem*

Três camadas, nesta ordem:

**a) Separa por cemitério.** Cada cemitério vira um pote próprio, para um dia
nunca atravessar a cidade. Se só há um cemitério configurado, é um pote só.

**b) Escolhe o dia.** Duas passadas:
- primeiro quem tem data pedida (`data_desejada`) — e se o dia está cheio, ela
  anda **para trás**, nunca para frente;
- depois o resto, a partir de `devidoEm` = `data_plano`, andando para frente
  até achar dia com vaga.

A vaga de um dia é `Σ (limpezas_por_dia de cada pessoa do campo)` menos o que já
está preso ali. **Uma lavagem por jazigo por dia**, sempre.

Adiantar semanas não é otimizar: é lavar e cobrar fora do combinado. Por isso a
regra é assimétrica — **atrasa quando o dia está cheio, nunca adianta**.

**c) Ordena o dia** (`ordenarPorEndereco`):
1. agrupa por **rua** (rua com `chave_fisica` funde os dois lados que pertencem
   a quadras diferentes — a Rua 7 é uma caminhada só);
2. ordena as ruas por `quadra.ordem`, depois `rua.ordem`;
3. dentro da rua, por `ordem_na_rua`;
4. **serpentina** — rua ímpar é percorrida ao contrário, para ela não terminar
   no fundo e voltar andando à toa;
5. túmulo sem rua fecha o dia, em ordem alfabética — aviso visível de cadastro
   incompleto, não item perdido.

> **A "inteligência" é uma sequência de caminhada declarada no cadastro, não um
> cálculo.** E para cemitério isso é a escolha certa: as ruas não mudam de
> lugar, e a ordem que a Nina já usa vale mais que qualquer heurística. O
> problema não é o método — é que o cadastro que o alimenta está pela metade.

---

## 2. Recalcula? **Não. E é exatamente aí que dói.**

`alocarAgenda` só enxerga o que está **`pendente` e não fixado**. No instante em
que aloca, a lavagem vira `agendado` — e some do radar do alocador para sempre.

| o que você faz | recalcula? | o que acontece de verdade |
|---|---|---|
| cadastra um contrato novo | **não** | as lavagens novas são encaixadas nas frestas dos dias com vaga; as já agendadas não se mexem |
| exclui um túmulo ou contrato | **não** | o buraco fica aberto no dia; as outras não se juntam |
| remarca à mão | **não — de propósito** | `fixado_em` protege a decisão de gente do alocador da madrugada |
| muda quadra, rua ou ordem de um túmulo | **não** | `ordem_dia` já está gravada; a rota velha continua valendo |
| aperta **Reorganizar** | **em parte** | só devolve para a fila o que está *fora do lugar*: dia não-útil, atrasada, ou repetida no mesmo jazigo. O que está "no lugar mas mal roteirizado" **não volta** |

E mais uma, que muda a sua rotina de hoje: **salvar um contrato não gera nada.**
A geração só acontece (a) no cron das 9h e (b) quando você aperta **Gerar** na
agenda. Enquanto você cadastra, nada se move sozinho.

---

## 3. O que eu medi

**Cadastro**
| | |
|---|---|
| túmulos | 266 (79 contratados) |
| sem quadra | 0 |
| sem rua | 0 |
| **sem `ordem_na_rua`** | **201 — 75%** |
| sem GPS | 3 |
| ruas / quadras / cemitérios | 44 / 4 / 2 |

**Capacidade e carga**
| | |
|---|---|
| capacidade | 20 por pessoa × 2 do campo = 40/dia |
| dias de trabalho | segunda a sexta |
| lavagens devidas **no passado** | **79** (a mais antiga de 01/08) |
| devidas hoje / no futuro | 3 / 175 |

**Os roteiros de verdade**
| dia | paradas | quadras | ruas | trocas de rua | mínimo possível | sem ordem na rua |
|---|---|---|---|---|---|---|
| 24/08 | 40 | 1 | 10 | **12** | 9 | 37 de 40 |
| 25/08 | 40 | 4 | 18 | **20** | 17 | 35 de 40 |

Leitura: a ordenação **por rua está funcionando** — 12 trocas para 10 ruas é
quase o ótimo, sobram 3 idas e voltas. O que não funciona é **dentro da rua**:
com 37 de 40 sem `ordem_na_rua`, a Nina percorre cada rua em ordem arbitrária.

E os 40/40/2/1 dos próximos dias **não são defeito**: são os 79 atrasados
empilhando nos dois primeiros dias com vaga. O alocador está certo — atraso é
devido hoje, não ontem.

---

## 4. O que eu faria, em ordem de retorno

### 1º · `ordem_na_rua` — o maior ganho, e quase não é código

75% dos túmulos não têm. É o dado que decide a última perna do roteiro, e sem
ele a serpentina ordena ruas para depois embaralhar dentro de cada uma.

**Duas formas, e eu faria as duas:**

- **A rota aprende com a caminhada.** Na primeira passada a Nina lava na ordem
  que quiser, e o sistema grava a sequência real como `ordem_na_rua`. Custo
  zero de digitação, e o número que entra é o do chão, não o do mapa.
- **Uma tela de ordenar a rua**, para corrigir e para as ruas que ainda não
  foram andadas: lista os túmulos, ela numera ou arrasta.

### 2º · "Refazer o roteiro" de verdade

Um botão que devolve para `pendente` tudo que está `agendado`, **não fixado, sem
foto e não iniciado**, de amanhã em diante — e roda o alocador. É o que falta
hoje: você cadastra vinte contratos e não tem como pedir "agora repensa tudo".

**Nunca mexe em hoje**: se a Nina já abriu a lista no celular, a rota não pode
mudar debaixo dela.

### 3º · O corte do dia não pode partir uma rua ao meio

Hoje o dia enche até o teto e o resto vai para o dia seguinte — e o corte cai
onde calhar. Se a parada seguinte é da mesma rua da última, ou ela entra (com um
pouco de estouro), ou o corte recua para o começo da rua. **Rua partida em dois
dias é a mesma caminhada feita duas vezes.**

### 4º · Família com vários jazigos, no mesmo dia

Oito famílias têm mais de um jazigo contratado (YONE e LINEU têm três). Hoje
eles caem onde a data do plano mandar. Estar no mesmo dia economiza caminhada e
rende **uma foto só** para a família.

### 5º · Nivelar o atraso em vez de empilhar

40/40/2/1 cumpre a regra, mas entrega dois dias no teto e dois vazios. Espalhar
os 79 atrasados pelos dias com folga dá rotas menores e mais fôlego para
imprevisto.

### 6º · O GPS como auditor, não como roteirizador

263 dos 266 têm lat/lng. Não vale trocar a ordem declarada por uma calculada — a
declarada é melhor. Vale um relatório: *"estas 5 paradas seguidas dão 400 m de
ida e volta"*, que aponta **erro de cadastro**, não erro de rota.

---

## 5. O que eu NÃO faria

**Roteirizador por distância (TSP/GPS).** Cemitério não é cidade: as ruas são
corredores, a ordem é estável e a Nina já sabe o caminho. Um otimizador por
distância mudaria a rota a cada rodada, exigiria confiança em GPS de precisão
duvidosa entre lápides, e trocaria uma sequência que a pessoa entende por uma
que ela teria de conferir. **O ganho está no cadastro, não no algoritmo.**
