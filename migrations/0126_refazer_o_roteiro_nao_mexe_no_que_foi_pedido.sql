-- ============================================================================
-- 0126 — REFAZER O ROTEIRO NAO MEXE NO QUE A FAMILIA PEDIU
-- ============================================================================
--
-- DEFEITO DA 0125, DE ONTEM.
--
-- `sureya_soltar_roteiro` solta para a fila tudo que esta agendado, no futuro,
-- nao fixado, nao iniciado e sem foto — e nessa peneira cabia tambem a lavagem
-- AVULSA, aquela que a familia pediu para um dia certo.
--
-- O alocador respeita `data_desejada` ao recolocar, entao o estrago era
-- pequeno. Mas nao era zero: `alocarAgenda` tem um piso de data, e uma data
-- pedida para hoje (ou ja vencida) e empurrada para o primeiro dia util
-- seguinte. Ou seja: a familia combinou um dia, e o sistema mudou sozinho.
--
-- Data pedida e COMBINADO, nao sugestao. Quem move um combinado e gente, pelo
-- remarcar, com a data na mao. Refazer o roteiro reorganiza o que o CONTRATO
-- deve — nunca o que foi prometido.
--
-- Custa nada agora: ha 0 avulsos em aberto em producao. E justamente por isso
-- e a hora de consertar, antes de existir o primeiro.
--
-- IDEMPOTENTE E CONVERGENTE: `create or replace` com a MESMA assinatura
-- (date, uuid). Sem `drop function`, sem sobrecarga nova — a licao da 0109 vale
-- ao contrario aqui: assinatura igual, entao replace basta.
-- ============================================================================

create or replace function sureya_soltar_roteiro(
  p_de  date default null,
  p_org uuid default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_org, current_org_id());
  v_de  date := coalesce(p_de, current_date + 1);
  v_n   int;
begin
  if v_org is null then
    raise exception 'sureya_soltar_roteiro: sem org';
  end if;
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  -- NUNCA PARA TRAS DE HOJE. Soltar o passado nao redistribui nada: so apaga a
  -- ordem de um dia que ja aconteceu.
  if v_de <= current_date then
    v_de := current_date + 1;
  end if;

  update servicos
     set status = 'pendente',
         ordem_dia = null
   where org_id = v_org
     and status = 'agendado'
     and data_prevista >= v_de
     and fixado_em is null
     and iniciado_em is null
     and foto_antes_url is null
     -- O QUE A FAMILIA PEDIU NAO ENTRA NO SORTEIO. Ver o cabecalho.
     and data_desejada is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function sureya_soltar_roteiro(date, uuid) from public, anon;
grant execute on function sureya_soltar_roteiro(date, uuid) to authenticated, service_role;

comment on function sureya_soltar_roteiro(date, uuid) is
  'Devolve para a fila as lavagens de CONTRATO futuras que podem ser '
  'redistribuidas: nao fixadas, nao iniciadas, sem foto e SEM data pedida pela '
  'familia. Data pedida e combinado — so o remarcar mexe nela.';
