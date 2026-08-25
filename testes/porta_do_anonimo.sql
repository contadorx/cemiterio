-- ============================================================================
-- A PORTA DO ANONIMO (0129)
--
-- Este arquivo nao verifica uma funcao: verifica uma REGRA, contra todas as
-- funcoes que existirem no dia em que ele rodar. E de proposito.
--
-- O defeito de 24/08 nao foi alguem escrever `grant execute to anon`. Foi
-- ninguem escrever `revoke` — o Supabase concede EXECUTE a anon por padrao em
-- `public`, entao toda migration que cria funcao e nao revoga PUBLICA a funcao.
-- Um teste que conferisse uma lista fixa nao pegaria a proxima.
--
-- A licao da 0079, que ja estava escrita neste repositorio:
--   "SECURITY DEFINER ignora RLS — so o GRANT EXECUTE protege."
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------------------------------------------------------------------------
-- A LISTA DO QUE PODE — curta, e cada linha com o motivo escrito
-- ---------------------------------------------------------------------------
create temporary table anonimo_pode (nome text primary key, porque text);
insert into anonimo_pode values
 ('sureya_portal_cabecalho',  'o portal da familia e anonimo por token — e o desenho'),
 ('sureya_portal_historico',  'idem'),
 ('sureya_portal_irmaos',     'idem'),
 ('sureya_primeiro_nome',     'conta pura sobre um texto que veio de quem chamou'),
 ('sureya_nome_proprio',      'idem: arruma maiuscula de um texto, sem ler nada do banco'),
 ('sureya_data_no_ano',       'conta pura de data'),
 ('sureya_lavagens_no_mes',   'conta pura sobre uma periodicidade'),
 ('sureya_meses_da_cobranca', 'conta pura sobre uma frequencia'),
 ('sureya_proxima_data_extra','conta pura de calendario');

do $$
declare
  v_lista text;
  v_n     int;
begin
  select count(*), string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                              E'\n    ' order by p.proname)
    into v_n, v_lista
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname like 'sureya%'
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     -- funcao de gatilho nao e exposta pelo PostgREST: nao ha por onde chamar
     and pg_get_function_result(p.oid) <> 'trigger'
     and p.proname not in (select nome from anonimo_pode);

  if v_n > 0 then
    raise exception E'ANONIMO FALHOU — % funcao(oes) abertas ao anonimo sem motivo declarado:\n    %\n\n'
      'A chave anonima e PUBLICA: vai no pacote do navegador. Funcao security '
      'definer NAO passa pela RLS — o GRANT e o unico cadeado (0079). Se a '
      'funcao nova deve mesmo ser publica, declare-a em anonimo_pode com o '
      'motivo. Se nao, ponha na migration:\n'
      '    revoke execute on function <nome>(<args>) from anon, public;',
      v_n, v_lista;
  end if;
  raise notice '  ok  nenhuma funcao aberta ao anonimo alem das % declaradas', (select count(*) from anonimo_pode);
end $$;

-- ---------------------------------------------------------------------------
-- E AS QUE MEXEM EM DINHEIRO, UMA A UMA, PELO NOME
-- ---------------------------------------------------------------------------
-- A regra de cima ja pegaria estas. Elas aparecem outra vez, nomeadas, porque
-- uma linha distraida em `anonimo_pode` desligaria a guarda geral em silencio —
-- e estas sao as que escrevem dinheiro.
do $$
declare r record;
begin
  for r in
    select p.proname
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
     where p.proname in ('sureya_registrar_pagamento','sureya_importar_extrato',
                         'sureya_classificar_saidas','sureya_pagamento_avulso',
                         'sureya_registrar_pagamento_manual','sureya_lancar',
                         'sureya_concluir_lavagem','sureya_limpar_eventos_webhook')
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    raise exception 'ANONIMO FALHOU — % mexe em dinheiro ou apaga, e o anonimo pode chamar', r.proname;
  end loop;
  raise notice '  ok  nenhuma funcao de dinheiro ou de apagar aberta ao anonimo';
end $$;

-- ---------------------------------------------------------------------------
-- A RLS CONTINUA SENDO O QUE SEGURA AS TABELAS
-- ---------------------------------------------------------------------------
-- O anonimo tem SELECT em quase toda tabela, e isso esta certo: a RLS e o
-- portao. Se uma tabela perder a RLS, o grant vira leitura aberta.
do $$
declare v text;
begin
  select string_agg(c.relname, ', ')
    into v
    from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
   where c.relkind = 'r'
     and (not c.relrowsecurity
          or not exists (select 1 from pg_policy p where p.polrelid = c.oid));
  if v is not null then
    raise exception 'ANONIMO FALHOU — tabela sem RLS ou sem politica: %', v;
  end if;
  raise notice '  ok  toda tabela tem RLS ligada e ao menos uma politica';
end $$;

drop table anonimo_pode;
