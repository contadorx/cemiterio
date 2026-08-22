-- ============================================================================
-- SUREYA — 0039 · "AS ROTINAS RODARAM?"
--
-- O PROBLEMA QUE ISTO RESOLVE
-- ---------------------------------------------------------------------------
-- Os quatro crons e o webhook do WhatsApp não deixavam NENHUM rastro de
-- sucesso. Só de erro. A tela de Config → Diagnóstico lê `erros_log` e, quando
-- ela está vazia, escreve "Nenhum erro registrado ✓".
--
-- Ou seja: "o cron das 9h rodou perfeito" e "o cron das 9h não roda há uma
-- semana" produziam exatamente a mesma tela verde.
--
-- Isso importa porque o cron diário é quem CRIA as limpezas dos planos. Se ele
-- parar, a agenda vai secando e a primeira pessoa a perceber é a Nina — sem
-- serviço para fazer — ou a família, sem limpeza. E se `CRON_SECRET` não
-- estiver setada, os quatro respondem 401 para sempre, sem gravar nada.
--
-- Esta tabela é o carimbo. Uma linha por rotina, sobrescrita a cada execução.
-- Não guarda histórico de propósito: o que importa é "quando foi a última vez
-- que isto funcionou".
--
-- NADA É DESTRUÍDO por esta migration: ela só cria tabela nova.
-- ============================================================================

create table if not exists rotinas (
  org_id          uuid not null references orgs(id) on delete cascade,
  chave           text not null,               -- 'minuto' | 'diario' | 'convites' | 'perfis' | 'webhook'
  ultima_tentativa timestamptz not null default now(),
  ultimo_sucesso  timestamptz,                 -- null = nunca funcionou
  ok              boolean not null default true,
  resumo          jsonb,                       -- o que a rodada fez (contadores)
  ultimo_erro     text,
  primary key (org_id, chave)
);

alter table rotinas enable row level security;

-- leitura pela sessão logada (é o painel que mostra); escrita é sempre pela
-- service role dos crons, que não passa por RLS
create policy rotinas_org on rotinas
  using (org_id = current_org_id()) with check (org_id = current_org_id());

comment on table rotinas is
  'Carimbo de "rodou e deu certo" das rotinas automáticas. Uma linha por rotina, sobrescrita a cada execução.';

-- ============================================================================
-- CONFERÊNCIA (rode depois de subir o código e esperar alguns minutos)
-- ============================================================================

-- Tem que aparecer 'minuto' com ultimo_sucesso de menos de 2 minutos atrás.
-- Se a tabela ficar VAZIA por mais de 5 minutos, o cron não está rodando —
-- confira CRON_SECRET na Vercel e o plano da conta (Hobby não roda por minuto).
select chave,
       ok,
       ultima_tentativa,
       ultimo_sucesso,
       round(extract(epoch from (now() - ultimo_sucesso)) / 60) as minutos_desde_o_ultimo_ok,
       ultimo_erro,
       resumo
  from rotinas
 order by chave;
