-- ============================================================================
-- SUREYA — 0044 · O SISTEMA PASSA A SABER QUE EXISTE MAIS DE UM CEMITÉRIO
--
-- O ESTADO DE HOJE
-- ---------------------------------------------------------------------------
-- `cemiterio_id` existe SÓ em `quadras`. `tumulos`, `servicos`, `planos` e
-- `membros` não sabem de cemitério nenhum. Na prática:
--   · a rota do dia agrupa por `quadras.ordem`, que é um inteiro GLOBAL — duas
--     quadras de cemitérios diferentes com a mesma ordem viram um bloco só, e
--     a sequência do dia pode ser A → B → A;
--   · o custo de atravessar a cidade entre dois cemitérios é ZERO para o
--     alocador (a proximidade só é calculada dentro da quadra);
--   · a capacidade do dia é uma só, para todos os locais;
--   · o alerta de jazigo repetido conta "o número 45 aparece 3x" quando são
--     3 cemitérios;
--   · três portas de cadastro escolhem o cemitério com `order("nome").limit(1)`
--     — ou seja, o primeiro em ordem alfabética, sempre.
--
-- O QUE ESTA MIGRATION FAZ
--   1. `tumulos.cemiterio_id` e `servicos.cemiterio_id` (desnormalizado, com
--      backfill a partir da quadra) — para consultar e agrupar sem join triplo;
--   2. `cemiterios.dias_semana` — em que dias a equipe vai naquele cemitério
--      (NULL = todos os dias, que é o comportamento de hoje);
--   3. `cemiterios.ativo` e `cemiterios.ordem`;
--   4. `membros.cemiterio_id` — amarra uma pessoa a um local (NULL = atende
--      todos, que é o comportamento de hoje).
--
-- OS DOIS MECANISMOS SÃO OPCIONAIS E INDEPENDENTES. Sem configurar nada, o
-- sistema se comporta exatamente como hoje. Você decide na prática:
--   · "dias fixos por cemitério"  → preencha `cemiterios.dias_semana`;
--   · "cada pessoa num cemitério" → preencha `membros.cemiterio_id`;
--   · os dois juntos também funcionam.
--
-- ⚠ O QUE SE PERDE: NADA. Só adiciona colunas e preenche as novas a partir do
--   que já existe. Nenhuma coluna antiga é lida, alterada ou apagada.
--   COMO CONFERIR ANTES: `select count(*) from tumulos;` e
--   `select count(*) from servicos;` — os números têm que ser idênticos depois.
--   A Parte 3 confere se sobrou alguma linha sem cemitério.
-- ============================================================================

-- ============================================================================
-- PARTE 1 — AS COLUNAS
-- ============================================================================

alter table cemiterios
  add column if not exists ativo       boolean not null default true,
  add column if not exists ordem       int     not null default 0,
  -- dias da semana em que a equipe vai neste cemitério (0=domingo ... 6=sábado).
  -- NULL = vai em qualquer dia de trabalho, que é como funciona hoje.
  add column if not exists dias_semana int[];

comment on column cemiterios.dias_semana is
  'Dias em que a equipe atende este cemitério (0=dom..6=sáb). NULL = todos os dias de trabalho da casa.';

alter table tumulos
  add column if not exists cemiterio_id uuid references cemiterios(id) on delete restrict;

alter table servicos
  add column if not exists cemiterio_id uuid references cemiterios(id) on delete restrict;

alter table membros
  add column if not exists cemiterio_id uuid references cemiterios(id) on delete set null;

comment on column membros.cemiterio_id is
  'Cemitério fixo desta pessoa. NULL = atende todos (comportamento padrão).';

-- ============================================================================
-- PARTE 2 — BACKFILL (a partir da quadra, que sempre soube o cemitério)
-- ============================================================================

update tumulos t
   set cemiterio_id = q.cemiterio_id
  from quadras q
 where q.id = t.quadra_id
   and t.cemiterio_id is distinct from q.cemiterio_id;

update servicos s
   set cemiterio_id = t.cemiterio_id
  from tumulos t
 where t.id = s.tumulo_id
   and s.cemiterio_id is distinct from t.cemiterio_id;

-- Daqui para frente o aplicativo preenche as duas na criação. Este gatilho é a
-- rede de segurança para qualquer caminho que esqueça (importação, SQL na mão,
-- RPC antiga): o serviço herda o cemitério do túmulo, e o túmulo, da quadra.
create or replace function sureya_herdar_cemiterio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_TABLE_NAME = 'tumulos' and new.cemiterio_id is null then
    select cemiterio_id into new.cemiterio_id from quadras where id = new.quadra_id;
  elsif TG_TABLE_NAME = 'servicos' and new.cemiterio_id is null then
    select cemiterio_id into new.cemiterio_id from tumulos where id = new.tumulo_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tumulo_cemiterio on tumulos;
create trigger trg_tumulo_cemiterio
  before insert or update of quadra_id on tumulos
  for each row execute function sureya_herdar_cemiterio();

drop trigger if exists trg_servico_cemiterio on servicos;
create trigger trg_servico_cemiterio
  before insert on servicos
  for each row execute function sureya_herdar_cemiterio();

create index if not exists idx_tumulos_cemiterio  on tumulos  (org_id, cemiterio_id);
create index if not exists idx_servicos_cemiterio on servicos (org_id, cemiterio_id, data_prevista);

-- ============================================================================
-- PARTE 3 — CONFERÊNCIA (rode depois)
-- ============================================================================

-- 3.1 — Tem que voltar ZERO nas duas colunas. Se voltar número, há túmulo com
--       quadra órfã (quadra sem cemitério) — investigue antes de seguir.
select (select count(*) from tumulos  where cemiterio_id is null) as tumulos_sem_cemiterio,
       (select count(*) from servicos where cemiterio_id is null) as servicos_sem_cemiterio;

-- 3.2 — Retrato por cemitério. É o número que a tela de capacidade vai usar.
select c.nome,
       c.ativo,
       c.dias_semana,
       count(distinct q.id) as quadras,
       count(distinct t.id) as jazigos,
       count(distinct t.cliente_id) as familias,
       count(*) filter (where s.status in ('pendente','agendado')) as limpezas_em_aberto
  from cemiterios c
  left join quadras q on q.cemiterio_id = c.id
  left join tumulos t on t.quadra_id = q.id
  left join servicos s on s.tumulo_id = t.id
 group by c.id, c.nome, c.ativo, c.dias_semana
 order by c.ordem, c.nome;

-- 3.3 — Quem está amarrado a um cemitério (deve começar tudo NULL).
select m.nome, m.papel, m.ativo, c.nome as cemiterio_fixo
  from membros m
  left join cemiterios c on c.id = m.cemiterio_id
 order by m.ativo desc, m.nome;

-- ============================================================================
-- PARTE 4 — COMO CONFIGURAR (opcional, só quando o segundo cemitério entrar)
-- ============================================================================

-- 4.1 — "Dias fixos por cemitério": segunda/quarta/sexta num, terça/quinta no
--       outro. 0=domingo, 1=segunda ... 6=sábado.
--
-- update cemiterios set dias_semana = '{1,3,5}' where nome ilike '%Saudade%';
-- update cemiterios set dias_semana = '{2,4,6}' where nome ilike '%NOME DO OUTRO%';
--
--       Para voltar ao normal (a equipe vai em qualquer dia):
-- update cemiterios set dias_semana = null;

-- 4.2 — "Cada pessoa num cemitério":
--
-- update membros set cemiterio_id = (select id from cemiterios where nome ilike '%Saudade%')
--  where nome ilike '%Nadir%';
--
--       Para soltar (a pessoa volta a atender todos):
-- update membros set cemiterio_id = null where nome ilike '%Nadir%';

-- 4.3 — Cadastrar o segundo cemitério (o painel também faz isso, em
--       Config → Cemitérios; este SQL é só para quem preferir).
--
-- insert into cemiterios (org_id, nome, endereco, ordem)
-- values (current_org_id(), 'Cemitério XXXXX — Mauá', 'Bairro, Mauá - SP', 2);
