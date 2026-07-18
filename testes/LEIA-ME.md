# Simulador de operações

Executa as **funções reais** do sistema (`src/lib/*`) contra um banco em memória,
sem tocar em produção e sem precisar de credenciais.

## Como rodar
```bash
npm run testar
```

## Como funciona
- `fake-supabase.ts` — banco em memória que imita o cliente Supabase
  (select com joins aninhados, eq/in/gte/or/is/not, order, limit, insert,
  update, upsert com onConflict, delete, single/maybeSingle, count).
- `supabase-falso.ts` + `tsconfig.json` — trocam o SDK do Supabase por um
  substituto via alias de caminho, então o código real roda sem alteração.
- `simular.ts` — 54 verificações sobre financeiro, capacidade, agenda,
  multi-ajudante, cobrança, gatilhos, campanhas, briefing, bolhas, reajuste
  e o prompt final da IA.

## Bugs que este simulador encontrou (já corrigidos)
1. **Reajuste nunca aparecia** — `round5` arredondava para o múltiplo de 5 mais
   próximo, o que puxava o valor corrigido de volta ao preço atual e zerava o gap.
   Com dados reais, apenas 2 de 14 clientes apareciam na tela de Reajustes.
   Corrigido para arredondar **para cima**.
2. **Briefing repetia o mesmo alerta** — um aviso por serviço em vez de um por
   túmulo. Cliente com 2 limpezas no mesmo dia gerava alerta duplicado, e o
   limite de 5 avisos escondia os outros. Corrigido com deduplicação.
