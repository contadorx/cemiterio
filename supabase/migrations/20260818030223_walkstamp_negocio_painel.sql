create or replace function walkstamp.negocio_painel()
returns jsonb
language sql
stable
as $$
with
  assentos as (
    select
      coalesce(sum(c.assentos) filter (where c.ativo), 0)::int as vendidos,
      (select count(*) from walkstamp.usuario u where u.ativo)::int as usados
    from walkstamp.cliente c
  ),
  dinheiro as (
    select
      coalesce(sum(valor_centavos) filter (where status = 'paga'), 0)::bigint    as pago,
      coalesce(sum(valor_centavos) filter (where status = 'aberta'), 0)::bigint  as aberto,
      coalesce(sum(valor_centavos) filter (
        where status = 'aberta' and vence_em is not null and vence_em < current_date
      ), 0)::bigint as vencido,
      count(*) filter (
        where status = 'aberta' and vence_em is not null and vence_em < current_date
      )::int as n_vencidas
    from walkstamp.fatura
  ),
  chamados as (
    select
      count(*) filter (where resposta is null)::int as abertos,
      count(*) filter (where resposta is null and criado_em < now() - interval '3 days')::int as parados,
      count(*)::int as total
    from walkstamp.recado
  )
select jsonb_build_object(
  'resumo', jsonb_build_object(
    'contas',            (select count(*) from walkstamp.conta),
    'contas30',          (select count(*) from walkstamp.conta where criado_em > now() - interval '30 days'),
    'clientes',          (select count(*) from walkstamp.cliente),
    'clientesAtivos',    (select count(*) from walkstamp.cliente where ativo),
    'assentosVendidos',  (select vendidos from assentos),
    'assentosUsados',    (select usados from assentos),
    'pago',              (select pago from dinheiro),
    'aberto',            (select aberto from dinheiro),
    'vencido',           (select vencido from dinheiro),
    'nVencidas',         (select n_vencidas from dinheiro),
    'chamadosAbertos',   (select abertos from chamados),
    'chamadosParados',   (select parados from chamados),
    'chamadosTotal',     (select total from chamados),
    'interesse',         (select count(*) from walkstamp.interesse),
    'interesse30',       (select count(*) from walkstamp.interesse where criado_em > now() - interval '30 days'),
    'eventos30',         (select count(*) from walkstamp.evento where criado_em > now() - interval '30 days'),
    'emissoes30',        (select count(*) from walkstamp.emissao where criado_em > now() - interval '30 days')
  ),
  'clientes', coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'plano', c.plano, 'ativo', c.ativo,
        'assentos', c.assentos, 'dias', c.dias, 'criado_em', c.criado_em,
        'stripe', c.stripe_assinatura is not null,
        'usados',  (select count(*) from walkstamp.usuario u where u.cliente_id = c.id and u.ativo),
        'pago',    coalesce((select sum(f.valor_centavos) from walkstamp.fatura f
                             where f.cliente_id = c.id and f.status = 'paga'), 0),
        'aberto',  coalesce((select sum(f.valor_centavos) from walkstamp.fatura f
                             where f.cliente_id = c.id and f.status = 'aberta'), 0)
      ) as x
      from walkstamp.cliente c
    ) t
  ), '[]'::jsonb),
  'contas', coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object(
        'email', email, 'plano', plano, 'cliente', cliente, 'ativo', ativo,
        'assentos', assentos, 'dias', dias, 'emissoes', emissoes,
        'ultima_em', ultima_em, 'vence_em', vence_em, 'criado_em', criado_em
      ) as x
      from walkstamp.conta order by criado_em desc limit 300
    ) t
  ), '[]'::jsonb),
  'faturas', coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object(
        'numero', f.numero, 'cliente', c.nome, 'valor', f.valor_centavos,
        'moeda', f.moeda, 'status', f.status, 'vence_em', f.vence_em,
        'pago_em', f.pago_em, 'nf_numero', f.nf_numero, 'nf_url', f.nf_url,
        'competencia', f.competencia, 'criado_em', f.criado_em,
        'atrasada', f.status = 'aberta' and f.vence_em is not null and f.vence_em < current_date
      ) as x
      from walkstamp.fatura f left join walkstamp.cliente c on c.id = f.cliente_id
      order by f.criado_em desc limit 300
    ) t
  ), '[]'::jsonb),
  'chamados', coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object(
        'numero', numero, 'tipo', tipo, 'status', status, 'texto', texto,
        'resposta', resposta, 'email', email, 'nota', nota, 'idioma', idioma,
        'cenario', cenario, 'origem', origem, 'diagnostico', diagnostico,
        'criado_em', criado_em, 'respondido_em', respondido_em
      ) as x
      from walkstamp.recado order by criado_em desc limit 300
    ) t
  ), '[]'::jsonb),
  'interesse', coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object('email', email, 'idioma', idioma, 'criado_em', criado_em) as x
      from walkstamp.interesse order by criado_em desc limit 300
    ) t
  ), '[]'::jsonb),
  'uso', jsonb_build_object(
    'formato', coalesce((select jsonb_agg(jsonb_build_object('chave', formato, 'n', n) order by n desc)
                         from (select formato, count(*) n from walkstamp.evento
                               where criado_em > now() - interval '90 days' and formato is not null
                               group by formato) t), '[]'::jsonb),
    'idioma',  coalesce((select jsonb_agg(jsonb_build_object('chave', idioma, 'n', n) order by n desc)
                         from (select idioma, count(*) n from walkstamp.evento
                               where criado_em > now() - interval '90 days' and idioma is not null
                               group by idioma) t), '[]'::jsonb),
    'origem',  coalesce((select jsonb_agg(jsonb_build_object('chave', origem, 'n', n) order by n desc)
                         from (select origem, count(*) n from walkstamp.evento
                               where criado_em > now() - interval '90 days' and origem is not null
                               group by origem) t), '[]'::jsonb),
    'dia',     coalesce((select jsonb_agg(jsonb_build_object('chave', d::text, 'n', n) order by d)
                         from (select criado_em::date d, count(*) n from walkstamp.evento
                               where criado_em > now() - interval '30 days'
                               group by 1) t), '[]'::jsonb)
  )
);
$$;

create or replace function public.walkstamp_negocio_painel()
returns jsonb
language sql
security definer
set search_path to 'public', 'walkstamp'
as $$ select walkstamp.negocio_painel(); $$;

revoke all on function public.walkstamp_negocio_painel() from public, anon, authenticated;
grant execute on function public.walkstamp_negocio_painel() to service_role;
