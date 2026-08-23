-- 0111 — A RÉGUA ENFILEIRA, NUNCA ENVIA
--
-- Percorre as competências em aberto e, para cada degrau da régua da família
-- que caiu HOJE, põe uma mensagem na fila de liberação.
--
-- ⚠ ELA NÃO ENVIA NADA. Escreve em `fila_liberacao`, que é a porta única desde
-- a 0094 e só sai por comando de quem lê. Não há caminho daqui para o
-- WhatsApp — e é de propósito: "o disparo é manual pela fila do conversas".
--
-- O QUE É O VENCIMENTO — e por que ele não é a competência
--   `conta_corrente.competencia` é sempre o dia 1º: o gatilho `trg_cc_competencia`
--   (0098) carimba assim, e está certo — competência é MÊS, não dia.
--
--   Mas ninguém vence no dia 1º. A casa combina um dia de pagamento, e é dele
--   que a régua conta: "3 dias depois" é três dias depois do VENCIMENTO, não
--   do primeiro dia do mês. Sem essa distinção, o degrau de 3 dias cairia no
--   dia 4 de todo mês, chamando de atrasado quem ainda tem uma semana.
--
--   Daí `orgs.dia_vencimento` (padrão 10): o vencimento de 07/2026 é 10/07, e
--   o degrau `dias = 3` cai em 13/07. Um número só, da casa, visível.
--
-- AS TRAVAS, e por que cada uma existe
--   1. UMA POR DEGRAU POR COMPETÊNCIA. Sem isso, rodar duas vezes no mesmo dia
--      manda a mesma cobrança duas vezes — e a fila não tem desfazer depois de
--      liberada.
--   2. UMA POR FAMÍLIA POR DIA. Uma família com três túmulos em atraso
--      receberia três cobranças na mesma manhã, cada uma correta e o conjunto
--      absurdo.
--   3. SÓ QUEM AINDA DEVE. O saldo é conferido no momento de enfileirar: quem
--      pagou ontem não pode receber a cobrança de hoje.
--   4. RESPEITA `nao_cobrar`. É a família que pediu para não ser cobrada.

begin;

-- ---------------------------------------------------------------------------
-- A FILA PRECISA LEMBRAR DE QUE DEGRAU VEIO
-- ---------------------------------------------------------------------------
-- Sem estas duas colunas a trava "uma por degrau por competência" não teria
-- como existir: a única forma de saber se o degrau de 3 dias da competência de
-- julho já saiu seria comparar TEXTOS, que muda no dia em que a casa editar a
-- régua — e aí a família recebe tudo de novo.
-- O DIA EM QUE SE COMBINA PAGAR. Sem ele a régua não tem de onde contar.
alter table orgs add column if not exists dia_vencimento smallint not null default 10;
comment on column orgs.dia_vencimento is
  'Dia do mes em que a mensalidade vence. A regua conta os degraus a partir dele.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orgs_dia_vencimento_faixa') then
    -- 28 e não 31: um vencimento no dia 30 não existe em fevereiro, e a régua
    -- inteira ficaria muda naquele mês sem ninguém entender por quê.
    alter table orgs add constraint orgs_dia_vencimento_faixa
      check (dia_vencimento between 1 and 28);
  end if;
end $$;

alter table fila_liberacao add column if not exists competencia_ref date;
alter table fila_liberacao add column if not exists degrau_dias smallint;

comment on column fila_liberacao.competencia_ref is
  'A competencia que esta cobranca persegue. Preenchido pela regua (0111).';
comment on column fila_liberacao.degrau_dias is
  'Qual degrau da regua gerou esta mensagem: dias em relacao ao vencimento.';

create index if not exists idx_fila_regua
  on fila_liberacao (org_id, familia_id, competencia_ref, degrau_dias)
  where tipo = 'cobranca';

create or replace function public.sureya_regua_do_dia(
  p_dia date default null, p_org uuid default null)
returns table(enfileirados integer, ja_existiam integer, sem_degrau integer,
              sem_saldo integer, por_limite_diario integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_dia date; r record;
  v_enf int := 0; v_ja int := 0; v_sem int := 0; v_pago int := 0; v_lim int := 0;
  v_texto text; v_saldo numeric; v_fila uuid; v_nome text; v_dia_venc int;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using errcode = '42501';
  end if;
  v_dia := coalesce(p_dia, current_date);

  select coalesce(dia_vencimento, 10) into v_dia_venc from orgs where id = v_org;

  for r in
    select cc.id as lancamento_id, cc.familia_id, cc.tumulo_id, cc.competencia,
           cc.valor, f.nome as familia_nome, f.responsavel_id,
           coalesce(c.regua_cobranca, 'padrao'::sureya_regua_cobranca) as regua,
           coalesce(c.nome, f.nome) as quem,
           c.id as cliente_id, c.telefone,
           -- DO VENCIMENTO, não do dia 1º da competência.
           (v_dia - (cc.competencia + (v_dia_venc - 1))) as dias_do_vencimento,
           (cc.competencia + (v_dia_venc - 1)) as vence_em
      from conta_corrente cc
      join familias f on f.id = cc.familia_id
      left join clientes c on c.id = f.responsavel_id
     where cc.org_id = v_org
       and cc.tipo = 'debito'
       and cc.origem = 'competencia'
       and cc.status_conc = 'confirmado'
       -- A janela da régua: de um ano antes do vencimento a um ano depois.
       and cc.competencia between (v_dia - 365) and (v_dia + 365)
     order by cc.competencia
  loop
    -- 4. A FAMÍLIA QUE PEDIU PARA NÃO SER COBRADA.
    if r.regua = 'nao_cobrar' then
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

    if v_saldo <= 0.009 then
      v_pago := v_pago + 1;
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

  return query select v_enf, v_ja, v_sem, v_pago, v_lim;
end $$;

revoke all on function public.sureya_regua_do_dia(date, uuid) from public, anon;
grant execute on function public.sureya_regua_do_dia(date, uuid) to authenticated, service_role;

commit;
