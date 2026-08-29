-- ============================================================================
-- 0147 — A FAMILIA SEM JAZIGO SAI COM A PESSOA, E QUEM ESCREVEU FICA
-- ============================================================================
--
-- O QUE SE MEDIU EM 29/08, com os 11 duplicados JA JUNTADOS
--
--   122  familias sem jazigo nenhum
--   113  pessoas dentro delas
--   103  dessas pessoas criadas no MESMO DIA, 19/08 — a importacao da planilha
--     3  familias que ESCREVERAM DE VERDADE: Eliana (3 mensagens),
--        Nena Roberto (6) e Zulmira (3)
--     0  com dinheiro
--
-- POR QUE NAO E UM `DELETE` E PRONTO
--
--   conta_corrente.familia_id  ON DELETE CASCADE  -> o razao some junto
--   mensagens.cliente_id       ON DELETE CASCADE  -> a conversa some junto
--   clientes.familia_id        ON DELETE SET NULL -> a pessoa fica ORFA
--
-- E orfao nao recebe pagamento: `sureya_lancar` recusa com
-- 'cliente_sem_familia'. Apagar so a familia criaria, de uma vez, 113 pessoas
-- para quem nenhum Pix futuro entraria — o mesmo defeito que a 0145 mediu, por
-- outro caminho.
--
-- ENTAO: a pessoa vai JUNTO, e quem tem historico e RECUSADO com o motivo.
-- A funcao nao decide o que e historico por adivinhacao: lancamento,
-- comprovante ou mensagem: se existe qualquer um, ela para.
--
-- (Conversa VAZIA nao segura: e uma linha que o proprio cadastro cria, sem
-- nada dentro. Segurar por ela deixaria 3 familias na lista para sempre, e
-- lista que nunca zera se aprende a ignorar.)
--
-- NADA AQUI APAGA NADA SOZINHO. Sao duas funcoes: uma que le, e uma que a
-- pessoa chama de uma tela, familia por familia.
-- ============================================================================

create or replace function sureya_familias_sem_jazigo(p_org uuid)
returns table (
  familia_id uuid, familia text, pessoas int, nomes text,
  lancamentos int, comprovantes int, mensagens int, conversas int,
  pode_apagar boolean, porque text
)
language sql
stable
security definer
set search_path = public
as $$
  with sem as (
    select f.id, f.nome
      from familias f
     where f.org_id = p_org
       and not exists (select 1 from tumulos t where t.familia_id = f.id)
  ),
  carga as (
    select s.id, s.nome,
      (select count(*)::int from clientes c where c.familia_id = s.id) pessoas,
      (select string_agg(c.nome, ', ' order by c.nome)
         from clientes c where c.familia_id = s.id) nomes,
      (select count(*)::int from conta_corrente x where x.familia_id = s.id) lanc,
      (select count(*)::int from comprovantes cp
         join clientes c on c.id = cp.cliente_id where c.familia_id = s.id) comprov,
      (select count(*)::int from mensagens m
         join clientes c on c.id = m.cliente_id where c.familia_id = s.id) msgs,
      (select count(*)::int from conversas cv
         join clientes c on c.id = cv.cliente_id where c.familia_id = s.id) convs
    from sem s
  )
  select id, nome, pessoas, nomes, lanc, comprov, msgs, convs,
         (lanc = 0 and comprov = 0 and msgs = 0),
         case
           when lanc > 0    then 'tem lançamento no razão'
           when comprov > 0 then 'tem comprovante de pagamento'
           when msgs > 0    then 'a família escreveu — há mensagens guardadas'
           when convs > 0   then 'só conversa vazia, sem mensagem'
           when pessoas > 0 then 'só o cadastro da pessoa'
           else 'vazia'
         end
    from carga
   -- QUEM SEGURA APARECE PRIMEIRO: e a informacao que muda a decisao, e no fim
   -- de uma lista de 122 ela nao seria lida.
   order by (lanc + comprov + msgs) desc, nome;
$$;

comment on function sureya_familias_sem_jazigo(uuid) is
  'Familias sem jazigo e o que cada uma carrega (0147). So le.';

revoke execute on function sureya_familias_sem_jazigo(uuid) from public, anon;
grant  execute on function sureya_familias_sem_jazigo(uuid) to authenticated, service_role;

create or replace function sureya_apagar_familia_sem_jazigo(
  p_familia uuid,
  p_org     uuid    default null,
  p_ensaio  boolean default false
)
returns table (o_que text, quantos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_nome text;
  v_pessoas int; v_lanc int; v_comprov int; v_msgs int; v_convs int; v_tum int;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := coalesce(p_org, current_org_id());
  if v_org is null then raise exception 'sem_org'; end if;

  select f.nome into v_nome from familias f where f.id = p_familia and f.org_id = v_org;
  if v_nome is null then raise exception 'familia_nao_encontrada'; end if;

  -- A FAMILIA COM JAZIGO NAO PASSA POR AQUI, nem por engano. Esta funcao apaga
  -- a PESSOA junto; usada na familia errada, apagaria o dono de um jazigo.
  select count(*) into v_tum from tumulos where familia_id = p_familia;
  if v_tum > 0 then
    raise exception 'familia_tem_jazigo' using
      hint = 'Esta familia tem jazigo. Esta funcao so limpa as que nao tem.';
  end if;

  select count(*) into v_pessoas from clientes where familia_id = p_familia;
  select count(*) into v_lanc    from conta_corrente where familia_id = p_familia;
  select count(*) into v_comprov from comprovantes cp
    join clientes c on c.id = cp.cliente_id where c.familia_id = p_familia;
  select count(*) into v_msgs    from mensagens m
    join clientes c on c.id = m.cliente_id where c.familia_id = p_familia;
  select count(*) into v_convs   from conversas cv
    join clientes c on c.id = cv.cliente_id where c.familia_id = p_familia;

  -- HISTORICO SEGURA. As tres familias reais que isto protege escreveram 3, 6
  -- e 3 mensagens — e `mensagens.cliente_id` e CASCADE: sem esta trava, a
  -- conversa delas sumiria calada junto com a limpeza.
  if v_lanc > 0 or v_comprov > 0 or v_msgs > 0 then
    raise exception 'familia_tem_historico' using
      hint = format('A familia "%s" tem %s lancamento(s), %s comprovante(s) e %s mensagem(ns). '
                    || 'Isso e historico da familia: mova para o cadastro certo antes.',
                    v_nome, v_lanc, v_comprov, v_msgs);
  end if;

  o_que := 'pessoas';   quantos := v_pessoas; return next;
  o_que := 'conversas'; quantos := v_convs;   return next;

  if not p_ensaio then
    -- A ORDEM IMPORTA: a conversa vazia sai antes da pessoa, e a pessoa antes
    -- da familia. Apagar a familia primeiro deixaria a pessoa orfa (SET NULL) e
    -- o `delete` seguinte nao a acharia mais por `familia_id`.
    delete from conversas cv using clientes c
     where cv.cliente_id = c.id and c.familia_id = p_familia;
    delete from clientes where familia_id = p_familia;
    delete from familias where id = p_familia and org_id = v_org;
  end if;

  return;
end $$;

comment on function sureya_apagar_familia_sem_jazigo(uuid, uuid, boolean) is
  'Apaga familia sem jazigo E sem historico, junto com a pessoa (0147). p_ensaio so conta.';

revoke execute on function sureya_apagar_familia_sem_jazigo(uuid, uuid, boolean) from public, anon;
grant  execute on function sureya_apagar_familia_sem_jazigo(uuid, uuid, boolean) to authenticated, service_role;
