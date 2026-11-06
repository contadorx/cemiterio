-- ===========================================================================
-- 0163 — O BANCO APRENDE QUEM E QUEM
--
-- MEDIDO no extrato real de outubro/2026: 248 PIX recebidos, 196 nomes
-- distintos. Casando por prefixo contra `clientes` e `familias`, apenas 69
-- casam — 127 nao.
--
-- E nao e falha do cadastro. O nome que o banco imprime e de quem PAGA, e
-- quem paga muitas vezes nao e quem esta cadastrado: "a Katia e responsavel
-- da familia Tonelloti e pagou para os Tonelloti" (relatado em 29/08). Alem
-- disso o Bradesco TRUNCA o nome em ~21 caracteres ("SANDRA REGINA M DE LI"),
-- o que torna comparacao por igualdade inutil.
--
-- Entao a conciliacao nao pode nascer de adivinhacao. Ela nasce de uma
-- APRENDIZAGEM: na primeira vez alguem diz de quem e aquele nome, e o sistema
-- guarda. Sao 196 nomes uma vez; no mes seguinte quase tudo entra sozinho.
--
-- POR QUE UMA TABELA, E NAO UM CAMPO EM `clientes`:
--   . um nome de banco pode apontar para uma FAMILIA sem apontar para uma
--     pessoa do cadastro (o filho que paga pela mae e nunca foi cadastrado);
--   . a mesma familia pode ter varios pagadores, cada um com seu nome;
--   . e a ligacao precisa de DATA e AUTOR: saber quem ensinou e quando e o
--     que permite desfazer uma licao errada sem apagar o resto.
-- ===========================================================================

create table if not exists apelidos_banco (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,

  -- O NOME COMO O BANCO ESCREVE, normalizado: maiusculo, sem acento, sem
  -- espaco dobrado. Guardar o cru nao serviria para comparar, e guardar so o
  -- normalizado perderia a forma original — por isso os dois.
  nome_banco    text not null,
  nome_cru      text,

  familia_id    uuid references familias(id) on delete cascade,
  cliente_id    uuid references clientes(id) on delete set null,

  -- QUANTAS VEZES ESTA LICAO JA ACERTOU. Nao e estatistica: e o que permite
  -- a tela ordenar o que ja se provou na frente do que foi dito uma vez.
  acertos       integer not null default 1,

  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  ultima_vez    timestamptz not null default now(),

  -- UMA LICAO POR NOME, POR ORGANIZACAO. Duas linhas para "SANDRA REGINA M DE
  -- LI" apontando para familias diferentes nao e aprendizado, e duvida — e
  -- duvida tem de aparecer na fila, nao virar sorteio na hora de conciliar.
  constraint apelidos_banco_unico unique (org_id, nome_banco),

  -- Apontar para NADA seria uma licao que nao ensina.
  constraint apelidos_banco_tem_alvo check (familia_id is not null or cliente_id is not null)
);

create index if not exists idx_apelidos_banco_org_nome on apelidos_banco (org_id, nome_banco);
create index if not exists idx_apelidos_banco_familia  on apelidos_banco (org_id, familia_id);

comment on table apelidos_banco is
  'Nome que o banco imprime -> familia/cliente. Aprendido na conciliacao do '
  'extrato: 127 dos 196 nomes de outubro/2026 nao casavam com o cadastro.';


-- ---------------------------------------------------------------------------
-- A FORMA NORMALIZADA TEM UM SO DONO, E ELE ESTA NO TYPESCRIPT.
--
-- `normalizarNomeBanco()` (src/lib/triangulacao.ts) e quem decide o que e
-- "mesmo nome": maiusculo, sem acento, sem espaco dobrado. Escrever a mesma
-- regra tambem aqui em SQL criaria DUAS implementacoes de uma regra — o
-- defeito de forma que ja nos custou nove migrations (0092, 0105, 0106, 0115,
-- 0137, 0140, 0141, 0142, 0148). Entao o banco NAO normaliza: ele recebe o
-- nome ja normalizado e so CONFERE A FORMA.
--
-- O check abaixo nao refaz a regra; ele afirma o resultado dela. Um nome que
-- chegar minusculo ou com espaco dobrado e recusado em vez de criar uma
-- segunda licao para a mesma pessoa.
-- ---------------------------------------------------------------------------
alter table apelidos_banco drop constraint if exists apelidos_banco_forma;
alter table apelidos_banco add constraint apelidos_banco_forma check (
  nome_banco = upper(nome_banco)
  and nome_banco = btrim(nome_banco)
  and nome_banco !~ '\s\s'
  and length(nome_banco) >= 3
);

-- ---------------------------------------------------------------------------
-- RLS: uma policy por comando, RESTRICTIVE, como o resto da casa.
-- `delete` nunca consulta `with check` (licao da 0079).
-- ---------------------------------------------------------------------------
alter table apelidos_banco enable row level security;

drop policy if exists apelidos_banco_sel on apelidos_banco;
drop policy if exists apelidos_banco_ins on apelidos_banco;
drop policy if exists apelidos_banco_upd on apelidos_banco;
drop policy if exists apelidos_banco_del on apelidos_banco;
drop policy if exists apelidos_banco_tudo on apelidos_banco;

create policy apelidos_banco_sel on apelidos_banco as restrictive
  for select using (org_id = current_org_id());
create policy apelidos_banco_ins on apelidos_banco as restrictive
  for insert with check (org_id = current_org_id());
create policy apelidos_banco_upd on apelidos_banco as restrictive
  for update using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy apelidos_banco_del on apelidos_banco as restrictive
  for delete using (org_id = current_org_id());

create policy apelidos_banco_tudo on apelidos_banco
  for all using (true) with check (true);

-- ===========================================================================
-- APRENDER
--
-- Chamada quando uma PESSOA confirma de quem e o dinheiro. Nao e chamada pelo
-- palpite: palpite nao ensina nada, senao o sistema aprenderia os proprios
-- chutes e a terceira fonte (o nome) viraria lei.
--
-- Tres casos, e o terceiro e o que importa:
--   . nome novo              -> grava a licao com 1 acerto
--   . nome ja ligado AO MESMO -> soma um acerto (foi confirmado de novo)
--   . nome ja ligado A OUTRO  -> SUBSTITUI e volta a contagem para 1
--
-- O terceiro caso e uma correcao: alguem disse antes que "SANDRA REGINA M DE
-- LI" era dos Tonelloti e agora diz que e dos Mendes. A ultima palavra e de
-- quem esta olhando agora, e a contagem reinicia porque a licao e outra —
-- herdar os acertos da licao errada faria o erro parecer provado.
-- ===========================================================================
create or replace function sureya_aprender_apelido_banco(
  p_nome    text,              -- JA normalizado pelo TypeScript
  p_nome_cru text,
  p_familia uuid default null,
  p_cliente uuid default null,
  p_org     uuid default null
)
returns table (id uuid, acertos integer, corrigiu boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_fam  uuid;
  v_old  record;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  -- p_org explicito: `current_org_id()` e nulo fora de sessao (licao da 0103).
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_org' using hint = 'Sem sessao do painel: passe p_org.';
  end if;

  if p_familia is null and p_cliente is null then
    raise exception 'sem_alvo' using hint = 'Uma licao precisa dizer de QUEM e o nome.';
  end if;

  -- A FAMILIA SAI DO CLIENTE quando nao vem dita. Guardar a familia e o que
  -- faz a licao continuar valendo se a pessoa do cadastro mudar de lugar.
  v_fam := p_familia;
  if v_fam is null and p_cliente is not null then
    select c.familia_id into v_fam from clientes c
     where c.id = p_cliente and c.org_id = v_org;
  end if;

  -- O ALVO TEM DE SER DESTA ORG. Sem isto, um id de outra organizacao entraria
  -- pela funcao SECURITY DEFINER, que ignora RLS (licao da 0129).
  if v_fam is not null and not exists (
    select 1 from familias f where f.id = v_fam and f.org_id = v_org
  ) then
    raise exception 'familia_de_outra_org';
  end if;
  if p_cliente is not null and not exists (
    select 1 from clientes c where c.id = p_cliente and c.org_id = v_org
  ) then
    raise exception 'cliente_de_outra_org';
  end if;

  select * into v_old from apelidos_banco a
   where a.org_id = v_org and a.nome_banco = p_nome;

  if v_old.id is null then
    insert into apelidos_banco (org_id, nome_banco, nome_cru, familia_id, cliente_id,
                                acertos, criado_por)
    values (v_org, p_nome, p_nome_cru, v_fam, p_cliente, 1, auth.uid())
    returning apelidos_banco.id, apelidos_banco.acertos, false
      into id, acertos, corrigiu;
    return next;
    return;
  end if;

  if v_old.familia_id is not distinct from v_fam
     and v_old.cliente_id is not distinct from p_cliente then
    update apelidos_banco a
       set acertos = a.acertos + 1, ultima_vez = clock_timestamp()
     where a.id = v_old.id
    returning a.id, a.acertos, false into id, acertos, corrigiu;
  else
    update apelidos_banco a
       set familia_id = v_fam, cliente_id = p_cliente, nome_cru = p_nome_cru,
           acertos = 1, ultima_vez = clock_timestamp(), criado_por = auth.uid()
     where a.id = v_old.id
    returning a.id, a.acertos, true into id, acertos, corrigiu;
  end if;
  return next;
end $$;

comment on function sureya_aprender_apelido_banco(text, text, uuid, uuid, uuid) is
  'Guarda de quem e um nome do extrato, dito por uma pessoa (0163). Nome ja normalizado pelo TS.';

-- ===========================================================================
-- ESQUECER — desfazer uma licao errada sem apagar as outras.
-- ===========================================================================
create or replace function sureya_esquecer_apelido_banco(
  p_nome text,
  p_org  uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then raise exception 'sem_org'; end if;

  delete from apelidos_banco a where a.org_id = v_org and a.nome_banco = p_nome;
  return found;
end $$;

comment on function sureya_esquecer_apelido_banco(text, uuid) is
  'Apaga a licao de um nome do extrato (0163).';

-- ---------------------------------------------------------------------------
-- A PORTA. SECURITY DEFINER ignora RLS; so o GRANT protege (licao da 0129).
-- ---------------------------------------------------------------------------
revoke execute on function sureya_aprender_apelido_banco(text, text, uuid, uuid, uuid) from public, anon;
grant  execute on function sureya_aprender_apelido_banco(text, text, uuid, uuid, uuid) to authenticated, service_role;
revoke execute on function sureya_esquecer_apelido_banco(text, uuid) from public, anon;
grant  execute on function sureya_esquecer_apelido_banco(text, uuid) to authenticated, service_role;

select count(*)::text || ' licoes de nome do banco' from apelidos_banco;
