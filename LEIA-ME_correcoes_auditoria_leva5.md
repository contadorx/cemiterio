# Leva 5 — a tela "O mês"

**Build:** `npm run build` limpo · `npm run checar` sem avisos.
**Nenhuma migration.** Nada de novo no banco: a tela lê o que já existe.

Financeiro → **O mês** (é a primeira aba, e a padrão). As abas antigas continuam exatamente onde estavam — esta não substitui nenhuma; ela responde a pergunta e aponta para o lugar de agir.

---

## O problema não era o número de cliques

Responder "como foi o mês" custava ~9 telas e 15+ cliques, e o mês precisava ser informado **quatro vezes** em quatro controles que não se conversavam (dois `input month` e dois `select` de "últimos N meses"). Trocar o mês num não trocava em nenhum outro.

Mas o pior era outro: **não existia foto do passado.**

`api/financeiro/relatorio` lia **todos os movimentos de todos os tempos** para montar "quem está em aberto" — sem nenhum filtro de data. Abrir julho em agosto mostrava o saldo de **hoje** com o rótulo de julho. Isso torna a palavra "fechamento" mentirosa: não dá para fechar um mês olhando um número que muda todo dia.

Agora o saldo de cada família é calculado com os movimentos até o **último dia do mês pedido**. Julho mostra como julho terminou — inclusive quem devia e depois pagou.

---

## O que a tela responde, na ordem em que se pergunta

**1. Quanto entrou e quanto sobrou.** Quatro números grandes: Entrou · Custos · Sobrou · Ficou devendo. Embaixo, a linha do trabalho: quantas limpezas, em quantas famílias, quanto foi faturado.

**2. No que saiu o dinheiro.** Custos por categoria, do maior para o menor.

**3. O que ficou para trás.** É a parte que evita prejuízo:
- **limpezas feitas e NÃO cobradas** — serviço saiu, nada entrou na conta da família. Era o tipo de coisa que só aparecia meses depois, se alguém cruzasse as duas tabelas;
- limpezas fechadas **sem a foto do depois** (a regra da casa é que sem foto não fecha — estas passaram por outro caminho);
- comprovantes a conferir e entradas do banco sem dono, com atalho.

**4. Quem estava devendo no fim do mês.** Com o último pagamento, há quantos dias, e — o que não existia em tela nenhuma — **em que pé está a cobrança**: quantos lembretes levou, se o envio está desligado, se você marcou "não cobrar", e principalmente se a **régua está no teto**. Quem chega no teto some da cobrança automática em silêncio; agora isso aparece em vermelho, com a explicação do que fazer.

**5. Quem pagou** (recolhido, num `details`) e **o que reajustar**, com atalho para a aba.

Um seletor só, com **← anterior / seguinte →** e "este mês". Mês em curso vem marcado como **parcial**.

---

## Um erro meu, achado antes de empacotar

A primeira versão calculava `resultado = entrou + entradas lançadas − custos`.

Isso **conta a receita duas vezes** para quem lança o dinheiro das famílias no caixa — que é justamente o que a tela de Gestão pedia para fazer ("lance a diferença para o resultado ficar certo"). Ou seja: puniria quem é organizado.

Agora a receita tem **uma fonte só** — `movimentos`, porque todo pagamento passa por lá. Os lançamentos de entrada não são somados por cima, e a tela **diz isso** em vez de deixar você adivinhar. As saídas, sim, vêm do caixa: elas não existem em `movimentos`.

Se houver entrada lançada **além** do que veio das famílias (venda de material, aporte), a tela mostra o valor e avisa que ele está fora desta conta de propósito.

---

## Detalhes que valem saber

- **`a_conferir` não entra no saldo.** Dinheiro que ainda não foi confirmado não abate dívida — mesma regra do resto do sistema. Ele aparece à parte, na linha do trabalho.
- **`lancamentos` e `entradas_banco` não têm migration no repositório.** A tela consulta as duas de forma defensiva: se alguma não responder, o resto continua funcionando e um aviso explica o que ficou de fora.
- **As contas de mês foram testadas** (fevereiro bissexto, virada de ano, meses de 30 e 31 dias) sem passar pelo fuso da máquina.
- **Atalho no Início:** o card "Este mês" ganhou um "Como foi o mês →".

---

## Conferência depois de subir

1. Abra Financeiro — cai direto em **O mês**.
2. Volte um mês com "← anterior". O bloco "Quem estava devendo" tem que mostrar **a foto daquele mês**, não a de hoje: se alguém devia em julho e pagou em agosto, ela aparece na lista de julho.
3. Compare o "Entrou" com a aba **Gestão do negócio** do mesmo mês — o recebido das famílias tem que bater.
4. Se aparecer alguma **limpeza feita e não cobrada**, confira na ficha da família antes de lançar à mão: pode ser plano pré-pago (que não debita de propósito).

---

## O que ainda falta

| O quê | Tamanho | Nota |
|---|---|---|
| **Repositório não reproduz o produto** | M | 11 tabelas e 24 RPCs sem migration; a 0031 quebra em ambiente novo. Afeta restauração, não operação — mas é o que impede recriar o sistema do zero. |
| **Deslocamento entre cemitérios** | M | Só importa se um dia a equipe atender dois no mesmo dia sem vínculo por pessoa. |
| **Exclusões sem trilha** | P | Conversa em massa, lançamento e conta da equipe não passam por `auditoria`. |
| **`consumo.ts`** | P | Baixa estoque sem registro por serviço; estornar não repõe. |
| **Fotos do antes já perdidas** | P | Os arquivos estão no bucket (`servicos/<org>/<id>/antes-*.jpg`); dá para religar os ponteiros com um script, se valer a pena. |
