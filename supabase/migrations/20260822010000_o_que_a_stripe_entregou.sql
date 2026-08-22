/* ============================================================================
 * O REGISTRO DO QUE A STRIPE ENTREGOU.
 *
 * Hoje a pergunta "a Stripe entregou o evento da compra do fulano?" não tem
 * resposta. O webhook faz o trabalho e some; o que sobra é a consequência — uma
 * fatura, um cliente virando pago — e não o fato da entrega. Quando a
 * consequência não aparece, não há como distinguir "a Stripe não mandou" de "a
 * gente recebeu e falhou".
 *
 * O QUE ESTA TABELA NÃO É: uma trava de idempotência.
 *
 * A idempotência já existe, e por construção, que é o lugar certo dela:
 *
 *   fatura        `fatura_stripe_uk` é único em `stripe_id`, e
 *                 `fatura_da_stripe()` faz `on conflict do update`. Reentregar
 *                 a mesma fatura atualiza; não duplica. Isso está provado em
 *                 `10-fumaca.sql`, bloco [5].
 *   assinatura    `assinatura_da_stripe()` sobrescreve o estado inteiro do
 *                 cliente a partir do evento. Rodar duas vezes com o mesmo
 *                 evento dá o mesmo resultado.
 *
 * Uma trava que PULA o trabalho quando o `event.id` já foi visto seria pior do
 * que não ter: se a primeira tentativa gravar o evento e falhar depois, a
 * reentrega — que é exatamente o que a Stripe faz para consertar — seria
 * descartada como repetida, e a compra se perderia em silêncio. Por isso aqui
 * o registro é ANOTAÇÃO, e o trabalho acontece sempre.
 *
 * `repetido` conta as reentregas. Ele é o número que responde "isto está em
 * laço?" — a Stripe reentrega o que não recebe 2xx, e um contador subindo é o
 * sintoma de um erro que se repete em vez de um erro que passou.
 * ========================================================================= */

create table if not exists walkstamp.stripe_evento (
  id           text primary key,          -- o `event.id` da Stripe, evt_...
  tipo         text not null,
  primeira_em  timestamptz not null default now(),
  ultima_em    timestamptz not null default now(),
  repetido     int not null default 0,
  origem       text,                      -- qual webhook atendeu
  resultado    text                       -- 'ok' ou o erro, cortado
);
create index if not exists stripe_evento_data_ix on walkstamp.stripe_evento (primeira_em desc);
alter table walkstamp.stripe_evento enable row level security;

comment on table walkstamp.stripe_evento is
  'O que a Stripe entregou. Anotação, e não trava: o trabalho roda sempre.';
comment on column walkstamp.stripe_evento.repetido is
  'Reentregas. Subindo = a Stripe não está recebendo 2xx, e o erro se repete.';

/* Anota a entrega e devolve quantas vezes ela já tinha chegado. Zero na
   primeira. O webhook chama isto DEPOIS de fazer o trabalho, com o resultado —
   assim uma falha fica registrada como falha, e não como entrega bem-sucedida. */
create or replace function walkstamp.stripe_entregue(
  p_id text, p_tipo text, p_origem text, p_resultado text)
returns int language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare n int;
begin
  if coalesce(btrim(p_id),'') = '' then return 0; end if;
  insert into walkstamp.stripe_evento (id, tipo, origem, resultado)
       values (btrim(p_id), coalesce(p_tipo,'?'), p_origem, left(coalesce(p_resultado,''), 300))
  on conflict (id) do update
     set repetido  = walkstamp.stripe_evento.repetido + 1,
         ultima_em = now(),
         origem    = excluded.origem,
         /* O último resultado vence: o que importa saber é se a coisa
            terminou bem DEPOIS das reentregas, e não como ela começou. */
         resultado = excluded.resultado
  returning repetido into n;
  return n;
end $$;

create or replace function public.walkstamp_stripe_entregue(
  p_id text, p_tipo text, p_origem text, p_resultado text)
returns int language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.stripe_entregue(p_id, p_tipo, p_origem, p_resultado) $$;

/* O painel de negócio passa a poder responder a pergunta. */
create or replace function walkstamp.stripe_ultimos(p_limite int default 50)
returns jsonb language sql stable security definer
set search_path to 'walkstamp','public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'tipo', e.tipo, 'origem', e.origem, 'repetido', e.repetido,
           'resultado', e.resultado, 'primeira_em', e.primeira_em, 'ultima_em', e.ultima_em)
         order by e.primeira_em desc), '[]'::jsonb)
    from (select * from walkstamp.stripe_evento
           order by primeira_em desc limit greatest(1, least(p_limite, 200))) e;
$$;

create or replace function public.walkstamp_stripe_ultimos(p_limite int)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.stripe_ultimos(p_limite) $$;

/* Mesma trava de sempre: `revoke from public` sozinho não fecha, porque o
   Supabase concede nominalmente a `anon` e `authenticated` por padrão. Um
   registro de entregas da Stripe aberto ao navegador conta quem comprou e
   quando. */
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'walkstamp\_stripe\_%'
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
   where n.nspname = 'public' and p.proname like 'walkstamp\_stripe\_%'
     and ( has_function_privilege('anon',          p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute') );
  if abertas is not null then
    raise exception 'estas funções continuam abertas para o navegador: %', abertas;
  end if;
end $$;

-- E as duas novas nascem com o caminho fixo, como as outras 72.
alter function walkstamp.stripe_entregue(text,text,text,text) set search_path to 'walkstamp','public';
alter function walkstamp.stripe_ultimos(int)                  set search_path to 'walkstamp','public';
