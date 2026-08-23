-- ============================================================================
-- REORGANIZAR A AGENDA — e a razao de o botao nao ter funcionado
--
-- Medido em producao em 23/08/2026, e reproduzido aqui linha por linha:
--
--   · duas lavagens paradas em 17/08, uma SEGUNDA-FEIRA. O contador da tela
--     as chamava de "fora da jornada" (estavam no passado); a funcao do banco
--     nao mexia nelas, porque segunda e dia de trabalho e portanto
--     data_prevista = proximo_dia_util(data_prevista). O aviso "2 lavagens
--     fora do lugar" ficava na tela para sempre;
--   · quatro lavagens do MESMO jazigo no dia 24, com data_plano 01/08, 09/08,
--     17/08 e 25/08. Ninguem contava e ninguem movia.
--
-- Este arquivo cobra as tres coisas que a 0092 tinha de resolver:
--   1. contador e movedor concordam (a mesma regra, no banco);
--   2. o atrasado sai do passado;
--   3. do empilhamento sobra UMA no dia, e as excedentes voltam para a fila.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci9(nome text, real_ text, esperado text) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'AGENDA FALHOU — %: veio [%], esperado [%]', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

create or replace function ci9b(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'AGENDA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into auth.users (id, email)
  values ('f0f0f0f0-0000-0000-0000-000000000009','agenda@sureya.test') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','f0f0f0f0-0000-0000-0000-000000000009', false);

insert into orgs (id, nome, dias_semana)
  values ('aaaaaaaa-0000-0000-0000-000000000009','CI Agenda', '{1,2,3,4,5}')
  on conflict (id) do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('aaaaaaaa-0000-0000-0000-000000000009','f0f0f0f0-0000-0000-0000-000000000009','admin', true)
  on conflict do nothing;
insert into cemiterios (id, org_id, nome)
  values ('dddddddd-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000009','CI Cem Agenda')
  on conflict (id) do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
  values ('eeeeeeee-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000009',
          'dddddddd-0000-0000-0000-000000000009','Q Agenda', 1) on conflict (id) do nothing;
insert into familias (id, org_id, nome, modo_cobranca)
  values ('bbbbbbbb-0000-0000-0000-000000000091','aaaaaaaa-0000-0000-0000-000000000009',
          'Familia Perrela','consumo') on conflict (id) do nothing;

-- Dois jazigos: um para o atraso, outro para a pilha.
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo, valor_lavagem)
values
  ('ffffffff-0000-0000-0000-000000000091','aaaaaaaa-0000-0000-0000-000000000009',
   'eeeeeeee-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000091',
   'Perrela','P-1', 40),
  ('ffffffff-0000-0000-0000-000000000092','aaaaaaaa-0000-0000-0000-000000000009',
   'eeeeeeee-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000091',
   'Souza','S-1', 40)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- O CENARIO
--
-- As datas sao calculadas a partir de `current_date` para o teste nao apodrecer
-- com o calendario. O que importa nao e o dia do mes: e que o atrasado esteja
-- num DIA DE TRABALHO no passado — que era exatamente o buraco entre as duas
-- regras — e que quatro lavagens do mesmo jazigo caiam no mesmo dia futuro.
-- ---------------------------------------------------------------------------
with dias as (
  -- a segunda-feira mais recente que ja passou, e a proxima que ainda vem
  select
    (select d::date from generate_series(current_date - 14, current_date - 1, interval '1 day') d
      where extract(dow from d) = 1 order by d desc limit 1) as segunda_passada,
    (select d::date from generate_series(current_date + 1, current_date + 14, interval '1 day') d
      where extract(dow from d) = 1 order by d asc limit 1) as segunda_futura
)
insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_plano, valor, ordem_dia)
select * from (
  select '99999999-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000009'::uuid,
         'ffffffff-0000-0000-0000-000000000092'::uuid, 'agendado'::sureya_status_servico,
         segunda_passada, segunda_passada, 40::numeric, 1 from dias
  union all
  -- a pilha: quatro do MESMO jazigo no mesmo dia, com planos diferentes
  select ('99999999-0000-0000-0000-00000000000'||n::text)::uuid, 'aaaaaaaa-0000-0000-0000-000000000009'::uuid,
         'ffffffff-0000-0000-0000-000000000091'::uuid, 'agendado'::sureya_status_servico,
         segunda_futura, segunda_futura - (n * 8), 40::numeric, n
    from dias, generate_series(2, 5) n
) x;

-- ---------------------------------------------------------------------------
-- 1 · O CONTADOR VE AS CINCO — duas coisas que antes ninguem somava junto
-- ---------------------------------------------------------------------------
select ci9('o contador ve o atraso',
  (select atrasadas::text from sureya_agenda_fora_do_lugar(120)), '1');

select ci9('e ve as tres excedentes da pilha (nao as quatro)',
  (select repetidas::text from sureya_agenda_fora_do_lugar(120)), '3');

select ci9b('o atrasado NAO e "dia que nao se trabalha" — era ai que a conta furava',
  (select dia_nao_util = 0 from sureya_agenda_fora_do_lugar(120)),
  'a segunda-feira passada foi classificada como dia nao util');

select ci9('total fora do lugar',
  (select total::text from sureya_agenda_fora_do_lugar(120)), '4');

-- ---------------------------------------------------------------------------
-- 2 · O MOVEDOR MEXE EXATAMENTE NO QUE O CONTADOR CONTOU
--
-- Este e O teste do arquivo. Antes, o contador dizia 2 e o movedor dizia 0 —
-- e nenhuma das duas respostas estava errada isolada: elas respondiam
-- perguntas diferentes. Agora ha uma pergunta so.
-- ---------------------------------------------------------------------------
create temporary table antes as select * from sureya_agenda_fora_do_lugar(120);

select ci9b('movedor e contador dao o mesmo numero',
  (select r.movidos = (select total from antes)
     from sureya_reorganizar_agenda(120) r),
  'o botao continua movendo um numero diferente do que o aviso mostra');

select ci9('e depois de mover nao sobra nada fora do lugar',
  (select total::text from sureya_agenda_fora_do_lugar(120)), '0');

-- ---------------------------------------------------------------------------
-- 3 · O QUE ACONTECEU COM CADA UMA
-- ---------------------------------------------------------------------------
select ci9b('o atrasado saiu do passado',
  (select data_prevista >= current_date from servicos
    where id = '99999999-0000-0000-0000-000000000001'),
  'a lavagem atrasada continua marcada num dia que ja passou');

select ci9b('e voltou para a fila, que e o unico estado que o alocador enxerga',
  (select status = 'pendente' and ordem_dia is null from servicos
    where id = '99999999-0000-0000-0000-000000000001'),
  'ficou agendada: o alocador nao vai redistribui-la');

-- Da pilha, UMA fica no dia (a de plano mais antigo, a que menos pode esperar)
-- e tres voltam para a fila. Quem escolhe o dia novo delas e o alocador, que e
-- quem conhece capacidade, rua e a regra de uma lavagem por jazigo por dia.
select ci9('da pilha, uma so continua agendada no dia',
  (select count(*)::text from servicos
    where tumulo_id = 'ffffffff-0000-0000-0000-000000000091' and status = 'agendado'), '1');

select ci9('e as outras tres voltaram para a fila',
  (select count(*)::text from servicos
    where tumulo_id = 'ffffffff-0000-0000-0000-000000000091' and status = 'pendente'), '3');

select ci9b('a que ficou e a de plano mais antigo',
  (select s.data_plano = (select min(data_plano) from servicos
                           where tumulo_id = 'ffffffff-0000-0000-0000-000000000091')
     from servicos s
    where s.tumulo_id = 'ffffffff-0000-0000-0000-000000000091' and s.status = 'agendado'),
  'ficou uma lavagem qualquer no dia, e nao a mais atrasada');

select ci9b('nenhuma lavagem sumiu',
  (select count(*) = 5 from servicos
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000009'),
  'o reorganizar apagou alguma coisa');

-- ---------------------------------------------------------------------------
-- 4 · RODAR DE NOVO NAO FAZ MAL
--
-- A tela tem um botao: alguem vai clicar duas vezes. A segunda passada tem de
-- ser um nada acontece, e nao uma segunda rodada de mudancas.
-- ---------------------------------------------------------------------------
select ci9('rodar de novo nao move mais nada',
  (select movidos::text from sureya_reorganizar_agenda(120)), '0');

-- ---------------------------------------------------------------------------
-- 5 · SO A PROPRIA ORGANIZACAO
--
-- A funcao e SECURITY DEFINER: ela ignora RLS por construcao, e a unica coisa
-- entre ela e a agenda alheia e o `current_org_id()` de dentro. Sem este teste,
-- um `where` esquecido reorganizaria a agenda de outra empresa.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
  values ('f0f0f0f0-0000-0000-0000-000000000099','outra@sureya.test') on conflict (id) do nothing;
insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000099','CI Outra Agenda')
  on conflict (id) do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('aaaaaaaa-0000-0000-0000-000000000099','f0f0f0f0-0000-0000-0000-000000000099','admin', true)
  on conflict do nothing;

-- volta a pilha para o estado sujo, e olha dali de fora
update servicos set status = 'agendado', data_prevista = current_date - 7
 where org_id = 'aaaaaaaa-0000-0000-0000-000000000009';

select set_config('request.jwt.claim.sub','f0f0f0f0-0000-0000-0000-000000000099', false);

select ci9('a outra organizacao nao ve nada fora do lugar aqui',
  (select coalesce(total, 0)::text from sureya_agenda_fora_do_lugar(120)), '0');

select ci9('e reorganizar de la nao move nada daqui',
  (select movidos::text from sureya_reorganizar_agenda(120)), '0');

select set_config('request.jwt.claim.sub','f0f0f0f0-0000-0000-0000-000000000009', false);
select ci9('a agenda desta organizacao continua intacta',
  (select count(*)::text from servicos
    where org_id = 'aaaaaaaa-0000-0000-0000-000000000009' and data_prevista = current_date - 7), '5');

-- ============================================================================
-- 6 · A ULTIMA LAVAGEM DO JAZIGO (0093)
--
-- E o jazigo que ficava orfao depois de salvo: SEIS em producao em 23/08, todos
-- na Quadra 4, entre eles o "Americo damo" ligado a familia DAMO 2. A causa era
-- o codigo perguntar `cliente_id is null` para saber se o jazigo tinha familia
-- — e `cliente_id` e o CONTATO, nulo justamente nas familias que ainda nao tem
-- com quem falar.
-- ============================================================================
select set_config('request.jwt.claim.sub','f0f0f0f0-0000-0000-0000-000000000009', false);

-- Uma familia SEM contato nenhum, e um jazigo dela. E exatamente o caso DAMO 2.
insert into familias (id, org_id, nome, modo_cobranca)
  values ('bbbbbbbb-0000-0000-0000-000000000092','aaaaaaaa-0000-0000-0000-000000000009',
          'DAMO 2','consumo') on conflict (id) do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo, valor_lavagem)
  values ('ffffffff-0000-0000-0000-000000000093','aaaaaaaa-0000-0000-0000-000000000009',
          'eeeeeeee-0000-0000-0000-000000000009','bbbbbbbb-0000-0000-0000-000000000092',
          'Americo damo','Q4-T6-010', 40) on conflict (id) do nothing;

select ci9b('o jazigo tem familia e NAO tem contato — o caso DAMO 2',
  (select familia_id is not null and cliente_id is null from tumulos
    where id = 'ffffffff-0000-0000-0000-000000000093'),
  'o cenario nao montou: sem ele o teste abaixo nao prova nada');

-- ESTE e o teste do defeito. A pergunta velha (`cliente_id is null`) traria
-- este jazigo; a certa nao traz.
select ci9('a pergunta velha (por contato) acusaria o jazigo como orfao',
  (select count(*)::text from tumulos
    where id = 'ffffffff-0000-0000-0000-000000000093' and cliente_id is null), '1');

select ci9('a view NAO o traz como sem familia — era isso que nao saia da tela',
  (select count(*)::text from sureya_jazigos_sem_familia
    where id = 'ffffffff-0000-0000-0000-000000000093'), '0');

-- ---------------------------------------------------------------------------
-- A ultima lavagem: a mais recente, e nao a primeira que aparecer
-- ---------------------------------------------------------------------------
insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada,
                      iniciado_em, foto_depois_url, valor)
values
  ('99999999-0000-0000-0000-000000000091','aaaaaaaa-0000-0000-0000-000000000009',
   'ffffffff-0000-0000-0000-000000000093','executado', current_date - 30,
   now() - interval '30 days', null, null, 40),
  ('99999999-0000-0000-0000-000000000092','aaaaaaaa-0000-0000-0000-000000000009',
   'ffffffff-0000-0000-0000-000000000093','executado', current_date - 10,
   now() - interval '10 days', now() - interval '10 days', 'https://exemplo/d.jpg', 40);

select ci9('a ultima lavagem e uma so por jazigo',
  (select count(*)::text from sureya_ultima_lavagem_jazigo
    where tumulo_id = 'ffffffff-0000-0000-0000-000000000093'), '1');

select ci9b('e e a MAIS RECENTE',
  (select servico_id = '99999999-0000-0000-0000-000000000092'
     from sureya_ultima_lavagem_jazigo
    where tumulo_id = 'ffffffff-0000-0000-0000-000000000093'),
  'pegou a lavagem antiga em vez da recente');

select ci9b('a que passou pelo botao Comecar aparece como de campo',
  (select no_campo from sureya_ultima_lavagem_jazigo
    where tumulo_id = 'ffffffff-0000-0000-0000-000000000093'),
  'a lavagem tem iniciado_em e nao foi marcada como de campo');

-- ---------------------------------------------------------------------------
-- ESTORNO NAO CONTA
--
-- Uma lavagem estornada foi anulada e o valor voltou como credito. Continuar
-- dizendo que o jazigo foi lavado naquele dia e afirmar o que a propria casa ja
-- disse que nao aconteceu — e faria a agenda pular uma lavagem devida.
-- ---------------------------------------------------------------------------
update servicos set estornado_em = now(), motivo_estorno = 'lancada no jazigo errado'
 where id = '99999999-0000-0000-0000-000000000092';

select ci9b('estornada deixa de ser a ultima, e a anterior assume',
  (select servico_id = '99999999-0000-0000-0000-000000000091'
     from sureya_ultima_lavagem_jazigo
    where tumulo_id = 'ffffffff-0000-0000-0000-000000000093'),
  'a lavagem estornada continua contando como a ultima');

select ci9b('a anotada pelo painel NAO se apresenta como de campo',
  (select no_campo = false from sureya_ultima_lavagem_jazigo
    where tumulo_id = 'ffffffff-0000-0000-0000-000000000093'),
  'lavagem sem iniciado_em apareceu como registrada no campo');

-- Jazigo nunca lavado simplesmente nao aparece — a tela diz "sem lavagem
-- registrada" em vez de inventar uma data.
select ci9('jazigo nunca lavado nao aparece na view',
  (select count(*)::text from sureya_ultima_lavagem_jazigo
    where tumulo_id = 'ffffffff-0000-0000-0000-000000000091'), '0');
