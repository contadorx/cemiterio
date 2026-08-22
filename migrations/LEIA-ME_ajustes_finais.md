# Ajustes finais — 18/07/2026

## O financeiro não aparecia (bug)
As abas estavam fixas no código como dois botões. As telas **Gestão do negócio** e
**Resultado por jazigo** existiam mas nunca eram renderizadas. Corrigido: quatro
abas, e **Gestão do negócio abre por padrão** — é a visão que interessa.

## Custeio com média
Enquanto a Nina não usa "Começar/Finalizar" em tudo, o custo ficava zerado e a
margem aparecia cheia — mentira. Agora:

1. Onde há tempo medido, usa o real.
2. Onde não há, usa a **média medida da própria operação**.
3. Se ainda não houver nenhuma medição, usa o **tempo padrão** (Config → A Casa,
   padrão 25 min).

A tela mostra **quanto de cada jazigo foi medido de verdade** (`medicao_pct`),
para você saber o quanto confiar no número.

## Custo da Nina
Config → A Casa → **Custo da operação**: salário mensal **ou** custo por hora.
Com salário, o custo/hora é calculado a partir da jornada configurada
(dias da semana × horas × 4,33 semanas, descontando o almoço).

## Cliente e plano juntos
A tela "Planos" foi removida do menu. Tudo vive no **card do cliente**:
- No card da lista: periodicidade, valor mensal, **lava em** e **cobra em**,
  com borda laranja quando falta data.
- Filtros que estavam em Planos vieram junto: "Falta data de lavagem ou cobrança",
  "Ainda não conferidos", ordenação por próxima cobrança.
- A edição continua na ficha → jazigo → Editar.

## Campanha com contexto (estava faltando)
`executarCampanha({ comIa: true })` reescreve a mensagem para cada família,
olhando histórico e situação. Sem isso, era só `{nome}` trocado.

## Agenda (estava faltando)
Filtros **Amanhã · 3 · 7 · 14 · 30 · 90 dias** ou período com datas próprias.
Geração em **30/60/90 dias** ou **mês inteiro**, com a opção de incluir os
avulsos numa data (Finados).

## Auditoria automática
`npm run auditar` verifica os 38 itens da lista contra o código.
Rode depois de qualquer mudança grande.

## Sobre o Android da Nina
A leitura de QR usa `BarcodeDetector`, que funciona no **Chrome do Android** —
que é o caso dela. Sem preocupação.
