# Bloco de gestão — 18/07/2026

## Bugs corrigidos
- **Simulador**: `tumulos.map is not a function` — o simulador montava a lista de
  jazigos como texto. Agora é lista, e usa a chave Pix e a marca reais.
- **Plaquetas**: apareciam só as de teste porque **os 62 jazigos reais não tinham
  portal gerado**. Agora há geração em lote (por quadra ou todos) e filtros por
  quadra, rua e busca. Dados de teste ficam ocultos por padrão.

## Leads — o WhatsApp é pessoal
A IA **não responde mais automaticamente** a números desconhecidos. Podia ser uma
amiga, um parente ou alguém do outro trabalho. Agora só registra o contato para a
Sureya decidir. Para prospectar, ela cadastra o lead com o contexto que conhece
(quem indicou, qual jazigo) e a IA ajuda a partir dali.

## Financeiro de gestão (aba nova)
Fluxo de caixa mensal com entradas e saídas classificadas: materiais, pagamento da
ajudante, transporte, sistema e IA, impostos, **retirada da Sureya**. Mostra
entradas, saídas, resultado do mês e alerta quando o recebido das famílias não bate
com o que foi classificado.

**Custo de IA**: estimativa por chamada (ajustável em `orgs.custo_ia_por_chamada`,
padrão R$ 0,05), com total do mês, custo por dia e média de chamadas.

## Calendário do mês
`gerarCalendarioMes("2026-11")` gera o que os planos devem naquele mês, sem
duplicar o que já existe. Com `incluirAvulsos` + `dataAvulsos`, inclui os
**esporádicos que só contratam para uma data** — o caso do Finados.
Endpoint: `POST /api/agenda/mes`.

**Puxada de backlog**: `POST /api/agenda/puxar` traz serviços dos dias seguintes
para hoje (já existia no app da Nina, agora também pelo admin).

## IA com contexto (novo `src/lib/redator.ts`)
Reajuste, campanha e pedido de avaliação deixam de ser modelo fixo com {nome}
trocado. A IA lê saldo, histórico de conversa, tempo de casa, tratamento e perfil
para escrever a mensagem daquela família. **Sempre como rascunho.**

## Avaliação por WhatsApp
`pedidosDeAvaliacao()` roda no cron de convites: famílias com limpeza recente que
ainda não avaliaram recebem um pedido curto, escrito pela IA. Não pede para quem
está devendo, nem repete antes de 120 dias.

## Treino pelas correções
Quando você **edita** um rascunho, a diferença entre o que a IA escreveu e o que
você enviou vira lição permanente para aquele contato (`licoesDeEdicao`).

O score também ficou mais inteligente:
| Ação | Nota | Peso |
|---|---|---|
| Enviou direto | 100 | 0,30 |
| Aprovou | 95 | 0,25 |
| Editou | 30 a 85 (conforme quanto mexeu) | 0,20 |
| Descartou | 0 | 0,40 |

Editar pouco pontua quase como aprovar; reescrever tudo pontua quase como
descartar. E errar pesa mais que acertar — o automático fica mais difícil de
conquistar e mais fácil de perder.

## Filtros de clientes
Busca (nome, telefone, jazigo), situação (em aberto, em dia, adiantados, IA
automática, IA desligada, sem telefone), quadra, rua, periodicidade, vencimento
(7/15/30 dias) e ordenação (nome, quem deve mais, maior valor, próxima lavagem).
Com totalizadores no topo: quantas famílias, quanto por mês, quanto em aberto.
