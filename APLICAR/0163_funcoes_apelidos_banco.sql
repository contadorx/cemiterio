-- ===========================================================================
-- APLICAR EM PRODUCAO — 0163, parte 2: as funcoes
--
-- A TABELA `apelidos_banco` E A RLS DELA JA ESTAO APLICADAS. Falta so isto.
-- Cole no editor SQL do Supabase e rode. Nao toca em dado nenhum: cria duas
-- funcoes e fecha a porta delas para o anonimo.
-- ===========================================================================

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

-- prova: as duas funcoes existem e o anonimo nao executa nenhuma
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_executa
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'sureya_%apelido_banco'
 order by 1;
