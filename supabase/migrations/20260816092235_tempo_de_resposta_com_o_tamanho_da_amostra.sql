/* O tempo de resposta, com o tamanho da amostra junto.
 *
 * `chamado_tempo()` devolve só a média em horas — e 0 tanto quando ninguém
 * nunca respondeu nada quanto quando as respostas saíram em menos de meia hora.
 * A tela precisa distinguir os dois: no primeiro caso ela não deve dizer nada,
 * no segundo ela tem uma notícia muito boa para dar.
 *
 * A função antiga continua onde está, intacta, porque prometer um número e
 * mudar o formato dele é o jeito de quebrar quem já o lê.
 */
create or replace function walkstamp.chamado_resposta()
returns jsonb language sql security definer
set search_path to 'walkstamp','public' as $$
  select jsonb_build_object(
    'quantos', count(*),
    -- em horas, arredondado para cima quando passa de meia hora: dizer "1h"
    -- para algo que levou 50 minutos é honesto; dizer "0h" não é
    'horas', coalesce(round(avg(extract(epoch from (respondido_em - criado_em)) / 3600))::integer, 0))
  from (select criado_em, respondido_em from walkstamp.recado
         where respondido_em is not null order by respondido_em desc limit 20) u;
$$;

create or replace function public.walkstamp_chamado_resposta()
returns jsonb language sql security definer set search_path to 'public','walkstamp' as $$
  select walkstamp.chamado_resposta();
$$;

/* Esta é pública de propósito: ela não recebe nada e devolve uma média. É o
   oposto das outras — o valor dela é justamente estar na página, à vista de
   quem ainda não é cliente. */
grant execute on function public.walkstamp_chamado_resposta() to anon, authenticated, service_role;
