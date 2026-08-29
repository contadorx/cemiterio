-- ============================================================================
-- 0142 — A PROMESSA TEM DONO E PRAZO
-- ============================================================================
--
-- O QUE SE MEDIU EM 29/08, EM PRODUCAO
--
--   25  respostas da IA a mensagens de familia
--   11  (44%) prometiam voltar: "deixa eu conferir isso direitinho e ja te falo"
--    0  diziam um prazo
--    0  deixavam registro de que havia uma promessa
--
-- E das 11, SEIS eram "recebi seu comprovante, vou conferir e te confirmo".
-- Essa promessa e estruturalmente verdadeira — o comprovante fica `a_conferir`
-- ate alguem confirmar. O problema nao e a frase: e que CONFERIR NAO DEVOLVE
-- NADA para a familia. Medido junto: 94 lancamentos, ZERO conferidos.
--
-- POR QUE NAO SE RESOLVE PROIBINDO A FRASE
--
-- As vezes conferir e a coisa certa a dizer. Uma IA proibida de dizer "vou
-- conferir" vai inventar um numero — que e o defeito que o prompt inteiro foi
-- escrito para evitar. O conserto nao e calar a promessa; e dar DONO e PRAZO a
-- ela, do jeito que uma pessoa faria: anotando.
--
-- A promessa vira uma linha aqui, aparece no "Precisa de voce" com o relogio
-- correndo, e some quando for cumprida. E o mesmo formato de todo o resto deste
-- sistema: um evento que deixa marca, em vez de uma intencao que evapora.
--
-- NADA AQUI ENVIA NADA. A tabela so guarda o que foi prometido; quem responde
-- continua sendo uma pessoa, pela fila de sempre.
-- ============================================================================

create table if not exists compromissos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  cliente_id   uuid not null references clientes(id) on delete cascade,
  conversa_id  uuid references conversas(id) on delete set null,

  -- O QUE FOI PROMETIDO, em uma linha, do jeito que alguem anotaria.
  sobre        text not null,
  -- O texto que a familia leu. Sem ele, "confirmar o valor dos vasos" nao diz
  -- o que ela esta esperando ouvir de volta.
  prometido_em_texto text,

  -- QUEM PROMETEU. A IA rascunha, mas quem manda e uma pessoa: a promessa so
  -- nasce quando a mensagem SAI. 'ia' marca a origem do rascunho.
  origem       text not null default 'ia',

  criado_em    timestamptz not null default clock_timestamp(),
  -- ATE QUANDO. Um dia util e o padrao da casa: a familia que ouve "ja te
  -- falo" espera hoje ou amanha, nao semana que vem.
  vence_em     date not null default (now() at time zone 'America/Sao_Paulo')::date + 1,

  cumprido_em  timestamptz,
  cumprido_por uuid,
  -- Como foi cumprido: 'respondido' (mandou a resposta) ou 'nao_cabe' (a
  -- promessa perdeu sentido — a familia resolveu sozinha, o assunto morreu).
  desfecho     text,

  constraint compromissos_sobre_nao_vazio check (btrim(sobre) <> ''),
  constraint compromissos_origem_conhecida check (origem in ('ia', 'humano')),
  constraint compromissos_desfecho_conhecido
    check (desfecho is null or desfecho in ('respondido', 'nao_cabe')),
  -- Cumprido tem de ter os dois: sem desfecho, "cumprido" nao diz o que houve.
  constraint compromissos_cumprido_completo
    check ((cumprido_em is null and desfecho is null)
        or (cumprido_em is not null and desfecho is not null))
);

create index if not exists ix_compromissos_abertos
  on compromissos (org_id, vence_em) where cumprido_em is null;
create index if not exists ix_compromissos_cliente
  on compromissos (cliente_id, criado_em desc);

alter table compromissos enable row level security;

drop policy if exists compromissos_sel on compromissos;
drop policy if exists compromissos_ins on compromissos;
drop policy if exists compromissos_upd on compromissos;
drop policy if exists compromissos_del on compromissos;

-- UMA POLICY POR COMANDO. `delete` nunca consulta `with check` (licao da 0079).
create policy compromissos_sel on compromissos as restrictive
  for select using (org_id = current_org_id());
create policy compromissos_ins on compromissos as restrictive
  for insert with check (org_id = current_org_id());
create policy compromissos_upd on compromissos as restrictive
  for update using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy compromissos_del on compromissos as restrictive
  for delete using (org_id = current_org_id());

create policy compromissos_tudo on compromissos
  for all using (true) with check (true);

-- ----------------------------------------------------------------------------
-- O QUE ESTA DEVENDO RESPOSTA
--
-- p_org explicito (licao da 0103). So le.
-- ----------------------------------------------------------------------------
create or replace function sureya_compromissos_abertos(p_org uuid)
returns table (
  id uuid, cliente_id uuid, cliente text, conversa_id uuid,
  sobre text, vence_em date, atrasado boolean, criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.cliente_id, c.nome, k.conversa_id, k.sobre, k.vence_em,
         -- ATRASADO E O DIA DA OPERACAO, nao o de UTC: das 21h a meia-noite o
         -- dia em UTC ja virou, e uma promessa que vence hoje apareceria como
         -- atrasada na vespera.
         k.vence_em < (now() at time zone 'America/Sao_Paulo')::date,
         k.criado_em
    from compromissos k
    join clientes c on c.id = k.cliente_id
   where k.org_id = p_org and k.cumprido_em is null
   order by k.vence_em, k.criado_em;
$$;

comment on function sureya_compromissos_abertos(uuid) is
  'O que foi prometido a uma familia e ainda nao foi respondido (0142). So le.';

-- SECURITY DEFINER ignora RLS, e o Supabase concede EXECUTE a anon por padrao
-- em `public` (licao da 0129). Isto devolve nome de familia.
revoke execute on function sureya_compromissos_abertos(uuid) from public, anon;
grant  execute on function sureya_compromissos_abertos(uuid) to authenticated, service_role;
