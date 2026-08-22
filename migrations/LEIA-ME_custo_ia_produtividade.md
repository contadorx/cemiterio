# Custo real de IA, produtividade e consumo de material

## Os R$ 0,05 eram chute meu — agora é medição
A API devolve os tokens usados em cada chamada. Passamos a guardar
(`chamadas_ia`) e calcular o custo real por preço de entrada/saída de cada modelo
(tabela `modelos_ia`, editável). O acumulado do dia fica em `uso_ia.custo_real`.

## Como o modelo é escolhido (economia sem risco)
A lógica não é "mais contexto = modelo menor". O que decide é **o custo de errar**:

| Situação | Modelo | Por quê |
|---|---|---|
| Luto, reclamação, cancelamento | o melhor | errar aqui machuca uma família enlutada |
| Cobrança | padrão | o tom decide se a família paga ou se afasta |
| Rotina **com score ≥ 70** | econômico | a IA já provou que acerta com este contato |
| Rotina sem histórico | padrão | ainda não se provou |
| Destilar perfil, classificar, ler comprovante | econômico | ninguém lê o texto, só o resultado |

O score entra como aval: quem tem histórico de acertos em assunto rotineiro pode
ir de modelo econômico. Contato novo começa no padrão até se provar.

Ordem de grandeza: o econômico custa cerca de **1/3 a 1/4** do padrão. Como a
maioria das conversas é rotina, a economia esperada é grande — e o dinheiro
economizado fica justamente onde não faz falta.

## Produtividade de campo
O fluxo passa a ser **Iniciar (foto do antes) → Finalizar (foto do depois)**.
A diferença vira `duracao_minutos`. Sem "iniciar" registrado, fica nulo e o painel
mostra "não medido" — em vez de inventar número. Há `duracao_ajustada` +
`motivo_ajuste` para corrigir outliers e esquecimentos.

## Consumo de material
Cada material tem `consumo_por_limpeza` (ex.: 0,05 vassoura = uma vassoura dura
20 limpezas) e `custo_unitario`. A cada limpeza o estoque cai e o custo entra em
`servicos.custo_estimado`.

**A estimativa se corrige sozinha:** ao registrar uma compra, o sistema compara a
quantidade comprada com quantas limpezas houve desde a compra anterior e
**sugere** o consumo real. Você aprova ou não (`aplicarConsumoSugerido`).

## Resultado por jazigo
`sureya_resultado_por_jazigo(meses)` cruza receita × custo (mão de obra pelo tempo
medido × `custo_hora_campo`, mais material) e devolve margem em R$ e %.
Ordenado do pior para o melhor — para achar o jazigo que dá prejuízo.
