/* Os prazos da política de privacidade, enfim com código atrás deles.
 *
 * A política promete quatro coisas e nenhuma delas acontecia:
 *
 *   conteúdo da conta   apagado em até 90 dias depois de encerrada a assinatura
 *   e-mail da lista     apagado com 24 meses sem uso
 *   marcos de uso       18 meses
 *   registros de acesso 6 meses (esse é da Vercel, não nosso)
 *
 * Prazo escrito sem código atrás é a mesma coisa que o `revoke` que não
 * revogava: um parágrafo tranquilizador em cima de nada. Hoje é uma função só,
 * chamada por um disparo agendado, e ela devolve o que fez.
 *
 * O QUE NÃO É APAGADO, e o porquê: a **fatura**. Nota fiscal tem prazo de
 * guarda fiscal, que é maior que 90 dias e não é escolha nossa. Por isso o
 * cliente sobrevive ao expurgo — reduzido ao mínimo que mantém a fatura
 * inteligível — e tudo o mais dele some. A política passou a dizer isso; antes
 * ela dizia "a conta inteira", que seria uma promessa impossível de cumprir sem
 * quebrar outra obrigação.
 */

alter table walkstamp.cliente
  add column if not exists encerrado_em timestamptz,
  add column if not exists expurgado_em timestamptz;

comment on column walkstamp.cliente.encerrado_em is
  'Quando a assinatura deixou de estar viva. É daqui que os 90 dias contam.';
comment on column walkstamp.cliente.expurgado_em is
  'Quando o conteúdo desta conta foi apagado. A linha fica pela fatura.';

/* Um cliente que já está inativo hoje não tem data de encerramento — ele
   encerrou antes de esta coluna existir. Marcar "agora" é a leitura
   conservadora: dá a ele os 90 dias inteiros a partir de hoje, em vez de
   apagar retroativamente algo que a pessoa não foi avisada que sumiria. */
update walkstamp.cliente set encerrado_em = now()
 where not ativo and encerrado_em is null;

/* O webhook passa a carimbar a data. Ele é o único lugar que decide se a
   assinatura está viva, então é o único lugar onde a data pode nascer certa. */
create or replace function walkstamp.assinatura_da_stripe(
  p_email text, p_stripe_cliente text, p_stripe_assinatura text, p_plano text,
  p_status text, p_assentos integer, p_dias integer)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  e    text := lower(btrim(coalesce(p_email,'')));
  cid  bigint;
  /* O que conta como plano vivo. `trialing` entra: durante a degustação a
     pessoa tem tudo, e é isso que foi prometido. `past_due` NÃO entra — quem
     não pagou cai para o Free, que continua funcionando inteiro. */
  vivo boolean := p_status in ('active','trialing');
begin
  select id into cid from walkstamp.cliente
   where stripe_id = p_stripe_cliente and coalesce(p_stripe_cliente,'') <> '';
  if cid is null and e <> '' then
    select u.cliente_id into cid from walkstamp.usuario u where u.email = e;
  end if;

  if cid is null then
    insert into walkstamp.cliente (nome, plano, assentos, dias, ativo, stripe_id,
                                   stripe_assinatura, encerrado_em)
    values (coalesce(nullif(e,''), 'assinante'), p_plano,
            greatest(coalesce(p_assentos,1),1), greatest(coalesce(p_dias,30),1),
            vivo, nullif(p_stripe_cliente,''), nullif(p_stripe_assinatura,''),
            case when vivo then null else now() end)
    returning id into cid;
  else
    update walkstamp.cliente
       set plano     = p_plano,
           assentos  = greatest(coalesce(p_assentos, assentos), 1),
           dias      = greatest(coalesce(p_dias, dias), 1),
           ativo     = vivo,
           stripe_id = coalesce(nullif(p_stripe_cliente,''), stripe_id),
           stripe_assinatura = coalesce(nullif(p_stripe_assinatura,''), stripe_assinatura),
           /* Voltou a pagar: a contagem zera e o expurgo perde o gatilho.
              Encerrou agora: a data nasce. Já estava encerrado: a data ORIGINAL
              fica — senão cada webhook de cobrança falhada empurraria os 90 dias
              para a frente e a conta nunca seria apagada. */
           encerrado_em = case when vivo then null
                               else coalesce(encerrado_em, now()) end
     where id = cid;
  end if;

  if e <> '' then
    insert into walkstamp.usuario (cliente_id, email, papel, ativo)
    values (cid, e, 'admin', true)
    on conflict (email) do update
      set cliente_id = cid, papel = 'admin', ativo = true;
  end if;

  return jsonb_build_object('ok', true, 'cliente_id', cid, 'ativo', vivo, 'plano', p_plano);
end $$;

/* O registro de que o expurgo aconteceu. Ele guarda CONTAGENS, e nunca o que
   foi apagado — um log de expurgo que copia o dado antes de apagar é o oposto
   de um expurgo. Existe para responder "vocês apagaram mesmo?" com uma data. */
create table if not exists walkstamp.expurgo_log (
  id        bigint generated always as identity primary key,
  quando    timestamptz not null default now(),
  seco      boolean not null,
  relatorio jsonb not null
);
alter table walkstamp.expurgo_log enable row level security;

/* O expurgo.
 *
 * `p_seco` = true faz a conta sem apagar nada. É o modo em que ele nasce e o
 * modo em que se confere o que ele FARIA — porque a única coisa pior que não
 * apagar no prazo é apagar o que não devia. */
create or replace function walkstamp.expurgo(p_seco boolean default true)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  DIAS_CONTA   int := 90;    -- o que a política promete depois de encerrada
  MESES_LISTA  int := 24;    -- e-mail da lista de aviso sem uso
  MESES_EVENTO int := 18;    -- os três marcos de uso
  alvos bigint[];
  r jsonb;
  n_roteiros int := 0; n_casos int := 0; n_usuarios int := 0; n_modelos int := 0;
  n_config int := 0; n_dominios int := 0; n_emissoes int := 0; n_recados int := 0;
  n_anexos int := 0; n_lista int := 0; n_eventos int := 0;
begin
  select coalesce(array_agg(id), '{}') into alvos
    from walkstamp.cliente
   where not ativo and encerrado_em is not null
     and encerrado_em < now() - make_interval(days => DIAS_CONTA)
     and expurgado_em is null;

  select count(*) into n_roteiros from walkstamp.roteiro r
    where r.cliente_id = any(alvos)
       or lower(r.dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
  select count(*) into n_casos from walkstamp.roteiro_caso c
    join walkstamp.roteiro r on r.id = c.roteiro_id
   where r.cliente_id = any(alvos)
      or lower(r.dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
  select count(*) into n_anexos from walkstamp.roteiro_caso c
    join walkstamp.roteiro r on r.id = c.roteiro_id
   where c.anexo_caminho is not null
     and (r.cliente_id = any(alvos)
       or lower(r.dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos)));
  select count(*) into n_usuarios from walkstamp.usuario where cliente_id = any(alvos);
  select count(*) into n_modelos  from walkstamp.modelo_doc where cliente_id = any(alvos);
  select count(*) into n_config   from walkstamp.config where cliente_id = any(alvos);
  select count(*) into n_dominios from walkstamp.dominio where cliente_id = any(alvos);
  select count(*) into n_emissoes from walkstamp.emissao where cliente_id = any(alvos);
  select count(*) into n_recados  from walkstamp.recado
   where lower(email) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
  select count(*) into n_lista from walkstamp.interesse
   where criado_em < now() - make_interval(months => MESES_LISTA);
  select count(*) into n_eventos from walkstamp.evento
   where criado_em < now() - make_interval(months => MESES_EVENTO);

  r := jsonb_build_object(
    'seco', p_seco, 'contas', coalesce(array_length(alvos,1), 0),
    'roteiros', n_roteiros, 'casos', n_casos, 'anexos', n_anexos,
    'usuarios', n_usuarios, 'modelos', n_modelos, 'config', n_config,
    'dominios', n_dominios, 'emissoes', n_emissoes, 'chamados', n_recados,
    'lista_de_aviso', n_lista, 'marcos_de_uso', n_eventos,
    'faturas_mantidas', (select count(*) from walkstamp.fatura where cliente_id = any(alvos)));

  if p_seco then
    return r || jsonb_build_object('faxina', '[]'::jsonb);
  end if;

  if coalesce(array_length(alvos,1), 0) > 0 then
    /* Os arquivos primeiro — o bilhete, para o servidor tirar do balde. Depois
       do delete não haveria de onde tirar o caminho. */
    insert into walkstamp.anexo_orfao (caminho)
    select c.anexo_caminho from walkstamp.roteiro_caso c
      join walkstamp.roteiro rr on rr.id = c.roteiro_id
     where c.anexo_caminho is not null
       and (rr.cliente_id = any(alvos)
         or lower(rr.dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos)));

    delete from walkstamp.recado
     where lower(email) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
    delete from walkstamp.roteiro
     where cliente_id = any(alvos)
        or lower(dono) in (select lower(u.email) from walkstamp.usuario u where u.cliente_id = any(alvos));
    delete from walkstamp.emissao   where cliente_id = any(alvos);
    delete from walkstamp.modelo_doc where cliente_id = any(alvos);
    delete from walkstamp.config     where cliente_id = any(alvos);
    delete from walkstamp.dominio    where cliente_id = any(alvos);
    delete from walkstamp.usuario    where cliente_id = any(alvos);

    /* O cliente FICA, porque a fatura fica com ele. O que sai dele é o que
       identifica pessoas: o nome vira o número da conta, e o resto é zerado. */
    update walkstamp.cliente
       set nome = 'conta encerrada #' || id,
           documento = null, plano = null, assentos = 0, dias = 0,
           expurgado_em = now()
     where id = any(alvos);
  end if;

  delete from walkstamp.interesse where criado_em < now() - make_interval(months => MESES_LISTA);
  delete from walkstamp.evento    where criado_em < now() - make_interval(months => MESES_EVENTO);

  insert into walkstamp.expurgo_log (seco, relatorio) values (false, r);
  return r || jsonb_build_object('faxina', walkstamp.anexo_faxina_lista(100));
end $$;

create or replace function public.walkstamp_expurgo(p_seco boolean)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.expurgo(p_seco) $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and (p.proname like 'walkstamp\_roteiro\_%' or p.proname like 'walkstamp\_anexo\_%'
                or p.proname like 'walkstamp\_expurgo%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

do $$
declare abertas text;
begin
  select string_agg(p.proname, ', ') into abertas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'walkstamp\_roteiro\_%' or p.proname like 'walkstamp\_anexo\_%'
       or p.proname like 'walkstamp\_expurgo%')
     and ( has_function_privilege('anon',          p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute') );
  if abertas is not null then
    raise exception 'estas funções continuam abertas para o navegador: %', abertas;
  end if;
end $$;
