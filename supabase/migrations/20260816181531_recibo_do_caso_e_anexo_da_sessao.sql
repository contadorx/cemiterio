/* O concluído ganha prova. Duas, e a escolha é de quem executa:
 *
 *   RECIBO      metadados + a impressão de cada quadro. Sem imagem, sem
 *               transcrição, sem o texto dos passos. São 2 KB, viajam DENTRO do
 *               link da volta, e ficam guardados aqui como jsonb. É o padrão, e
 *               não muda a promessa do produto: continua não havendo quadro
 *               nosso em servidor nenhum.
 *
 *   ANEXO       o `.json` completo da sessão, que tem os quadros em base64
 *               dentro. Só entra se a pessoa ANEXAR de propósito, na tela de
 *               confirmar. É a primeira vez que um quadro do cliente existe do
 *               nosso lado, e por isso: fica no Storage (não no banco), tem
 *               teto de tamanho, aparece na tela dizendo o que é, e tem botão
 *               de apagar que apaga de verdade.
 *
 * O vídeo e o áudio continuam nunca saindo do navegador, nos dois casos.
 */

alter table walkstamp.roteiro_caso
  add column if not exists recibo         jsonb,
  add column if not exists anexo_caminho  text,
  add column if not exists anexo_nome     text,
  add column if not exists anexo_bytes    bigint,
  add column if not exists anexo_em       timestamptz;

/* O balde é privado. Nada aqui é servido por endereço público — quem baixa
   passa pelo servidor, que confere a sessão antes de assinar uma URL curta. */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roteiro', 'roteiro', false, 33554432, array['application/json'])
on conflict (id) do update
  set public = false, file_size_limit = 33554432,
      allowed_mime_types = array['application/json'];

/* Sem política nenhuma no bucket: `anon` e `authenticated` não leem nem
   escrevem. Só a chave de serviço, que só o servidor tem. */

create or replace function walkstamp.roteiro_feito(
  p_email text, p_caso_id bigint, p_arquivo text, p_impressao text,
  p_observacao text, p_desfazer boolean, p_recibo jsonb default null)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); rid bigint;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  select roteiro_id into rid from walkstamp.roteiro_caso where id = p_caso_id;
  if rid is null then return jsonb_build_object('erro','sem_caso'); end if;
  if not walkstamp.roteiro_pode(e, rid) then return jsonb_build_object('erro','sem_acesso'); end if;

  if coalesce(p_desfazer,false) then
    /* Desfazer apaga o recibo junto: um recibo pendurado num caso que voltou a
       "não feito" é a afirmação de que existe prova de uma coisa que a tela diz
       que não aconteceu. O ANEXO não é apagado aqui — arquivo some por botão
       próprio, e nunca de raspão. */
    update walkstamp.roteiro_caso
       set feito_em = null, feito_por = null, arquivo = null,
           impressao = null, observacao = null, recibo = null
     where id = p_caso_id;
  else
    update walkstamp.roteiro_caso
       set feito_em = now(), feito_por = e,
           arquivo   = nullif(btrim(coalesce(p_arquivo,'')),''),
           impressao = nullif(btrim(coalesce(p_impressao,'')),''),
           observacao= nullif(btrim(coalesce(p_observacao,'')),''),
           /* Recibo em branco não apaga o que já havia: quem clica em "feito"
              de novo, sem vir da ferramenta, não deveria perder a prova. */
           recibo    = coalesce(p_recibo, recibo)
     where id = p_caso_id;
  end if;
  return walkstamp.roteiro_ver(e, rid);
end $$;

create or replace function walkstamp.roteiro_anexo(
  p_email text, p_caso_id bigint, p_caminho text, p_nome text, p_bytes bigint)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); rid bigint;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  select roteiro_id into rid from walkstamp.roteiro_caso where id = p_caso_id;
  if rid is null then return jsonb_build_object('erro','sem_caso'); end if;
  if not walkstamp.roteiro_pode(e, rid) then return jsonb_build_object('erro','sem_acesso'); end if;

  update walkstamp.roteiro_caso
     set anexo_caminho = nullif(btrim(coalesce(p_caminho,'')),''),
         anexo_nome    = nullif(btrim(coalesce(p_nome,'')),''),
         anexo_bytes   = case when p_caminho is null then null else p_bytes end,
         anexo_em      = case when p_caminho is null then null else now() end
   where id = p_caso_id;
  return walkstamp.roteiro_ver(e, rid);
end $$;

/* Ver o anexo: devolve o caminho para o servidor assinar. Separada do
   `roteiro_ver` porque é a única chamada que entrega o endereço do arquivo, e
   uma chamada só para isso é uma chamada que dá para auditar sozinha. */
create or replace function walkstamp.roteiro_anexo_de(p_email text, p_caso_id bigint)
returns jsonb language plpgsql stable security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); c walkstamp.roteiro_caso%rowtype;
begin
  select * into c from walkstamp.roteiro_caso where id = p_caso_id;
  if not found then return jsonb_build_object('erro','sem_caso'); end if;
  if not walkstamp.roteiro_pode(e, c.roteiro_id) then return jsonb_build_object('erro','sem_acesso'); end if;
  if c.anexo_caminho is null then return jsonb_build_object('erro','sem_anexo'); end if;
  return jsonb_build_object('caminho', c.anexo_caminho, 'nome', c.anexo_nome,
                            'bytes', c.anexo_bytes, 'caso', c.caso);
end $$;

/* O `roteiro_ver` passa a contar o que existe de prova. O recibo vai inteiro —
   são 2 KB e a tela mostra o resumo dele; o anexo vai só descrito, porque o
   conteúdo dele não passa por aqui nunca. */
create or replace function walkstamp.roteiro_ver(p_email text, p_id bigint)
returns jsonb language plpgsql stable security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); r walkstamp.roteiro%rowtype;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  if not walkstamp.roteiro_pode(e, p_id) then return jsonb_build_object('erro','sem_acesso'); end if;
  select * into r from walkstamp.roteiro where id = p_id;
  return jsonb_build_object(
    'id', r.id, 'nome', r.nome, 'escopo', r.escopo, 'dono', r.dono,
    'criado_em', r.criado_em,
    'meu', lower(r.dono) = e,
    'casos', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'ordem', c.ordem, 'caso', c.caso, 'titulo', c.titulo,
                'cenario', c.cenario, 'chamado', c.chamado, 'sistema', c.sistema,
                'responsavel', c.responsavel, 'feito_em', c.feito_em,
                'feito_por', c.feito_por, 'arquivo', c.arquivo,
                'impressao', c.impressao, 'observacao', c.observacao,
                'recibo', c.recibo,
                'anexo', case when c.anexo_caminho is null then null
                              else jsonb_build_object('nome', c.anexo_nome,
                                                      'bytes', c.anexo_bytes,
                                                      'em', c.anexo_em) end)
                order by c.ordem, c.id), '[]'::jsonb)
              from walkstamp.roteiro_caso c where c.roteiro_id = r.id));
end $$;

/* ---- as portas públicas ------------------------------------------------ */

/* A assinatura velha de seis argumentos sai de cena: deixá-la viva ao lado da
   nova de sete é deixar duas funções com o mesmo nome e comportamentos
   diferentes, e o PostgREST escolhe pela forma do corpo — que é o jeito mais
   silencioso de um dia gravar sem recibo e ninguém entender por quê. */
drop function if exists public.walkstamp_roteiro_feito(text,bigint,text,text,text,boolean);

create or replace function public.walkstamp_roteiro_feito(
  p_email text, p_caso_id bigint, p_arquivo text, p_impressao text,
  p_observacao text, p_desfazer boolean, p_recibo jsonb)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_feito(p_email, p_caso_id, p_arquivo, p_impressao,
                                     p_observacao, p_desfazer, p_recibo) $$;

create or replace function public.walkstamp_roteiro_anexo(
  p_email text, p_caso_id bigint, p_caminho text, p_nome text, p_bytes bigint)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_anexo(p_email, p_caso_id, p_caminho, p_nome, p_bytes) $$;

create or replace function public.walkstamp_roteiro_anexo_de(p_email text, p_caso_id bigint)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_anexo_de(p_email, p_caso_id) $$;

/* `revoke … from public` sozinho NÃO fecha: o Supabase deixa um
   `alter default privileges … grant execute … to anon, authenticated` armado, e
   toda função nova nasce concedida nominalmente aos dois. Foi isso que derrubou
   a primeira tentativa da migração anterior. Por isso o revoke nomeia os três,
   e o bloco no fim confere de verdade. */
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'walkstamp\_roteiro\_%'
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
   where n.nspname = 'public' and p.proname like 'walkstamp\_roteiro\_%'
     and ( has_function_privilege('anon',          p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute') );
  if abertas is not null then
    raise exception 'estas funções continuam abertas para o navegador: %', abertas;
  end if;
end $$;
