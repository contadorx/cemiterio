-- ============================================================================
-- 0144 — UM PAGAMENTO COBRE VARIOS MESES
-- ============================================================================
--
-- O QUE SE MEDIU EM 29/08, EM PRODUCAO
--
--   6  comprovantes esperando conferencia, R$ 490 no total
--   6  ja carimbados com a competencia AGOSTO/2026 — todos
--   0  com tumulo apontado
--
-- E entre eles a Thais, R$ 240, que escreveu com todas as letras:
--
--   "Por favor me passe o pix e o valor pra eu fazer o pagamento
--    referente julho-dezembro"
--
-- SAO SEIS COMPETENCIAS NUM PAGAMENTO SO, e nao havia como dizer isso. O
-- seletor "A que se refere" e de escolha unica, e quando nada e apontado o
-- gatilho `sureya_carimbar_competencia` carimba o mes do Pix. Entao a opcao
-- "sem apontar — so entra no saldo", que a tela oferece, NAO EXISTE de fato:
-- o lancamento sai carimbado assim mesmo.
--
-- O QUE ISSO QUEBRA
--
-- O saldo da familia continua certo — ele e soma, nao pareamento. Mas o
-- RELATORIO POR COMPETENCIA, que e o que a Sureya confere, mostraria agosto
-- inflado em R$ 240 e setembro a dezembro zerados, com a familia parecendo
-- inadimplente enquanto tem credito. Dinheiro no lugar errado do calendario
-- e pior que dinheiro nenhum: ele parece certo.
--
-- COMO SE RESOLVE
--
-- Um pagamento vira VARIAS LINHAS de credito, uma por competencia, todas
-- amarradas ao mesmo comprovante. E o modelo que o sistema ja tem — o saldo e
-- soma de lancamentos — em vez de uma tabela nova de "parcelas", que seria uma
-- segunda verdade sobre o mesmo dinheiro.
--
-- QUANTO VAI PARA CADA MES
--
--   mes que JA TEM divida lancada  ->  o valor da divida (essa e a verdade
--                                      que o sistema tem, nao um rateio meu)
--   mes que AINDA NAO TEM          ->  divide igualmente o que sobrar
--
-- O segundo caso e o da Thais: o tumulo dela nem contratado esta. Dividir
-- igual e transparente e converge — quando o contrato nascer com R$ 40/mes, os
-- debitos encontram os creditos exatos. Se nascer com outro valor, a soma
-- continua certa e a diferenca vira adiantamento, que e o que ela e.
--
-- E O QUE NAO COUBER EM MES NENHUM vira UMA linha de adiantamento, dita com
-- esse nome. Sumir com a sobra dentro do ultimo mes faria aquele mes mentir.
--
-- NADA AQUI ENVIA NADA. E conferencia de dinheiro que ja entrou.
-- ============================================================================

create or replace function sureya_conciliar_comprovante_meses(
  p_comprovante  uuid,
  p_competencias date[],
  p_org          uuid    default null,
  p_valor        numeric default null,
  p_data         date    default null,
  p_tumulo       uuid    default null,
  -- ENSAIO: calcula e devolve o rateio SEM ESCREVER NADA.
  --
  -- Esta aqui, e nao numa segunda funcao, porque a previa e a execucao tem de
  -- ser a MESMA conta. Duas implementacoes da mesma regra e o defeito que este
  -- projeto mais repete (0092, 0105, 0106, 0115, 0137, 0140, 0142) — e numa
  -- tela de dinheiro ele apareceria como "a previa dizia outra coisa".
  p_ensaio       boolean default false
)
returns table (competencia date, valor numeric, cobria_divida boolean)
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
  v_alvos   numeric[];
  v_conhec  numeric := 0;   -- soma dos meses que ja tem divida
  v_ndesc   int     := 0;   -- quantos meses ainda nao tem divida
  v_cota    numeric := 0;   -- quanto cabe a cada mes sem divida
  v_resto   numeric;
  v_i       int;
  v_n       int;
  v_parte   numeric;
  v_texto   text;
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

  -- OS MESES: normalizados para o dia 1, sem repetidos, em ordem.
  -- Repetido nao e detalhe: "julho, julho, agosto" gastaria julho duas vezes e
  -- deixaria agosto sem nada, e o total ainda fecharia — o pior tipo de erro.
  select array_agg(m order by m) into v_meses
    from (select distinct date_trunc('month', x)::date m
            from unnest(coalesce(p_competencias, '{}'::date[])) x) s;

  if v_meses is null or array_length(v_meses, 1) is null then
    raise exception 'sem_competencia' using
      hint = 'Diga a que meses este pagamento se refere.';
  end if;

  -- JA CONFERIDO NAO SE CONFERE DE NOVO. Sem esta trava, chamar duas vezes
  -- creditaria o dinheiro duas vezes — e o saldo da familia mentiria a favor
  -- dela, que e o erro que ninguem reclama e por isso ninguem descobre.
  if exists (
    select 1 from conta_corrente cc
     where cc.comprovante_id = p_comprovante and cc.org_id = v_org
       and cc.status_conc = 'confirmado'
  ) then
    raise exception 'comprovante_ja_conferido' using
      hint = 'Este comprovante ja virou credito. Estorne antes de refazer.';
  end if;

  v_n := array_length(v_meses, 1);
  v_alvos := array_fill(null::numeric, array[v_n]);

  -- ------------------------------------------------------------------------
  -- PASSE 1 — quanto cada mes DEVE, segundo o que ja esta lancado.
  -- ------------------------------------------------------------------------
  for v_i in 1 .. v_n loop
    select sum(cc.valor) into v_parte
      from conta_corrente cc
     where cc.org_id = v_org
       and cc.familia_id = v_familia
       and cc.tipo = 'debito'
       and cc.origem = 'competencia'
       and cc.competencia = v_meses[v_i]
       and (p_tumulo is null or cc.tumulo_id = p_tumulo);

    if coalesce(v_parte, 0) > 0 then
      v_alvos[v_i] := v_parte;
      v_conhec := v_conhec + v_parte;
    else
      v_ndesc := v_ndesc + 1;
    end if;
  end loop;

  -- O QUE SOBRA PARA OS MESES QUE AINDA NAO TEM DIVIDA.
  -- Se o pagamento nem cobre as dividas conhecidas, os desconhecidos ficam com
  -- ZERO — e nao com um pedaco tirado de quem ja devia.
  if v_ndesc > 0 then
    v_cota := greatest(v_valor - v_conhec, 0) / v_ndesc;
    v_cota := round(v_cota, 2);
  end if;

  -- ------------------------------------------------------------------------
  -- PASSE 2 — reparte em ordem, ate o dinheiro acabar.
  -- ------------------------------------------------------------------------
  v_resto := v_valor;

  for v_i in 1 .. v_n loop
    v_parte := round(least(coalesce(v_alvos[v_i], v_cota), v_resto), 2);

    -- O CENTAVO DA DIVISAO VAI PARA O ULTIMO MES APONTADO. R$ 100 em 3 meses
    -- da 33,33 tres vezes e some um centavo; a soma das linhas TEM de bater
    -- com o comprovante, senao a conferencia acusa diferenca para sempre.
    if v_i = v_n and coalesce(v_alvos[v_i], v_cota) >= v_resto then
      v_parte := round(v_resto, 2);
    end if;

    if v_parte > 0 then
      competencia   := v_meses[v_i];
      valor         := v_parte;
      cobria_divida := v_alvos[v_i] is not null;

      if not p_ensaio then
        v_texto := 'Pagamento conferido · ' || to_char(v_meses[v_i], 'MM/YYYY')
                   || case when v_n > 1 then ' (parte de ' || v_n || ' meses)' else '' end;
        perform sureya_lancar(
          p_cliente     := v_comp.cliente_id,
          p_tipo        := 'credito',
          p_valor       := v_parte,
          p_origem      := 'pagamento',
          p_descricao   := v_texto,
          p_data        := v_data,
          p_status      := 'confirmado',
          p_comprovante := p_comprovante,
          p_tumulo      := p_tumulo,
          p_competencia := v_meses[v_i],
          p_org         := v_org);
      end if;

      return next;
      v_resto := round(v_resto - v_parte, 2);
    end if;

    exit when v_resto <= 0;
  end loop;

  -- ------------------------------------------------------------------------
  -- O QUE NAO COUBE EM MES NENHUM — dito com o nome que tem.
  -- ------------------------------------------------------------------------
  if v_resto > 0 then
    competencia   := date_trunc('month', v_data)::date;
    valor         := v_resto;
    cobria_divida := false;

    if not p_ensaio then
      perform sureya_lancar(
        p_cliente     := v_comp.cliente_id,
        p_tipo        := 'credito',
        p_valor       := v_resto,
        p_origem      := 'pagamento',
        p_descricao   := 'Adiantamento · sobra do pagamento de '
                         || to_char(v_data, 'DD/MM/YYYY'),
        p_data        := v_data,
        p_status      := 'confirmado',
        p_comprovante := p_comprovante,
        p_tumulo      := p_tumulo,
        p_competencia := date_trunc('month', v_data)::date,
        p_org         := v_org);
    end if;
    return next;
  end if;

  -- ------------------------------------------------------------------------
  -- E SO ENTAO O COMPROVANTE MUDA DE ESTADO.
  --
  -- A linha pendente (`a_conferir`), criada quando a imagem chegou pelo
  -- WhatsApp, SAI: ela era a promessa de um credito, e o credito agora existe
  -- em N linhas. Deixa-la seria contar o mesmo dinheiro duas vezes no saldo.
  -- ------------------------------------------------------------------------
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

comment on function sureya_conciliar_comprovante_meses(uuid, date[], uuid, numeric, date, uuid, boolean) is
  'Confere um comprovante repartindo-o entre varias competencias (0144). p_ensaio calcula sem escrever.';

-- SECURITY DEFINER ignora RLS, e o Supabase concede EXECUTE a anon POR PADRAO
-- em `public` (licao da 0129). Esta funcao MOVE DINHEIRO.
revoke execute on function sureya_conciliar_comprovante_meses(uuid, date[], uuid, numeric, date, uuid, boolean)
  from public, anon;
grant  execute on function sureya_conciliar_comprovante_meses(uuid, date[], uuid, numeric, date, uuid, boolean)
  to authenticated, service_role;
