-- ============================================================================
-- PARAR E RETOMAR (0119)
--
-- O risco aqui tem nome: cobrar de quem pediu para parar. E o irmao dele, mais
-- discreto: retomar e a familia perder o periodo que ja tinha contratado.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci20(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'PAUSA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('aaaaaaaa-0000-0000-0000-000000000020','CI Pausa', 10)
on conflict do nothing;
insert into cemiterios (id, org_id, nome)
values ('dddddddd-0000-0000-0000-000000000020','aaaaaaaa-0000-0000-0000-000000000020','CI Cem Pausa')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
values ('eeeeeeee-0000-0000-0000-000000000020','aaaaaaaa-0000-0000-0000-000000000020',
        'dddddddd-0000-0000-0000-000000000020','Q Pausa', 1)
on conflict do nothing;

insert into familias (id, org_id, nome, contratado) values
  ('ff000000-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000020','Familia Que Parou', true)
on conflict do nothing;

-- O CASO MAGDA, com pausa: pos-pago a cada 2 meses, desde julho, cobra em set.
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, contratado,
                     valor_mensal, inicio_cobranca, periodo_inicio, proxima_cobranca,
                     meses_entre_cobrancas, cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000020',
        'eeeeeeee-0000-0000-0000-000000000020','ff000000-0000-0000-0000-000000000201','CI-PAUSA-01',
        true, 100, '2026-07-01', '2026-07-01', '2026-09-01', 2, true)
on conflict do nothing;

-- Antes de parar, o ciclo jul-ago fecha normalmente.
select sureya_cobrar_competencias('2026-08-23'::date, 'aaaaaaaa-0000-0000-0000-000000000020');

select ci20('antes de parar, julho e agosto sao cobrados',
  (select count(*) = 2 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000201' and origem='competencia'),
  'o cenario precisa comecar de um contrato que estava andando');

select ci20('e a ancora ja aponta para o proximo periodo',
  (select periodo_inicio = '2026-09-01'::date and proxima_cobranca = '2026-11-01'::date
     from tumulos where id='11100000-0000-0000-0000-000000000201'),
  'as duas andam JUNTAS quando o ciclo fecha — e sao gravadas, nao deduzidas');

-- ---------------------------------------------------------------------------
-- 1 · PARAR
-- ---------------------------------------------------------------------------
-- Uma lavagem e uma entrega de flores marcadas para depois da parada.
insert into servicos (id, org_id, tumulo_id, data_prevista, status)
values ('55500000-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000020',
        '11100000-0000-0000-0000-000000000201', '2026-09-15', 'agendado')
on conflict do nothing;

insert into servicos_extras (id, org_id, nome, categoria, preco, custo, unidade)
values ('99900000-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000020',
        'Flores frescas','flores', 35, 18, 'buque')
on conflict do nothing;
insert into assinaturas_extras
  (id, org_id, tumulo_id, familia_id, extra_id, quantidade, dia_semana, semanas,
   cobranca, preco_unit, custo_unit, inicio)
values ('a5510000-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000020',
        '11100000-0000-0000-0000-000000000201','ff000000-0000-0000-0000-000000000201',
        '99900000-0000-0000-0000-000000000201', 1, 6::smallint, '{-1}'::smallint[],
        'recorrente', 35, 18, '2026-07-01')
on conflict do nothing;

select * from sureya_gerar_entregas_extras('2026-10-31'::date, 'aaaaaaaa-0000-0000-0000-000000000020');

select ci20('a esteira tinha entregas marcadas',
  (select count(*) >= 2 from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000201' and status='prevista'),
  'o cenario precisa ter o que cancelar');

-- MOTIVO E OBRIGATORIO.
do $$
declare v_erro text;
begin
  begin
    perform sureya_parar_servico('11100000-0000-0000-0000-000000000201', '  ', '2026-09-01');
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform ci20('parar SEM MOTIVO e recusado',
    v_erro = 'motivo_obrigatorio',
    'parado sem motivo, meses depois, e uma pergunta que a casa nao sabe responder');
end $$;

select * from sureya_parar_servico('11100000-0000-0000-0000-000000000201',
  'a familia pediu para parar ate resolver o inventario', '2026-09-01');

select ci20('a pausa fica registrada com data e motivo',
  (select fim is null and inicio = '2026-09-01'::date and motivo like 'a familia pediu%'
     from pausas_tumulo where tumulo_id='11100000-0000-0000-0000-000000000201'),
  'parar nao pode ser apagar o contrato: e um estado com data');

select ci20('a lavagem agendada sai da agenda',
  (select status = 'cancelado' from servicos
    where id='55500000-0000-0000-0000-000000000201'),
  'a Nina iria ao jazigo que a familia pediu para nao tocar, sem ter como saber');

-- SO O QUE VEM DEPOIS DA PARADA. O sabado que ja passou e nao foi marcado e
-- outro assunto — pendencia de registro, nao efeito da pausa.
select ci20('e a esteira das flores tambem, da parada para a frente',
  (select count(*) = 0 from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000201'
      and status='prevista' and data_prevista >= '2026-09-01'),
  'a previsao de compra continuaria contando o buque dele no sabado');

-- DUAS PAUSAS ABERTAS EMPURRARIAM O CONTRATO DUAS VEZES.
do $$
declare v_erro text;
begin
  begin
    perform sureya_parar_servico('11100000-0000-0000-0000-000000000201', 'de novo', '2026-09-05');
    v_erro := 'passou';
  exception when others then v_erro := 'recusado';
  end;
  perform ci20('parar duas vezes e recusado',
    v_erro = 'recusado',
    'duas pausas abertas seriam duas contagens de meses parados');
end $$;

-- ---------------------------------------------------------------------------
-- 2 · PARADO NAO E COBRADO
-- ---------------------------------------------------------------------------
select ci20('a funcao sabe dizer que esta parado',
  sureya_tumulo_parado('11100000-0000-0000-0000-000000000201', '2026-09-15'::date),
  '"esta parado?" tem de ter UMA resposta, e todo mundo pergunta a ela');

select sureya_cobrar_competencias('2026-11-20'::date, 'aaaaaaaa-0000-0000-0000-000000000020');

select ci20('o cobrador NAO cobra quem esta parado',
  (select count(*) = 2 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000201' and origem='competencia'),
  'ela continuaria devendo por um servico que pediu para nao receber');

select ci20('e a ancora nao andou durante a parada',
  (select periodo_inicio = '2026-09-01'::date and proxima_cobranca = '2026-11-01'::date
     from tumulos where id='11100000-0000-0000-0000-000000000201'),
  'o relogio do contrato CONGELA — se andasse, ela perderia o periodo contratado');

-- E o gerador de flores nao recria o que a parada cancelou.
select * from sureya_gerar_entregas_extras('2026-12-31'::date, 'aaaaaaaa-0000-0000-0000-000000000020');
select ci20('o gerador de flores nao ressuscita a entrega cancelada',
  (select count(*) = 0 from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000201'
      and status='prevista' and data_prevista >= '2026-09-01'),
  'amanha o cron desfaria a parada de hoje, em silencio');

-- ---------------------------------------------------------------------------
-- 3 · RETOMAR — O RELOGIO ANDA O TANTO QUE FICOU PARADO
-- ---------------------------------------------------------------------------
select * from sureya_retomar_servico('11100000-0000-0000-0000-000000000201', '2026-11-01'::date,
                                     'a familia pediu para voltar');

select ci20('a pausa fecha com a data da retomada',
  (select fim = '2026-11-01'::date from pausas_tumulo
    where tumulo_id='11100000-0000-0000-0000-000000000201'),
  'sem a data de fim, o historico nao responde por quanto tempo ficou parado');

-- Dois meses parados (setembro e outubro): as duas datas andam dois.
select ci20('a proxima cobranca anda DOIS meses',
  (select proxima_cobranca = '2027-01-01'::date from tumulos
    where id='11100000-0000-0000-0000-000000000201'),
  'era novembro; com dois meses parados, vira janeiro');

select ci20('e a ancora do periodo anda os mesmos dois',
  (select periodo_inicio = '2026-11-01'::date from tumulos
    where id='11100000-0000-0000-0000-000000000201'),
  'as duas TEM de andar juntas, ou o periodo cobra meses que nao aconteceram');

-- E AGORA O PERIODO E NOVEMBRO-DEZEMBRO, cobrado em janeiro.
select sureya_cobrar_competencias('2026-12-20'::date, 'aaaaaaaa-0000-0000-0000-000000000020');

select ci20('novembro e dezembro entram, e setembro e outubro NAO',
  (select count(*) = 4
      and not exists (select 1 from conta_corrente
                       where tumulo_id='11100000-0000-0000-0000-000000000201'
                         and competencia in ('2026-09-01','2026-10-01'))
     from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000201' and origem='competencia'),
  'os meses parados nao podem voltar pela porta dos fundos quando o servico retoma');

select ci20('e os dois novos vencem em JANEIRO',
  (select bool_and(data = '2027-01-10'::date) from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000201'
      and competencia in ('2026-11-01','2026-12-01')),
  'a familia recebeu os dois meses e paga na data que o congelamento empurrou');

-- RETOMAR SEM ESTAR PARADO EMPURRARIA O CONTRATO DE GRACA.
do $$
declare v_erro text;
begin
  begin
    perform sureya_retomar_servico('11100000-0000-0000-0000-000000000201', '2026-12-01'::date, null);
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform ci20('retomar duas vezes e recusado',
    v_erro = 'nao_estava_parado',
    'o segundo clique empurraria a cobranca mais uma vez, de graca para ela e caro para a casa');
end $$;

-- ---------------------------------------------------------------------------
-- 4 · PARAR E VOLTAR NO MESMO MES NAO EMPURRA NADA
-- ---------------------------------------------------------------------------
-- Nao houve mes sem servico: empurrar o contrato aqui daria um mes de graca.
--
-- Depois de fechar o ciclo nov-dez em dezembro, a proxima cobranca ja andou
-- para marco (jan-fev, cobrado em marco). E dela que a pausa curta nao pode
-- tirar nem por um mes.
select ci20('o ciclo nov-dez fechou e a cobranca seguinte e marco',
  (select proxima_cobranca = '2027-03-01'::date and periodo_inicio = '2027-01-01'::date
     from tumulos where id='11100000-0000-0000-0000-000000000201'),
  'as duas andam juntas quando o ciclo fecha, tambem depois de uma pausa');

select * from sureya_parar_servico('11100000-0000-0000-0000-000000000201',
  'viagem da familia', '2027-02-10');
select * from sureya_retomar_servico('11100000-0000-0000-0000-000000000201', '2027-02-20'::date, null);

select ci20('parar dia 10 e voltar dia 20 do mesmo mes nao mexe na cobranca',
  (select proxima_cobranca = '2027-03-01'::date and periodo_inicio = '2027-01-01'::date
     from tumulos where id='11100000-0000-0000-0000-000000000201'),
  'nao houve mes sem servico: empurrar aqui seria dar um mes de graca');

select ci20('mas a parada curta fica registrada do mesmo jeito',
  (select count(*) = 2 from pausas_tumulo
    where tumulo_id='11100000-0000-0000-0000-000000000201'),
  'o historico responde "quantas vezes essa familia ja pediu para parar"');
