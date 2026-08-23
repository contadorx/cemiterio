-- ============================================================================
-- A FAMILIA EXISTE SEM CONTATO — e a lavagem dela vira dinheiro assim mesmo
--
-- O que se mediu antes: 298 familias e 298 contatos, um para um, porque a
-- familia era criada por gatilho a partir do contato. E `clientes.telefone` e
-- NOT NULL — logo, nao havia caminho para cadastrar a familia de quem nao se
-- tem telefone. Daí 81 jazigos parados.
--
-- O que este arquivo cobra e o efeito que nao aparece em tela nenhuma: uma
-- lavagem de familia SEM contato tem de gerar cobranca do mesmo jeito. Se nao
-- gerar, o servico acontece, a foto sai, e o dinheiro some calado.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci8(nome text, real_ text, esperado text) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'FAMILIA FALHOU — %: veio [%], esperado [%]', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

create or replace function ci8b(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'FAMILIA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into auth.users (id, email)
  values ('f0f0f0f0-0000-0000-0000-000000000008','fam@sureya.test') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','f0f0f0f0-0000-0000-0000-000000000008', false);

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000008','CI Familia')
  on conflict do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('aaaaaaaa-0000-0000-0000-000000000008','f0f0f0f0-0000-0000-0000-000000000008','admin', true)
  on conflict do nothing;
insert into cemiterios (id, org_id, nome)
  values ('dddddddd-0000-0000-0000-000000000008','aaaaaaaa-0000-0000-0000-000000000008','CI Cem Fam')
  on conflict (id) do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
  values ('eeeeeeee-0000-0000-0000-000000000008','aaaaaaaa-0000-0000-0000-000000000008',
          'dddddddd-0000-0000-0000-000000000008','Q Fam', 1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1 · A FAMILIA NASCE SO COM O NOME — que era o caminho que nao existia
-- ---------------------------------------------------------------------------
insert into familias (id, org_id, nome, modo_cobranca)
values ('bbbbbbbb-0000-0000-0000-000000000081','aaaaaaaa-0000-0000-0000-000000000008',
        'Familia Nagae','consumo');

select ci8b('familia existe sem nenhum contato',
  (select responsavel_id is null from familias where id='bbbbbbbb-0000-0000-0000-000000000081'),
  'a familia nasceu ja com responsavel — o gatilho antigo voltou');

select ci8('e aparece na lista de triagem',
  (select count(*)::text from sureya_familias_sem_contato
    where id='bbbbbbbb-0000-0000-0000-000000000081'), '1');

-- 2 · O JAZIGO SE LIGA A FAMILIA, sem contato nenhum
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo, valor_lavagem)
values ('ffffffff-0000-0000-0000-000000000081','aaaaaaaa-0000-0000-0000-000000000008',
        'eeeeeeee-0000-0000-0000-000000000008','bbbbbbbb-0000-0000-0000-000000000081',
        'Pedra Nagae','N-1', 60);

select ci8b('jazigo aceita familia sem dono',
  (select familia_id is not null and cliente_id is null from tumulos
    where id='ffffffff-0000-0000-0000-000000000081'),
  'o jazigo nao ficou com a familia, ou inventou um dono');

select ci8('e sai da lista de jazigos orfaos',
  (select count(*)::text from sureya_jazigos_sem_familia
    where id='ffffffff-0000-0000-0000-000000000081'), '0');

-- ---------------------------------------------------------------------------
-- 3 · O EFEITO QUE NAO APARECE EM TELA: a lavagem TEM de virar cobranca
--
-- Antes desta migration o debito era decidido por `v_s.cliente_id is not null`.
-- Sem contato, a limpeza acontecia, a foto saia, e a cobranca simplesmente nao
-- existia — sem erro. Este e o teste que prova o conserto.
-- ---------------------------------------------------------------------------
insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada, foto_depois_url)
values ('99999999-0000-0000-0000-000000000081','aaaaaaaa-0000-0000-0000-000000000008',
        'ffffffff-0000-0000-0000-000000000081','executado', current_date,
        now(), 'https://exemplo/n1.jpg');

select * from sureya_concluir_lavagem('99999999-0000-0000-0000-000000000081'::uuid,
                                      'https://exemplo/n1.jpg', null, null, null, null);

select ci8b('lavagem de familia SEM contato gera cobranca',
  (select count(*) > 0 from conta_corrente
    where servico_id='99999999-0000-0000-0000-000000000081'
      and origem::text='lavagem' and tipo::text='debito'),
  'a limpeza aconteceu e o dinheiro sumiu calado — o conserto nao pegou');

select ci8b('e o lancamento e da familia, com o contato em branco',
  (select bool_and(familia_id='bbbbbbbb-0000-0000-0000-000000000081' and cliente_id is null)
     from conta_corrente where servico_id='99999999-0000-0000-0000-000000000081'
      and origem::text='lavagem' and tipo::text='debito'),
  'o lancamento saiu sem familia, ou inventou um contato');

-- ---------------------------------------------------------------------------
-- 4 · O PRIMEIRO CONTATO ASSUME A CONTA
-- ---------------------------------------------------------------------------
insert into clientes (id, org_id, nome, telefone, familia_id)
values ('cccccccc-0000-0000-0000-000000000081','aaaaaaaa-0000-0000-0000-000000000008',
        'Andre Nagae','5511900000081','bbbbbbbb-0000-0000-0000-000000000081');

select ci8('o primeiro contato vira o responsavel',
  (select responsavel_id::text from familias where id='bbbbbbbb-0000-0000-0000-000000000081'),
  'cccccccc-0000-0000-0000-000000000081');

select ci8b('e o booleano antigo acompanha (meio sistema ainda le ele)',
  (select responsavel_financeiro from clientes where id='cccccccc-0000-0000-0000-000000000081'),
  'o clientes.responsavel_financeiro ficou para tras');

select ci8('o jazigo passou a apontar para ele, sem ninguem mandar',
  (select cliente_id::text from tumulos where id='ffffffff-0000-0000-0000-000000000081'),
  'cccccccc-0000-0000-0000-000000000081');

select ci8('e a familia saiu da lista de triagem',
  (select count(*)::text from sureya_familias_sem_contato
    where id='bbbbbbbb-0000-0000-0000-000000000081'), '0');

-- ---------------------------------------------------------------------------
-- 5 · A TROCA — "tem familia que o contato financeiro muda ano apos ano"
-- ---------------------------------------------------------------------------
insert into clientes (id, org_id, nome, telefone, familia_id)
values ('cccccccc-0000-0000-0000-000000000082','aaaaaaaa-0000-0000-0000-000000000008',
        'Marta Nagae','5511900000082','bbbbbbbb-0000-0000-0000-000000000081');

select ci8b('o segundo contato NAO rouba a conta do primeiro',
  (select responsavel_id = 'cccccccc-0000-0000-0000-000000000081'
     from familias where id='bbbbbbbb-0000-0000-0000-000000000081'),
  'acrescentar um contato trocou o responsavel sem ninguem pedir');

select sureya_definir_responsavel('bbbbbbbb-0000-0000-0000-000000000081'::uuid,
                                  'cccccccc-0000-0000-0000-000000000082'::uuid,
                                  'este ano quem acerta e a Marta');

select ci8('a familia passou para a Marta',
  (select responsavel_id::text from familias where id='bbbbbbbb-0000-0000-0000-000000000081'),
  'cccccccc-0000-0000-0000-000000000082');

-- O INDICE UNICO E' `(familia_id) where responsavel_financeiro`. Se a funcao
-- marcasse antes de limpar, esta troca estouraria com chave duplicada.
select ci8('so um responsavel marcado na familia',
  (select count(*)::text from clientes
    where familia_id='bbbbbbbb-0000-0000-0000-000000000081' and responsavel_financeiro), '1');

select ci8('e o jazigo seguiu junto',
  (select cliente_id::text from tumulos where id='ffffffff-0000-0000-0000-000000000081'),
  'cccccccc-0000-0000-0000-000000000082');

select ci8('a troca ficou registrada, com o motivo',
  (select motivo from familia_responsavel_log
    where familia_id='bbbbbbbb-0000-0000-0000-000000000081'
    order by desde desc limit 1),
  'este ano quem acerta e a Marta');

select ci8('e o log guarda a historia inteira, nao so o agora',
  (select count(*)::text from familia_responsavel_log
    where familia_id='bbbbbbbb-0000-0000-0000-000000000081'), '2');

-- Repor o mesmo contato nao escreve troca nenhuma: salvar a ficha duas vezes
-- nao pode virar duas linhas no historico.
select sureya_definir_responsavel('bbbbbbbb-0000-0000-0000-000000000081'::uuid,
                                  'cccccccc-0000-0000-0000-000000000082'::uuid, 'de novo');
select ci8('repor o mesmo nao gera troca',
  (select count(*)::text from familia_responsavel_log
    where familia_id='bbbbbbbb-0000-0000-0000-000000000081'), '2');

-- Contato de OUTRA familia e recusado: seria a cobranca de uma familia
-- apontando para a pessoa de outra.
insert into familias (id, org_id, nome) values
  ('bbbbbbbb-0000-0000-0000-000000000082','aaaaaaaa-0000-0000-0000-000000000008','Outra Familia');
do $$
begin
  perform sureya_definir_responsavel('bbbbbbbb-0000-0000-0000-000000000082'::uuid,
                                     'cccccccc-0000-0000-0000-000000000081'::uuid, null);
  raise exception 'FAMILIA FALHOU — contato de outra familia foi ACEITO';
exception when sqlstate '23514' then
  raise notice '  ok  contato de outra familia e recusado';
end $$;

-- E DA' PARA FICAR SEM: a familia perde o contato e continua existindo.
select sureya_definir_responsavel('bbbbbbbb-0000-0000-0000-000000000081'::uuid, null,
                                  'a Marta pediu para nao receber mais');
select ci8b('a familia pode voltar a ficar sem contato',
  (select responsavel_id is null from familias where id='bbbbbbbb-0000-0000-0000-000000000081'),
  'nao deu para tirar o contato financeiro');
select ci8b('e o jazigo fica sem dono junto, sem apontar para quem saiu',
  (select cliente_id is null from tumulos where id='ffffffff-0000-0000-0000-000000000081'),
  'o jazigo ficou apontando para quem nao e mais responsavel');

-- ---------------------------------------------------------------------------
-- 6 · DESVINCULAR TEM DE FUNCIONAR
--
-- Este caso nasceu de um defeito que a propria 0091 criou: como o jazigo passou
-- a ser vinculado pela FAMILIA, a tela deixou de mandar `cliente_id`. Limpar a
-- familia caia no ramo "chegou so o dono", que deduzia a familia do contato que
-- ainda estava la — e o campo voltava sozinho, sem erro, dando a impressao de
-- que o sistema nao tinha salvado.
-- ---------------------------------------------------------------------------
insert into clientes (id, org_id, nome, telefone, familia_id)
values ('cccccccc-0000-0000-0000-000000000083','aaaaaaaa-0000-0000-0000-000000000008',
        'Terceiro Nagae','5511900000083','bbbbbbbb-0000-0000-0000-000000000081');

select ci8b('preparo: o jazigo esta com familia e com dono',
  (select familia_id is not null and cliente_id is not null from tumulos
    where id='ffffffff-0000-0000-0000-000000000081'),
  'o preparo do teste nao ficou como esperado');

update tumulos set familia_id = null where id='ffffffff-0000-0000-0000-000000000081';

select ci8b('tirar a familia REALMENTE tira',
  (select familia_id is null from tumulos where id='ffffffff-0000-0000-0000-000000000081'),
  'a familia voltou sozinha — o gatilho desfez o que a tela pediu');

select ci8b('e o contato derivado sai junto',
  (select cliente_id is null from tumulos where id='ffffffff-0000-0000-0000-000000000081'),
  'o jazigo ficou sem familia mas com dono, que e a discordancia que a 0081 impedia');

-- E a porta da importacao continua valendo: jazigo que chega so com dono deduz
-- a familia dele. Sem isto o conserto acima teria quebrado a planilha.
update tumulos set cliente_id = 'cccccccc-0000-0000-0000-000000000083'
 where id='ffffffff-0000-0000-0000-000000000081';

select ci8('jazigo que recebe so o dono ainda deduz a familia',
  (select familia_id::text from tumulos where id='ffffffff-0000-0000-0000-000000000081'),
  'bbbbbbbb-0000-0000-0000-000000000081');

do $$ begin raise notice 'FAMILIA SEM CONTATO: todas as conferencias passaram'; end $$;
