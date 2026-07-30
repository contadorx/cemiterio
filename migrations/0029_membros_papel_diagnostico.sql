-- 0029 — Quem e admin, quem e campo (diagnostico + correcao manual)
-- ---------------------------------------------------------------------------
-- Contexto: o app lia o papel do membro com um "limit(1)" SEM filtrar por
-- user_id. Enquanto a org tinha uma conta so, funcionava por acidente. Quando a
-- segunda conta (campo) entrou, a consulta passou a devolver a linha errada e o
-- dono virou "campo" — indo direto para /campo e sem acessar /painel.
-- O codigo ja foi corrigido (roles.ts, middleware.ts). Esta migration serve
-- para CONFERIR e, se preciso, CORRIGIR o que esta gravado.
-- ---------------------------------------------------------------------------

-- PARTE 1 — DIAGNOSTICO (so leitura, rode primeiro)
select
  m.org_id,
  m.user_id,
  u.email,
  m.papel,
  m.nome,
  m.ativo,
  m.created_at
from membros m
left join auth.users u on u.id = m.user_id
order by m.papel, m.created_at;

-- Leia o resultado:
--   * o e-mail do dono precisa aparecer com papel = 'admin';
--   * a ajudante precisa aparecer com papel = 'campo';
--   * se o e-mail do dono NAO aparecer, a linha dele nao existe (veja a PARTE 3).


-- PARTE 2 — CORRIGIR O PAPEL DO DONO (rode so se a PARTE 1 mostrar errado)
-- Troque o e-mail se for outro.
-- update membros m
--    set papel = 'admin'
--   from auth.users u
--  where u.id = m.user_id
--    and u.email = 'leandro@contadorx.com.br';


-- PARTE 3 — CRIAR A LINHA DO DONO (rode so se ela nao existir)
-- Usa a org que ja existe no banco (a primeira criada).
-- insert into membros (org_id, user_id, papel, nome)
-- select (select id from orgs order by created_at limit 1),
--        u.id, 'admin', 'Leandro'
--   from auth.users u
--  where u.email = 'leandro@contadorx.com.br'
-- on conflict (org_id, user_id) do update set papel = 'admin';


-- PARTE 4 — CONFERIR DEPOIS
-- select u.email, m.papel from membros m join auth.users u on u.id = m.user_id order by m.papel;
