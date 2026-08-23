-- =====================================================================
-- 0098 — TODO EVENTO TEM CANAL E COMPETENCIA
--
-- DUAS COISAS MEDIDAS EM PRODUCAO EM 23/08/2026, e as duas doem
-- ---------------------------------------------------------------------
--
-- 1. `conta_corrente.competencia` E NULA EM TODOS OS LANCAMENTOS.
--    A coluna existe desde a 0073 e nunca foi preenchida — nem nos 8
--    lancamentos que existem. Relatorio por competencia hoje e
--    impossivel: nao ha por onde agrupar. E `competencias` tem ZERO
--    linhas, entao nenhum mes foi fechado.
--
-- 2. LAVAGEM REGISTRADA FORA DO CAMPO NAO VIRA DINHEIRO.
--    Tres lavagens executadas no jazigo Nagae:
--
--      03/08  valor nulo   nao passou pelo campo   SEM LANCAMENTO
--      10/08  valor nulo   nao passou pelo campo   SEM LANCAMENTO
--      22/08  R$ 25,00     veio do campo           com lancamento
--
--    Duas de tres aconteceram e nao foram cobradas. Nao ha erro em lugar
--    nenhum: o servico foi marcado como executado por fora, sem valor, e
--    o dinheiro simplesmente nao existiu.
--
-- O QUE ESTA MIGRACAO FAZ
-- ---------------------------------------------------------------------
-- a) CANAL — por onde o registro entrou: automatico (a esteira da
--    competencia), campo (o aplicativo), manual_adm (alguem digitou no
--    painel) ou importacao (veio da planilha/caderno).
--
--    E um eixo DIFERENTE de `origem`. `origem` diz POR QUE o dinheiro se
--    mexeu (lavagem, pagamento, ajuste, abertura); `canal` diz COMO o
--    registro chegou. Misturar os dois — que era a tentacao — daria uma
--    lista de dez valores em que ninguem consegue filtrar nem um nem
--    outro. Para conferir, ela precisa dos dois ao mesmo tempo: "as
--    lavagens (origem) que entraram pelo campo (canal) em agosto".
--
-- b) COMPETENCIA DEIXA DE SER NULA. Gatilho carimba a partir da data do
--    lancamento quando ninguem informa. Sem isso o relatorio por
--    competencia continua sem chao.
--
-- c) A LAVAGEM SEM COBRANCA fica VISIVEL. Nao e corrigida sozinha: sao
--    valores, e valor se decide olhando. A view mostra quais sao.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sureya_canal_registro') then
    create type public.sureya_canal_registro as enum
      ('automatico', 'campo', 'manual_adm', 'importacao');
  end if;
end $$;

alter table public.conta_corrente
  add column if not exists canal sureya_canal_registro;
alter table public.servicos
  add column if not exists canal sureya_canal_registro;

comment on column public.conta_corrente.canal is
  'Por onde o registro entrou: automatico | campo | manual_adm | importacao. Eixo diferente de `origem`, que diz por que o dinheiro se mexeu.';
comment on column public.servicos.canal is
  'Por onde a lavagem foi registrada. `iniciado_em` preenchido = passou pelo botao Comecar do aplicativo de campo.';

-- ---------------------------------------------------------------------
-- O QUE JA EXISTE GANHA CANAL, pelo que se pode PROVAR
--
-- Nao se chuta: quem tem `iniciado_em` passou pelo campo (so
-- `sureya_iniciar_lavagem` carimba aquilo). O resto foi registrado por
-- alguem no painel, que e `manual_adm`. A abertura de saldo veio do
-- caderno — `importacao`.
-- ---------------------------------------------------------------------
update public.servicos
   set canal = case when iniciado_em is not null then 'campo'::sureya_canal_registro
                    else 'manual_adm'::sureya_canal_registro end
 where canal is null and status = 'executado';

update public.conta_corrente cc
   set canal = case
     when cc.origem = 'abertura'::sureya_origem_lancamento then 'importacao'::sureya_canal_registro
     when cc.origem = 'competencia'::sureya_origem_lancamento then 'automatico'::sureya_canal_registro
     when s.iniciado_em is not null then 'campo'::sureya_canal_registro
     else 'manual_adm'::sureya_canal_registro
   end
  from (select id, servico_id from conta_corrente) x
  left join servicos s on s.id = x.servico_id
 where cc.id = x.id and cc.canal is null;

-- ---------------------------------------------------------------------
-- COMPETENCIA NUNCA MAIS NULA
--
-- O gatilho carimba a partir de `data` (ou de hoje) quando ninguem
-- informa. Vale para TODO caminho de escrita, inclusive os que ainda vao
-- nascer — que e o motivo de estar no banco e nao na aplicacao.
-- ---------------------------------------------------------------------
update public.conta_corrente
   set competencia = date_trunc('month', coalesce(data, created_at::date))::date
 where competencia is null;

create or replace function public.sureya_carimbar_competencia()
returns trigger
language plpgsql
as $$
begin
  if new.competencia is null then
    new.competencia := date_trunc('month', coalesce(new.data, current_date))::date;
  end if;
  -- A competencia e sempre o PRIMEIRO DIA do mes. Guardar 17/08 e 03/08
  -- como competencias diferentes faria "agosto" virar trinta grupos no
  -- relatorio.
  new.competencia := date_trunc('month', new.competencia)::date;
  return new;
end $$;

drop trigger if exists trg_cc_competencia on public.conta_corrente;
create trigger trg_cc_competencia
  before insert or update on public.conta_corrente
  for each row execute function public.sureya_carimbar_competencia();

comment on function public.sureya_carimbar_competencia() is
  'Carimba a competencia (primeiro dia do mes) em todo lancamento. A coluna existia desde a 0073 e estava NULA em 100% das linhas — sem ela nao ha relatorio por competencia.';

alter table public.conta_corrente
  alter column competencia set not null;

-- =====================================================================
-- O EXTRATO DE EVENTOS DA FAMILIA
--
-- Uma linha por evento, com as tres coisas que a conferencia pergunta:
-- QUANDO (competencia), POR QUE (origem) e POR ONDE ENTROU (canal). Mais
-- o ok por evento, que ja tinha casa (`conferido_em`) e nenhuma tela.
-- =====================================================================
create or replace view public.sureya_eventos_da_familia
with (security_invoker = true) as
select
  cc.id,
  cc.org_id,
  cc.familia_id,
  f.nome                                   as familia,
  resp.nome                                as responsavel,
  cc.competencia,
  cc.data,
  cc.tipo::text                            as tipo,
  cc.origem::text                          as origem,
  coalesce(cc.canal::text, 'nao marcado')  as canal,
  -- O sinal do dinheiro numa coluna so: debito e negativo. Deixar isso
  -- para a planilha e como o saldo de duas telas deixa de bater.
  case when cc.tipo::text = 'credito' then cc.valor else -cc.valor end as valor_com_sinal,
  cc.valor,
  cc.descricao,
  t.identificacao                          as jazigo,
  q.codigo                                 as quadra,
  cc.servico_id,
  s.data_executada,
  cc.conferido_em,
  cc.nota_conferencia,
  cc.estorna_lancamento is not null        as e_estorno
from conta_corrente cc
join familias f on f.id = cc.familia_id
left join clientes resp on resp.id = f.responsavel_id
left join tumulos t on t.id = cc.tumulo_id
left join quadras q on q.id = t.quadra_id
left join servicos s on s.id = cc.servico_id;

comment on view public.sureya_eventos_da_familia is
  'O extrato de cada familia com competencia, origem e canal — as tres perguntas da conferencia. Uma linha por lancamento.';

revoke all    on public.sureya_eventos_da_familia from public, anon;
grant  select on public.sureya_eventos_da_familia to authenticated, service_role;

-- =====================================================================
-- A LAVAGEM QUE ACONTECEU E NAO VIROU DINHEIRO
--
-- Duas de tres em producao. Nao e corrigida sozinha: o valor e uma
-- decisao (qual? a do jazigo? a do plano? cortesia?), e decisao de
-- dinheiro nao se toma por gatilho na madrugada.
--
-- `valor_sugerido` sai do jazigo, que e de onde a cobranca sairia se
-- tivesse saido — a tela oferece, a pessoa confirma.
-- =====================================================================
create or replace view public.sureya_lavagens_sem_cobranca
with (security_invoker = true) as
select
  s.id                        as servico_id,
  s.org_id,
  t.familia_id,
  f.nome                      as familia,
  t.id                        as tumulo_id,
  t.identificacao             as jazigo,
  q.codigo                    as quadra,
  (s.data_executada at time zone 'America/Sao_Paulo')::date as dia,
  date_trunc('month', (s.data_executada at time zone 'America/Sao_Paulo'))::date as competencia,
  coalesce(s.canal::text, case when s.iniciado_em is not null then 'campo' else 'manual_adm' end) as canal,
  s.valor                     as valor_do_servico,
  t.valor_lavagem             as valor_sugerido
from servicos s
join tumulos t on t.id = s.tumulo_id
left join familias f on f.id = t.familia_id
left join quadras q on q.id = t.quadra_id
where s.status = 'executado'
  and s.estornado_em is null
  and s.data_executada is not null
  and not exists (select 1 from conta_corrente cc where cc.servico_id = s.id);

comment on view public.sureya_lavagens_sem_cobranca is
  'Lavagem executada, nao estornada, e sem nenhum lancamento no razao. Em 23/08/2026 eram DUAS de tres — o servico aconteceu e a familia nunca foi cobrada, sem erro em lugar nenhum.';

revoke all    on public.sureya_lavagens_sem_cobranca from public, anon;
grant  select on public.sureya_lavagens_sem_cobranca to authenticated, service_role;

-- =====================================================================
-- O OK POR EVENTO
--
-- A coluna `conferido_em` existia desde a 0073 e nenhuma tela a
-- escrevia. Agora escreve — e o mesmo desenho do ok da familia: e um
-- fato com data e autor, e desfazer e sempre permitido.
-- =====================================================================
create or replace function public.sureya_conferir_evento(
  p_lancamento uuid, p_ok boolean default true, p_nota text default null
)
returns table(ok boolean, mensagem text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  if not exists (select 1 from conta_corrente where id = p_lancamento and org_id = v_org) then
    return query select false, 'lancamento nao encontrado'::text; return;
  end if;

  update conta_corrente
     set conferido_em = case when p_ok then now() else null end,
         conferido_por = case when p_ok then auth.uid() else null end,
         nota_conferencia = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_lancamento and org_id = v_org;

  return query select true, case when p_ok then 'conferido' else 'ok removido' end;
end $$;

comment on function public.sureya_conferir_evento(uuid, boolean, text) is
  'Carimba o ok num lancamento. A coluna conferido_em existia desde a 0073 e nenhuma tela a escrevia.';

revoke execute on function public.sureya_conferir_evento(uuid, boolean, text) from public, anon;
grant  execute on function public.sureya_conferir_evento(uuid, boolean, text) to authenticated, service_role;

-- =====================================================================
-- O RESUMO POR COMPETENCIA — o topo do relatorio
-- =====================================================================
create or replace view public.sureya_resumo_por_competencia
with (security_invoker = true) as
select
  cc.org_id,
  cc.competencia,
  count(*)                                                          as eventos,
  count(*) filter (where cc.conferido_em is not null)                as conferidos,
  sum(case when cc.tipo::text = 'debito'  then cc.valor else 0 end)  as debitos,
  sum(case when cc.tipo::text = 'credito' then cc.valor else 0 end)  as creditos,
  sum(case when cc.tipo::text = 'credito' then cc.valor else -cc.valor end) as resultado,
  count(distinct cc.familia_id)                                      as familias,
  count(*) filter (where cc.canal = 'campo')       as do_campo,
  count(*) filter (where cc.canal = 'manual_adm')  as do_painel,
  count(*) filter (where cc.canal = 'automatico')  as automaticos,
  count(*) filter (where cc.canal = 'importacao')  as importados,
  count(*) filter (where cc.canal is null)         as sem_canal
from conta_corrente cc
group by cc.org_id, cc.competencia;

comment on view public.sureya_resumo_por_competencia is
  'O mes fechado em numeros, com a quebra por canal — quantos vieram do campo, quantos alguem digitou, quantos a esteira gerou.';

revoke all    on public.sureya_resumo_por_competencia from public, anon;
grant  select on public.sureya_resumo_por_competencia to authenticated, service_role;
