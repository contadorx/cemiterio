-- 0119 — PARAR E RETOMAR, A PEDIDO DA FAMÍLIA
--
-- O PEDIDO
--   "preciso no jazigo a situação de parada e retomada do serviço em razão de
--    pedidos da família, quando ela pede para eu parar o serviço e depois para
--    retomar tempos depois"
--
-- O QUE FALTAVA
--   Nada. Não havia como registrar isso — e o que se fazia no lugar era
--   desmarcar `contratado`, que apaga o combinado em vez de suspendê-lo: some
--   o valor, some o ritmo, some a data. Retomar depois significa recadastrar
--   de memória, e três meses depois ninguém sabe se aquele jazigo parou, se
--   foi cancelado ou se alguém errou o clique.
--
--   Parar não é cancelar. É um estado com data de início, e quase sempre com
--   data de fim.
--
-- O RELÓGIO CONGELA E ANDA JUNTO  (decisão do Leandro)
--   Os meses parados não são cobrados E a próxima cobrança anda para frente na
--   mesma medida. A família não perde o período que contratou — ele só
--   acontece mais tarde.
--
--     Magda, pós-pago a cada 2 meses. Período aberto set–out, cobra em nov.
--     Pediu para parar em 01/09 e voltar em 01/11 — dois meses.
--     Na retomada: o período aberto vira nov–dez, e a cobrança, janeiro.
--
--   A alternativa era pular os meses e manter o calendário — ela receberia
--   dois meses a menos de serviço pelo mesmo ciclo. Congelar é o que ela
--   entende por "para" e "volta".
--
-- A PAUSA ALCANÇA lavagem, cobrança e flores. NÃO alcança as datas de
--   memória: quem parou a limpeza por dinheiro pode continuar querendo a
--   lembrança do aniversário, e essas mensagens não custam nada a ela.
--
-- ---------------------------------------------------------------------------
-- E A ÂNCORA DO PERÍODO PASSA A SER ESCRITA
-- ---------------------------------------------------------------------------
-- A 0115 DEDUZIA o início do período contando quantas competências já haviam
-- sido lançadas para o túmulo:
--
--     v_ini := inicio_cobranca + (floor(ja_lancadas / N) * N) meses
--
-- Funcionava porque nenhum mês era pulado. A pausa pula meses, e a conta
-- quebra: com dois meses parados, `ja_lancadas` fica para trás da linha do
-- tempo e a âncora volta para um período que já fechou — relançando meses
-- antigos ou pulando os novos, sem erro nenhum na tela.
--
-- Então a âncora deixa de ser deduzida e passa a ser GRAVADA, ao lado de
-- `proxima_cobranca`, que já andava assim desde sempre. As duas caminham
-- juntas: uma diz que meses o período cobre, a outra diz quando ela paga.
--
-- Isto não muda o comportamento de ninguém hoje — o backfill grava exatamente
-- o que a dedução devolveria. Muda o que acontece quando um mês é pulado.

begin;

-- ---------------------------------------------------------------------------
-- 1. O REGISTRO DA PAUSA
-- ---------------------------------------------------------------------------
create table if not exists pausas_tumulo (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  tumulo_id  uuid not null references tumulos(id) on delete cascade,
  inicio     date not null default current_date,
  -- NULO = ainda parado. É esta coluna que responde "está parado?", e por isso
  -- ela é a única fonte: nada de um booleano no túmulo para desencontrar.
  fim        date,
  -- POR QUE PAROU, obrigatório. "Parado" sem motivo, meses depois, é uma
  -- pergunta que a família faz e a casa não sabe responder.
  motivo     text not null,
  motivo_retomada text,
  created_at timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);

-- UMA PAUSA ABERTA POR VEZ. Duas seriam duas contagens de meses parados, e a
-- retomada empurraria o contrato duas vezes.
create unique index if not exists uq_pausa_aberta_por_tumulo
  on pausas_tumulo(tumulo_id) where fim is null;
create index if not exists idx_pausas_tumulo_org
  on pausas_tumulo(org_id, tumulo_id, inicio desc);

alter table pausas_tumulo enable row level security;

drop policy if exists pausas_tumulo_org on pausas_tumulo;
create policy pausas_tumulo_org on pausas_tumulo
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Uma restritiva POR COMANDO — a lição da 0079.
drop policy if exists pausas_tumulo_insert_admin on pausas_tumulo;
create policy pausas_tumulo_insert_admin on pausas_tumulo
  as restrictive for insert
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);

drop policy if exists pausas_tumulo_update_admin on pausas_tumulo;
create policy pausas_tumulo_update_admin on pausas_tumulo
  as restrictive for update
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

drop policy if exists pausas_tumulo_delete_admin on pausas_tumulo;
create policy pausas_tumulo_delete_admin on pausas_tumulo
  as restrictive for delete
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null);

-- "ESTÁ PARADO?" TEM UMA RESPOSTA SÓ, e todo mundo pergunta a ela.
create or replace function public.sureya_tumulo_parado(p_tumulo uuid, p_em date default null)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from pausas_tumulo p
     where p.tumulo_id = p_tumulo
       and p.inicio <= coalesce(p_em, current_date)
       and (p.fim is null or p.fim > coalesce(p_em, current_date))
  );
$$;

revoke all on function public.sureya_tumulo_parado(uuid, date) from public, anon;
grant execute on function public.sureya_tumulo_parado(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. A ÂNCORA ESCRITA
-- ---------------------------------------------------------------------------
alter table tumulos add column if not exists periodo_inicio date;

comment on column tumulos.periodo_inicio is
  'Primeiro mes do periodo de cobranca ABERTO. Anda N meses quando o ciclo '
  'fecha, junto com proxima_cobranca. Ate a 0119 era deduzido contando '
  'competencias lancadas, o que quebrava quando um mes era pulado (0119).';

-- BACKFILL — grava exatamente o que a dedução da 0115 devolveria hoje, para
-- ninguém acordar amanhã com um período diferente do que tinha ontem.
update tumulos t
   set periodo_inicio = case
     when t.cobranca_no_fim and t.inicio_cobranca is not null then
       (date_trunc('month', t.inicio_cobranca)
        + ((
            (select count(*) from conta_corrente cc
              where cc.tumulo_id = t.id and cc.origem = 'competencia' and cc.tipo = 'debito')
            / greatest(coalesce(t.meses_entre_cobrancas,
                                sureya_meses_da_cobranca(f.freq_pagamento::text)), 1)
          ) * greatest(coalesce(t.meses_entre_cobrancas,
                                sureya_meses_da_cobranca(f.freq_pagamento::text)), 1)
          || ' months')::interval)::date
     when t.cobranca_no_fim then
       (date_trunc('month', t.proxima_cobranca)
        - ((greatest(coalesce(t.meses_entre_cobrancas,
                              sureya_meses_da_cobranca(f.freq_pagamento::text)), 1) - 1)
           || ' months')::interval)::date
     else date_trunc('month', t.proxima_cobranca)::date
   end
  from familias f
 where f.id = t.familia_id
   and t.proxima_cobranca is not null
   and t.periodo_inicio is null;

-- ---------------------------------------------------------------------------
-- 3. O COBRADOR LÊ A ÂNCORA, E PULA QUEM ESTÁ PARADO
-- ---------------------------------------------------------------------------
create or replace function public.sureya_cobrar_competencias(
  p_ate date default null, p_org uuid default null, p_familia uuid default null)
returns table(lancados integer, valor_total numeric, tumulos_tocados integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_ate date; v_mes_ate date; v_dia_venc int; r record;
  v_lanc int := 0; v_total numeric := 0; v_toc int := 0;
  v_meses int; v_comp date; v_andou boolean; v_entrou int;
  v_ini date; v_fim date; v_mes date; v_venc date; v_rotulo text; v_tocou boolean;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using
      errcode = '42501',
      hint = 'Sem sessao do painel: passe p_org (e o cron sempre passa).';
  end if;
  v_ate := coalesce(p_ate, current_date);
  v_mes_ate := date_trunc('month', v_ate)::date;

  select coalesce(dia_vencimento, 10) into v_dia_venc from orgs where id = v_org;

  for r in
    select t.id, t.familia_id, t.valor_mensal, t.proxima_cobranca, t.identificacao,
           t.inicio_cobranca, t.periodo_inicio, t.meses_entre_cobrancas,
           t.cobranca_no_fim, f.freq_pagamento::text as freq
      from tumulos t
      join familias f on f.id = t.familia_id
     where t.org_id = v_org
       and t.contratado
       and t.familia_id is not null
       and coalesce(t.valor_mensal, 0) > 0
       and t.proxima_cobranca is not null
       and (p_familia is null or t.familia_id = p_familia)
       and (t.cobranca_no_fim or t.proxima_cobranca <= v_ate)
       -- PARADO A PEDIDO DA FAMÍLIA NÃO É COBRADO (0119). Sem isto ela
       -- continuaria devendo por um serviço que pediu para não receber — que
       -- é a conversa mais cara que esta casa pode ter.
       and not sureya_tumulo_parado(t.id, v_ate)
  loop
    v_meses := coalesce(r.meses_entre_cobrancas, sureya_meses_da_cobranca(r.freq));
    v_comp  := date_trunc('month', r.proxima_cobranca)::date;
    v_tocou := false;
    v_andou := false;

    -- A ÂNCORA É LIDA, NÃO DEDUZIDA (0119).
    --
    -- `periodo_inicio` nulo cai na dedução da 0115 — contar quantas
    -- competências já foram lançadas. Não é sobra de código: é o único jeito
    -- de um cadastro criado antes do backfill continuar dando exatamente a
    -- mesma resposta que dava ontem.
    --
    -- A dedução é que quebra quando um mês é pulado. Por isso quem para o
    -- serviço grava a âncora, e a partir daí ela manda.
    if r.periodo_inicio is not null then
      v_ini := date_trunc('month', r.periodo_inicio)::date;
    elsif r.cobranca_no_fim and r.inicio_cobranca is not null then
      select date_trunc('month', r.inicio_cobranca)
             + (((count(*) / v_meses) * v_meses) || ' months')::interval
        into v_ini
        from conta_corrente
       where tumulo_id = r.id and origem = 'competencia' and tipo = 'debito';
    elsif r.cobranca_no_fim then
      v_ini := (v_comp - ((v_meses - 1) || ' months')::interval)::date;
    else
      v_ini := v_comp;
    end if;

    loop
      v_fim := (v_ini + ((v_meses - 1) || ' months')::interval)::date;

      if r.cobranca_no_fim then
        exit when v_ini > v_mes_ate;      -- nada deste periodo foi prestado
      else
        exit when v_comp > v_ate;         -- a data de cobrar ainda nao chegou
      end if;

      v_venc := (v_comp + (v_dia_venc - 1))::date;

      v_rotulo := case
        when v_meses = 1 then to_char(v_ini, 'MM/YYYY')
        else to_char(v_ini, 'MM/YYYY') || ' a ' || to_char(v_fim, 'MM/YYYY')
      end;

      v_mes := v_ini;
      while v_mes <= v_fim loop
        exit when r.cobranca_no_fim and v_mes > v_mes_ate;

        insert into conta_corrente
          (org_id, familia_id, cliente_id, tumulo_id, tipo, origem,
           competencia, valor, descricao, data, canal)
        select v_org, r.familia_id, f.responsavel_id, r.id, 'debito', 'competencia',
               v_mes, round(r.valor_mensal, 2),
               'Contrato · ' || to_char(v_mes, 'MM/YYYY')
                 || coalesce(' · ' || r.identificacao, '')
                 || case when v_meses > 1
                         then ' (parte de ' || v_rotulo || ', vence em '
                              || to_char(v_venc, 'DD/MM/YYYY') || ')'
                         else '' end,
               v_venc, 'automatico'
          from familias f where f.id = r.familia_id
        on conflict do nothing;

        get diagnostics v_entrou = row_count;
        if v_entrou > 0 then
          v_lanc := v_lanc + 1;
          v_total := v_total + round(r.valor_mensal, 2);
          v_tocou := true;
        end if;

        v_mes := (v_mes + interval '1 month')::date;
      end loop;

      exit when r.cobranca_no_fim and v_fim > v_mes_ate;

      v_ini  := (v_ini  + (v_meses || ' months')::interval)::date;
      v_comp := (v_comp + (v_meses || ' months')::interval)::date;
      v_andou := true;
    end loop;

    -- AS DUAS ANDAM JUNTAS, sempre. Gravar uma sem a outra é o desencontro
    -- que esta migração existe para impedir.
    if v_andou then
      update tumulos
         set proxima_cobranca = v_comp,
             periodo_inicio = v_ini
       where id = r.id;
    end if;
    if v_tocou then v_toc := v_toc + 1; end if;
  end loop;

  return query select v_lanc, v_total, v_toc;
end $$;

revoke all on function public.sureya_cobrar_competencias(date, uuid, uuid) from public, anon;
grant execute on function public.sureya_cobrar_competencias(date, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. PARAR
-- ---------------------------------------------------------------------------
-- Não apaga nada. O combinado fica inteiro — valor, ritmo, datas — e só deixa
-- de acontecer. Retomar é devolver o mesmo contrato, e não recadastrar de
-- memória.
create or replace function public.sureya_parar_servico(
  p_tumulo uuid, p_motivo text, p_desde date default null)
returns table(pausa uuid, desde date, agendados_cancelados integer, entregas_canceladas integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_desde date; v_pausa uuid; v_serv int := 0; v_ent int := 0;
begin
  select org_id into v_org from tumulos where id = p_tumulo;
  if v_org is null then
    raise exception 'tumulo_nao_encontrado' using errcode = 'P0002';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'motivo_obrigatorio' using
      errcode = 'P0001',
      hint = 'Parado sem motivo, meses depois, e uma pergunta que a familia faz e a casa nao sabe responder.';
  end if;

  v_desde := coalesce(p_desde, current_date);

  insert into pausas_tumulo (org_id, tumulo_id, inicio, motivo)
  values (v_org, p_tumulo, v_desde, btrim(p_motivo))
  returning id into v_pausa;

  -- O QUE JÁ ESTAVA MARCADO PARA A FRENTE SAI DA AGENDA. Deixar a lavagem
  -- agendada faria a Nina ir ao jazigo que a familia pediu para nao tocar —
  -- e ela nao tem como saber pela tela dela.
  update servicos
     set status = 'cancelado',
         motivo_nao_feito = 'servico parado a pedido da familia'
   where tumulo_id = p_tumulo
     and status in ('pendente', 'agendado')
     and data_prevista >= v_desde;
  get diagnostics v_serv = row_count;

  -- E a esteira das flores também — inclusive para a PREVISÃO DE COMPRA parar
  -- de contar o buquê dele no sábado (0117).
  update entregas_extras
     set status = 'cancelada',
         motivo = 'servico parado a pedido da familia'
   where tumulo_id = p_tumulo
     and status = 'prevista'
     and data_prevista >= v_desde;
  get diagnostics v_ent = row_count;

  return query select v_pausa, v_desde, v_serv, v_ent;
end $$;

revoke all on function public.sureya_parar_servico(uuid, text, date) from public, anon;
grant execute on function public.sureya_parar_servico(uuid, text, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RETOMAR — e o relógio anda o tanto que ficou parado
-- ---------------------------------------------------------------------------
create or replace function public.sureya_retomar_servico(
  p_tumulo uuid, p_em date default null, p_motivo text default null)
-- Os nomes de saida NAO repetem os das colunas: `returning
-- tumulos.proxima_cobranca into ...` fica ambiguo quando existe um parametro
-- de saida com o mesmo nome, e o Postgres recusa a funcao inteira.
returns table(meses_parados integer, nova_cobranca date, novo_periodo date)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_em date; r record; v_meses int;
  v_prox date; v_ini date;
begin
  select org_id into v_org from tumulos where id = p_tumulo;
  if v_org is null then
    raise exception 'tumulo_nao_encontrado' using errcode = 'P0002';
  end if;

  v_em := coalesce(p_em, current_date);

  select * into r from pausas_tumulo
   where tumulo_id = p_tumulo and fim is null
   order by inicio desc limit 1;

  if not found then
    raise exception 'nao_estava_parado' using
      errcode = 'P0001',
      hint = 'Este jazigo nao tem pausa aberta. Retomar duas vezes empurraria o contrato duas vezes.';
  end if;
  if v_em < r.inicio then
    raise exception 'retomada_antes_da_parada' using errcode = 'P0001';
  end if;

  update pausas_tumulo
     set fim = v_em, motivo_retomada = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = r.id;

  -- QUANTOS MESES DE CALENDÁRIO A PAUSA ATRAVESSOU.
  --
  -- Contado sobre o primeiro dia do mês dos dois lados: parar no dia 10 e
  -- voltar no dia 20 do mesmo mês não empurra nada, e é o certo — não houve
  -- mês sem serviço. Parar em 01/09 e voltar em 01/11 são dois.
  v_meses := (extract(year  from age(date_trunc('month', v_em),
                                     date_trunc('month', r.inicio)))::int * 12)
           +  extract(month from age(date_trunc('month', v_em),
                                     date_trunc('month', r.inicio)))::int;

  -- O CONTRATO CONGELA E ANDA JUNTO (decisão do Leandro). As duas datas se
  -- movem na mesma medida: a família não perde o período que contratou — ele
  -- só acontece mais tarde.
  update tumulos
     set proxima_cobranca = case when v_meses > 0 and proxima_cobranca is not null
                                 then (proxima_cobranca + (v_meses || ' months')::interval)::date
                                 else proxima_cobranca end,
         periodo_inicio   = case when v_meses > 0 and periodo_inicio is not null
                                 then (periodo_inicio + (v_meses || ' months')::interval)::date
                                 else periodo_inicio end,
         -- A rota volta a partir de hoje, e não da data velha que já passou.
         inicio_agendamento = greatest(coalesce(inicio_agendamento, v_em), v_em),
         proximo_servico = case when proximo_servico is null or proximo_servico < v_em
                                then v_em else proximo_servico end
   where id = p_tumulo
   returning tumulos.proxima_cobranca, tumulos.periodo_inicio into v_prox, v_ini;

  -- AS FLORES RECOMEÇAM DA PRÓXIMA DATA VÁLIDA, e não da que ficou gravada
  -- durante a pausa — aquela é a resposta de um sábado que já passou.
  update assinaturas_extras
     set proxima = sureya_proxima_data_extra(dia_semana, semanas, v_em)
   where tumulo_id = p_tumulo and ativo;

  return query select v_meses, v_prox, v_ini;
end $$;

revoke all on function public.sureya_retomar_servico(uuid, date, text) from public, anon;
grant execute on function public.sureya_retomar_servico(uuid, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. A ESTEIRA DAS FLORES TAMBÉM PULA QUEM ESTÁ PARADO
-- ---------------------------------------------------------------------------
-- Sem isto, o gerador recriaria amanhã a entrega que a parada cancelou hoje —
-- e a previsão de compra voltaria a contar o buquê de um jazigo que a família
-- pediu para não tocar.
do $migra$
declare v_src text; v_novo text;
begin
  v_src := pg_get_functiondef('public.sureya_gerar_entregas_extras(date,uuid)'::regprocedure);
  v_novo := replace(v_src,
    'where a.org_id = v_org and a.ativo',
    'where a.org_id = v_org and a.ativo
       and not sureya_tumulo_parado(a.tumulo_id, v_ate)');
  if v_novo = v_src then
    raise exception 'ALVO NAO ENCONTRADO no gerador de entregas';
  end if;
  execute v_novo;
end $migra$;

commit;
