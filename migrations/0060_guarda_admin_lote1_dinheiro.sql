-- ============================================================================
-- SUREYA — 0060 · BUILD 1b (lote 1) · A GUARDA DE ADMIN NAS FUNÇÕES DE DINHEIRO
--
-- Rodar DEPOIS da 0055 (is_admin), da 0057 (revoga PUBLIC) e da 0059 (quitacoes e colunas de movimentos).
--
-- O QUE FALTAVA
-- ---------------------------------------------------------------------------
-- A 0057 fechou a porta para `anon`. Sobrou a porta interna: `authenticated`
-- inclui `campo` E `admin`, e nenhuma dessas funções olha `papel`. Uma conta de
-- campo ainda pode chamar `sureya_pagamento_avulso` direto pelo PostgREST, com
-- a chave anônima e o token de sessão que estão no navegador dela.
--
-- Como são `SECURITY DEFINER`, RLS não ajuda: elas rodam com os privilégios do
-- dono. A única fronteira possível é uma checagem DENTRO da função.
--
-- A GUARDA
-- ---------------------------------------------------------------------------
--     if auth.uid() is not null and not is_admin() then
--       raise exception 'somente_admin' using errcode = '42501';
--     end if;
--
-- Por que `auth.uid() is not null and`, em vez de só `not is_admin()`:
--
--   · com sessão de campo  → uid presente, is_admin() falso  → NEGA.  ✅
--   · com sessão de admin  → uid presente, is_admin() true    → passa. ✅
--   · com `anon`           → não chega aqui: a 0057 revogou o EXECUTE. ✅
--   · sem sessão nenhuma   → só pode ser `service_role`, o único outro papel
--                            com EXECUTE depois da 0057.               → passa.
--
-- Liberar `service_role` não enfraquece nada: quem tem a chave de service role
-- ignora RLS, policy e guarda de qualquer jeito — ela é a chave mestra, e vive
-- só no servidor. O que a condição evita é quebrar um caminho server-side
-- legítimo por um erro de autorização que não protegeria ninguém.
--
-- Conferido no código antes de escrever: as 17 funções deste lote são chamadas
-- com `auth.db` (o cliente da sessão), em rota protegida por `exigirAdmin()`.
-- Nenhum cron chama função `sureya_*`. Então `auth.uid()` está presente em
-- todas as chamadas reais e a guarda estrita já bastaria — a condição acima é
-- cinto e suspensório.
--
-- `errcode 42501` é `insufficient_privilege`. Com ele, o PostgREST devolve
-- **403**, não 500 — que é o que a contraprova e a auditoria esperam ler.
--
-- OS CORPOS SÃO OS DO BANCO, SEM ALTERAÇÃO
-- ---------------------------------------------------------------------------
-- Cada função abaixo é o texto devolvido por `pg_get_functiondef()` na
-- extração, com a guarda acrescentada e mais nada. Nenhuma regra de negócio
-- foi tocada. Este arquivo também é o começo do versionamento que o Build 0
-- exige: até aqui, estas 17 funções só existiam dentro do banco.
--
-- FORA DESTE LOTE (vão no 0060): as ~18 funções administrativas que não mexem
-- em dinheiro (agenda, conversas, portal, GPS, IA, indicação) e as 4 de campo,
-- que precisam de guarda diferente (`is_campo() or is_admin()`).
-- ============================================================================

begin;

-- ############################################################################
-- PARTE A — ENTRADA DE DINHEIRO
-- ############################################################################

create or replace function public.sureya_pagamento_avulso(
  p_cliente uuid, p_valor numeric, p_data date default current_date,
  p_descricao text default null::text, p_sem_comprovante boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_id uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'valor_invalido'; end if;
  if not exists (select 1 from clientes where id = p_cliente and org_id = v_org) then
    raise exception 'cliente_nao_encontrado';
  end if;

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc,
                          descricao, data, sem_comprovante)
  values (v_org, p_cliente, 'credito', p_valor, 'conciliacao_manual', 'confirmado',
          coalesce(p_descricao, case when p_sem_comprovante
            then 'Pagamento informado (sem comprovante)' else 'Pagamento registrado' end),
          p_data, p_sem_comprovante)
  returning id into v_id;

  -- pagou: a cobrança automática para
  update clientes set cobranca_nivel = 0, cobranca_em = null where id = p_cliente;
  return v_id;
end $function$;


create or replace function public.sureya_registrar_pagamento_manual(
  p_cliente uuid, p_valor numeric, p_data date, p_descricao text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id  uuid;
  v_org uuid := current_org_id();
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  if v_org is null then raise exception 'sem org'; end if;
  -- confere que o cliente é da org
  if not exists (select 1 from clientes where id = p_cliente and org_id = v_org) then
    raise exception 'cliente % nao encontrado nesta org', p_cliente;
  end if;

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (v_org, p_cliente, 'credito', p_valor, 'conciliacao_manual', 'confirmado',
          coalesce(p_descricao, 'Pagamento conferido no extrato'), p_data)
  returning id into v_id;

  return v_id;
end $function$;


create or replace function public.sureya_registrar_entrada_banco(
  p_valor numeric, p_data date, p_remetente text default null::text,
  p_cliente uuid default null::uuid, p_identificador text default null::text,
  p_observacao text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_id uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'valor_invalido'; end if;

  -- mesma transação lançada duas vezes? devolve a que já existe
  if p_identificador is not null then
    select id into v_id from entradas_banco
     where org_id = v_org and identificador = p_identificador;
    if v_id is not null then return v_id; end if;
  end if;

  insert into entradas_banco (org_id, valor, data, remetente, identificador, observacao)
  values (v_org, p_valor, p_data, p_remetente, p_identificador, p_observacao)
  returning id into v_id;

  -- se já se sabe de quem é, credita na hora
  if p_cliente is not null then
    perform sureya_identificar_entrada(v_id, p_cliente);
  end if;

  return v_id;
end $function$;


create or replace function public.sureya_identificar_entrada(p_entrada uuid, p_cliente uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_e record; v_mov uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select * into v_e from entradas_banco where id = p_entrada and org_id = v_org;
  if v_e is null then raise exception 'entrada_nao_encontrada'; end if;
  if v_e.movimento_id is not null then return v_e.movimento_id; end if;

  if not exists (select 1 from clientes where id = p_cliente and org_id = v_org) then
    raise exception 'cliente_nao_encontrado';
  end if;

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (v_org, p_cliente, 'credito', v_e.valor, 'conciliacao_manual', 'confirmado',
          'Pix recebido' || coalesce(' de ' || v_e.remetente, ''), v_e.data)
  returning id into v_mov;

  update entradas_banco set
    cliente_id = p_cliente, movimento_id = v_mov,
    identificada_em = clock_timestamp(), identificada_por = auth.uid()
  where id = p_entrada;

  -- entrou dinheiro: a cobrança automática para
  update clientes set cobranca_nivel = 0, cobranca_em = null where id = p_cliente;
  return v_mov;
end $function$;


create or replace function public.sureya_entrada_identificada(
  p_valor numeric, p_data date, p_cliente uuid, p_remetente text default null::text,
  p_identificador text default null::text, p_observacao text default null::text,
  p_debitos uuid[] default null::uuid[])
returns table(r_entrada uuid, r_movimento uuid, r_quitados integer, r_sobrou numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid; v_ent uuid; v_mov uuid; v_resta numeric; v_n int := 0; d record;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'valor_invalido'; end if;
  if not exists (select 1 from clientes c where c.id = p_cliente and c.org_id = v_org) then
    raise exception 'cliente_nao_encontrado';
  end if;

  if p_identificador is not null then
    select e.id, e.movimento_id into v_ent, v_mov
      from entradas_banco e
     where e.org_id = v_org and e.identificador = p_identificador;
    if v_ent is not null then
      return query select v_ent, v_mov, 0, 0::numeric;
      return;
    end if;
  end if;

  insert into entradas_banco (org_id, valor, data, remetente, identificador, observacao,
                              cliente_id, identificada_em, identificada_por)
  values (v_org, p_valor, p_data, p_remetente, p_identificador, p_observacao,
          p_cliente, clock_timestamp(), auth.uid())
  returning id into v_ent;

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (v_org, p_cliente, 'credito', p_valor, 'conciliacao_manual', 'confirmado',
          coalesce(nullif(p_observacao,''), 'Pix recebido' || coalesce(' de ' || p_remetente, '')),
          p_data)
  returning id into v_mov;

  update entradas_banco set movimento_id = v_mov where id = v_ent;
  update clientes set cobranca_nivel = 0, cobranca_em = null where id = p_cliente;

  v_resta := p_valor;
  for d in
    select * from sureya_debitos_em_aberto(p_cliente) x
    where p_debitos is null or x.movimento_id = any(p_debitos)
    order by x.data
  loop
    exit when v_resta <= 0.004;
    insert into quitacoes (org_id, credito_id, debito_id, valor)
    values (v_org, v_mov, d.movimento_id, least(v_resta, d.em_aberto))
    on conflict do nothing;
    v_resta := v_resta - least(v_resta, d.em_aberto);
    v_n := v_n + 1;
  end loop;

  return query select v_ent, v_mov, v_n, round(v_resta, 2);
end $function$;


create or replace function public.sureya_desidentificar_entrada(p_entrada uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_mov uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  select movimento_id into v_mov from entradas_banco where id = p_entrada and org_id = v_org;
  if v_mov is not null then
    delete from quitacoes where credito_id = v_mov;
    delete from movimentos where id = v_mov and org_id = v_org;
  end if;
  update entradas_banco set cliente_id = null, movimento_id = null,
         identificada_em = null, identificada_por = null
   where id = p_entrada and org_id = v_org;
  return found;
end $function$;


create or replace function public.sureya_saldo_abertura(
  p_cliente uuid, p_valor numeric, p_data date default current_date,
  p_nota text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id   uuid;
  v_org  uuid := current_org_id();
  v_tipo sureya_tipo_movimento;
  v_desc text;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  if v_org is null then
    raise exception 'sem org';
  end if;

  if not exists (select 1 from clientes where id = p_cliente and org_id = v_org) then
    raise exception 'cliente % nao encontrado nesta org', p_cliente;
  end if;

  -- limpa a abertura anterior desta familia (idempotente)
  delete from movimentos
   where org_id = v_org
     and cliente_id = p_cliente
     and origem = 'ajuste'::sureya_origem_movimento
     and descricao like 'Saldo de abertura (migração)%';

  -- zero = so apagar a abertura antiga e sair
  if p_valor is null or abs(p_valor) < 0.005 then
    return null;
  end if;

  -- AQUI ESTAVA O ERRO: sem o ::sureya_tipo_movimento o Postgres trata
  -- 'credito'/'debito' como text e recusa o insert na coluna enum.
  v_tipo := (case when p_valor >= 0 then 'credito' else 'debito' end)::sureya_tipo_movimento;

  v_desc := 'Saldo de abertura (migração)'
            || coalesce(' — ' || nullif(btrim(p_nota), ''), '');

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (
    v_org, p_cliente, v_tipo, abs(p_valor),
    'ajuste'::sureya_origem_movimento,
    'confirmado'::sureya_status_conc,
    v_desc,
    coalesce(p_data, current_date)
  )
  returning id into v_id;

  return v_id;
end $function$;


-- ############################################################################
-- PARTE B — CONFERÊNCIA E CONCILIAÇÃO
-- ############################################################################

create or replace function public.sureya_conciliar_comprovante(p_comprovante uuid, p_aprovar boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status sureya_status_conc;
  v_org    uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_status := case when p_aprovar then 'confirmado' else 'rejeitado' end;

  update comprovantes
     set status = v_status
   where id = p_comprovante
     and org_id = current_org_id()
  returning org_id into v_org;

  if v_org is null then
    raise exception 'comprovante % nao encontrado nesta org', p_comprovante;
  end if;

  update movimentos
     set status_conc = v_status
   where comprovante_id = p_comprovante
     and org_id = current_org_id();
end $function$;


create or replace function public.sureya_conferir_no_banco(
  p_movimento uuid, p_conferido boolean default true, p_nota text default null::text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then return false; end if;

  update movimentos set
    conferido_em     = case when p_conferido then clock_timestamp() else null end,
    conferido_por    = case when p_conferido then auth.uid() else null end,
    nota_conferencia = p_nota
  where id = p_movimento and org_id = v_org;

  return found;
end $function$;


-- ############################################################################
-- PARTE C — SAÍDA DE DINHEIRO E EQUIPE
-- ############################################################################

create or replace function public.sureya_pagar_equipe(
  p_membro uuid, p_valor numeric default null::numeric,
  p_data date default current_date, p_descricao text default null::text)
returns table(pago numeric, itens_quitados integer, lancamento uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid; v_cat uuid; v_lanc uuid;
  v_saldo numeric; v_pagar numeric; v_n int := 0; r record; v_resta numeric;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select coalesce(sum(valor),0) into v_saldo
    from conta_equipe
   where org_id = v_org and membro_id = p_membro and pago_em is null
     and tipo in ('reembolso','diaria','bonus');

  v_pagar := least(coalesce(p_valor, v_saldo), v_saldo);
  if v_pagar <= 0 then raise exception 'nada_a_pagar'; end if;

  -- sai do caixa, classificado
  select id into v_cat from categorias_financeiras
   where org_id = v_org and nome = 'Pagamento da ajudante' limit 1;

  insert into lancamentos (org_id, categoria_id, tipo, valor, data, descricao)
  values (v_org, v_cat, 'saida', v_pagar, p_data,
          coalesce(p_descricao, 'Acerto com a ajudante'))
  returning id into v_lanc;

  -- quita do mais antigo para o mais novo
  v_resta := v_pagar;
  for r in
    select id, valor from conta_equipe
     where org_id = v_org and membro_id = p_membro and pago_em is null
       and tipo in ('reembolso','diaria','bonus')
     order by data, created_at
  loop
    exit when v_resta <= 0;
    if r.valor <= v_resta then
      update conta_equipe set pago_em = clock_timestamp(), lancamento_id = v_lanc
       where id = r.id;
      v_resta := v_resta - r.valor;
      v_n := v_n + 1;
    else
      -- pagamento parcial: quebra o item em pago e restante
      update conta_equipe set valor = valor - v_resta where id = r.id;
      insert into conta_equipe (org_id, membro_id, tipo, valor, data, descricao,
                                pago_em, lancamento_id)
      select org_id, membro_id, tipo, v_resta, data,
             coalesce(descricao,'') || ' (parte)', clock_timestamp(), v_lanc
        from conta_equipe where id = r.id;
      v_resta := 0;
      v_n := v_n + 1;
    end if;
  end loop;

  return query select v_pagar, v_n, v_lanc;
end $function$;


create or replace function public.sureya_reembolso_material(
  p_membro uuid, p_material uuid, p_quantidade numeric, p_valor numeric,
  p_data date default current_date, p_comprovante text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_compra uuid; v_id uuid; v_nome text; v_estoque numeric;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'valor_invalido'; end if;

  select nome, estoque into v_nome, v_estoque
    from materiais where id = p_material and org_id = v_org;
  if v_nome is null then raise exception 'material_nao_encontrado'; end if;

  -- 1. entra no estoque
  insert into compras_material (org_id, material_id, quantidade, valor_total, data)
  values (v_org, p_material, p_quantidade, p_valor, p_data)
  returning id into v_compra;

  update materiais set
    estoque = coalesce(estoque,0) + p_quantidade,
    custo_unitario = case when p_quantidade > 0
                          then round(p_valor / p_quantidade, 2)
                          else custo_unitario end,
    atualizado_em = now()
  where id = p_material;

  -- 2. vira dívida com ela, até ser paga
  insert into conta_equipe (org_id, membro_id, tipo, valor, data, descricao,
                            compra_id, comprovante_url)
  values (v_org, p_membro, 'reembolso', p_valor, p_data,
          'Comprou ' || trim(to_char(p_quantidade,'FM999990.99')) || ' de ' || v_nome,
          v_compra, p_comprovante)
  returning id into v_id;

  return v_id;
end $function$;


create or replace function public.sureya_entregar_extra(p_pedido uuid, p_foto text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_ped record; v_mov uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select * into v_ped from pedidos_extras where id = p_pedido and org_id = v_org;
  if v_ped is null then raise exception 'pedido_nao_encontrado'; end if;
  if v_ped.status = 'entregue' then return v_ped.movimento_id; end if;

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (v_org, v_ped.cliente_id, 'debito', v_ped.total, 'servico', 'confirmado',
          v_ped.nome || (case when v_ped.quantidade > 1
                              then ' (' || trim(to_char(v_ped.quantidade,'FM999990.99')) || ')'
                              else '' end),
          current_date)
  returning id into v_mov;

  update pedidos_extras set
    status = 'entregue', data_entrega = current_date,
    foto_url = coalesce(p_foto, foto_url), movimento_id = v_mov
  where id = p_pedido;

  return v_mov;
end $function$;


-- ############################################################################
-- PARTE D — PREÇO DO CONTRATO
-- ############################################################################

create or replace function public.sureya_aplicar_reajuste(
  p_plano uuid, p_novo_valor numeric, p_motivo text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_ant numeric;
  v_cli uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  select org_id, valor_vigente, cliente_id
    into v_org, v_ant, v_cli
    from planos
   where id = p_plano and org_id = current_org_id();

  if v_org is null then
    raise exception 'plano % nao encontrado nesta org', p_plano;
  end if;

  insert into reajustes (org_id, plano_id, cliente_id, valor_anterior, valor_novo, motivo, aprovado_por)
  values (v_org, p_plano, v_cli, v_ant, p_novo_valor, coalesce(p_motivo, 'Reajuste'), auth.uid());

  update planos
     set valor_vigente      = p_novo_valor,
         -- A LINHA NOVA: as duas colunas guardam o preço de UMA limpeza.
         -- Sem ela, o próximo Salvar na tela de Planos regravava valor_vigente
         -- a partir do valor_mensal antigo e o reajuste evaporava.
         valor_mensal       = p_novo_valor,
         data_valor_vigente = current_date
   where id = p_plano;
  -- O gatilho da migration 0058 leva o novo valor para `tumulos.valor_lavagem`,
  -- que é de onde a cobrança lê desde a 0049.
end $function$;


create or replace function public.sureya_adiar_reajuste(
  p_plano uuid, p_meses integer default 3, p_motivo text default null::text)
returns date
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_ate date;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  v_ate := current_date + (greatest(1, coalesce(p_meses,3)) || ' months')::interval;

  update planos set
    reajuste_adiado_ate = v_ate,
    reajuste_motivo_adiamento = p_motivo
  where id = p_plano and org_id = v_org;

  if not found then raise exception 'plano_nao_encontrado'; end if;
  return v_ate;
end $function$;


-- ############################################################################
-- PARTE E — DESTRUIÇÃO E ESTORNO
-- ############################################################################

create or replace function public.sureya_estornar_servico(p_servico uuid, p_motivo text)
returns table(movimento_estorno uuid, valor_estornado numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid; v_s record;
  v_deb_id uuid; v_deb_cliente uuid; v_deb_valor numeric;
  v_novo uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'motivo_obrigatorio'; end if;

  select * into v_s from servicos where id = p_servico and org_id = v_org;
  if not found then raise exception 'servico_nao_encontrado'; end if;
  if v_s.estornado_em is not null then raise exception 'ja_estornado'; end if;

  update servicos set
    status = 'cancelado',
    estornado_em = clock_timestamp(),
    motivo_estorno = p_motivo
  where id = p_servico;

  -- pega só as colunas que interessam, e usa FOUND para saber se achou
  select id, cliente_id, valor into v_deb_id, v_deb_cliente, v_deb_valor
    from movimentos
   where org_id = v_org and servico_id = p_servico and tipo = 'debito'
     and status_conc = 'confirmado'
     and estorna_movimento is null
   order by created_at limit 1;

  if not found then
    return query select null::uuid, 0::numeric;
    return;
  end if;

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc,
                          descricao, data, servico_id, estorna_movimento)
  values (v_org, v_deb_cliente, 'credito', v_deb_valor, 'ajuste', 'confirmado',
          'Correção: ' || p_motivo, current_date, p_servico, v_deb_id)
  returning id into v_novo;

  return query select v_novo, v_deb_valor;
end $function$;


create or replace function public.sureya_excluir_servico(p_servico uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_status text;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then return false; end if;

  select status::text into v_status from servicos where id = p_servico and org_id = v_org;
  if v_status is null then return false; end if;
  if v_status = 'executado' then
    raise exception 'servico_ja_executado';   -- executado vira histórico, não se apaga
  end if;

  delete from ocorrencias where servico_id = p_servico;
  delete from avaliacoes  where servico_id = p_servico;
  delete from movimentos  where servico_id = p_servico;   -- não deveria haver, mas garante
  delete from servicos    where id = p_servico and org_id = v_org;
  return true;
end $function$;


create or replace function public.sureya_anonimizar_cliente(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

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
end $function$;


-- ############################################################################
-- PARTE F — LEITURA DO FINANCEIRO
--
-- Estas são `language sql`, sem bloco `begin`, então a guarda entra como mais
-- uma condição do `where`. O efeito para o campo é ZERO LINHAS em vez de erro —
-- que é uma negação igualmente válida, e a que a contraprova aceita.
--
-- `sureya_debitos_em_aberto` é chamada de dentro de `sureya_entrada_identificada`.
-- Como `auth.uid()` atravessa `SECURITY DEFINER` (é um GUC da sessão, não o
-- papel do banco), a chamada interna feita por uma admin continua enxergando
-- tudo. Uma conta de campo não chega nem à função de fora.
-- ############################################################################

create or replace function public.sureya_debitos_em_aberto(p_cliente uuid)
returns table(movimento_id uuid, servico_id uuid, descricao text, data date, valor numeric,
              ja_quitado numeric, em_aberto numeric, jazigo text, data_lavagem date)
language sql
security definer
set search_path to 'public'
as $function$
  select m.id, m.servico_id, m.descricao, m.data, m.valor,
         coalesce((select sum(q.valor) from quitacoes q where q.debito_id = m.id), 0),
         m.valor - coalesce((select sum(q.valor) from quitacoes q where q.debito_id = m.id), 0),
         coalesce(t.identificacao, '—'),
         s.data_executada::date
  from movimentos m
  left join servicos s on s.id = m.servico_id
  left join tumulos  t on t.id = s.tumulo_id
  where m.org_id = current_org_id()
    and (auth.uid() is null or is_admin())      -- guarda (migration 0060)
    and m.cliente_id = p_cliente
    and m.tipo = 'debito'
    and m.status_conc = 'confirmado'
    and m.valor > coalesce((select sum(q.valor) from quitacoes q where q.debito_id = m.id), 0)
  order by m.data, m.created_at;
$function$;


create or replace function public.sureya_a_conferir_no_banco(p_meses integer default 6)
returns table(id uuid, cliente_id uuid, cliente text, telefone text, valor numeric,
              data date, descricao text, dias_esperando integer, conferido boolean, nota text)
language sql
security definer
set search_path to 'public'
as $function$
  select m.id, m.cliente_id, coalesce(c.nome,'—'), coalesce(c.telefone,''),
         m.valor, m.data, m.descricao,
         (current_date - m.data)::int,
         m.conferido_em is not null,
         m.nota_conferencia
  from movimentos m
  left join clientes c on c.id = m.cliente_id
  where m.org_id = current_org_id()
    and (auth.uid() is null or is_admin())      -- guarda (migration 0060)
    and m.tipo = 'credito'
    and m.sem_comprovante = true
    and m.data >= current_date - (p_meses || ' months')::interval
  order by m.conferido_em nulls first, m.data desc;
$function$;


create or replace function public.sureya_fluxo_caixa(p_mes text)
returns table(categoria text, tipo text, grupo text, total numeric, qtd integer)
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(c.nome, 'Sem categoria'), l.tipo, coalesce(c.grupo,'operacional'),
         sum(l.valor), count(*)::int
  from lancamentos l
  left join categorias_financeiras c on c.id = l.categoria_id
  where l.org_id = current_org_id()
    and (auth.uid() is null or is_admin())      -- guarda (migration 0060)
    and to_char(l.data, 'YYYY-MM') = p_mes
  group by 1, 2, 3
  order by l.tipo desc, sum(l.valor) desc;
$function$;


create or replace function public.sureya_saldo_equipe()
returns table(membro_id uuid, nome text, a_receber numeric, itens integer, mais_antigo date)
language sql
security definer
set search_path to 'public'
as $function$
  select ce.membro_id, coalesce(m.nome,'—'),
         coalesce(sum(ce.valor),0), count(*)::int, min(ce.data)
  from conta_equipe ce
  left join membros m on m.user_id = ce.membro_id and m.org_id = ce.org_id
  where ce.org_id = current_org_id()
    and (auth.uid() is null or is_admin())      -- guarda (migration 0060)
    and ce.pago_em is null
    and ce.tipo in ('reembolso','diaria','bonus')
  group by ce.membro_id, m.nome
  order by 3 desc;
$function$;


create or replace function public.sureya_palpites_entrada(p_entrada uuid)
returns table(cliente_id uuid, nome text, motivo text, forca integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_e record;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  select * into v_e from entradas_banco where id = p_entrada and org_id = v_org;
  if v_e is null then return; end if;

  return query
  with saldos as (
    select c.id, c.nome, c.telefone,
           coalesce(sum(case when m.status_conc='confirmado' and m.tipo='credito' then m.valor
                             when m.status_conc='confirmado' and m.tipo='debito' then -m.valor
                             else 0 end), 0) as saldo
    from clientes c left join movimentos m on m.cliente_id = c.id
    where c.org_id = v_org and c.anonimizado_em is null
    group by c.id, c.nome, c.telefone
  )
  select s.id, s.nome,
    case
      when v_e.remetente is not null
       and lower(unaccent_simples(s.nome)) like '%' || lower(unaccent_simples(split_part(v_e.remetente,' ',1))) || '%'
        then 'o nome bate com o remetente'
      when abs(abs(s.saldo) - v_e.valor) < 0.01 and s.saldo < 0
        then 'deve exatamente este valor'
      else 'deve um valor próximo'
    end,
    case
      when v_e.remetente is not null
       and lower(unaccent_simples(s.nome)) like '%' || lower(unaccent_simples(split_part(v_e.remetente,' ',1))) || '%'
        then 100
      when abs(abs(s.saldo) - v_e.valor) < 0.01 and s.saldo < 0 then 90
      when s.saldo < 0 and abs(abs(s.saldo) - v_e.valor) <= 20 then 60
      else 0
    end
  from saldos s
  where (v_e.remetente is not null
         and lower(unaccent_simples(s.nome)) like '%' || lower(unaccent_simples(split_part(v_e.remetente,' ',1))) || '%')
     or (s.saldo < 0 and abs(abs(s.saldo) - v_e.valor) <= 20)
  order by 4 desc, 2
  limit 8;
end $function$;


-- ----------------------------------------------------------------------------
-- `create or replace` recria os privilégios padrão em alguns cenários.
-- Repetir o fecho da 0057 para estas 22 funções custa nada e garante que a
-- porta não reabriu no caminho.
-- ----------------------------------------------------------------------------
do $$
declare f record; assinatura text;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'sureya_pagamento_avulso','sureya_registrar_pagamento_manual',
         'sureya_registrar_entrada_banco','sureya_identificar_entrada',
         'sureya_entrada_identificada','sureya_desidentificar_entrada',
         'sureya_saldo_abertura','sureya_conciliar_comprovante',
         'sureya_conferir_no_banco','sureya_pagar_equipe',
         'sureya_reembolso_material','sureya_entregar_extra',
         'sureya_aplicar_reajuste','sureya_adiar_reajuste',
         'sureya_estornar_servico','sureya_excluir_servico',
         'sureya_anonimizar_cliente','sureya_debitos_em_aberto',
         'sureya_a_conferir_no_banco','sureya_fluxo_caixa',
         'sureya_saldo_equipe','sureya_palpites_entrada')
  loop
    assinatura := format('public.%I(%s)', f.proname, f.args);
    execute format('revoke execute on function %s from public, anon;', assinatura);
    execute format('grant  execute on function %s to authenticated, service_role;', assinatura);
  end loop;
end $$;

commit;


-- ============================================================================
-- CONFERÊNCIA
--
-- (a) Com a conta de ADMIN, tudo continua funcionando?
--     Registre um pagamento, concilie um comprovante, abra o fluxo de caixa e
--     a conferência bancária. Nada pode ter mudado.
--
-- (b) Com a conta de CAMPO, direto no PostgREST (não pela tela):
--
--     select * from sureya_pagamento_avulso('<cliente>', 1);
--     → ERROR: somente_admin        (o PostgREST devolve 403)
--
--     select * from sureya_debitos_em_aberto('<cliente>');
--     → zero linhas
--
-- (c) A contraprova automatiza isso:
--     npm run contraprova
--     Os itens P0 de "campo não lê financeiro" ainda vão falhar — aqueles são
--     leitura DIRETA das tabelas, e é a policy (Consulta A) que os fecha.
--     Esta migration fecha o caminho pelas FUNÇÕES.
--
-- (d) Nenhuma função ficou sem `search_path`:
--     select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and p.proname like 'sureya\_%'
--        and p.prosecdef and p.proconfig is null;
--     → tem de voltar vazia (fora deste lote, ainda pode haver — vai no 0060).
-- ============================================================================
