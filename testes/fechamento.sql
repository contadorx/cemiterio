-- ============================================================================
-- O FUNIL E O FECHAMENTO, PROVADOS A CADA COMMIT
--
-- O que precisa ser verdade aqui nao e "a funcao roda". E que ela RECUSE. Um
-- fechamento que sempre aceita e um botao decorativo — e o estrago dele nao
-- aparece no dia, aparece quando o numero fechado muda depois.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values ('f1f1f1f1-0000-0000-0000-000000000001','fech@sureya.test')
  on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','f1f1f1f1-0000-0000-0000-000000000001', false);
insert into orgs (id, nome) values ('f1f1f1f1-0000-0000-0000-000000000002','CI Fechamento')
  on conflict do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('f1f1f1f1-0000-0000-0000-000000000002','f1f1f1f1-0000-0000-0000-000000000001','admin',true)
  on conflict do nothing;
insert into familias (id, org_id, nome, modo_cobranca)
  values ('f1f1f1f1-0000-0000-0000-000000000003','f1f1f1f1-0000-0000-0000-000000000002','Fam Fech','consumo')
  on conflict (id) do nothing;
insert into clientes (id, org_id, nome, telefone, familia_id, responsavel_financeiro)
  values ('f1f1f1f1-0000-0000-0000-000000000004','f1f1f1f1-0000-0000-0000-000000000002',
          'Resp Fech','5511900000010','f1f1f1f1-0000-0000-0000-000000000003', true)
  on conflict (id) do nothing;

create or replace function ci4(nome text, ok boolean, detalhe text default '') returns void
language plpgsql as $$
begin
  if not ok then raise exception 'FECHAMENTO FALHOU — % %', nome, detalhe; end if;
  raise notice '  ok  %', nome;
end $$;

-- Uma competencia no passado, para o mes ja ter acabado.
create or replace function ci4_comp() returns date language sql as $$
  select (date_trunc('month', current_date) - interval '2 months')::date $$;

-- ---------------------------------------------------------------- 1. em andamento
-- O mes corrente nao fecha nem forcando: forcar existe para aceitar pendencia,
-- nao para inventar o resultado de um mes que ainda esta correndo.
do $$
begin
  begin
    perform sureya_fechar_competencia(date_trunc('month', current_date)::date, null, true);
    raise exception 'FECHAMENTO FALHOU — o mes corrente fechou';
  exception when others then
    if sqlerrm not like '%competencia_em_andamento%' then raise; end if;
  end;
  perform ci4('mes em andamento nao fecha, nem forcando', true);
end $$;

-- ---------------------------------------------------------------- 2. recusa
-- Uma limpeza executada e nao cobrada tem de barrar o fechamento.
insert into cemiterios (id, org_id, nome)
  values ('f1f1f1f1-0000-0000-0000-000000000005','f1f1f1f1-0000-0000-0000-000000000002','C')
  on conflict (id) do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo)
  values ('f1f1f1f1-0000-0000-0000-000000000006','f1f1f1f1-0000-0000-0000-000000000002',
          'f1f1f1f1-0000-0000-0000-000000000005','Q1') on conflict (id) do nothing;
insert into tumulos (id, org_id, cliente_id, familia_id, quadra_id, identificacao, valor_lavagem)
  values ('f1f1f1f1-0000-0000-0000-000000000007','f1f1f1f1-0000-0000-0000-000000000002',
          'f1f1f1f1-0000-0000-0000-000000000004','f1f1f1f1-0000-0000-0000-000000000003',
          'f1f1f1f1-0000-0000-0000-000000000006','Q1-R1-001', 55) on conflict (id) do nothing;
insert into servicos (id, org_id, cliente_id, tumulo_id, status, data_prevista, data_executada)
  values ('f1f1f1f1-0000-0000-0000-000000000008','f1f1f1f1-0000-0000-0000-000000000002',
          'f1f1f1f1-0000-0000-0000-000000000004','f1f1f1f1-0000-0000-0000-000000000007',
          'executado', ci4_comp(), (ci4_comp() + 5))
  on conflict (id) do nothing;

select ci4('a pendencia e vista: limpeza sem cobranca',
           (select count(*) from sureya_pendencias_da_competencia(ci4_comp())
             where tipo = 'lavagem_sem_cobranca') = 1);
select ci4('a pendencia diz ONDE resolver',
           (select onde_resolver from sureya_pendencias_da_competencia(ci4_comp())
             where tipo = 'lavagem_sem_cobranca') is not null);
select ci4('o funil nao marca `pronto para fechar`',
           (select quantidade from sureya_funil(ci4_comp()) where etapa = 'pronto para fechar') = 0);

do $$
begin
  begin
    perform sureya_fechar_competencia(ci4_comp());
    raise exception 'FECHAMENTO FALHOU — fechou com limpeza nao cobrada';
  exception when others then
    if sqlerrm not like '%ha_pendencias%' then raise; end if;
    -- A MENSAGEM TEM DE DIZER O QUE FALTA. "Nao foi possivel" manda procurar.
    if sqlerrm not like '%Limpezas executadas%' then
      raise exception 'FECHAMENTO FALHOU — a recusa nao disse o motivo: %', sqlerrm;
    end if;
  end;
  perform ci4('fechar e RECUSADO, e a recusa diz o que falta', true);
end $$;

-- ---------------------------------------------------------------- 3. resolve
select sureya_lancar('f1f1f1f1-0000-0000-0000-000000000004','debito',55,'lavagem',
                     'Limpeza executada', (ci4_comp() + 5), 'confirmado',
                     'f1f1f1f1-0000-0000-0000-000000000008');
select ci4('resolvida a pendencia, a lista fica vazia',
           (select count(*) from sureya_pendencias_da_competencia(ci4_comp())) = 0);
select ci4('o funil marca `pronto para fechar`',
           (select quantidade from sureya_funil(ci4_comp()) where etapa = 'pronto para fechar') = 1);
select ci4('o funil ve a familia em aberto',
           (select quantidade from sureya_funil(ci4_comp()) where etapa = 'em aberto') = 1);

-- ---------------------------------------------------------------- 4. fecha
select ci4('fecha e guarda o retrato',
           (select sureya_fechar_competencia(ci4_comp())) is not null);
select ci4('o retrato do fechamento tem o total cobrado',
           (select total_cobrado from competencias
             where competencia = ci4_comp() and reaberta_em is null) = 55);
select ci4('o funil marca `fechado`',
           (select quantidade from sureya_funil(ci4_comp()) where etapa = 'fechado') = 1);
select ci4('depois de fechado, `pronto para fechar` sai',
           (select quantidade from sureya_funil(ci4_comp()) where etapa = 'pronto para fechar') = 0);

-- ---------------------------------------------------------------- 5. duas vezes
do $$
begin
  begin
    perform sureya_fechar_competencia(ci4_comp());
    raise exception 'FECHAMENTO FALHOU — fechou o mesmo mes duas vezes';
  exception when others then
    if sqlerrm not like '%ja_fechada%' then raise; end if;
  end;
  perform ci4('o mesmo mes nao fecha duas vezes', true);
end $$;

-- ---------------------------------------------------------------- 6. reabre
do $$
begin
  begin
    perform sureya_reabrir_competencia(ci4_comp(), '');
    raise exception 'FECHAMENTO FALHOU — reabriu sem motivo';
  exception when others then
    if sqlerrm not like '%motivo_obrigatorio%' then raise; end if;
  end;
  perform ci4('reabrir exige motivo', true);
end $$;
select ci4('reabre com motivo, e o motivo fica gravado',
           (select sureya_reabrir_competencia(ci4_comp(), 'valor errado'))
           and (select motivo_reabertura from competencias where competencia = ci4_comp()) = 'valor errado');
select ci4('reaberta, o funil deixa de marcar `fechado`',
           (select quantidade from sureya_funil(ci4_comp()) where etapa = 'fechado') = 0);

-- ---------------------------------------------------------------- limpeza
delete from competencias   where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from conta_corrente where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from servicos       where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from tumulos        where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from quadras        where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from cemiterios     where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from clientes       where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from familias       where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from membros        where org_id='f1f1f1f1-0000-0000-0000-000000000002';
delete from orgs           where id='f1f1f1f1-0000-0000-0000-000000000002';
delete from auth.users     where id='f1f1f1f1-0000-0000-0000-000000000001';
drop function ci4(text, boolean, text);
drop function ci4_comp();
