-- 0112 — UMA COMPETÊNCIA POR MÊS DO PERÍODO, E O PÓS-PAGO
--
-- O CASO
--   "ela pagou em junho no fim do período e agora ela paga em dezembro, mas
--    após serviço. O cadastro está correto?"
--
--   O ritmo estava. Em 01/12 sairiam R$ 240 (6 × R$ 40) e a próxima iria para
--   junho/2027 — semestre certo, valor certo. Duas coisas estavam erradas:
--
--   1. A COMPETÊNCIA. Os R$ 240 entravam como UMA linha de competência
--      12/2026, mas cobrem julho a dezembro. No Painel do mês, julho a
--      novembro apareciam com R$ 0 dessa família e dezembro com R$ 240: seis
--      meses de receita empilhados num mês só. A regra do painel é "receita da
--      competência = o mês a que a cobrança se refere" — e ela se referia a
--      seis.
--
--   2. QUANDO O PERÍODO ACONTECE. O cobrador assumia PRÉ-PAGO sem dizer:
--      cobra em P e anda N meses, logo o período seria P..P+N-1. A Anninha
--      paga DEPOIS do serviço, então o período dela é P-N+1..P. As duas
--      leituras dão o mesmo ritmo e meses DIFERENTES — e nada no cadastro
--      dizia qual era. Funcionava por coincidência.
--
-- O QUE MUDA
--   O ciclo deixa de virar UM lançamento e passa a virar N: uma competência
--   por mês, cada uma no valor mensal, todas com o mesmo vencimento (a data da
--   cobrança). Some a distorção do painel, a inadimplência passa a aparecer
--   mês a mês, e o extrato diz de que mês é cada real.
--
--   Para contrato mensal (N = 1) nada muda: um ciclo, uma competência.

begin;

-- ---------------------------------------------------------------------------
-- PAGA ANTES OU DEPOIS DO SERVIÇO
-- ---------------------------------------------------------------------------
-- Falso = pré-pago (cobra e depois entrega), o que o sistema fazia calado.
-- Verdadeiro = pós-pago: o período TERMINA na data da cobrança.
alter table tumulos add column if not exists cobranca_no_fim boolean not null default false;

comment on column tumulos.cobranca_no_fim is
  'Verdadeiro quando a familia paga DEPOIS do servico: o periodo termina na data da cobranca (P-N+1..P). Falso = pre-pago (P..P+N-1).';

-- ---------------------------------------------------------------------------
-- O COBRADOR
-- ---------------------------------------------------------------------------
create or replace function public.sureya_cobrar_competencias(
  p_ate date default null, p_org uuid default null, p_familia uuid default null)
returns table(lancados integer, valor_total numeric, tumulos_tocados integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_ate date; r record;
  v_lanc int := 0; v_total numeric := 0; v_toc int := 0;
  v_meses int; v_comp date; v_andou boolean; v_entrou int;
  v_ini date; v_mes date; i int; v_rotulo text;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using
      errcode = '42501',
      hint = 'Sem sessao do painel: passe p_org (e o cron sempre passa).';
  end if;
  v_ate := coalesce(p_ate, current_date);

  for r in
    select t.id, t.familia_id, t.valor_mensal, t.proxima_cobranca, t.identificacao,
           t.meses_entre_cobrancas, t.cobranca_no_fim,
           f.freq_pagamento::text as freq
      from tumulos t
      join familias f on f.id = t.familia_id
     where t.org_id = v_org
       and t.contratado
       and t.familia_id is not null
       and coalesce(t.valor_mensal, 0) > 0
       and t.proxima_cobranca is not null
       and t.proxima_cobranca <= v_ate
       and (p_familia is null or t.familia_id = p_familia)
  loop
    v_meses := coalesce(r.meses_entre_cobrancas, sureya_meses_da_cobranca(r.freq));
    v_comp  := date_trunc('month', r.proxima_cobranca)::date;
    v_andou := false;

    -- Cada volta do laço é UM CICLO de cobrança. O laço externo existe para a
    -- casa que passou meses sem rodar: cada ciclo atrasado sai inteiro, com as
    -- suas competências, em vez de virar um valor só com a data de hoje.
    while v_comp <= date_trunc('month', v_ate)::date loop

      -- ONDE O PERÍODO COMEÇA.
      --   pós-pago  o período TERMINA na cobrança:  P-N+1 .. P
      --   pré-pago  o período COMEÇA na cobrança:   P     .. P+N-1
      -- Mesmo ritmo, meses diferentes — e era isto que não estava escrito em
      -- lugar nenhum.
      v_ini := case when r.cobranca_no_fim
                    then (v_comp - ((v_meses - 1) || ' months')::interval)::date
                    else v_comp end;

      v_rotulo := case
        when v_meses = 1 then to_char(v_ini, 'MM/YYYY')
        else to_char(v_ini, 'MM/YYYY') || ' a '
             || to_char((v_ini + ((v_meses - 1) || ' months')::interval)::date, 'MM/YYYY')
      end;

      -- UMA LINHA POR MÊS DO PERÍODO. Antes era uma só, com o valor cheio, e
      -- a receita de seis meses caía num mês.
      for i in 0 .. (v_meses - 1) loop
        v_mes := (v_ini + (i || ' months')::interval)::date;

        insert into conta_corrente
          (org_id, familia_id, cliente_id, tumulo_id, tipo, origem,
           competencia, valor, descricao, data, canal)
        select v_org, r.familia_id, f.responsavel_id, r.id, 'debito', 'competencia',
               v_mes, round(r.valor_mensal, 2),
               'Contrato · ' || to_char(v_mes, 'MM/YYYY')
                 || coalesce(' · ' || r.identificacao, '')
                 || case when v_meses > 1
                         then ' (parte de ' || v_rotulo || ', vence em '
                              || to_char(v_comp, 'MM/YYYY') || ')'
                         else '' end,
               -- O VENCIMENTO É O DA COBRANÇA, não o do mês. É dele que a
               -- régua conta os degraus: as seis linhas vencem juntas.
               v_comp, 'automatico'
          from familias f where f.id = r.familia_id
        on conflict do nothing;

        get diagnostics v_entrou = row_count;
        if v_entrou > 0 then
          v_lanc := v_lanc + 1;
          v_total := v_total + round(r.valor_mensal, 2);
        end if;
      end loop;

      v_comp := (v_comp + (v_meses || ' months')::interval)::date;
      v_andou := true;
    end loop;

    if v_andou then
      update tumulos set proxima_cobranca = v_comp where id = r.id;
      v_toc := v_toc + 1;
    end if;
  end loop;

  return query select v_lanc, v_total, v_toc;
end $$;

-- ---------------------------------------------------------------------------
-- A PRÉVIA ACOMPANHA
-- ---------------------------------------------------------------------------
-- Ela promete o que o botão entrega. Se as duas divergirem, a tela diz "2
-- competências" e o botão lança 12 — o defeito que este projeto mais repete.
create or replace function public.sureya_cobrancas_a_lancar(
  p_familia uuid, p_ate date default null)
returns table(competencias integer, valor numeric, desde date)
language sql
stable
security definer
set search_path to 'public'
as $$
  with alvo as (
    select t.id, t.valor_mensal, t.proxima_cobranca, t.cobranca_no_fim,
           coalesce(t.meses_entre_cobrancas,
                    sureya_meses_da_cobranca(f.freq_pagamento::text)) as meses
      from tumulos t
      join familias f on f.id = t.familia_id
     where t.familia_id = p_familia
       and t.contratado
       and coalesce(t.valor_mensal, 0) > 0
       and t.proxima_cobranca is not null
       and t.proxima_cobranca <= coalesce(p_ate, current_date)
  ),
  ciclos as (
    select a.*,
           floor(
             (extract(year  from age(date_trunc('month', coalesce(p_ate, current_date)),
                                     date_trunc('month', a.proxima_cobranca))) * 12
            + extract(month from age(date_trunc('month', coalesce(p_ate, current_date)),
                                     date_trunc('month', a.proxima_cobranca))))
             / a.meses)::int + 1 as quantos_ciclos
      from alvo a
  )
  select
    -- CADA CICLO VIRA `meses` LINHAS agora, não uma.
    coalesce(sum(c.quantos_ciclos * c.meses), 0)::int,
    coalesce(sum(c.quantos_ciclos * c.meses * round(c.valor_mensal, 2)), 0),
    -- O primeiro mês que entra: no pós-pago o período começa antes da data da
    -- cobrança, e dizer "desde dezembro" para quem vai receber julho mente.
    min(case when c.cobranca_no_fim
             then (date_trunc('month', c.proxima_cobranca)
                   - ((c.meses - 1) || ' months')::interval)::date
             else date_trunc('month', c.proxima_cobranca)::date end)
    from ciclos c;
$$;

revoke all on function public.sureya_cobrar_competencias(date, uuid, uuid) from public, anon;
revoke all on function public.sureya_cobrancas_a_lancar(uuid, date) from public, anon;
grant execute on function public.sureya_cobrar_competencias(date, uuid, uuid) to authenticated, service_role;
grant execute on function public.sureya_cobrancas_a_lancar(uuid, date) to authenticated, service_role;

commit;
