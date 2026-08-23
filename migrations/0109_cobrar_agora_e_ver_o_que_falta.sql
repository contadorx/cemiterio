-- 0109 — COBRAR AGORA, E VER O QUE FALTA LANÇAR
--
-- O CASO
--   "cadastrei uma pessoa para cobrança desde julho pois ela me pagou em
--    junho, então está inadimplente, mas o sistema colocou em dia... entendo
--    que deveria estar no conta corrente os dois meses atrasados, julho e
--    agosto."
--
--   Está certíssimo. Medido na família Cordeiro em 23/08:
--     contratado · R$ 30/mês · próxima cobrança 01/07/2026 · 0 lançamentos
--   Ensaiado e desfeito: o cobrador lançaria 07/2026 R$30 + 08/2026 R$30 = R$60.
--
--   O cadastro está certo. O motor está certo. **Não existe caminho para ele
--   rodar quando a pessoa precisa** — `sureya_cobrar_competencias` só é chamada
--   pelo cron diário. Quem configura a cobrança hoje descobre amanhã se
--   acertou, e enquanto isso a tela diz "Em dia".
--
-- "EM DIA" ERA UMA AFIRMAÇÃO FALSA
--   O saldo estava zerado porque nada foi lançado — e a tela leu zero como
--   "quitado". São coisas diferentes: *não dever* e *ainda não ter sido
--   cobrado*. Uma família que deve dois meses aparecia igualzinha a uma que
--   pagou tudo, e a inadimplência ficava invisível justamente onde se olha.
--
-- DUAS PEÇAS
--   1. o cobrador aceita UMA família — para o botão da ficha agir só ali
--   2. uma função que RESPONDE o que falta lançar sem lançar nada, para a tela
--      poder avisar antes de alguém mandar cobrar

begin;

-- ---------------------------------------------------------------------------
-- 1. COBRAR — agora com alvo
-- ---------------------------------------------------------------------------
-- ⚠ A VERSÃO DE DOIS PARÂMETROS PRECISA CAIR.
--
-- `create or replace` com um parâmetro a mais NÃO substitui: cria uma
-- SOBRECARGA e deixa a antiga de pé. Ficariam duas funções chamadas
-- `sureya_cobrar_competencias`, uma sabendo filtrar por família e a outra não
-- — e uma chamada com dois argumentos cairia calada na versão velha, cobrando
-- a casa inteira quando o botão pediu uma família só.
--
-- Duas definições da mesma cobrança é o defeito que este projeto mais repete.
-- Derruba-se a antiga ANTES de criar a nova.
drop function if exists public.sureya_cobrar_competencias(date, uuid);

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
  v_meses int; v_valor numeric; v_comp date; v_andou boolean; v_entrou int;
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
           t.meses_entre_cobrancas, f.freq_pagamento::text as freq
      from tumulos t
      join familias f on f.id = t.familia_id
     where t.org_id = v_org
       and t.contratado
       and t.familia_id is not null
       and coalesce(t.valor_mensal, 0) > 0
       and t.proxima_cobranca is not null
       and t.proxima_cobranca <= v_ate
       -- NULO = a casa inteira (o cron). Preenchido = só esta familia (o botao).
       and (p_familia is null or t.familia_id = p_familia)
  loop
    v_meses := coalesce(r.meses_entre_cobrancas, sureya_meses_da_cobranca(r.freq));
    v_valor := round(r.valor_mensal * v_meses, 2);
    v_comp  := date_trunc('month', r.proxima_cobranca)::date;
    v_andou := false;

    while v_comp <= date_trunc('month', v_ate)::date loop
      insert into conta_corrente
        (org_id, familia_id, cliente_id, tumulo_id, tipo, origem,
         competencia, valor, descricao, data, canal)
      select v_org, r.familia_id, f.responsavel_id, r.id, 'debito', 'competencia',
             v_comp, v_valor,
             'Contrato · ' || to_char(v_comp, 'MM/YYYY')
               || coalesce(' · ' || r.identificacao, '')
               || case when v_meses > 1 then ' (' || v_meses || ' meses)' else '' end,
             v_comp, 'automatico'
        from familias f where f.id = r.familia_id
      on conflict do nothing;

      get diagnostics v_entrou = row_count;
      if v_entrou > 0 then
        v_lanc := v_lanc + 1;
        v_total := v_total + v_valor;
      end if;

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
-- 2. O QUE FALTA LANÇAR — sem lançar
-- ---------------------------------------------------------------------------
-- A tela precisa avisar ANTES: "esta família tem 2 competências a lançar,
-- R$ 60". Uma prévia que cobra não é prévia, e abrir uma ficha nunca pode
-- criar dívida — por isso a conta vive separada do cobrador.
create or replace function public.sureya_cobrancas_a_lancar(
  p_familia uuid, p_ate date default null)
returns table(competencias integer, valor numeric, desde date)
language sql
stable
security definer
set search_path to 'public'
as $$
  with alvo as (
    select t.id, t.valor_mensal, t.proxima_cobranca,
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
  -- Quantos ciclos cabem entre a próxima cobrança e hoje. É a MESMA conta do
  -- laço do cobrador: se as duas divergirem, a tela promete um número e o
  -- botão entrega outro — o defeito que este projeto mais repete.
  ciclos as (
    select a.id, a.valor_mensal, a.meses, a.proxima_cobranca,
           floor(
             (extract(year  from age(date_trunc('month', coalesce(p_ate, current_date)),
                                     date_trunc('month', a.proxima_cobranca))) * 12
            + extract(month from age(date_trunc('month', coalesce(p_ate, current_date)),
                                     date_trunc('month', a.proxima_cobranca))))
             / a.meses
           )::int + 1 as quantos
      from alvo a
  )
  select coalesce(sum(c.quantos), 0)::int,
         coalesce(sum(c.quantos * round(c.valor_mensal * c.meses, 2)), 0),
         min(c.proxima_cobranca)
    from ciclos c;
$$;

revoke all on function public.sureya_cobrar_competencias(date, uuid, uuid) from public, anon;
revoke all on function public.sureya_cobrancas_a_lancar(uuid, date) from public, anon;
grant execute on function public.sureya_cobrar_competencias(date, uuid, uuid) to authenticated, service_role;
grant execute on function public.sureya_cobrancas_a_lancar(uuid, date) to authenticated, service_role;

commit;
