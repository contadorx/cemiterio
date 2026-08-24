-- ============================================================================
-- O EXTRATO ENTRA INTEIRO (0122)
--
-- O risco aqui tem valor em reais e tres nomes:
--   1. importar duas vezes e creditar duas vezes
--   2. gasto pessoal da Sureya virar despesa do negocio
--   3. o palpiteiro chutar familia errada e alguem confirmar sem olhar
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci22(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'EXTRATO FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('aaaaaaaa-0000-0000-0000-000000000022','CI Extrato', 10)
on conflict do nothing;
insert into familias (id, org_id, nome) values
  ('ffffffff-0000-0000-0000-000000000022','aaaaaaaa-0000-0000-0000-000000000022','Familia CI Kanashiro')
on conflict do nothing;
insert into clientes (id, org_id, familia_id, nome, telefone) values
  ('cccccccc-0000-0000-0000-000000000022','aaaaaaaa-0000-0000-0000-000000000022',
   'ffffffff-0000-0000-0000-000000000022','Mario Kana','5511900000022')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. A IMPORTACAO GRAVA OS DOIS LADOS
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := sureya_importar_extrato(
    '[{"data":"2026-08-23","tipo":"credito","valor":100.00,"historico":"PIX RECEBIDO REM: JOSEANE APARECIDA RON 23/08","remetente":"JOSEANE APARECIDA RON","documento":"1003080","saldoApos":6809.83},
      {"data":"2026-08-24","tipo":"debito","valor":159.80,"historico":"COMPRA CARTAO VISA","remetente":null,"documento":"0526731","saldoApos":6650.03,"natureza":"pessoal"},
      {"data":"2026-08-24","tipo":"debito","valor":85.00,"historico":"COMPRA CARTAO VISA","remetente":null,"documento":"0074916","saldoApos":6565.03}]'::jsonb,
    'extrato.ofx', 'ofx', true, 'aaaaaaaa-0000-0000-0000-000000000022');

  perform ci22('a importacao grava as tres linhas', (r->>'novas')::int = 3, 'entrada e saida entram juntas');
  perform ci22('e nao conta repetida na primeira vez', (r->>'repetidas')::int = 0, '');
  perform ci22('e guarda o periodo do arquivo',
    (r->>'de') = '2026-08-23' and (r->>'ate') = '2026-08-24', 'o periodo e o que a tela mostra depois');
end $$;

select ci22('o credito ficou como credito',
  (select count(*) from entradas_banco
    where org_id='aaaaaaaa-0000-0000-0000-000000000022' and tipo='credito') = 1, '');
select ci22('e os dois debitos como debito',
  (select count(*) from entradas_banco
    where org_id='aaaaaaaa-0000-0000-0000-000000000022' and tipo='debito') = 2, '');

-- ---------------------------------------------------------------------------
-- 2. O QUE E PESSOAL FICA MARCADO — E O QUE NAO FOI DECIDIDO FICA NULO
--
-- Este e o coracao do pedido: "tem saida que eh pessoal ai". Nulo NAO pode
-- virar 'negocio' por omissao, senao o supermercado da Sureya come o resultado
-- do mes. Vazio nao e zero (0120).
-- ---------------------------------------------------------------------------
select ci22('a saida marcada na previa chegou marcada',
  (select natureza from entradas_banco
    where org_id='aaaaaaaa-0000-0000-0000-000000000022' and documento='0526731') = 'pessoal',
  'a marcacao viaja colada na linha; solta, ela se perde entre a tela e o banco');

select ci22('e a que ninguem classificou ficou NULA, nao "negocio"',
  (select natureza from entradas_banco
    where org_id='aaaaaaaa-0000-0000-0000-000000000022' and documento='0074916') is null,
  'chutar aqui e inventar despesa');

select ci22('classificar depois tambem funciona',
  sureya_classificar_saidas(
    array(select id from entradas_banco
           where org_id='aaaaaaaa-0000-0000-0000-000000000022' and documento='0074916'),
    'negocio', 'aaaaaaaa-0000-0000-0000-000000000022') = 1, '');

select ci22('e da para desfazer uma classificacao errada',
  sureya_classificar_saidas(
    array(select id from entradas_banco
           where org_id='aaaaaaaa-0000-0000-0000-000000000022' and documento='0074916'),
    null, 'aaaaaaaa-0000-0000-0000-000000000022') = 1,
  'marcar errado tem de ser reversivel sem apagar a linha do extrato');

do $$
declare v_deu boolean := false;
begin
  begin
    perform sureya_classificar_saidas(
      array(select id from entradas_banco where org_id='aaaaaaaa-0000-0000-0000-000000000022' limit 1),
      'talvez', 'aaaaaaaa-0000-0000-0000-000000000022');
  exception when others then v_deu := true;
  end;
  perform ci22('natureza inventada e recusada', v_deu, 'so negocio, pessoal ou nulo');
end $$;

-- ---------------------------------------------------------------------------
-- 3. IMPORTAR DUAS VEZES NAO DOBRA NADA
--
-- E o risco mais caro: 112 Pix de agosto entrando duas vezes sao 112 creditos
-- fantasma esperando para serem atribuidos a alguma familia.
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := sureya_importar_extrato(
    '[{"data":"2026-08-23","tipo":"credito","valor":100.00,"historico":"PIX RECEBIDO REM: JOSEANE APARECIDA RON 23/08","remetente":"JOSEANE APARECIDA RON","documento":"1003080","saldoApos":6809.83},
      {"data":"2026-08-24","tipo":"debito","valor":159.80,"historico":"COMPRA CARTAO VISA","remetente":null,"documento":"0526731","saldoApos":6650.03},
      {"data":"2026-08-24","tipo":"debito","valor":85.00,"historico":"COMPRA CARTAO VISA","remetente":null,"documento":"0074916","saldoApos":6565.03},
      {"data":"2026-08-25","tipo":"credito","valor":40.00,"historico":"PIX RECEBIDO REM: MARIO KANASHIRO 25/08","remetente":"MARIO KANASHIRO","documento":"1122334","saldoApos":6605.03}]'::jsonb,
    'extrato.ofx', 'ofx', true, 'aaaaaaaa-0000-0000-0000-000000000022');

  perform ci22('reimportar o arquivo maior traz SO o que falta', (r->>'novas')::int = 1,
    'convergente, nao so idempotente: o mes inteiro depois da primeira semana acrescenta o resto');
  perform ci22('e reconhece as tres que ja estavam', (r->>'repetidas')::int = 3, '');
end $$;

select ci22('no fim sao quatro linhas, e nao sete',
  (select count(*) from entradas_banco
    where org_id='aaaaaaaa-0000-0000-0000-000000000022') = 4,
  '112 Pix entrando duas vezes sao 112 creditos fantasma');

select ci22('e a marcacao de pessoal sobreviveu a reimportacao',
  (select natureza from entradas_banco
    where org_id='aaaaaaaa-0000-0000-0000-000000000022' and documento='0526731') = 'pessoal',
  'o arquivo de novo veio SEM natureza; sobrescrever apagaria o trabalho dela');

-- DOIS MOVIMENTOS IGUAIS NO MESMO DIA, SEM DOCUMENTO, sao distinguidos pelo
-- saldo: duas linhas nao deixam a conta no mesmo lugar.
do $$
declare r jsonb;
begin
  r := sureya_importar_extrato(
    '[{"data":"2026-08-26","tipo":"credito","valor":30.00,"historico":"PIX RECEBIDO","remetente":null,"documento":null,"saldoApos":6635.03},
      {"data":"2026-08-26","tipo":"credito","valor":30.00,"historico":"PIX RECEBIDO","remetente":null,"documento":null,"saldoApos":6665.03}]'::jsonb,
    'x.csv','csv', true, 'aaaaaaaa-0000-0000-0000-000000000022');
  perform ci22('dois Pix iguais no mesmo dia entram os dois', (r->>'novas')::int = 2,
    'sem documento, o saldo desempata — e sem essa regra a segunda sumiria');
end $$;

-- ---------------------------------------------------------------------------
-- 4. O PALPITEIRO
-- ---------------------------------------------------------------------------
select ci22('o palpite acha a familia pelo SOBRENOME',
  exists (select 1 from sureya_palpites_entrada(
            (select id from entradas_banco
              where org_id='aaaaaaaa-0000-0000-0000-000000000022' and documento='1122334'),
            'aaaaaaaa-0000-0000-0000-000000000022')
          where nome = 'Mario Kana' and forca >= 100),
  'o cadastro guarda "Mario Kana" e o banco manda "MARIO KANASHIRO": '
  || 'casar so pelo PRIMEIRO nome, como era ate a 0122, devolvia todos os Marios');

select ci22('debito nao gera palpite de familia',
  (select count(*) from sureya_palpites_entrada(
     (select id from entradas_banco
       where org_id='aaaaaaaa-0000-0000-0000-000000000022' and documento='0526731'),
     'aaaaaaaa-0000-0000-0000-000000000022')) = 0,
  'pagar fornecedor nao e credito de familia nenhuma');

-- ---------------------------------------------------------------------------
-- 5. AS TRAVAS
-- ---------------------------------------------------------------------------
do $$
declare v_deu boolean := false;
begin
  begin
    update entradas_banco set cliente_id = 'cccccccc-0000-0000-0000-000000000022'
     where org_id='aaaaaaaa-0000-0000-0000-000000000022' and documento='0526731';
  exception when check_violation then v_deu := true;
  end;
  perform ci22('debito nao pode ganhar dono de familia', v_deu,
    'e a porta por onde um pagamento de fornecedor viraria credito de alguem');
end $$;

do $$
declare v_deu boolean := false;
begin
  begin
    perform sureya_importar_extrato('[]'::jsonb, null, null, null,
      'aaaaaaaa-0000-0000-0000-000000000022');
  exception when others then v_deu := true;
  end;
  perform ci22('lista vazia e recusada, e nao gravada como importacao de zero', v_deu, '');
end $$;

select ci22('cada importacao fica registrada com o que fez',
  (select count(*) from importacoes_extrato
    where org_id='aaaaaaaa-0000-0000-0000-000000000022') = 3
  and (select sum(novas) from importacoes_extrato
        where org_id='aaaaaaaa-0000-0000-0000-000000000022') = 6,
  'tres importacoes: 3 novas + 1 nova + 2 novas');

drop function ci22(text, boolean, text);
