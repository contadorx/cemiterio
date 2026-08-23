# Build 7 — o piloto, em produção

> **A lista de pendências deste arquivo pode estar velha.** O inventário
> conferido e atualizado é o `PENDENCIAS.md`.

**Estado:** roteiro pronto. O piloto roda **no banco de produção**, com famílias
reais, decisão da responsável.

---

## 1. O que "piloto em produção" muda

Não há ambiente de ensaio. Isso tem duas consequências que mandam no resto deste
documento:

1. **Todo erro acontece com dado de gente.** Não dá para "testar e limpar
   depois" — a família recebeu a mensagem, ou não recebeu.
2. **O rollback é o processo antigo, não um botão.** Se o piloto falhar, a
   Sureya volta a fazer no caderno. O sistema não é o único registro do mês até
   o piloto fechar em centavos.

Por isso o item 4 (mês em paralelo) não é burocracia: é a rede.

---

## 2. Antes de começar — o que já está pronto

Conferido em produção em 22/08/2026:

| | |
|---|---|
| Migrations 0052→0078 | ✅ aplicadas |
| Um razão só, no grão da família | ✅ `conta_corrente`; `movimentos` congelado |
| Conclusão de lavagem transacional e convergente | ✅ `sureya_concluir_lavagem` |
| Campo não opera serviço de outra pessoa | ✅ `0067`, `0068` |
| Escalada de privilégio fechada | ✅ `0067` |
| Fila com retomada, sem duplicar foto | ✅ `0077` |
| Fechamento que recusa com pendência | ✅ `0075` |
| Remoção a pedido alcançando o Storage | ✅ `0078` |
| Alertas operacionais | ✅ `sureya_alertas` |
| CI: 141 testes + 75 provas em SQL | ✅ verde |

### O que NÃO está pronto, e precisa estar antes de a primeira família entrar

- [x] ~~`npm run contraprova` nunca rodou contra o ambiente real~~ — **rodada em
      22/08/2026, e achou um buraco.** Ver seção 2.1.
- [ ] **Restauração de backup nunca ensaiada** (`RUNBOOKS.md` §4). Backup não
      testado é backup que não existe — e o piloto é em produção. **Bloqueia.**
- [ ] **Storage não tem cópia.** As fotos não têm segunda via.
- [ ] Segredos ainda aceitam query string (`RUNBOOKS.md` §3).
- [ ] Direito de acesso não inclui as fotos (`POLITICA_DADOS.md` §6).

O da restauração é **bloqueio duro** — é o único que sobrou. Os outros três
podem correr em paralelo ao piloto, desde que fechem antes de ampliar.

---

## 2.1 A contraprova rodou, e achou o que devia

Assumindo a sessão de uma pessoa de campo **real** em produção, com o papel
`authenticated`:

```
ok  o papel e lido como campo, e is_admin() o nega
ok  o campo NAO vira admin
ok  o campo nao le o razao da familia
FALHOU: campo apagou cliente          ← aqui
```

(A verificação roda dentro de um bloco que levanta exceção, então a transação
desfaz. Conferido em seguida: 298 clientes, 2 admins, 2 de campo, intactos.)

### O que estava errado

A `0067` escreveu as restritivas assim:

```sql
as restrictive for all
using (true)
with check (not is_campo())
```

Em PostgreSQL, `USING` vale para SELECT, UPDATE e **DELETE**; `WITH CHECK` vale
para INSERT e UPDATE. **DELETE não olha `WITH CHECK`.** A guarda inteira estava
no lugar que o DELETE não consulta.

O `using (true)` estava lá por um bom motivo — o campo **precisa** ler clientes e
jazigos para a rota do dia aparecer. Por isso o conserto não foi mexer nessa
policy: foi acrescentar uma **segunda restritiva, só para DELETE** (`0079`).

Cinco de 43 restritivas estavam nessa forma:

| Tabela | O que o campo conseguia apagar |
|---|---|
| `clientes` | uma família |
| `tumulos` | um jazigo |
| `membros` | **um admin** — e com isso o acesso de quem poderia desfazer |
| `orgs` | **a organização** — e a cascata levaria tudo junto |
| `movimentos` | nada, na prática: a `0074` também revogou o privilégio de tabela |

`movimentos` foi salvo pela **segunda camada** — exatamente o motivo de ela
existir. As outras quatro não tinham segunda camada.

### Depois da 0079, em produção

```
papel campo: PASSOU              nao apaga jazigo: PASSOU
nao vira admin: PASSOU           nao apaga admin: PASSOU
nao le razao: PASSOU             nao apaga org: PASSOU
nao apaga cliente: PASSOU        CONTINUA lendo clientes: PASSOU (298)
                                 CONTINUA lendo jazigos: PASSOU (68)
```

As duas últimas linhas importam tanto quanto as outras sete: fechar o DELETE sem
cegar o SELECT era o ponto.

---

## 3. Etapa 1 — cadastro assistido e dupla conferência

### 3.0 A amostra não existe ainda — medido em 22/08

Rodei a conferência contra as 298 famílias reais. O quadro:

```
famílias                          298
sem nenhuma pendência              48
  destas, CONTRATADAS               1   ← Família Perrela
famílias contratadas no total       3
jazigos cadastrados                 68
```

**O piloto pede 5 famílias contratadas e prontas. Há 1.**

Não é falha do sistema — é o estado do cadastro. As pendências, contadas:

| Pendência | Famílias |
|---|---|
| **jazigo cadastrado** | **246** |
| telefone de quem responde | 5 |
| plano com as datas preenchidas | 2 |
| jazigo com quadra e identificação | 1 |

246 famílias existem como contato, sem jazigo ligado. É aí que está o trabalho.

### 3.0.1 O caminho mais curto para 5

As três contratadas:

| Família | Falta |
|---|---|
| Perrela | **nada** |
| Andre | plano com as datas preenchidas |
| Anninha | plano com as datas preenchidas |

Resolver as datas de Andre e Anninha dá **3**. Para chegar a 5, feche contrato
com 2 das **47** famílias que já têm jazigo ligado e zero pendência — elas estão
a um passo.

> **Família sem contrato não serve para o piloto**, mesmo "sem pendência": ela
> não gera competência, e as limpezas dela entram como avulso — que é outro
> fluxo, e não é o que o piloto está testando.

### 3.1 A tela — `/painel/conferencia`

Metade da conferência é comparar com o caderno, e essa metade é humana. A outra
metade — falta telefone? falta quadra? plano ativo sem data? dois responsáveis?
— o banco responde melhor, e sem cansar na décima família.

A tela existe para que a atenção de quem confere sobre inteira para o **saldo de
abertura**, que é a única linha que nenhuma consulta verifica.

**Amostra: 5 famílias**, da lista ordenada por simplicidade.

Para cada uma, duas pessoas conferem separadamente e comparam:

| Confere | Onde |
|---|---|
| nome e telefone batem com o caderno | ficha |
| a família tem **exatamente um** responsável financeiro | `sureya_familias_sem_responsavel` volta vazia |
| jazigo com quadra, rua e identificação certos | ficha do jazigo |
| valor da limpeza e cadência conferem com o combinado | plano |
| saldo de abertura digitado bate com o que a família deve | extrato |

**O saldo de abertura é o número mais perigoso do piloto.** É digitado à mão, e
é o único que ninguém consegue conferir depois olhando o sistema — só o caderno
sabe. Confira duas vezes, por duas pessoas.

A conferência **nunca marca esse item como ok** — ele volta sempre como
`CONFERIR NO CADERNO`. Um saldo de R$ 240,00 digitado onde deveria ser R$ 420,00
passa por qualquer verificação automática sem reclamar.

> Depois da `0073`, corrigir a abertura **substitui** a anterior em vez de somar,
> e vale por família (não por pessoa). Errar e corrigir é seguro.

---

## 4. Etapa 2 — o piloto de campo

**Uma pessoa de campo. Um bloco. 10 a 20 lavagens. Três dias úteis.**

### Dia 0 — a véspera

1. `/painel/agenda` → gerar a agenda do bloco;
2. conferir que cada serviço tem jazigo, valor e data;
3. **rodar a contraprova de autorização** (bloqueio, seção 2);
4. abrir o app de campo no celular da Nina e fazer **uma lavagem de teste** num
   jazigo da casa — não de família real.

A lavagem de teste tem de produzir, sozinha: foto antes, foto depois, débito no
razão da família, linha na fila, remuneração e baixa de material. Se faltar um,
`sureya_lavagens_incompletas` mostra qual — **não comece o piloto com essa view
devolvendo linha.**

### Dias 1 a 3

Todo fim de dia, nesta ordem:

```
1. select * from sureya_alertas;                    → o que precisa de alguém
2. select * from sureya_lavagens_incompletas;       → lavagem com efeito faltando
3. /painel/fila                                     → liberar as mensagens do dia
4. /painel/fechamento                               → o funil: o que está pendente
```

Uma lavagem com efeito faltando **se repara chamando `sureya_concluir_lavagem`
de novo com o mesmo id** — a função confere cada efeito e cria o que faltar, sem
duplicar. Não é preciso mexer no banco à mão.

### O que anotar todo dia

Um caderno, não um sistema: **o que a Nina teve de fazer duas vezes**, e **o que
a Sureya não entendeu na tela**. Essas duas listas valem mais que qualquer
métrica — são as únicas coisas que ninguém consegue medir depois.

---

## 5. Etapa 3 — o mês em paralelo

O ciclo de cobrança roda **nos dois lugares**: no sistema e no caderno. O caderno
é a verdade; o sistema é o candidato.

No fim do mês:

```sql
select * from sureya_funil('2026-MM-01');
select * from sureya_pendencias_da_competencia('2026-MM-01');
```

O fechamento **recusa** enquanto houver pendência, e diz qual. Resolva cada uma
pela tela que a própria pendência indica.

### O critério, em uma linha

**O sistema e o caderno têm de bater em centavos.** Não "aproximadamente", não
"fora um arredondamento". Se divergir um real, a diferença tem nome e endereço —
ache antes de fechar.

Depois de bater, feche pela tela. O fechamento guarda o retrato: quantas
famílias, quanto cobrado, quanto em aberto. É esse retrato que a próxima
conferência usa.

---

## 6. Etapa 4 — o teste que ninguém quer fazer

Antes de ampliar, **exercite a remoção a pedido** com uma família de teste
criada para isso:

1. crie a família, suba uma foto, lance um pagamento;
2. peça a remoção pela ficha;
3. confira que as fotos **não abrem mais** pela URL que você guardou antes;
4. confira que `telefones_cliente` não tem mais a linha;
5. confira que o extrato financeiro **continua lá** — é obrigação contábil.

Se o passo 3 falhar, a remoção não funciona, e isso precisa ser descoberto agora
e não quando uma família real pedir.

---

## 7. Go / no-go

Amplia se, e só se:

| | |
|---|---|
| `sureya_lavagens_incompletas` | vazia por três dias seguidos |
| `sureya_alertas` de gravidade alta | zero no fim de cada dia |
| sistema × caderno | bate em centavos |
| fechamento | fechou sem `forcar` |
| remoção a pedido | ensaiada e funcionando (seção 6) |
| a Sureya | explica cada número da tela **sem ajuda técnica** |

O último é o mais importante e o mais fácil de pular. Se ela precisa perguntar o
que é um número, o número está errado — mesmo que a conta esteja certa.

---

## 8. Ampliação

**Por bloco, nunca a carteira toda.** Depois de cada bloco, uma volta na seção 7.

Os disparos automáticos continuam **desligados**. Ligar é uma capacidade por
vez, com a chave de desligamento à mão:

1. aviso de saldo baixo;
2. lembrete de cobrança;
3. agradecimento pós-serviço.

Cada uma roda uma semana antes de a próxima ligar. Robô conversando com pessoa
idosa quebra exatamente o que faz o cliente ficar — e a decisão D-02 (o botão de
cadastrar jazigo fica no campo) veio da mesma raiz: o produto é a relação, não a
automação.

---

## 9. A importação da carteira — achado às vésperas

A responsável foi ao cemitério recolher os cadastros. Fui olhar o caminho por
onde eles entram, e ele estava quebrado para o modelo de família.

### 9.1 O jazigo importado nascia sem família

`api/tumulos/importar` cria o jazigo assim:

```ts
insert into tumulos (org_id, quadra_id, cliente_id, identificacao, ...)
```

Sem `familia_id`. E **nenhum gatilho preenchia** — conferido em produção: os
únicos gatilhos de `tumulos` eram o do cemitério e o de `updated_at`.

O cliente ganha família sozinho desde a 0049. O jazigo não. E desde o Build 4 o
sistema inteiro é no grão da família.

**Reproduzido em banco limpo**, importando um jazigo pelo caminho exato da rota
e mandando concluir a lavagem:

```
a conclusao FALHOU: null value in column "familia_id" of relation
                    "conta_corrente" violates not-null constraint
razao da familia:   0 linha(s), R$ 0
servico executado:  0
```

**A lavagem não acontece.** Não é "a cobrança falha e o resto segue": a transação
inteira desfaz. A Nina toca em concluir, recebe um erro que não diz nada para
ela, e não fica registro de nada — nem a foto.

Hoje não mordia porque os 57 jazigos com dono vieram pela tela, que preenche os
dois campos. **A importação da carteira inteira entraria toda pelo caminho
quebrado.**

`0081` põe a herança no banco, não na rota: são três portas que criam jazigo
(importar, vincular-lote, cadastro do campo) e nada impede a quarta. A regra é
do dado — *jazigo com dono pertence à família do dono*.

Depois dela, em produção: 0 jazigos com dono e sem família, 0 discordando do
dono, os 68 intactos.

### 9.2 O import não tinha prévia

Você colava o CSV e ele **escrevia**. Para 250 cadastros recolhidos à mão, um
cabeçalho trocado cria 250 registros errados em produção — e desfazer isso é
pior que refazer a coleta.

Agora aceita `previa: true`: percorre as mesmas linhas, faz as mesmas consultas
de reconhecimento e devolve **o que faria**, sem escrever nada. Uma linha por
linha do arquivo, com uma de quatro ações:

| Ação | Quando |
|---|---|
| `criar` | jazigo novo (e diz se a família também é nova) |
| `ligar` | o jazigo já existe **sem dono** e passaria a ser desta família |
| `nada a fazer` | o jazigo já é desta família |
| `RECUSA` | e o motivo — jazigo de outra família, valor ilegível, duplicata |

Mais o resumo: quantas criar, quantas ligar, quantas recusadas, quantas famílias
novas, quantos planos.

**Confira o resumo antes de rodar de verdade.** Se "criar" vier 250 e você
esperava 40, o cabeçalho está trocado.

### 9.3 O parser de dinheiro ganhou teste

`numeroPlanilha` decide quanto cada família paga. O código antigo fazia
`Number(col) || 40` — célula vazia, `R$ 60` e `60,00` viravam **todos R$ 40**,
calados, e viravam honorário real na primeira cobrança.

Ele já estava correto, mas sem teste. Agora tem 11, incluindo os que **recusam**:

```
ok  1.500,00 e mil e quinhentos      ok  celula vazia e recusada
ok  1,500.00 tambem                  ok  1.500 (ambiguo) e recusado
ok  R$ 60,00 vira 60                 ok  nada vira 40 por conveniencia
```

Recusar é devolver NaN e deixar a linha dita, nunca um número de conveniência:
valor chutado vira dinheiro cobrado de uma família.

Saiu da rota para `src/lib/planilha.ts` — rota do Next só pode exportar handler,
e o `tsc` pegou isso.

### 9.4 O formato do CSV

```
quadra;identificacao;falecido;cliente_nome;telefone;cadencia;qtd;valor
Q1;Q1-R5-007;Maria Aparecida;João Silva;11988887777;mensal;1;60,00
```

- **obrigatórias:** `identificacao`, `cliente_nome`, `telefone`
- `quadra` vazia cai em `S/Q` — e jazigo em `S/Q` foi como o mesmo jazigo virou
  dois registros antes. Preencha;
- `cadencia` sem `valor` **não cria plano**, e a linha é dita;
- `;` ou `,` como separador, cabeçalho obrigatório, máximo 500 linhas por vez.
