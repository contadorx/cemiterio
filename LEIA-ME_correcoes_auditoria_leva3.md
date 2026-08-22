# Correções da auditoria — leva 3

**As quatro escritas silenciosas que eu tinha deixado para fazer com você olhando.** São as que mexem em rotina semanal e podem custar dinheiro ou o dia da Nina.

**Build:** `npm run build` limpo · `npm run checar` sem avisos.

**Três migrations novas** (`0041`, `0042`, `0043`). Nenhuma apaga uma linha sequer: duas criam coisa nova e uma substitui uma função. **Todo o código tem plano B** — se você subir sem rodar nenhuma delas, nada quebra; só não ganha a proteção.

---

## 1. A agenda parou de apagar a sua decisão

**Arquivos:** `migrations/0041_servico_fixado.sql`, `lib/agenda.ts`, `api/servico/[id]/route.ts`, `api/agenda/semana/route.ts`, `painel/agenda/page.tsx`

**A dor:** `alocarAgenda()` reescreve data, ordem, status e executora de **todo** serviço pendente — e roda no cron das 9h, no "Gerar e distribuir" e no "Reorganizar". Você remarcava uma lavagem para o dia combinado com a família e, na madrugada seguinte, o alocador devolvia o serviço para onde a fila mandasse. Sem log, sem aviso.

**A correção:** uma marca de "isto foi decidido por uma pessoa" (`servicos.fixado_em`). Remarcar à mão preenche a marca; o alocador pula quem a tem.

Na tela da Agenda a lavagem aparece com **📌 data sua**, e um botão **"Soltar data"** devolve ela para a distribuição automática quando você quiser (com confirmação que diz o que vai acontecer).

**Como sei que funcionou:** remarque uma lavagem, rode "Gerar e distribuir" e veja a data continuar onde você pôs.

---

## 2. Fechar o dia sem atropelar ninguém

**Arquivos:** `migrations/0042_fechar_dia_sem_estrago.sql`, `api/campo/fechar-dia/route.ts`, `campo/Assistente.tsx`

Eram três problemas na mesma função:

**a) O motivo do "não deu" era sobrescrito.** A Nina escolhe "Começou a chover" e isso vai para `motivo_adiamento`. No fim do dia, o "Encerrar dia" passava por cima com a observação genérica do dia — ou com o texto padrão "não concluído no dia". Você perdia exatamente a informação que serve para enxergar o padrão. Agora o motivo dela manda; a observação do dia só entra quando não há motivo específico.

**b) O admin fechava o dia de toda a equipe.** Quando quem chamava era você, a rota mandava executora = null e a função entendia **"todo mundo"** — encerrava o dia da ajudante que ainda estava no cemitério, devolvendo a lista dela ao backlog no meio da tarde. Agora, se você não disser de quem é o dia, a rota **recusa** e explica; e existe uma opção explícita para "o dia de toda a equipe", que avisa que quem estiver em campo perde a lista.

**c) Não era idempotente.** Chamar duas vezes somava +20 de prioridade e "adiado 2x". Agora o segundo fechamento não encontra nada em aberto e devolve zero.

**Se a 0042 não estiver rodada,** a rota detecta e chama a função antiga — o "Encerrar dia" da Nina continua funcionando, com um aviso na resposta.

---

## 3. O acerto da equipe não paga duas vezes

**Arquivos:** `migrations/0043_acerto_equipe_sem_pagar_duas_vezes.sql`, `api/equipe/remuneracao/route.ts`, `painel/financeiro/Remuneracao.tsx`

**A dor:** os jazigos ficavam marcados como pagos, mas **a parte fixa do mês não era registrada em lugar nenhum** — o próprio código admitia isso num comentário. Clicar "Acertar" duas vezes no mesmo mês pagava o salário duas vezes, e a única pista era a descrição do lançamento.

**Agora quem recusa é o banco:** a tabela `acertos_equipe` tem chave primária `(org, membro, mês)`. Mesmo duas abas clicando ao mesmo tempo, o segundo insert falha e a tela diz *"O fixo de 2026-08 desta pessoa já foi acertado"*.

**O `confirm` invertido também saiu.** A pergunta era *"Incluir o fixo? OK = jazigos + fixo. **Cancelar = paga só os jazigos**"* — quem tentasse abortar o acerto inteiro avançava para o próximo diálogo. Agora são **dois botões**, cada um dizendo o que vai fazer e quanto:

- `Pagar só os jazigos (R$ X)`
- `Pagar jazigos + fixo (R$ Y)`

E o Cancelar do confirm final cancela, como em qualquer outro lugar.

**A ordem também estava errada:** os serviços eram marcados como pagos **antes** do lançamento no caixa. Se o lançamento falhasse, viravam um aviso de texto — jazigos "pagos" sem saída nenhuma no caixa, e sem tela para desmarcar. Agora o caixa vem primeiro; se ele falhar, nada foi marcado e dá para tentar de novo. Se o caixa der certo e a marcação falhar, a resposta diz exatamente o que conferir à mão.

> ⚠️ **Um minuto de trabalho na 0043.** Acertos que já aconteceram não estão na tabela nova (não havia onde guardar). No primeiro mês depois de subir, o sistema vai achar que o fixo daquele mês ainda não saiu. A consulta 2 da migration acha os acertos já lançados no caixa, e o INSERT comentado logo abaixo registra cada um. Faça isso antes do próximo acerto.

---

## 4. Um "hoje" só no sistema inteiro

**26 arquivos.** A leva 1 arrumou o campo e a agenda; esta fecha o resto — financeiro, equipe, extras, conciliação, reajuste, consumo e os campos de data pré-preenchidos das telas.

Agora **não existe mais nenhum `toISOString().slice(0,10)`** no `src/` fora do `vencimento.ts`, que é onde o fuso mora. Ganhou também um `mesOperacao()` para os seletores de mês.

O que isso muda na prática: das 21h à meia-noite, o mês pré-selecionado na Gestão, o dia do lançamento de saída, a data do reembolso de material e o mês do acerto da equipe **eram todos do dia seguinte**. Um lançamento feito na noite do dia 31 caía no mês seguinte.

---

## Ordem para subir

1. **O código.** Nada depende das migrations; todas têm plano B.
2. **`0041_servico_fixado.sql`** — só adiciona coluna. Zero risco.
3. **`0042_fechar_dia_sem_estrago.sql`** — substitui uma função. Guarde o texto atual antes (`select prosrc from pg_proc where proname = 'sureya_fechar_dia';`) se quiser poder voltar.
4. **`0043_acerto_equipe...sql`** — cria tabela, e **depois registre os acertos que já aconteceram** (consultas 2 e 3 dentro do arquivo).

---

## Conferência depois de subir

1. Remarcar uma lavagem → rodar "Gerar e distribuir" → a data continua onde você pôs, com 📌.
2. "Encerrar dia" pelo painel sem escolher pessoa → recusa com explicação, em vez de fechar o dia de todo mundo.
3. A Nina marcar "Não deu · Começou a chover" e encerrar o dia → `motivo_adiamento` continua "Começou a chover".
4. Acertar com o fixo → tentar de novo no mesmo mês → recusa dizendo que já foi pago.
5. Lançar uma saída no caixa às 22h → a data pré-preenchida é a de hoje, não a de amanhã.

---

## O que ainda falta (o mapa completo)

| O quê | Tamanho | Por que ainda não |
|---|---|---|
| **Multi-cemitério (o mínimo)** | G | É o único que vale fazer **antes** de precisar. Agenda, capacidade, rota e equipe não sabem de cemitério. |
| **A tela "como foi o mês"** | G | Continuam 9 telas e 15+ cliques. E `financeiro/relatorio` lê todos os movimentos de todos os tempos — não existe foto do passado. |
| **Repositório não reproduz o produto** | M | 11 tabelas e 24 RPCs usados pelo código não têm migration; a 0031 quebra em ambiente novo. Não afeta a operação, afeta a restauração. |
| **Exclusões sem trilha** | P | Conversa em massa, lançamento e conta da equipe apagam sem passar por `auditoria`. |
| **`consumo.ts` baixando estoque sem registro por serviço** | P | Estornar o serviço não repõe o material. |
