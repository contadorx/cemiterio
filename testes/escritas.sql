-- ============================================================================
-- AS ESCRITAS DE DINHEIRO, PROVADAS A CADA COMMIT
--
-- Depois da 0073 nenhuma funcao escreve em `movimentos`. Este arquivo exercita
-- as portas de dinheiro uma a uma, num banco reconstruido do zero, e cobra o
-- efeito — nao a ausencia de erro.
--
-- Roda dentro de `migrar-limpo.sh`, junto com `espelho.sql`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

-- UMA SESSAO DE ADMIN DE VERDADE.
--
-- `current_org_id()` le `membros` por `auth.uid()` e exige membro ATIVO (0055).
-- Daria para rodar com auth.uid() nulo e escapar da guarda `is_admin()` de cada
-- funcao — mas ai o teste provaria menos do que a producao faz. Com sessao, as
-- guardas da 0060 tambem entram no caminho.
insert into auth.users (id, email)
  values ('f0f0f0f0-0000-0000-0000-000000000001','ci@sureya.test')
  on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','f0f0f0f0-0000-0000-0000-000000000001', false);

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000001','CI Escritas')
  on conflict do nothing;
insert into familias (id, org_id, nome)
  values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Familia Escritas')
  on conflict (id) do nothing;
insert into clientes (id, org_id, nome, telefone, familia_id, responsavel_financeiro)
  values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'Pai','5511900000001','bbbbbbbb-0000-0000-0000-000000000001', true)
  on conflict (id) do nothing;
insert into clientes (id, org_id, nome, telefone, familia_id, responsavel_financeiro)
  values ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',
          'Filha','5511900000002','bbbbbbbb-0000-0000-0000-000000000001', false)
  on conflict (id) do nothing;

insert into membros (org_id, user_id, papel, ativo)
  values ('aaaaaaaa-0000-0000-0000-000000000001','f0f0f0f0-0000-0000-0000-000000000001','admin', true)
  on conflict do nothing;

create or replace function ci2(nome text, real_ numeric, esperado numeric) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'ESCRITAS FALHOU — %: veio %, esperado %', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

/** Mesma coisa da ci2, para quando a resposta e texto (uma sequencia). */
create or replace function ci2t(nome text, real_ text, esperado text) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'ESCRITAS FALHOU — %: veio %, esperado %', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

create or replace function ci2_saldo() returns numeric language sql as $$
  select coalesce(sum(case when tipo::text='credito' then valor else -valor end),0)
    from conta_corrente
   where status_conc::text not in ('rejeitado','a_conferir') $$;

create or replace function ci2_zera() returns void language sql as $$
  delete from quitacoes where true;
  delete from conta_corrente where true;
  delete from movimentos where true;
$$;

-- ---------------------------------------------------------------- pagamento
select ci2_zera();
select sureya_registrar_pagamento_manual('cccccccc-0000-0000-0000-000000000001', 150, '2026-08-10');
select ci2('pagamento manual entra no razao da familia', ci2_saldo(), 150);
select ci2('pagamento nao toca no razao antigo', (select count(*) from movimentos), 0);
select ci2('pagamento e da familia, com autoria da pessoa',
           (select count(*) from conta_corrente
             where familia_id='bbbbbbbb-0000-0000-0000-000000000001'
               and cliente_id='cccccccc-0000-0000-0000-000000000001'), 1);

-- A FILHA paga: a mesma familia, o mesmo saldo.
select sureya_pagamento_avulso('cccccccc-0000-0000-0000-000000000002', 50, '2026-08-11');
select ci2('pagamento da filha soma na MESMA familia', ci2_saldo(), 200);

-- ---------------------------------------------------------------- abertura
-- Os dois defeitos que a 0073 corrigiu, cobrados aqui.
select ci2_zera();
select sureya_saldo_abertura('cccccccc-0000-0000-0000-000000000001', -500, '2026-08-01');
select ci2('abertura grava origem `abertura`, nao `ajuste`',
           (select count(*) from conta_corrente where origem::text='abertura'), 1);
select ci2('abertura de 500 devendo', ci2_saldo(), -500);

-- corrigir pela ficha do PAI
select sureya_saldo_abertura('cccccccc-0000-0000-0000-000000000001', -300, '2026-08-01');
select ci2('corrigir a abertura substitui, nao soma', ci2_saldo(), -300);

-- corrigir pela ficha da FILHA: e a mesma familia, tem de substituir tambem
select sureya_saldo_abertura('cccccccc-0000-0000-0000-000000000002', -250, '2026-08-01');
select ci2('abertura e por FAMILIA: a ficha da filha substitui a do pai', ci2_saldo(), -250);
select ci2('uma abertura so por familia',
           (select count(*) from conta_corrente where origem::text='abertura'), 1);

-- zero apaga
select sureya_saldo_abertura('cccccccc-0000-0000-0000-000000000001', 0, '2026-08-01');
select ci2('abertura zero apaga a anterior', ci2_saldo(), 0);

-- ---------------------------------------------------------------- banco
select ci2_zera();
insert into entradas_banco (id, org_id, valor, data, remetente)
  values ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          80, '2026-08-12', 'JOAO')
  on conflict (id) do nothing;
select sureya_identificar_entrada('dddddddd-0000-0000-0000-000000000001',
                                  'cccccccc-0000-0000-0000-000000000001');
select ci2('identificar entrada credita a familia', ci2_saldo(), 80);
select ci2('a entrada guarda o lancamento (chave nova)',
           (select count(*) from entradas_banco
             where id='dddddddd-0000-0000-0000-000000000001' and lancamento_id is not null), 1);

-- desfazer tem de sumir com o credito, senao a familia parece ter pago
select sureya_desidentificar_entrada('dddddddd-0000-0000-0000-000000000001');
select ci2('desidentificar apaga o credito', ci2_saldo(), 0);
select ci2('desidentificar solta a entrada',
           (select count(*) from entradas_banco
             where id='dddddddd-0000-0000-0000-000000000001' and lancamento_id is null), 1);

-- ---------------------------------------------------------------- funil
-- Um debito, um pagamento que o quita em parte: o funil tem de mostrar o resto.
select ci2_zera();
select sureya_lancar('cccccccc-0000-0000-0000-000000000001','debito',100,'lavagem','Limpeza','2026-08-05');
select ci2('funil mostra o debito em aberto',
           (select em_aberto from sureya_debitos_em_aberto('cccccccc-0000-0000-0000-000000000001')), 100);
select ci2('funil responde pela FAMILIA (a filha ve o mesmo)',
           (select em_aberto from sureya_debitos_em_aberto('cccccccc-0000-0000-0000-000000000002')), 100);

select sureya_entrada_identificada(60, '2026-08-13', 'cccccccc-0000-0000-0000-000000000001',
                                   'MARIA', 'ID-1', null, null);
select ci2('pagamento parcial abate o debito no funil',
           (select em_aberto from sureya_debitos_em_aberto('cccccccc-0000-0000-0000-000000000001')), 40);
select ci2('quitacao gravada', (select count(*) from quitacoes), 1);
select ci2('saldo depois do parcial', ci2_saldo(), -40);

-- a mesma entrada chegando de novo nao pode lancar duas vezes
select sureya_entrada_identificada(60, '2026-08-13', 'cccccccc-0000-0000-0000-000000000001',
                                   'MARIA', 'ID-1', null, null);
select ci2('mesma entrada bancaria duas vezes nao duplica', ci2_saldo(), -40);

-- abertura NAO entra no funil de quitacao: e saldo consolidado, nao debito a casar
select sureya_saldo_abertura('cccccccc-0000-0000-0000-000000000001', -900, '2026-08-01');
select ci2('abertura fica fora do funil de quitacao',
           (select count(*) from sureya_debitos_em_aberto('cccccccc-0000-0000-0000-000000000001')), 1);

-- ---------------------------------------------------------------- extras
select ci2_zera();
insert into pedidos_extras (id, org_id, cliente_id, nome, quantidade, total, status)
  values ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001','Vaso de flores', 2, 70, 'pedido')
  on conflict (id) do nothing;
select sureya_entregar_extra('eeeeeeee-0000-0000-0000-000000000001', null);
select ci2('entregar extra debita a familia', ci2_saldo(), -70);
select ci2('o pedido guarda o lancamento',
           (select count(*) from pedidos_extras
             where id='eeeeeeee-0000-0000-0000-000000000001' and lancamento_id is not null), 1);
-- entregar de novo nao cobra de novo
select sureya_entregar_extra('eeeeeeee-0000-0000-0000-000000000001', null);
select ci2('entregar duas vezes nao cobra duas vezes', ci2_saldo(), -70);

-- ---------------------------------------------------------------- conferencia
select ci2_zera();
select sureya_lancar('cccccccc-0000-0000-0000-000000000001','credito',45,'pagamento',
                     'Comprovante','2026-08-14','a_conferir');
select ci2('comprovante a conferir nao e saldo', ci2_saldo(), 0);
update conta_corrente set status_conc='confirmado' where status_conc='a_conferir';
select ci2('conferido vira saldo', ci2_saldo(), 45);

-- ---------------------------------------------------------------- guardas
-- A porta unica recusa o que nao pode lancar.
do $$
begin
  begin
    perform sureya_lancar('cccccccc-0000-0000-0000-000000000001','debito',0,'ajuste','zero');
    raise exception 'ESCRITAS FALHOU — valor zero deveria ter sido recusado';
  exception when others then
    if sqlerrm not like '%valor_invalido%' then raise; end if;
  end;
  raise notice '  ok  a porta recusa valor zero';

  begin
    perform sureya_lancar('99999999-9999-9999-9999-999999999999','credito',10,'pagamento','fantasma');
    raise exception 'ESCRITAS FALHOU — cliente inexistente deveria ter sido recusado';
  exception when others then
    if sqlerrm not like '%cliente_nao_encontrado%' then raise; end if;
  end;
  raise notice '  ok  a porta recusa cliente que nao existe';
end $$;

-- O CONTRATO DE NOMES COM A ROTA.
-- `api/financeiro/entradas` le r_entrada / r_lancamento / r_quitados / r_sobrou.
-- Trocar um desses nomes nao quebra nada visivelmente: os campos chegam
-- `undefined` na rota e a tela mostra uma entrada sem id, em silencio.
do $$
declare r record;
begin
  select * into r from sureya_entrada_identificada(
    10, '2026-08-20', 'cccccccc-0000-0000-0000-000000000001', 'X', 'ID-CONTRATO', null, null);
  if r.r_entrada is null or r.r_lancamento is null
     or r.r_quitados is null or r.r_sobrou is null then
    raise exception 'ESCRITAS FALHOU — o contrato de nomes da entrada_identificada mudou';
  end if;
  raise notice '  ok  entrada_identificada devolve r_entrada/r_lancamento/r_quitados/r_sobrou';
end $$;

-- ---------------------------------------------------------------- lavagem
-- O debito da limpeza sai do razao antigo e passa a depender do MODO DE
-- COBRANCA da familia — a regra que antes emergia de uma colisao de indice
-- unico entre o espelho e a linha de valor zero da 0066.
select ci2_zera();
insert into cemiterios (id, org_id, nome)
  values ('a2000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','C')
  on conflict (id) do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo)
  values ('a3000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'a2000000-0000-0000-0000-000000000001','Q1')
  on conflict (id) do nothing;
insert into tumulos (id, org_id, cliente_id, familia_id, quadra_id, identificacao, valor_lavagem)
  values ('a4000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
          'a3000000-0000-0000-0000-000000000001','Q1-R1-001', 55)
  on conflict (id) do nothing;

-- modo CONSUMO: cada limpeza vira divida
update familias set modo_cobranca = 'consumo' where id='bbbbbbbb-0000-0000-0000-000000000001';
insert into servicos (id, org_id, cliente_id, tumulo_id, status, data_prevista)
  values ('a5000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
          'agendado', current_date)
  on conflict (id) do nothing;
select sureya_concluir_lavagem('a5000000-0000-0000-0000-000000000001','foto.jpg');
select ci2('modo consumo: a limpeza vira divida', ci2_saldo(), -55);
select ci2('a limpeza nao toca no razao antigo', (select count(*) from movimentos), 0);
select ci2('uma linha de lavagem por servico',
           (select count(*) from conta_corrente
             where servico_id='a5000000-0000-0000-0000-000000000001'), 1);
-- concluir de novo nao cobra de novo
select sureya_concluir_lavagem('a5000000-0000-0000-0000-000000000001','foto.jpg');
select ci2('concluir duas vezes nao cobra duas vezes', ci2_saldo(), -55);

-- modo COMPETENCIA: a limpeza e so registro; quem cobra e o fechamento do mes
select ci2_zera();
update familias set modo_cobranca = 'competencia' where id='bbbbbbbb-0000-0000-0000-000000000001';
insert into servicos (id, org_id, cliente_id, tumulo_id, status, data_prevista)
  values ('a5000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
          'agendado', current_date)
  on conflict (id) do nothing;
select sureya_concluir_lavagem('a5000000-0000-0000-0000-000000000002','foto.jpg');
select ci2('modo competencia: a limpeza NAO vira divida', ci2_saldo(), 0);
select ci2('mas fica registrada no extrato da familia',
           (select count(*) from conta_corrente
             where servico_id='a5000000-0000-0000-0000-000000000002'), 1);
update familias set modo_cobranca = 'consumo' where id='bbbbbbbb-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------- heranca
-- O JAZIGO IMPORTADO TEM DE NASCER COM FAMILIA.
--
-- `api/tumulos/importar` cria o jazigo so com `cliente_id`. Sem a heranca da
-- 0081, `conta_corrente.familia_id` vem nulo e a conclusao da lavagem falha
-- INTEIRA — nem a foto fica. Era o caminho de toda a importacao da carteira.
select ci2_zera();
insert into tumulos (id, org_id, quadra_id, cliente_id, identificacao, valor_lavagem)
  values ('a6000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'a3000000-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
          'IMPORTADO-01', 55)
  on conflict (id) do nothing;
select ci2('jazigo criado so com dono ja nasce com familia',
           (select count(*) from tumulos
             where id='a6000000-0000-0000-0000-000000000001' and familia_id is not null), 1);
select ci2('e a familia e a do dono',
           (select count(*) from tumulos t join clientes c on c.id=t.cliente_id
             where t.id='a6000000-0000-0000-0000-000000000001'
               and t.familia_id = c.familia_id), 1);

-- E a lavagem nele funciona ponta a ponta.
update familias set modo_cobranca='consumo' where id='bbbbbbbb-0000-0000-0000-000000000002';
insert into servicos (id, org_id, cliente_id, tumulo_id, status, data_prevista)
  values ('a7000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001',
          'agendado', current_date)
  on conflict (id) do nothing;
select sureya_concluir_lavagem('a7000000-0000-0000-0000-000000000001','foto.jpg');
select ci2('a lavagem no jazigo importado COBRA a familia', ci2_saldo(), -55);
select ci2('e o servico fica marcado como executado',
           (select count(*) from servicos
             where id='a7000000-0000-0000-0000-000000000001' and status::text='executado'), 1);

-- Trocar o dono leva a familia junto: `cliente_id` e `familia_id` discordando
-- significa que o dinheiro do jazigo vai para uma familia e quem responde e de
-- outra.
update tumulos set cliente_id='cccccccc-0000-0000-0000-000000000002'
 where id='a6000000-0000-0000-0000-000000000001';
select ci2('trocar o dono nao deixa a familia para tras',
           (select count(*) from tumulos t join clientes c on c.id=t.cliente_id
             where t.id='a6000000-0000-0000-0000-000000000001'
               and t.familia_id = c.familia_id), 1);

-- ---------------------------------------------------------------- ordem do dia
-- Reordenar a mao e priorizar um jazigo. O que precisa ser verdade nao e "a
-- funcao roda": e que reordenar TRES nao embaralhe os outros, e que priorizar
-- desca o resto em vez de empatar.
select ci2_zera();
delete from servicos where org_id='aaaaaaaa-0000-0000-0000-000000000001';
insert into servicos (id, org_id, cliente_id, tumulo_id, status, data_prevista, ordem_dia)
select ('a8000000-0000-0000-0000-00000000000' || i)::uuid,
       'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
       'a4000000-0000-0000-0000-000000000001','agendado', '2026-09-10', i
  from generate_series(1,5) i;

-- inverte so os tres primeiros
select sureya_reordenar_dia('2026-09-10', array[
  'a8000000-0000-0000-0000-000000000003',
  'a8000000-0000-0000-0000-000000000002',
  'a8000000-0000-0000-0000-000000000001']::uuid[]);

select ci2t('reordenar poe os listados em 1,2,3',
  (select string_agg(right(id::text,1), '' order by ordem_dia)
     from servicos where data_prevista='2026-09-10' and ordem_dia <= 3), '321');
select ci2t('e os NAO listados mantem a ordem relativa, depois',
  (select string_agg(right(id::text,1), '' order by ordem_dia)
     from servicos where data_prevista='2026-09-10' and ordem_dia > 3), '45');
select ci2('ninguem fica sem posicao',
  (select count(*) from servicos where data_prevista='2026-09-10' and ordem_dia is null), 0);
select ci2('e nao ha posicao repetida',
  (select count(distinct ordem_dia) from servicos where data_prevista='2026-09-10'), 5);

-- priorizar o ultimo
select sureya_priorizar_servico('a8000000-0000-0000-0000-000000000005');
select ci2('priorizado vira o primeiro',
  (select ordem_dia from servicos where id='a8000000-0000-0000-0000-000000000005'), 1);
select ci2('e o resto desceu, sem empate',
  (select count(distinct ordem_dia) from servicos where data_prevista='2026-09-10'), 5);
select ci2('o que era primeiro agora e segundo',
  (select ordem_dia from servicos where id='a8000000-0000-0000-0000-000000000003'), 2);

-- id de outro dia derruba a chamada inteira: renumerar dia errado so apareceria
-- na manha seguinte
do $$
begin
  begin
    perform sureya_reordenar_dia('2026-09-11', array['a8000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'ESCRITAS FALHOU — reordenou com id de outro dia';
  exception when others then
    if sqlerrm not like '%ids_de_outro_dia%' then raise; end if;
  end;
  raise notice '  ok  id de outro dia e recusado';
end $$;

-- ---------------------------------------------------------------- limpeza
select ci2_zera();
delete from pedidos_extras where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from entradas_banco where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from servicos where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from fila_liberacao where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from tumulos where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from quadras where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from cemiterios where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from clientes where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from familias where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from membros where org_id='aaaaaaaa-0000-0000-0000-000000000001';
delete from orgs where id='aaaaaaaa-0000-0000-0000-000000000001';
delete from auth.users where id='f0f0f0f0-0000-0000-0000-000000000001';
drop function ci2(text, numeric, numeric);
drop function ci2t(text, text, text);
drop function ci2_saldo();
drop function ci2_zera();
