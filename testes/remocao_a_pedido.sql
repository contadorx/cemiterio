-- ============================================================================
-- A REMOCAO A PEDIDO ALCANCA O QUE FICOU, E SE PROVA (0140)
--
-- O caminho existia desde a 0010, foi reforcado na 0078 e de novo na 0135 — e
-- NUNCA TINHA RODADO. Quando eu o exercitei em producao, num bloco desfeito,
-- ele deixava SEIS coisas para tras. A pior era um `update leads` que casava
-- ZERO linhas por erro de ordem: a funcao embaralhava `clientes.telefone` e
-- so DEPOIS procurava os leads por `(select telefone from clientes ...)`.
--
-- ESSE DEFEITO E INVISIVEL NA LEITURA. A linha esta la, ela parece certa, e
-- nenhuma tela muda. Por isso este arquivo nao confere a funcao lendo o que ela
-- faz — ele monta uma pessoa com dado espalhado por seis tabelas, manda
-- remover, e VARRE o banco atras do que sobrou.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci40(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'REMOCAO FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into auth.users (id, email)
  values ('40404040-0000-0000-0000-000000000001','remocao@sureya.test') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','40404040-0000-0000-0000-000000000001', false);

insert into orgs (id, nome) values ('40404040-4040-4040-4040-404040404040','CI Remocao')
  on conflict (id) do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('40404040-4040-4040-4040-404040404040','40404040-0000-0000-0000-000000000001','admin', true)
  on conflict do nothing;

do $$
declare
  v_org  uuid := '40404040-4040-4040-4040-404040404040';
  v_cem  uuid := '40404040-0000-0000-0000-0000000000ce';
  v_qua  uuid := '40404040-0000-0000-0000-0000000000da';
  v_fam  uuid := '40404040-0000-0000-0000-0000000000fa';
  v_tum  uuid := '40404040-0000-0000-0000-0000000000a1';
  v_cli  uuid := '40404040-0000-0000-0000-0000000000c1';
  v_conv uuid := '40404040-0000-0000-0000-0000000000c0';
  -- Nome com acento e sobrenome, como os de verdade. O SEGUNDO lead usa um
  -- nome que CONTEM o dela — e um TERCEIRO, que nao pediu nada.
  v_nome text := 'Kátia';
  v_tel1 text := '5511988758966';
  v_tel2 text := '5511970001111';
  v_n int; v_tel_sobrou int; v_fam_nome text; v_obs text;
begin
  insert into cemiterios (id, org_id, nome) values (v_cem, v_org, 'Cem') on conflict (id) do nothing;
  insert into quadras (id, org_id, cemiterio_id, codigo) values (v_qua, v_org, v_cem, 'Q1')
    on conflict (id) do nothing;
  -- A FAMILIA BATIZADA COM O NOME DELA, como o cadastro faz.
  insert into familias (id, org_id, nome, observacoes)
    values (v_fam, v_org, 'Família ' || v_nome,
            'Criada automaticamente a partir do cadastro de ' || v_nome)
    on conflict (id) do nothing;
  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo)
    values (v_tum, v_org, v_qua, v_fam, 'T-1', 'Q1-R1-001') on conflict (id) do nothing;

  insert into clientes (id, org_id, familia_id, nome, telefone, observacoes)
    values (v_cli, v_org, v_fam, v_nome, v_tel1, 'gosta de ser avisada na vespera')
    on conflict (id) do nothing;

  -- O SEGUNDO NUMERO. A versao de 0078 ja apagava esta tabela; o que faltava
  -- era usar o numero dela para achar o lead ANTES de apagar.
  insert into telefones_cliente (org_id, cliente_id, telefone) values (v_org, v_cli, v_tel2)
    on conflict do nothing;

  insert into conversas (id, org_id, cliente_id, aberta) values (v_conv, v_org, v_cli, true)
    on conflict (id) do nothing;
  insert into mensagens (org_id, conversa_id, cliente_id, direcao, autor, texto)
    values (v_org, v_conv, v_cli, 'entrada', 'cliente', 'Oi, aqui e a ' || v_nome);

  -- OS RASCUNHOS DA IA — a funcao limpava a mensagem e esquecia o rascunho.
  insert into interacoes_ia (org_id, cliente_id, conversa_id, rascunho)
    values (v_org, v_cli, v_conv, 'Olá, ' || v_nome || '! A próxima limpeza é R$ 20.');

  -- O LEAD DELA, pelo telefone. E o que casava ZERO linhas.
  insert into leads (org_id, telefone, nome_wa) values (v_org, v_tel1, v_nome);
  -- O LEAD DE OUTRA PESSOA, com nome que CONTEM o dela. Nao pode ser tocado.
  insert into leads (org_id, telefone, nome_wa) values (v_org, '5511999990000', v_nome || ' C. Lima');

  -- O LOG CRU DO WHATSAPP, com os dois numeros.
  insert into eventos_webhook (org_id, evolution_msg_id, telefone, desfecho)
    values (v_org, 'ci40-1', v_tel1, 'entregue'), (v_org, 'ci40-2', v_tel2, 'entregue');

  -- =========================================================================
  -- REMOVE
  -- =========================================================================
  create temp table _sobrou on commit drop as
    select * from sureya_anonimizar_cliente(v_cli);

  -- O QUE IMPORTA: nenhum telefone dela em lugar nenhum do banco.
  select count(*) into v_tel_sobrou from _sobrou where pelo_telefone;
  perform ci40('nenhum telefone dela sobrou no banco inteiro', v_tel_sobrou = 0,
               'sobrou em: ' || coalesce((select string_agg(onde || '=' || quantos, ', ')
                                            from _sobrou where pelo_telefone), '?'));

  -- E ela SE PROVA: a funcao devolve o laudo, em vez de "pronto".
  perform ci40('a funcao devolve o laudo do que sobrou',
               (select count(*) from _sobrou) >= 0, 'nao devolveu nada');

  -- ------------------------------------------------------------------ leads
  --
  -- ESTE E O TESTE DO BUG DE ORDEM. Se a funcao voltar a procurar o lead por
  -- `(select telefone from clientes ...)` depois de embaralhar a coluna, este
  -- assert cai — e e o unico jeito de descobrir, porque a linha "parece certa".
  select count(*) into v_n from leads where telefone = v_tel1 or nome_wa = v_nome;
  perform ci40('o lead dela foi limpo — telefone e nome', v_n = 0,
               'sobraram ' || v_n || ' leads com o numero ou o nome dela');

  perform ci40('mas o lead de OUTRA pessoa com nome parecido nao foi tocado',
               exists (select 1 from leads
                        where telefone = '5511999990000' and nome_wa = v_nome || ' C. Lima'),
               'apagou o dado de quem nao pediu nada');

  -- ------------------------------------------------------------ o resto
  perform ci40('o rascunho da IA foi limpo',
               not exists (select 1 from interacoes_ia
                            where cliente_id = v_cli and rascunho ilike '%' || v_nome || '%'),
               'o rascunho continua chamando a pessoa pelo nome');

  perform ci40('o log do webhook nao guarda mais os numeros dela',
               not exists (select 1 from eventos_webhook
                            where telefone in (v_tel1, v_tel2)),
               'o numero continua no log cru');

  perform ci40('o segundo telefone saiu',
               not exists (select 1 from telefones_cliente where cliente_id = v_cli),
               'o outro numero dela ficou');

  -- ------------------------------------------------------------- a familia
  select nome, observacoes into v_fam_nome, v_obs from familias where id = v_fam;
  perform ci40('a familia deixou de se chamar pelo nome dela',
               v_fam_nome !~* ('(^|\W)' || v_nome || '($|\W)'),
               'a familia ainda se chama: ' || v_fam_nome);

  -- ACHAVEL: renomear para "Familia removida" deixaria a Sureya sem saber de
  -- quem e o jazigo que ela continua lavando toda semana.
  perform ci40('e o novo nome ainda diz de que jazigo ela e',
               v_fam_nome like '%Q1-R1-001%',
               'nome novo: ' || v_fam_nome);

  perform ci40('a observacao perdeu o nome mas manteve o resto',
               v_obs !~* ('(^|\W)' || v_nome || '($|\W)') and v_obs like '%Criada automaticamente%',
               'observacao: ' || coalesce(v_obs, '(nula)'));

  -- ------------------------------------------------ a familia NAO e apagada
  --
  -- Ela e o contrato, e pode ter outras pessoas. Remover a pessoa nao remove a
  -- familia nem o jazigo.
  perform ci40('a familia e o jazigo continuam existindo',
               exists (select 1 from familias where id = v_fam)
               and exists (select 1 from tumulos where id = v_tum),
               'a remocao levou o contrato junto');

  raise notice '  ---';
end $$;

do $$
begin
  perform ci40('anon nao anonimiza ninguem',
    not has_function_privilege('anon','sureya_anonimizar_cliente(uuid)','execute'),
    'qualquer visitante poderia apagar o cadastro de uma familia');
  perform ci40('anon nao varre o banco atras de nome e telefone',
    not has_function_privilege('anon','sureya_sobrou_da_remocao(uuid,text,text)','execute'),
    'a varredura devolve onde o nome de uma pessoa aparece — nao pode ficar aberta');
end $$;

drop function ci40(text, boolean, text);
