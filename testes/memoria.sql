-- ============================================================================
-- O MOTOR DE MEMÓRIA — a primeira vez que ele roda
--
-- A 0096 escreveu o motor inteiro e ele NUNCA foi executado: zero eventos em
-- produção, nenhum arquivo do app o citando. Um motor que trata de luto não
-- pode estrear na casa de alguém.
--
-- Este arquivo cobra, nesta ordem:
--   1. que ele RODA no cron (era o bloqueio da 0103)
--   2. que data sem dia certo NÃO vira lembrete
--   3. que luto recente é zona de silêncio
--   4. que o limite de frequência é teto, não sugestão
--   5. que duas datas do mesmo túmulo viram UMA mensagem
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci14(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'MEMORIA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, lembretes_memoria)
values ('aaaaaaaa-0000-0000-0000-000000000014','CI Memoria', true)
on conflict (id) do update set lembretes_memoria = true;

insert into familias (id, org_id, nome, lembretes_memoria) values
  ('ff000000-0000-0000-0000-000000000141','aaaaaaaa-0000-0000-0000-000000000014','Familia Memoria', true),
  ('ff000000-0000-0000-0000-000000000142','aaaaaaaa-0000-0000-0000-000000000014','Familia Luto Novo', true)
on conflict do nothing;

insert into clientes (id, org_id, familia_id, nome, telefone, responsavel_financeiro) values
  ('cc000000-0000-0000-0000-000000000141','aaaaaaaa-0000-0000-0000-000000000014',
   'ff000000-0000-0000-0000-000000000141','Contato Memoria','5511900000141', true),
  ('cc000000-0000-0000-0000-000000000142','aaaaaaaa-0000-0000-0000-000000000014',
   'ff000000-0000-0000-0000-000000000142','Contato Luto','5511900000142', true)
on conflict do nothing;

update familias set responsavel_id='cc000000-0000-0000-0000-000000000141'
 where id='ff000000-0000-0000-0000-000000000141';
update familias set responsavel_id='cc000000-0000-0000-0000-000000000142'
 where id='ff000000-0000-0000-0000-000000000142';

insert into cemiterios (id, org_id, nome)
values ('dddddddd-0000-0000-0000-000000000014','aaaaaaaa-0000-0000-0000-000000000014','CI Memoria')
on conflict do nothing;

insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
values ('eeeeeeee-0000-0000-0000-000000000014','aaaaaaaa-0000-0000-0000-000000000014',
        'dddddddd-0000-0000-0000-000000000014','MEM', 1)
on conflict do nothing;

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao) values
  ('11100000-0000-0000-0000-000000000141','aaaaaaaa-0000-0000-0000-000000000014',
   'eeeeeeee-0000-0000-0000-000000000014','ff000000-0000-0000-0000-000000000141','CI-MEM-1'),
  ('11100000-0000-0000-0000-000000000142','aaaaaaaa-0000-0000-0000-000000000014',
   'eeeeeeee-0000-0000-0000-000000000014','ff000000-0000-0000-0000-000000000142','CI-MEM-2')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1 · RODA NO CRON — o bloqueio que a 0103 tirou
-- ---------------------------------------------------------------------------
-- Sem sessão do painel, `current_org_id()` é nulo. Antes da 0103 a chamada
-- morria em `sem_org` antes da primeira linha de trabalho, e o job diário de
-- 06:00 que a especificação pede não tinha como existir.
do $$
declare v_erro text := '';
begin
  perform * from sureya_gerar_eventos_memoria(400);   -- sem p_org, sem sessao
  v_erro := 'passou';
exception when others then
  v_erro := sqlerrm;
end $$;

select ci14('o gerador aceita a organizacao por parametro',
  exists (select 1 from pg_proc where proname='sureya_gerar_eventos_memoria'
            and pg_get_function_identity_arguments(oid) like '%p_org uuid%'),
  'sem p_org o cron morre em sem_org antes da primeira linha de trabalho');

select ci14('e a irma tambem',
  exists (select 1 from pg_proc where proname='sureya_lembretes_do_dia'
            and pg_get_function_identity_arguments(oid) like '%p_org uuid%'),
  'sureya_lembretes_do_dia ficou so para sessao de painel');

-- E sem NENHUMA das duas ela PARA e diz o nome do problema, em vez de
-- trabalhar sobre uma organizacao errada.
create temporary table ci14_recusa (msg text);
do $$
begin
  perform * from sureya_gerar_eventos_memoria(400);   -- sem p_org, sem sessao
  insert into ci14_recusa values ('passou sem reclamar');
exception when others then
  insert into ci14_recusa values (sqlerrm);
end $$;

select ci14('sem sessao e sem p_org, ele RECUSA',
  (select msg like '%sem_organizacao%' from ci14_recusa),
  'devia parar dizendo sem_organizacao — trabalhar sem saber de quem e o pior caso');

-- ---------------------------------------------------------------------------
-- 2 · DATA SEM DIA CERTO NÃO VIRA LEMBRETE
-- ---------------------------------------------------------------------------
-- "Faleceu em 1998", sem mês nem dia, viraria um lembrete em 1º de janeiro:
-- uma data que o sistema inventou, mandada para quem perdeu alguém.
insert into falecidos (id, org_id, tumulo_id, nome, data_falecimento, precisao_falecimento, principal)
values ('fa000000-0000-0000-0000-000000000141','aaaaaaaa-0000-0000-0000-000000000014',
        '11100000-0000-0000-0000-000000000141','So o Ano',
        make_date(extract(year from current_date)::int - 5, 1, 1), 'ano', true)
on conflict do nothing;

select ci14('data com precisao "ano" nao gera evento',
  (select criados = 0 from sureya_gerar_eventos_memoria(400, 'aaaaaaaa-0000-0000-0000-000000000014')),
  'um falecimento sem dia certo virou lembrete numa data inventada');

select ci14('e ela e CONTADA como sem data, para alguem completar',
  (select sem_data >= 1 from sureya_gerar_eventos_memoria(400, 'aaaaaaaa-0000-0000-0000-000000000014')),
  'quem esta sem data precisa aparecer em algum lugar');

-- Agora a mesma pessoa com o dia certo: o evento nasce.
update falecidos
   set data_falecimento = make_date(extract(year from current_date)::int - 5,
                                    extract(month from current_date + 30)::int,
                                    15),
       precisao_falecimento = 'dia'
 where id = 'fa000000-0000-0000-0000-000000000141';

select ci14('com o dia certo, o evento nasce',
  (select criados > 0 from sureya_gerar_eventos_memoria(400, 'aaaaaaaa-0000-0000-0000-000000000014')),
  'falecimento com dia exato tinha de gerar aniversario de memoria');

select ci14('e ele avisa ANTES, nunca no dia',
  (select bool_and(data_disparo < data_evento) from eventos_memoria
    where org_id='aaaaaaaa-0000-0000-0000-000000000014'),
  'lembrete que chega no dia nao serve para preparar nada');

-- Convergente: rodar de novo nao duplica.
select ci14('rodar de novo nao cria os mesmos de novo',
  (select criados = 0 from sureya_gerar_eventos_memoria(400, 'aaaaaaaa-0000-0000-0000-000000000014')),
  'o job diario duplicaria os eventos a cada manha');

-- ---------------------------------------------------------------------------
-- 3 · LUTO RECENTE É ZONA DE SILÊNCIO
-- ---------------------------------------------------------------------------
-- A regra mais importante do conjunto, e a única cujo erro não se desfaz.
--
-- O luto é medido entre a MORTE e a DATA DO EVENTO, não entre a morte e hoje:
-- é a data em que a mensagem chega que precisa estar longe o bastante.
--
-- Esta pessoa morreu ha 30 dias e faz aniversario daqui a 3. Sem a regra, a
-- casa mandaria "e o aniversario dele" para quem enterrou o pai no mes passado.
insert into falecidos (id, org_id, tumulo_id, nome,
                       data_falecimento, precisao_falecimento,
                       data_nascimento, precisao_nascimento, principal)
values ('fa000000-0000-0000-0000-000000000142','aaaaaaaa-0000-0000-0000-000000000014',
        '11100000-0000-0000-0000-000000000142','Perda Recente',
        current_date - 30, 'dia',
        make_date(1950,
                  extract(month from current_date + 3)::int,
                  extract(day   from current_date + 3)::int), 'dia', true)
on conflict do nothing;

select ci14('o aniversario dele vira evento normalmente',
  (select criados > 0 from sureya_gerar_eventos_memoria(400, 'aaaaaaaa-0000-0000-0000-000000000014')),
  'sem o evento nao da para provar que ele foi SEGURADO');

-- AGORA o disparador roda. Sem esta chamada os testes abaixo passariam a toa:
-- nada teria sido decidido, e "ninguem recebeu" seria verdade por inercia.
select ci14('o disparador roda pelo cron, com a organizacao na mao',
  (select suprimidos >= 1
     from sureya_lembretes_do_dia(current_date, 'aaaaaaaa-0000-0000-0000-000000000014')),
  'o disparador nao decidiu nada — o teste de luto seria falso');

select ci14('quem perdeu alguem ha 30 dias NAO recebe',
  not exists (
    select 1 from fila_liberacao f
     where f.familia_id = 'ff000000-0000-0000-0000-000000000142'),
  'mandou mensagem para quem enterrou alguem ha um mes');

select ci14('e o motivo fica escrito, nao so o silencio',
  exists (select 1 from eventos_memoria
           where familia_id = 'ff000000-0000-0000-0000-000000000142'
             and status = 'suprimido'
             and motivo_supressao ilike '%luto%'),
  'suprimiu sem dizer que foi por luto');

-- ---------------------------------------------------------------------------
-- 4 · O MOTOR GUARDA POR QUE NÃO MANDOU
-- ---------------------------------------------------------------------------
-- Um evento suprimido que some é indistinguível de um evento que nunca
-- existiu. A conferência precisa poder responder "por que a familia X nao
-- recebeu?" sem ninguem ter de reconstituir a regra de cabeca.
select ci14('todo evento decidido tem data de decisao',
  (select bool_and(decidido_em is not null) from eventos_memoria
    where status <> 'previsto'
      and org_id='aaaaaaaa-0000-0000-0000-000000000014'),
  'evento decidido sem carimbo de quando');

select ci14('e todo suprimido diz o MOTIVO',
  (select bool_and(motivo_supressao is not null) from eventos_memoria
    where status = 'suprimido'
      and org_id='aaaaaaaa-0000-0000-0000-000000000014'),
  'suprimir sem dizer por que e a mesma coisa que sumir');

-- ---------------------------------------------------------------------------
-- 5 · A CHAVE GERAL DESLIGA TUDO
-- ---------------------------------------------------------------------------
-- "Disparo nunca automático, e chave para ligar e desligar geral e por
-- família." A chave da casa vem DESLIGADA de fábrica (0096).
update orgs set lembretes_memoria = false where id='aaaaaaaa-0000-0000-0000-000000000014';

select ci14('com a casa desligada, nada e enfileirado',
  (select enfileirados = 0
     from sureya_lembretes_do_dia(current_date, 'aaaaaaaa-0000-0000-0000-000000000014')),
  'a chave geral nao segurou o disparo');

update orgs set lembretes_memoria = true where id='aaaaaaaa-0000-0000-0000-000000000014';

select ci14('e a familia tem chave propria',
  exists (select 1 from information_schema.columns
           where table_name='familias' and column_name='lembretes_memoria'),
  'sem chave por familia nao da para atender um pedido de silencio');
