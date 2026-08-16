-- =====================================================================
-- 0051 · RUAS FÍSICAS COMPARTILHADAS ENTRE QUADRAS
-- =====================================================================
--
-- JÁ APLICADA NO BANCO. Está aqui para o repositório reproduzir o produto.
--
-- O PROBLEMA
-- Algumas ruas são o mesmo caminho no chão, mas aparecem partidas no cadastro
-- porque a divisa da quadra passa no meio delas:
--
--   · A RUA 7 é a divisa. Um lado dela pertence à Quadra 1, o outro à
--     Quadra 3 — e a Sureya percorre uma vez, limpando os dois lados.
--   · AS TRANSVERSAIS correm da Rua 1 até a Rua 13, atravessando a divisa.
--     A Transversal 3 está partida entre Quadra 1 (11 túmulos) e Quadra 3.
--
-- Sem amarração, o roteiro mandaria a Nina fazer a metade de baixo, ir embora
-- para outra quadra e voltar depois para a metade de cima — andando o mesmo
-- corredor duas vezes no mesmo dia.
--
-- A SOLUÇÃO
-- `chave_fisica`: ruas com a mesma chave são o mesmo caminho. O roteiro
-- (src/lib/agenda.ts, ordenarPorEndereco) agrupa por ela e trata o conjunto
-- como UMA parada, posicionada onde a primeira metade cai na caminhada.
--
-- Nula para rua comum, então nada muda para as demais.
-- =====================================================================

alter table ruas add column if not exists chave_fisica text;

comment on column ruas.chave_fisica is
  'Ruas com a mesma chave são o MESMO caminho físico, partido entre quadras. O roteiro as agrupa numa parada só, para a Nina não percorrer duas vezes. Nulo = rua comum.';

create index if not exists idx_ruas_chave_fisica
  on ruas (org_id, chave_fisica) where chave_fisica is not null;

do $$
declare
  v_org uuid; v_cem uuid; v_q uuid; n int;
begin
  select id into v_org from orgs limit 1;
  select id into v_cem from cemiterios where org_id = v_org limit 1;

  -- A Rua 7 faltava nas quadras de cima. Ordem 0: subindo o cemitério, ela é
  -- a primeira rua que se encontra nas quadras 3 e 4.
  select id into v_q from quadras where cemiterio_id=v_cem and codigo='Quadra 3';
  insert into ruas (org_id, cemiterio_id, quadra_id, nome, tipo, ordem, observacao)
  values (v_org, v_cem, v_q, 'Rua 7', 'rua', 0,
          'Divisa com a Quadra 1. Mesma rua física: percorrida uma vez só.')
  on conflict (quadra_id, nome) do nothing;

  select id into v_q from quadras where cemiterio_id=v_cem and codigo='Quadra 4';
  insert into ruas (org_id, cemiterio_id, quadra_id, nome, tipo, ordem, observacao)
  values (v_org, v_cem, v_q, 'Rua 7', 'rua', 0,
          'Divisa com a Quadra 2. Mesma rua física: percorrida uma vez só.')
  on conflict (quadra_id, nome) do nothing;

  -- Rua 7: os dois lados seguem SEPARADOS, porque a Principal passa no meio.
  update ruas r set chave_fisica = 'rua7-direita'
    from quadras q where q.id = r.quadra_id
     and r.nome = 'Rua 7' and q.codigo in ('Quadra 1', 'Quadra 3');

  update ruas r set chave_fisica = 'rua7-esquerda'
    from quadras q where q.id = r.quadra_id
     and r.nome = 'Rua 7' and q.codigo in ('Quadra 2', 'Quadra 4');

  -- Transversais: cada número é um corredor inteiro. Os nomes já distinguem
  -- os lados (1,2,3 à direita; 4,5,6 à esquerda), então o número basta.
  for n in 1..6 loop
    update ruas r set chave_fisica = 'transversal-' || n
      from quadras q where q.id = r.quadra_id
       and q.cemiterio_id = v_cem
       and r.nome = 'Transversal ' || n;
  end loop;
end $$;

-- =====================================================================
-- CONFERÊNCIA — cada chave deve aparecer com as suas duas metades
-- =====================================================================
-- select r.chave_fisica,
--        string_agg(q.codigo, ' + ' order by q.ordem) as metades
--   from ruas r join quadras q on q.id = r.quadra_id
--  where r.chave_fisica is not null
--  group by r.chave_fisica order by r.chave_fisica;
