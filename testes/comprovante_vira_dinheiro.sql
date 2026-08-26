-- ============================================================================
-- O COMPROVANTE VIRA DINHEIRO (0133)
--
-- O defeito que este arquivo guarda nao dava erro em lugar nenhum: a familia
-- pagava, a imagem era lida certo, o comprovante era gravado — e o razao
-- ficava vazio. Descoberto com um Pix de verdade, de R$ 40,00, em 26/08.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci33(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'COMPROVANTE FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('a0330000-0000-0000-0000-000000000001','CI Comprovante', 10) on conflict do nothing;
insert into familias (id, org_id, nome) values
  ('f0330000-0000-0000-0000-000000000001','a0330000-0000-0000-0000-000000000001','Familia CI Pix')
on conflict do nothing;
insert into clientes (id, org_id, familia_id, nome, telefone) values
  ('c0330000-0000-0000-0000-000000000001','a0330000-0000-0000-0000-000000000001',
   'f0330000-0000-0000-0000-000000000001','Josefina CI','11933330001')
on conflict do nothing;

select ci33('o cenario foi criado mesmo (ids nao colidiram com outro teste)',
  (select count(*) from clientes where org_id='a0330000-0000-0000-0000-000000000001') = 1,
  'on conflict do nothing engole colisao em silencio');

-- ---------------------------------------------------------------------------
-- 1. SEM SESSAO, A ORG VAI POR PARAMETRO — era o defeito inteiro
-- ---------------------------------------------------------------------------
-- `current_org_id()` e nulo fora de uma sessao de painel. O webhook do WhatsApp
-- chama exatamente assim, e a chamada morria com `sem_org`.
do $$
begin
  begin
    perform sureya_lancar(
      p_cliente := 'c0330000-0000-0000-0000-000000000001',
      p_tipo := 'credito', p_valor := 40, p_origem := 'pagamento',
      p_descricao := 'sem org', p_data := current_date, p_status := 'a_conferir');
    raise exception 'COMPROVANTE FALHOU — sem org e sem parametro deveria recusar';
  exception when others then
    if sqlerrm not like '%sem_org%' then raise; end if;
    raise notice '  ok  sem sessao e sem p_org, a funcao recusa (e o que quebrou em 26/08)';
  end;
end $$;

select ci33('com p_org explicito, o lancamento entra',
  sureya_lancar(
    p_cliente := 'c0330000-0000-0000-0000-000000000001',
    p_tipo := 'credito', p_valor := 40, p_origem := 'pagamento',
    p_descricao := 'CI credito do webhook', p_data := current_date,
    p_status := 'a_conferir',
    p_org := 'a0330000-0000-0000-0000-000000000001') is not null,
  'e a porta que o webhook do WhatsApp usa');

select ci33('e ele nasce A CONFERIR, nao como dinheiro',
  (select status_conc::text from conta_corrente
    where familia_id='f0330000-0000-0000-0000-000000000001'
    order by created_at desc limit 1) = 'a_conferir',
  'comprovante que a familia manda NAO e dinheiro ate alguem bater com o extrato');

-- ---------------------------------------------------------------------------
-- 2. CONFIRMAR UM COMPROVANTE SEM LANCAMENTO CRIA O LANCAMENTO
-- ---------------------------------------------------------------------------
-- Era so um UPDATE: sem linha ligada ao comprovante, mexia em ZERO e o botao
-- do Financeiro dizia que deu certo.
insert into comprovantes (id, org_id, cliente_id, valor_extraido, data_extraida,
                          id_transacao, status) values
 ('0c330000-0000-0000-0000-000000000001','a0330000-0000-0000-0000-000000000001',
  'c0330000-0000-0000-0000-000000000001', 40.00, current_date, 'E-CI-0133', 'a_conferir');

select ci33('o comprovante orfao nao tem lancamento nenhum',
  (select count(*) from conta_corrente
    where comprovante_id='0c330000-0000-0000-0000-000000000001') = 0, '');

-- A CHAMADA E A VERIFICACAO EM PASSOS SEPARADOS. `select f() is null` numa
-- funcao que devolve VOID nao responde true, e o teste reprovava codigo certo.
-- Mesmo tropeco do teste da regua, dois dias atras.
select sureya_conciliar_comprovante(
  '0c330000-0000-0000-0000-000000000001', true, 'a0330000-0000-0000-0000-000000000001');

select ci33('confirmar CRIA o lancamento que faltava',
  (select count(*) from conta_corrente
    where comprovante_id='0c330000-0000-0000-0000-000000000001') = 1,
  'antes disso, o botao confirmava e o dinheiro continuava inexistente');

select ci33('e ele entra como dinheiro de verdade, com o valor do comprovante',
  (select tipo::text='credito' and valor=40.00 and status_conc::text='confirmado'
     from conta_corrente where comprovante_id='0c330000-0000-0000-0000-000000000001'), '');

-- ---------------------------------------------------------------------------
-- 3. O QUE NAO PODE ACONTECER
-- ---------------------------------------------------------------------------
insert into comprovantes (id, org_id, cliente_id, valor_extraido, data_extraida,
                          id_transacao, status) values
 ('0c330000-0000-0000-0000-000000000002','a0330000-0000-0000-0000-000000000001',
  'c0330000-0000-0000-0000-000000000001', 25.00, current_date, 'E-CI-0133-B', 'a_conferir');

select sureya_conciliar_comprovante(
  '0c330000-0000-0000-0000-000000000002', false, 'a0330000-0000-0000-0000-000000000001');

select ci33('REJEITAR nao cria dinheiro nenhum',
  (select count(*) from conta_corrente
    where comprovante_id='0c330000-0000-0000-0000-000000000002') = 0,
  'criar o credito para em seguida marcar de rejeitado seria inventar dinheiro');

insert into comprovantes (id, org_id, cliente_id, valor_extraido, data_extraida,
                          id_transacao, status) values
 ('0c330000-0000-0000-0000-000000000003','a0330000-0000-0000-0000-000000000001',
  'c0330000-0000-0000-0000-000000000001', null, current_date, 'E-CI-0133-C', 'a_conferir');

select sureya_conciliar_comprovante(
  '0c330000-0000-0000-0000-000000000003', true, 'a0330000-0000-0000-0000-000000000001');

select ci33('comprovante SEM valor lido nao vira lancamento de R$ 0,00',
  (select count(*) from conta_corrente
    where comprovante_id='0c330000-0000-0000-0000-000000000003') = 0,
  'R$ 0,00 no extrato parece pagamento registrado — vazio nao e zero');

-- Convergente: confirmar de novo nao duplica o credito.
select sureya_conciliar_comprovante(
  '0c330000-0000-0000-0000-000000000001', true, 'a0330000-0000-0000-0000-000000000001');

select ci33('confirmar duas vezes nao cria dois creditos',
  (select count(*) from conta_corrente
    where comprovante_id='0c330000-0000-0000-0000-000000000001') = 1,
  'o clique duplo e a coisa mais comum que existe numa tela');

drop function ci33(text, boolean, text);
