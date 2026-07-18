# Limpeza dos testes + revisão de usabilidade

## Dados de teste — removidos
Apagados: 14 clientes [TESTE], 14 jazigos, 78 serviços, 61 movimentos,
5 quadras, 1 cemitério, 6 materiais, 3 leads, 1 campanha.

**Ficaram: 59 famílias reais, 62 jazigos, 55 serviços agendados.**
Zero registros de teste no banco.

## Onde fica o financeiro
**Menu → Financeiro**, quatro abas. A primeira abre por padrão:

1. **Gestão do negócio** ← é esta que você procura
   - Entradas, saídas, resultado do mês, custo de IA
   - Novo lançamento: tipo, categoria, valor, data, descrição
   - Categorias prontas: Materiais · Pagamento da ajudante · Transporte ·
     Sistema e IA · Impostos · **Retirada da Sureya** · Outras
   - Entradas e saídas somadas por categoria
   - Alerta quando o recebido das famílias não bate com o classificado
2. **Comprovantes a conferir**
3. **Recebido no mês**
4. **Resultado por jazigo** — receita × custo, do pior para o melhor

**O saldo inicial de cada família** não fica aqui: é por família, em
**Clientes → abrir a família → "Saldo de abertura (migração)"**. Positivo = em
aberto, negativo = pagou adiantado. Entra no razão como lançamento auditável.

## Por que você não via
As telas de Gestão e Resultado por jazigo estavam no código mas as abas não as
chamavam (bug corrigido na rodada anterior). O mesmo vale para os filtros da
agenda. **Ambos estão no código agora** — se ainda não aparecem, é porque o
deploy publicado é anterior a este zip.

## Revisão de usabilidade do app de campo
O contexto manda: mulher em pé no cemitério, sol na tela, mão molhada ou suja,
às vezes com luva. As decisões saem daí.

| O que mudou | Antes | Agora |
|---|---|---|
| Campo de texto do recado | uma linha, 16px | **caixa de 3 linhas que cresce**, 18px |
| Botão de enviar | ao lado, pequeno | **largura cheia**, 60px de altura |
| Corpo do texto | 13–14px dominava | **17–18px** |
| Cinza secundário | #94a3b8 (some no sol) | **#475569** |
| Botão principal | ~44px | **64px** |
| Espaço entre botões | 8px | **12px** |
| Espaço entre cards | 10px | **14px** |
| Atalhos do assistente | 13px, 36px de altura | **16px, 52px** |

Regras que ficaram registradas em `src/app/campo/estilo.ts`:
- Nada de texto abaixo de 15px.
- Nenhum alvo de toque abaixo de 56px (44px é para dedo limpo e seco).
- Ícone acompanha palavra, nunca substitui.
- Cinza claro é proibido: no sol, some.
