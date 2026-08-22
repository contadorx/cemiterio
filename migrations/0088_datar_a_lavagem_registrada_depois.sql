-- =====================================================================
-- 0088 · DATAR A LAVAGEM QUE FOI REGISTRADA DEPOIS
-- =====================================================================
--
-- O PEDIDO, 22/08
-- "Queria ter como cadastrar um serviço realizado pelo painel, com data e foto,
-- para ir para a fila e registrar lavagem."
--
-- O QUE JÁ EXISTIA, E POR QUE NÃO SERVIA
-- `POST /api/servico` com `dataExecutada` já criava um serviço `executado`. Só
-- que ele fazia isso por fora da transação da casa:
--
--   · inseria em `conta_corrente` com um `insert` próprio — uma SEGUNDA
--     implementação da regra de dinheiro, exatamente o que a 0073 existiu para
--     acabar ao criar a porta única `sureya_lancar`;
--   · não aceitava foto, então a mensagem nunca chegava à fila de liberação;
--   · não calculava remuneração da executora nem baixava material;
--   · não registrava a lavagem no extrato no mesmo formato das outras.
--
-- Ou seja: uma limpeza registrada pelo painel valia menos que a mesma limpeza
-- registrada pelo campo, e a diferença não aparecia em lugar nenhum.
--
-- O CAMINHO NOVO, E O BURACO QUE ELE DEIXA
-- A rota passa a criar o serviço JÁ `executado`, com a data informada, e chamar
-- `sureya_concluir_lavagem`. A função é CONVERGENTE: vendo o serviço já
-- executado ela não reescreve o status (nem a data, portanto) e sai criando o
-- que estiver faltando — débito, extrato, fila, remuneração, material. É o
-- comportamento que ela foi feita para ter, e é o que faz a data retroativa
-- sobreviver sem precisar mexer na assinatura da função.
--
-- O buraco: os lançamentos que ela cria carimbam `data = current_date`. Numa
-- limpeza registrada no mesmo mês isso não muda nada. Registrada em setembro
-- uma limpeza feita em agosto, o lançamento cai na competência ERRADA — e
-- competência errada é dinheiro cobrado no mês errado.
--
-- É isso que esta função fecha: ela alinha a data do serviço e a dos
-- lançamentos daquela lavagem à data informada. Fica no banco, e não na rota,
-- porque é uma correção de dinheiro: precisa ser atômica, precisa ser
-- auditável, e precisa poder ser testada sem subir a aplicação.
-- =====================================================================

create or replace function public.sureya_datar_lavagem(p_servico uuid, p_data date)
returns table(servico_ajustado boolean, lancamentos_ajustados int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := current_org_id();
  v_s   boolean := false;
  v_l   int := 0;
begin
  if v_org is null then
    raise exception 'sem_org' using errcode = '42501';
  end if;
  -- Só admin. Datar lavagem para trás mexe em competência, e competência é
  -- cobrança: não é decisão de quem está no cemitério com o celular na mão.
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  if p_data is null then
    raise exception 'data_obrigatoria' using errcode = '22004';
  end if;
  -- Data no futuro não é registro de coisa feita. Recusa em vez de gravar: um
  -- serviço "executado" amanhã envenena a urgência do jazigo e o fechamento.
  if p_data > current_date then
    raise exception 'data_no_futuro' using errcode = '22007';
  end if;

  -- Meio-dia, e não meia-noite. `data_executada` é timestamptz: gravar
  -- 00:00 num fuso a oeste de Greenwich devolve o DIA ANTERIOR ao ler em UTC,
  -- e a lavagem do dia 5 aparece como dia 4 em metade das telas.
  update servicos
     set data_executada = (p_data::text || ' 12:00:00')::timestamp at time zone 'America/Sao_Paulo'
   where id = p_servico and org_id = v_org and status::text = 'executado';
  v_s := found;

  -- Só os lançamentos DESTA lavagem. `origem = 'lavagem'` mantém de fora
  -- pagamento, abertura e ajuste que por acaso apontem para o mesmo serviço.
  update conta_corrente
     set data = p_data
   where servico_id = p_servico and org_id = v_org and origem::text = 'lavagem'
     and data is distinct from p_data;
  get diagnostics v_l = row_count;

  return query select v_s, v_l;
end $$;

comment on function public.sureya_datar_lavagem(uuid, date) is
  'Alinha a data do servico executado e a dos lancamentos daquela lavagem a data informada. Existe porque sureya_concluir_lavagem carimba current_date, e uma limpeza registrada depois cairia na competencia errada.';

revoke execute on function public.sureya_datar_lavagem(uuid, date) from public, anon;
grant  execute on function public.sureya_datar_lavagem(uuid, date) to authenticated, service_role;

-- =====================================================================
-- CONFERENCIA
-- =====================================================================
-- select s.id, s.data_executada, c.data, c.origem, c.valor
--   from servicos s left join conta_corrente c on c.servico_id = s.id
--  where s.id = '...';
