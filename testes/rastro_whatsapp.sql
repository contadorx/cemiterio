-- ============================================================================
-- PARA ONDE FOI A MENSAGEM (0121)
--
-- O risco aqui e o que ja aconteceu: dezenove dias de WhatsApp mudo sem que
-- nada na tela dissesse isso. E, quando a pergunta veio, nao haver como
-- responder se UMA mensagem especifica chegou.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci21(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'RASTRO FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('aaaaaaaa-0000-0000-0000-000000000021','CI Rastro', 10)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. O RASTRO GUARDA POR ONDE A MENSAGEM SAIU
-- ---------------------------------------------------------------------------
insert into eventos_webhook (org_id, evolution_msg_id, telefone, desfecho, created_at, visto_em) values
  ('aaaaaaaa-0000-0000-0000-000000000021','R1','5511900000001','gravada', now() - interval '2 hours', now() - interval '2 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000021','R2','5511900000002','grupo',   now() - interval '3 hours', now() - interval '3 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000021','R3','5511900000002','grupo',   now() - interval '4 hours', now() - interval '4 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000021','R4','5511900000003','lead',    now() - interval '5 hours', now() - interval '5 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000021','R5','5511900000001','erro',    now() - interval '9 days',  now() - interval '9 days');

select ci21('a linha guarda telefone e desfecho',
  (select count(*) from eventos_webhook
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000021'
      and telefone is not null and desfecho is not null) = 5,
  'sem telefone e desfecho, "para onde foi a mensagem" nao tem resposta');

-- ---------------------------------------------------------------------------
-- 2. "E A MENSAGEM DESTE NUMERO?" — a pergunta que se faz quando uma familia
--    diz que mandou o comprovante.
-- ---------------------------------------------------------------------------
select ci21('o rastro por telefone acha as duas do mesmo numero',
  (select count(*) from sureya_rastro_telefone(
      '5511900000001', 30, 'aaaaaaaa-0000-0000-0000-000000000021')) = 2,
  'o numero teve duas passagens — uma gravada e uma com erro');

select ci21('e a janela de dias corta o que e velho demais',
  (select count(*) from sureya_rastro_telefone(
      '5511900000001', 3, 'aaaaaaaa-0000-0000-0000-000000000021')) = 1,
  'com 3 dias de janela, a passagem de 9 dias atras fica de fora');

select ci21('numero que nunca escreveu devolve vazio, nao erro',
  (select count(*) from sureya_rastro_telefone(
      '5511999999999', 30, 'aaaaaaaa-0000-0000-0000-000000000021')) = 0,
  '"nao chegou" precisa ser uma resposta, nao uma excecao');

-- ---------------------------------------------------------------------------
-- 3. A SAUDE DO WHATSAPP
-- ---------------------------------------------------------------------------
select ci21('nao esta calado: chegou coisa ha 2 horas',
  (sureya_saude_whatsapp('aaaaaaaa-0000-0000-0000-000000000021')->>'silencio')::boolean = false,
  '48h e o limite, e o mesmo que LIMITE_MINUTOS.webhook usa no codigo');

select ci21('conta o que entrou em 24h',
  (sureya_saude_whatsapp('aaaaaaaa-0000-0000-0000-000000000021')->>'total_24h')::int = 4,
  'quatro passagens nas ultimas 24h; a de 9 dias nao conta');

select ci21('e separa por desfecho',
  (sureya_saude_whatsapp('aaaaaaaa-0000-0000-0000-000000000021')->'em_24h'->>'grupo')::int = 2,
  'sem separar por desfecho, "70 eventos" nao diz se alguma virou conversa');

select ci21('e diz quantas viraram mensagem de familia',
  (sureya_saude_whatsapp('aaaaaaaa-0000-0000-0000-000000000021')->>'gravadas_24h')::int = 1,
  'O DIA 23/08 TINHA 70 EVENTOS E ZERO GRAVADAS. Carimbo verde, sistema surdo: '
  || 'e este numero que distingue os dois casos');

-- ORG QUE NUNCA RECEBEU NADA nao pode parecer org que recebeu e parou.
insert into orgs (id, nome, dia_vencimento) values
  ('aaaaaaaa-0000-0000-0000-000000000121','CI Rastro Virgem', 10)
on conflict do nothing;

select ci21('org sem evento nenhum diz "nunca recebeu"',
  (sureya_saude_whatsapp('aaaaaaaa-0000-0000-0000-000000000121')->>'nunca_recebeu')::boolean = true,
  'nunca recebeu e recebeu e parou pedem frases diferentes na tela');

select ci21('e nunca recebeu NAO e silencio de 48h',
  (sureya_saude_whatsapp('aaaaaaaa-0000-0000-0000-000000000121')->>'silencio')::boolean = false,
  'senao um sistema recem-instalado nasce com alarme vermelho');

-- ---------------------------------------------------------------------------
-- 4. O LOG VELHO SAI — MAS NUNCA A PROVA RECENTE
-- ---------------------------------------------------------------------------
select ci21('a limpeza tira o que passou dos dias pedidos',
  sureya_limpar_eventos_webhook(7, 'aaaaaaaa-0000-0000-0000-000000000021') = 1,
  'so a passagem de 9 dias atras sai');

select ci21('e o resto continua la',
  (select count(*) from eventos_webhook
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000021') = 4,
  'as quatro de hoje ficam');

select ci21('p_dias = 0 NAO apaga tudo',
  sureya_limpar_eventos_webhook(0, 'aaaaaaaa-0000-0000-0000-000000000021') = 0,
  'este log e a unica prova de que uma mensagem chegou; o piso de 7 dias e a trava');

-- ---------------------------------------------------------------------------
-- 5. O MESMO PIX NAO ENTRA DUAS VEZES
--
-- Com a leitura do comprovante valendo pelas DUAS portas — o WhatsApp e a mao
-- da Sureya —, o mesmo pagamento pode ser registrado duas vezes: a familia
-- manda a foto e ela anexa o print. Sem trava, o razao credita em dobro.
-- ---------------------------------------------------------------------------
insert into cemiterios (id, org_id, nome)
values ('dddddddd-0000-0000-0000-000000000021','aaaaaaaa-0000-0000-0000-000000000021','CI Cem Rastro')
on conflict do nothing;
insert into clientes (id, org_id, nome, telefone)
values ('cccccccc-0000-0000-0000-000000000021','aaaaaaaa-0000-0000-0000-000000000021','CI Josiane','5511900000001')
on conflict do nothing;

insert into comprovantes (org_id, cliente_id, imagem_url, valor_extraido, data_extraida, id_transacao, status)
values ('aaaaaaaa-0000-0000-0000-000000000021','cccccccc-0000-0000-0000-000000000021',
        'x://um', 100.00, current_date, 'E2E-CI-0121', 'confirmado');

do $$
declare v_deu boolean := false;
begin
  begin
    insert into comprovantes (org_id, cliente_id, imagem_url, valor_extraido, data_extraida, id_transacao, status)
    values ('aaaaaaaa-0000-0000-0000-000000000021','cccccccc-0000-0000-0000-000000000021',
            'x://dois', 100.00, current_date, 'E2E-CI-0121', 'confirmado');
  exception when unique_violation then
    v_deu := true;
  end;
  perform ci21('o mesmo identificador de transacao nao entra duas vezes', v_deu,
    'a familia manda a foto no whats e a Sureya anexa o print do mesmo Pix: '
    || 'sem esta trava, sao dois creditos no razao dela');
end $$;

-- Comprovante SEM identificador nao pode ser bloqueado: nem todo print traz o
-- E2E, e recusar por isso seria trocar o credito em dobro por credito nenhum.
insert into comprovantes (org_id, cliente_id, imagem_url, valor_extraido, data_extraida, id_transacao, status)
values ('aaaaaaaa-0000-0000-0000-000000000021','cccccccc-0000-0000-0000-000000000021',
        'x://tres', 40.00, current_date, null, 'confirmado');
insert into comprovantes (org_id, cliente_id, imagem_url, valor_extraido, data_extraida, id_transacao, status)
values ('aaaaaaaa-0000-0000-0000-000000000021','cccccccc-0000-0000-0000-000000000021',
        'x://quatro', 40.00, current_date, null, 'confirmado');

select ci21('mas dois comprovantes SEM identificador continuam entrando',
  (select count(*) from comprovantes
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000021' and id_transacao is null) = 2,
  'nem todo print traz o E2E; a trava e sobre o identificador, nao sobre o valor');

drop function ci21(text, boolean, text);
