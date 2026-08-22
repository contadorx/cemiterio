-- ============================================================================
-- SUREYA — Migration 0010 · LGPD + Avaliações + Indicações + Monitoramento
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (H1) LGPD: consentimento e trilha de anonimização no cliente
-- ----------------------------------------------------------------------------
alter table clientes add column if not exists consentimento_em    timestamptz;
alter table clientes add column if not exists consentimento_via   text;      -- 'whatsapp' | 'cadastro' | 'importacao'
alter table clientes add column if not exists anonimizado_em       timestamptz;

-- Texto padrão do aviso de privacidade (editável por org)
alter table orgs add column if not exists aviso_privacidade text;

-- ----------------------------------------------------------------------------
-- (H2) Anonimização: apaga PII do cliente mantendo o histórico contábil.
--   - zera nome/telefone/perfil/instruções; marca anonimizado_em
--   - desativa IA; encerra conversas; limpa corpo das mensagens
--   - mantém movimentos (valor/data) para integridade financeira
-- ----------------------------------------------------------------------------
create or replace function sureya_anonimizar_cliente(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from clientes where id = p_cliente and org_id = current_org_id();
  if v_org is null then
    raise exception 'cliente_nao_encontrado';
  end if;

  update clientes set
    nome = 'Cliente removido',
    telefone = 'anon:' || left(md5(random()::text), 12),
    perfil_ia = null,
    instrucoes_ia = null,
    ativo_ia = false,
    modo = 'copiloto',
    anonimizado_em = now()
  where id = p_cliente;

  update conversas set aberta = false where cliente_id = p_cliente and org_id = v_org;
  update mensagens set texto = '[removido a pedido]', midia_url = null
    where cliente_id = p_cliente and org_id = v_org;
  update leads set nome_wa = null, mensagens = '[]'::jsonb, status = 'descartado'
    where org_id = v_org and telefone in (select telefone from clientes where id = p_cliente);
end;
$$;
revoke all on function sureya_anonimizar_cliente(uuid) from public;
grant execute on function sureya_anonimizar_cliente(uuid) to authenticated;

-- Registro do consentimento (ex.: cliente respondeu "aceito" no WhatsApp)
create or replace function sureya_registrar_consentimento(p_cliente uuid, p_via text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update clientes set consentimento_em = now(), consentimento_via = coalesce(p_via, 'whatsapp')
  where id = p_cliente and org_id = current_org_id();
end;
$$;
revoke all on function sureya_registrar_consentimento(uuid, text) from public;
grant execute on function sureya_registrar_consentimento(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- (C-review) Avaliações pós-serviço
-- ----------------------------------------------------------------------------
create table if not exists avaliacoes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  cliente_id  uuid references clientes(id) on delete set null,
  servico_id  uuid references servicos(id) on delete set null,
  nota        int check (nota between 1 and 5),
  comentario  text,
  token       text unique,          -- link público de avaliação
  respondida_em timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_avaliacoes_org on avaliacoes(org_id, created_at desc);
alter table avaliacoes enable row level security;
create policy avaliacoes_org on avaliacoes
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Emissão do token de avaliação (painel)
create or replace function sureya_emitir_avaliacao(p_servico uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_cliente uuid; v_token text; v_existente text;
begin
  select org_id, cliente_id into v_org, v_cliente
  from servicos where id = p_servico and org_id = current_org_id();
  if v_org is null then raise exception 'servico_nao_encontrado'; end if;

  select token into v_existente from avaliacoes where servico_id = p_servico limit 1;
  if v_existente is not null then return v_existente; end if;

  v_token := encode(gen_random_bytes(12), 'hex');
  insert into avaliacoes (org_id, cliente_id, servico_id, token)
  values (v_org, v_cliente, p_servico, v_token);
  return v_token;
end;
$$;
revoke all on function sureya_emitir_avaliacao(uuid) from public;
grant execute on function sureya_emitir_avaliacao(uuid) to authenticated;

-- Registro público da avaliação (sem login), pelo token
create or replace function sureya_responder_avaliacao(p_token text, p_nota int, p_comentario text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from avaliacoes
  where token = p_token and respondida_em is null
    and p_token is not null and length(p_token) >= 12;
  if v_id is null then return false; end if;

  update avaliacoes set
    nota = greatest(1, least(5, coalesce(p_nota, 5))),
    comentario = nullif(left(coalesce(p_comentario,''), 1000), ''),
    respondida_em = now()
  where id = v_id;
  return true;
end;
$$;
revoke all on function sureya_responder_avaliacao(text, int, text) from public;
grant execute on function sureya_responder_avaliacao(text, int, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- (F-referral) Indicações: família indica família
-- ----------------------------------------------------------------------------
create table if not exists indicacoes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  indicador_id   uuid references clientes(id) on delete set null,
  codigo         text unique not null,       -- código curto do indicador
  indicado_nome  text,
  indicado_tel   text,
  status         text not null default 'novo', -- 'novo' | 'virou_cliente' | 'descartado'
  cliente_novo_id uuid references clientes(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_indicacoes_org on indicacoes(org_id, status);
alter table indicacoes enable row level security;
create policy indicacoes_org on indicacoes
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- código de indicação por cliente (guardado no próprio cliente p/ reuso)
alter table clientes add column if not exists codigo_indicacao text unique;

create or replace function sureya_gerar_codigo_indicacao(p_cliente uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_cod text; v_org uuid;
begin
  select org_id, codigo_indicacao into v_org, v_cod
  from clientes where id = p_cliente and org_id = current_org_id();
  if v_org is null then raise exception 'cliente_nao_encontrado'; end if;
  if v_cod is not null then return v_cod; end if;

  v_cod := upper(left(encode(gen_random_bytes(6),'hex'), 8));
  update clientes set codigo_indicacao = v_cod where id = p_cliente;
  return v_cod;
end;
$$;
revoke all on function sureya_gerar_codigo_indicacao(uuid) from public;
grant execute on function sureya_gerar_codigo_indicacao(uuid) to authenticated;

-- registro público de uma indicação recebida (pela landing/link)
create or replace function sureya_registrar_indicacao(p_codigo text, p_nome text, p_tel text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_indicador uuid;
begin
  select org_id, id into v_org, v_indicador
  from clientes where codigo_indicacao = upper(p_codigo);
  if v_org is null then return false; end if;

  insert into indicacoes (org_id, indicador_id, codigo, indicado_nome, indicado_tel)
  values (v_org, v_indicador, upper(p_codigo), nullif(left(coalesce(p_nome,''),120),''), nullif(left(coalesce(p_tel,''),40),''));
  return true;
end;
$$;
revoke all on function sureya_registrar_indicacao(text, text, text) from public;
grant execute on function sureya_registrar_indicacao(text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- (A7) Monitoramento: log de erros do sistema
-- ----------------------------------------------------------------------------
create table if not exists erros_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid,
  contexto   text,          -- ex.: 'webhook', 'concluir', 'cron_diario'
  mensagem   text,
  detalhe    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_erros_log_data on erros_log(created_at desc);
alter table erros_log enable row level security;
-- só admin da org (ou registros sem org) enxerga
create policy erros_log_leitura on erros_log
  for select using (org_id is null or org_id = current_org_id());

-- ============================================================================
-- FIM 0010.
-- ============================================================================
