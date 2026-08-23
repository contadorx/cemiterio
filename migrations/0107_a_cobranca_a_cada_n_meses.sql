-- 0107 — A COBRANÇA A CADA N MESES
--
-- O CASO REAL
--   "estava aqui em um exemplo que me pagou 4 meses em agosto, precisava
--    colocar as lavagens imediatas e a próxima cobrança em dezembro e a cada
--    4 meses, porém não tinha o período."
--
--   Não tinha porque não existe. `sureya_freq_pagamento` é um enum fechado:
--       mensal | trimestral | semestral | anual
--   Quatro meses não está lá. Nem dois, nem cinco. O vocabulário foi escrito
--   adivinhando o que as famílias fariam, e a primeira família real que
--   combinou outra coisa não coube.
--
-- POR QUE UM NÚMERO, E NÃO MAIS UM VALOR NO ENUM
--   Acrescentar `quadrimestral` resolve esta família e adia o problema até a
--   próxima combinar cinco meses. O conceito nunca foi um vocabulário — é
--   "a cada N meses". Um número não precisa prever nada.
--
--   (E `alter type ... add value` não pode ser USADO na mesma transação que o
--   cria, o que obrigaria a partir esta migration em duas só para conseguir
--   escrever o valor novo. O número dispensa isso também.)
--
-- ONDE ELE MORA
--   No TÚMULO, junto do resto do contrato. A D-24 já havia decidido: "as
--   informações de contrato, pagamento e lavagens devem ocorrer por túmulo,
--   pois tem famílias com N túmulos". A frequência era a última peça do
--   contrato que ainda morava na família — e por isso não aparecia na caixa do
--   túmulo, que é onde o usuário foi procurá-la.
--
--   `familias.freq_pagamento` continua valendo como PADRÃO da casa: enquanto o
--   túmulo não disser outra coisa, vale o combinado da família. Nulo aqui é
--   "segue a família", não "uma vez por mês" — a mesma distinção da chave de
--   fotos (0085) e dos lembretes (0096).

begin;

alter table tumulos add column if not exists meses_entre_cobrancas smallint;

comment on column tumulos.meses_entre_cobrancas is
  'De quantos em quantos meses este tumulo e cobrado. NULO = segue a freq_pagamento da familia.';

-- 1 a 24 meses. O teto não é burocracia: `proxima_cobranca` anda por este
-- número, e um valor absurdo empurraria a próxima cobrança para fora de
-- qualquer horizonte sem ninguém perceber que foi um erro de digitação.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tumulos_meses_entre_cobrancas_faixa') then
    alter table tumulos add constraint tumulos_meses_entre_cobrancas_faixa
      check (meses_entre_cobrancas is null
             or (meses_entre_cobrancas between 1 and 24));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- O COBRADOR PASSA A PERGUNTAR AO TÚMULO PRIMEIRO
-- ---------------------------------------------------------------------------
-- Uma linha muda: `v_meses`. O resto da 0104 continua igual — inclusive a
-- convergência e o laço que cobra mês a mês o que ficou para trás.
create or replace function public.sureya_cobrar_competencias(
  p_ate date default null, p_org uuid default null)
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
           t.meses_entre_cobrancas,
           f.freq_pagamento::text as freq
      from tumulos t
      join familias f on f.id = t.familia_id
     where t.org_id = v_org
       and t.contratado
       and t.familia_id is not null
       and coalesce(t.valor_mensal, 0) > 0
       and t.proxima_cobranca is not null
       and t.proxima_cobranca <= v_ate
  loop
    -- O TÚMULO MANDA; a família é o padrão (0107).
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

revoke all on function public.sureya_cobrar_competencias(date, uuid) from public, anon, authenticated;
grant execute on function public.sureya_cobrar_competencias(date, uuid) to service_role;

commit;
