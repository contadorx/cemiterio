-- 0124 — ADIAR A COBRANÇA ATÉ A DATA COMBINADA
--
-- O PEDIDO
--   "Nas mensagens quero poder adiar ela para determinada data e enquanto isso
--    não disparar uma outra da régua, isso em cobrança"
--
-- O QUE ACONTECE HOJE SEM ISTO
--
-- A família responde "pode ser dia 15?" e a Sureya não tem o que fazer com
-- essa frase. As opções são duas, e as duas são ruins:
--
--   descartar a mensagem  -> a régua cria outra amanhã, e a família recebe
--                            cobrança dois dias depois de a Sureya ter dito
--                            "combinado, dia 15".
--   deixar na fila        -> ela fica olhando para a mesma linha todo dia e
--                            tendo de lembrar, de cabeça, que aquela já foi
--                            combinada.
--
-- O SILÊNCIO É A PROMESSA. Uma segunda cobrança saindo antes da data
-- combinada desfaz na hora a confiança que a primeira construiu — e essa é a
-- conversa mais cara que esta casa pode ter.
--
-- ONDE A TRAVA MORA
--
-- Na PRÓPRIA mensagem adiada, e não num campo novo na família. Dois lugares
-- guardando o mesmo fato é o defeito que este projeto mais repete (0092, 0105,
-- 0106, 0115) — e aqui ele daria "adiei na tela e ela cobrou mesmo assim",
-- que é a forma mais cara de descobrir.
--
-- Consequência assumida: descartar a mensagem adiada solta a trava. Está
-- certo — descartar quer dizer "essa não vale mais", e aí a régua volta a
-- decidir.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ
--   Nada passa a sair sozinho. Adiar só ESCONDE a mensagem até o dia e segura
--   quem produziria outra. O disparo continua sendo comando, na fila.

-- ============================================================================
-- 1. A MENSAGEM SABE ATÉ QUANDO ESTÁ GUARDADA
-- ============================================================================

alter table fila_liberacao
  add column if not exists adiada_para       date,
  add column if not exists adiada_em         timestamptz,
  add column if not exists adiada_por        uuid,
  add column if not exists motivo_adiamento  text;

comment on column fila_liberacao.adiada_para is
  'Ate quando esta mensagem fica guardada. Enquanto for futura, ela some da '
  'fila e — se for cobranca — segura a regua para a familia inteira.';

-- O indice serve a pergunta que a regua faz uma vez por familia por dia:
-- "esta casa tem cobranca adiada?".
create index if not exists idx_fila_cobranca_adiada
  on fila_liberacao (org_id, familia_id, adiada_para)
  where tipo = 'cobranca' and status = 'aguardando' and adiada_para is not null;

-- ============================================================================
-- 2. A PERGUNTA, NUM LUGAR SÓ
-- ============================================================================
--
-- Devolve ATE QUANDO a cobranca desta familia esta segurada, ou nulo se nao
-- esta. Quem pergunta: a regua (SQL) e a cobranca gentil (TypeScript). Uma
-- resposta, duas bocas — e nao duas contas que comecam iguais e terminam
-- discordando.

create or replace function sureya_cobranca_adiada(
  p_familia uuid,
  p_dia     date default null,
  p_org     uuid default null
) returns date
language sql
stable
security definer
set search_path = public
as $$
  select max(fl.adiada_para)
    from fila_liberacao fl
   where fl.org_id = coalesce(p_org, current_org_id())
     and fl.familia_id = p_familia
     and fl.tipo = 'cobranca'
     and fl.status = 'aguardando'
     and fl.adiada_para is not null
     and fl.adiada_para > coalesce(p_dia, current_date);
$$;

revoke all on function sureya_cobranca_adiada(uuid, date, uuid) from public, anon;
grant execute on function sureya_cobranca_adiada(uuid, date, uuid) to authenticated, service_role;

-- ============================================================================
-- 3. ADIAR — E DESADIAR
-- ============================================================================

create or replace function sureya_adiar_mensagem(
  p_id     uuid,
  p_ate    date,
  p_motivo text default null,
  p_org    uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_org, current_org_id());
  v_fl  record;
begin
  if v_org is null then
    raise exception 'sureya_adiar_mensagem: sem org';
  end if;
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  select * into v_fl from fila_liberacao where id = p_id and org_id = v_org;
  if v_fl is null then
    raise exception 'mensagem_nao_encontrada' using errcode = '42704';
  end if;

  -- SO SE AINDA NAO SAIU. Adiar o que ja foi enviado nao desfaz nada, e a tela
  -- passaria a mostrar uma promessa que nao existe.
  if v_fl.status <> 'aguardando' then
    raise exception 'sureya_adiar_mensagem: esta mensagem nao esta mais aguardando (%)', v_fl.status;
  end if;

  -- p_ate nulo DESADIA — a mensagem volta para a fila hoje. E o caminho de
  -- volta de quem adiou por engano, e ele precisa existir.
  if p_ate is not null and p_ate <= current_date then
    raise exception 'sureya_adiar_mensagem: a data tem de ser depois de hoje';
  end if;
  if p_ate is not null and p_ate > current_date + 365 then
    raise exception 'sureya_adiar_mensagem: mais de um ano nao e adiar, e desistir';
  end if;

  update fila_liberacao
     set adiada_para = p_ate,
         adiada_em   = case when p_ate is null then null else now() end,
         adiada_por  = case when p_ate is null then null else auth.uid() end,
         motivo_adiamento = case when p_ate is null then null
                                 else nullif(btrim(coalesce(p_motivo, '')), '') end
   where id = p_id and org_id = v_org;

  return jsonb_build_object(
    'id', p_id,
    'adiada_para', p_ate,
    'familia_id', v_fl.familia_id,
    -- Quem chamou precisa poder dizer na tela o que mudou de verdade: adiar
    -- uma cobranca segura a familia inteira, adiar uma foto nao segura nada.
    'segura_a_regua', v_fl.tipo = 'cobranca' and p_ate is not null
  );
end;
$$;

revoke all on function sureya_adiar_mensagem(uuid, date, text, uuid) from public, anon;
grant execute on function sureya_adiar_mensagem(uuid, date, text, uuid) to authenticated, service_role;

-- ============================================================================
-- 4. A RÉGUA PASSA A OLHAR ANTES DE FALAR
-- ============================================================================
--
-- Recriada inteira, e nao remendada por texto: a lista de colunas de retorno
-- muda (ganha `adiados`), e isso `create or replace` nao faz. O corpo abaixo e
-- o da 0116 com DOIS acrescimos — a guarda 0 e o contador —, derivado do
-- arquivo original em vez de redigitado, para nao divergir dele.
--
-- O CONTADOR NAO E ENFEITE. Sem ele, "a regua nao enfileirou nada hoje" tem
-- duas causas indistinguiveis: ninguem devia, ou tudo estava adiado. Silencio
-- que nao se explica ja custou dezenove dias de WhatsApp nesta casa (0121).

drop function if exists public.sureya_regua_do_dia(date, uuid);

create or replace function public.sureya_regua_do_dia(
  p_dia date default null, p_org uuid default null)
returns table(enfileirados integer, ja_enfileirados integer, sem_degrau integer,
              ja_pagos integer, limitados integer, sem_telefone integer,
              adiados integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_dia date; v_dia_venc int; r record;
  v_enf int := 0; v_ja int := 0; v_sem int := 0; v_pago int := 0; v_lim int := 0;
  v_semtel int := 0; v_adiado int := 0;
  v_texto text; v_saldo numeric; v_nome text; v_fila uuid;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using
      errcode = '42501',
      hint = 'Sem sessao do painel: passe p_org (e o cron sempre passa).';
  end if;
  v_dia := coalesce(p_dia, current_date);

  select coalesce(dia_vencimento, 10) into v_dia_venc from orgs where id = v_org;

  for r in
    select cc.id as lancamento_id, cc.familia_id, cc.tumulo_id, cc.competencia,
           cc.valor, f.nome as familia_nome, f.responsavel_id,
           coalesce(c.regua_cobranca, 'padrao'::sureya_regua_cobranca) as regua,
           coalesce(c.nome, f.nome) as quem,
           c.id as cliente_id, c.telefone,
           -- DO VENCIMENTO ESCRITO (0114), e nao de uma data derivada.
           (v_dia - cc.data) as dias_do_vencimento,
           cc.data as vence_em
      from conta_corrente cc
      join familias f on f.id = cc.familia_id
      left join clientes c on c.id = f.responsavel_id
     where cc.org_id = v_org
       and cc.tipo = 'debito'
       and cc.origem = 'competencia'
       and cc.status_conc = 'confirmado'
       and cc.data between (v_dia - 365) and (v_dia + 365)
     order by cc.competencia
  loop
    -- 4. A FAMÍLIA QUE PEDIU PARA NÃO SER COBRADA.
    if r.regua = 'nao_cobrar' then
      continue;
    end if;

    -- 0. A COBRANÇA QUE FOI ADIADA (0124).
    --
    -- A família disse "me chama dia 15" e a Sureya adiou a mensagem na fila.
    -- Até lá, o silêncio é a promessa: uma segunda cobrança saindo antes da
    -- data combinada desfaz na hora a confiança que a primeira construiu.
    --
    -- A trava é lida da PRÓPRIA mensagem adiada, e não de um campo paralelo na
    -- família: um segundo lugar guardando o mesmo fato é o defeito que este
    -- projeto mais repete, e aqui daria "adiei na tela e ela cobrou mesmo
    -- assim" — que é a forma mais cara de descobrir.
    if sureya_cobranca_adiada(r.familia_id, v_dia, v_org) is not null then
      v_adiado := v_adiado + 1;
      continue;
    end if;

    -- Existe um degrau EXATAMENTE para hoje nesta régua?
    select d.texto into v_texto
      from regua_degraus d
     where d.org_id = v_org and d.regua = r.regua
       and d.ativo and d.dias = r.dias_do_vencimento
     limit 1;

    if v_texto is null then
      v_sem := v_sem + 1;
      continue;
    end if;

    -- 3. SÓ QUEM AINDA DEVE.
    select coalesce(sum(case when tipo = 'debito' then valor else -valor end), 0)
      into v_saldo
      from conta_corrente
     where familia_id = r.familia_id and org_id = v_org and status_conc = 'confirmado';
    -- SEM FILTRAR POR VENCIMENTO, de propósito. O degrau NEGATIVO é o aviso
    -- que sai ANTES de vencer: se aqui só contasse o que já venceu, o saldo
    -- daria zero e a mensagem de "vence em cinco dias" nunca sairia. Quem
    -- decide a hora é o degrau; aqui a pergunta é só "ela ainda deve isso?".

    if v_saldo <= 0.009 then
      v_pago := v_pago + 1;
      continue;
    end if;

    -- 5. SEM TELEFONE NÃO HÁ PARA ONDE MANDAR (0116).
    if btrim(coalesce(r.telefone, '')) = '' then
      v_semtel := v_semtel + 1;
      continue;
    end if;

    -- 1. UMA POR DEGRAU POR COMPETÊNCIA.
    if exists (
      select 1 from fila_liberacao fl
       where fl.org_id = v_org and fl.familia_id = r.familia_id
         and fl.tipo = 'cobranca'
         and fl.competencia_ref = r.competencia
         and fl.degrau_dias = r.dias_do_vencimento
    ) then
      v_ja := v_ja + 1;
      continue;
    end if;

    -- 2. UMA POR FAMÍLIA POR DIA.
    if exists (
      select 1 from fila_liberacao fl
       where fl.org_id = v_org and fl.familia_id = r.familia_id
         and fl.tipo = 'cobranca'
         and fl.criado_em::date = v_dia
    ) then
      v_lim := v_lim + 1;
      continue;
    end if;

    v_nome := split_part(btrim(coalesce(r.quem, r.familia_nome, '')), ' ', 1);

    insert into fila_liberacao
      (org_id, familia_id, cliente_id, tumulo_id, tipo, texto, status,
       competencia_ref, degrau_dias)
    values (v_org, r.familia_id, r.responsavel_id, r.tumulo_id, 'cobranca',
            replace(v_texto, '{nome}', coalesce(nullif(v_nome, ''), 'tudo bem')),
            'aguardando', r.competencia, r.dias_do_vencimento)
    returning id into v_fila;

    if v_fila is not null then v_enf := v_enf + 1; end if;
  end loop;

  return query select v_enf, v_ja, v_sem, v_pago, v_lim, v_semtel, v_adiado;
end $$;

revoke all on function public.sureya_regua_do_dia(date, uuid) from public, anon;
grant execute on function public.sureya_regua_do_dia(date, uuid) to authenticated, service_role;
