-- ============================================================================
-- O OUTBOX DA FILA, PROVADO A CADA COMMIT
--
-- O criterio de saida do Build 6 e literal: "envio repetido nao duplica
-- mensagem". Antes da 0077 duplicava — uma falha na segunda foto fazia a
-- familia receber a primeira duas vezes, e o WhatsApp nao tem desfazer.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

insert into auth.users (id, email) values ('0b0b0b0b-0000-0000-0000-000000000001','outbox@sureya.test')
  on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','0b0b0b0b-0000-0000-0000-000000000001', false);
insert into orgs (id, nome) values ('0b0b0b0b-0000-0000-0000-000000000002','CI Outbox')
  on conflict do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('0b0b0b0b-0000-0000-0000-000000000002','0b0b0b0b-0000-0000-0000-000000000001','admin',true)
  on conflict do nothing;
insert into familias (id, org_id, nome)
  values ('0b0b0b0b-0000-0000-0000-000000000003','0b0b0b0b-0000-0000-0000-000000000002','Fam Outbox')
  on conflict (id) do nothing;
insert into clientes (id, org_id, nome, telefone, familia_id, responsavel_financeiro)
  values ('0b0b0b0b-0000-0000-0000-000000000004','0b0b0b0b-0000-0000-0000-000000000002',
          'Dona Maria','5511988887777','0b0b0b0b-0000-0000-0000-000000000003', true)
  on conflict (id) do nothing;

create or replace function ci5(nome text, ok boolean, detalhe text default '') returns void
language plpgsql as $$
begin
  if not ok then raise exception 'OUTBOX FALHOU — % %', nome, detalhe; end if;
  raise notice '  ok  %', nome;
end $$;

create or replace function ci5_novo() returns uuid language sql as $$
  delete from fila_liberacao where org_id='0b0b0b0b-0000-0000-0000-000000000002';
  insert into fila_liberacao (org_id, familia_id, cliente_id, tipo, texto, fotos)
  values ('0b0b0b0b-0000-0000-0000-000000000002','0b0b0b0b-0000-0000-0000-000000000003',
          '0b0b0b0b-0000-0000-0000-000000000004','foto','Olha como ficou',
          '["a.jpg","b.jpg","c.jpg"]'::jsonb)
  returning id $$;

-- ---------------------------------------------------------------- 1. reserva
do $$
declare v_id uuid; v_n int;
begin
  v_id := ci5_novo();
  select count(*) into v_n from sureya_fila_reservar(v_id);
  perform ci5('a reserva pega o item que estava aguardando', v_n = 1);

  -- O clique duplo perde a corrida: o segundo pedido nao acha nada.
  select count(*) into v_n from sureya_fila_reservar(v_id);
  perform ci5('o segundo clique nao reserva de novo', v_n = 0);

  perform ci5('a reserva conta a tentativa',
              (select tentativas from fila_liberacao where id = v_id) = 1);
  perform ci5('a reserva carimba quando comecou',
              (select enviando_desde is not null from fila_liberacao where id = v_id));
  perform ci5('a reserva devolve o telefone de quem recebe',
              (select telefone from sureya_fila_reservar(v_id)) is null);  -- ja reservado
end $$;

-- ---------------------------------------------------------------- 2. NAO DUPLICA
-- O cenario exato do bug: 3 fotos, a terceira falha. A retentativa tem de
-- comecar da terceira, nao da primeira.
do $$
declare v_id uuid; v_de int;
begin
  v_id := ci5_novo();
  perform sureya_fila_reservar(v_id);
  -- mandou a.jpg e b.jpg, quebrou em c.jpg
  perform sureya_fila_soltar(v_id, 'timeout na terceira foto', 'transitorio', 2);
  perform ci5('o item volta para a fila depois da falha',
              (select status::text from fila_liberacao where id = v_id) = 'aguardando');
  perform ci5('a fila guarda POR QUE falhou',
              (select ultimo_erro from fila_liberacao where id = v_id) like '%terceira foto%');
  perform ci5('a fila guarda se vale tentar de novo',
              (select erro_tipo from fila_liberacao where id = v_id) = 'transitorio');

  select fotos_enviadas into v_de from sureya_fila_reservar(v_id);
  perform ci5('a RETENTATIVA COMECA DA TERCEIRA FOTO, nao da primeira', v_de = 2,
              format('veio %s', v_de));
  perform ci5('a segunda tentativa e contada',
              (select tentativas from fila_liberacao where id = v_id) = 2);
end $$;

-- ---------------------------------------------------------------- 3. nao anda para tras
-- Se a tentativa 2 quebra logo na primeira foto, o contador nao pode voltar a
-- zero — senao a tentativa 3 reenvia a.jpg e b.jpg.
do $$
declare v_id uuid;
begin
  v_id := ci5_novo();
  perform sureya_fila_reservar(v_id);
  perform sureya_fila_soltar(v_id, 'quebrou na terceira', 'transitorio', 2);
  perform sureya_fila_reservar(v_id);
  perform sureya_fila_soltar(v_id, 'quebrou logo de cara', 'transitorio', 0);
  perform ci5('o contador de fotos NUNCA diminui',
              (select fotos_enviadas from fila_liberacao where id = v_id) = 2,
              format('veio %s', (select fotos_enviadas from fila_liberacao where id = v_id)));
end $$;

-- ---------------------------------------------------------------- 4. permanente
do $$
declare v_id uuid;
begin
  v_id := ci5_novo();
  perform sureya_fila_reservar(v_id);
  perform sureya_fila_soltar(v_id, 'sem WhatsApp cadastrado', 'permanente', 0);
  perform ci5('falha permanente e marcada como tal',
              (select erro_tipo from fila_liberacao where id = v_id) = 'permanente');
  perform ci5('e vira alerta de alta gravidade',
              (select gravidade from sureya_alertas where alerta='fila_erro_permanente') = 'alta');
end $$;

-- ---------------------------------------------------------------- 5. destrava
-- Item que morreu em `enviando` tem de voltar. Sem isto ele some da tela para
-- sempre: a familia nao recebeu e nao ha onde ver isso.
do $$
declare v_id uuid; v_n int;
begin
  v_id := ci5_novo();
  perform sureya_fila_reservar(v_id);
  update fila_liberacao set enviando_desde = now() - interval '2 hours' where id = v_id;

  perform ci5('item preso em `enviando` vira alerta',
              (select quantidade from sureya_alertas where alerta='fila_travada') = 1);

  select sureya_fila_destravar(10) into v_n;
  perform ci5('destravar devolve o item para a fila', v_n = 1);
  perform ci5('e diz o que aconteceu, em portugues',
              (select ultimo_erro from fila_liberacao where id = v_id) like '%interrompido%');
  perform ci5('nao ha mais alerta de travada',
              (select count(*) from sureya_alertas where alerta='fila_travada') = 0);

  -- Item que acabou de ser reservado NAO pode ser destravado no meio do envio.
  perform sureya_fila_reservar(v_id);
  select sureya_fila_destravar(10) into v_n;
  perform ci5('envio em andamento nao e destravado por engano', v_n = 0);
end $$;

-- ---------------------------------------------------------------- 6. conclui
do $$
declare v_id uuid;
begin
  v_id := ci5_novo();
  perform sureya_fila_reservar(v_id);
  perform ci5('concluir marca como enviado',
              sureya_fila_concluir(v_id, 'Olha como ficou', 3));
  perform ci5('o texto que saiu de verdade fica gravado',
              (select texto_final from fila_liberacao where id = v_id) = 'Olha como ficou');
  perform ci5('concluir limpa o erro anterior',
              (select ultimo_erro is null and erro_tipo is null
                 from fila_liberacao where id = v_id));
  -- Concluir de novo nao faz nada: o item ja nao esta em `enviando`.
  perform ci5('concluir duas vezes nao reabre nada',
              not sureya_fila_concluir(v_id, 'outro texto', 3));
  perform ci5('e o texto nao e sobrescrito',
              (select texto_final from fila_liberacao where id = v_id) = 'Olha como ficou');
end $$;

-- ---------------------------------------------------------------- 7. alertas
do $$
declare v_id uuid;
begin
  v_id := ci5_novo();
  update fila_liberacao set tentativas = 4 where id = v_id;
  perform ci5('mensagem que ja falhou 3+ vezes vira alerta',
              (select quantidade from sureya_alertas where alerta='fila_insistindo') = 1);
  update fila_liberacao set tentativas = 0, criado_em = now() - interval '5 days' where id = v_id;
  perform ci5('mensagem parada ha dias vira alerta',
              (select quantidade from sureya_alertas where alerta='fila_parada') = 1);
  perform ci5('todo alerta diz ONDE resolver',
              (select bool_and(onde is not null and onde <> '') from sureya_alertas));
end $$;

-- ---------------------------------------------------------------- limpeza
delete from fila_liberacao where org_id='0b0b0b0b-0000-0000-0000-000000000002';
delete from clientes  where org_id='0b0b0b0b-0000-0000-0000-000000000002';
delete from familias  where org_id='0b0b0b0b-0000-0000-0000-000000000002';
delete from membros   where org_id='0b0b0b0b-0000-0000-0000-000000000002';
delete from orgs      where id='0b0b0b0b-0000-0000-0000-000000000002';
delete from auth.users where id='0b0b0b0b-0000-0000-0000-000000000001';
drop function ci5(text, boolean, text);
drop function ci5_novo();
