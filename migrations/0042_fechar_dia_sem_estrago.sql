-- ============================================================================
-- SUREYA — 0042 · FECHAR O DIA SEM ATROPELAR NINGUÉM
--
-- TRÊS PROBLEMAS NA FUNÇÃO DE 0012, todos silenciosos:
--
-- 1. O MOTIVO DO "NÃO DEU" ERA SOBRESCRITO.
--    A Nina toca "Não deu", escolhe "Começou a chover" e isso é gravado em
--    motivo_adiamento. No fim do dia, o "Encerrar dia" passava por cima com
--    `coalesce(p_observacoes, 'não concluído no dia')` — o motivo específico
--    que ela digitou virava a observação genérica do dia, ou pior, o texto
--    padrão. Você perdia exatamente a informação que serve para enxergar o
--    padrão (chuva, água, acesso).
--
-- 2. O ADMIN FECHAVA O DIA DE TODA A EQUIPE.
--    Quando quem chama é o dono, a rota manda p_executora = null, e o
--    `(p_executora is null or executora_id = p_executora)` faz a função pegar
--    o dia INTEIRO — inclusive o da ajudante que ainda está no cemitério
--    trabalhando. Ela perdia a lista no meio da tarde.
--    Agora existe p_todos: sem ele, null significa "só o que não tem executora
--    atribuída", e não "todo mundo".
--
-- 3. NÃO ERA IDEMPOTENTE.
--    Chamar duas vezes somava +20 de prioridade e "adiado 2x". Agora o segundo
--    fechamento do mesmo dia não encontra mais nada em aberto e devolve zero.
--
-- ⚠ O QUE SE PERDE: NADA de dado. Isto substitui uma FUNÇÃO (create or
--   replace), não altera nem apaga linha nenhuma.
--   COMO CONFERIR ANTES: guarde o texto da função atual com
--     select prosrc from pg_proc where proname = 'sureya_fechar_dia';
--   Se quiser voltar, é só reaplicar o corpo de 0012.
-- ============================================================================

-- A assinatura ganha um parâmetro no fim, com default — chamadas antigas
-- continuam funcionando (e passam a ser "só quem não tem executora").
create or replace function sureya_fechar_dia(
  p_executora uuid,
  p_data date,
  p_clima text,
  p_observacoes text,
  p_todos boolean default false
)
returns table (devolvidos int, feitos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_feitos int;
  v_devolvidos int;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select count(*) into v_feitos
  from servicos
  where org_id = v_org and data_prevista = p_data and status = 'executado'
    and (
      p_todos
      or (p_executora is not null and executora_id = p_executora)
      or (p_executora is null and executora_id is null)
    );

  with devolvidos as (
    update servicos set
      status        = 'pendente',
      data_prevista = null,
      ordem_dia     = null,
      prioridade    = prioridade + 10,
      adiado_vezes  = adiado_vezes + 1,
      -- O MOTIVO DELA MANDA. A observação do dia só entra quando não há motivo
      -- específico — antes era o contrário, e o "Começou a chover" sumia.
      motivo_adiamento = coalesce(
        nullif(btrim(motivo_nao_feito), ''),
        nullif(btrim(motivo_adiamento), ''),
        nullif(btrim(p_observacoes), ''),
        'não concluído no dia'
      )
    where org_id = v_org
      and data_prevista = p_data
      and status in ('agendado','pendente')
      and (
        p_todos
        or (p_executora is not null and executora_id = p_executora)
        or (p_executora is null and executora_id is null)
      )
    returning 1
  )
  select count(*) into v_devolvidos from devolvidos;

  insert into dias_campo (org_id, executora_id, data, feitos, clima, observacoes, encerrado_em)
  values (v_org, p_executora, p_data, v_feitos, p_clima, p_observacoes, now())
  on conflict (org_id, executora_id, data) do update
    set feitos = excluded.feitos,
        clima = coalesce(excluded.clima, dias_campo.clima),
        observacoes = coalesce(excluded.observacoes, dias_campo.observacoes),
        encerrado_em = now();

  return query select v_devolvidos, v_feitos;
end;
$$;

revoke all on function sureya_fechar_dia(uuid, date, text, text, boolean) from public;
grant execute on function sureya_fechar_dia(uuid, date, text, text, boolean) to authenticated;

-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================

-- 1) Motivos de adiamento dos últimos 30 dias. Depois desta migration, a coluna
--    passa a mostrar o motivo REAL ("Começou a chover") em vez de "não
--    concluído no dia" para tudo. Se aqui só houver texto genérico, é herança
--    do comportamento antigo — não some, mas para de crescer.
select coalesce(nullif(btrim(motivo_adiamento), ''), '(sem motivo)') as motivo,
       count(*) as vezes,
       max(updated_at) as mais_recente
  from servicos
 where adiado_vezes > 0
 group by 1
 order by vezes desc;

-- 2) Serviços com executora atribuída e em aberto hoje: são exatamente os que
--    o admin NÃO deve fechar sem querer. Antes, um "Encerrar dia" pelo painel
--    devolvia todos estes ao backlog.
select s.id, s.data_prevista, s.status, m.nome as executora,
       t.identificacao as jazigo
  from servicos s
  left join membros m on m.user_id = s.executora_id
  left join tumulos t on t.id = s.tumulo_id
 where s.data_prevista = current_date
   and s.status in ('agendado','pendente')
   and s.executora_id is not null;
