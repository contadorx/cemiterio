# Precificação — o que dá para afirmar, medido em 29/08/2026

**Sem migration. Nenhum dado tocado.**

---

## Primeiro: o que o sistema sabe e o que ele não sabe

Isso decide o que é conta e o que seria chute meu.

### Sabe, com precisão

| | |
|---|---|
| Túmulos contratados | **82** (de 266 cadastrados) |
| Periodicidade de cada um | **82 de 82** |
| Valor mensal de cada um | **82 de 82** |
| Capacidade da equipe | 20 lavagens/dia × 5 dias = **435/mês** |
| Pagamento da ajudante | **R$ 1.840,00/mês** (cadastrado em `orgs`) |
| Custo da IA | **R$ 5,87** em 42 dias, 62 chamadas |
| Preço e custo dos 7 extras | todos preenchidos |

### Não sabe — e as tabelas estão literalmente vazias

| Tabela | Linhas |
|---|---|
| `materiais` | **0** |
| `compras_material` | **0** |
| `remuneracao_regras` | **0** |
| `acertos_equipe` | **0** |
| `conta_equipe` | **0** |

E dos 25 serviços cadastrados, **6 executados**, com `custo_estimado` = R$ 0,00 e **zero** pagamento de equipe lançado. A única duração registrada é de **1 minuto** — um teste, não uma lavagem.

**Então: não dá para "estimar custos" a partir do sistema.** Material, transporte, água, produto — nada disso existe em lugar nenhum. Eu poderia inventar um número plausível, mas ele viraria decisão de preço, e um chute meu não pode virar o que a Sureya cobra de uma família.

O que dá para fazer, e é muito, está abaixo.

---

## A receita, medida

**R$ 3.150,00 por mês** em 82 contratos, que consomem **182 lavagens por mês**.

Média: **R$ 17,30 por lavagem.**

| Periodicidade | Túmulos | Receita/mês | Lavagens/mês | **Por lavagem** |
|---|---:|---:|---:|---:|
| Quinzenal | 70 | R$ 2.510 | 140,0 | **R$ 17,93** |
| Semanal | 9 | R$ 535 | 39,1 | **R$ 13,68** |
| Mensal | 3 | R$ 105 | 3,0 | **R$ 35,00** |
| **Total** | **82** | **R$ 3.150** | **182,1** | **R$ 17,30** |

---

## O achado: a mesma lavagem custa de R$ 5,75 a R$ 60,00

**Dez vezes de diferença**, e quase toda ela é explicada por uma coisa só:

> **O preço é por mês. O trabalho é por lavagem.**

Quem lava toda semana consome **4,3 lavagens por mês**. Quem lava a cada quinze dias consome **2**. E os dois pagam mensalidades parecidas.

Por isso a periodicidade **semanal é a mais barata por lavagem** (R$ 13,68) e a **mensal é a mais cara** (R$ 35,00) — exatamente o inverso do que faria sentido.

Os oito casos mais extremos:

| Família | Periodicidade | Por mês | **Por lavagem** |
|---|---|---:|---:|
| Alcantara | semanal | R$ 25,00 | **R$ 5,75** |
| Bruniera | semanal | R$ 30,00 | **R$ 6,90** |
| Família Delia | semanal | R$ 40,00 | **R$ 9,21** |
| Família Manoel | quinzenal | R$ 20,00 | R$ 10,00 |
| Família Magda | quinzenal | R$ 20,00 | R$ 10,00 |
| Família Lineu (2 jazigos) | quinzenal | R$ 20,00 | R$ 10,00 |
| Família Bella | semanal | R$ 50,00 | R$ 11,51 |

A referência da casa (`valor_referencia_limpeza`) é **R$ 40,00** por lavagem. A média praticada é **R$ 17,30** — **43% da referência**.

---

## Os dois custos, e por que os dois

"Quanto custa uma lavagem?" tem **duas respostas certas**, e trocar uma pela outra custa dinheiro nos dois sentidos.

### Custo cheio — R$ 10,10 por lavagem

R$ 1.840 da ajudante ÷ 182 lavagens/mês.

Responde: **"este contrato paga o próprio custo?"**

Por esse critério, **7 contratos estão abaixo do custo** e somam **−R$ 37/mês**. Outros 14 estão apertados.

### Custo de mais uma — perto de zero hoje

A agenda está em **41,9% de uso**. Cabem mais **253 lavagens por mês** sem contratar ninguém.

Responde: **"vale pegar mais um jazigo?"** Enquanto houver folga, a ajudante já está paga e já está no cemitério — a lavagem a mais custa material, não salário.

### Trocar os dois erra assim

- **Usar o cheio como marginal** → você recusa um cliente a R$ 12/lavagem que *adicionaria* dinheiro, porque a agenda está com folga.
- **Usar o marginal como cheio** → você acha que tudo dá lucro, nunca sobe o piso, e no dia em que a agenda encher a conta não fecha.

A tela mostra **os dois, sempre, com nome**. Nenhum deles se chama "o custo".

---

## O resultado, com a ressalva que importa

| | |
|---|---|
| Receita | R$ 3.150,00 |
| Ajudante | −R$ 1.840,00 |
| **Sobra** | **R$ 1.310,00** |

**Este R$ 1.310 é o TETO do que pode sobrar, não o que sobra.** Faltam material, transporte, sistema e impostos — todos entrando como zero porque não existem no sistema, e nenhum deles é zero na vida real.

**Ponto de equilíbrio:** 107 lavagens/mês pagam a ajudante, ao preço médio de hoje. Você faz 182 — 70% acima.

Uma referência para calibrar: se material + transporte custarem **R$ 4,00 por lavagem**, isso são R$ 728/mês, e a sobra cai para **R$ 582**. Se custarem R$ 7,00, cai para **R$ 35**. **Esses três números decidem se o negócio dá dinheiro ou não** — e são exatamente os três que ninguém nunca digitou.

---

## O outro lado: 184 túmulos cadastrados e não contratados

Dos 266 túmulos, **82 são contratados (31%)**. Os outros **184** estão cadastrados e não pagam nada.

Com 253 lavagens/mês de folga na agenda, cabem **mais 126 contratos quinzenais** sem contratar ninguém. A R$ 17,30/lavagem isso seria **+R$ 4.360/mês** — e o custo marginal é material, não salário.

**Vender é mais rentável que reajustar**, e por uma margem larga: reajustar os 7 contratos abaixo do custo até R$ 17,30/lavagem rende cerca de **R$ 150/mês**. Encher metade da folga rende trinta vezes isso.

---

## O custo da IA, medido

62 chamadas, **R$ 5,87** entre 18/07 e 29/08 → **R$ 0,14/dia**, cerca de **R$ 4,20/mês**.

| Propósito | Chamadas | Custo | Média |
|---|---:|---:|---:|
| redator (delicado) | 7 | R$ 2,51 | R$ 0,359 |
| atendimento (padrão) | 17 | R$ 1,56 | R$ 0,092 |
| classificação (econômico) | 31 | R$ 0,92 | R$ 0,030 |
| atendimento (delicado) | 1 | R$ 0,47 | R$ 0,470 |
| redator (padrão) | 6 | R$ 0,41 | R$ 0,068 |

**Irrelevante no custo por lavagem: R$ 0,02.** Com o volume de hoje, a IA não é uma linha de custo — é ruído.

Uma correção pequena: `custo_ia_por_chamada` está configurado em **R$ 0,05** e o medido é **R$ 0,095** — quase o dobro. Não muda nada material (R$ 4/mês), mas é bom o teto do dia ser calculado com o número certo.

---

## A tela

**Financeiro › Preço.** Ela lê os 82 contratos reais, calcula os dois custos, mostra quem está abaixo do custo cheio e **pede a você os quatro números que não existem** — ajudante, material, transporte, sistema. Você mexe, a conta vira na hora.

**Nada é salvo.** Enquanto os dados não forem revisados com a Sureya, ela só lê.

Enquanto material, transporte e sistema estiverem em branco, ela avisa em cima da própria sobra que aquilo é o teto, não o resultado.

---

## O que está provado

**14 asserções** (`testes/simular.ts`, seção 12f), sobre a conta que agora mora numa função pura:

- semanal consome 4,345 lavagens/mês, não 4 (usar 4 subestimaria a carga semanal em 8% — e é no semanal que estão os contratos mais baratos);
- **periodicidade desconhecida não vale zero lavagem** — zero faria o contrato parecer trabalho de graça, com margem infinita, e ele subiria para o topo da lista dos melhores contratos da casa;
- **o custo cheio depende do volume**: com dois contratos, R$ 1.840 se divide por 6,3 lavagens e o custo cheio vira R$ 290 — até o contrato bom fica "abaixo do custo". Com a carteira cheia cai para R$ 13. O mesmo contrato, o mesmo preço, a mesma ajudante, dois veredictos opostos. É por isso que esse número não decide se vale pegar mais um cliente;
- o custo de mais uma **não carrega o salário**;
- sem contrato nenhum, o custo por lavagem é vazio e não infinito;
- contrato sem periodicidade sai da conta **e é contado**, em vez de sumir em silêncio.

**6 guardas estáticas**: a tela mostra os dois custos; a conta mora numa função só e não na tela; a tela avisa quando a sobra foi calculada com custo faltando; a capacidade vem da configuração da casa (não de um número solto na tela, que faria a página de preço discordar da agenda); e a tela não grava nada.

**CI verde: 295 testes, 0 falhas.** Placar do banco igual a produção.

---

## O que eu preciso de você para fechar a conta

Três números, e a conta de preço deste negócio fica pronta:

1. **Quanto custa o material de uma lavagem** — produto, pano, água, balde.
2. **Quanto custa o transporte por lavagem** — condução, combustível.
3. **Quanto sai por mês de sistema e telefone.**

Com eles a tela para de dizer "teto" e passa a dizer "sobra". Sem eles, tudo o que está acima continua verdadeiro — só que o R$ 1.310 é o melhor caso, não o caso.
