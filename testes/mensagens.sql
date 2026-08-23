-- ============================================================================
-- O CONJUNTO DE TEXTOS E A CHAVE DE ENVIO, PROVADOS A CADA COMMIT
--
-- O que se viu no campo em 22/08: a fila de liberacao mostrou "A limpeza foi
-- feita. Segue a foto." — o texto de reserva escrito dentro da funcao, nao o
-- texto da casa. Aqui esse caminho e exercitado de proposito: insere na fila
-- SEM texto e com o texto velho, e cobra que sai um modelo de verdade.
--
-- E prova a chave dos dois lados: a familia sobrepoe a casa, ligando e
-- desligando.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci5(nome text, real_ text, esperado text) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'MENSAGENS FALHOU — %: veio [%], esperado [%]', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

create or replace function ci5b(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'MENSAGENS FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

-- ---------------------------------------------------------------------------
-- O CENARIO
-- ---------------------------------------------------------------------------
insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000005','CI Mensagens')
  on conflict do nothing;

insert into familias (id, org_id, nome) values
  ('bbbbbbbb-0000-0000-0000-000000000051','aaaaaaaa-0000-0000-0000-000000000005','Familia Segue A Casa'),
  ('bbbbbbbb-0000-0000-0000-000000000052','aaaaaaaa-0000-0000-0000-000000000005','Familia Nao Quer'),
  ('bbbbbbbb-0000-0000-0000-000000000053','aaaaaaaa-0000-0000-0000-000000000005','Familia Quer Sempre')
  on conflict (id) do nothing;

insert into clientes (id, org_id, nome, telefone, familia_id, recebe_fotos) values
  ('cccccccc-0000-0000-0000-000000000051','aaaaaaaa-0000-0000-0000-000000000005',
   'Sr. Andre Nagae','5511900000051','bbbbbbbb-0000-0000-0000-000000000051', true)
  on conflict (id) do nothing;

-- OS TEXTOS DESTE TESTE, e so eles.
--
-- Desde a 0089 toda organizacao nasce com os cinco textos da casa, por gatilho.
-- Otimo em producao e ruim aqui: as conferencias abaixo cobram QUAL texto saiu,
-- e com oito no bolo elas nao provariam nada. Tira os cinco e poe tres que eu
-- reconheco pelo nome.
--
-- Que o gatilho povoou de verdade e conferido antes de apagar — senao este
-- delete esconderia a regressao que a 0089 existe para impedir.
select ci5('organizacao nova nasce com os textos da casa (0089)',
  (select count(*)::text from modelos_mensagem
    where org_id='aaaaaaaa-0000-0000-0000-000000000005' and tipo='foto'), '5');

delete from modelos_mensagem where org_id='aaaaaaaa-0000-0000-0000-000000000005';

insert into modelos_mensagem (org_id, tipo, ordem, texto) values
  ('aaaaaaaa-0000-0000-0000-000000000005','foto',1,'Modelo um para {nome}.'),
  ('aaaaaaaa-0000-0000-0000-000000000005','foto',2,'Modelo dois para {nome}.'),
  ('aaaaaaaa-0000-0000-0000-000000000005','foto',3,'Modelo tres para {nome}.');

-- ---------------------------------------------------------------------------
-- O SORTEIO
-- ---------------------------------------------------------------------------
-- O TRATAMENTO FAZ PARTE DO NOME. "Sr." sozinho e uma grosseria automatizada;
-- "Andre" sem o "Sr." tambem nao serve para o publico da casa. Mesmos casos que
-- os testes do TypeScript cobram em primeiroNome().
select ci5('Sr. Andre Nagae -> Sr. Andre',   sureya_primeiro_nome('Sr. Andre Nagae'),   'Sr. Andre');
select ci5('Dona Nadir Souza -> Dona Nadir', sureya_primeiro_nome('Dona Nadir Souza'),  'Dona Nadir');
select ci5('Maria da Silva -> Maria',        sureya_primeiro_nome('Maria da Silva'),    'Maria');
select ci5('nome de uma palavra so',         sureya_primeiro_nome('Nagae'),             'Nagae');
select ci5('espacos sobrando nao atrapalham', sureya_primeiro_nome('  Sr.   Joao  Batista '), 'Sr. Joao');
select ci5('nome vazio nao estoura',         coalesce(sureya_primeiro_nome(''),'<nulo>'), '');

select ci5('o tratamento chega no texto sorteado',
  (select sureya_texto_modelo('aaaaaaaa-0000-0000-0000-000000000005','foto','x','Sr. Andre Nagae')),
  (select replace(texto,'{nome}','Sr. Andre') from modelos_mensagem
    where org_id='aaaaaaaa-0000-0000-0000-000000000005' and tipo='foto'
    order by ordem, created_at, id
    offset mod(abs(hashtext('x')::bigint), 3::bigint)::int limit 1));

select ci5b('sai um dos modelos cadastrados, nao a frase antiga',
  (select sureya_texto_modelo('aaaaaaaa-0000-0000-0000-000000000005','foto','x','Andre')
          in ('Modelo um para Andre.','Modelo dois para Andre.','Modelo tres para Andre.')),
  'devolveu texto de fora do conjunto');

-- A SEMENTE MANDA. Sem isso, uma reparacao de servico trocaria a mensagem que
-- a Sureya ja tinha lido na fila.
select ci5b('a mesma semente devolve sempre o mesmo texto',
  (select sureya_texto_modelo('aaaaaaaa-0000-0000-0000-000000000005','foto','semente-fixa','Andre')
        = sureya_texto_modelo('aaaaaaaa-0000-0000-0000-000000000005','foto','semente-fixa','Andre')),
  'o mesmo servico recebeu textos diferentes em duas chamadas');

-- E sementes diferentes tem de VARIAR, senao o conjunto nao serve para nada.
select ci5b('sementes diferentes usam mais de um modelo',
  (select count(distinct sureya_texto_modelo(
            'aaaaaaaa-0000-0000-0000-000000000005','foto','s'||g::text,'Andre')) > 1
     from generate_series(1,40) g),
  'todas as sementes cairam no mesmo modelo');

-- Org sem modelo nenhum nao pode devolver nulo: a coluna texto e obrigatoria.
select ci5b('org sem modelo ainda devolve uma frase',
  (select coalesce(btrim(sureya_texto_modelo(gen_random_uuid(),'foto','x','Andre')),'') <> ''),
  'devolveu vazio para org sem modelo');

-- ---------------------------------------------------------------------------
-- A CHAVE, NOS DOIS SENTIDOS
-- ---------------------------------------------------------------------------
update orgs set enviar_fotos_familia = true where id='aaaaaaaa-0000-0000-0000-000000000005';
update familias set enviar_fotos = null  where id='bbbbbbbb-0000-0000-0000-000000000051';
update familias set enviar_fotos = false where id='bbbbbbbb-0000-0000-0000-000000000052';
update familias set enviar_fotos = true  where id='bbbbbbbb-0000-0000-0000-000000000053';

select ci5('casa ligada, familia nula: envia',
  sureya_envia_fotos('bbbbbbbb-0000-0000-0000-000000000051')::text, 'true');
select ci5('casa ligada, familia desligada: NAO envia',
  sureya_envia_fotos('bbbbbbbb-0000-0000-0000-000000000052')::text, 'false');

update orgs set enviar_fotos_familia = false where id='aaaaaaaa-0000-0000-0000-000000000005';

select ci5('casa desligada, familia nula: nao envia',
  sureya_envia_fotos('bbbbbbbb-0000-0000-0000-000000000051')::text, 'false');
select ci5('casa desligada, familia ligada: ENVIA assim mesmo',
  sureya_envia_fotos('bbbbbbbb-0000-0000-0000-000000000053')::text, 'true');

update orgs set enviar_fotos_familia = true where id='aaaaaaaa-0000-0000-0000-000000000005';

-- ---------------------------------------------------------------------------
-- A PORTA DA FILA — que e onde a politica age de verdade
-- ---------------------------------------------------------------------------
-- 1) Texto vazio: o gatilho poe um modelo.
insert into fila_liberacao (org_id, familia_id, cliente_id, tipo, texto, fotos)
values ('aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000051',
        'cccccccc-0000-0000-0000-000000000051','foto','', '[]'::jsonb);

select ci5b('fila sem texto recebe um modelo da casa',
  (select texto like 'Modelo % para Sr. Andre.' from fila_liberacao
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051' order by criado_em desc limit 1),
  'a linha ficou com o texto vazio');

-- 2) A FRASE DE 22/08: o gatilho troca.
insert into fila_liberacao (org_id, familia_id, cliente_id, tipo, texto, fotos)
values ('aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000051',
        'cccccccc-0000-0000-0000-000000000051','foto','A limpeza foi feita. Segue a foto. 🌿','[]'::jsonb);

select ci5b('a frase que apareceu em producao e trocada por um modelo',
  (select texto like 'Modelo % para Sr. Andre.' from fila_liberacao
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051' order by criado_em desc limit 1),
  'a frase de reserva chegou inteira na fila de novo');

-- 3) Texto escolhido pela aplicacao passa INTACTO. Se o gatilho sobrescrevesse
--    tudo, ele jogaria fora a mensagem boa do mensagens.ts.
insert into fila_liberacao (org_id, familia_id, cliente_id, tipo, texto, fotos)
values ('aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000051',
        'cccccccc-0000-0000-0000-000000000051','foto','Texto que a aplicacao escreveu.','[]'::jsonb);

select ci5('texto da aplicacao passa sem ser tocado',
  (select texto from fila_liberacao
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051' order by criado_em desc limit 1),
  'Texto que a aplicacao escreveu.');

-- 4) Familia desligada: a linha nao nasce.
insert into fila_liberacao (org_id, familia_id, cliente_id, tipo, texto, fotos)
values ('aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000052',
        'cccccccc-0000-0000-0000-000000000051','foto','qualquer coisa','[]'::jsonb);

select ci5('familia com a chave desligada nao entra na fila',
  (select count(*)::text from fila_liberacao where familia_id='bbbbbbbb-0000-0000-0000-000000000052'),
  '0');

-- 5) A chave e so das FOTOS. Cobranca da mesma familia continua entrando —
--    "nao quero receber foto" nao e "nao me cobre".
insert into fila_liberacao (org_id, familia_id, cliente_id, tipo, texto, fotos)
values ('aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000052',
        'cccccccc-0000-0000-0000-000000000051','cobranca','A cobranca do mes.','[]'::jsonb);

select ci5('a chave nao interfere na cobranca',
  (select count(*)::text from fila_liberacao
    where familia_id='bbbbbbbb-0000-0000-0000-000000000052' and tipo='cobranca'),
  '1');

-- ---------------------------------------------------------------------------
-- A LISTA QUE A TELA DE LIBERACAO OFERECE (0086)
--
-- Uma primeira versao da rota tentou arrancar esta lista do SORTEIO, chamando-o
-- uma vez por modelo com sementes diferentes. Nao funciona: a semente escolhe
-- qual sai, nao qual eu quero. O teste abaixo e o que cobra a diferenca.
-- ---------------------------------------------------------------------------
select ci5('a lista traz todos os modelos ativos',
  (select count(*)::text from sureya_textos_do_tipo(
     'aaaaaaaa-0000-0000-0000-000000000005','foto','Sr. Andre Nagae')), '3');

select ci5b('sao os TRES modelos diferentes, nao o mesmo tres vezes',
  (select count(distinct texto) = 3 from sureya_textos_do_tipo(
     'aaaaaaaa-0000-0000-0000-000000000005','foto','Sr. Andre Nagae')),
  'a lista repetiu texto — o sorteio vazou para dentro dela');

select ci5b('o tratamento aparece na lista igual ao do sorteio',
  (select bool_and(texto like '%Sr. Andre%') from sureya_textos_do_tipo(
     'aaaaaaaa-0000-0000-0000-000000000005','foto','Sr. Andre Nagae')),
  'a lista renderizou o nome de um jeito e o sorteio de outro');

-- Modelo desligado nao pode ser oferecido.
update modelos_mensagem set ativo = false
 where org_id='aaaaaaaa-0000-0000-0000-000000000005' and ordem = 3;
select ci5('modelo desligado sai da lista',
  (select count(*)::text from sureya_textos_do_tipo(
     'aaaaaaaa-0000-0000-0000-000000000005','foto','Andre')), '2');
update modelos_mensagem set ativo = true
 where org_id='aaaaaaaa-0000-0000-0000-000000000005' and ordem = 3;

do $$ begin raise notice 'MENSAGENS: todas as conferencias passaram'; end $$;

-- ============================================================================
-- QUANDO ESTA FAMILIA RECEBEU FOTO (0087)
--
-- O ponto sutil: sao DOIS caminhos de envio. Olhar so a fila daria "nunca
-- recebeu" para quem recebeu pelo envio automatico da conclusao — e a Sureya
-- mandaria de novo achando que era a primeira.
-- ============================================================================
insert into cemiterios (id, org_id, nome)
  values ('dddddddd-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000005','CI Cem Msg')
  on conflict (id) do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
  values ('eeeeeeee-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000005',
          'dddddddd-0000-0000-0000-000000000005','Quadra CI', 1)
  on conflict (id) do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo) values
  ('ffffffff-0000-0000-0000-000000000051','aaaaaaaa-0000-0000-0000-000000000005',
   'eeeeeeee-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000051','Pedra A','A-1'),
  ('ffffffff-0000-0000-0000-000000000052','aaaaaaaa-0000-0000-0000-000000000005',
   'eeeeeeee-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000051','Pedra B','A-2')
  on conflict (id) do nothing;

-- Antes de qualquer envio: a familia nao aparece na view. "Sem linha" e
-- "nunca recebeu", e a tela precisa saber distinguir isso de "recebeu ha zero".
select ci5('familia sem envio nao aparece na lista',
  (select count(*)::text from sureya_ultima_foto_familia
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051'), '0');

-- CAMINHO 1 — a fila. Uma ENVIADA conta; uma aguardando e uma descartada, nao.
insert into fila_liberacao (org_id, familia_id, cliente_id, tumulo_id, tipo, texto, fotos,
                            status, decidido_em)
values ('aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000051',
        'cccccccc-0000-0000-0000-000000000051','ffffffff-0000-0000-0000-000000000051',
        'foto','ja foi','[]'::jsonb,'enviado', now() - interval '20 days'),
       ('aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000051',
        'cccccccc-0000-0000-0000-000000000051','ffffffff-0000-0000-0000-000000000051',
        'foto','esperando','[]'::jsonb,'aguardando', null),
       ('aaaaaaaa-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000051',
        'cccccccc-0000-0000-0000-000000000051','ffffffff-0000-0000-0000-000000000051',
        'foto','descartada','[]'::jsonb,'descartado', now() - interval '1 day');

select ci5('so a ENVIADA conta',
  (select total::text from sureya_ultima_foto_familia
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051'), '1');
select ci5b('e a data e a dela',
  (select ultima_em < now() - interval '19 days' from sureya_ultima_foto_familia
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051'),
  'pegou a data da descartada, que e de ontem');

-- CAMINHO 2 — o envio automatico da conclusao, que NAO passa pela fila.
insert into servicos (id, org_id, tumulo_id, status, data_executada, notificado_cliente)
values ('99999999-0000-0000-0000-000000000051','aaaaaaaa-0000-0000-0000-000000000005',
        'ffffffff-0000-0000-0000-000000000052','executado',
        now() - interval '3 days', true),
       -- executado mas NAO notificado: a familia nao recebeu nada.
       ('99999999-0000-0000-0000-000000000052','aaaaaaaa-0000-0000-0000-000000000005',
        'ffffffff-0000-0000-0000-000000000052','executado',
        now() - interval '1 day', false);

select ci5('o envio automatico entra na conta',
  (select total::text from sureya_ultima_foto_familia
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051'), '2');
select ci5b('e passa a ser ele a data mais recente',
  (select ultima_em > now() - interval '4 days' from sureya_ultima_foto_familia
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051'),
  'a data ficou na fila de 20 dias atras — o caminho automatico foi ignorado');

select ci5b('lavagem executada e NAO notificada nao conta como foto enviada',
  (select total = 2 from sureya_ultima_foto_familia
    where familia_id='bbbbbbbb-0000-0000-0000-000000000051'),
  'contou um servico que nunca avisou ninguem');

-- O GRAO DO JAZIGO. A familia recebeu ha 3 dias, mas foi da OUTRA pedra: a
-- Pedra A continua com a data de 20 dias atras.
select ci5b('a Pedra A guarda a data dela, nao a da familia',
  (select ultima_em < now() - interval '19 days' from sureya_ultima_foto_jazigo
    where tumulo_id='ffffffff-0000-0000-0000-000000000051'),
  'o jazigo herdou a data do irmao');
select ci5b('a Pedra B guarda a dela',
  (select ultima_em > now() - interval '4 days' from sureya_ultima_foto_jazigo
    where tumulo_id='ffffffff-0000-0000-0000-000000000052'),
  'a Pedra B nao registrou o envio automatico');

do $$ begin raise notice 'ULTIMA FOTO: todas as conferencias passaram'; end $$;

-- ============================================================================
-- A PORTA UNICA DA LIBERACAO (0094)
--
-- Havia DUAS filas de mensagem esperando decisao: `fila_liberacao` (foto,
-- cobranca) e `interacoes_ia` (aniversario, Finados, aviso de saldo). A segunda
-- tinha tela propria, num endereco que ninguem abria — e em 23/08/2026 havia
-- 164 mensagens paradas nela, 157 delas cobrancas geradas dia apos dia entre 04
-- e 22 de agosto. Nao e que alguem decidiu nao enviar: ninguem viu.
--
-- O que se cobra aqui: os tipos novos entram, o silencio da familia barra na
-- PORTA (e nao na tela), e a foto continua com a chave propria dela.
-- ============================================================================
insert into familias (id, org_id, nome, modo_cobranca)
  values ('bbbbbbbb-0000-0000-0000-000000000094','aaaaaaaa-0000-0000-0000-000000000005',
          'Familia Silenciosa','consumo') on conflict (id) do nothing;

-- 1 · OS TIPOS NOVOS EXISTEM E ENTRAM
insert into fila_liberacao (id, org_id, familia_id, tipo, texto, status)
values ('cccccccc-0000-0000-0000-000000000941','aaaaaaaa-0000-0000-0000-000000000005',
        'bbbbbbbb-0000-0000-0000-000000000094','comemorativa','Feliz Dia das Maes','aguardando'),
       ('cccccccc-0000-0000-0000-000000000942','aaaaaaaa-0000-0000-0000-000000000005',
        'bbbbbbbb-0000-0000-0000-000000000094','servico','Que tal uma cuidada extra?','aguardando');

select ci5('comemorativa e servico entram na fila',
  (select count(*)::text from fila_liberacao
    where familia_id = 'bbbbbbbb-0000-0000-0000-000000000094'
      and tipo in ('comemorativa','servico')), '2');

-- 2 · O SILENCIO BARRA NA PORTA
--
-- A mensagem nao entra e e descartada depois: ela NAO EXISTE. A diferenca
-- importa porque uma mensagem que entra e alguem tem de decidir sobre ela, e
-- essa decisao ja foi tomada quando a familia pediu para nao receber.
update familias set silenciar = array['comemorativa']
 where id = 'bbbbbbbb-0000-0000-0000-000000000094';

insert into fila_liberacao (id, org_id, familia_id, tipo, texto, status)
values ('cccccccc-0000-0000-0000-000000000943','aaaaaaaa-0000-0000-0000-000000000005',
        'bbbbbbbb-0000-0000-0000-000000000094','comemorativa','Finados chegando','aguardando');

select ci5('familia que silenciou o tipo NAO recebe a mensagem na fila',
  (select count(*)::text from fila_liberacao
    where id = 'cccccccc-0000-0000-0000-000000000943'), '0');

-- 3 · O SILENCIO E POR TIPO, e nao um mudo geral
insert into fila_liberacao (id, org_id, familia_id, tipo, texto, status)
values ('cccccccc-0000-0000-0000-000000000944','aaaaaaaa-0000-0000-0000-000000000005',
        'bbbbbbbb-0000-0000-0000-000000000094','cobranca','Consta em aberto','aguardando');

select ci5('e os outros tipos continuam passando',
  (select count(*)::text from fila_liberacao
    where id = 'cccccccc-0000-0000-0000-000000000944'), '1');

-- 4 · O QUE JA ESTAVA NA FILA NAO SOME
--
-- Silenciar vale da proxima em diante. Sumir com o que alguem ja esta olhando
-- na tela seria decidir por quem esta olhando.
select ci5('o que ja estava na fila continua la',
  (select count(*)::text from fila_liberacao
    where id = 'cccccccc-0000-0000-0000-000000000941'), '1');

-- 5 · A ULTIMA ACAO SO CONTA O QUE FOI ENVIADO
update fila_liberacao set status = 'enviado', decidido_em = now() - interval '3 days'
 where id = 'cccccccc-0000-0000-0000-000000000941';
update fila_liberacao set status = 'descartado', decidido_em = now()
 where id = 'cccccccc-0000-0000-0000-000000000944';

select ci5('a ultima acao ve a enviada',
  (select tipo from sureya_ultima_acao_familia
    where familia_id = 'bbbbbbbb-0000-0000-0000-000000000094'), 'comemorativa');

select ci5('e NAO conta a descartada — ela nao chegou em ninguem',
  (select count(*)::text from sureya_ultima_acao_familia
    where familia_id = 'bbbbbbbb-0000-0000-0000-000000000094' and tipo = 'cobranca'), '0');

-- 6 · A FOTO CONTINUA COM A CHAVE DELA
--
-- `silenciar` e de dois estados; a chave da foto (0085) e de TRES — ligada,
-- desligada e "segue a casa", que e o padrao de quase todas as familias.
-- Absorver uma na outra perderia o estado do meio.
update familias set silenciar = array['comemorativa','cobranca'], enviar_fotos = true
 where id = 'bbbbbbbb-0000-0000-0000-000000000094';

insert into fila_liberacao (id, org_id, familia_id, tipo, texto, status)
values ('cccccccc-0000-0000-0000-000000000945','aaaaaaaa-0000-0000-0000-000000000005',
        'bbbbbbbb-0000-0000-0000-000000000094','foto','Segue a foto','aguardando');

select ci5('foto com a chave ligada passa, mesmo com outros tipos silenciados',
  (select count(*)::text from fila_liberacao
    where id = 'cccccccc-0000-0000-0000-000000000945'), '1');
