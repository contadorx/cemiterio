-- 0030 — Chave de envio por familia + conserto do Saldo de abertura
-- ---------------------------------------------------------------------------
-- DUAS COISAS NESTE ARQUIVO (rode inteiro, de uma vez, no SQL Editor):
--
--  PARTE A — coluna clientes.envio_automatico: o botao liga/desliga da ficha da
--            familia. Com ele DESLIGADO a Sureya nao dispara nada sozinha para
--            aquela familia (foto do jazigo, cobranca, convite, pesquisa).
--            Toda familia ja existente nasce LIGADA; voce desliga as que quer
--            revisar antes de por no ar.
--
--  PARTE B — funcao sureya_saldo_abertura: era ela que devolvia o erro
--            'column "tipo" is of type sureya_tipo_movimento but expression is
--            of type text'. A versao antiga montava o tipo com um CASE solto
--            ('credito' / 'debito' como texto puro) e o Postgres nao converte
--            texto em enum sozinho dentro de um INSERT. Aqui o valor vai com a
--            conversao explicita ::sureya_tipo_movimento.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- PARTE A — a chave de envio automatico da familia
-- ===========================================================================
alter table clientes
  add column if not exists envio_automatico boolean not null default true;

comment on column clientes.envio_automatico is
  'false = familia em revisao: nenhum disparo automatico sai para ela (foto do servico, cobranca, convite, pesquisa). Resposta manual na conversa continua funcionando.';

create index if not exists idx_clientes_envio_automatico
  on clientes(org_id, envio_automatico);


-- ===========================================================================
-- PARTE B — Saldo de abertura (migracao) — versao corrigida
-- ===========================================================================
-- Convencao contabil da tabela movimentos:
--   credito  = dinheiro que entrou (familia adiantada)
--   debito   = dinheiro que a familia deve
-- O app manda p_valor POSITIVO quando a familia esta adiantada e NEGATIVO
-- quando esta em aberto (ele ja inverte o sinal do campo "valor em aberto").
--
-- Rodar de novo para a mesma familia SUBSTITUI a abertura anterior — nunca
-- soma duas vezes.

-- derruba a versao antiga antes (ela pode ter outro tipo de retorno ou outro
-- nome de parametro, e nesse caso o "create or replace" sozinho recusaria)
drop function if exists sureya_saldo_abertura(uuid, numeric, date, text);

create or replace function sureya_saldo_abertura(
  p_cliente uuid,
  p_valor   numeric,
  p_data    date default current_date,
  p_nota    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_org  uuid := current_org_id();
  v_tipo sureya_tipo_movimento;
  v_desc text;
begin
  if v_org is null then
    raise exception 'sem org';
  end if;

  if not exists (select 1 from clientes where id = p_cliente and org_id = v_org) then
    raise exception 'cliente % nao encontrado nesta org', p_cliente;
  end if;

  -- limpa a abertura anterior desta familia (idempotente)
  delete from movimentos
   where org_id = v_org
     and cliente_id = p_cliente
     and origem = 'ajuste'::sureya_origem_movimento
     and descricao like 'Saldo de abertura (migração)%';

  -- zero = so apagar a abertura antiga e sair
  if p_valor is null or abs(p_valor) < 0.005 then
    return null;
  end if;

  -- AQUI ESTAVA O ERRO: sem o ::sureya_tipo_movimento o Postgres trata
  -- 'credito'/'debito' como text e recusa o insert na coluna enum.
  v_tipo := (case when p_valor >= 0 then 'credito' else 'debito' end)::sureya_tipo_movimento;

  v_desc := 'Saldo de abertura (migração)'
            || coalesce(' — ' || nullif(btrim(p_nota), ''), '');

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (
    v_org,
    p_cliente,
    v_tipo,
    abs(p_valor),
    'ajuste'::sureya_origem_movimento,
    'confirmado'::sureya_status_conc,
    v_desc,
    coalesce(p_data, current_date)
  )
  returning id into v_id;

  return v_id;
end
$$;

grant execute on function sureya_saldo_abertura(uuid, numeric, date, text) to authenticated;


-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, so leitura)
-- ---------------------------------------------------------------------------
-- select nome, envio_automatico from clientes order by nome;
-- select cliente_id, tipo, valor, descricao, data
--   from movimentos where descricao like 'Saldo de abertura%' order by created_at desc;
