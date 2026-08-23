-- 0108 — FUNDIR E EXCLUIR FAMÍLIA
--
-- O PEDIDO
--   "coloca no build uma ação de excluir a familia, temos já duplicadas"
--
-- O QUE A MEDIÇÃO MUDOU NA SOLUÇÃO
--   31 nomes repetidos, 97 famílias envolvidas. "Família Cemitério" aparece
--   ~30 vezes — resto de importação. Mas:
--
--     97 famílias duplicadas
--      0 totalmente vazias      ← nenhuma
--     97 com contato
--     48 com jazigo
--      0 com lançamento no razão
--
--   NENHUMA está vazia. Um "excluir" que respeita o dado recusaria as 97, e um
--   que não respeita levaria junto 48 jazigos e 97 contatos — o mesmo desenho
--   que já mordeu esta casa uma vez, quando `DELETE /api/clientes/[id]`
--   apagava `tumulos` por `cliente_id`.
--
--   O que duplicata pede não é exclusão: é FUSÃO. Excluir é para o que sobra
--   depois — e para o cadastro criado por engano, que existe e é legítimo.
--
--   As duas ações entram juntas porque uma sem a outra é armadilha: fundir sem
--   excluir deixa cascas pela lista; excluir sem fundir convida a apagar o que
--   tem jazigo.
--
--   E as ZERO com lançamento são a boa notícia: fundir hoje não mistura
--   histórico de dinheiro de ninguém. É a hora mais barata que vai existir.

begin;

-- ---------------------------------------------------------------------------
-- FUNDIR
-- ---------------------------------------------------------------------------
-- Move tudo o que aponta para a família de origem, e só então a apaga. Numa
-- transação: uma fusão pela metade deixaria contatos numa casa e jazigos em
-- outra, que é pior que as duas separadas.
create or replace function public.sureya_fundir_familias(
  p_origem uuid, p_destino uuid, p_motivo text default null)
returns table(contatos integer, tumulos integer, lancamentos integer,
              eventos integer, mensagens integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_org_d uuid;
  v_c int := 0; v_t int := 0; v_l int := 0; v_e int := 0; v_m int := 0;
  v_resp_destino uuid;
begin
  if p_origem is null or p_destino is null then
    raise exception 'informe_origem_e_destino' using errcode = '22004';
  end if;
  if p_origem = p_destino then
    raise exception 'origem_igual_ao_destino' using
      errcode = '22023', hint = 'Escolha outra familia para receber.';
  end if;

  select org_id into v_org   from familias where id = p_origem;
  select org_id into v_org_d from familias where id = p_destino;
  if v_org is null or v_org_d is null then
    raise exception 'familia_nao_encontrada' using errcode = '42501';
  end if;
  -- Duas casas diferentes nunca se fundem: seria vazar cadastro entre orgs por
  -- um id colado no lugar errado.
  if v_org <> v_org_d then
    raise exception 'familias_de_organizacoes_diferentes' using errcode = '42501';
  end if;

  -- O TITULAR DO DESTINO MANDA. Se ele já tem um, os contatos que chegam
  -- entram como gente da casa, não como candidatos a responsável — senão a
  -- fusão trocaria quem responde pelo dinheiro sem ninguém pedir.
  select responsavel_id into v_resp_destino from familias where id = p_destino;

  update clientes set familia_id = p_destino where familia_id = p_origem;
  get diagnostics v_c = row_count;

  update tumulos set familia_id = p_destino where familia_id = p_origem;
  get diagnostics v_t = row_count;

  update conta_corrente set familia_id = p_destino where familia_id = p_origem;
  get diagnostics v_l = row_count;

  update eventos_memoria set familia_id = p_destino where familia_id = p_origem;
  get diagnostics v_e = row_count;

  update fila_liberacao set familia_id = p_destino where familia_id = p_origem;
  get diagnostics v_m = row_count;

  -- O que mais aponta para familia_id e não pode ficar órfão.
  update familia_responsavel_log set familia_id = p_destino where familia_id = p_origem;

  -- Sem titular no destino, o da origem assume: melhor um do que nenhum.
  if v_resp_destino is null then
    update familias f set responsavel_id = o.responsavel_id
      from familias o
     where f.id = p_destino and o.id = p_origem and o.responsavel_id is not null;
  end if;

  -- A origem agora está vazia. Some da lista.
  delete from familias where id = p_origem;

  return query select v_c, v_t, v_l, v_e, v_m;
end $$;

-- ---------------------------------------------------------------------------
-- EXCLUIR — só o que está realmente vazio
-- ---------------------------------------------------------------------------
-- Recusa e DIZ o que está segurando. Um "não deu" sem motivo faz a pessoa
-- tentar de novo pelo mesmo caminho; dizer "tem 2 jazigos" manda ela para o
-- lugar certo (fundir, ou soltar o jazigo antes).
create or replace function public.sureya_excluir_familia(p_familia uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_c int; v_t int; v_l int; v_prende text[] := '{}';
begin
  if not exists (select 1 from familias where id = p_familia and org_id = current_org_id()) then
    raise exception 'familia_nao_encontrada' using errcode = '42501';
  end if;

  select count(*) into v_c from clientes       where familia_id = p_familia;
  select count(*) into v_t from tumulos        where familia_id = p_familia;
  select count(*) into v_l from conta_corrente where familia_id = p_familia;

  if v_c > 0 then v_prende := v_prende || (v_c || ' contato(s)')::text; end if;
  if v_t > 0 then v_prende := v_prende || (v_t || ' jazigo(s)')::text; end if;
  if v_l > 0 then v_prende := v_prende || (v_l || ' lancamento(s) no razao')::text; end if;

  if array_length(v_prende, 1) > 0 then
    raise exception 'familia_nao_esta_vazia'
      using errcode = '23503',
            detail = array_to_string(v_prende, ', '),
            hint = 'Funda com outra familia, ou solte o que esta preso antes de excluir.';
  end if;

  delete from familias where id = p_familia;
end $$;

revoke all on function public.sureya_fundir_familias(uuid, uuid, text) from public, anon;
revoke all on function public.sureya_excluir_familia(uuid) from public, anon;
grant execute on function public.sureya_fundir_familias(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.sureya_excluir_familia(uuid) to authenticated, service_role;

commit;
