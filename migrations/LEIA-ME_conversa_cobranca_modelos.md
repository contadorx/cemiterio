# Conversa contínua · momentos de cobrança · escolha de modelo

## 1. A IA parecia não acompanhar — e o motivo era simples
Ela via 12 mensagens, mas **sem saber quando cada uma foi dita**. Lia "vou pagar
semana que vem" e não sabia se foi ontem ou em março.

Agora:
- **30 mensagens** em vez de 12
- **Marcas de tempo**: `[há 3 meses]`, `[ontem]`, `[há 2 semanas]` quando muda o dia
- **Áudio marcado**: "(isto veio por áudio)"
- Instrução no prompt: *"Tudo abaixo é UMA conversa que continua. O que ficou
  combinado antes? A pessoa já perguntou isto? Quanto tempo passou? Voltar depois
  de meses pede um 'que bom te ver por aqui', não um 'pois não?'"*

## 2. Três momentos de cobrança
| Momento | Quando usar |
|---|---|
| **Depois** (padrão) | fecho normal do ciclo |
| **Antes** | paga para a gente ir |
| **Contra a foto** | a cobrança nasce quando a lavagem é entregue |

Editável em ficha → jazigo → Editar. Os avulsos já entraram como **contra a foto**,
que é o combinado mais comum.

A cobrança automática respeita: se a lavagem é contra-foto e ainda não foi
entregue, **não cobra** — a foto é a prova do serviço.

## 3. Registrar lavagem pelo painel
Botão **📸 Registrar lavagem** em cada serviço da agenda. Para quando a Nina
mandou a foto por WhatsApp, quando você mesmo foi ao cemitério, ou quando o
registro falhou no campo.

Sobe as fotos, aceita a duração à mão, envia para a família e — no contra-foto —
**libera a cobrança**. Mostra no fim o que aconteceu: foto enviada, cobrança
lançada, material descontado.

## 4. Pagamento sem comprovante
Botão **💰 Registrar pagamento** na ficha. Para "pagou e não mandou nada": entra
como crédito, marcado `sem_comprovante`, e **zera a régua de cobrança**.
Fica registrado para você conferir no extrato do banco.

## 5. Escolha de modelo — Agente → Modelos e custo
Três níveis, cada um com o modelo e o preço editáveis:

| Nível | Modelo | Custo/conversa | Quando |
|---|---|---|---|
| Econômico | Haiku 4.5 | ~R$ 0,02 | rotina com score alto, tarefas internas |
| Padrão | Sonnet 5 | ~R$ 0,07 | cobrança, contatos novos |
| **Delicado** | **Opus 4.8** | ~R$ 0,36 | **luto, reclamação, cancelamento** |

O Opus entrou no delicado como você pediu. A tela mostra quanto cada nível
custou de fato nos últimos 30 dias.

**Sobre "o custo está certo?":** o custo é medido pelos tokens que a API devolve,
não estimado. Mas os **preços por milhão de tokens** são os que estão na tabela —
confira na tabela oficial da Anthropic e ajuste se mudaram. É por isso que
deixei editável.

## 6. Caixas de texto
Conversa: caixa de envio virou textarea de 5 linhas (era uma linha só).
**Enter quebra linha, Ctrl+Enter envia.** Rascunho e "me ajuda a escrever" com
160px. Agente: conhecimento com 320px.

O rascunho da IA **já era editável** — e agora mostra por que não foi automático
("a família escreveu 'faleceu'", "score 45 abaixo de 80").
