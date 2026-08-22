/* O padrão do documento da conta ganha o FORMATO.
 *
 * Até agora o padrão empurrado para a ferramenta dizia com que CARA o documento
 * sai — nome da empresa, logotipo, rótulo do quadro, ambiente. Não dizia com
 * que FORMA: papel, layout, se cada imagem leva impressão digital, se os casos
 * são numerados sozinhos.
 *
 * E é justamente a forma que uma empresa padroniza. Quem audita não quer que
 * metade das evidências saia em A4 e metade em Carta, nem que uma leve hash e a
 * outra não — a diferença some no meio de quarenta arquivos e reaparece na
 * reunião em que alguém pergunta por que dois documentos do mesmo teste não se
 * parecem.
 *
 * Continua sendo PADRÃO, e não trava: a ferramenta preenche e a pessoa troca.
 * Empurrar sem deixar mudar transformaria uma conveniência numa camisa de
 * força — e quem sabe que aquele caso precisa de outro layout é quem está com
 * o caso na mão.
 */

alter table walkstamp.config
  add column if not exists papel    text,
  add column if not exists layout   text,
  add column if not exists hash     boolean,
  add column if not exists numerar  boolean;

comment on column walkstamp.config.papel is
  'a4 | letter — o tamanho de página do PDF';
comment on column walkstamp.config.layout is
  'auto | full | grid — quantas telas por página';
comment on column walkstamp.config.hash is
  'imprimir a impressão digital SHA-256 de cada imagem';
comment on column walkstamp.config.numerar is
  'numerar os casos sozinho (EV-001, EV-002…)';

create or replace function walkstamp.time_config(p_admin text, p_config jsonb)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  a text := lower(btrim(p_admin));
  cid bigint;
  /* Os valores vêm de um formulário, e formulário é entrada de fora. Um
     `papel` inventado não quebraria nada hoje — a ferramenta ignoraria —, mas
     guardar lixo é guardar uma pergunta para quem for ler isto amanhã. */
  v_papel  text := case when p_config->>'papel'  in ('a4','letter') then p_config->>'papel' end;
  v_layout text := case when p_config->>'layout' in ('auto','full','grid') then p_config->>'layout' end;
begin
  select u.cliente_id into cid from walkstamp.usuario u
   where u.email = a and u.papel = 'admin' and u.cliente_id is not null;
  if cid is null then return jsonb_build_object('erro','nao_admin'); end if;

  insert into walkstamp.config (cliente_id, empresa, logo_url, cenario, rotulo, ambiente,
                                papel, layout, hash, numerar, atualizado_em)
  values (cid, p_config->>'empresa', p_config->>'logo_url', p_config->>'cenario',
          p_config->>'rotulo', p_config->>'ambiente',
          v_papel, v_layout,
          (p_config->>'hash')::boolean, (p_config->>'numerar')::boolean, now())
  on conflict (cliente_id) do update
    set empresa = excluded.empresa, logo_url = excluded.logo_url,
        cenario = excluded.cenario, rotulo = excluded.rotulo,
        ambiente = excluded.ambiente,
        papel = excluded.papel, layout = excluded.layout,
        hash = excluded.hash, numerar = excluded.numerar,
        atualizado_em = now();
  return walkstamp.time_painel(a);
end $$;

revoke all on function public.walkstamp_time_config(text,jsonb) from public, anon, authenticated;
grant execute on function public.walkstamp_time_config(text,jsonb) to service_role;
