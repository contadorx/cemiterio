-- ============================================================================
-- 0134 — CONFERIR E DECIDIR, NAO E SO DIZER SIM
-- ============================================================================
--
-- O QUE O LEANDRO VIU, OLHANDO O COMPROVANTE DE 26/08:
--
--   "esperava na tela de confirmacao confirmar informacoes, do tipo qual
--    pagamento fez, contrato avulso, tumulo etc"
--
-- Ele esta certo, e o defeito e de desenho, nao de codigo. A tela mostrava
-- cinco coisas — imagem, valor, data, E2E e o nome do contato — e oferecia dois
-- botoes: "Confirmar pagamento" e "Rejeitar".
--
-- Para dizer "sim, este dinheiro entrou" e preciso saber DE QUEM e, QUANTO essa
-- familia deve, e A QUE o pagamento se refere. Nada disso estava na tela.
-- Confirmar virava um sim automatico — e um sim automatico nao e conferencia,
-- e um carimbo.
--
-- O QUE A FUNCAO PASSA A ACEITAR
--
-- Todas opcionais; sem elas, o comportamento e o da 0133.
--
--   p_valor        a leitura da IA e um PALPITE BOM, nao um fato. Quem confere
--                  e a pessoa, com o extrato do banco do lado. Corrigir aqui
--                  corrige TAMBEM o comprovante — senao a tela passaria a
--                  mostrar um numero que ja nao e o que entrou.
--   p_data         idem: comprovante de Pix as vezes traz a data do envio, e o
--                  dinheiro cai no dia seguinte.
--   p_tumulo       de qual jazigo se trata, quando a familia tem mais de um.
--   p_competencia  A QUE SE REFERE.
--   p_descricao    o que a pessoa quis escrever.
--
-- SOBRE `p_competencia`, E O QUE ELA NAO E
--
-- O razao desta casa e um SALDO CORRENTE, nao uma lista de faturas quitadas
-- uma a uma. Gravar a competencia num credito e deixar uma REFERENCIA — "isto
-- era o agosto dela" —, e nao marcar aquela competencia como paga.
--
-- A diferenca importa e fica escrita aqui de proposito: prometer quitacao item
-- a item seria inventar um mecanismo que o sistema nao tem, e a tela passaria a
-- dizer "agosto pago" sem nada por tras. O saldo continua sendo o juiz.
-- ============================================================================

drop function if exists sureya_conciliar_comprovante(uuid, boolean, uuid);

create or replace function sureya_conciliar_comprovante(
  p_comprovante uuid,
  p_aprovar     boolean,
  p_org         uuid    default null,
  p_valor       numeric default null,
  p_data        date    default null,
  p_tumulo      uuid    default null,
  p_competencia date    default null,
  p_descricao   text    default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status sureya_status_conc;
  v_org    uuid;
  v_comp   record;
  v_tem    boolean;
  v_valor  numeric;
  v_data   date;
  v_texto  text;
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

  if p_valor is not null and p_valor <= 0 then
    raise exception 'valor_invalido' using
      hint = 'Comprovante conferido com R$ 0,00 parece pagamento registrado.';
  end if;

  select * into v_comp from comprovantes
   where id = p_comprovante and org_id = v_org;
  if not found then
    raise exception 'comprovante % nao encontrado nesta org', p_comprovante;
  end if;

  -- O QUE A PESSOA CORRIGIU MANDA, E VOLTA PARA O COMPROVANTE.
  --
  -- A leitura da IA fica no lugar dela: se a pessoa disse que entrou outro
  -- valor, e esse que vale, e a tela nao pode continuar mostrando o antigo.
  v_valor := coalesce(p_valor, v_comp.valor_extraido);
  v_data  := coalesce(p_data,  v_comp.data_extraida, current_date);

  update comprovantes
     set status         = v_status,
         valor_extraido = v_valor,
         data_extraida  = v_data
   where id = p_comprovante and org_id = v_org;

  select exists (
    select 1 from conta_corrente cc
     where cc.comprovante_id = p_comprovante and cc.org_id = v_org
  ) into v_tem;

  v_texto := coalesce(nullif(btrim(coalesce(p_descricao, '')), ''),
                      case when p_competencia is not null
                           then 'Pagamento conferido · ' || to_char(p_competencia, 'MM/YYYY')
                           else 'Comprovante de Pix conferido' end);

  -- O LANCAMENTO QUE FALTA NASCE AQUI (0133), agora com a decisao junto.
  --
  -- So na APROVACAO: rejeitar um comprovante que nunca virou dinheiro nao pode
  -- criar dinheiro para em seguida marca-lo de rejeitado.
  if p_aprovar and not v_tem
     and v_comp.cliente_id is not null
     and coalesce(v_valor, 0) > 0 then
    perform sureya_lancar(
      p_cliente     := v_comp.cliente_id,
      p_tipo        := 'credito',
      p_valor       := v_valor,
      p_origem      := 'pagamento',
      p_descricao   := v_texto,
      p_data        := v_data,
      p_status      := 'confirmado',
      p_comprovante := p_comprovante,
      p_tumulo      := p_tumulo,
      p_competencia := p_competencia,
      p_org         := v_org);
    return;
  end if;

  -- Lancamento ja existia (o caminho do WhatsApp funcionando): a conferencia
  -- carimba o status E leva a correcao junto. Sem isto, corrigir o valor na
  -- tela mudaria o comprovante e deixaria o razao com o numero velho — duas
  -- versoes do mesmo dinheiro.
  update conta_corrente
     set status_conc = v_status,
         valor       = case when p_valor is not null then p_valor else valor end,
         data        = case when p_data  is not null then p_data  else data  end,
         tumulo_id   = coalesce(p_tumulo, tumulo_id),
         competencia = coalesce(p_competencia, competencia),
         descricao   = case when p_descricao is not null then p_descricao else descricao end
   where comprovante_id = p_comprovante and org_id = v_org;
end;
$$;

revoke all on function sureya_conciliar_comprovante(uuid, boolean, uuid, numeric, date, uuid, date, text)
  from public, anon;
grant execute on function sureya_conciliar_comprovante(uuid, boolean, uuid, numeric, date, uuid, date, text)
  to authenticated, service_role;

comment on function sureya_conciliar_comprovante(uuid, boolean, uuid, numeric, date, uuid, date, text) is
  'A conferencia de um comprovante: confirma ou rejeita, e grava a DECISAO — '
  'valor e data corrigidos, jazigo, e a que se refere. A competencia gravada '
  'num credito e REFERENCIA, nao quitacao: o razao e saldo corrente.';
