-- 0121 — PARA ONDE FOI A MENSAGEM
--
-- A PERGUNTA
--   "que volte a analise do comprovante pelo whats, esse comprovante por
--    exemplo é da familia da josiane e ela mandou por whats... o whats chega?"
--
-- O QUE FOI MEDIDO EM PRODUÇÃO ANTES DE ESCREVER UMA LINHA
--
--   eventos de webhook, por dia:
--     18/07  53      27/07 165      02/08 132      23/08  70
--     19/07  52      28/07 124      03/08  55
--     20/07 194      29/07  57
--                    30/07  96      ← e então NADA
--                    31/07  90        entre 04/08 e 22/08
--                                     dezenove dias
--
--   última mensagem de ENTRADA gravada:   02/08 15:10
--   comprovantes na vida inteira do sistema:  1  (02/08)
--   erros_log:                                0
--
--   no dia 23/08, com o WhatsApp de volta:
--     70 eventos · 1 lead novo · 1 mensagem gravada · 68 sem rastro nenhum
--
-- ENTÃO A RESPOSTA É: CHEGA HOJE, E NÃO CHEGOU POR DEZENOVE DIAS.
--
-- E O SISTEMA SABIA. `rotinas` guarda o carimbo do webhook desde sempre,
-- `LIMITE_MINUTOS.webhook` já era 48h, `IMPACTO_ROTINA.webhook` já dizia
-- "mensagem de família pode estar chegando e não entrando no sistema" — e
-- existe uma rota `/api/rotinas` que calcula tudo isso. Nenhuma tela do painel
-- chama essa rota. O alarme foi construído e nunca ligado no fio. Dezenove
-- dias de silêncio passaram por baixo dele.
--
-- O SEGUNDO BURACO, MAIS FUNDO
--
-- Dos 70 eventos de ontem, 68 não deixaram rastro. Isso não é bug: é o
-- desenho. O webhook decide e esquece. Ele devolve ao Evolution
-- `{ignorado:"grupo"}`, `{ignorado:"vazio"}`, `{ignorado:"duplicado"}`,
-- `{resultado:"lead"}` — e ninguém guarda essa frase. `eventos_webhook`
-- gravava só o id da mensagem, e só DEPOIS dos filtros de grupo e vazio.
--
-- Consequência prática: com a pergunta "o comprovante da Josiane chegou?" não
-- havia como responder. Nem sim, nem não. Só dedução — e dedução, nesta
-- semana, já me fez errar duas vezes sobre o menu das Flores.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
--   1. `eventos_webhook` passa a guardar TELEFONE e DESFECHO. Toda mensagem
--      que bate no servidor deixa uma linha dizendo por qual porta saiu.
--      A linha é escrita antes dos filtros — inclusive para grupo e vazio.
--
--   2. `sureya_saude_whatsapp` responde, num número só, há quantas horas o
--      WhatsApp está calado — e o que entrou em 24h e em 7 dias, por desfecho.
--
--   3. `sureya_rastro_telefone` responde "e a mensagem DESTE número?" — que é
--      a pergunta que se faz quando uma família diz que mandou algo.
--
--   4. `sureya_limpar_eventos_webhook` apaga o rastro velho. Um log que cresce
--      para sempre vira o próximo problema.
--
-- O QUE ELA NÃO FAZ
--   Não muda nada de disparo. Nenhuma mensagem passa a sair sozinha.
--   Isto aqui só ENXERGA.

-- ============================================================================
-- 1. O RASTRO
-- ============================================================================

alter table eventos_webhook
  add column if not exists telefone text,
  add column if not exists desfecho text,
  add column if not exists visto_em timestamptz not null default now();

comment on column eventos_webhook.desfecho is
  'Por qual porta a mensagem saiu do webhook: grupo, vazio, sem_mensagem, '
  'duplicado, espelho_cliente, espelho_eco, espelho_lead, espelho_nada, lead, '
  'ignorado, escalado, gravada, erro. Nulo = linha escrita antes da 0121.';

comment on column eventos_webhook.telefone is
  'Número normalizado de quem mandou (ou para quem foi, se fromMe). Nulo em '
  'evento sem chave de mensagem, e nas linhas anteriores à 0121.';

-- `visto_em` existe porque `created_at` é o momento da PRIMEIRA vez que o id
-- apareceu. Quando o Evolution reenvia o mesmo evento — e ele reenvia — o
-- desfecho é reescrito, e sem este carimbo não daria para distinguir "chegou
-- uma vez" de "chegou seis vezes".
update eventos_webhook set visto_em = created_at where visto_em is null;

create index if not exists idx_eventos_webhook_quando
  on eventos_webhook (org_id, created_at desc);
create index if not exists idx_eventos_webhook_telefone
  on eventos_webhook (org_id, telefone, created_at desc)
  where telefone is not null;

-- ============================================================================
-- 2. HÁ QUANTO TEMPO O WHATSAPP ESTÁ CALADO
-- ============================================================================

create or replace function sureya_saude_whatsapp(p_org uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := coalesce(p_org, current_org_id());
  v_ultimo timestamptz;
  v_horas  numeric;
  v_24h    jsonb;
  v_7d     jsonb;
  v_ultima_entrada timestamptz;
begin
  if v_org is null then
    raise exception 'sureya_saude_whatsapp: sem org';
  end if;

  select max(created_at) into v_ultimo
    from eventos_webhook where org_id = v_org;

  select max(created_at) into v_ultima_entrada
    from mensagens where org_id = v_org and direcao = 'entrada';

  v_horas := case when v_ultimo is null then null
                  else extract(epoch from (now() - v_ultimo)) / 3600.0 end;

  -- Por desfecho, para saber SE está entrando e ONDE está parando. Um dia com
  -- 70 eventos e zero `gravada` não é um dia de WhatsApp saudável, por mais
  -- que o carimbo esteja fresco.
  select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) into v_24h
    from (select coalesce(desfecho, 'antes_do_rastro') as d, count(*) as n
            from eventos_webhook
           where org_id = v_org and created_at > now() - interval '24 hours'
           group by 1) x;

  select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) into v_7d
    from (select coalesce(desfecho, 'antes_do_rastro') as d, count(*) as n
            from eventos_webhook
           where org_id = v_org and created_at > now() - interval '7 days'
           group by 1) x;

  return jsonb_build_object(
    'ultimo_evento',   v_ultimo,
    'horas_calado',    round(coalesce(v_horas, 0), 1),
    -- Nunca recebeu nada é diferente de recebeu e parou. O painel precisa
    -- dizer coisas diferentes nos dois casos.
    'nunca_recebeu',   v_ultimo is null,
    -- 48h é o mesmo limite que `LIMITE_MINUTOS.webhook` usa no código. Se um
    -- dia mudar lá, muda aqui: dois números para a mesma pergunta é o defeito
    -- que já custou caro neste sistema (0092, 0105, 0106, 0115).
    'silencio',        v_ultimo is not null and v_horas > 48,
    'ultima_entrada',  v_ultima_entrada,
    'em_24h',          v_24h,
    'em_7d',           v_7d,
    'total_24h',       (select count(*) from eventos_webhook
                         where org_id = v_org and created_at > now() - interval '24 hours'),
    'gravadas_24h',    (select count(*) from eventos_webhook
                         where org_id = v_org and desfecho = 'gravada'
                           and created_at > now() - interval '24 hours')
  );
end;
$$;

revoke all on function sureya_saude_whatsapp(uuid) from public;
grant execute on function sureya_saude_whatsapp(uuid) to authenticated, service_role;

-- ============================================================================
-- 3. E A MENSAGEM DESTE NÚMERO?
-- ============================================================================

create or replace function sureya_rastro_telefone(p_telefone text, p_dias int default 30, p_org uuid default null)
returns table (quando timestamptz, desfecho text, evolution_msg_id text)
language sql
security definer
set search_path = public
as $$
  select e.created_at, e.desfecho, e.evolution_msg_id
    from eventos_webhook e
   where e.org_id = coalesce(p_org, current_org_id())
     and e.telefone = p_telefone
     and e.created_at > now() - make_interval(days => greatest(p_dias, 1))
   order by e.created_at desc
   limit 200;
$$;

revoke all on function sureya_rastro_telefone(text, int, uuid) from public;
grant execute on function sureya_rastro_telefone(text, int, uuid) to authenticated, service_role;

-- ============================================================================
-- 4. O RASTRO VELHO SAI
-- ============================================================================

create or replace function sureya_limpar_eventos_webhook(p_dias int default 60, p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_org, current_org_id());
  v_n   int;
begin
  if v_org is null then
    raise exception 'sureya_limpar_eventos_webhook: sem org';
  end if;
  -- Mínimo de 7 dias na marra: este log é a única prova de que uma mensagem
  -- chegou. Uma chamada com p_dias = 0 apagaria a prova junto com o lixo.
  delete from eventos_webhook
   where org_id = v_org
     and created_at < now() - make_interval(days => greatest(p_dias, 7));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function sureya_limpar_eventos_webhook(int, uuid) from public;
grant execute on function sureya_limpar_eventos_webhook(int, uuid) to service_role;

-- ============================================================================
-- 5. O COMPROVANTE NÃO ENTRA DUAS VEZES
-- ============================================================================
--
-- Com a leitura do comprovante voltando a funcionar pelas DUAS portas (o
-- WhatsApp e a mão da Sureya), o mesmo Pix pode ser registrado duas vezes: a
-- família manda a foto e ela anexa o print do mesmo pagamento. Sem trava, isso
-- vira crédito em dobro no razão da família.
--
-- O identificador da transação (E2E do Pix) é único por pagamento e é o que os
-- comprovantes trazem impresso. Onde ele foi lido, ele tranca.
create unique index if not exists idx_comprovante_transacao_unica
  on comprovantes (org_id, id_transacao)
  where id_transacao is not null and id_transacao <> '';
