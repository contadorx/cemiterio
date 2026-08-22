-- ============================================================================
-- SUREYA — 0077 · A FILA PASSA A LEMBRAR O QUE ACONTECEU
--
-- Build 6, entregas 2, 5 e 6: idempotência no envio, outbox/retry com estado
-- legível e sem duplicar mensagem, e alertas operacionais.
--
-- ============================================================================
-- TRÊS BURACOS NA FILA DE HOJE
-- ============================================================================
--
-- 1) UMA RETENTATIVA REENVIA AS FOTOS QUE JÁ SAÍRAM
--
--    `api/fila/route.ts` manda a legenda na primeira foto e depois as outras,
--    uma a uma:
--
--        await enviarWhatsappMidia(telefone, fotos[0], corpo);
--        for (const extra of fotos.slice(1)) await enviarWhatsappMidia(...);
--
--    Se a segunda falhar, o `catch` devolve o item para `aguardando` — e a
--    Sureya toca em Enviar de novo. A primeira foto sai **pela segunda vez**.
--
--    Do lado da família: duas fotos iguais do túmulo do pai, com a mesma
--    legenda. E o WhatsApp não tem desfazer.
--
--    O critério de saída do Build 6 é literal: *"envio repetido não duplica
--    mensagem"*. Hoje duplica.
--
-- 2) ITEM QUE MORRE EM `enviando` SOME DA FILA PARA SEMPRE
--
--    A reserva muda o status para `enviando` antes de chamar a Evolution. Se o
--    processo cair ali — timeout da função serverless, deploy no meio, rede —
--    ninguém devolve o item.
--
--    E a tela lista `status = 'aguardando'`. O item fica invisível: a família
--    não recebeu, e não há tela em que isso apareça. É o pior tipo de falha,
--    porque não gera erro nenhum para alguém ver.
--
-- 3) A FILA NÃO GUARDA POR QUE FALHOU
--
--    O `catch` devolve para `aguardando` e a mensagem de erro vai para a tela
--    de quem estava ali naquele segundo. Depois disso, nada. Não há como saber
--    se um item falhou uma vez ou quinze, nem por quê.
--
--    "Estado legível" é justamente isso: a fila tem de responder *"esta
--    mensagem tentou sair 3 vezes, a última há 10 minutos, e o WhatsApp estava
--    desconectado"* — sem ninguém ter de abrir log.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) A memória da fila
-- ----------------------------------------------------------------------------
alter table fila_liberacao
  -- Quantas fotos JÁ SAÍRAM. A retentativa começa daqui, não do zero. É o que
  -- impede a família de receber a mesma foto duas vezes.
  add column if not exists fotos_enviadas   int not null default 0,
  add column if not exists tentativas       int not null default 0,
  add column if not exists ultimo_erro      text,
  add column if not exists ultimo_erro_em   timestamptz,
  -- 'transitorio' (WhatsApp caiu, rede) x 'permanente' (sem telefone, número
  -- inválido). A diferença decide se vale tentar de novo ou se é preciso mexer
  -- no cadastro — e hoje as duas chegam na tela com o mesmo texto.
  add column if not exists erro_tipo        text,
  -- Quando a reserva começou. Sem isto não há como distinguir "está enviando
  -- agora" de "morreu enviando há duas horas".
  add column if not exists enviando_desde   timestamptz;

comment on column fila_liberacao.fotos_enviadas is
  'Quantas fotos ja saíram. A retentativa recomeça daqui — sem isso, uma falha '
  'na segunda foto faz a familia receber a primeira duas vezes.';
comment on column fila_liberacao.erro_tipo is
  'transitorio = vale tentar de novo (WhatsApp caiu, rede). permanente = '
  'precisa de alguem (sem telefone, numero invalido). A tela fala diferente '
  'para cada um porque a acao e diferente.';

create index if not exists idx_fila_travada
  on fila_liberacao (enviando_desde) where status = 'enviando';


-- ----------------------------------------------------------------------------
-- 2) Reservar e soltar, com memória
--
-- A reserva continua sendo um `update ... where status = 'aguardando'`: só o
-- primeiro pedido consegue, e o clique duplo perde a corrida. O que muda é que
-- agora ela carimba QUANDO começou, e a soltura registra POR QUÊ voltou.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_fila_reservar(p_item uuid)
returns table(id uuid, telefone text, fotos jsonb, fotos_enviadas int, tentativas int)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := current_org_id();
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if v_org is null then raise exception 'sem_org'; end if;

  return query
  update fila_liberacao f
     set status         = 'enviando',
         enviando_desde = now(),
         tentativas     = f.tentativas + 1,
         decidido_em    = now()
   where f.id = p_item and f.org_id = v_org and f.status = 'aguardando'
  returning f.id,
            (select c.telefone from clientes c where c.id = f.cliente_id),
            f.fotos,
            f.fotos_enviadas,
            f.tentativas;
end
$function$;

-- Soltar de volta para a fila, guardando o motivo. `p_fotos_enviadas` é o
-- ponto onde parou: a próxima tentativa continua dali.
create or replace function public.sureya_fila_soltar(
  p_item uuid, p_erro text, p_tipo text default 'transitorio',
  p_fotos_enviadas int default null
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := current_org_id();
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  update fila_liberacao
     set status         = 'aguardando',
         enviando_desde = null,
         decidido_em    = null,
         ultimo_erro    = left(coalesce(p_erro, ''), 500),
         ultimo_erro_em = now(),
         erro_tipo      = p_tipo,
         -- NUNCA DIMINUI. Se uma tentativa mandou 2 fotos e a seguinte falhou
         -- logo na primeira, o contador tem de continuar 2 — senao a proxima
         -- reenvia o que ja saiu, que e o bug que esta coluna existe para
         -- fechar.
         fotos_enviadas = greatest(fila_liberacao.fotos_enviadas,
                                   coalesce(p_fotos_enviadas, 0))
   where id = p_item and org_id = v_org and status = 'enviando';
  return found;
end
$function$;

create or replace function public.sureya_fila_concluir(p_item uuid, p_texto text, p_fotos int)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := current_org_id();
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  update fila_liberacao
     set status         = 'enviado',
         texto_final    = p_texto,
         fotos_enviadas = coalesce(p_fotos, fotos_enviadas),
         enviando_desde = null,
         ultimo_erro    = null,
         erro_tipo      = null
   where id = p_item and org_id = v_org and status = 'enviando';
  return found;
end
$function$;


-- ----------------------------------------------------------------------------
-- 3) O que morreu no meio do caminho
--
-- Item em `enviando` há mais tempo que qualquer envio plausível é um processo
-- que caiu. Devolve para a fila com o motivo escrito, para a Sureya ver que
-- aconteceu em vez de a mensagem sumir.
--
-- NÃO é automático em gatilho: é uma função que a tela chama ao abrir. Rotina
-- que mexe em fila sozinha, sem ninguém olhando, é como o item some.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_fila_destravar(p_minutos int default 10)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := current_org_id(); v_n int;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  with soltas as (
    update fila_liberacao
       set status         = 'aguardando',
           enviando_desde = null,
           decidido_em    = null,
           ultimo_erro    = 'O envio foi interrompido no meio (a página fechou, '
                            'a conexão caiu ou o servidor reiniciou). A mensagem '
                            'voltou para a fila.',
           ultimo_erro_em = now(),
           erro_tipo      = 'transitorio'
     where org_id = v_org
       and status = 'enviando'
       and enviando_desde < now() - make_interval(mins => greatest(p_minutos, 1))
    returning 1
  )
  select count(*) into v_n from soltas;
  return v_n;
end
$function$;


-- ----------------------------------------------------------------------------
-- 4) Os alertas — entrega 6
--
-- Uma consulta que responde "o que está pegando fogo agora". Cada linha tem
-- gravidade, número e onde resolver. Alerta sem ação é ruído que ensina a
-- ignorar alerta.
-- ----------------------------------------------------------------------------
create or replace view sureya_alertas as
-- (a) Mensagem parada tentando sair
select 'fila_travada'::text                                   as alerta,
       'alta'::text                                           as gravidade,
       count(*)                                               as quantidade,
       'Mensagens presas no envio ha mais de 10 minutos'::text as descricao,
       '/painel/fila'::text                                   as onde
  from fila_liberacao
 where org_id = current_org_id() and status = 'enviando'
   and enviando_desde < now() - interval '10 minutes'
having count(*) > 0

union all
-- (b) Mensagem que ja falhou varias vezes: parou de ser azar
select 'fila_insistindo', 'alta', count(*),
       'Mensagens que ja falharam 3 vezes ou mais', '/painel/fila'
  from fila_liberacao
 where org_id = current_org_id() and status = 'aguardando' and tentativas >= 3
having count(*) > 0

union all
-- (c) Falha que nao adianta repetir
select 'fila_erro_permanente', 'alta', count(*),
       'Mensagens que nao vao sair sem alguem corrigir o cadastro', '/painel/fila'
  from fila_liberacao
 where org_id = current_org_id() and status = 'aguardando'
   and erro_tipo = 'permanente'
having count(*) > 0

union all
-- (d) Fila envelhecendo: ninguem esta olhando
select 'fila_parada', 'media', count(*),
       'Mensagens aguardando ha mais de 3 dias', '/painel/fila'
  from fila_liberacao
 where org_id = current_org_id() and status = 'aguardando'
   and criado_em < now() - interval '3 days'
having count(*) > 0

union all
-- (e) Limpeza feita e nao cobrada — o mesmo sinal do fechamento, aqui para
--     aparecer ANTES de virar problema de fim de mes.
select 'lavagem_sem_cobranca', 'media', count(*),
       'Limpezas executadas nos ultimos 30 dias que nao viraram cobranca',
       '/painel/fechamento'
  from servicos s
  left join tumulos  t on t.id = s.tumulo_id
  left join familias f on f.id = t.familia_id
 where s.org_id = current_org_id()
   and s.status::text = 'executado'
   and s.data_executada >= now() - interval '30 days'
   and coalesce(f.modo_cobranca::text, 'consumo') = 'consumo'
   and not exists (select 1 from conta_corrente l
                    where l.servico_id = s.id and l.tipo = 'debito')
having count(*) > 0

union all
-- (f) Dinheiro no banco sem dono
select 'entrada_sem_dono', 'media', count(*),
       'Entradas no banco sem familia identificada', '/painel/financeiro'
  from entradas_banco
 where org_id = current_org_id() and identificada_em is null
having count(*) > 0

union all
-- (g) Familia sem responsavel: o invariante de D-01 deixando de valer
select 'familia_sem_responsavel', 'alta', count(*),
       'Familias sem responsavel financeiro — a cobranca nao sabe com quem falar',
       '/painel/clientes'
  from familias f
 where f.org_id = current_org_id()
   and not exists (select 1 from clientes c
                    where c.familia_id = f.id and c.responsavel_financeiro)
having count(*) > 0;

comment on view sureya_alertas is
  'O que precisa de alguem agora, com gravidade, numero e onde resolver. '
  'Alerta sem acao e ruido que ensina a ignorar alerta.';

revoke execute on function public.sureya_fila_reservar(uuid) from public, anon;
revoke execute on function public.sureya_fila_soltar(uuid, text, text, int) from public, anon;
revoke execute on function public.sureya_fila_concluir(uuid, text, int) from public, anon;
revoke execute on function public.sureya_fila_destravar(int) from public, anon;

commit;
