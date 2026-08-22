-- ============================================================================
-- A PROVA DE PONTA A PONTA.
--
-- Ela não confere esquema — `impressao.sql` faz isso. Ela confere COMPORTAMENTO:
-- as regras de negócio que moram dentro das funções e que nenhuma comparação de
-- catálogo alcança. Um banco com as tabelas todas certas e a `plano_de`
-- devolvendo plano pago para quem não pagou passaria na comparação e quebraria
-- o produto.
--
-- Cada afirmação derruba o script quando falha. Um teste que imprime "ok" e
-- segue é um teste que se aprende a ignorar.
-- ============================================================================
\set ON_ERROR_STOP on
\timing off

create or replace function pg_temp.confere(p_ok boolean, p_que text) returns void
language plpgsql as $$
begin
  if p_ok then raise notice '  ok     %', p_que;
  else raise exception 'FALHOU: %', p_que; end if;
end $$;

\echo '[1] a licenca: teste uma vez, dominio libera, bloqueio corta'
do $$
declare r record; cid bigint;
begin
  insert into walkstamp.cliente (nome, plano, assentos, dias)
       values ('Prova SA', 'time', 2, 30) returning id into cid;
  insert into walkstamp.dominio (dominio, assentos, dias, cliente, cliente_id)
       values ('prova.example', 2, 30, 'Prova SA', cid);
  insert into walkstamp.usuario (cliente_id, email, papel)
       values (cid, 'chefe@prova.example', 'admin');

  select * into r from walkstamp.plano_de('ninguem@fora.example');
  perform pg_temp.confere(r.motivo = 'teste' and r.dias = 14, 'desconhecido ganha 14 dias de teste');
  perform walkstamp.registrar_emissao('ninguem@fora.example','teste',1,14,null,current_date+14);
  select * into r from walkstamp.plano_de('ninguem@fora.example');
  perform pg_temp.confere(r.motivo = 'teste_usado', 'o teste NAO se renova sozinho');
  perform pg_temp.confere(
    (select cliente_id from walkstamp.usuario where email='ninguem@fora.example') is null,
    'e o teste NAO virou plano pago');

  select * into r from walkstamp.plano_de('ana@prova.example');
  perform pg_temp.confere(r.motivo = 'dominio' and r.plano = 'time', 'quem e do dominio entra pago');

  update walkstamp.cliente set ativo = false where id = cid;
  select * into r from walkstamp.plano_de('chefe@prova.example');
  perform pg_temp.confere(r.motivo = 'suspensa', 'cliente suspenso derruba todo mundo');
  update walkstamp.cliente set ativo = true where id = cid;
end $$;

\echo '[2] o time: convite respeita o assento, e o admin nao se tranca fora'
do $$
declare r jsonb;
begin
  r := walkstamp.time_convidar('chefe@prova.example','ana@prova.example');
  perform pg_temp.confere(r->'erro' is null, 'o segundo assento entra');
  r := walkstamp.time_convidar('chefe@prova.example','joao@prova.example');
  perform pg_temp.confere(r->>'erro' = 'sem_assento', 'o terceiro nao entra (limite 2)');
  r := walkstamp.time_convidar('chefe@prova.example','naoehemail');
  perform pg_temp.confere(r->>'erro' = 'email_invalido', 'e-mail torto e recusado');
  r := walkstamp.time_convidar('ana@prova.example','x@prova.example');
  perform pg_temp.confere(r->>'erro' = 'nao_admin', 'membro comum nao administra');
  r := walkstamp.time_bloquear('chefe@prova.example','chefe@prova.example',true);
  perform pg_temp.confere(r->>'erro' = 'nao_a_si', 'o admin nao bloqueia a si mesmo');
  r := walkstamp.time_bloquear('chefe@prova.example','estranho@outra.com',true);
  perform pg_temp.confere(r->>'erro' = 'fora_do_cliente', 'nem bloqueia quem nao e do cliente');
end $$;

\echo '[3] o chamado: numero, consulta com e-mail, e nada de varrer os alheios'
do $$
declare num text; r jsonb; antes int;
begin
  num := walkstamp.recado_novo('problema','o PDF sai sem a capa','fulano@empresa.com',
                               9,'pt','evidencia','app','diag');
  perform pg_temp.confere(num ~ '^WS-[0-9]{4}$', 'abriu com numero ' || num);
  r := walkstamp.chamado_ver(num, 'fulano@empresa.com');
  perform pg_temp.confere(r->>'status' = 'aberto', 'consulta com o e-mail certo');
  r := walkstamp.chamado_ver(num, 'outro@empresa.com');
  perform pg_temp.confere(r->>'erro' = 'nao_achei', 'com o e-mail errado, nao acha');
  perform pg_temp.confere(walkstamp.recado_novo('ideia','a','',null,'pt',null,'site',null) = 'vazio',
                          'texto curto demais e recusado');
  /* Medido ANTES e DEPOIS, e nao contra um numero fixo. A primeira versao
     desta afirmacao dizia `= 1` e reprovou — porque o banco reconstruido a
     partir do historico ja trazia um chamado respondido, deixado por
     `20260816001623_prova_do_chamado`. Foi assim que as duas sobras
     apareceram, e por isso existe `20260821203200_limpar_os_dois_chamados_de_prova`. */
  select (walkstamp.chamado_resposta()->>'quantos')::int into antes;
  r := walkstamp.chamado_responder(num, 'corrigido na versao de hoje');
  perform pg_temp.confere(r->>'ok' = 'true', 'responder grava a resposta');
  perform pg_temp.confere((walkstamp.chamado_resposta()->>'quantos')::int = antes + 1,
                          'e o tempo medio ganha mais uma amostra');
end $$;

\echo '[4] o roteiro: salvar, refazer sem perder o feito, e so o dono apaga'
do $$
declare r jsonb; rid bigint; caso_id bigint;
begin
  r := walkstamp.roteiro_salvar('chefe@prova.example','Rodada 1','time',
        '[{"caso":"CT-01","titulo":"Entrar"},{"caso":"CT-02","titulo":"Aprovar"}]'::jsonb, null);
  rid := (r->>'id')::bigint;
  perform pg_temp.confere(jsonb_array_length(r->'casos') = 2, 'dois casos entraram');
  select id into caso_id from walkstamp.roteiro_caso where roteiro_id = rid and caso = 'CT-01';
  r := walkstamp.roteiro_feito('chefe@prova.example', caso_id, 'ev.pdf', 'abc123', null, false,
                               '{"quadros":3}'::jsonb);
  perform pg_temp.confere((r->'casos'->0->>'feito_em') is not null, 'marcar feito guarda a data');

  /* O DEFEITO QUE ESTA LINHA GUARDA: reenviar a planilha apagava o recibo e o
     anexo de quem ja tinha executado. Reenviar e o caminho normal de
     acrescentar casos, entao a perda acontecia em silencio e em producao. */
  r := walkstamp.roteiro_salvar('chefe@prova.example','Rodada 1','time',
        '[{"caso":"CT-01","titulo":"Entrar"},{"caso":"CT-02"},{"caso":"CT-03"}]'::jsonb, rid);
  perform pg_temp.confere((r->'casos'->0->>'impressao') = 'abc123',
                          'reenviar a planilha NAO perde o que ja foi executado');
  perform pg_temp.confere((r->'casos'->0->'recibo'->>'quadros') = '3', 'nem o recibo');

  r := walkstamp.roteiro_apagar('ana@prova.example', rid);
  perform pg_temp.confere(r->>'erro' = 'so_o_dono', 'colega nao apaga roteiro alheio');
  r := walkstamp.roteiro_ver('estranho@fora.example', rid);
  perform pg_temp.confere(r->>'erro' = 'sem_acesso', 'de fora do time, nao ve');
end $$;

\echo '[5] a cobranca: a Stripe reenvia o mesmo evento e a fatura nao duplica'
do $$
declare r jsonb; n int;
begin
  r := walkstamp.fatura_da_stripe('in_9','cus_x','ninguem@nenhures.example','A',100,'BRL','paga',null,null);
  perform pg_temp.confere(r->>'erro' = 'cliente_desconhecido', 'pagador desconhecido nao vira fatura orfa');
  r := walkstamp.fatura_da_stripe('in_1','cus_a','chefe@prova.example','F-1',104700,'BRL','aberta',
                                  current_date+10,null);
  perform pg_temp.confere(r->>'ok' = 'true', 'a primeira entra');
  perform walkstamp.fatura_da_stripe('in_1','cus_a','chefe@prova.example','F-1',104700,'BRL','paga',
                                     current_date+10,null);
  select count(*) into n from walkstamp.fatura where stripe_id = 'in_1';
  perform pg_temp.confere(n = 1, 'o reenvio atualiza, nao duplica');
  perform pg_temp.confere(
    (select status from walkstamp.fatura where stripe_id='in_1') = 'paga', 'e o status acompanha');

  r := walkstamp.assinatura_da_stripe('novo@assina.example','cus_b','sub_b','time','active',5,60);
  perform pg_temp.confere((r->>'ativo')::boolean, 'assinatura active deixa o cliente vivo');
  perform pg_temp.confere(
    (select papel from walkstamp.usuario where email='novo@assina.example') = 'admin',
    'e o pagador vira admin da conta que pagou');
  r := walkstamp.assinatura_da_stripe('novo@assina.example','cus_b','sub_b','time','canceled',5,60);
  perform pg_temp.confere(not (r->>'ativo')::boolean, 'cancelada derruba');
  perform pg_temp.confere(
    (select encerrado_em from walkstamp.cliente where stripe_id='cus_b') is not null,
    'e carimba a data de onde os 90 dias contam');
end $$;

\echo '[6] o blog: publicar exige portugues E ingles'
do $$
declare r jsonb;
begin
  r := walkstamp.blog_salvar('primeiro-post','Leandro','{evidencia}',
        '{"pt":{"slug":"primeiro","titulo":"O primeiro","resumo":"r","corpo":"c"}}'::jsonb);
  perform pg_temp.confere(r->>'ok' = 'true', 'o post salva so com portugues');
  r := walkstamp.blog_publicar('primeiro-post', true);
  perform pg_temp.confere(r->>'erro' = 'falta_idioma', 'mas NAO publica sem o ingles');
  perform walkstamp.blog_salvar('primeiro-post','Leandro','{evidencia}',
        '{"en":{"slug":"first","titulo":"The first","resumo":"r","corpo":"c"}}'::jsonb);
  r := walkstamp.blog_publicar('primeiro-post', true);
  perform pg_temp.confere(r->>'ok' = 'true', 'com os dois, publica');
  perform pg_temp.confere(jsonb_array_length(walkstamp.blog_lista('pt')) = 1, 'e aparece na lista pt');
  perform pg_temp.confere(jsonb_array_length(walkstamp.blog_lista('de')) = 0,
                          'e NAO aparece em alemao, que nao existe');
  perform pg_temp.confere(walkstamp.blog_post('pt','primeiro')->'idiomas'->>'en' = 'first',
                          'o hreflang sai do que existe de verdade');
end $$;

\echo '[7] o painel de negocio traz o NPS'
do $$
declare p jsonb;
begin
  p := walkstamp.negocio_painel();
  perform pg_temp.confere(p ? 'nps', 'o painel traz a chave nps');
  perform pg_temp.confere((p->'nps'->>'total')::int = 1, 'com a nota que o chamado deixou');
  perform pg_temp.confere((p->'nps'->>'nps')::int = 100, 'e a conta de NPS fecha');
  perform pg_temp.confere(p ? 'resumo' and p ? 'faturas', 'sem perder o que o painel ja tinha');
end $$;

\echo '[8] o expurgo seco conta e nao apaga'
do $$
declare r jsonb; antes int; depois int;
begin
  select count(*) into antes from walkstamp.cliente;
  r := walkstamp.expurgo(true);
  select count(*) into depois from walkstamp.cliente;
  perform pg_temp.confere(antes = depois, 'o modo seco nao apagou nada');
  perform pg_temp.confere((r->>'contas')::int = 0, 'e nada esta vencido ainda');
  perform pg_temp.confere(r ? 'faturas_mantidas', 'o relatorio diz o que a fatura preserva');
end $$;

\echo '[8b] o registro do que a Stripe entregou'
do $$
declare n int; u jsonb;
begin
  /* Ele e ANOTACAO, e nao trava: o trabalho do webhook roda sempre. Uma trava
     que pulasse o trabalho no `event.id` repetido descartaria justamente a
     reentrega que a Stripe faz para consertar uma falha. */
  n := walkstamp.stripe_entregue('evt_1','invoice.paid','next','ok');
  perform pg_temp.confere(n = 0, 'a primeira entrega conta zero repeticoes');
  n := walkstamp.stripe_entregue('evt_1','invoice.paid','next','ok');
  perform pg_temp.confere(n = 1, 'a reentrega da mesma conta uma');
  n := walkstamp.stripe_entregue('evt_1','invoice.paid','next','ok');
  perform pg_temp.confere(n = 2, 'e a seguinte, duas — e o numero que denuncia um laco');
  perform pg_temp.confere(
    (select count(*) from walkstamp.stripe_evento where id='evt_1') = 1,
    'sem duplicar a linha');
  /* O ULTIMO resultado vence: o que importa e se terminou bem DEPOIS das
     reentregas, e nao como comecou. */
  perform walkstamp.stripe_entregue('evt_2','invoice.paid','next','erro: banco piscou');
  perform walkstamp.stripe_entregue('evt_2','invoice.paid','next','ok');
  perform pg_temp.confere(
    (select resultado from walkstamp.stripe_evento where id='evt_2') = 'ok',
    'e a reentrega que deu certo apaga o erro anterior');
  n := walkstamp.stripe_entregue('','invoice.paid','next','ok');
  perform pg_temp.confere(n = 0 and (select count(*) from walkstamp.stripe_evento) = 2,
                          'evento sem id nao vira linha');
  u := walkstamp.stripe_ultimos(10);
  perform pg_temp.confere(jsonb_array_length(u) = 2, 'e o painel consegue listar o que chegou');
end $$;

\echo '[9] a parede: o navegador nao alcanca nada disto'
do $$
declare aberto text;
begin
  perform pg_temp.confere(not has_schema_privilege('anon','walkstamp','usage'),
                          'anon nao tem USAGE no esquema walkstamp');
  perform pg_temp.confere(not has_schema_privilege('authenticated','walkstamp','usage'),
                          'authenticated tambem nao');
  select string_agg(c.relname, ', ') into aberto
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'walkstamp' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'select')
       or has_table_privilege('authenticated', c.oid, 'select'));
  perform pg_temp.confere(aberto is null, 'nenhuma tabela e legivel pelo navegador');

  select string_agg(c.relname, ', ') into aberto
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'walkstamp' and c.relkind = 'r' and not c.relrowsecurity;
  /* O NUMERO SAI DA CONTAGEM, e nao escrito a mao. A frase dizia "as dezoito
     tabelas" e continuou dizendo depois de a decima nona entrar — a afirmacao
     estava certa e o texto, mentindo. */
  perform pg_temp.confere(aberto is null,
    'e as ' || (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='walkstamp' and c.relkind='r')
            || ' tabelas estao com RLS ligada');

  /* As SEIS que o navegador PODE chamar, e so elas. Esta lista e uma decisao
     de produto, e mudar o tamanho dela sem passar por aqui e o jeito de abrir
     uma porta sem ninguem notar. */
  select string_agg(p.proname, ', ' order by p.proname) into aberto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'walkstamp\_%'
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  perform pg_temp.confere(
    aberto = 'walkstamp_chamado_resposta, walkstamp_chamado_tempo, walkstamp_chamado_ver, '
          || 'walkstamp_evento, walkstamp_interesse, walkstamp_recado',
    'e o navegador chama exatamente as seis funcoes publicas');
end $$;

\echo ''
\echo 'Prova de ponta a ponta: tudo passou.'
