# Correções da varredura de código — 18/07/2026

Aplicadas no código (não são migrations SQL):

## 1. resolver-token: service role sem filtro de org
`src/app/api/resolver-token/route.ts` usava `supabaseAdmin()` (que IGNORA RLS) para
buscar túmulo e serviço pelo qr_token, sem filtrar `org_id`. Em cenário multi-org, um
token de outra organização seria resolvido. Corrigido: `.eq("org_id", env.orgId())`
nas duas consultas.

## 2. .single() em orgs -> .maybeSingle()
`src/lib/agenda.ts` e `src/lib/capacidade.ts` usavam `.single()` ao buscar a org.
Se `SUREYA_ORG_ID` não bater com o banco, `.single()` lança um erro obscuro
("JSON object requested, multiple (or no) rows returned") em vez de falhar claro.
Trocado por `.maybeSingle()`.

## Verificações que passaram (sem achado)
- 26 tabelas e 18 RPCs referenciadas no código existem todas no banco.
- Nenhuma coluna inexistente referenciada (cruzamento automático com information_schema).
- Nenhuma promessa sem await.
- Demais usos de service role filtram org_id corretamente.
- Build e type-check limpos.
