# Leva 6 — o repositório volta a reproduzir o produto, e o site vende no cemitério novo

**Build:** limpo · **`npm run checar`:** sem avisos · páginas de chegada conferidas rodando de verdade (liguei o segundo cemitério, renderizei, desliguei).

Duas frentes independentes. Pode subir o código já; as migrations você roda quando quiser.

---

# PARTE 1 — O repositório

## O problema

Onze tabelas nasceram direto no SQL Editor e nunca voltaram para o repositório. O sistema funciona (elas existem na sua produção), mas **o código não reproduz o produto**: um Supabase novo sobe pela metade e quebra em runtime, em telas que mexem em dinheiro.

Pior: a `0031` **insere** em `categorias_financeiras`, que nenhuma migration criava. Em base limpa ela abortava — então nem dava para rodar as migrations em ordem. (E a minha `0043` tinha o mesmo defeito, numa consulta de conferência que ficou solta. Corrigi as duas.)

## `0045_tabelas_que_faltavam.sql` — as onze tabelas

`categorias_financeiras` · `lancamentos` · `entradas_banco` · `conta_equipe` · `servicos_extras` · `pedidos_extras` · `dias_sem_campo` · `telefones_ignorados` · `assinaturas_push` · `pedidos_ajuda` · `historico_cliente`

Tudo `create table if not exists` + `create index if not exists` + policy criada só se não existir. **Na sua produção é um no-op**: não altera coluna, não apaga linha. A migration traz a consulta para você comparar a contagem de colunas antes e depois.

Cada coluna tem, no comentário, o arquivo que a usa — foram deduzidas do uso real no código, não inventadas.

Quatro índices únicos ali são **obrigatórios**, não enfeite: o código faz `upsert` com `onConflict` em `servicos_extras`, `dias_sem_campo`, `telefones_ignorados` e `assinaturas_push`. Sem eles, esses POSTs devolvem erro 42P10. E a FK `lancamentos.categoria_id` é o que faz o PostgREST aceitar o embed `categorias_financeiras(nome,grupo)` — sem ela, Gestão e "O mês" quebram com PGRST200.

## `0046_EXTRAIR_do_banco.sql` — as 24 funções

**Não escrevi as funções, e isso é deliberado.**

Faltam 24 `sureya_*` que o código chama todo dia — inclusive `sureya_pagamento_avulso`, `sureya_entrada_identificada`, `sureya_pagar_equipe`, `sureya_estornar_servico`, `sureya_fluxo_caixa`. Eu nunca vi o corpo delas. Se eu escrevesse "do jeito que provavelmente são" e você rodasse um `create or replace`, o resultado seria **substituir funções que hoje funcionam por palpites meus, em cima de dinheiro de família**. Um palpite bem escrito é pior que um buraco declarado — parece certo.

Então o caminho é o inverso: **o seu banco dita, o repositório copia.**

O arquivo é só `SELECT`. Rode o Bloco 1, copie a coluna `definicao` inteira e cole num arquivo novo `migrations/0047_funcoes_extraidas_do_banco.sql`. Leva uns cinco minutos, e a partir daí o repositório reproduz o produto.

Os outros blocos conferem: função que o código chama e não existe (tem que voltar vazio), função no banco que ninguém chama, e o **schema real** das tabelas que a 0045 deduziu — para você comparar e corrigir onde eu errei o tipo.

> **A prova real** é criar um Supabase vazio, rodar 0001 → 0047 na ordem, e o app subir. Não precisa ser agora e não precisa ter dado. Enquanto isso não for testado uma vez, "temos backup" é suposição.

---

# PARTE 2 — O site para vender no cemitério novo

## A decisão que mudou o texto inteiro

Vocês estão **chegando**, sem cliente lá. Isso significa que a página do segundo cemitério **não pode** dizer o que a do Saudade diz. "Conhecemos quadra por quadra", "desde 1990 aqui" — seria mentira, e a primeira família descobriria na primeira visita. Página de venda que promete o que não existe funciona por seis meses e queima o nome.

Então a página de chegada é outra venda:

**Título:** *"Chegamos ao [cemitério] — e a primeira limpeza é por nossa conta."*

**A seção que era "Por que a gente conhece este cemitério" vira "Somos novos aqui — e vamos falar disso na cara":**

> "Estamos começando a atender aqui agora. Não vamos dizer que conhecemos este cemitério de cor — ainda não conhecemos. O que temos são mais de trinta anos cuidando de túmulos no Cemitério da Saudade, a mesma equipe e o mesmo jeito de trabalhar: a gente mapeia as quadras antes, e você recebe a foto do jazigo limpo a cada visita."

Admitir a fraqueza é o que compra a confiança — e ela é verdadeira de qualquer jeito, então mais vale ser você a dizer.

## A oferta

**A primeira limpeza por nossa conta**, em bloco próprio, logo **depois** do parágrafo que admite ser novo. A ordem importa: assim a oferta é a *resposta* à desconfiança que acabou de ser admitida, não um desconto solto.

Três passos, sem letra miúda: você diz qual é o jazigo → a gente vai, limpa e manda a foto → você decide se quer continuar. Mais os limites ditos na hora certa: uma por família, enquanto estivermos abrindo; jazigo abandonado precisa de limpeza pesada primeiro, e nesse caso o valor vem antes.

**Na home**, o cemitério novo aparece com selo dourado **"Chegando agora"** e a oferta escrita no card — é o motivo de clicar.

**No WhatsApp**, o clique da página de chegada manda um texto diferente: *"Vi que a primeira limpeza é por conta de vocês."* Você sabe de qual página veio o lead sem precisar perguntar — e é assim que dá para medir se a página está vendendo.

## Falta uma linha sua: o nome

Em `src/lib/marca.ts` o segundo cemitério já está escrito, com toda a copy de chegada pronta, e **`ativo: false`**. Troque `nome`, `bairro`, `slug` e vire para `true`.

Deixei desligado de propósito: enquanto for `false`, ele não existe para o visitante — nada de página no ar com "NOME DO CEMITÉRIO" escrito. Conferi que funciona: liguei um cemitério de teste, renderizei a página inteira, e desliguei.

Quando você virar para `true`, nascem sozinhos: a página `/cemiterio/<slug>`, a entrada no sitemap, o card na home e a ficha própria no Google.

E no painel, lembre de cadastrar o cemitério em **Config → Cemitérios** — é isso que faz a *agenda* existir para ele. São coisas separadas: o site é vitrine, o painel é operação.

---

## Conferência

**Repositório:**
1. Rode a 0045 e depois a consulta 1 dela: 11 linhas, todas `existe = true`.
2. Consulta 3: os 4 índices únicos obrigatórios.
3. Rode o Bloco 2 da 0046: tem que voltar **vazio**.
4. Bloco 1 → cole em `0047_funcoes_extraidas_do_banco.sql`.

**Site:**
1. Preencha o nome do cemitério e vire `ativo: true`.
2. Abra `/cemiterio/<slug>` — o título tem que dizer "Chegamos ao…".
3. A home mostra o selo "Chegando agora" e a oferta no card.
4. Clique no WhatsApp da página nova: a mensagem já vem com o nome do cemitério e a menção à oferta.

---

## O que ainda falta

| O quê | Tamanho | Nota |
|---|---|---|
| **Colar as funções extraídas** | P | É o Bloco 1 da 0046. Cinco minutos, e o repositório fica completo. |
| **Testar as migrations num Supabase vazio** | M | A única prova de que a restauração funciona. |
| **Deslocamento entre cemitérios** | M | Só importa se a equipe atender dois no mesmo dia sem vínculo por pessoa. |
| **Exclusões sem trilha** | P | Conversa em massa, lançamento e conta da equipe não passam por `auditoria`. |
| **`consumo.ts`** | P | Baixa estoque sem registro por serviço; estornar não repõe. |
| **Fotos do antes já perdidas** | P | Os arquivos estão no bucket; dá para religar os ponteiros com um script. |
| **Foto real na página** | P | O site ainda não tem nenhuma foto de verdade (`mostrarFotos: false`). Três pares de fotos reais valem mais que qualquer palavra que eu escreva — e a primeira limpeza gratuita no cemitério novo é justamente a chance de conseguir as primeiras. |
