-- O recado virou CHAMADO: número, status e resposta.
--
-- A diferença não é cosmética. Um recado é uma frase que some numa caixa; um
-- chamado é uma frase que a pessoa pode voltar a procurar. Sem número, quem
-- escreveu não tem como perguntar "e aquele problema?" — e nós não temos como
-- responder sem inventar contexto.
--
-- O que ele NÃO promete: prazo que não vamos cumprir. Uma operação de uma
-- pessoa que exibe "SLA de 24h" cria a decepção no dia em que ela não cumpre.
-- A página diz o tempo REAL, calculado das respostas que já saíram.

alter table walkstamp.recado add column if not exists numero text;
alter table walkstamp.recado add column if not exists status text
  not null default 'aberto' check (status in ('aberto','analise','respondido','fechado'));
alter table walkstamp.recado add column if not exists resposta text;
alter table walkstamp.recado add column if not exists respondido_em timestamptz;

create sequence if not exists walkstamp.chamado_seq start 1;
create unique index if not exists recado_numero_uk on walkstamp.recado (numero);

-- Preenche o que já existe, para não haver chamado sem número.
update walkstamp.recado set numero = 'WS-' || lpad(id::text, 4, '0') where numero is null;

create or replace function walkstamp.recado_novo(
  p_tipo text, p_texto text, p_email text, p_nota integer,
  p_idioma text, p_cenario text, p_origem text, p_diag text)
returns text
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  txt text := btrim(coalesce(p_texto, ''));
  em  text := lower(btrim(coalesce(p_email, '')));
  num text;
begin
  if length(txt) < 2 then return 'vazio'; end if;
  if (select count(*) from walkstamp.recado
       where criado_em > now() - interval '1 minute') >= 30 then
    return 'muitos';
  end if;

  num := 'WS-' || lpad(nextval('walkstamp.chamado_seq')::text, 4, '0');

  insert into walkstamp.recado (numero, tipo, texto, email, nota, idioma, cenario, origem, diagnostico)
  values (num,
          case when p_tipo in ('ideia','elogio','problema') then p_tipo else 'problema' end,
          left(txt, 4000),
          case when em ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then em else null end,
          case when p_nota between 0 and 10 then p_nota else null end,
          left(coalesce(p_idioma,''), 8), left(coalesce(p_cenario,''), 40),
          case when p_origem = 'site' then 'site' else 'app' end,
          left(coalesce(p_diag,''), 12000));
  /* Devolve o NÚMERO, e não 'ok'. É ele que a pessoa anota. */
  return num;
end $$;

-- Consultar um chamado: número + e-mail, sem login.
--
-- O e-mail é o que impede alguém de varrer WS-0001..WS-9999 e ler o que os
-- outros escreveram. Quem abriu sem deixar e-mail não consulta — e a tela diz
-- isso na hora de abrir, em vez de deixar descobrir depois.
create or replace function walkstamp.chamado_ver(p_numero text, p_email text)
returns jsonb
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare r walkstamp.recado%rowtype;
begin
  select * into r from walkstamp.recado
   where upper(btrim(coalesce(p_numero,''))) = upper(numero)
     and email is not null
     and email = lower(btrim(coalesce(p_email,'')));
  if not found then return jsonb_build_object('erro','nao_achei'); end if;
  return jsonb_build_object(
    'numero', r.numero, 'tipo', r.tipo, 'status', r.status,
    'texto', r.texto, 'resposta', r.resposta,
    'criado_em', r.criado_em, 'respondido_em', r.respondido_em);
end $$;

-- O tempo real de resposta, para a página não prometer prazo inventado.
create or replace function walkstamp.chamado_tempo()
returns integer
language sql security definer set search_path to 'walkstamp','public'
as $$
  select coalesce(
    round(avg(extract(epoch from (respondido_em - criado_em)) / 3600))::integer,
    0)
  from (select criado_em, respondido_em from walkstamp.recado
         where respondido_em is not null order by respondido_em desc limit 20) u;
$$;

create or replace function public.walkstamp_chamado_ver(p_numero text, p_email text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.chamado_ver(p_numero, p_email); $$;

create or replace function public.walkstamp_chamado_tempo()
returns integer language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.chamado_tempo(); $$;

grant execute on function public.walkstamp_chamado_ver(text,text) to anon, authenticated;
grant execute on function public.walkstamp_chamado_tempo() to anon, authenticated;
