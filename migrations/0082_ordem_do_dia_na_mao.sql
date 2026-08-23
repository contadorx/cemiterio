-- ============================================================================
-- SUREYA — 0082 · A ORDEM DO DIA PASSA A SER EDITÁVEL
--
-- Pedido da responsável: "quero ter flexibilidade para definir a agenda, mudar
-- ela, priorizar um jazigo". Quem reordena: ela no painel na véspera, a pessoa
-- de campo no dia, e o caso de encaixar um jazigo urgente à frente.
--
-- O QUE JÁ EXISTIA
-- ---------------------------------------------------------------------------
-- A roteirização é por sequência de quadra e rua (`lib/agenda.ts`), com
-- serpentina — ruas alternadas percorridas ao contrário, para uma emendar na
-- outra em vez de voltar andando à toa. Isso é bom e continua.
--
-- O que não existia era **mexer nela**. `ordem_dia` só era escrita pelo
-- gerador; não havia porta para um humano dizer "este primeiro".
--
-- POR QUE A ORDEM MANUAL SOBREVIVE
-- ---------------------------------------------------------------------------
-- O gerador só distribui serviço com `status = 'pendente'` e sem `fixado_em`.
-- Serviço já `agendado` não é renumerado. Então reordenar à mão um dia já
-- montado é seguro — e o que entrar depois é acrescentado no fim, não no meio.
--
-- POR QUE NÚMEROS INTEIROS E NÃO FRAÇÕES
-- ---------------------------------------------------------------------------
-- Dava para pôr o urgente em `ordem_dia = 0.5` e não mexer no resto. Mas aí a
-- coluna deixa de ser "a primeira, a segunda, a terceira" e vira um peso que
-- ninguém consegue ler. Renumerar o dia inteiro custa um `update` numa lista de
-- dez linhas e mantém a coluna legível para quem for depurar isso às pressas.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Definir a sequência de um dia, de uma vez
--
-- Recebe os ids NA ORDEM desejada e numera de 1 em diante. O que não vier na
-- lista mantém a posição relativa, depois dos listados — assim dá para arrastar
-- só os três primeiros sem precisar mandar o dia inteiro.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_reordenar_dia(
  p_data date,
  p_ids  uuid[],
  p_executora uuid default null
) returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := current_org_id();
  v_n   int;
begin
  if v_org is null then raise exception 'sem_org'; end if;

  -- ADMIN REORDENA QUALQUER DIA; O CAMPO, SÓ O PRÓPRIO.
  -- Sem esta linha, uma pessoa de campo reorganizaria o dia da outra — e a
  -- outra descobriria andando.
  if auth.uid() is not null and not is_admin() then
    if p_executora is distinct from auth.uid() then
      raise exception 'so_o_proprio_dia' using errcode = '42501';
    end if;
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'lista_vazia';
  end if;

  -- Os ids TÊM de ser daquele dia e daquela pessoa. Sem conferir, uma lista
  -- montada errado renumeraria serviço de outro dia — e o estrago só apareceria
  -- na manhã seguinte.
  select count(*) into v_n
    from servicos s
   where s.id = any(p_ids)
     and s.org_id = v_org
     and s.data_prevista = p_data
     and (p_executora is null or s.executora_id = p_executora);

  if v_n <> array_length(p_ids, 1) then
    raise exception 'ids_de_outro_dia: % de % conferem', v_n, array_length(p_ids, 1);
  end if;

  -- Os listados assumem 1..N, na ordem em que vieram.
  update servicos s
     set ordem_dia = pos.i
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as i) pos
   where s.id = pos.id and s.org_id = v_org;

  -- O que não veio na lista vai para depois, mantendo a ordem relativa que
  -- tinha. Reordenar os três primeiros não pode embaralhar os outros sete.
  with resto as (
    select s.id,
           row_number() over (order by s.ordem_dia nulls last, s.created_at) + array_length(p_ids, 1) as nova
      from servicos s
     where s.org_id = v_org
       and s.data_prevista = p_data
       and (p_executora is null or s.executora_id = p_executora)
       and not (s.id = any(p_ids))
  )
  update servicos s set ordem_dia = resto.nova
    from resto where s.id = resto.id;

  return array_length(p_ids, 1);
end
$function$;

comment on function public.sureya_reordenar_dia is
  'Define a sequencia do dia. O que nao vier na lista mantem a ordem relativa, '
  'depois dos listados — reordenar os tres primeiros nao pode embaralhar os '
  'outros sete.';


-- ----------------------------------------------------------------------------
-- 2) Este agora
--
-- O caso que a responsável nomeou: a família ligou, tem visita marcada, este
-- jazigo tem de ser o próximo. Um toque, sem montar lista nenhuma.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_priorizar_servico(p_servico uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org  uuid := current_org_id();
  v_s    record;
begin
  if v_org is null then raise exception 'sem_org'; end if;

  select id, data_prevista, executora_id, status::text as status
    into v_s
    from servicos where id = p_servico and org_id = v_org;
  if not found then raise exception 'servico_nao_encontrado'; end if;

  if auth.uid() is not null and not is_admin()
     and v_s.executora_id is distinct from auth.uid() then
    raise exception 'servico_de_outra_executora' using errcode = '42501';
  end if;

  -- Serviço já executado não volta para a fila do dia. Priorizar o que já foi
  -- feito não significa nada, e deixar passar confunde quem olha a lista.
  if v_s.status = 'executado' then raise exception 'ja_executado'; end if;

  -- Vira o primeiro; todo o resto do dia desce um.
  update servicos s
     set ordem_dia = coalesce(s.ordem_dia, 999) + 1
   where s.org_id = v_org
     and s.data_prevista = v_s.data_prevista
     and s.executora_id is not distinct from v_s.executora_id
     and s.id <> p_servico
     and s.status::text <> 'executado';

  update servicos set ordem_dia = 1 where id = p_servico;
  return true;
end
$function$;

comment on function public.sureya_priorizar_servico is
  'Poe o servico como o proximo do dia e desce o resto. Executado nao volta '
  'para a fila.';

revoke execute on function public.sureya_reordenar_dia(date, uuid[], uuid) from public, anon;
revoke execute on function public.sureya_priorizar_servico(uuid) from public, anon;

commit;
