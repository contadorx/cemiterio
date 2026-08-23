-- ============================================================================
-- A LISTA E A FICHA DIZEM A MESMA COISA (0106)
--
-- O caso real: a familia BRUNIERA, com a ficha dizendo "conferida em 23/08,
-- nada obrigatorio faltando", contrato completo, R$30/mes, toda semana, e as
-- duas datas preenchidas — e a LISTA dizendo "iniciar controle · sem plano ·
-- Sem data de lavagem · Sem data de cobranca".
--
-- Nada estava quebrado nos dados: as duas telas faziam contas DIFERENTES sobre
-- os mesmos fatos. A lista perguntava a FAMILIA o valor, a frequencia e o
-- inicio; a D-24 moveu os tres para o TUMULO.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci17(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'ETAPA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000017','CI Etapa')
on conflict do nothing;
insert into cemiterios (id, org_id, nome)
values ('dddddddd-0000-0000-0000-000000000017','aaaaaaaa-0000-0000-0000-000000000017','CI Cem Etapa')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
values ('eeeeeeee-0000-0000-0000-000000000017','aaaaaaaa-0000-0000-0000-000000000017',
        'dddddddd-0000-0000-0000-000000000017','Q Etapa', 1)
on conflict do nothing;

-- O CASO BRUNIERA, reproduzido: contrato completo no TUMULO e NADA na familia.
-- E o ponto do arquivo — se alguem voltar a ler `familias.valor_mensal`, este
-- teste quebra.
insert into familias (id, org_id, nome, regime, contratado, conferida_em)
values ('ff000000-0000-0000-0000-000000000171','aaaaaaaa-0000-0000-0000-000000000017',
        'CI Bruniera','contrato', true, now())
on conflict do nothing;

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, periodicidade, proxima_cobranca, inicio_agendamento)
values ('11100000-0000-0000-0000-000000000171','aaaaaaaa-0000-0000-0000-000000000017',
        'eeeeeeee-0000-0000-0000-000000000017','ff000000-0000-0000-0000-000000000171','CI-ET-A',
        true, 30, 'semanal', (date_trunc('month', current_date) + interval '1 month')::date,
        current_date + 8)
on conflict do nothing;

select ci17('familia com contrato COMPLETO no tumulo nao e "sem contrato"',
  (select etapa <> 'sem_contrato' from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000171'),
  'a conta voltou a perguntar a FAMILIA o que mora no TUMULO — o caso BRUNIERA');

select ci17('e sem limpeza registrada ela esta PRONTA',
  (select etapa = 'pronta' from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000171'),
  'contrato completo e nenhuma limpeza deveria ser "pronta"');

select ci17('nao ha nada faltando para ela',
  (select falta is null from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000171'),
  'a lista continua acusando pendencia numa familia completa');

select ci17('o ritmo vem do tumulo, nao da tabela planos',
  (select 'semanal' = any(cadencias) from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000171'),
  'voltou a ler `planos`, que esta vazia para as familias novas — o "sem plano"');

select ci17('e as duas datas tambem',
  (select proxima_lavagem is not null and proxima_cobranca is not null
     from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000171'),
  'o "Sem data de lavagem · Sem data de cobranca" voltou');

-- O RITMO CRU, e nao o texto humanizado: o seletor da tela manda "semanal".
select ci17('a cadencia sai como o valor que o filtro manda',
  (select cadencias @> array['semanal']
     from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000171'),
  'se sair humanizada ("toda semana"), o filtro por periodicidade nunca casa');

-- ---------------------------------------------------------------------------
-- O REGIME MANDA
-- ---------------------------------------------------------------------------
-- Avulso nao tem mensalidade para faltar. Exigir contrato de quem escolheu
-- avulso dava a ela uma pendencia que nunca se resolveria.
insert into familias (id, org_id, nome, regime)
values ('ff000000-0000-0000-0000-000000000172','aaaaaaaa-0000-0000-0000-000000000017',
        'CI Avulsa','avulso')
on conflict do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, contratado, valor_lavagem)
values ('11100000-0000-0000-0000-000000000172','aaaaaaaa-0000-0000-0000-000000000017',
        'eeeeeeee-0000-0000-0000-000000000017','ff000000-0000-0000-0000-000000000172','CI-ET-B',
        false, 40)
on conflict do nothing;

select ci17('avulso com preco da limpeza esta em ordem',
  (select contrato_ok from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000172'),
  'cobrou contrato de quem escolheu avulso');

-- E avulso SEM preco tem uma pendencia, mas a certa.
update tumulos set valor_lavagem = null where id='11100000-0000-0000-0000-000000000172';
select ci17('avulso sem preco falta o VALOR DA LIMPEZA, nao o contrato',
  (select falta ilike '%avulsa%' from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000172'),
  'a pendencia do avulso e o preco da ida, nao a mensalidade');

-- ---------------------------------------------------------------------------
-- CONTRATO PELA METADE CONTINUA SENDO PENDENCIA
-- ---------------------------------------------------------------------------
-- Este e o caso das 3 familias reais achadas em producao: `regime=contrato`,
-- valor na FAMILIA e NULO no tumulo. Elas nunca seriam cobradas pela 0104, e a
-- lista antiga as chamava de "operacional" — escondendo o problema.
insert into familias (id, org_id, nome, regime, contratado, valor_mensal)
values ('ff000000-0000-0000-0000-000000000173','aaaaaaaa-0000-0000-0000-000000000017',
        'CI Valor No Lugar Errado','contrato', true, 100)
on conflict do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, periodicidade, proxima_cobranca)
values ('11100000-0000-0000-0000-000000000173','aaaaaaaa-0000-0000-0000-000000000017',
        'eeeeeeee-0000-0000-0000-000000000017','ff000000-0000-0000-0000-000000000173','CI-ET-C',
        true, null, 'semanal', current_date)
on conflict do nothing;

select ci17('valor so na familia NAO conta como contrato',
  (select etapa = 'sem_contrato' from sureya_etapas_das_familias('aaaaaaaa-0000-0000-0000-000000000017')
    where familia_id='ff000000-0000-0000-0000-000000000173'),
  'quem tem valor so no lugar antigo nunca sera cobrado — a lista tem de acusar');

select ci17('e o cobrador realmente nao a cobra',
  (select lancados = 0 from sureya_cobrar_competencias(current_date, 'aaaaaaaa-0000-0000-0000-000000000017')),
  'cobrou sem valor no tumulo, ou deixou de cobrar quem esta completo');
