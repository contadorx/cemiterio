-- O recado: ideia, elogio ou problema, com o relatório do navegador junto.
--
-- Antes isto abria o programa de e-mail da pessoa com um `mailto:`. Era pior do
-- que parecia: quem usa webmail no Windows clica e NÃO ACONTECE NADA — sem
-- erro, sem aba nova, sem nada. O recado morria em silêncio, que é o oposto do
-- que um canal de suporte precisa fazer.
--
-- Isto NÃO fere a premissa. A premissa é que conteúdo não sai da máquina:
-- vídeo, áudio, transcrição, documento. Um recado é o contrário disso — é uma
-- frase que a pessoa escreveu de propósito para nós, apertando um botão que diz
-- "enviar". O e-mail é opcional e serve para ela receber resposta.

create table if not exists walkstamp.recado (
  id         bigserial primary key,
  tipo       text not null check (tipo in ('ideia','elogio','problema')),
  texto      text not null,
  email      text,
  nota       integer,                    -- a nota do NPS, quando veio da ficha
  idioma     text,
  cenario    text,
  origem     text,                       -- 'app' ou 'site'
  diagnostico text,                      -- o relatório do navegador, se a pessoa deixou
  criado_em  timestamptz not null default now()
);
create index if not exists recado_data_idx on walkstamp.recado (criado_em desc);

create or replace function walkstamp.recado_novo(
  p_tipo text, p_texto text, p_email text, p_nota integer,
  p_idioma text, p_cenario text, p_origem text, p_diag text)
returns text
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  txt text := btrim(coalesce(p_texto, ''));
  em  text := lower(btrim(coalesce(p_email, '')));
begin
  if length(txt) < 2 then return 'vazio'; end if;

  /* Um endereço público que aceita texto livre precisa de um teto. Sem ele,
     uma tarde de alguém entediado enche a tabela. Cinco por minuto por tipo é
     generoso para uma pessoa e apertado para um laço. */
  if (select count(*) from walkstamp.recado
       where criado_em > now() - interval '1 minute') >= 30 then
    return 'muitos';
  end if;

  insert into walkstamp.recado (tipo, texto, email, nota, idioma, cenario, origem, diagnostico)
  values (case when p_tipo in ('ideia','elogio','problema') then p_tipo else 'problema' end,
          left(txt, 4000),
          case when em ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then em else null end,
          case when p_nota between 0 and 10 then p_nota else null end,
          left(coalesce(p_idioma,''), 8), left(coalesce(p_cenario,''), 40),
          case when p_origem = 'site' then 'site' else 'app' end,
          left(coalesce(p_diag,''), 12000));
  return 'ok';
end $$;

create or replace function public.walkstamp_recado(
  p_tipo text, p_texto text, p_email text default null, p_nota integer default null,
  p_idioma text default null, p_cenario text default null,
  p_origem text default null, p_diag text default null)
returns text language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.recado_novo(p_tipo, p_texto, p_email, p_nota, p_idioma,
                                   p_cenario, p_origem, p_diag); $$;

grant execute on function public.walkstamp_recado(text,text,text,integer,text,text,text,text)
  to anon, authenticated;
