-- ============================================================================
-- ADIAR A COBRANCA ATE A DATA COMBINADA (0124)
--
-- O risco aqui nao e um numero errado: e uma promessa quebrada. A familia
-- disse "pode ser dia 15?", a Sureya disse "combinado" — e uma segunda
-- cobranca saindo no dia 12 desfaz de uma vez a confianca que a primeira
-- construiu. E a conversa mais cara que esta casa pode ter.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci24(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'ADIAR FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('a0240000-0000-0000-0000-000000000001','CI Adiar', 10)
on conflict do nothing;
insert into cemiterios (id, org_id, nome) values
  ('d0240000-0000-0000-0000-000000000001','a0240000-0000-0000-0000-000000000001','CI Cem Adiar')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem) values
  ('e0240000-0000-0000-0000-000000000001','a0240000-0000-0000-0000-000000000001',
   'd0240000-0000-0000-0000-000000000001','Q Adiar', 1)
on conflict do nothing;
insert into familias (id, org_id, nome) values
  ('f0240000-0000-0000-0000-000000000001','a0240000-0000-0000-0000-000000000001','Familia CI Combinou'),
  ('f0240000-0000-0000-0000-000000000002','a0240000-0000-0000-0000-000000000001','Familia CI Nao Combinou')
on conflict do nothing;
insert into clientes (id, org_id, familia_id, nome, telefone, responsavel_financeiro) values
  ('c0240000-0000-0000-0000-000000000001','a0240000-0000-0000-0000-000000000001',
   'f0240000-0000-0000-0000-000000000001','CI Combinou','5511900000024', true),
  ('c0240000-0000-0000-0000-000000000002','a0240000-0000-0000-0000-000000000001',
   'f0240000-0000-0000-0000-000000000002','CI Nao Combinou','5511900000026', true)
on conflict do nothing;
update familias set responsavel_id = 'c0240000-0000-0000-0000-000000000001'
 where id = 'f0240000-0000-0000-0000-000000000001';
update familias set responsavel_id = 'c0240000-0000-0000-0000-000000000002'
 where id = 'f0240000-0000-0000-0000-000000000002';

-- As duas devem, vencido ha 3 dias, e existe um degrau para o terceiro dia.
insert into conta_corrente (org_id, familia_id, tipo, origem, valor, descricao, data, competencia)
values ('a0240000-0000-0000-0000-000000000001','f0240000-0000-0000-0000-000000000001',
        'debito','competencia', 40.00, 'CI contrato', current_date - 3,
        date_trunc('month', current_date)::date),
       ('a0240000-0000-0000-0000-000000000001','f0240000-0000-0000-0000-000000000002',
        'debito','competencia', 40.00, 'CI contrato', current_date - 3,
        date_trunc('month', current_date)::date);

insert into regua_degraus (org_id, regua, dias, texto, ativo)
values ('a0240000-0000-0000-0000-000000000001','padrao', 3,
        'Ola, {nome}! Consta um valor em aberto.', true)
on conflict do nothing;

-- O `on conflict do nothing` engole em SILENCIO um id que ja existe com outra
-- org — e foi assim que este arquivo quebrou na primeira tentativa, colidindo
-- com os ids de `pagamento_composto.sql`. A conferencia abaixo custa uma linha
-- e transforma "familia_nao_encontrada" tres passos adiante numa frase que diz
-- o que houve.
select ci24('o cenario foi criado mesmo (ids nao colidiram com outro teste)',
  (select count(*) from familias where org_id = 'a0240000-0000-0000-0000-000000000001') = 2
  and (select count(*) from clientes where org_id = 'a0240000-0000-0000-0000-000000000001') = 2,
  'dois testes com o mesmo uuid: o segundo insert some sem erro e o cenario nasce torto');

-- ---------------------------------------------------------------------------
-- 1. SEM ADIAMENTO, A REGUA ENFILEIRA AS DUAS
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  select * into r from sureya_regua_do_dia(current_date, 'a0240000-0000-0000-0000-000000000001');
  perform ci24('a regua enfileira as duas familias que devem', r.enfileirados = 2, '');
  perform ci24('e nao conta nenhuma como adiada', r.adiados = 0, '');
end $$;

-- ---------------------------------------------------------------------------
-- 2. ADIAR SEGURA A FAMILIA INTEIRA
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; r jsonb;
begin
  select id into v_id from fila_liberacao
   where familia_id = 'f0240000-0000-0000-0000-000000000001' and tipo = 'cobranca' limit 1;

  r := sureya_adiar_mensagem(v_id, current_date + 10, 'ela pediu para chamar dia 10',
                             'a0240000-0000-0000-0000-000000000001');
  perform ci24('adiar devolve a data combinada',
    (r->>'adiada_para')::date = current_date + 10, '');
  perform ci24('e avisa que isso segura a regua', (r->>'segura_a_regua')::boolean = true,
    'a tela precisa poder dizer o que mudou de verdade');
end $$;

select ci24('a familia com combinado esta segurada',
  sureya_cobranca_adiada('f0240000-0000-0000-0000-000000000001', current_date,
                         'a0240000-0000-0000-0000-000000000001') = current_date + 10, '');

select ci24('e a outra familia nao',
  sureya_cobranca_adiada('f0240000-0000-0000-0000-000000000002', current_date,
                         'a0240000-0000-0000-0000-000000000001') is null,
  'segurar uma nao pode segurar a casa do vizinho');

-- Nova competencia vencendo, novo degrau: sem a trava, sairia outra cobranca.
insert into conta_corrente (org_id, familia_id, tipo, origem, valor, descricao, data, competencia)
values ('a0240000-0000-0000-0000-000000000001','f0240000-0000-0000-0000-000000000001',
        'debito','competencia', 40.00, 'CI contrato 2', current_date - 3,
        (date_trunc('month', current_date) + interval '1 month')::date),
       ('a0240000-0000-0000-0000-000000000001','f0240000-0000-0000-0000-000000000002',
        'debito','competencia', 40.00, 'CI contrato 2', current_date - 3,
        (date_trunc('month', current_date) + interval '1 month')::date);

-- A trava "uma por familia por dia" tambem barraria hoje. Rodo AMANHA, onde a
-- unica coisa que separa as duas familias e o adiamento.
insert into regua_degraus (org_id, regua, dias, texto, ativo)
values ('a0240000-0000-0000-0000-000000000001','padrao', 4,
        'Ola, {nome}! Segue em aberto.', true)
on conflict do nothing;

do $$
declare r record; v_com int; v_sem int;
begin
  select * into r from sureya_regua_do_dia(current_date + 1, 'a0240000-0000-0000-0000-000000000001');

  -- MEDIDO POR FAMILIA, e nao pelo total.
  --
  -- O total nao serve como prova aqui: a trava "uma por familia por dia"
  -- compara `criado_em::date` com o dia SIMULADO, e ao rodar a regua num dia
  -- futuro ela nunca dispara. Isso e artefato do teste, nao defeito do sistema
  -- — mas confiar no total faria a asserção medir o artefato.
  select count(*) into v_com from fila_liberacao
   where familia_id = 'f0240000-0000-0000-0000-000000000001' and tipo = 'cobranca';
  select count(*) into v_sem from fila_liberacao
   where familia_id = 'f0240000-0000-0000-0000-000000000002' and tipo = 'cobranca';

  perform ci24('a familia que combinou NAO recebeu nada de novo', v_com = 1,
    'a que combinou dia 10 nao pode receber cobranca no dia 4 — a segunda seria a promessa quebrada');
  perform ci24('e a que nao combinou recebeu', v_sem > 1, '');
  perform ci24('e a segurada aparece na contagem de adiados', r.adiados >= 1,
    'silencio que nao se explica ja custou dezenove dias de WhatsApp nesta casa (0121)');
end $$;

-- ---------------------------------------------------------------------------
-- 3. PASSADA A DATA, A COBRANCA VOLTA A VALER
-- ---------------------------------------------------------------------------
select ci24('no dia combinado a trava ja nao vale',
  sureya_cobranca_adiada('f0240000-0000-0000-0000-000000000001', current_date + 10,
                         'a0240000-0000-0000-0000-000000000001') is null,
  'adiar e adiar, nao e cancelar para sempre');

do $$
declare r record;
begin
  select * into r from sureya_regua_do_dia(current_date + 11, 'a0240000-0000-0000-0000-000000000001');
  perform ci24('e a regua volta a olhar para a familia', r.adiados = 0, '');
end $$;

-- ---------------------------------------------------------------------------
-- 4. O CAMINHO DE VOLTA
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; r jsonb;
begin
  select id into v_id from fila_liberacao
   where familia_id = 'f0240000-0000-0000-0000-000000000001' and tipo = 'cobranca' limit 1;
  r := sureya_adiar_mensagem(v_id, null, null, 'a0240000-0000-0000-0000-000000000001');
  perform ci24('desadiar traz a mensagem de volta hoje', r->>'adiada_para' is null,
    'quem adiou por engano precisa de caminho de volta, senao o botao vira armadilha');
  perform ci24('e o motivo do adiamento sai junto',
    (select motivo_adiamento from fila_liberacao where id = v_id) is null, '');
end $$;

select ci24('e a trava caiu com ele',
  sureya_cobranca_adiada('f0240000-0000-0000-0000-000000000001', current_date,
                         'a0240000-0000-0000-0000-000000000001') is null, '');

-- ---------------------------------------------------------------------------
-- 5. AS TRAVAS
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid; v_deu boolean := false;
begin
  select id into v_id from fila_liberacao
   where familia_id = 'f0240000-0000-0000-0000-000000000001' limit 1;
  begin
    perform sureya_adiar_mensagem(v_id, current_date, null, 'a0240000-0000-0000-0000-000000000001');
  exception when others then v_deu := true;
  end;
  perform ci24('adiar para hoje e recusado', v_deu, 'adiar para hoje nao adia nada');

  v_deu := false;
  begin
    perform sureya_adiar_mensagem(v_id, current_date + 400, null, 'a0240000-0000-0000-0000-000000000001');
  exception when others then v_deu := true;
  end;
  perform ci24('mais de um ano e recusado', v_deu,
    'isso nao e adiar, e desistir — e para isso existe a regua "nao cobrar"');

  v_deu := false;
  update fila_liberacao set status = 'enviado' where id = v_id;
  begin
    perform sureya_adiar_mensagem(v_id, current_date + 5, null, 'a0240000-0000-0000-0000-000000000001');
  exception when others then v_deu := true;
  end;
  perform ci24('mensagem que ja saiu nao pode ser adiada', v_deu,
    'adiar o que ja foi enviado nao desfaz nada, e a tela passaria a mostrar '
    || 'uma promessa que nao existe');
  update fila_liberacao set status = 'aguardando' where id = v_id;
end $$;

-- ADIAR UMA FOTO E SO ADIAR UMA FOTO. A trava e da cobranca: guardar o envio
-- de uma foto nao pode calar a cobranca da mesma casa, e vice-versa.
insert into fila_liberacao (id, org_id, familia_id, cliente_id, tipo, texto, status)
values ('11240000-0000-0000-0000-000000000001','a0240000-0000-0000-0000-000000000001',
        'f0240000-0000-0000-0000-000000000002','c0240000-0000-0000-0000-000000000002',
        'foto','Foto da limpeza','aguardando');

do $$
declare r jsonb;
begin
  r := sureya_adiar_mensagem('11240000-0000-0000-0000-000000000001', current_date + 5,
                             null, 'a0240000-0000-0000-0000-000000000001');
  perform ci24('adiar uma FOTO nao segura a cobranca',
    (r->>'segura_a_regua')::boolean = false,
    'a trava e da cobranca; guardar uma foto e so guardar uma foto');
end $$;

select ci24('e a familia dela segue cobravel',
  sureya_cobranca_adiada('f0240000-0000-0000-0000-000000000002', current_date,
                         'a0240000-0000-0000-0000-000000000001') is null,
  'senao adiar uma foto calaria a cobranca da casa sem ninguem pedir');

drop function ci24(text, boolean, text);
