-- ============================================================================
-- AS RUAS COSTURADAS, PROVADAS A CADA COMMIT
--
-- A 0084 e uma migration de DADOS: ela so faz efeito onde ja existem quadras
-- e ruas. No banco reconstruido do zero ela roda como no-op — e portanto a
-- trilha aplicar sem erro NAO prova nada sobre ela.
--
-- Este arquivo monta a mesma planta que a producao tinha ANTES da 0084 (as 4
-- quadras, as 41 ruas, as chaves que a 0051 deixou), reaplica o arquivo da
-- 0084 e cobra o resultado: a Principal nas quatro quadras, as doze ruas
-- partidas costuradas, e a Rua 7 intocada.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
-- TODA conferencia daqui e presa ao cemiterio DESTE teste. Os outros
-- arquivos do harness criam quadras proprias, e a 0084 cria "Principal" em
-- toda quadra que nao tem: uma contagem global passaria a somar quadra de
-- teste vizinho e falharia por motivo errado.
set client_min_messages to notice;

create or replace function ci4(nome text, real_ text, esperado text) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'ROTEIRO FALHOU — %: veio [%], esperado [%]', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

-- ---------------------------------------------------------------------------
-- A PLANTA, COMO ESTAVA ANTES DA 0084
-- ---------------------------------------------------------------------------
insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000004','CI Roteiro')
  on conflict do nothing;
insert into cemiterios (id, org_id, nome)
  values ('dddddddd-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000004','CI Cemiterio')
  on conflict (id) do nothing;

do $$
declare
  v_org uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_cem uuid := 'dddddddd-0000-0000-0000-000000000004';
  v_q uuid; k int; n int;
begin
  for k in 1..4 loop
    insert into quadras (org_id, cemiterio_id, codigo, ordem)
    values (v_org, v_cem, 'Quadra ' || k, k)
    returning id into v_q;

    -- Quadra 1 tinha a Principal (cadastrada a mao, sem chave); as outras nao.
    if k = 1 then
      insert into ruas (org_id, cemiterio_id, quadra_id, nome, tipo, ordem)
      values (v_org, v_cem, v_q, 'Principal', 'principal', 0);
    end if;

    -- Quadras 1 e 2: Ruas 1..7 na ordem 1..7.
    -- Quadras 3 e 4: Rua 7 na ordem 0 (a 0051 pos ela primeiro) e 8..13 em 1..6.
    if k in (1,2) then
      for n in 1..7 loop
        insert into ruas (org_id, cemiterio_id, quadra_id, nome, tipo, ordem)
        values (v_org, v_cem, v_q, 'Rua ' || n, 'rua', n);
      end loop;
    else
      insert into ruas (org_id, cemiterio_id, quadra_id, nome, tipo, ordem)
      values (v_org, v_cem, v_q, 'Rua 7', 'rua', 0);
      for n in 8..13 loop
        insert into ruas (org_id, cemiterio_id, quadra_id, nome, tipo, ordem)
        values (v_org, v_cem, v_q, 'Rua ' || n, 'rua', n - 7);
      end loop;
    end if;

    -- Transversais: 1..3 a direita (quadras 1 e 3), 4..6 a esquerda (2 e 4).
    for n in (case when k in (1,3) then 1 else 4 end)
          .. (case when k in (1,3) then 3 else 6 end) loop
      insert into ruas (org_id, cemiterio_id, quadra_id, nome, tipo, ordem, chave_fisica)
      values (v_org, v_cem, v_q, 'Transversal ' || n, 'transversal',
              (case when k in (1,2) then 7 else 6 end)
                + (case when k in (1,3) then 4 - n else 7 - n end),
              'transversal-' || n);
    end loop;
  end loop;

  -- As chaves que a 0051 deixou na Rua 7.
  update ruas r set chave_fisica = 'rua7-direita'
    from quadras q where q.id = r.quadra_id and q.cemiterio_id = v_cem
     and r.nome = 'Rua 7' and q.codigo in ('Quadra 1','Quadra 3');
  update ruas r set chave_fisica = 'rua7-esquerda'
    from quadras q where q.id = r.quadra_id and q.cemiterio_id = v_cem
     and r.nome = 'Rua 7' and q.codigo in ('Quadra 2','Quadra 4');
end $$;

select ci4('planta montada: 41 ruas',
           (select count(*)::text from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004'), '41');
select ci4('antes: Principal so na Quadra 1',
           (select count(*)::text from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and r.nome='Principal'), '1');
select ci4('antes: nenhuma das doze tem chave',
           (select count(*)::text from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004'
               and r.nome in ('Rua 1','Rua 2','Rua 3','Rua 8','Rua 13')
               and r.chave_fisica is not null), '0');

-- ---------------------------------------------------------------------------
-- A MIGRATION, RODADA DE VERDADE (o arquivo que vai para o banco)
-- ---------------------------------------------------------------------------
\i migrations/0084_a_principal_em_todas_as_quadras.sql

-- ---------------------------------------------------------------------------
-- O QUE TEM QUE TER ACONTECIDO
-- ---------------------------------------------------------------------------
select ci4('Principal nas quatro quadras',
           (select string_agg(q.codigo, ' + ' order by q.ordem)
              from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and r.nome='Principal'),
           'Quadra 1 + Quadra 2 + Quadra 3 + Quadra 4');

select ci4('Principal e uma avenida so',
           (select count(distinct coalesce(r.chave_fisica,'?'))::text || '/' ||
                   count(*)::text from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and r.nome='Principal'), '1/4');

select ci4('Rua 3 costurada entre Quadra 1 e 2',
           (select string_agg(q.codigo, ' + ' order by q.ordem)
              from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and r.chave_fisica='rua-3'),
           'Quadra 1 + Quadra 2');

select ci4('Rua 11 costurada entre Quadra 3 e 4',
           (select string_agg(q.codigo, ' + ' order by q.ordem)
              from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and r.chave_fisica='rua-11'),
           'Quadra 3 + Quadra 4');

select ci4('as doze ganharam chave, nem uma a mais',
           (select count(*)::text from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and r.chave_fisica like 'rua-%'), '24');

-- A Rua 7 nao entrou na costura: as metades dela sao LADOS, nao continuacao.
select ci4('Rua 7 intocada',
           (select string_agg(distinct r.chave_fisica, ',' order by r.chave_fisica)
              from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and r.nome='Rua 7'),
           'rua7-direita,rua7-esquerda');

-- Ordem 0 aberta para a Principal SEM trocar a sequencia de quem ja estava la.
select ci4('Quadra 3: a sequencia das ruas nao mudou',
           (select string_agg(r.nome, ' > ' order by r.ordem)
              from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and q.codigo='Quadra 3'),
           'Principal > Rua 7 > Rua 8 > Rua 9 > Rua 10 > Rua 11 > Rua 12 > Rua 13'
           || ' > Transversal 3 > Transversal 2 > Transversal 1');

select ci4('Quadra 1: nada foi empurrado (o 0 ja era da Principal)',
           (select string_agg(r.ordem::text, ',' order by r.ordem)
              from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and q.codigo='Quadra 1'),
           '0,1,2,3,4,5,6,7,8,9,10');

-- ---------------------------------------------------------------------------
-- RODAR DUAS VEZES NAO PODE EMPURRAR NADA
-- ---------------------------------------------------------------------------
\i migrations/0084_a_principal_em_todas_as_quadras.sql

select ci4('idempotente: continua uma Principal por quadra',
           (select count(*)::text from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and r.nome='Principal'), '4');
select ci4('idempotente: Quadra 3 nao andou de novo',
           (select string_agg(r.ordem::text, ',' order by r.ordem)
              from ruas r join quadras q on q.id=r.quadra_id
             where q.cemiterio_id = 'dddddddd-0000-0000-0000-000000000004' and q.codigo='Quadra 3'),
           '0,1,2,3,4,5,6,7,8,9,10');

do $$ begin raise notice 'ROTEIRO: todas as conferencias passaram'; end $$;
