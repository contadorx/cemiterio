-- 0103 — O MOTOR DE MEMÓRIA PRECISA RODAR NO CRON
--
-- O BLOQUEIO
--   A 0096 escreveu o motor inteiro — as quatro supressões obrigatórias, o
--   agrupamento por túmulo, a biblioteca de textos — e ele nunca rodou. Não
--   por acaso: **ele não consegue rodar onde precisa rodar**.
--
--   As duas funções abrem assim:
--
--       v_org := current_org_id();
--       if v_org is null then raise exception 'sem_org'; end if;
--
--   e `current_org_id()` é `select org_id from membros where user_id =
--   auth.uid()`. Numa sessão do painel isso resolve. **Num cron não**: o job
--   roda com a service role, `auth.uid()` é nulo, e a chamada morre em
--   `sem_org` antes da primeira linha de trabalho.
--
--   Ou seja: o motor foi escrito para uma sessão e a especificação o agendou
--   para um cron — "job diário 06:00 America/Sao_Paulo". Enquanto isso não se
--   encontrar, não existe produto de memória; existe código.
--
--   (O erro é ALTO, e isso é bom: a etapa do cron falharia e apareceria em
--   `erros_log`. O problema não é o silêncio — é que não há caminho nenhum.)
--
-- A CORREÇÃO
--   As duas passam a aceitar `p_org`, e a resolução vira explícita:
--
--       v_org := coalesce(p_org, current_org_id());
--
--   O painel segue chamando sem parâmetro e nada muda para ele. O cron passa a
--   organização e o motor roda. A exceção continua de pé para o caso de não
--   haver nenhuma das duas — só ganhou um nome que diz o que fazer.
--
-- POR QUE SUBSTITUIÇÃO DE TEXTO, E NÃO REESCREVER
--   O corpo das duas soma ~10 KB de regra de luto, frequência e agrupamento,
--   já revisada. Recopiá-la para mudar duas linhas é a chance de introduzir
--   uma diferença que ninguém vê. A troca é cirúrgica e **falha alto** se o
--   alvo não estiver lá — sem isso a migration poderia "passar" sem ter
--   mudado nada, que é a pior forma de conserto.

begin;

do $migra$
declare
  v_alvos text[] := array[
    'public.sureya_gerar_eventos_memoria(integer)',
    'public.sureya_lembretes_do_dia(date)'
  ];
  v_assinaturas text[] := array[
    'sureya_gerar_eventos_memoria(p_dias_a_frente integer DEFAULT 400)',
    'sureya_lembretes_do_dia(p_dia date DEFAULT NULL::date)'
  ];
  v_novas text[] := array[
    'sureya_gerar_eventos_memoria(p_dias_a_frente integer DEFAULT 400, p_org uuid DEFAULT NULL)',
    'sureya_lembretes_do_dia(p_dia date DEFAULT NULL::date, p_org uuid DEFAULT NULL)'
  ];
  -- As DUAS linhas juntas, para não sobrar uma checagem órfã logo abaixo da
  -- nova: código morto num motor de luto é o tipo de coisa que confunde quem
  -- vier depois justamente na hora de mexer com cuidado.
  v_velho text :=
    'v_org := current_org_id();' || e'\n' ||
    '  if v_org is null then raise exception ''sem_org''; end if;';
  v_novo_bloco text :=
    'v_org := coalesce(p_org, current_org_id());' || e'\n' ||
    '  if v_org is null then' || e'\n' ||
    '    raise exception ''sem_organizacao'' using' || e'\n' ||
    '      errcode = ''42501'',' || e'\n' ||
    '      hint = ''Sem sessao do painel: passe p_org (e o cron sempre passa).'';' || e'\n' ||
    '  end if;';
  v_src text;
  v_novo text;
  i int;
begin
  for i in 1 .. array_length(v_alvos, 1) loop
    v_src := pg_get_functiondef(v_alvos[i]::regprocedure);

    -- 1) a função passa a aceitar a organização por parâmetro
    v_novo := replace(v_src, v_assinaturas[i], v_novas[i]);
    if v_novo = v_src then
      raise exception 'ASSINATURA NAO ENCONTRADA em %: [%]', v_alvos[i], v_assinaturas[i];
    end if;

    -- 2) e a resolve aceitando o parâmetro antes da sessão
    v_src := v_novo;
    v_novo := replace(v_src, v_velho, v_novo_bloco);
    if v_novo = v_src then
      raise exception 'ALVO NAO ENCONTRADO em %: o par [v_org := current_org_id(); + checagem]', v_alvos[i];
    end if;

    -- Trocar o número de parâmetros exige derrubar: CREATE OR REPLACE não muda
    -- assinatura. Ninguém chama estas duas ainda (medido em 23/08: zero
    -- eventos, nenhum arquivo do app as cita), então não há dependência a
    -- quebrar — e é por isso que a hora de arrumar é agora, antes do primeiro
    -- lembrete existir.
    execute 'drop function ' || v_alvos[i];
    execute v_novo;
  end loop;
end $migra$;

-- ---------------------------------------------------------------------------
-- QUEM PODE CHAMAR
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER ignora RLS: quem protege é o GRANT. Com `p_org` a função
-- passou a aceitar a organização de fora, então deixá-la aberta a
-- `authenticated` permitiria a um membro de uma casa gerar e enfileirar
-- lembretes na casa de outra — a RLS não seguraria, porque a função é
-- definer. O painel não precisa disso: quem chama é o cron, pela service role.
revoke all on function public.sureya_gerar_eventos_memoria(integer, uuid) from public, anon, authenticated;
revoke all on function public.sureya_lembretes_do_dia(date, uuid) from public, anon, authenticated;
grant execute on function public.sureya_gerar_eventos_memoria(integer, uuid) to service_role;
grant execute on function public.sureya_lembretes_do_dia(date, uuid) to service_role;

commit;
