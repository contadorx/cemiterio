-- 0117 — FLORES NO ÚLTIMO SÁBADO
--
-- O PEDIDO
--   "eu coloco flores sábado, então ele contratou flores no último sábado do
--    mês… preciso então ter uma esteira para isso, e uma forma de colocar e
--    enviar fotos… e principalmente de prever a compra. As flores ainda podem
--    ser recorrentes na cobrança ou avulso."
--
-- O QUE JÁ EXISTIA E O QUE FALTAVA
--   O catálogo existe desde a 0045 (`servicos_extras`: 14 itens, com PREÇO E
--   CUSTO — "Flores frescas" a R$ 35 o buquê que custa R$ 18). O pedido avulso
--   existe (`pedidos_extras`). O que não existia era o meio do caminho:
--
--     · o COMBINADO que se repete   → nada
--     · a LISTA do sábado           → nada
--     · a PREVISÃO da compra        → nada
--
--   Sem o combinado, "último sábado do mês" só existe na cabeça do Leandro.
--   Sem a lista, o sábado é memória. Sem a previsão, a compra é chute — e num
--   serviço em que o custo é um buquê que murcha, chutar para cima é prejuízo
--   e para baixo é a família sem flor.
--
-- POR QUE UMA ESTEIRA SEPARADA, E NÃO UMA LINHA EM `servicos`
--   Foi decisão do Leandro: rota própria, executada por ele. E é a escolha
--   certa também por dentro. `servicos` significa LAVAGEM em quinze lugares
--   deste sistema: o alocador mede capacidade por duração de lavagem, o painel
--   conta "lavagens executadas / pelo campo / anotadas", `sem_entrega` acusa
--   túmulo cobrado sem limpeza, a Nina abre a lista do dia dela.
--
--   Enfiar flor ali com uma coluna `tipo` obrigaria a filtrar todos esses
--   lugares — e o que se esquece de filtrar não dá erro: seis buquês somem
--   como seis lavagens no painel, e uma flor entregue cala o aviso de que o
--   jazigo foi cobrado sem ser limpo. Silencioso é o pior modo de errar, e
--   este banco já foi mordido cinco vezes por duas contas sobre o mesmo fato.
--
-- O QUE ESTE ARQUIVO CRIA
--   assinaturas_extras  o combinado: este jazigo, este item, neste ritmo
--   entregas_extras     cada entrega prevista ou feita — é a esteira
--   e quatro funções: a data seguinte, o gerador, a entrega, e a compra.
--
--   Genérico sobre o CATÁLOGO, e não sobre "flores": o catálogo já tem vela,
--   limpeza pesada e preparo de Finados, todos com preço e custo. A tela fala
--   de flores porque é o que o Leandro faz; a máquina não precisa saber disso.
--
-- E `pedidos_extras`, QUE JÁ EXISTIA
--   A 0045 criou também `pedidos_extras` — o pedido avulso de uma família — com
--   sua própria função de entrega (`sureya_entregar_extra`, que continua de pé
--   e com teste em `escritas.sql`). Ela quase servia, e por isso é preciso
--   dizer por que não foi usada:
--
--     · é do CLIENTE, não da família — anterior à decisão de 22/08 (D-01)
--     · aponta para `movimentos`, o razão CONGELADO desde a 0074
--     · não guarda CUSTO, que é metade da pergunta do Leandro
--     · não tem data PREVISTA, só data do pedido e da entrega — e a esteira
--       inteira vive do que ainda não aconteceu
--
--   Ela nunca foi ligada: uma linha em produção, cancelada, e a tela
--   (`Extras.tsx`) não é importada por ninguém. Uma entrega avulsa agora nasce
--   aqui mesmo, com `assinatura_id` nulo — que é o caso "a família pediu um
--   vaso para domingo". Retirar a tabela velha fica anotado em PENDENCIAS;
--   mexer numa porta de dinheiro para apagar código morto é troca ruim hoje.

begin;

-- ---------------------------------------------------------------------------
-- 1. O COMBINADO — assinaturas_extras
-- ---------------------------------------------------------------------------
create table if not exists assinaturas_extras (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  tumulo_id   uuid not null references tumulos(id) on delete cascade,
  familia_id  uuid references familias(id) on delete set null,
  extra_id    uuid not null references servicos_extras(id) on delete restrict,

  quantidade  numeric(10,2) not null default 1 check (quantidade > 0),

  -- O RITMO: dia da semana + em quais semanas do mês.
  --
  --   0 = domingo … 6 = sábado
  --   semanas: {1,2,3,4,5} = toda semana · {1,3} = 1ª e 3ª · {-1} = A ÚLTIMA
  --
  -- `-1` existe porque "último sábado" não é "quarto sábado": alguns meses têm
  -- cinco. Contar de trás é a única forma de o combinado não deslizar.
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  semanas     smallint[] not null default '{-1}'
              check (array_length(semanas, 1) between 1 and 5),

  -- COMO SE COBRA.
  --   recorrente  entra na fatura do contrato do jazigo, no vencimento dela
  --   avulso      vence sozinha, no dia da casa
  -- Nos dois casos só se cobra o que foi ENTREGUE — a flor não entregue não
  -- vira dinheiro, pela mesma razão que a lavagem não vira (0104).
  cobranca    text not null default 'recorrente'
              check (cobranca in ('recorrente', 'avulso')),

  -- PREÇO E CUSTO CONGELADOS NO COMBINADO. O catálogo muda quando o
  -- fornecedor muda; o que foi combinado com a família, não. Sem isto, um
  -- reajuste do buquê reescreveria o passado de todo mundo.
  preco_unit  numeric(10,2) not null default 0,
  custo_unit  numeric(10,2) not null default 0,

  inicio      date not null default current_date,
  proxima     date,
  ativo       boolean not null default true,
  observacao  text,
  created_at  timestamptz not null default now()
);

-- UM COMBINADO POR ITEM POR JAZIGO. Dois iguais no mesmo jazigo é engano de
-- cadastro, e o engano aqui custa buquê comprado a mais toda semana.
create unique index if not exists uq_assinatura_extra_tumulo_item
  on assinaturas_extras(tumulo_id, extra_id) where ativo;
create index if not exists idx_assinaturas_extras_org
  on assinaturas_extras(org_id, ativo, proxima);
create index if not exists idx_assinaturas_extras_familia
  on assinaturas_extras(org_id, familia_id);

alter table assinaturas_extras enable row level security;

drop policy if exists assinaturas_extras_org on assinaturas_extras;
create policy assinaturas_extras_org on assinaturas_extras
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- UMA RESTRITIVA POR COMANDO — a lição da 0079: `using` governa
-- select/update/delete, `with check` governa insert/update, e DELETE nunca
-- consulta `with check`. Uma política "for all" com só um dos dois deixa uma
-- porta aberta que ninguém vê.
drop policy if exists assinaturas_extras_insert_admin on assinaturas_extras;
create policy assinaturas_extras_insert_admin on assinaturas_extras
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);

drop policy if exists assinaturas_extras_update_admin on assinaturas_extras;
create policy assinaturas_extras_update_admin on assinaturas_extras
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

drop policy if exists assinaturas_extras_delete_admin on assinaturas_extras;
create policy assinaturas_extras_delete_admin on assinaturas_extras
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

-- ---------------------------------------------------------------------------
-- 2. A ESTEIRA — entregas_extras
-- ---------------------------------------------------------------------------
-- Uma linha por entrega PREVISTA. Nasce do gerador com status `prevista`, e o
-- sábado do Leandro é a lista dessas linhas.
create table if not exists entregas_extras (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  assinatura_id uuid references assinaturas_extras(id) on delete set null,
  tumulo_id     uuid not null references tumulos(id) on delete cascade,
  familia_id    uuid references familias(id) on delete set null,
  extra_id      uuid references servicos_extras(id) on delete set null,

  -- NOME E VALORES COPIADOS. A entrega de março tem de continuar dizendo o
  -- que foi entregue e por quanto, mesmo que o item saia do catálogo.
  nome          text not null,
  unidade       text not null default 'un',
  quantidade    numeric(10,2) not null default 1,
  preco_unit    numeric(10,2) not null default 0,
  custo_unit    numeric(10,2) not null default 0,

  data_prevista date not null,
  ordem_dia     int,
  status        text not null default 'prevista'
                check (status in ('prevista','entregue','pulada','cancelada')),
  entregue_em   timestamptz,
  foto_url      text,
  observacao    text,
  motivo        text,
  lancamento_id uuid references conta_corrente(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- CONVERGENTE: rodar o gerador dez vezes no mesmo dia dá o mesmo resultado.
create unique index if not exists uq_entrega_extra_dia
  on entregas_extras(tumulo_id, extra_id, data_prevista);
create index if not exists idx_entregas_extras_dia
  on entregas_extras(org_id, data_prevista, status);
create index if not exists idx_entregas_extras_familia
  on entregas_extras(org_id, familia_id);

alter table entregas_extras enable row level security;

drop policy if exists entregas_extras_org on entregas_extras;
create policy entregas_extras_org on entregas_extras
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

drop policy if exists entregas_extras_insert_admin on entregas_extras;
create policy entregas_extras_insert_admin on entregas_extras
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);

drop policy if exists entregas_extras_update_admin on entregas_extras;
create policy entregas_extras_update_admin on entregas_extras
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

drop policy if exists entregas_extras_delete_admin on entregas_extras;
create policy entregas_extras_delete_admin on entregas_extras
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

-- A FOTO DA ENTREGA ENTRA NA MESMA FILA DA FOTO DA LAVAGEM, e o descarte
-- precisa alcançar as duas pontas — foi a lição da 0113, quando a foto
-- descartada na liberação continuava pendente na fila de envio.
alter table fila_liberacao add column if not exists entrega_id uuid
  references entregas_extras(id) on delete set null;
create index if not exists idx_fila_liberacao_entrega
  on fila_liberacao(org_id, entrega_id) where entrega_id is not null;

-- ---------------------------------------------------------------------------
-- 3. A DATA SEGUINTE — uma implementação só
-- ---------------------------------------------------------------------------
-- "Último sábado do mês" é aritmética de calendário, e aritmética de
-- calendário escrita duas vezes vira duas respostas. Esta função é a única
-- que sabe fazer a conta: o gerador chama, a tela chama, o teste chama.
create or replace function public.sureya_proxima_data_extra(
  p_dia_semana smallint, p_semanas smallint[], p_de date)
returns date
language plpgsql
immutable
as $$
declare
  v_mes date; v_dias date[]; v_n int; v_s smallint; v_cand date;
  v_melhor date; i int;
begin
  if p_dia_semana is null or p_semanas is null or array_length(p_semanas, 1) is null then
    return null;
  end if;

  -- Três meses de folga bastam: o pior caso é um combinado de uma única
  -- semana do mês, pedido no dia seguinte ao que ela passou.
  for i in 0..3 loop
    v_mes := (date_trunc('month', p_de) + (i || ' months')::interval)::date;

    select array_agg(g.d::date order by g.d) into v_dias
      from generate_series(v_mes,
                           (v_mes + interval '1 month' - interval '1 day')::date,
                           interval '1 day') g(d)
     where extract(dow from g.d) = p_dia_semana;

    v_n := coalesce(array_length(v_dias, 1), 0);
    v_melhor := null;

    foreach v_s in array p_semanas loop
      -- -1 CONTA DE TRÁS. É o que faz "último sábado" continuar sendo o
      -- último num mês de cinco sábados.
      if v_s = -1 then
        v_cand := v_dias[v_n];
      elsif v_s between 1 and v_n then
        v_cand := v_dias[v_s];
      else
        continue;   -- pediram a 5ª semana num mês que não tem
      end if;

      if v_cand >= p_de and (v_melhor is null or v_cand < v_melhor) then
        v_melhor := v_cand;
      end if;
    end loop;

    if v_melhor is not null then return v_melhor; end if;
  end loop;

  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. O GERADOR — enche a esteira até o horizonte
-- ---------------------------------------------------------------------------
create or replace function public.sureya_gerar_entregas_extras(
  p_ate date default null, p_org uuid default null)
returns table(criadas integer, assinaturas integer, proxima date)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_ate date; r record; v_prox date; v_n int := 0; v_ass int := 0;
  v_entrou int; v_proxima_geral date; v_giros int;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using
      errcode = '42501',
      hint = 'Sem sessao do painel: passe p_org (e o cron sempre passa).';
  end if;
  -- Sessenta dias: dá para ver o próximo sábado e o mês inteiro à frente sem
  -- encher a esteira de entrega que ainda pode ser cancelada.
  v_ate := coalesce(p_ate, current_date + 60);

  for r in
    select a.*, e.nome, e.unidade, t.familia_id as fam_do_tumulo
      from assinaturas_extras a
      join servicos_extras e on e.id = a.extra_id
      join tumulos t on t.id = a.tumulo_id
     where a.org_id = v_org and a.ativo
  loop
    v_ass := v_ass + 1;

    -- Sem `proxima` gravada, a primeira sai do início combinado.
    v_prox := coalesce(r.proxima,
                       sureya_proxima_data_extra(r.dia_semana, r.semanas, r.inicio));

    -- O laço tem teto. Um combinado semanal com horizonte grande daria
    -- dezenas de voltas; um dado ruim daria infinitas.
    v_giros := 0;
    while v_prox is not null and v_prox <= v_ate and v_giros < 100 loop
      v_giros := v_giros + 1;

      insert into entregas_extras
        (org_id, assinatura_id, tumulo_id, familia_id, extra_id, nome, unidade,
         quantidade, preco_unit, custo_unit, data_prevista)
      values (v_org, r.id, r.tumulo_id, coalesce(r.familia_id, r.fam_do_tumulo),
              r.extra_id, r.nome, coalesce(r.unidade, 'un'),
              r.quantidade, r.preco_unit, r.custo_unit, v_prox)
      on conflict do nothing;

      get diagnostics v_entrou = row_count;
      if v_entrou > 0 then v_n := v_n + 1; end if;

      v_prox := sureya_proxima_data_extra(r.dia_semana, r.semanas, (v_prox + 1)::date);
    end loop;

    update assinaturas_extras set proxima = v_prox where id = r.id;

    if v_prox is not null and (v_proxima_geral is null or v_prox < v_proxima_geral) then
      v_proxima_geral := v_prox;
    end if;
  end loop;

  return query select v_n, v_ass, v_proxima_geral;
end $$;

revoke all on function public.sureya_gerar_entregas_extras(date, uuid) from public, anon;
grant execute on function public.sureya_gerar_entregas_extras(date, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. A ENTREGA — e o dinheiro que nasce dela
-- ---------------------------------------------------------------------------
-- SÓ SE COBRA O QUE FOI ENTREGUE. É a mesma regra da lavagem, e por isso o
-- débito nasce aqui e não no gerador: entrega prevista não é receita.
--
-- A diferença entre recorrente e avulso é o VENCIMENTO, e só ele:
--   recorrente  vence junto com a próxima cobrança do contrato do jazigo,
--               para a família receber UMA conta e não duas
--   avulso      vence sozinha, no dia da casa do mês da entrega
--
-- As três leituras da 0114 continuam valendo: a competência é o mês em que a
-- flor foi posta, `data` é quando o dinheiro é devido, e inadimplência só
-- olha o que já venceu.
create or replace function public.sureya_registrar_entrega(
  p_entrega uuid, p_foto text default null, p_observacao text default null)
returns table(lancamento uuid, valor numeric, vence date)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record; v_dia_venc int; v_venc date; v_comp date; v_valor numeric; v_lanc uuid;
  v_cobranca text; v_prox_cobranca date;
begin
  select e.*, t.identificacao, t.proxima_cobranca,
         coalesce(a.cobranca, 'avulso') as modo
    into r
    from entregas_extras e
    join tumulos t on t.id = e.tumulo_id
    left join assinaturas_extras a on a.id = e.assinatura_id
   where e.id = p_entrega;

  if not found then
    raise exception 'entrega_nao_encontrada' using errcode = 'P0002';
  end if;
  if r.status = 'entregue' then
    raise exception 'entrega_ja_registrada' using
      errcode = 'P0001',
      hint = 'Esta entrega ja foi marcada como feita; cobrar de novo dobraria a conta da familia.';
  end if;

  select coalesce(dia_vencimento, 10) into v_dia_venc from orgs where id = r.org_id;

  v_comp  := date_trunc('month', r.data_prevista)::date;
  v_valor := round(r.quantidade * r.preco_unit, 2);
  v_cobranca := r.modo;
  v_prox_cobranca := r.proxima_cobranca;

  if v_cobranca = 'recorrente' and v_prox_cobranca is not null then
    v_venc := (date_trunc('month', v_prox_cobranca)::date + (v_dia_venc - 1))::date;
  else
    v_venc := (v_comp + (v_dia_venc - 1))::date;
    -- Entregou depois do dia de vencer: cobrar com data de ontem faria a
    -- familia nascer inadimplente pelo servico que acabou de receber.
    if v_venc < r.data_prevista then
      v_venc := ((v_comp + interval '1 month')::date + (v_dia_venc - 1))::date;
    end if;
  end if;

  update entregas_extras
     set status = 'entregue',
         entregue_em = now(),
         foto_url = coalesce(p_foto, foto_url),
         observacao = coalesce(p_observacao, observacao)
   where id = p_entrega;

  if v_valor > 0.004 and r.familia_id is not null then
    insert into conta_corrente
      (org_id, familia_id, tumulo_id, tipo, origem, competencia, valor,
       descricao, data, canal)
    values (r.org_id, r.familia_id, r.tumulo_id, 'debito', 'avulso', v_comp, v_valor,
            r.nome || ' · ' || to_char(r.data_prevista, 'DD/MM/YYYY')
              || coalesce(' · ' || r.identificacao, '')
              || case when r.quantidade <> 1
                      then ' (' || trim(to_char(r.quantidade, 'FM999990.99')) || ' '
                           || r.unidade || ')' else '' end,
            v_venc, 'campo')
    returning id into v_lanc;

    update entregas_extras set lancamento_id = v_lanc where id = p_entrega;
  end if;

  return query select v_lanc, v_valor, v_venc;
end $$;

revoke all on function public.sureya_registrar_entrega(uuid, text, text) from public, anon;
grant execute on function public.sureya_registrar_entrega(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. A COMPRA — o papel que se leva para a floricultura
-- ---------------------------------------------------------------------------
-- Agrupa por DATA e por ITEM, porque é assim que se compra: "sábado 27,
-- 6 buquês frescos e 2 arranjos". E devolve custo e preço lado a lado, para a
-- margem do serviço novo aparecer sem ninguém precisar fazer a conta.
create or replace function public.sureya_compras_de_extras(
  p_de date default null, p_ate date default null, p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_de date; v_ate date; v_out jsonb;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using errcode = '42501';
  end if;
  v_de  := coalesce(p_de, current_date);
  v_ate := coalesce(p_ate, (date_trunc('month', v_de) + interval '1 month' - interval '1 day')::date);

  with previstas as (
    select e.data_prevista, e.nome, e.unidade, e.tumulo_id,
           e.quantidade, e.custo_unit, e.preco_unit
      from entregas_extras e
     where e.org_id = v_org
       and e.status = 'prevista'
       and e.data_prevista between v_de and v_ate
  ),
  por_item as (
    select data_prevista, nome, unidade,
           sum(quantidade) as quantidade,
           sum(quantidade * custo_unit) as custo,
           sum(quantidade * preco_unit) as preco
      from previstas group by data_prevista, nome, unidade
  ),
  por_data as (
    select p.data_prevista,
           jsonb_agg(jsonb_build_object(
             'nome', p.nome, 'unidade', p.unidade,
             'quantidade', p.quantidade, 'custo', p.custo, 'preco', p.preco)
             order by p.nome) as itens,
           sum(p.custo) as custo, sum(p.preco) as preco
      from por_item p group by p.data_prevista
  ),
  jazigos as (
    select data_prevista, count(distinct tumulo_id) as jazigos
      from previstas group by data_prevista
  )
  select jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'datas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', d.data_prevista,
               'jazigos', coalesce(j.jazigos, 0),
               'itens', d.itens,
               'custo', d.custo,
               'preco', d.preco)
             order by d.data_prevista)
        from por_data d left join jazigos j on j.data_prevista = d.data_prevista
    ), '[]'::jsonb),
    'custo', coalesce((select sum(custo) from por_data), 0),
    'preco', coalesce((select sum(preco) from por_data), 0),
    'margem', coalesce((select sum(preco) - sum(custo) from por_data), 0),
    'entregas', coalesce((select count(*) from previstas), 0)
  ) into v_out;

  return v_out;
end $$;

revoke all on function public.sureya_compras_de_extras(date, date, uuid) from public, anon;
grant execute on function public.sureya_compras_de_extras(date, date, uuid) to authenticated, service_role;

commit;
