-- 0116 — TEM CONTATO QUE NÃO TEM TELEFONE
--
-- O PEDIDO
--   "estou com um problema, eu tenho famílias com contatos sem telefone...
--    preciso conseguir salvar"
--
-- O QUE ESTAVA ERRADO
--   `clientes.telefone` é NOT NULL desde a 0001, onde o comentário explica o
--   porquê: *"o telefone É a allowlist: número que não bate aqui = IA muda"*.
--   Fazia sentido quando um cliente era, por definição, um número de WhatsApp.
--
--   Não faz mais. Desde a 0100 a ficha é da FAMÍLIA, e `clientes` virou a
--   lista de gente dela: o filho que mora fora, a irmã que decide e não
--   responde mensagem, o falecido que ainda aparece no contrato. Exigir
--   telefone de todos obriga a inventar um número — e número inventado numa
--   allowlist é pior do que campo vazio.
--
--   A prova de que a regra já estava sendo contornada está no próprio banco:
--   um cadastro com telefone = '' (string vazia), que passa pelo NOT NULL e
--   não é telefone nenhum.
--
-- O QUE MUDA
--   `telefone` passa a aceitar nulo, e o '' vira nulo — porque o índice único
--   `(org_id, telefone)` trata nulos como distintos entre si, mas trataria
--   duas strings vazias como repetidas. Sem esta conversão, o SEGUNDO contato
--   sem telefone seria recusado por chave duplicada, com uma mensagem sobre
--   telefone repetido para quem não digitou telefone nenhum.
--
--   O que NÃO muda: continua sendo impossível haver dois contatos com o mesmo
--   número, e a família continua precisando de alguém que acerte a conta.
--   Não ter telefone não é o mesmo que não existir.

begin;

alter table clientes alter column telefone drop not null;

-- O '' de contorno vira o que sempre foi: ausência de telefone.
update clientes set telefone = null where btrim(coalesce(telefone, '')) = '';

comment on column clientes.telefone is
  'WhatsApp normalizado (E.164). NULO = a pessoa existe e nao tem telefone '
  '(0116). Unico por organizacao quando preenchido; nulos nao colidem.';

-- ---------------------------------------------------------------------------
-- A RÉGUA NÃO ENFILEIRA QUEM NÃO TEM PARA ONDE MANDAR
-- ---------------------------------------------------------------------------
-- A régua nunca leu o telefone — ela grava `cliente_id` e quem envia resolve o
-- número depois. Com contato sem telefone isso vira uma cobrança na fila que
-- só falha na hora do envio, e falha em silêncio no meio de um lote.
--
-- Melhor não entrar. E entrar num contador próprio, para a Sureya poder ver
-- que existe alguém a cobrar sem meio de cobrar — que é um problema de
-- cadastro, não de cobrança.
drop function if exists public.sureya_regua_do_dia(date, uuid);

create or replace function public.sureya_regua_do_dia(
  p_dia date default null, p_org uuid default null)
returns table(enfileirados integer, ja_enfileirados integer, sem_degrau integer,
              ja_pagos integer, limitados integer, sem_telefone integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_dia date; v_dia_venc int; r record;
  v_enf int := 0; v_ja int := 0; v_sem int := 0; v_pago int := 0; v_lim int := 0;
  v_semtel int := 0;
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

  return query select v_enf, v_ja, v_sem, v_pago, v_lim, v_semtel;
end $$;

revoke all on function public.sureya_regua_do_dia(date, uuid) from public, anon;
grant execute on function public.sureya_regua_do_dia(date, uuid) to authenticated, service_role;

commit;
