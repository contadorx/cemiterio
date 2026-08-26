-- ============================================================================
-- 0133 — O COMPROVANTE DO WHATSAPP VIRA DINHEIRO
-- ============================================================================
--
-- UM COMPROVANTE DE VERDADE, EM 26/08, E O QUE ELE MOSTROU
--
-- 11:42:30  chegou um Pix pelo WhatsApp. Lido certo: R$ 40,00, 26/08, e o E2E
--           inteiro. Gravado em `comprovantes` como `a_conferir`.
-- 11:42:32  "Bom dia"
-- 11:43:08  a IA preparou a resposta e SEGUROU — disparo automatico desligado,
--           que e a regra da casa.
-- 11:43:31  "Se eu precisar lavar o tumulo em uma data especifica, como faco"
--
-- A conversa ficou `lida_sem_resposta` e ESCALADA. Tudo isso esta certo.
--
-- O que nao esta: NENHUMA LINHA NO RAZAO. O dinheiro nao existe para o sistema.
--
-- A CAUSA, PROVADA
--
-- `registrarComprovante` chama `sureya_lancar` para criar o credito pendente.
-- Ensaiado em producao com os dados reais desse comprovante:
--
--     ENSAIO DESFEITO >> sureya_lancar FALHOU: [P0001] sem_org
--
-- `sureya_lancar` resolve a org por `current_org_id()` e NAO tem parametro de
-- org. Quem chama ali e o webhook do WhatsApp, com o cliente de service_role e
-- SEM sessao de painel — e fora de uma sessao `current_org_id()` e nulo.
--
-- E a licao da 0103, escrita neste repositorio: "toda funcao chamavel por cron
-- ou psql precisa de p_org explicito". `sureya_lancar` ficou de fora.
--
-- POR QUE SO APARECEU AGORA
--
-- O comprovante anterior e de 02/08, e naquele dia FUNCIONOU: a escrita ainda
-- passava por `movimentos` e chegava ao razao pelo gatilho de espelho. A 0073
-- mudou essa porta para `sureya_lancar` direto. De 02/08 ate 26/08 nao chegou
-- comprovante nenhum — o defeito ficou deitado, esperando o proximo.
--
-- E FALHOU CALADO
--
-- O erro so ia para `console.error`. O comentario ao lado dele diz, com todas
-- as letras: "foi um catch mudo como este que escondeu, por meses, o extrato da
-- familia nunca funcionando". A licao estava escrita a UMA LINHA do lugar onde
-- o mesmo erro aconteceu de novo. Agora vai para `erros_log`, que aparece no
-- painel de rotinas.
-- ============================================================================

-- ============================================================================
-- 1. `sureya_lancar` ACEITA A ORG POR PARAMETRO
-- ============================================================================
--
-- DROP ANTES: acrescentar um parametro com default cria uma SOBRECARGA, e uma
-- chamada com os 13 argumentos antigos ficaria ambigua entre as duas. A licao
-- da 0109.
--
-- O corpo e o mesmo, exceto pela primeira linha: `coalesce(p_org,
-- current_org_id())` em vez de `current_org_id()` sozinho. Quem chama de dentro
-- de uma sessao continua sem passar nada.
do $$
declare v_def text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'sureya_lancar';
  if v_def is null then
    raise exception '0133: sureya_lancar nao existe';
  end if;
  if position('p_estorna uuid DEFAULT NULL::uuid)' in v_def) = 0 then
    raise exception '0133: nao achei o fim da lista de parametros de sureya_lancar';
  end if;
  -- O ALVO E CURTO DE PROPOSITO. A primeira versao procurava
  -- 'v_org uuid := current_org_id();' e nao achou: o corpo guardado tem CRLF e
  -- ESPACOS DE ALINHAMENTO ('v_org     uuid := ...'). A guarda pegou — que e
  -- para isso que ela existe — mas a licao fica: emenda por substituicao mira
  -- no texto que sobrevive a formatacao, e nunca no que a gente imagina que
  -- esta escrito. Conferido: 'uuid := current_org_id();' aparece UMA vez.
  if position('uuid := current_org_id();' in v_def) = 0 then
    raise exception '0133: nao achei a resolucao da org em sureya_lancar';
  end if;

  v_def := replace(v_def, 'p_estorna uuid DEFAULT NULL::uuid)',
                          'p_estorna uuid DEFAULT NULL::uuid, p_org uuid DEFAULT NULL::uuid)');
  v_def := replace(v_def, 'uuid := current_org_id();',
                          'uuid := coalesce(p_org, current_org_id());');

  drop function if exists sureya_lancar(uuid, text, numeric, text, text, date, text,
                                        uuid, uuid, uuid, date, boolean, uuid);
  execute v_def;
end $$;

revoke all on function sureya_lancar(uuid, text, numeric, text, text, date, text,
                                     uuid, uuid, uuid, date, boolean, uuid, uuid)
  from public, anon;
grant execute on function sureya_lancar(uuid, text, numeric, text, text, date, text,
                                        uuid, uuid, uuid, date, boolean, uuid, uuid)
  to authenticated, service_role;

comment on function sureya_lancar(uuid, text, numeric, text, text, date, text,
                                  uuid, uuid, uuid, date, boolean, uuid, uuid) is
  'A porta unica do dinheiro da familia. `p_org` e OBRIGATORIO para quem chama '
  'sem sessao de painel — cron, webhook, psql: fora de uma sessao '
  '`current_org_id()` e nulo e a chamada morre com `sem_org` (0103, 0133).';

-- ============================================================================
-- 2. CONFIRMAR UM COMPROVANTE PASSA A CRIAR O LANCAMENTO QUE FALTA
-- ============================================================================
--
-- A funcao so fazia UPDATE em `conta_corrente ... where comprovante_id = ...`.
-- Se a linha nao existe — e nao existe, pelo defeito acima —, o update mexe em
-- ZERO linhas e o botao "confirmar" do Financeiro diz que deu certo sem nada
-- ter acontecido.
--
-- Agora, ao aprovar, se nao houver lancamento ligado aquele comprovante, ele e
-- criado a partir do proprio comprovante: valor, data e cliente que a leitura
-- extraiu. E o que teria acontecido se a porta nao tivesse quebrado.
--
-- Isto tambem RECUPERA os comprovantes que ficaram para tras: confirmar na tela
-- resolve, sem ninguem digitar valor nenhum.
--
-- CONVERGENTE: com o lancamento ja existindo, so atualiza o status, como antes.
-- E ELA TAMBEM GANHA `p_org` (0133).
--
-- Nao estava quebrada: quem a chama e uma rota de painel, com sessao. Mas ela
-- filtra por `current_org_id()`, e isso a torna INTESTAVEL fora de uma sessao —
-- foi o proprio teste desta migration que esbarrou nisso, com a mesma mensagem
-- que derrubou o comprovante de 26/08.
--
-- Uma funcao de dinheiro que so pode ser exercitada em producao e uma funcao
-- que ninguem exercita. `drop` antes: com o default, chamar com dois argumentos
-- ficaria ambiguo entre as duas versoes (a licao da 0109).
drop function if exists sureya_conciliar_comprovante(uuid, boolean);

create or replace function sureya_conciliar_comprovante(
  p_comprovante uuid, p_aprovar boolean, p_org uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status sureya_status_conc;
  v_org    uuid;
  v_comp   record;
  v_tem    boolean;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_status := case when p_aprovar then 'confirmado' else 'rejeitado' end;
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_org' using
      hint = 'Sem sessao do painel: passe p_org.';
  end if;

  update comprovantes set status = v_status
   where id = p_comprovante and org_id = v_org
  returning org_id, cliente_id, valor_extraido, data_extraida into v_comp;

  if v_comp.org_id is null then
    raise exception 'comprovante % nao encontrado nesta org', p_comprovante;
  end if;

  select exists (
    select 1 from conta_corrente cc
     where cc.comprovante_id = p_comprovante and cc.org_id = v_org
  ) into v_tem;

  -- O LANCAMENTO QUE FALTA NASCE AQUI (0133).
  --
  -- So na APROVACAO: rejeitar um comprovante que nunca virou dinheiro nao pode
  -- criar dinheiro para em seguida marca-lo de rejeitado.
  --
  -- E so com valor lido. Comprovante sem valor e imagem sem numero: lancar
  -- R$ 0,00 pareceria pagamento registrado.
  if p_aprovar and not v_tem
     and v_comp.cliente_id is not null
     and coalesce(v_comp.valor_extraido, 0) > 0 then
    perform sureya_lancar(
      p_cliente     := v_comp.cliente_id,
      p_tipo        := 'credito',
      p_valor       := v_comp.valor_extraido,
      p_origem      := 'pagamento',
      p_descricao   := 'Comprovante de Pix conferido',
      p_data        := coalesce(v_comp.data_extraida, current_date),
      p_status      := 'confirmado',
      p_comprovante := p_comprovante,
      p_org         := v_org);
    return;
  end if;

  update conta_corrente set status_conc = v_status
   where comprovante_id = p_comprovante and org_id = v_org;
end;
$$;

revoke all on function sureya_conciliar_comprovante(uuid, boolean, uuid) from public, anon;
grant execute on function sureya_conciliar_comprovante(uuid, boolean, uuid)
  to authenticated, service_role;
