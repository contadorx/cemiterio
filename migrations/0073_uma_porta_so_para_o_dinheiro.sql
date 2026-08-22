-- ============================================================================
-- SUREYA — 0073 · UMA PORTA SÓ PARA O DINHEIRO
--
-- As ESCRITAS passam para o razão da família. Depois desta migration, nenhuma
-- função do sistema escreve em `movimentos`.
--
-- O QUE ESTA MIGRATION FECHA
-- ---------------------------------------------------------------------------
-- A 0071 fez de `conta_corrente` a fonte da verdade e a 0072 tapou o buraco do
-- espelho. As LEITURAS já migraram (11 arquivos). Faltavam as escritas: treze
-- funções mexendo no razão antigo — oito inserindo, duas apagando, duas
-- atualizando, uma lendo para montar o funil.
--
-- POR QUE AGORA, E NÃO DEPOIS DO PILOTO
-- ---------------------------------------------------------------------------
-- Cinco tabelas apontam para `movimentos` por chave estrangeira:
--
--     entradas_banco.movimento_id     lancamentos.movimento_id
--     pedidos_extras.movimento_id     quitacoes.credito_id / debito_id
--     movimentos.estorna_movimento
--
-- Congelar `movimentos` sem repontar essas chaves quebraria conciliação
-- bancária, pedidos extras e quitação — não é opcional, é pré-requisito.
--
-- E o custo de repontar é medido: **todas estão vazias de vínculo**.
--
--     entradas_banco    0 linhas        lancamentos      0 linhas
--     quitacoes         0 linhas        pedidos_extras   1 linha, sem movimento
--     estornos          0
--
-- Zero migração de dados. Daqui a seis meses, com o piloto rodando, cada uma
-- dessas chaves é uma conversa. É a mesma janela que a 0070 descreveu para os
-- lançamentos, e ela ainda está aberta.
--
-- ============================================================================
-- TRÊS COISAS QUE SÓ APARECERAM AO ESCREVER ISTO
-- ============================================================================
--
-- 1) `sureya_saldo_abertura` GRAVA A ORIGEM ERRADA
--
--    Existem duas portas para saldo de abertura, e elas discordam:
--
--      /api/conta-corrente (ação abertura) → origem 'abertura'
--      sureya_saldo_abertura               → origem 'ajuste'
--
--    A 0071 espelha 'ajuste' como 'ajuste'. E `ehDoPeriodo()` — a regra que
--    impede saldo de abertura de virar "trabalho do mês" — só exclui
--    'abertura'. Ou seja: abertura criada pela porta da ficha É CONTADA como
--    movimento do mês, e some no relatório junto com as limpezas de verdade.
--
--    Em produção isso ainda não deu prejuízo porque a linha de 240,00 veio da
--    outra porta. Bastaria alguém usar a ficha uma vez.
--
--    Aqui as duas portas passam a gravar `abertura`.
--
-- 2) A ABERTURA ERA "IDEMPOTENTE" POR PESSOA, NUM RAZÃO DE FAMÍLIA
--
--    O comentário da função dizia "limpa a abertura anterior desta familia",
--    mas o filtro era `cliente_id = p_cliente` — a PESSOA. Com o razão no grão
--    da família, pai e filha podiam ter, cada um, o seu saldo de abertura, e os
--    dois somavam. Agora a limpeza é por família, como o comentário sempre
--    prometeu.
--
-- 3) `conta_corrente` NÃO GUARDAVA QUEM
--
--    A dívida é da família (D-01), mas continua interessando saber qual pessoa
--    pagou. `movimentos.cliente_id` guardava isso; `conta_corrente` não tinha
--    onde. Aqui ela ganha `cliente_id` — como AUTORIA, não como grão: o saldo
--    continua sendo somado por `familia_id`.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) O razão da família recebe o que só o antigo tinha
--
-- Tudo aditivo e nulável: nenhuma linha existente muda.
-- ----------------------------------------------------------------------------
alter table conta_corrente
  add column if not exists cliente_id        uuid references clientes(id) on delete set null,
  add column if not exists sem_comprovante   boolean not null default false,
  add column if not exists estorna_lancamento uuid  references conta_corrente(id) on delete set null,
  add column if not exists conferido_em      timestamptz,
  add column if not exists conferido_por     uuid,
  add column if not exists nota_conferencia  text;

comment on column conta_corrente.cliente_id is
  'AUTORIA, nao grao. Quem da familia originou o lancamento (quem pagou, de '
  'quem e o servico). O saldo continua sendo somado por familia_id — ver '
  'DECISOES.md D-01.';
comment on column conta_corrente.estorna_lancamento is
  'Aponta para o lancamento que esta linha corrige. Estorno nao apaga: lanca '
  'o contrario, e o historico continua legivel.';

create index if not exists idx_conta_corrente_cliente on conta_corrente (cliente_id);
create index if not exists idx_conta_corrente_servico on conta_corrente (servico_id);


-- ----------------------------------------------------------------------------
-- 2) As chaves passam a apontar para o razão da família
--
-- O nome muda junto. `movimento_id` apontando para `conta_corrente` seria uma
-- mentira gravada no esquema — e é o tipo de mentira que gera o próximo bug.
-- ----------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 1b) CINCO COLUNAS À DERIVA, ACHADAS AO EXERCITAR AS FUNÇÕES
--
-- As funções deste arquivo escrevem em colunas que existem em produção e em
-- migration nenhuma. Só apareceram porque as portas passaram a ser chamadas de
-- verdade no `migrar-limpo` — o placar não pegaria: ele conta tabelas, funções,
-- gatilhos e policies, **não colunas**.
--
--     entradas_banco   documento, banco, identificada_por
--     lancamentos      cliente_id, movimento_id
--
-- `identificada_por` é a mais séria: `sureya_identificar_entrada` grava nela.
-- Num ambiente reconstruído do repositório, identificar uma entrada bancária
-- falhava inteira com `column does not exist`.
-- ----------------------------------------------------------------------------
alter table entradas_banco
  add column if not exists documento        text,
  add column if not exists banco            text,
  add column if not exists identificada_por uuid;

alter table lancamentos
  add column if not exists cliente_id   uuid references clientes(id) on delete set null,
  add column if not exists movimento_id uuid;


-- MAIS UMA COLUNA A DERIVA, ACHADA AO ESCREVER ISTO
--
-- `lancamentos.movimento_id` existe em producao e em migration nenhuma — a
-- tabela que a 0045 cria nao tem essa coluna. E a 34a coluna encontrada assim,
-- e o placar do `migrar-limpo` nao pegaria: ele conta tabelas, funcoes,
-- gatilhos e policies, nao colunas.
--
-- Por isso o bloco abaixo trata os dois estados: renomeia onde a coluna existe
-- (producao) e cria onde nao existe (repositorio reconstruido). O resultado e o
-- mesmo dos dois lados, que e o que o `migrar-limpo` cobra.
do $$
declare t text;
begin
  foreach t in array array['entradas_banco','pedidos_extras','lancamentos'] loop
    execute format('alter table %I drop constraint if exists %I', t, t||'_movimento_id_fkey');
    execute format('alter table %I drop constraint if exists %I', t, t||'_lancamento_id_fkey');

    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name=t and column_name='movimento_id') then
      execute format('alter table %I rename column movimento_id to lancamento_id', t);
    elsif not exists (select 1 from information_schema.columns
                where table_schema='public' and table_name=t and column_name='lancamento_id') then
      execute format('alter table %I add column lancamento_id uuid', t);
    end if;

    execute format(
      'alter table %I add constraint %I foreign key (lancamento_id) '
      'references conta_corrente(id) on delete set null', t, t||'_lancamento_id_fkey');
  end loop;
end $$;

alter table quitacoes drop constraint if exists quitacoes_credito_id_fkey;
alter table quitacoes drop constraint if exists quitacoes_debito_id_fkey;
alter table quitacoes
  add constraint quitacoes_credito_id_fkey
  foreign key (credito_id) references conta_corrente(id) on delete cascade,
  add constraint quitacoes_debito_id_fkey
  foreign key (debito_id)  references conta_corrente(id) on delete cascade;


-- ----------------------------------------------------------------------------
-- 3) A PORTA ÚNICA
--
-- Treze funções lançavam dinheiro, cada uma montando o seu `insert` à mão. Foi
-- assim que `saldo_abertura` acabou gravando uma origem diferente da outra
-- porta que faz a mesma coisa — ninguém compara treze inserts.
--
-- Agora existe uma porta. Quem lança diz o QUE está lançando; a porta resolve a
-- família, valida e grava. Regra nova entra aqui e vale para as treze.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_lancar(
  p_cliente         uuid,
  p_tipo            text,
  p_valor           numeric,
  p_origem          text,
  p_descricao       text,
  p_data            date    default null,
  p_status          text    default 'confirmado',
  p_servico         uuid    default null,
  p_comprovante     uuid    default null,
  p_tumulo          uuid    default null,
  p_competencia     date    default null,
  p_sem_comprovante boolean default false,
  p_estorna         uuid    default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org     uuid := current_org_id();
  v_familia uuid;
  v_id      uuid;
begin
  if v_org is null then raise exception 'sem_org'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'valor_invalido'; end if;

  select c.familia_id into v_familia
    from clientes c where c.id = p_cliente and c.org_id = v_org;

  if not found then
    raise exception 'cliente_nao_encontrado';
  end if;

  -- SEM FAMILIA NAO HA ONDE LANCAR.
  -- O gatilho `sureya_familia_para_cliente` cria uma no cadastro e hoje sao
  -- zero casos. Se aparecer, e cadastro quebrado — e inventar uma familia aqui,
  -- em silencio, dentro de uma transacao de dinheiro, e pior que parar.
  if v_familia is null then
    raise exception 'cliente_sem_familia';
  end if;

  insert into conta_corrente (
    org_id, familia_id, cliente_id, tipo, origem, valor, descricao, data,
    status_conc, servico_id, comprovante_id, tumulo_id, competencia,
    sem_comprovante, estorna_lancamento
  ) values (
    v_org, v_familia, p_cliente,
    p_tipo::sureya_tipo_lancamento,
    p_origem::sureya_origem_lancamento,
    p_valor,
    p_descricao,
    coalesce(p_data, current_date),
    p_status::sureya_status_conc,
    p_servico, p_comprovante, p_tumulo, p_competencia,
    coalesce(p_sem_comprovante, false), p_estorna
  )
  returning id into v_id;

  return v_id;
end
$function$;

comment on function public.sureya_lancar is
  'A porta unica do razao da familia. Resolve a familia da pessoa, valida e '
  'grava. Toda funcao que lanca dinheiro passa por aqui — regra nova entra '
  'neste ponto e vale para todas.';

revoke execute on function public.sureya_lancar(uuid,text,numeric,text,text,date,text,uuid,uuid,uuid,date,boolean,uuid)
  from public, anon, authenticated;

commit;


-- ============================================================================
-- 4) AS FUNÇÕES, UMA A UMA
--
-- A assinatura de cada uma NÃO muda — nenhuma rota precisa ser reescrita, e
-- ninguém corre o risco de `function is not unique` (o que já aconteceu com
-- `sureya_fechar_dia`, que existia em duas versões e obrigou a rota do campo a
-- carregar um fallback que nunca pôde funcionar).
--
-- O que muda é para ONDE cada uma escreve, e a `origem` passa a ser dita no
-- vocabulário do razão da família em vez de traduzida por gatilho.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- pagamentos
-- OS `DEFAULT` SAO PARTE DA ASSINATURA E TEM DE SER REPETIDOS IDENTICOS.
-- Omitir um deles faz o Postgres recusar com `cannot remove parameter defaults
-- from existing function` — e se a assinatura mudasse de verdade, nasceria uma
-- SEGUNDA versao da funcao, que e como `sureya_fechar_dia` acabou existindo em
-- duplicata e obrigando a rota do campo a carregar um fallback inutil.
create or replace function public.sureya_pagamento_avulso(
  p_cliente uuid, p_valor numeric, p_data date default current_date,
  p_descricao text default null, p_sem_comprovante boolean default false
) returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_id := sureya_lancar(
    p_cliente, 'credito', p_valor, 'pagamento',
    coalesce(p_descricao, case when p_sem_comprovante
      then 'Pagamento informado (sem comprovante)' else 'Pagamento registrado' end),
    p_data, 'confirmado', null, null, null, null, p_sem_comprovante);

  -- pagou: a cobrança automática para
  update clientes set cobranca_nivel = 0, cobranca_em = null where id = p_cliente;
  return v_id;
end
$function$;

create or replace function public.sureya_registrar_pagamento_manual(
  p_cliente uuid, p_valor numeric, p_data date, p_descricao text default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  return sureya_lancar(p_cliente, 'credito', p_valor, 'pagamento',
                       coalesce(p_descricao, 'Pagamento conferido no extrato'), p_data);
end
$function$;

-- ---------------------------------------------------------------- abertura
-- Duas correções aqui, explicadas no cabeçalho: a origem passa a ser
-- `abertura` (era `ajuste`, que os relatórios por período contavam como
-- trabalho do mês), e a limpeza da abertura anterior passa a ser por FAMÍLIA,
-- como o comentário da função sempre prometeu.
create or replace function public.sureya_saldo_abertura(
  p_cliente uuid, p_valor numeric, p_data date default current_date,
  p_nota text default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_org     uuid := current_org_id();
  v_familia uuid;
  v_desc    text;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if v_org is null then raise exception 'sem_org'; end if;

  select c.familia_id into v_familia
    from clientes c where c.id = p_cliente and c.org_id = v_org;
  if not found then raise exception 'cliente_nao_encontrado'; end if;
  if v_familia is null then raise exception 'cliente_sem_familia'; end if;

  -- POR FAMILIA, nao por pessoa: senao pai e filha teriam, cada um, o seu
  -- saldo de abertura, e os dois somariam no razao da familia.
  delete from conta_corrente
   where org_id = v_org
     and familia_id = v_familia
     and origem = 'abertura'::sureya_origem_lancamento;

  -- zero = so apagar a abertura antiga e sair
  if p_valor is null or abs(p_valor) < 0.005 then
    return null;
  end if;

  v_desc := 'Saldo de abertura (migração)'
            || coalesce(' — ' || nullif(btrim(p_nota), ''), '');

  return sureya_lancar(
    p_cliente,
    case when p_valor >= 0 then 'credito' else 'debito' end,
    abs(p_valor), 'abertura', v_desc, coalesce(p_data, current_date));
end
$function$;

-- ---------------------------------------------------------------- extras
create or replace function public.sureya_entregar_extra(
  p_pedido uuid, p_foto text default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; v_ped record; v_lanc uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select * into v_ped from pedidos_extras where id = p_pedido and org_id = v_org;
  if v_ped is null then raise exception 'pedido_nao_encontrado'; end if;
  if v_ped.status = 'entregue' then return v_ped.lancamento_id; end if;

  v_lanc := sureya_lancar(
    v_ped.cliente_id, 'debito', v_ped.total, 'avulso',
    v_ped.nome || (case when v_ped.quantidade > 1
                        then ' (' || trim(to_char(v_ped.quantidade,'FM999990.99')) || ')'
                        else '' end),
    current_date);

  update pedidos_extras set
    status = 'entregue', data_entrega = current_date,
    foto_url = coalesce(p_foto, foto_url), lancamento_id = v_lanc
  where id = p_pedido;

  return v_lanc;
end
$function$;

commit;


begin;

-- ---------------------------------------------------------------- funil
-- O que a família ainda deve, débito a débito, já descontado o que foi quitado.
-- Alimenta a tela de conciliação e o casamento automático de pagamento.
--
-- Passa a olhar o razão da família, e por isso passa a ser POR FAMÍLIA: recebe
-- a pessoa (que é o que a tela tem na mão) e responde pela família dela. Duas
-- pessoas da mesma família veem a mesma lista — que é o ponto de D-01.
--
-- A coluna devolvida deixa de se chamar `movimento_id`.
drop function if exists public.sureya_debitos_em_aberto(uuid);
create or replace function public.sureya_debitos_em_aberto(p_cliente uuid)
returns table(lancamento_id uuid, servico_id uuid, descricao text, data date,
              valor numeric, ja_quitado numeric, em_aberto numeric,
              jazigo text, data_lavagem date)
language sql
security definer
set search_path to 'public'
as $function$
  select l.id, l.servico_id, l.descricao, l.data, l.valor,
         coalesce((select sum(q.valor) from quitacoes q where q.debito_id = l.id), 0),
         l.valor - coalesce((select sum(q.valor) from quitacoes q where q.debito_id = l.id), 0),
         coalesce(t.identificacao, '—'),
         s.data_executada::date
    from conta_corrente l
    left join servicos s on s.id = l.servico_id
    left join tumulos  t on t.id = s.tumulo_id
   where l.org_id = current_org_id()
     and (auth.uid() is null or is_admin())      -- guarda (migration 0060)
     and l.familia_id = (select c.familia_id from clientes c where c.id = p_cliente)
     and l.tipo = 'debito'
     and l.status_conc = 'confirmado'
     -- Abertura NAO entra no funil de quitacao: ela e um saldo consolidado, nao
     -- um debito individual a ser casado com um pagamento.
     and l.origem <> 'abertura'::sureya_origem_lancamento
     and l.valor > coalesce((select sum(q.valor) from quitacoes q where q.debito_id = l.id), 0)
   order by l.data, l.created_at;
$function$;

-- ---------------------------------------------------------------- banco
create or replace function public.sureya_identificar_entrada(p_entrada uuid, p_cliente uuid)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; v_e record; v_lanc uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select * into v_e from entradas_banco where id = p_entrada and org_id = v_org;
  if v_e is null then raise exception 'entrada_nao_encontrada'; end if;
  if v_e.lancamento_id is not null then return v_e.lancamento_id; end if;

  v_lanc := sureya_lancar(p_cliente, 'credito', v_e.valor, 'pagamento',
              'Pix recebido' || coalesce(' de ' || v_e.remetente, ''), v_e.data);

  update entradas_banco set
    cliente_id = p_cliente, lancamento_id = v_lanc,
    identificada_em = clock_timestamp(), identificada_por = auth.uid()
  where id = p_entrada;

  update clientes set cobranca_nivel = 0, cobranca_em = null where id = p_cliente;
  return v_lanc;
end
$function$;

create or replace function public.sureya_desidentificar_entrada(p_entrada uuid)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; v_lanc uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  select lancamento_id into v_lanc from entradas_banco where id = p_entrada and org_id = v_org;
  if v_lanc is not null then
    -- quitacoes.credito_id e ON DELETE CASCADE desde esta migration, mas o
    -- delete explicito fica: quem le esta funcao tem de ver que a quitacao
    -- some junto, sem precisar ir conferir a definicao da chave.
    delete from quitacoes where credito_id = v_lanc;
    delete from conta_corrente where id = v_lanc and org_id = v_org;
  end if;
  update entradas_banco set cliente_id = null, lancamento_id = null,
         identificada_em = null, identificada_por = null
   where id = p_entrada and org_id = v_org;
  return found;
end
$function$;

drop function if exists public.sureya_entrada_identificada(numeric, date, uuid, text, text, text, uuid[]);
create or replace function public.sureya_entrada_identificada(
  p_valor numeric, p_data date, p_cliente uuid, p_remetente text default null,
  p_identificador text default null, p_observacao text default null,
  p_debitos uuid[] default null
) returns table(r_entrada uuid, r_lancamento uuid, r_quitados int, r_sobrou numeric)
-- OS NOMES DAS COLUNAS DE SAIDA SAO CONTRATO COM A ROTA.
-- `api/financeiro/entradas` le `r.r_entrada` e `r.r_movimento`. Trocar o prefixo
-- nao daria erro em lugar nenhum: os campos viriam `undefined` e a tela
-- mostraria uma entrada sem id, calada. So `r_movimento` muda de nome — porque
-- passou a carregar id de `conta_corrente` — e a rota foi ajustada no mesmo
-- commit.
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_org uuid; v_ent uuid; v_lanc uuid; v_resta numeric; v_n int := 0; d record;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  -- Mesma entrada bancária chegando duas vezes: devolve a de antes.
  if p_identificador is not null then
    select e.id, e.lancamento_id into v_ent, v_lanc
      from entradas_banco e
     where e.org_id = v_org and e.identificador = p_identificador;
    if v_ent is not null then
      return query select v_ent, v_lanc, 0, 0::numeric;
      return;
    end if;
  end if;

  insert into entradas_banco (org_id, valor, data, remetente, identificador, observacao,
                              cliente_id, identificada_em, identificada_por)
  values (v_org, p_valor, p_data, p_remetente, p_identificador, p_observacao,
          p_cliente, clock_timestamp(), auth.uid())
  returning id into v_ent;

  v_lanc := sureya_lancar(p_cliente, 'credito', p_valor, 'pagamento',
              coalesce(nullif(p_observacao,''),
                       'Pix recebido' || coalesce(' de ' || p_remetente, '')),
              p_data);

  update entradas_banco set lancamento_id = v_lanc where id = v_ent;
  update clientes set cobranca_nivel = 0, cobranca_em = null where id = p_cliente;

  v_resta := p_valor;
  for d in
    select * from sureya_debitos_em_aberto(p_cliente) x
    where p_debitos is null or x.lancamento_id = any(p_debitos)
    order by x.data
  loop
    exit when v_resta <= 0.004;
    insert into quitacoes (org_id, credito_id, debito_id, valor)
    values (v_org, v_lanc, d.lancamento_id, least(v_resta, d.em_aberto))
    on conflict do nothing;
    v_resta := v_resta - least(v_resta, d.em_aberto);
    v_n := v_n + 1;
  end loop;

  return query select v_ent, v_lanc, v_n, round(v_resta, 2);
end
$function$;

commit;


begin;

-- ---------------------------------------------------------------- conferência
create or replace function public.sureya_conciliar_comprovante(
  p_comprovante uuid, p_aprovar boolean
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_status sureya_status_conc;
  v_org    uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_status := case when p_aprovar then 'confirmado' else 'rejeitado' end;

  update comprovantes set status = v_status
   where id = p_comprovante and org_id = current_org_id()
  returning org_id into v_org;

  if v_org is null then
    raise exception 'comprovante % nao encontrado nesta org', p_comprovante;
  end if;

  -- O comprovante ainda pode ter nascido em `movimentos` (src/lib/conciliacao.ts
  -- escreve la ate a proxima leva). Atualizar os DOIS e o que mantem os razoes
  -- iguais enquanto a ultima escrita nao migra: no razao antigo o gatilho da
  -- 0071/0072 leva a mudanca adiante, e no novo ela chega direto.
  update movimentos set status_conc = v_status
   where comprovante_id = p_comprovante and org_id = current_org_id();

  update conta_corrente set status_conc = v_status
   where comprovante_id = p_comprovante and org_id = current_org_id()
     and movimento_id is null;   -- as espelhadas ja foram pelo gatilho
end
$function$;

create or replace function public.sureya_conferir_no_banco(
  p_movimento uuid, p_conferido boolean default true, p_nota text default null
) returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then return false; end if;

  -- O parametro continua se chamando `p_movimento` porque a rota
  -- (financeiro/conferir-banco) manda `movimentoId` e a assinatura nao pode
  -- mudar sem criar uma segunda versao da funcao. O que ele carrega agora e um
  -- id de `conta_corrente`.
  update conta_corrente set
    conferido_em     = case when p_conferido then clock_timestamp() else null end,
    conferido_por    = case when p_conferido then auth.uid() else null end,
    nota_conferencia = p_nota
  where id = p_movimento and org_id = v_org;

  return found;
end
$function$;

-- ---------------------------------------------------------------- estorno
-- Trocar o NOME de uma coluna de saida muda o tipo de retorno, e
-- `create or replace` recusa isso. Como a coluna passou a devolver id de
-- `conta_corrente`, manter o nome `movimento_estorno` seria mentir no contrato.
-- A rota (`api/servico/[id]/estornar`) foi ajustada no mesmo commit.
drop function if exists public.sureya_estornar_servico(uuid, text);
create or replace function public.sureya_estornar_servico(p_servico uuid, p_motivo text)
returns table(lancamento_estorno uuid, valor_estornado numeric)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_org uuid; v_s record;
  v_deb_id uuid; v_deb_cliente uuid; v_deb_valor numeric;
  v_novo uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'motivo_obrigatorio'; end if;

  select * into v_s from servicos where id = p_servico and org_id = v_org;
  if not found then raise exception 'servico_nao_encontrado'; end if;
  if v_s.estornado_em is not null then raise exception 'ja_estornado'; end if;

  update servicos set
    status = 'cancelado',
    estornado_em = clock_timestamp(),
    motivo_estorno = p_motivo
  where id = p_servico;

  select l.id, coalesce(l.cliente_id, v_s.cliente_id), l.valor
    into v_deb_id, v_deb_cliente, v_deb_valor
    from conta_corrente l
   where l.org_id = v_org and l.servico_id = p_servico and l.tipo = 'debito'
     and l.status_conc = 'confirmado'
     and l.estorna_lancamento is null
     and l.valor > 0
   order by l.created_at limit 1;

  if not found then
    return query select null::uuid, 0::numeric;
    return;
  end if;

  -- ESTORNO NAO APAGA. Lanca o contrario, apontando para o que corrige, e o
  -- historico continua legivel — quem olhar a ficha ve a cobranca e ve a
  -- correcao, em vez de ver um buraco.
  v_novo := sureya_lancar(v_deb_cliente, 'credito', v_deb_valor, 'ajuste',
              'Correção: ' || p_motivo, current_date, 'confirmado',
              p_servico, null, null, null, false, v_deb_id);

  return query select v_novo, v_deb_valor;
end
$function$;

-- ---------------------------------------------------------------- exclusão
create or replace function public.sureya_excluir_servico(p_servico uuid)
returns boolean
language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid; v_status text;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then return false; end if;

  select status::text into v_status from servicos where id = p_servico and org_id = v_org;
  if v_status is null then return false; end if;
  if v_status = 'executado' then
    raise exception 'servico_ja_executado';   -- executado vira histórico, não se apaga
  end if;

  delete from ocorrencias where servico_id = p_servico;
  delete from avaliacoes  where servico_id = p_servico;
  -- Nao deveria haver lancamento para servico nao executado, mas garante — e
  -- agora limpa os DOIS razoes: apagar so um deixaria divida fantasma do outro
  -- lado, que foi exatamente o buraco que a 0072 fechou.
  delete from conta_corrente where servico_id = p_servico and org_id = v_org;
  delete from movimentos      where servico_id = p_servico;
  delete from servicos        where id = p_servico and org_id = v_org;
  return true;
end
$function$;

-- ---------------------------------------------------------------- portas fechadas
-- Mesma regra da 0057: funcao de dinheiro nao fica aberta para o anon nem para
-- qualquer autenticado. `create or replace` preserva os grants anteriores, mas
-- as duas que trocaram de assinatura (`sureya_debitos_em_aberto`,
-- `sureya_estornar_servico`) nasceram de novo e precisam disto.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'sureya\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
  end loop;
end $$;

commit;


-- ============================================================================
-- CONFERÊNCIA DEPOIS DE RODAR
--
--   -- nenhuma funcao escreve mais em `movimentos` (esperado: so as de espelho)
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public'
--      and p.prosrc ~* '(insert into|update|delete from)\s+movimentos';
--
--   -- as chaves apontam para o razao da familia
--   select conrelid::regclass, confrelid::regclass from pg_constraint
--    where contype='f' and confrelid in ('movimentos'::regclass,'conta_corrente'::regclass)
--    order by 1;
--
-- ROLLBACK
--   As funcoes voltam com o corpo anterior (estao no git, migrations 0060/0062).
--   As colunas novas de `conta_corrente` sao aditivas e podem ficar. As chaves
--   precisam ser repontadas de volta para `movimentos` e as colunas renomeadas
--   de volta — por isso esta migration deve rodar num momento em que dá para
--   exercitar o financeiro logo em seguida.
-- ============================================================================


-- ============================================================================
-- 5) A LAVAGEM — A ÚLTIMA, E A QUE MAIS IMPORTA
--
-- `sureya_concluir_lavagem` é a função de dinheiro mais usada do sistema: toda
-- limpeza concluída passa por ela. Ela ainda inseria o débito em `movimentos`.
--
-- O QUE A MEDIÇÃO MOSTROU — E NÃO ERA O QUE O CÓDIGO DIZIA
-- ---------------------------------------------------------------------------
-- A 0066 desenhou dois lançamentos por lavagem, de propósito:
--
--     movimentos       débito de v_valor   "Limpeza executada"
--     conta_corrente   débito de ZERO      "Limpeza realizada"
--
-- e escreveu o porquê: *"valor zero, de propósito. Quem gera a dívida é a
-- competência. Se a lavagem também lançasse valor, a família seria cobrada
-- duas vezes pelo mesmo serviço."*
--
-- Só que a 0071 pôs um espelho entre as duas tabelas, e o índice único
-- `uq_conta_corrente_lavagem` só admite uma linha de origem `lavagem` por
-- serviço. A ordem dentro da função é: débito primeiro, extrato depois. Então:
--
--     passo 3  insere em movimentos  →  o espelho cria a linha de 55,00
--     passo 4  insere a linha de 0   →  `on conflict do nothing` DESCARTA
--
-- Reproduzido em banco limpo, depois de uma lavagem de R$ 55,00:
--
--     linhas  valor  descricao            veio_do_espelho
--          1  55.00  Limpeza executada    t
--
-- A linha de valor zero que a 0066 projetou nunca chega. O que fica é
-- exatamente o que o comentário dela dizia para evitar — decidido por um índice
-- único, em silêncio, sem ninguém escolher.
--
-- POR QUE ISSO NÃO CAUSOU PREJUÍZO AINDA — E POR QUE VAI CAUSAR
-- ---------------------------------------------------------------------------
-- Conferido em produção: **as 298 famílias estão em `modo_cobranca = consumo`**.
-- E em `consumo` a lavagem DEVE virar dívida. Ou seja, o acidente produziu o
-- número certo para a configuração de hoje, pelo motivo errado.
--
-- No dia em que alguém marcar uma família como `competencia`, a lavagem lança
-- 55,00 e o fechamento do mês lança de novo — a família paga duas vezes.
--
-- A CORREÇÃO
-- ---------------------------------------------------------------------------
-- O valor da lavagem passa a depender do modo de cobrança da família, que é o
-- que `familias.modo_cobranca` sempre significou:
--
--     consumo      → a lavagem lança v_valor  (comportamento de hoje, agora dito)
--     competencia  → a lavagem lança ZERO     (a intenção da 0066, agora alcançável)
--
-- Nada muda para nenhuma família existente. O que muda é que a regra passa a
-- estar escrita, em vez de emergir de uma colisão de índice.
-- ============================================================================

begin;

create or replace function public.sureya_concluir_lavagem(
  p_servico        uuid,
  p_foto_depois    text,
  p_foto_antes     text    default null,
  p_duracao_min    int     default null,
  p_texto_mensagem text    default null,
  p_destinatario   uuid    default null
)
returns table(
  ja_estava_executado boolean,
  valor               numeric,
  debito_criado       boolean,
  extrato_criado      boolean,
  fila_criada         boolean,
  remuneracao         numeric,
  custo_material      numeric,
  reparos             text[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org        uuid;
  v_uid        uuid := auth.uid();
  v_s          record;
  v_momento    text;
  v_valor      numeric := 0;
  v_familia    uuid;
  v_modo       text;
  v_codigo     text;
  v_ja         boolean := false;
  v_deb        boolean := false;
  v_ext        boolean := false;
  v_fila       boolean := false;
  v_remun      numeric;
  v_custo      numeric := 0;
  -- `text[] || 'literal'` e ambiguo: o Postgres tenta resolver como
  -- array||array e estoura "malformed array literal". Cada acrescimo
  -- abaixo leva `::text` explicito. Achado testando o clique duplo.
  v_reparos    text[]  := '{}';
  v_regra      record;
  v_avulso     boolean;
  v_dest       uuid;
  v_texto      text;
  m            record;
begin
  v_org := current_org_id();
  if v_org is null then
    raise exception 'sem_org' using errcode = '42501';
  end if;

  -- ------------------------------------------------------------------
  -- AUTORIZAÇÃO — o P0 nº 3
  --
  -- `for update` trava a linha até o fim da transação: dois toques
  -- simultâneos no mesmo serviço viram um depois do outro, não dois em
  -- paralelo. É o que impede a corrida antes mesmo do índice único agir.
  -- ------------------------------------------------------------------
  select * into v_s from servicos
   where id = p_servico and org_id = v_org
   for update;

  if not found then
    raise exception 'servico_nao_encontrado' using errcode = '42501';
  end if;

  -- Admin opera qualquer serviço da organização. Campo só o que está
  -- atribuído a ela — ou um ainda sem dono, que ela reserva ao concluir.
  if not is_admin() then
    if not is_campo() then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if v_s.executora_id is not null and v_s.executora_id <> v_uid then
      raise exception 'servico_de_outra_executora' using errcode = '42501';
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- COMO ESTA FAMÍLIA PAGA
  -- 'antes'       = pré-pago, não debita de novo
  -- 'contra_foto' = a entrega é que libera a cobrança
  -- ------------------------------------------------------------------
  select coalesce(p.momento_cobranca::text, 'depois') into v_momento
    from planos p where p.id = v_s.plano_id;
  v_momento := coalesce(v_momento, 'depois');

  select t.familia_id, t.codigo into v_familia, v_codigo
    from tumulos t where t.id = v_s.tumulo_id;

  -- COMO ESTA FAMILIA E COBRADA — e o que decide se a lavagem vira divida.
  select coalesce(f.modo_cobranca::text, 'consumo') into v_modo
    from familias f where f.id = v_familia;
  v_modo := coalesce(v_modo, 'consumo');

  -- ------------------------------------------------------------------
  -- 1. A TRANSIÇÃO
  -- ------------------------------------------------------------------
  if v_s.status::text = 'executado' then
    v_ja := true;
    v_reparos := v_reparos || 'servico ja estava executado: conferindo os efeitos'::text;
  else
    update servicos set
      status          = 'executado',
      data_executada  = now(),
      duracao_minutos = coalesce(p_duracao_min, duracao_minutos),
      foto_depois_url = coalesce(p_foto_depois, foto_depois_url),
      -- A foto do ANTES só é gravada quando vem uma nova: ela normalmente já
      -- subiu no "Começar". Escrever null aqui apagava o ponteiro no banco e
      -- o arquivo virava órfão no Storage.
      foto_antes_url  = coalesce(p_foto_antes, foto_antes_url),
      executora_id    = coalesce(executora_id, v_uid),
      cobranca_liberada_em = case when v_momento = 'contra_foto'
                                  then now() else cobranca_liberada_em end
    where id = p_servico;
  end if;

  -- ------------------------------------------------------------------
  -- 2. QUANTO ESTA LAVAGEM VALE
  -- Cascata: o que está no serviço → o plano → o jazigo → a referência da
  -- casa. `tumulos.valor_lavagem` entrou na cascata porque desde a migration
  -- 0049 é DE LÁ que a cobrança lê — `planos` ficou como legado.
  -- ------------------------------------------------------------------
  v_valor := coalesce(nullif(v_s.valor, 0), 0);
  if v_valor = 0 and v_s.plano_id is not null then
    select coalesce(nullif(p.valor_vigente,0), nullif(p.valor_mensal,0)) into v_valor
      from planos p where p.id = v_s.plano_id;
  end if;
  if coalesce(v_valor,0) = 0 and v_s.tumulo_id is not null then
    select nullif(t.valor_lavagem, 0) into v_valor from tumulos t where t.id = v_s.tumulo_id;
  end if;
  if coalesce(v_valor,0) = 0 then
    select coalesce(nullif(o.valor_referencia_limpeza,0), 40) into v_valor
      from orgs o where o.id = v_org;
  end if;
  v_valor := coalesce(v_valor, 40);

  if coalesce(v_s.valor, 0) = 0 and v_valor > 0 then
    update servicos set valor = v_valor where id = p_servico;
    if v_ja then v_reparos := v_reparos || 'valor do servico estava zerado: congelado agora'::text; end if;
  end if;

  -- ------------------------------------------------------------------
  -- 3. O DÉBITO
  -- O `on conflict do nothing` sobre o índice único é a trava real; o
  -- `if not exists` seria uma corrida entre dois toques simultâneos.
  -- ------------------------------------------------------------------
  if v_s.cliente_id is not null and v_momento <> 'antes' and v_valor > 0
     and v_modo = 'consumo' then
    insert into conta_corrente (org_id, familia_id, cliente_id, tumulo_id, servico_id,
                                tipo, origem, valor, status_conc, descricao, data)
    values (v_org, v_familia, v_s.cliente_id, v_s.tumulo_id, p_servico,
            'debito', 'lavagem', v_valor, 'confirmado',
            'Limpeza executada' || coalesce(' · ' || v_codigo, ''), current_date)
    on conflict do nothing;
    v_deb := found;
    if v_deb and v_ja then
      v_reparos := v_reparos || 'debito estava faltando: lancado agora'::text;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 4. O EXTRATO DA FAMÍLIA — valor ZERO, de propósito
  -- Quem gera a dívida é a competência. Se a lavagem também lançasse valor,
  -- a família seria cobrada duas vezes pelo mesmo serviço.
  -- ------------------------------------------------------------------
  if v_familia is not null and v_modo <> 'consumo' then
    insert into conta_corrente (org_id, familia_id, cliente_id, tumulo_id, servico_id,
                                tipo, origem, competencia, valor, descricao, data)
    values (v_org, v_familia, v_s.cliente_id, v_s.tumulo_id, p_servico, 'debito', 'lavagem',
            null, 0, 'Limpeza realizada' || coalesce(' · ' || v_codigo, ''), current_date)
    on conflict do nothing;
    v_ext := found;
    if v_ext and v_ja then
      v_reparos := v_reparos || 'registro no extrato estava faltando: criado agora'::text;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 5. A FILA DE LIBERAÇÃO — outbox, nada é enviado aqui
  --
  -- Para quem vai: quem recebe as fotos de carinho, não necessariamente quem
  -- paga. É o filho que acerta a conta, mas às vezes é a neta que acompanha.
  -- ------------------------------------------------------------------
  if v_familia is not null and coalesce(p_foto_depois, '') <> '' then
    v_dest := p_destinatario;
    if v_dest is null then
      select c.id into v_dest from clientes c
       where c.familia_id = v_familia
       order by (c.recebe_fotos is true) desc,
                (c.responsavel_financeiro is true) desc,
                c.created_at
       limit 1;
    end if;

    if v_dest is not null then
      v_texto := coalesce(nullif(btrim(p_texto_mensagem), ''),
                          'A limpeza foi feita. Segue a foto. 🌿');
      insert into fila_liberacao (org_id, familia_id, cliente_id, tumulo_id, servico_id,
                                  tipo, texto, fotos)
      values (v_org, v_familia, v_dest, v_s.tumulo_id, p_servico, 'foto', v_texto,
              to_jsonb(array_remove(array[
                coalesce(p_foto_antes, v_s.foto_antes_url), p_foto_depois], null)))
      on conflict do nothing;
      v_fila := found;
      if v_fila and v_ja then
        v_reparos := v_reparos || 'mensagem da familia estava faltando: entrou na fila'::text;
      end if;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 6. A REMUNERAÇÃO — congelada agora (migration 0031)
  -- Mesma regra de `src/lib/remuneracao.ts:valorDoServico`. A receita é o
  -- valor RESOLVIDO acima, não o que estava gravado: passar o valor cru fazia
  -- a família pagar R$ 40 e a ajudante ganhar R$ 0,00 nos avulsos.
  -- ------------------------------------------------------------------
  if coalesce(v_s.executora_id, v_uid) is not null and v_s.valor_executora is null then
    v_avulso := v_s.plano_id is null;
    select * into v_regra from remuneracao_regras
     where org_id = v_org and membro_id = coalesce(v_s.executora_id, v_uid)
     limit 1;
    if not found then
      select * into v_regra from remuneracao_regras
       where org_id = v_org and membro_id is null limit 1;
    end if;

    if found then
      if v_regra.modo = 'mensal' or (v_regra.so_avulso and not v_avulso) then
        v_remun := 0;
      elsif v_regra.base_jazigo = 'percentual' then
        v_remun := round(v_valor * coalesce(v_regra.percentual_receita,0) / 100.0, 2);
      else
        v_remun := round(coalesce(v_regra.valor_por_jazigo,0), 2);
      end if;
      update servicos set valor_executora = v_remun where id = p_servico;
      if v_ja then v_reparos := v_reparos || 'remuneracao estava faltando: carimbada agora'::text; end if;
    end if;
  else
    v_remun := v_s.valor_executora;
  end if;

  -- ------------------------------------------------------------------
  -- 7. O CONSUMO DE MATERIAL
  --
  -- `custo_estimado is null` é a chave de idempotência: sem ela, reprocessar
  -- baixava o estoque DE NOVO. O `src/lib/consumo.ts` não tinha essa trava —
  -- só não aparecia porque a rota antiga retornava cedo em reprocessamento.
  -- ------------------------------------------------------------------
  if v_s.custo_estimado is null then
    for m in
      select id, estoque, consumo_por_limpeza, custo_unitario
        from materiais
       where org_id = v_org and coalesce(consumo_por_limpeza,0) > 0
       for update
    loop
      v_custo := v_custo + m.consumo_por_limpeza * coalesce(m.custo_unitario, 0);
      update materiais set
        estoque = greatest(0, coalesce(estoque,0) - m.consumo_por_limpeza),
        atualizado_em = now()
      where id = m.id;
    end loop;
    v_custo := round(v_custo, 2);
    update servicos set custo_estimado = v_custo where id = p_servico;
    if v_ja and v_custo > 0 then
      v_reparos := v_reparos || 'consumo de material estava faltando: baixado agora'::text;
    end if;
  else
    v_custo := v_s.custo_estimado;
  end if;

  return query select v_ja, v_valor, v_deb, v_ext, v_fila, v_remun, v_custo, v_reparos;
end
$function$;
commit;
