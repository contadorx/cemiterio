-- ============================================================================
-- SUREYA — Migration 0009 · Portal da Família (E2)
--  Um link público por túmulo mostra o histórico de limpezas com fotos.
--  Sem login. Segurança: token aleatório + RPCs SECURITY DEFINER que expõem
--  SOMENTE o que o portal precisa (nunca telefone, valor, saldo, dados internos).
-- ============================================================================

-- Garante um token por túmulo (reaproveita qr_token do schema original).
-- (não geramos em massa aqui; criamos sob demanda pela RPC de emissão)

-- Emissão/rotação do token (chamada pelo painel, autenticada via RLS normal).
create or replace function sureya_emitir_token_portal(p_tumulo uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_token text;
begin
  -- confere que o túmulo é da org do chamador (respeita o vínculo de membro)
  select t.org_id into v_org
  from tumulos t
  where t.id = p_tumulo
    and t.org_id = current_org_id();

  if v_org is null then
    raise exception 'tumulo_nao_encontrado';
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');
  update tumulos set qr_token = v_token where id = p_tumulo;
  return v_token;
end;
$$;

revoke all on function sureya_emitir_token_portal(uuid) from public;
grant execute on function sureya_emitir_token_portal(uuid) to authenticated;

-- Revoga o token (desliga o portal daquele túmulo).
create or replace function sureya_revogar_token_portal(p_tumulo uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update tumulos set qr_token = null
  where id = p_tumulo and org_id = current_org_id();
end;
$$;
revoke all on function sureya_revogar_token_portal(uuid) from public;
grant execute on function sureya_revogar_token_portal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- LEITURA PÚBLICA (sem login): cabeçalho do túmulo pelo token.
-- Expõe só: identificação, falecido, quadra, cemitério. Nada sensível.
-- ----------------------------------------------------------------------------
create or replace function sureya_portal_cabecalho(p_token text)
returns table (
  tumulo_id uuid,
  identificacao text,
  falecido_nome text,
  quadra text,
  cemiterio text,
  foto_referencia_url text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.identificacao,
    t.falecido_nome,
    q.codigo,
    c.nome,
    t.foto_referencia_url
  from tumulos t
  join quadras q on q.id = t.quadra_id
  join cemiterios c on c.id = q.cemiterio_id
  where t.qr_token = p_token
    and p_token is not null
    and length(p_token) >= 16
  limit 1;
$$;
revoke all on function sureya_portal_cabecalho(text) from public;
grant execute on function sureya_portal_cabecalho(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- LEITURA PÚBLICA: histórico de limpezas executadas do túmulo pelo token.
-- Expõe só: data e foto do "depois". Nunca valor, cliente, telefone.
-- ----------------------------------------------------------------------------
create or replace function sureya_portal_historico(p_token text)
returns table (
  servico_id uuid,
  data_executada timestamptz,
  foto_depois_url text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.data_executada,
    s.foto_depois_url
  from servicos s
  join tumulos t on t.id = s.tumulo_id
  where t.qr_token = p_token
    and p_token is not null
    and length(p_token) >= 16
    and s.status = 'executado'
    and s.foto_depois_url is not null
  order by s.data_executada desc
  limit 60;
$$;
revoke all on function sureya_portal_historico(text) from public;
grant execute on function sureya_portal_historico(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Storage: as fotos de serviço precisam ser legíveis pelo link público.
-- O bucket 'servicos' deve estar como público (leitura), OU usar URLs assinadas.
-- Deixamos o bucket público de leitura aqui; upload continua só via service role.
-- (Se preferir URLs assinadas, ignore este bloco e gere signed URLs no servidor.)
-- ----------------------------------------------------------------------------
update storage.buckets set public = true where id = 'servicos';

-- ============================================================================
-- FIM 0009.
-- ============================================================================
