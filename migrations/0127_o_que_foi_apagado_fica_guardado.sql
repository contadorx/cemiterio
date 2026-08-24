-- ============================================================================
-- 0127 — O QUE FOI APAGADO FICA GUARDADO
-- ============================================================================
--
-- POR QUE ESTA TABELA EXISTE
--
-- O Leandro mandou apagar as 257 lavagens de contrato que apareciam na tela de
-- Avulsos. Elas nao tinham foto, nao tinham execucao e nao tinham um centavo em
-- conta corrente — sao regeneraveis pelo botao Gerar. Ainda assim: apagar 257
-- linhas de producao sem copia e o tipo de coisa que so se descobre errada
-- depois, e ai nao ha volta.
--
-- Entao a copia vem ANTES do delete, e mora no banco — nao num arquivo que
-- alguem precisa achar. Voltar e um `insert into servicos select ... from
-- servicos_arquivados`.
--
-- Mesmo desenho da `sureya_historico_razao_antigo`, da limpeza do razao: o que
-- sai do lugar vivo nao evapora, muda de sala.
--
-- `like servicos` copia as colunas e os defaults e MAIS NADA — sem chaves
-- estrangeiras, sem indices unicos. E de proposito: arquivo nao pode recusar
-- uma linha porque o tumulo dela foi excluido depois. Arquivo aceita tudo.
--
-- NAO HA DELETE NESTA MIGRATION. O delete e um ato, com data e motivo, nao uma
-- regra que se repete a cada vez que a trilha roda. Rodar a trilha duas vezes
-- nao pode apagar nada.
-- ============================================================================

create table if not exists servicos_arquivados (
  like servicos including defaults
);

alter table servicos_arquivados
  add column if not exists arquivado_em timestamptz not null default now(),
  add column if not exists motivo       text;

comment on table servicos_arquivados is
  'Lavagens apagadas de `servicos`, com data e motivo. Copia crua: sem chaves '
  'estrangeiras, para aceitar linha cujo tumulo ja nao existe.';

create index if not exists idx_servicos_arquivados_org on servicos_arquivados (org_id);
create index if not exists idx_servicos_arquivados_quando on servicos_arquivados (arquivado_em desc);

-- ============================================================================
-- QUEM PODE VER E MEXER
-- ============================================================================
alter table servicos_arquivados enable row level security;

drop policy if exists servicos_arquivados_org on servicos_arquivados;
create policy servicos_arquivados_org on servicos_arquivados
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Uma restritiva POR COMANDO — a licao da 0079. DELETE nao consulta
-- `with check`; sem a politica de delete, o arquivo poderia ser esvaziado por
-- quem nao e admin, e um arquivo que se apaga nao e arquivo.
drop policy if exists servicos_arquivados_insert_admin on servicos_arquivados;
create policy servicos_arquivados_insert_admin on servicos_arquivados
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);

drop policy if exists servicos_arquivados_update_admin on servicos_arquivados;
create policy servicos_arquivados_update_admin on servicos_arquivados
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

drop policy if exists servicos_arquivados_delete_admin on servicos_arquivados;
create policy servicos_arquivados_delete_admin on servicos_arquivados
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

-- O campo nao ve o arquivo. A Nina abre a lista do dia; historico apagado nao
-- e assunto dela e so atrapalharia.
drop policy if exists servicos_arquivados_sem_campo on servicos_arquivados;
create policy servicos_arquivados_sem_campo on servicos_arquivados
  as restrictive for all using (not is_campo()) with check (not is_campo());
