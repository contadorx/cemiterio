-- =====================================================================
-- 0086 · TODOS OS TEXTOS DE UMA VEZ, PARA A TELA PODER OFERECER A TROCA
-- =====================================================================
--
-- POR QUE ESTA FUNÇÃO EXISTE
-- `sureya_texto_modelo` (0085) SORTEIA: dada uma semente, devolve um texto. É o
-- que a conclusão da lavagem precisa — um texto, sempre o mesmo para o mesmo
-- serviço.
--
-- A tela de liberação precisa do contrário: TODOS os textos ativos, para a
-- Sureya olhar e escolher outro num toque. Tentar arrancar isso do sorteio,
-- chamando-o uma vez por modelo com sementes diferentes, não funciona — a
-- semente escolhe qual sai, não qual eu quero. Chegou a estar escrito assim
-- numa primeira versão desta rota, e o código não fazia o que o comentário
-- dizia que fazia.
--
-- A alternativa era refazer a substituição em TypeScript. Também não: a parte
-- sutil é `sureya_primeiro_nome` — "Sr. André Nagae" tem de virar "Sr. André",
-- e não "Sr." nem "André". Duas implementações divergem no primeiro caso de
-- tratamento, e o texto pré-visualizado deixa de ser o texto enviado.
-- =====================================================================

create or replace function public.sureya_textos_do_tipo(
  p_org    uuid,
  p_tipo   sureya_tipo_mensagem,
  p_nome   text default null,
  p_jazigo text default null
)
returns table(id uuid, texto text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.id,
         replace(
           replace(m.texto, '{nome}',
                   coalesce(nullif(sureya_primeiro_nome(p_nome), ''), 'tudo bem')),
           '{jazigo}',
           coalesce(nullif(btrim(coalesce(p_jazigo,'')), ''), 'da família'))
    from modelos_mensagem m
   where m.org_id = p_org and m.tipo = p_tipo and m.ativo
   order by m.ordem, m.created_at, m.id;
$$;

comment on function public.sureya_textos_do_tipo(uuid, sureya_tipo_mensagem, text, text) is
  'Todos os modelos ativos do tipo, ja renderizados para uma pessoa e um jazigo. E a lista que a tela de liberacao oferece; o sorteio de um so e sureya_texto_modelo.';

revoke execute on function public.sureya_textos_do_tipo(uuid, sureya_tipo_mensagem, text, text) from public;
grant  execute on function public.sureya_textos_do_tipo(uuid, sureya_tipo_mensagem, text, text) to authenticated, service_role;

-- =====================================================================
-- CONFERENCIA
-- =====================================================================
-- select * from sureya_textos_do_tipo(
--          (select id from orgs limit 1), 'foto', 'Sr. Andre Nagae', 'Q1-R5-658');
