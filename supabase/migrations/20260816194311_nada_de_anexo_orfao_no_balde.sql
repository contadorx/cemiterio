/* Dois defeitos do que subiu há uma hora, e os dois na mesma frase da política:
 * "apagar apaga o arquivo, não só a linha que aponta para ele".
 *
 *   1. APAGAR O ROTEIRO deixava os arquivos no balde. A linha sumia por
 *      cascata, o arquivo ficava — conteúdo de cliente guardado sem ninguém
 *      saber, invisível na tela e impossível de apagar pela tela.
 *
 *   2. REENVIAR A PLANILHA fazia pior, e em silêncio: `roteiro_salvar` apaga os
 *      casos e os reinsere, e o que ele carregava para a frente era só o
 *      "feito". O RECIBO e o ANEXO se perdiam a cada reenvio — e reenviar é o
 *      caminho normal de acrescentar casos a um roteiro que já existe.
 *
 * O conserto do primeiro é uma FILA. Apagar o arquivo é uma chamada de rede que
 * pode falhar, e ela acontece depois do `commit`: fazer a lista dos órfãos
 * dentro da mesma transação que apaga a linha é o que garante que nada some sem
 * deixar rastro. Se a faxina falhar, a linha continua na fila e a próxima
 * tentativa pega — em vez de o arquivo ficar lá para sempre.
 */

create table if not exists walkstamp.anexo_orfao (
  id          bigint generated always as identity primary key,
  caminho     text not null,
  criado_em   timestamptz not null default now(),
  tentativas  int not null default 0,
  ultimo_erro text
);
create index if not exists anexo_orfao_ix on walkstamp.anexo_orfao (criado_em);
alter table walkstamp.anexo_orfao enable row level security;

/* Salvar de novo: o que já era do caso continua sendo do caso.
 *
 * A lista do que atravessa cresceu — responsável, feito, arquivo, impressão,
 * observação, RECIBO e ANEXO. O casamento é pelo CÓDIGO do caso, porque é o que
 * a pessoa reconhece e o que o link carrega; casar por posição perderia tudo no
 * dia em que alguém ordenasse a planilha.
 *
 * E o caso que sumiu da planilha nova leva o anexo dele para a fila de faxina.
 */
create or replace function walkstamp.roteiro_salvar(
  p_email text, p_nome text, p_escopo text, p_casos jsonb, p_id bigint)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  e text := lower(btrim(coalesce(p_email,'')));
  esc text := case when coalesce(p_escopo,'') = 'time' then 'time' else 'personal' end;
  cid bigint; rid bigint; i int := 0; item jsonb; saida jsonb;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  if btrim(coalesce(p_nome,'')) = '' then return jsonb_build_object('erro','sem_nome'); end if;
  if jsonb_typeof(coalesce(p_casos,'null'::jsonb)) <> 'array' or jsonb_array_length(p_casos) = 0 then
    return jsonb_build_object('erro','sem_casos');
  end if;

  select u.cliente_id into cid from walkstamp.usuario u where u.email = e and u.ativo;
  if esc = 'time' and cid is null then esc := 'personal'; end if;

  if p_id is not null then
    if not walkstamp.roteiro_pode(e, p_id) then return jsonb_build_object('erro','sem_acesso'); end if;
    rid := p_id;
    update walkstamp.roteiro set nome = p_nome, escopo = esc,
           cliente_id = case when esc = 'time' then cid else cliente_id end
     where id = rid;
  else
    insert into walkstamp.roteiro (cliente_id, dono, nome, escopo)
    values (case when esc = 'time' then cid else null end, e, p_nome, esc)
    returning id into rid;
  end if;

  create temp table _antes on commit drop as
    select caso, responsavel, feito_em, feito_por, arquivo, impressao, observacao,
           recibo, anexo_caminho, anexo_nome, anexo_bytes, anexo_em
      from walkstamp.roteiro_caso where roteiro_id = rid;
  delete from walkstamp.roteiro_caso where roteiro_id = rid;

  for item in select * from jsonb_array_elements(p_casos) loop
    i := i + 1;
    insert into walkstamp.roteiro_caso
      (roteiro_id, ordem, caso, titulo, cenario, chamado, sistema,
       responsavel, feito_em, feito_por, arquivo, impressao, observacao,
       recibo, anexo_caminho, anexo_nome, anexo_bytes, anexo_em)
    select rid, i,
      coalesce(nullif(btrim(item->>'caso'),''), 'caso ' || i),
      nullif(btrim(coalesce(item->>'titulo','')),''),
      nullif(btrim(coalesce(item->>'cenario','')),''),
      nullif(btrim(coalesce(item->>'chamado','')),''),
      nullif(btrim(coalesce(item->>'sistema','')),''),
      coalesce(nullif(btrim(coalesce(item->>'responsavel','')),''), a.responsavel),
      a.feito_em, a.feito_por, a.arquivo, a.impressao, a.observacao,
      a.recibo, a.anexo_caminho, a.anexo_nome, a.anexo_bytes, a.anexo_em
    from (select 1) z
    left join _antes a
      on lower(a.caso) = lower(coalesce(nullif(btrim(item->>'caso'),''), 'caso ' || i));
  end loop;

  /* O caso que não voltou na planilha nova. O arquivo dele precisa sair do
     balde, e quem sai do balde é o servidor — aqui fica só o bilhete. */
  insert into walkstamp.anexo_orfao (caminho)
  select a.anexo_caminho from _antes a
   where a.anexo_caminho is not null
     and not exists (select 1 from walkstamp.roteiro_caso c
                      where c.roteiro_id = rid and lower(c.caso) = lower(a.caso));
  drop table _antes;

  saida := walkstamp.roteiro_ver(e, rid);
  return saida || jsonb_build_object('faxina', walkstamp.anexo_faxina_lista());
end $$;

/* Apagar o roteiro: os anexos dele vão para a fila ANTES de as linhas sumirem.
   Depois do `delete` já não haveria de onde tirar o caminho. */
create or replace function walkstamp.roteiro_apagar(p_email text, p_id bigint)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); dono text; saida jsonb;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  select r.dono into dono from walkstamp.roteiro r where r.id = p_id;
  if dono is null then return jsonb_build_object('erro','sem_roteiro'); end if;
  if lower(dono) <> e then return jsonb_build_object('erro','so_o_dono'); end if;

  insert into walkstamp.anexo_orfao (caminho)
  select c.anexo_caminho from walkstamp.roteiro_caso c
   where c.roteiro_id = p_id and c.anexo_caminho is not null;

  delete from walkstamp.roteiro where id = p_id;
  saida := walkstamp.roteiro_meus(e);
  return saida || jsonb_build_object('faxina', walkstamp.anexo_faxina_lista());
end $$;

/* A fila, vista de fora. Devolve poucos por vez: a faxina acontece depois de
   uma ação de tela, e uma pessoa que apaga um roteiro de quarenta casos não
   deveria esperar quarenta chamadas de rede para ver a tela voltar. */
create or replace function walkstamp.anexo_faxina_lista(p_limite int default 25)
returns jsonb language sql stable security definer
set search_path to 'walkstamp','public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'caminho', o.caminho)), '[]'::jsonb)
    from (select id, caminho from walkstamp.anexo_orfao
           where tentativas < 20 order by criado_em limit greatest(1, least(p_limite, 100))) o;
$$;

/* O que saiu do balde de verdade sai da fila. O que falhou conta a tentativa e
   guarda o motivo — uma fila que apaga o que não conseguiu apagar é uma fila
   que mente. */
create or replace function walkstamp.anexo_faxinado(p_ids bigint[], p_erro text default null)
returns int language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare n int;
begin
  if p_ids is null or array_length(p_ids,1) is null then return 0; end if;
  if p_erro is null then
    delete from walkstamp.anexo_orfao where id = any(p_ids);
    get diagnostics n = row_count;
  else
    update walkstamp.anexo_orfao
       set tentativas = tentativas + 1, ultimo_erro = left(p_erro, 300)
     where id = any(p_ids);
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

create or replace function public.walkstamp_anexo_faxina(p_limite int)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.anexo_faxina_lista(p_limite) $$;

create or replace function public.walkstamp_anexo_faxinado(p_ids bigint[], p_erro text)
returns int language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.anexo_faxinado(p_ids, p_erro) $$;

/* Mesmo motivo de sempre: `revoke … from public` sozinho não fecha, porque o
   Supabase concede nominalmente a `anon` e `authenticated` por padrão. */
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and (p.proname like 'walkstamp\_roteiro\_%' or p.proname like 'walkstamp\_anexo\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

do $$
declare abertas text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into abertas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'walkstamp\_roteiro\_%' or p.proname like 'walkstamp\_anexo\_%')
     and ( has_function_privilege('anon',          p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute') );
  if abertas is not null then
    raise exception 'estas funções continuam abertas para o navegador: %', abertas;
  end if;
end $$;
