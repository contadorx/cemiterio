-- ============================================================================
-- SUREYA — 0068 · BUILD 2 (lote 2) · O "COMEÇAR" TAMBÉM AUTORIZA
--
-- Rodar DEPOIS da 0055 (is_admin/is_campo) e da 0066.
--
-- GRAVIDADE: P0. É a metade do P0 nº 3 que ainda estava aberta.
--
-- POR QUE A 0067 NÃO ALCANÇOU ISTO
-- ---------------------------------------------------------------------------
-- A auditoria descreve os dois verbos juntos:
--
--   "`iniciar` consulta o serviço com service role e grava a pessoa logada
--    como executora, sem confirmar que aquele serviço estava atribuído a ela."
--
-- `sureya_concluir_lavagem` (0066) fechou o `concluir`. As policies restritivas
-- (0067) fecharam o `update` direto no PostgREST. Mas `campo/iniciar/route.ts`
-- escapa das duas:
--
--     const adm = supabaseAdmin();          ← service role
--     const patch = { executora_id: auth.userId };
--     await adm.from("servicos").update(patch).eq("id", b.servicoId)
--
-- Service role **ignora RLS por completo**. Nenhuma policy vale ali. E o
-- `update` não compara `executora_id` com quem chama — apenas sobrescreve.
--
-- Resultado: mesmo com tudo o que já foi aplicado, uma conta de campo ainda
-- assume o serviço de outra por essa porta. Basta chamar `/api/campo/iniciar`
-- com o UUID alheio: o serviço passa a ser dela, e com ele a foto do antes, o
-- cronômetro e — na conclusão — a remuneração.
--
-- A correção é a mesma do `concluir`: a decisão sai do TypeScript com service
-- role e vai para uma função que autoriza no banco, chamada com a sessão da
-- pessoa.
-- ============================================================================

begin;

create or replace function public.sureya_iniciar_lavagem(
  p_servico    uuid,
  p_foto_antes text default null
)
returns table(
  iniciado_em  timestamptz,
  ja_iniciado  boolean,
  foto_antes   text,
  reservado    boolean          -- o serviço não tinha dono e ficou com quem chamou
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org  uuid;
  v_uid  uuid := auth.uid();
  v_s    record;
  v_ja   boolean := false;
  v_res  boolean := false;
  v_ini  timestamptz;
  v_foto text;
begin
  v_org := current_org_id();
  if v_org is null then
    raise exception 'sem_org' using errcode = '42501';
  end if;

  -- `for update` trava a linha: dois toques simultâneos no "começar" viram um
  -- depois do outro. É o que impede duas pessoas reservarem o mesmo serviço
  -- sem dono no mesmo instante.
  select * into v_s from servicos
   where id = p_servico and org_id = v_org
   for update;

  if not found then
    raise exception 'servico_nao_encontrado' using errcode = '42501';
  end if;

  -- Mesma regra do concluir: admin opera qualquer serviço da organização;
  -- campo só o que é dela, ou um ainda sem dono — que ela reserva ao começar.
  if not is_admin() then
    if not is_campo() then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if v_s.executora_id is not null and v_s.executora_id <> v_uid then
      raise exception 'servico_de_outra_executora' using errcode = '42501';
    end if;
  end if;

  if v_s.status::text = 'executado' then
    raise exception 'ja_concluido' using errcode = '22023';
  end if;

  v_ja  := v_s.iniciado_em is not null;
  v_res := v_s.executora_id is null and v_uid is not null;

  -- COLUNAS QUALIFICADAS DE PROPÓSITO.
  --
  -- `returns table(iniciado_em ...)` declara uma VARIÁVEL PL/pgSQL com o nome
  -- da coluna. Sem o `servicos.` na leitura, o Postgres recusa:
  --     column reference "iniciado_em" is ambiguous
  --     It could refer to either a PL/pgSQL variable or a table column.
  -- E o RETURNING grava em variáveis locais pelo mesmo motivo.
  update servicos set
    -- COMEÇAR DUAS VEZES NÃO REINICIA O CRONÔMETRO. Sobrescrever `iniciado_em`
    -- num segundo toque zerava a duração da lavagem, e o painel passava a
    -- mostrar "3 minutos" numa limpeza de meia hora.
    iniciado_em  = coalesce(servicos.iniciado_em, now()),

    -- Nunca rouba: se já tem dono, o dono continua. Quem chega a um serviço
    -- sem dono fica com ele.
    executora_id = coalesce(servicos.executora_id, v_uid),

    -- A foto do antes só é gravada quando vem uma nova.
    foto_antes_url = coalesce(p_foto_antes, servicos.foto_antes_url),

    status = case when servicos.status::text = 'pendente'
                  then 'agendado'::sureya_status_servico
                  else servicos.status end
  where id = p_servico
  returning servicos.iniciado_em, servicos.foto_antes_url into v_ini, v_foto;

  return query select v_ini, v_ja, v_foto, v_res;
end
$function$;

comment on function public.sureya_iniciar_lavagem(uuid, text) is
  'Build 2 lote 2: comeca a lavagem autorizando no banco. Campo so inicia o '
  'servico atribuido a ela, ou um sem dono, que passa a ser dela. Idempotente: '
  'comecar duas vezes nao reinicia o cronometro nem troca a executora.';

revoke execute on function public.sureya_iniciar_lavagem(uuid, text) from public, anon;
grant  execute on function public.sureya_iniciar_lavagem(uuid, text) to authenticated, service_role;

commit;


-- ============================================================================
-- CONFERÊNCIA
--
-- Com a sessão de CAMPO (Ana), num serviço atribuído a outra pessoa (Nina):
--     select * from sureya_iniciar_lavagem('<servico-da-nina>');
--     → ERROR: servico_de_outra_executora
--
-- Com a sessão da própria Nina, duas vezes seguidas:
--     → a segunda devolve ja_iniciado = true e o MESMO iniciado_em
--
-- Num serviço sem executora, com a sessão de qualquer pessoa de campo:
--     → reservado = true, e `executora_id` passa a ser dela
--
-- Depois disso, `/api/campo/iniciar` deixa de usar service role: passa a
-- chamar esta função com a sessão, e a fronteira vale para as duas portas.
-- ============================================================================
