-- ============================================================================
-- SUREYA — 0057 · BUILD 1b (parte 1) · FECHAR A PORTA DAS FUNÇÕES
--
-- GRAVIDADE: P0. Fecha o acesso ANÔNIMO às funções que movimentam dinheiro.
--
-- O QUE A EXTRAÇÃO MOSTROU
-- ---------------------------------------------------------------------------
-- São ~50 funções `sureya_*`, quase todas `SECURITY DEFINER` — ou seja, rodam
-- com os privilégios do dono e IGNORAM RLS por completo. A RLS não protege
-- nenhuma delas; o que protege é o GRANT de EXECUTE.
--
-- E no PostgreSQL o padrão de uma função nova é `GRANT EXECUTE TO PUBLIC`.
--
-- A migration 0016 sabia disso e escreveu, com todas as letras:
--
--     "As funções das migrations 0001–0006 nasceram sem revoke from public,
--      então PUBLIC mantinha EXECUTE e o anon herdava."
--
-- Ela então revogou... CINCO funções. E depois dela vieram as migrations 0017
-- a 0051, com dezenas de funções novas — incluindo todas as de dinheiro. Só a
-- 0014 e a 0038 voltaram a revogar alguma coisa.
--
-- Ou seja: `PUBLIC` (e portanto `anon`, a chave que está no navegador de
-- qualquer pessoa que abra o site) tem EXECUTE em funções como:
--
--     sureya_pagamento_avulso        credita pagamento em qualquer família
--     sureya_entrada_identificada    lança entrada e quita débitos
--     sureya_registrar_entrada_banco lança entrada no banco
--     sureya_pagar_equipe            paga a ajudante e baixa a conta
--     sureya_estornar_servico        estorna lavagem cobrada
--     sureya_excluir_servico         apaga serviço e movimentos
--     sureya_anonimizar_cliente      apaga nome, telefone e mensagens
--     sureya_saldo_abertura          reescreve o saldo inicial da família
--     sureya_aplicar_reajuste        muda o preço do contrato
--
-- Todas `SECURITY DEFINER`. Todas resolvem a org por `current_org_id()`, que
-- para um anônimo devolve NULL — e é isso que segura a maioria hoje. Mas
-- `sureya_registrar_indicacao` e as `sureya_portal_*` NÃO dependem de sessão:
-- elas encontram a org pelo token ou pelo código. Depender de "current_org_id()
-- devolve null" como fronteira de segurança é depender de um efeito colateral.
--
-- O QUE ESTA MIGRATION FAZ
-- ---------------------------------------------------------------------------
-- Inverte o padrão: nega para todo mundo, libera nominalmente.
--
-- O mapa de quem precisa do quê foi levantado do código, rota por rota:
--   · 5 funções são chamadas com a CHAVE ANÔNIMA (portal por QR, avaliação e
--     indicação — `src/app/api/{portal,avaliar,indicar}/route.ts` criam o
--     cliente com `env.SUPABASE_ANON_KEY`). Só essas recebem `anon`.
--   · o resto é chamado por rota autenticada, com a sessão da pessoa.
--   · nenhuma é chamada do navegador: não há `.rpc(` em nenhum `.tsx`.
--
-- O QUE ELA **NÃO** FAZ — e precisa vir a seguir
-- ---------------------------------------------------------------------------
-- Não separa `campo` de `admin`. `authenticated` inclui os dois papéis, e
-- essas funções não olham `papel`. Depois desta migration, uma conta de campo
-- ainda pode chamar `sureya_pagamento_avulso` direto pelo PostgREST.
--
-- A correção é `if not is_admin() then raise exception 'somente_admin'; end if;`
-- dentro de cada função administrativa (as funções `is_admin()`/`is_campo()`
-- vieram na migration 0055). Isso exige reemitir cada função com o corpo
-- inteiro, uma a uma — está planejado como 0058, em lotes, começando pelas de
-- dinheiro. Não faço isso por regex sobre `pg_get_functiondef()`: reescrever
-- 50 funções de segurança com expressão regular em produção é a troca de um
-- risco conhecido por um risco pior.
--
-- Esta migration fecha hoje a porta que dá para a internet. A porta interna
-- entre campo e administração fecha na 0058.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) O `sureya_fechar_dia` duplicado
--
-- A extração devolveu DUAS funções com esse nome:
--     (uuid, date, text, text)                      ← antiga
--     (uuid, date, text, text, boolean default false) ← atual
--
-- Como o quinto argumento tem DEFAULT, uma chamada com quatro argumentos
-- casa com as duas e o PostgreSQL recusa: "function is not unique".
--
-- O código já convive com isso: `src/app/api/campo/fechar-dia/route.ts` chama
-- com cinco argumentos e, se der erro, TENTA DE NOVO com quatro (linha 52).
-- Esse segundo caminho não pode funcionar — ele é a cicatriz de alguém tendo
-- batido neste problema e contornado por fora.
--
-- A versão de 4 argumentos também é pior: ela ignora `motivo_nao_feito`, então
-- o "Começou a chover" que a pessoa digitou some do adiamento.
-- ----------------------------------------------------------------------------
drop function if exists public.sureya_fechar_dia(uuid, date, text, text);


-- ----------------------------------------------------------------------------
-- 2) Semanal e quinzenal existem no enum e não existiam nestas duas funções
--
-- A migration 0047b adicionou `semanal` e `quinzenal` a `sureya_cadencia`.
-- `sureya_intervalo_dias` nunca soube disso: para essas duas cadências ela cai
-- no `else 0`.
--
-- E quem chama trata zero como "não faço nada":
--     sureya_pular_servico:     if v_intervalo <= 0 then return null; end if;
--     sureya_remarcar_servico:  if v_intervalo <= 0 then ... 0 seguintes
--     sureya_reagenda_apos_execucao: if v_intervalo <= 0 then return new;
--
-- Ou seja: em contrato semanal ou quinzenal, remarcar não replaneja, pular não
-- avança e concluir não agenda a próxima. Silenciosamente, sem erro.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_intervalo_dias(p_cadencia text, p_lavagens integer default 1)
returns integer
language sql
immutable
as $function$
  select greatest(1, round(
    (case p_cadencia
       when 'semanal'   then 7    -- 0047b: faltava aqui
       when 'quinzenal' then 15   -- 0047b: faltava aqui
       when 'mensal' then 30 when 'bimestral' then 60 when 'trimestral' then 90
       when 'semestral' then 180 when 'anual' then 365 else 0 end)::numeric
    / greatest(1, coalesce(p_lavagens,1))
  ))::int;
$function$;

create or replace function public.sureya_descreve_frequencia(p_cadencia text, p_lavagens integer)
returns text
language sql
immutable
as $function$
  select case
    when p_cadencia = 'avulso' then 'quando pedirem'
    when p_cadencia = 'semanal'   then 'toda semana'
    when p_cadencia = 'quinzenal' then 'a cada quinze dias'
    when p_lavagens <= 1 then
      case p_cadencia
        when 'mensal' then 'uma vez por mês'
        when 'bimestral' then 'a cada dois meses'
        when 'trimestral' then 'a cada três meses'
        when 'semestral' then 'duas vezes por ano'
        when 'anual' then 'uma vez por ano'
        else p_cadencia end
    when p_cadencia = 'mensal' and p_lavagens = 2 then 'duas vezes por mês (a cada 15 dias)'
    when p_cadencia = 'mensal' and p_lavagens = 4 then 'quatro vezes por mês (toda semana)'
    when p_cadencia = 'mensal' then p_lavagens || ' vezes por mês'
    when p_cadencia = 'bimestral' then p_lavagens || ' vezes a cada dois meses'
    when p_cadencia = 'trimestral' then p_lavagens || ' vezes a cada três meses'
    when p_cadencia = 'semestral' then p_lavagens || ' vezes por semestre'
    when p_cadencia = 'anual' then p_lavagens || ' vezes por ano'
    else p_lavagens || 'x ' || p_cadencia end;
$function$;


-- ----------------------------------------------------------------------------
-- 3) Nega para todos, libera nominalmente
--
-- O laço cobre toda função `sureya_*` que exista HOJE no banco, inclusive as
-- que nunca estiveram no repositório. É de propósito: escrever a lista à mão
-- deixaria de fora exatamente a função esquecida, que é a perigosa.
--
-- Funções de gatilho ficam de fora do `grant`: elas não podem ser chamadas
-- diretamente ("trigger functions can only be called as triggers"), então
-- privilégio nelas só serve para confundir quem for auditar depois.
-- ----------------------------------------------------------------------------
do $$
declare
  f record;
  -- As ÚNICAS chamadas com a chave anônima. Levantado de:
  --   src/app/api/portal/route.ts   → cabecalho, historico, irmaos
  --   src/app/api/avaliar/route.ts  → responder_avaliacao
  --   src/app/api/indicar/route.ts  → registrar_indicacao
  publicas text[] := array[
    'sureya_portal_cabecalho',
    'sureya_portal_historico',
    'sureya_portal_irmaos',
    'sureya_responder_avaliacao',
    'sureya_registrar_indicacao'
  ];
  assinatura text;
  n_revogadas int := 0;
  n_anon      int := 0;
begin
  for f in
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           (p.prorettype = 'pg_catalog.trigger'::regtype) as eh_gatilho
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'sureya\_%'
  loop
    assinatura := format('public.%I(%s)', f.proname, f.args);

    execute format('revoke execute on function %s from public, anon, authenticated;', assinatura);
    n_revogadas := n_revogadas + 1;

    if f.eh_gatilho then
      continue;   -- gatilho não se chama, não se concede
    end if;

    execute format('grant execute on function %s to authenticated, service_role;', assinatura);

    if f.proname = any(publicas) then
      execute format('grant execute on function %s to anon;', assinatura);
      n_anon := n_anon + 1;
    end if;
  end loop;

  raise notice 'sureya_*: % função(ões) revogada(s) de PUBLIC/anon; % liberada(s) para anon.',
    n_revogadas, n_anon;
end $$;

commit;


-- ============================================================================
-- CONFERÊNCIA DEPOIS DE RODAR
--
-- (a) Sobrou alguma função de dinheiro aberta para anônimo?
--     Esta consulta tem de voltar VAZIA.
--
--     select p.proname, r.rolname
--       from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--       cross join (values ('anon'),('public')) as r(rolname)
--      where n.nspname = 'public'
--        and p.proname like 'sureya\_%'
--        and p.proname not in ('sureya_portal_cabecalho','sureya_portal_historico',
--                              'sureya_portal_irmaos','sureya_responder_avaliacao',
--                              'sureya_registrar_indicacao')
--        and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
--
-- (b) O portal por QR continua abrindo? Abra um link /t/<token> real.
--     Se der erro de permissão, a função do portal ficou sem `anon`.
--
-- (c) A avaliação e a indicação continuam respondendo?
--
-- (d) `sureya_fechar_dia` ficou só com uma assinatura?
--     select pg_get_function_identity_arguments(oid)
--       from pg_proc where proname = 'sureya_fechar_dia';
--     → uma linha só, com `p_todos boolean DEFAULT false`.
--     Depois disso, o fallback de 4 argumentos em
--     src/app/api/campo/fechar-dia/route.ts:52 vira código morto e pode sair.
--
-- (e) Semanal voltou a replanejar?
--     select sureya_intervalo_dias('semanal', 1);    -- 7   (antes: 1, vindo do else 0)
--     select sureya_intervalo_dias('quinzenal', 1);  -- 15
--
-- (f) Rode a contraprova: npm run contraprova
--     Os itens de ANÔNIMO devem passar. Os de CAMPO ainda vão falhar — é a
--     0058 que fecha aquela porta.
-- ============================================================================
