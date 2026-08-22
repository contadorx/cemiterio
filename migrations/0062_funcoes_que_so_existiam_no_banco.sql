-- ============================================================================
-- SUREYA — 0062 · AS 15 FUNÇÕES QUE SÓ EXISTIAM DENTRO DO BANCO
--
-- COMO ESTE NÚMERO FOI APURADO
-- ---------------------------------------------------------------------------
-- Rodando a trilha inteira do repositório contra um PostgreSQL 16 limpo, o
-- banco resultante ficou com **41** funções `sureya_*`. A extração de produção
-- devolveu **56**. A diferença, listada abaixo, é o que nasceu no SQL Editor e
-- nunca voltou para o repositório.
--
-- Não é estimativa: é `comm` entre duas listas, uma delas produzida pelo
-- próprio Postgres depois de aplicar as 46 migrations.
--
-- POR QUE ISSO IMPORTA MAIS DO QUE PARECE
-- ---------------------------------------------------------------------------
-- Entre as 15 estão peças centrais, não acessórios:
--
--   sureya_proximo_dia_util        respeita jornada e feriados; usada por
--                                  remarcar, pular, reorganizar e conversão de lead
--   sureya_reagenda_apos_execucao  o gatilho que reagenda depois de cada lavagem
--   sureya_lead_vira_cliente       converte lead em família, jazigo e plano
--   sureya_familia_para_cliente    cria a família automaticamente no cadastro
--   sureya_contadores_conversas    a aba "Precisam de você" do atendimento
--   sureya_resultado_por_jazigo    a margem por jazigo do financeiro
--
-- Enquanto elas viverem só no banco, restaurar um backup em ambiente limpo
-- devolve os DADOS e não devolve o SISTEMA. É o P0 nº 4 da auditoria.
--
-- OS CORPOS SÃO OS DA EXTRAÇÃO, SEM ALTERAÇÃO DE REGRA
-- ---------------------------------------------------------------------------
-- Cada função abaixo é o texto de `pg_get_functiondef()` em produção. As
-- únicas mudanças são as necessárias para o arquivo rodar num banco limpo, e
-- estão comentadas onde ocorrem. Nenhuma regra de negócio foi tocada — este
-- arquivo é para o repositório passar a DESCREVER o que existe, não para
-- mudar o que existe.
--
-- ⚠️ FALTAM OS `CREATE TRIGGER`
-- Três destas são funções de gatilho (`atualiza_estado_conversa`,
-- `familia_para_cliente`, `reagenda_apos_execucao`). A extração devolveu as
-- FUNÇÕES; os gatilhos que as ligam às tabelas estão na seção 10 da migration
-- 0053, que ainda não foi rodada. Sem eles, o banco limpo tem a função e não
-- tem o disparo. Rode a seção 10 e mande o resultado.
-- ============================================================================

begin;

-- ############################################################################
-- AGENDA E JORNADA
-- ############################################################################

create or replace function public.sureya_proximo_dia_util(p_data date)
returns date
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_dias int[]; v_org uuid; v_d date := p_data; v_guarda int := 0;
begin
  v_org := current_org_id();
  select coalesce(dias_semana, '{1,2,3,4,5,6}') into v_dias from orgs where id = v_org;
  if v_dias is null then v_dias := '{1,2,3,4,5,6}'; end if;
  while v_guarda < 40 loop
    exit when extract(dow from v_d)::int = any(v_dias)
      and not exists (select 1 from dias_sem_campo d where d.org_id = v_org and d.data = v_d);
    v_d := v_d + 1;
    v_guarda := v_guarda + 1;
  end loop;
  return v_d;
end $function$;


create or replace function public.sureya_reorganizar_agenda(p_dias_a_frente integer default 90)
returns table(movidos integer, para_hoje integer, dias_liberados integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid; r record; v_nova date;
  v_mov int := 0; v_hoje int := 0; v_dias int := 0;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select count(distinct data_prevista) into v_dias
  from servicos s
  where s.org_id = v_org and s.status in ('pendente','agendado')
    and s.data_prevista between current_date - 30 and current_date + p_dias_a_frente
    and s.data_prevista <> sureya_proximo_dia_util(s.data_prevista);

  for r in
    select s.id, s.data_prevista
    from servicos s
    where s.org_id = v_org and s.status in ('pendente','agendado')
      and s.data_prevista is not null
      and s.data_prevista between current_date - 30 and current_date + p_dias_a_frente
      and s.data_prevista <> sureya_proximo_dia_util(s.data_prevista)
    order by s.data_prevista
  loop
    v_nova := sureya_proximo_dia_util(greatest(r.data_prevista, current_date));
    update servicos
       set data_prevista = v_nova, ordem_dia = null, status = 'pendente'
     where id = r.id;
    v_mov := v_mov + 1;
    if v_nova = current_date then v_hoje := v_hoje + 1; end if;
  end loop;

  return query select v_mov, v_hoje, v_dias;
end $function$;


create or replace function public.sureya_remarcar_servico(
  p_servico uuid, p_nova_data date, p_replanejar boolean default true, p_motivo text default null::text)
returns table(nova_data date, proxima_do_jazigo date, seguintes_movidas integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid; v_s record; v_plano record;
  v_intervalo int; v_data date; v_prox date; v_seg int := 0;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select * into v_s from servicos where id = p_servico and org_id = v_org;
  if v_s is null then raise exception 'servico_nao_encontrado'; end if;
  if v_s.status = 'executado' then raise exception 'servico_ja_executado'; end if;

  v_data := sureya_proximo_dia_util(p_nova_data);

  update servicos set
    data_prevista = v_data, status = 'agendado', ordem_dia = null,
    motivo_adiamento = coalesce(p_motivo, motivo_adiamento)
  where id = p_servico;

  if not p_replanejar or v_s.plano_id is null then
    return query select v_data, null::date, 0;
    return;
  end if;

  select id, cadencia::text as cadencia,
         coalesce(lavagens_por_ciclo, qtd_por_passagem, 1) as lavagens
    into v_plano from planos where id = v_s.plano_id;

  v_intervalo := sureya_intervalo_dias(v_plano.cadencia, v_plano.lavagens);
  if v_intervalo <= 0 then
    return query select v_data, null::date, 0;
    return;
  end if;

  v_prox := sureya_proximo_dia_util(v_data + v_intervalo);
  update planos set proximo_servico = v_prox where id = v_plano.id;

  with seguintes as (
    select id, (row_number() over (order by data_prevista nulls last, id))::int as n
    from servicos
    where org_id = v_org and plano_id = v_s.plano_id and id <> p_servico
      and status in ('pendente','agendado')
      and (data_prevista is null or data_prevista > v_s.data_prevista)
  )
  update servicos s set
    data_prevista = sureya_proximo_dia_util(v_data + (v_intervalo * seg.n)),
    ordem_dia = null,
    status = 'pendente'
  from seguintes seg
  where s.id = seg.id;
  get diagnostics v_seg = row_count;

  return query select v_data, v_prox, v_seg;
end $function$;


create or replace function public.sureya_pular_servico(p_servico uuid, p_motivo text default null::text)
returns date
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_s record; v_plano record; v_intervalo int; v_prox date;
begin
  v_org := current_org_id();
  select * into v_s from servicos where id = p_servico and org_id = v_org;
  if v_s is null or v_s.status = 'executado' then return null; end if;

  update servicos set status = 'pulado',
         motivo_adiamento = coalesce(p_motivo, motivo_adiamento)
   where id = p_servico;

  if v_s.plano_id is null then return null; end if;

  select cadencia::text as cadencia,
         coalesce(lavagens_por_ciclo, qtd_por_passagem, 1) as lavagens
    into v_plano from planos where id = v_s.plano_id;

  v_intervalo := sureya_intervalo_dias(v_plano.cadencia, v_plano.lavagens);
  if v_intervalo <= 0 then return null; end if;

  -- pulou esta: a próxima é a que já estava prevista adiante
  v_prox := sureya_proximo_dia_util(coalesce(v_s.data_prevista, current_date) + v_intervalo);
  update planos set proximo_servico = v_prox where id = v_s.plano_id;
  return v_prox;
end $function$;


create or replace function public.sureya_reagenda_apos_execucao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_plano record; v_intervalo int; v_prox date; v_feita date;
begin
  if new.status <> 'executado' or coalesce(old.status::text,'') = 'executado' then
    return new;
  end if;
  if new.plano_id is null then return new; end if;

  select id, cadencia::text as cadencia,
         coalesce(lavagens_por_ciclo, qtd_por_passagem, 1) as lavagens
    into v_plano
  from planos where id = new.plano_id;
  if v_plano is null then return new; end if;

  v_intervalo := sureya_intervalo_dias(v_plano.cadencia, v_plano.lavagens);
  if v_intervalo <= 0 then return new; end if;

  v_feita := coalesce(new.data_executada::date, current_date);
  v_prox := sureya_proximo_dia_util(v_feita + v_intervalo);

  -- a próxima ida conta do dia REAL: adiantou, a próxima anda junto
  update planos set proximo_servico = v_prox where id = v_plano.id;

  update servicos
     set data_prevista = v_prox, ordem_dia = null, status = 'pendente'
   where org_id = new.org_id and plano_id = new.plano_id and id <> new.id
     and status in ('pendente','agendado')
     and (data_prevista is null or data_prevista < v_prox);

  return new;
end $function$;


-- ############################################################################
-- CADASTRO E CONVERSÃO
-- ############################################################################

create or replace function public.sureya_familia_para_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_familia uuid;
  v_nome text;
begin
  if new.familia_id is not null then
    return new;
  end if;

  -- "Sr. João Batista da Silva" -> "Família Silva". Sem sobrenome, usa o nome
  -- todo: é melhor uma família com nome repetido que uma família sem nome.
  v_nome := regexp_replace(coalesce(trim(new.nome), 'Sem nome'),
                           '^(Sr\.|Sra\.|Dona|Dr\.|Dra\.|Seu)\s+', '', 'i');
  v_nome := 'Família ' || coalesce(
    nullif((regexp_split_to_array(v_nome, '\s+'))[
      array_length(regexp_split_to_array(v_nome, '\s+'), 1)
    ], ''),
    v_nome
  );

  insert into familias (org_id, nome, observacoes)
  values (new.org_id, v_nome, 'Criada junto com o cadastro de ' || coalesce(new.nome, '—'))
  returning id into v_familia;

  new.familia_id := v_familia;

  -- Primeira pessoa da família é quem paga, até alguém dizer o contrário.
  -- O índice único garante que continue sendo só uma.
  new.responsavel_financeiro := true;

  return new;
end $function$;


create or replace function public.sureya_lead_vira_cliente(
  p_lead uuid, p_nome text, p_jazigo text default null::text, p_quadra uuid default null::uuid,
  p_rua text default null::text, p_numero text default null::text,
  p_cadencia text default 'mensal'::text, p_lavagens integer default 1,
  p_valor_mensal numeric default 0, p_tratamento text default null::text)
returns table(r_cliente uuid, r_tumulo uuid, r_plano uuid, r_conversa uuid, r_mensagens integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid; v_lead record; v_cli uuid; v_tum uuid; v_plano uuid;
  v_conv uuid; v_meses int; v_n int := 0; m jsonb;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select * into v_lead from leads where id = p_lead and org_id = v_org;
  if not found then raise exception 'lead_nao_encontrado'; end if;

  -- esse telefone já é de alguém?
  select id into v_cli from clientes
   where org_id = v_org and telefone = v_lead.telefone;
  if v_cli is not null then raise exception 'telefone_ja_cadastrado'; end if;

  -- 1. a família, levando junto o que a Sureya já sabia
  insert into clientes (org_id, nome, telefone, tratamento, modo, ativo_ia,
                        observacoes, consentimento_em, consentimento_via)
  values (v_org, coalesce(nullif(trim(p_nome),''), v_lead.nome, v_lead.nome_wa, 'Cliente'),
          v_lead.telefone, p_tratamento, 'copiloto', true,
          nullif(concat_ws(E'\n',
            nullif(v_lead.contexto,''),
            case when v_lead.jazigo_ref is not null
                 then 'Jazigo de interesse: ' || v_lead.jazigo_ref end,
            'Veio de ' || coalesce(v_lead.origem,'contato') || ' em ' ||
              to_char(v_lead.created_at,'DD/MM/YYYY')
          ), ''),
          now(), 'conversa')
  returning id into v_cli;

  -- 2. o jazigo, se já se sabe qual é
  if coalesce(trim(p_jazigo),'') <> '' and p_quadra is not null then
    insert into tumulos (org_id, quadra_id, cliente_id, identificacao, rua, numero)
    values (v_org, p_quadra, v_cli, trim(p_jazigo), p_rua, p_numero)
    returning id into v_tum;

    -- 3. o plano
    v_meses := case p_cadencia
                 when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
                 when 'semestral' then 6 when 'anual' then 12 else 0 end;

    insert into planos (org_id, cliente_id, tumulo_id, cadencia, lavagens_por_ciclo,
                        qtd_por_passagem, valor_mensal, valor_vigente,
                        data_valor_vigente, proximo_servico, ativo,
                        momento_cobranca)
    values (v_org, v_cli, v_tum, p_cadencia::sureya_cadencia,
            greatest(1, coalesce(p_lavagens,1)), greatest(1, coalesce(p_lavagens,1)),
            coalesce(p_valor_mensal,0),
            case when v_meses > 0 then coalesce(p_valor_mensal,0) * v_meses
                 else coalesce(p_valor_mensal,0) end,
            current_date,
            case when v_meses > 0 then sureya_proximo_dia_util(current_date + 1) else null end,
            true,
            case when v_meses > 0 then 'depois' else 'contra_foto' end::sureya_momento_cobranca)
    returning id into v_plano;
    -- O gatilho da migration 0058 leva este contrato para `tumulos`, que é de
    -- onde a agenda lê desde a 0049. Sem ele, o lead convertido nunca entrava
    -- na esteira de lavagens.
  end if;

  -- 4. a conversa NÃO se perde: o que ela escreveu vira histórico da família
  insert into conversas (org_id, cliente_id, aberta, tipo)
  values (v_org, v_cli, true, 'familia')
  returning id into v_conv;

  for m in select * from jsonb_array_elements(coalesce(v_lead.mensagens, '[]'::jsonb)) loop
    insert into mensagens (org_id, conversa_id, cliente_id, direcao, autor, texto,
                           processada, created_at)
    values (v_org, v_conv, v_cli, 'entrada', 'cliente',
            coalesce(m->>'texto', ''), true,
            coalesce((m->>'t')::timestamptz, now()));
    v_n := v_n + 1;
  end loop;

  update leads set status = 'convertido', cliente_novo_id = v_cli where id = p_lead;

  return query select v_cli, v_tum, v_plano, v_conv, v_n;
end $function$;


-- ############################################################################
-- ATENDIMENTO
-- ############################################################################

create or replace function public.sureya_atualiza_estado_conversa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_agora timestamptz := clock_timestamp();
begin
  if new.direcao = 'entrada' then
    -- a família falou: a conversa passa a esperar resposta
    update conversas set
      ultima_msg_cliente_em = coalesce(new.created_at, v_agora),
      ultima_msg_em         = coalesce(new.created_at, v_agora),
      aguardando_desde      = coalesce(aguardando_desde, coalesce(new.created_at, v_agora)),
      ultimo_autor          = 'cliente',
      lida_em = null, lida_por = null,
      respondida_em = null, respondida_por = null,
      estado = 'sem_resposta',
      resolvida = false,
      updated_at = v_agora
    where id = new.conversa_id;
  else
    -- qualquer saída responde: humana, IA ou aprovação de rascunho
    update conversas set
      ultima_msg_em    = coalesce(new.created_at, v_agora),
      respondida_em    = coalesce(new.created_at, v_agora),
      lida_em          = coalesce(lida_em, v_agora),
      aguardando_desde = null,                       -- deixou de esperar
      ultimo_autor     = new.autor::text,
      estado           = 'respondida',
      updated_at       = v_agora
    where id = new.conversa_id;
  end if;
  return new;
end $function$;


create or replace function public.sureya_marcar_conversa(p_conversa uuid, p_acao text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_user uuid;
begin
  v_org := current_org_id();
  if v_org is null then return false; end if;
  v_user := auth.uid();

  if p_acao = 'lida' then
    update conversas set
      lida_em = clock_timestamp(), lida_por = v_user,
      estado = case when estado = 'sem_resposta' then 'lida_sem_resposta' else estado end
     where id = p_conversa and org_id = v_org;
  elsif p_acao = 'respondida' then
    update conversas set
      respondida_em = clock_timestamp(), respondida_por = v_user,
      lida_em = coalesce(lida_em, clock_timestamp()),
      estado = 'respondida'
     where id = p_conversa and org_id = v_org;
  else
    return false;
  end if;
  return found;
end $function$;


create or replace function public.sureya_contadores_conversas()
returns table(pendentes integer, aguardando integer, escaladas integer,
              arquivadas integer, resolvidas integer)
language sql
security definer
set search_path to 'public'
as $function$
  with base as (
    select c.id, c.tipo, c.estado, c.resolvida, c.escalada_humano, c.arquivada_em,
           exists (
             select 1 from interacoes_ia i
             where i.conversa_id = c.id and i.acao_humana is null
           ) as tem_rascunho
    from conversas c
    where c.org_id = current_org_id()
  )
  select
    -- exatamente o que a aba "Precisam de você" mostra
    count(*) filter (
      where arquivada_em is null and (
        tipo = 'equipe'
        or tem_rascunho
        or escalada_humano
        or estado in ('sem_resposta','lida_sem_resposta')
      )
    )::int,
    count(*) filter (
      where arquivada_em is null and estado in ('sem_resposta','lida_sem_resposta')
    )::int,
    count(*) filter (where arquivada_em is null and escalada_humano)::int,
    count(*) filter (where arquivada_em is not null)::int,
    count(*) filter (where arquivada_em is null and resolvida)::int
  from base;
$function$;


create or replace function public.sureya_conversa_equipe(p_membro uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_id uuid;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select id into v_id from conversas
   where org_id = v_org and tipo = 'equipe' and membro_id = p_membro
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into conversas (org_id, cliente_id, tipo, membro_id, aberta, fixada)
  values (v_org, null, 'equipe', p_membro, true, true)
  returning id into v_id;
  return v_id;
end $function$;


-- ############################################################################
-- PORTAL E PRODUTIVIDADE
-- ############################################################################

create or replace function public.sureya_portal_irmaos(p_token text)
returns table(token text, identificacao text, falecido_nome text, quadra text, rua text)
language sql
security definer
set search_path to 'public'
as $function$
  select t2.qr_token, t2.identificacao, t2.falecido_nome, q.codigo, t2.rua
  from tumulos t1
  join tumulos t2
    on t2.cliente_id = t1.cliente_id
   and t2.org_id = t1.org_id
   and t2.id <> t1.id
   and t2.qr_token is not null
  join quadras q on q.id = t2.quadra_id
  where t1.qr_token = p_token
    and p_token is not null
    and length(p_token) >= 16
    and t1.cliente_id is not null
  order by t2.identificacao
  limit 10;
$function$;


create or replace function public.sureya_custo_hora_efetivo()
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when o.custo_mensal_ajudante > 0 then
      round(o.custo_mensal_ajudante / greatest(1,
        (coalesce(array_length(o.dias_semana,1), 6) * 4.33)
        * greatest(1, extract(epoch from (o.hora_fim - o.hora_inicio))/3600
                      - coalesce(o.intervalo_almoco_min,0)/60.0)), 2)
    else coalesce(o.custo_hora_campo, 15) end
  from orgs o where o.id = current_org_id();
$function$;


create or replace function public.sureya_resultado_por_jazigo(p_meses integer default 12)
returns table(tumulo_id uuid, jazigo text, quadra text, rua text, cliente text,
              limpezas integer, receita numeric, minutos integer, minutos_medidos integer,
              medicao_pct numeric, custo_mao_obra numeric, custo_material numeric,
              custo_total numeric, margem numeric, margem_pct numeric)
language sql
security definer
set search_path to 'public'
as $function$
  with cfg as (
    select sureya_custo_hora_efetivo() as hora,
           coalesce(minutos_padrao_limpeza, 25) as padrao
    from orgs where id = current_org_id()
  ),
  media as (
    select coalesce(round(avg(coalesce(duracao_ajustada, duracao_minutos)))::int,
                    (select padrao from cfg)) as minutos
    from servicos
    where org_id = current_org_id() and status = 'executado'
      and coalesce(duracao_ajustada, duracao_minutos) > 0
  ),
  base as (
    select s.tumulo_id, t.identificacao, q.codigo as quadra, t.rua, c.nome as cliente,
           count(*)::int as limpezas,
           coalesce(sum(s.valor),0) as receita,
           sum(coalesce(s.duracao_ajustada, s.duracao_minutos, (select minutos from media)))::int as minutos,
           sum(coalesce(s.duracao_ajustada, s.duracao_minutos, 0))::int as minutos_medidos,
           count(coalesce(s.duracao_ajustada, s.duracao_minutos))::int as qtd_medidos,
           coalesce(sum(s.custo_estimado),0) as custo_material
    from servicos s
    join tumulos t on t.id = s.tumulo_id
    join quadras q on q.id = t.quadra_id
    left join clientes c on c.id = s.cliente_id
    where s.org_id = current_org_id() and s.status = 'executado'
      and s.data_executada >= now() - (p_meses || ' months')::interval
    group by s.tumulo_id, t.identificacao, q.codigo, t.rua, c.nome
  )
  select b.tumulo_id, b.identificacao, b.quadra, b.rua, b.cliente,
         b.limpezas, b.receita, b.minutos, b.minutos_medidos,
         round(100.0 * b.qtd_medidos / greatest(b.limpezas,1), 0),
         round((b.minutos / 60.0) * (select hora from cfg), 2),
         round(b.custo_material, 2),
         round((b.minutos / 60.0) * (select hora from cfg) + b.custo_material, 2),
         round(b.receita - ((b.minutos / 60.0) * (select hora from cfg) + b.custo_material), 2),
         case when b.receita > 0
              then round(100 * (b.receita - ((b.minutos/60.0)*(select hora from cfg) + b.custo_material)) / b.receita, 1)
              else null end
  from base b order by 14 asc nulls last;
$function$;


create or replace function public.sureya_sincroniza_lavagens()
returns trigger
language plpgsql
as $function$
begin
  if new.lavagens_por_ciclo is distinct from old.lavagens_por_ciclo then
    new.qtd_por_passagem := new.lavagens_por_ciclo;
  elsif new.qtd_por_passagem is distinct from old.qtd_por_passagem then
    new.lavagens_por_ciclo := new.qtd_por_passagem;
  end if;
  return new;
end $function$;


-- ----------------------------------------------------------------------------
-- Mesmo fecho da 0057, agora para estas 15.
-- ----------------------------------------------------------------------------
do $$
declare f record; assinatura text;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
           (p.prorettype = 'pg_catalog.trigger'::regtype) as eh_gatilho
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'sureya_proximo_dia_util','sureya_reorganizar_agenda','sureya_remarcar_servico',
         'sureya_pular_servico','sureya_reagenda_apos_execucao','sureya_familia_para_cliente',
         'sureya_lead_vira_cliente','sureya_atualiza_estado_conversa','sureya_marcar_conversa',
         'sureya_contadores_conversas','sureya_conversa_equipe','sureya_portal_irmaos',
         'sureya_custo_hora_efetivo','sureya_resultado_por_jazigo','sureya_sincroniza_lavagens')
  loop
    assinatura := format('public.%I(%s)', f.proname, f.args);
    execute format('revoke execute on function %s from public, anon, authenticated;', assinatura);
    if not f.eh_gatilho then
      execute format('grant execute on function %s to authenticated, service_role;', assinatura);
      -- `sureya_portal_irmaos` é chamada com a chave anônima pelo portal por QR
      -- (src/app/api/portal/route.ts), junto com cabecalho e historico.
      if f.proname = 'sureya_portal_irmaos' then
        execute format('grant execute on function %s to anon;', assinatura);
      end if;
    end if;
  end loop;
end $$;

commit;

-- ============================================================================
-- O QUE AINDA FALTA PARA O REPOSITÓRIO RECONSTRUIR O BANCO
--
-- 1. Os `CREATE TRIGGER` das três funções de gatilho — seção 10 da 0053.
-- 2. `unaccent_simples()`, usada por `sureya_palpites_entrada`. Não tem o
--    prefixo `sureya_`, então nem apareceu na extração. Rode:
--      select pg_get_functiondef(oid) from pg_proc
--       where proname = 'unaccent_simples';
-- 3. As seis colunas de contrato de `familias` — seção 2b da 0053.
-- 4. Conferir `quitacoes` e as cinco colunas de `movimentos` da 0059 contra o
--    banco real.
--
-- Com esses quatro itens, o critério de saída do Build 0 ("schema real
-- comparado à baseline sem diferença desconhecida") passa a ser verificável —
-- e o teste é objetivo: rodar a trilha num Postgres limpo e comparar.
-- ============================================================================
