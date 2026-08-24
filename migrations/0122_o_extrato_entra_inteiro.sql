-- 0122 — O EXTRATO ENTRA INTEIRO, E O QUE É PESSOAL FICA DE FORA
--
-- O PEDIDO
--   "cria um importador de ofx xls PDF para o extrato, tem saída que eh
--    pessoal aí"
--
-- O QUE FOI MEDIDO ANTES
--
--   entradas_banco ........ 0 linhas
--   a tabela existe desde a 0045. A API existe. A tela `Entradas.tsx` existe.
--   O palpiteiro existe. O teste "identificar entrada credita a familia" passa.
--   Nada nunca entrou, porque nao havia por onde: so uma a uma, na mao.
--
--   extrato de agosto/2026 ... 151 movimentos
--                              115 creditos   R$ 9.802,51
--                               36 debitos    R$ 9.263,69
--                              112 Pix recebidos
--
--   Ninguem digita 112 linhas todo mes. Era esse o motivo do zero.
--
-- DUAS COISAS NOVAS, E UMA CONSERTADA
--
--   1. A TABELA PASSA A GUARDAR OS DOIS LADOS. Ela se chama `entradas_banco`
--      e so pensava em entrada. Mas o extrato traz saida, e parte da saida e
--      PESSOAL — a conta e da Sureya, nao da empresa. Sem separar, o resultado
--      do mes some dentro do supermercado dela.
--
--      `natureza` nasce NULA de proposito. Nulo e "ninguem classificou ainda",
--      que e diferente de "e do negocio" e diferente de "e pessoal". Chutar
--      aqui seria inventar despesa — e "vazio nao e zero" ja custou caro neste
--      projeto (0120).
--
--   2. IMPORTAR DUAS VEZES NAO PODE DOBRAR NADA. `chave` e gerada da propria
--      linha; o indice unico e quem garante. Reimportar o mesmo arquivo entra
--      como zero novas, e nao como 151 duplicatas.
--
--   3. O PALPITEIRO OLHAVA UM RAZAO CONGELADO. `sureya_palpites_entrada`
--      calculava o saldo de cada familia a partir de `movimentos` — aposentado
--      na 0073, com DUAS linhas em producao contra 63 em `conta_corrente`.
--      Resultado: todo mundo aparecia com saldo zero e os dois bracos por
--      valor ("deve exatamente este valor", "deve um valor proximo") NUNCA
--      disparavam. Sobrava um LIKE no PRIMEIRO nome do remetente — que para
--      "MARIO KANASHIRO" procura "MARIO" e devolve tres familias.
--
--      E o mesmo defeito das Campanhas: olhar uma tabela que esvaziou.
--
-- O QUE ESTA MIGRACAO NAO FAZ
--   Nao manda mensagem, nao cobra ninguem, nao lanca dinheiro sozinha.
--   Importar e SO COLOCAR O EXTRATO NA MESA. Quem diz de quem e cada Pix
--   continua sendo uma pessoa, na tela de Entradas.

-- ============================================================================
-- 1. OS DOIS LADOS DO EXTRATO
-- ============================================================================

alter table entradas_banco
  add column if not exists tipo          text not null default 'credito',
  add column if not exists natureza      text,
  add column if not exists historico     text,
  add column if not exists saldo_apos    numeric(12,2),
  add column if not exists importacao_id uuid;

alter table entradas_banco drop constraint if exists entradas_banco_tipo_ck;
alter table entradas_banco add constraint entradas_banco_tipo_ck
  check (tipo in ('credito','debito'));

alter table entradas_banco drop constraint if exists entradas_banco_natureza_ck;
alter table entradas_banco add constraint entradas_banco_natureza_ck
  check (natureza is null or natureza in ('negocio','pessoal'));

-- SAIDA NAO TEM DONO NO CADASTRO DE FAMILIAS. Identificar um debito como
-- sendo "da familia Fulano" nao quer dizer nada — e a porta por onde um
-- pagamento de fornecedor viraria credito de familia.
alter table entradas_banco drop constraint if exists entradas_banco_debito_sem_familia_ck;
alter table entradas_banco add constraint entradas_banco_debito_sem_familia_ck
  check (tipo = 'credito' or cliente_id is null);

comment on column entradas_banco.natureza is
  'negocio | pessoal | NULL. Nulo e "ainda nao classificado", que nao e zero e '
  'nao e negocio: enquanto for nulo, a linha nao entra em resultado nenhum.';

-- ============================================================================
-- 2. IMPORTAR DUAS VEZES NAO DOBRA
-- ============================================================================
--
-- A chave sai da propria linha. A ordem do coalesce importa:
--   documento  — o numero do banco. Unico por movimento quando existe.
--   saldo_apos — quando nao ha documento, o saldo desempata: dois movimentos
--                nao deixam a conta no mesmo lugar, a nao ser que sejam o
--                mesmo movimento.
--   historico  — ultimo recurso. Aqui DOIS Pix iguais, no mesmo dia, do mesmo
--                valor, sem documento e sem saldo virariam um so. E o preco de
--                nao ter chave, e o arquivo que faz isso e raro (o OFX sempre
--                traz FITID; o extrato do banco sempre traz saldo).
--
-- POR QUE GATILHO E NAO COLUNA GERADA: `data::text` depende do DateStyle da
-- sessao, entao o Postgres recusa a expressao como nao-imutavel. Dava para
-- contornar com aritmetica, mas o gatilho tem uma vantagem que a coluna gerada
-- nao tem aqui: vale para TODO caminho de escrita — a importacao, a rota que
-- ja existia (`POST /api/financeiro/entradas`) e qualquer INSERT futuro. Uma
-- entrada digitada a mao passa a disputar a mesma chave que a importada, que e
-- justamente o caso em que a duplicata apareceria.
alter table entradas_banco drop column if exists chave;
alter table entradas_banco add column if not exists chave text;

create or replace function sureya_chave_entrada_banco() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.chave :=
    to_char(new.data, 'YYYY-MM-DD') || '|' || new.tipo || '|'
    || trim(to_char(new.valor, 'FM9999999990.00')) || '|'
    || coalesce(
         nullif(new.documento, ''),
         case when new.saldo_apos is null then null
              else trim(to_char(new.saldo_apos, 'FM9999999990.00')) end,
         left(coalesce(new.historico, ''), 60),
         '');
  return new;
end;
$$;

drop trigger if exists tg_chave_entrada_banco on entradas_banco;
create trigger tg_chave_entrada_banco
  before insert or update of data, tipo, valor, documento, saldo_apos, historico
  on entradas_banco
  for each row execute function sureya_chave_entrada_banco();

-- As linhas que ja existiam (nenhuma em producao hoje, mas o teste cria) ganham
-- a chave sem precisar de um UPDATE que mexa em valor.
update entradas_banco set chave = null where chave is null;

create unique index if not exists idx_entrada_banco_unica
  on entradas_banco (org_id, chave);

create index if not exists idx_entrada_banco_por_data
  on entradas_banco (org_id, data desc, tipo);

create index if not exists idx_entrada_banco_a_classificar
  on entradas_banco (org_id, data desc)
  where tipo = 'debito' and natureza is null;

-- ============================================================================
-- 3. O REGISTRO DE CADA IMPORTACAO
-- ============================================================================

create table if not exists importacoes_extrato (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  arquivo      text,
  formato      text,
  de           date,
  ate          date,
  linhas       int  not null default 0,
  novas        int  not null default 0,
  repetidas    int  not null default 0,
  -- Passou na prova do saldo? NULO quer dizer "o arquivo nao trazia saldo por
  -- linha, entao nao houve prova" — e nao "estava tudo certo".
  confere      boolean,
  criado_por   uuid,
  created_at   timestamptz not null default now()
);

alter table importacoes_extrato enable row level security;

drop policy if exists importacoes_extrato_org on importacoes_extrato;
create policy importacoes_extrato_org on importacoes_extrato
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Uma restritiva POR COMANDO — a licao da 0079. DELETE nao consulta
-- `with check`; sem a politica de delete, quem nao e admin apagaria o
-- historico de importacao.
drop policy if exists importacoes_extrato_insert_admin on importacoes_extrato;
create policy importacoes_extrato_insert_admin on importacoes_extrato
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);

drop policy if exists importacoes_extrato_update_admin on importacoes_extrato;
create policy importacoes_extrato_update_admin on importacoes_extrato
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

drop policy if exists importacoes_extrato_delete_admin on importacoes_extrato;
create policy importacoes_extrato_delete_admin on importacoes_extrato
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

-- O campo NAO e para a Nina. Extrato bancario e dado do dono.
drop policy if exists importacoes_extrato_sem_campo on importacoes_extrato;
create policy importacoes_extrato_sem_campo on importacoes_extrato
  as restrictive for all using (not is_campo()) with check (not is_campo());

-- ============================================================================
-- 4. A PORTA DA IMPORTACAO
-- ============================================================================

create or replace function sureya_importar_extrato(
  p_linhas  jsonb,
  p_arquivo text default null,
  p_formato text default null,
  p_confere boolean default null,
  p_org     uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := coalesce(p_org, current_org_id());
  v_imp    uuid;
  v_novas  int := 0;
  v_todas  int := 0;
  v_de     date;
  v_ate    date;
begin
  if v_org is null then
    raise exception 'sureya_importar_extrato: sem org';
  end if;
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'sureya_importar_extrato: p_linhas precisa ser uma lista';
  end if;

  select count(*), min((x->>'data')::date), max((x->>'data')::date)
    into v_todas, v_de, v_ate
    from jsonb_array_elements(p_linhas) x;

  if v_todas = 0 then
    raise exception 'sureya_importar_extrato: nenhuma linha para importar';
  end if;

  insert into importacoes_extrato (org_id, arquivo, formato, de, ate, linhas, confere, criado_por)
  values (v_org, p_arquivo, p_formato, v_de, v_ate, v_todas, p_confere, auth.uid())
  returning id into v_imp;

  -- CONVERGENTE, nao apenas idempotente: reimportar o mesmo arquivo nao muda
  -- nada, e reimportar um arquivo MAIOR (o mes inteiro depois de ter importado
  -- a primeira semana) acrescenta so o que falta.
  with novas as (
    insert into entradas_banco
      (org_id, data, tipo, valor, historico, remetente, documento, saldo_apos,
       natureza, importacao_id)
    select v_org,
           (x->>'data')::date,
           x->>'tipo',
           round((x->>'valor')::numeric, 2),
           nullif(x->>'historico',''),
           nullif(x->>'remetente',''),
           nullif(x->>'documento',''),
           case when x->>'saldoApos' is null then null
                else round((x->>'saldoApos')::numeric, 2) end,
           -- A NATUREZA VIAJA COM A LINHA. Ela e marcada na PREVIA, antes de
           -- gravar — e se nao viesse junto, a marcacao se perderia entre a
           -- tela e o banco, porque a importacao devolve contagem e nao os ids
           -- do que entrou. Qualquer coisa fora de negocio/pessoal vira nulo,
           -- que e o estado honesto de "ninguem classificou".
           case when x->>'natureza' in ('negocio','pessoal') then x->>'natureza' end,
           v_imp
      from jsonb_array_elements(p_linhas) x
     where x->>'tipo' in ('credito','debito')
       and (x->>'valor')::numeric > 0
    on conflict (org_id, chave) do nothing
    returning 1
  )
  select count(*) into v_novas from novas;

  update importacoes_extrato
     set novas = v_novas, repetidas = v_todas - v_novas
   where id = v_imp;

  return jsonb_build_object(
    'importacao_id', v_imp,
    'linhas',        v_todas,
    'novas',         v_novas,
    'repetidas',     v_todas - v_novas,
    'de',            v_de,
    'ate',           v_ate
  );
end;
$$;

revoke all on function sureya_importar_extrato(jsonb, text, text, boolean, uuid) from public;
grant execute on function sureya_importar_extrato(jsonb, text, text, boolean, uuid)
  to authenticated, service_role;

-- ============================================================================
-- 5. O QUE E PESSOAL SAI DA CONTA DO NEGOCIO
-- ============================================================================

create or replace function sureya_classificar_saidas(
  p_ids      uuid[],
  p_natureza text,
  p_org      uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_org, current_org_id());
  v_n   int;
begin
  if v_org is null then
    raise exception 'sureya_classificar_saidas: sem org';
  end if;
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  -- `null` e um destino legitimo: desfazer uma classificacao errada tem de ser
  -- possivel sem apagar a linha do extrato.
  if p_natureza is not null and p_natureza not in ('negocio','pessoal') then
    raise exception 'sureya_classificar_saidas: natureza invalida (%)', p_natureza;
  end if;

  update entradas_banco
     set natureza = p_natureza
   where org_id = v_org
     and id = any(p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function sureya_classificar_saidas(uuid[], text, uuid) from public;
grant execute on function sureya_classificar_saidas(uuid[], text, uuid) to authenticated, service_role;

-- ============================================================================
-- 6. O PALPITEIRO PARA DE OLHAR O RAZAO CONGELADO
-- ============================================================================
--
-- O QUE MUDA
--   a) o saldo vem de `conta_corrente` (o razao vivo, 63 linhas) e nao de
--      `movimentos` (aposentado na 0073, 2 linhas). Com isso os bracos por
--      VALOR voltam a existir.
--   b) o saldo e da FAMILIA, nao do contato: uma casa com tres telefones tem
--      uma conta so, e era assim que a ficha ja mostrava.
--   c) casa por QUALQUER palavra do remetente com 4+ letras, nao so a
--      primeira. O que identifica e o sobrenome — "KANASHIRO", nao "MARIO".
--   d) o palpite diz por que palpitou, e a forca ordena.

-- `create or replace` com OUTRA quantidade de parametros nao substitui: cria uma
-- SEGUNDA funcao com o mesmo nome (a licao da 0109). Some com a antiga primeiro.
drop function if exists sureya_palpites_entrada(uuid);

create or replace function sureya_palpites_entrada(p_entrada uuid, p_org uuid default null)
returns table (cliente_id uuid, nome text, motivo text, forca integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_org, current_org_id());
  v_e   record;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'sureya_palpites_entrada: sem org';
  end if;

  select * into v_e from entradas_banco where id = p_entrada and org_id = v_org;
  if v_e is null then return; end if;
  if v_e.tipo = 'debito' then return; end if;

  return query
  with saldos as (
    select c.id, c.nome, c.familia_id,
           coalesce((select sum(case when cc.tipo = 'credito' then cc.valor else -cc.valor end)
                       from conta_corrente cc
                      where cc.org_id = v_org
                        and cc.familia_id = c.familia_id
                        and cc.status_conc = 'confirmado'), 0) as saldo
      from clientes c
     where c.org_id = v_org and c.anonimizado_em is null
  ),
  do_banco as (
    select p as palavra
      from regexp_split_to_table(upper(unaccent_simples(coalesce(v_e.remetente, ''))), '[^A-Z]+') p
     where length(p) >= 4
  ),
  do_cadastro as (
    select s.id, p as palavra
      from saldos s, regexp_split_to_table(upper(unaccent_simples(s.nome)), '[^A-Z]+') p
     where length(p) >= 4
  ),
  batidas as (
    -- PREFIXO NOS DOIS SENTIDOS, e nao igualdade.
    --
    -- O extrato corta o nome em 21 caracteres ("LUCIA NORIKO YAMASHIR") e o
    -- cadastro guarda apelido curto ("Mario Kana" para KANASHIRO). Exigir
    -- igualdade perde os dois lados do corte — e foi exatamente o que aconteceu
    -- quando eu cruzei o extrato de agosto a mao.
    select dc.id,
           count(distinct db.palavra) as quantas,
           string_agg(distinct db.palavra, ' e ' order by db.palavra) as quais
      from do_cadastro dc join do_banco db
        on dc.palavra = db.palavra
        or dc.palavra like db.palavra || '%'
        or db.palavra like dc.palavra || '%'
     group by dc.id
  )
  select s.id, s.nome,
    case
      when b.quantas >= 2 then 'o nome bate em ' || b.quais
      when b.quantas = 1  then 'o nome bate em ' || b.quais
      when abs(abs(s.saldo) - v_e.valor) < 0.01 and s.saldo < 0 then 'o saldo dela e exatamente este valor'
      else 'o saldo dela e proximo deste valor'
    end,
    case
      -- Duas palavras batendo (nome E sobrenome) e outra coisa: e o unico caso
      -- em que da para confiar sem uma pessoa olhar.
      when b.quantas >= 2 then 100
      when b.quantas = 1 and abs(abs(s.saldo) - v_e.valor) < 0.01 and s.saldo < 0 then 95
      when abs(abs(s.saldo) - v_e.valor) < 0.01 and s.saldo < 0 then 80
      when b.quantas = 1 then 60
      when s.saldo < 0 and abs(abs(s.saldo) - v_e.valor) <= 20 then 40
      else 0
    end
  from saldos s
  left join batidas b on b.id = s.id
  where b.id is not null
     or (s.saldo < 0 and abs(abs(s.saldo) - v_e.valor) <= 20)
  order by 4 desc, 2
  limit 8;
end;
$$;

revoke all on function sureya_palpites_entrada(uuid, uuid) from public;
grant execute on function sureya_palpites_entrada(uuid, uuid) to authenticated, service_role;
