-- ============================================================================
-- 0146 — O COMPROVANTE ALCANCA VARIOS JAZIGOS, E SO OS DA FAMILIA
-- ============================================================================
--
-- DUAS COISAS, E A SEGUNDA E UMA TRAVA QUE FALTAVA.
--
-- 1. VARIOS JAZIGOS NUM PAGAMENTO SO
--
--    A Katia e responsavel dos Tonellotti e a familia tem DOIS jazigos
--    (Q3-R10-001 "Mendes" e Q2-R2-005). Um Pix dela pode cobrir os dois, e a
--    0144 so aceitava um `p_tumulo`. Agora aceita `p_tumulos`, e o valor de
--    cada competencia se divide entre eles — com o centavo da divisao indo
--    para o ultimo, para a soma bater com o comprovante.
--
-- 2. JAZIGO DE OUTRA FAMILIA E RECUSADO
--
--    `sureya_lancar` deduz a familia do PAGADOR (`clientes.familia_id`) e
--    aceitava `p_tumulo` sem conferir de quem ele e. Dava para gravar uma linha
--    com familia = A e jazigo = B: o dinheiro ficava no razao de uma familia
--    apontando para o jazigo de outra, e NENHUMA das duas telas mostrava a
--    verdade.
--
--    Medido em 29/08: 81 lancamentos com jazigo, ZERO com familia divergente.
--    Nada estava errado ainda — mas nada impedia, e o comprovante da Katia
--    (numa "Familia Katia" vazia, com os jazigos na Tonellotti) seria o
--    primeiro. A mensagem do erro diz o que fazer: juntar os cadastros antes.
--
-- A ASSINATURA ANTIGA (sem p_tumulos) FOI REMOVIDA de proposito. Deixar as
-- duas faria o Postgres escolher por tipo, e uma chamada que esquecesse o
-- parametro novo cairia calada na versao que nao confere a familia — que e a
-- trava que esta migration veio criar.
--
-- NADA AQUI ENVIA NADA, e nenhum dado foi tocado.
-- ============================================================================

create or replace function sureya_conciliar_comprovante_meses(
  p_comprovante  uuid,
  p_competencias date[],
  p_org          uuid    default null,
  p_valor        numeric default null,
  p_data         date    default null,
  -- Fica por compatibilidade: um jazigo so continua valendo.
  p_tumulo       uuid    default null,
  p_ensaio       boolean default false,
  -- VARIOS JAZIGOS. A Katia e responsavel dos Tonellotti e a familia tem DOIS.
  p_tumulos      uuid[]  default null
)
returns table (competencia date, valor numeric, cobria_divida boolean, tumulo_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_comp    record;
  v_valor   numeric;
  v_data    date;
  v_familia uuid;
  v_meses   date[];
  v_tums    uuid[];
  v_alvos   numeric[];
  v_conhec  numeric := 0;
  v_ndesc   int     := 0;
  v_cota    numeric := 0;
  v_resto   numeric;
  v_i       int;
  v_j       int;
  v_n       int;
  v_nt      int;
  v_parte   numeric;
  v_pedaco  numeric;
  v_texto   text;
  v_tum     uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_org' using hint = 'Sem sessao do painel: passe p_org.';
  end if;

  select * into v_comp from comprovantes c
   where c.id = p_comprovante and c.org_id = v_org;
  if not found then
    raise exception 'comprovante nao encontrado nesta org';
  end if;

  v_valor := coalesce(p_valor, v_comp.valor_extraido);
  v_data  := coalesce(p_data, v_comp.data_extraida, current_date);

  if coalesce(v_valor, 0) <= 0 then
    raise exception 'valor_invalido' using
      hint = 'Comprovante conferido com R$ 0,00 parece pagamento registrado.';
  end if;
  if v_comp.cliente_id is null then
    raise exception 'comprovante_sem_familia' using
      hint = 'Este comprovante nao esta ligado a ninguem.';
  end if;

  select c.familia_id into v_familia from clientes c where c.id = v_comp.cliente_id;
  if v_familia is null then raise exception 'cliente_sem_familia'; end if;

  select array_agg(m order by m) into v_meses
    from (select distinct date_trunc('month', x)::date m
            from unnest(coalesce(p_competencias, '{}'::date[])) x) s;

  if v_meses is null or array_length(v_meses, 1) is null then
    raise exception 'sem_competencia' using
      hint = 'Diga a que meses este pagamento se refere.';
  end if;

  select array_agg(distinct t) into v_tums
    from unnest(coalesce(p_tumulos, case when p_tumulo is null then '{}'::uuid[]
                                         else array[p_tumulo] end)) t;

  -- ------------------------------------------------------------------------
  -- O JAZIGO TEM DE SER DESTA FAMILIA.
  --
  -- `sureya_lancar` deduz a familia do PAGADOR e aceitava `p_tumulo` sem
  -- conferir de quem ele e. Dava para gravar familia = A com jazigo = B: o
  -- dinheiro no razao de uma e apontando para o jazigo de outra, e nenhuma das
  -- duas telas mostrando a verdade.
  --
  -- Medido em 29/08: 81 lancamentos com jazigo, ZERO divergentes. Nada estava
  -- errado — mas nada impedia. A mensagem diz o conserto certo: juntar os
  -- cadastros repetidos primeiro.
  -- ------------------------------------------------------------------------
  if v_tums is not null and array_length(v_tums, 1) > 0 then
    if exists (
      select 1 from unnest(v_tums) u(id)
       left join tumulos t on t.id = u.id and t.org_id = v_org
       where t.id is null or t.familia_id is distinct from v_familia
    ) then
      raise exception 'jazigo_de_outra_familia' using
        hint = 'Um dos jazigos apontados nao e desta familia. '
             || 'Junte os cadastros repetidos antes, ou escolha outro jazigo.';
    end if;
  end if;

  if exists (
    select 1 from conta_corrente cc
     where cc.comprovante_id = p_comprovante and cc.org_id = v_org
       and cc.status_conc = 'confirmado'
  ) then
    raise exception 'comprovante_ja_conferido' using
      hint = 'Este comprovante ja virou credito. Estorne antes de refazer.';
  end if;

  v_n  := array_length(v_meses, 1);
  v_nt := coalesce(array_length(v_tums, 1), 0);
  v_alvos := array_fill(null::numeric, array[v_n]);

  for v_i in 1 .. v_n loop
    select sum(cc.valor) into v_parte
      from conta_corrente cc
     where cc.org_id = v_org
       and cc.familia_id = v_familia
       and cc.tipo = 'debito'
       and cc.origem = 'competencia'
       and cc.competencia = v_meses[v_i]
       and (v_nt = 0 or cc.tumulo_id = any(v_tums));

    if coalesce(v_parte, 0) > 0 then
      v_alvos[v_i] := v_parte;
      v_conhec := v_conhec + v_parte;
    else
      v_ndesc := v_ndesc + 1;
    end if;
  end loop;

  if v_ndesc > 0 then
    v_cota := round(greatest(v_valor - v_conhec, 0) / v_ndesc, 2);
  end if;

  v_resto := v_valor;

  for v_i in 1 .. v_n loop
    v_parte := round(least(coalesce(v_alvos[v_i], v_cota), v_resto), 2);

    if v_i = v_n and coalesce(v_alvos[v_i], v_cota) >= v_resto then
      v_parte := round(v_resto, 2);
    end if;

    if v_parte > 0 then
      if v_nt <= 1 then
        v_tum := case when v_nt = 1 then v_tums[1] else null end;

        competencia := v_meses[v_i]; valor := v_parte;
        cobria_divida := v_alvos[v_i] is not null; tumulo_id := v_tum;

        if not p_ensaio then
          v_texto := 'Pagamento conferido - ' || to_char(v_meses[v_i], 'MM/YYYY')
                     || case when v_n > 1 then ' (parte de ' || v_n || ' meses)' else '' end;
          perform sureya_lancar(
            p_cliente := v_comp.cliente_id, p_tipo := 'credito', p_valor := v_parte,
            p_origem := 'pagamento', p_descricao := v_texto, p_data := v_data,
            p_status := 'confirmado', p_comprovante := p_comprovante,
            p_tumulo := v_tum, p_competencia := v_meses[v_i], p_org := v_org);
        end if;
        return next;
      else
        -- O MES SE DIVIDE ENTRE OS JAZIGOS, e o centavo da divisao vai para o
        -- ultimo: a soma das linhas TEM de bater com o comprovante.
        for v_j in 1 .. v_nt loop
          v_pedaco := round(v_parte / v_nt, 2);
          if v_j = v_nt then
            v_pedaco := round(v_parte - round(v_parte / v_nt, 2) * (v_nt - 1), 2);
          end if;
          if v_pedaco > 0 then
            competencia := v_meses[v_i]; valor := v_pedaco;
            cobria_divida := v_alvos[v_i] is not null; tumulo_id := v_tums[v_j];

            if not p_ensaio then
              v_texto := 'Pagamento conferido - ' || to_char(v_meses[v_i], 'MM/YYYY')
                         || ' (parte de ' || v_nt || ' jazigos)';
              perform sureya_lancar(
                p_cliente := v_comp.cliente_id, p_tipo := 'credito', p_valor := v_pedaco,
                p_origem := 'pagamento', p_descricao := v_texto, p_data := v_data,
                p_status := 'confirmado', p_comprovante := p_comprovante,
                p_tumulo := v_tums[v_j], p_competencia := v_meses[v_i], p_org := v_org);
            end if;
            return next;
          end if;
        end loop;
      end if;

      v_resto := round(v_resto - v_parte, 2);
    end if;

    exit when v_resto <= 0;
  end loop;

  if v_resto > 0 then
    competencia := date_trunc('month', v_data)::date; valor := v_resto;
    cobria_divida := false; tumulo_id := null;

    if not p_ensaio then
      perform sureya_lancar(
        p_cliente := v_comp.cliente_id, p_tipo := 'credito', p_valor := v_resto,
        p_origem := 'pagamento',
        p_descricao := 'Adiantamento - sobra do pagamento de ' || to_char(v_data, 'DD/MM/YYYY'),
        p_data := v_data, p_status := 'confirmado', p_comprovante := p_comprovante,
        p_competencia := date_trunc('month', v_data)::date, p_org := v_org);
    end if;
    return next;
  end if;

  if not p_ensaio then
    delete from conta_corrente cc
     where cc.comprovante_id = p_comprovante and cc.org_id = v_org
       and cc.status_conc = 'a_conferir';

    update comprovantes c
       set status = 'confirmado', valor_extraido = v_valor, data_extraida = v_data
     where c.id = p_comprovante and c.org_id = v_org;
  end if;

  return;
end $$;

comment on function sureya_conciliar_comprovante_meses(uuid, date[], uuid, numeric, date, uuid, boolean, uuid[]) is
  'Confere um comprovante repartindo-o entre varias competencias e varios jazigos (0146). p_ensaio calcula sem escrever.';

revoke execute on function sureya_conciliar_comprovante_meses(uuid, date[], uuid, numeric, date, uuid, boolean, uuid[])
  from public, anon;
grant  execute on function sureya_conciliar_comprovante_meses(uuid, date[], uuid, numeric, date, uuid, boolean, uuid[])
  to authenticated, service_role;

-- A ASSINATURA ANTIGA SAI. Deixar as duas faria o Postgres escolher por tipo, e
-- uma chamada que esquecesse `p_tumulos` cairia calada na versao que NAO
-- confere a familia do jazigo — a trava que esta migration veio criar.
drop function if exists sureya_conciliar_comprovante_meses(uuid, date[], uuid, numeric, date, uuid, boolean);
