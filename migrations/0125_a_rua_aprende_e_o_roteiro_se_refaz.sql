-- 0125 — A RUA APRENDE A ORDEM, E O ROTEIRO PODE SER REFEITO
--
-- O PEDIDO
--   "vamos fazer a ordem dela eh o melhor para guardar os próximos" e
--   "meu problema eh realmente os recalculo dos eventos como exclusão e
--    puxadas, além de novos contratos... Todo os túmulos listados terão
--    contratos até o fim da semana e se não recalcular e alocar vai ficar
--    difícil"
--
-- O QUE FOI MEDIDO EM 24/08/2026
--
--   tumulos ................. 266   (79 contratados)
--   sem quadra .................. 0
--   sem rua ..................... 0
--   SEM `ordem_na_rua` ........ 201   <- 75%
--
--   roteiro de 24/08: 40 paradas, 10 ruas, 12 trocas de rua (o minimo e 9)
--                     37 das 40 sem ordem dentro da rua
--
-- A ordenacao POR RUA ja funciona — 12 trocas para 10 ruas e quase o otimo.
-- O que nao funciona e DENTRO da rua: sem `ordem_na_rua`, a Nina percorre cada
-- rua no azar, e a serpentina (que inverte ruas alternadas) inverte uma lista
-- que nao tinha ordem nenhuma.
--
-- ============================================================================
-- 1. A RUA APRENDE COM A CAMINHADA
-- ============================================================================
--
-- Digitar 201 ordens a mao e trabalho que ninguem faz — e, se fizesse, seria a
-- ordem do mapa, nao a do chao. Aqui a ordem entra sozinha: a primeira vez que
-- uma lapide e lavada, ela recebe a proxima posicao livre da rua dela.
--
-- Depois de uma volta completa, a rua sabe a sequencia em que foi andada. E
-- essa e a sequencia certa por construcao: e a que a pessoa escolheu quando
-- estava la, com o portao, o barranco e a torneira na frente dela.
--
-- SO PREENCHE O VAZIO. Ordem ja gravada — digitada por ela ou aprendida antes —
-- nunca e sobrescrita: senao a correcao feita a mao seria desfeita na proxima
-- lavagem, que e a pior forma de um sistema discordar de quem manda nele.
--
-- GATILHO, E NAO DENTRO DE `sureya_concluir_lavagem`: sao tres rotas que
-- concluem lavagem (campo, admin e "registrar feito"), e todas passam por
-- `servicos`. Uma quarta que apareca amanha aprende junto, de graca.

create or replace function sureya_aprender_ordem_na_rua() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rua uuid;
  v_tem int;
begin
  if new.tumulo_id is null then return new; end if;

  select t.rua_id, t.ordem_na_rua into v_rua, v_tem
    from tumulos t where t.id = new.tumulo_id;

  -- Sem rua nao ha sequencia para aprender; com ordem, nao ha o que ensinar.
  if v_rua is null or v_tem is not null then return new; end if;

  update tumulos
     set ordem_na_rua = coalesce(
           (select max(o.ordem_na_rua) from tumulos o where o.rua_id = v_rua), 0
         ) + 1
   where id = new.tumulo_id
     -- Relido dentro do UPDATE: entre o SELECT e aqui, outra lavagem da mesma
     -- rua pode ter chegado primeiro. Sem isto, duas lapides concluidas no
     -- mesmo segundo levariam o mesmo numero.
     and ordem_na_rua is null;

  return new;
end;
$$;

drop trigger if exists tg_aprender_ordem_na_rua on servicos;
create trigger tg_aprender_ordem_na_rua
  after update of status on servicos
  for each row
  when (new.status = 'executado' and old.status is distinct from 'executado')
  execute function sureya_aprender_ordem_na_rua();

-- ============================================================================
-- 2. SOLTAR O ROTEIRO DOS PROXIMOS DIAS
-- ============================================================================
--
-- O alocador so enxerga o que esta `pendente` e solto. No instante em que ele
-- aloca, a lavagem vira `agendado` e some do radar para sempre — por isso
-- contrato novo e encaixado nas frestas e o roteiro que ja existia nunca e
-- repensado. Com todos os tumulos virando contrato esta semana, "encaixar nas
-- frestas" deixa de servir.
--
-- Esta funcao devolve para a fila o que PODE ser redistribuido, e so isso:
--
--   · de amanha em diante   — "o roteiro deve ser os proximos". Hoje nao se
--                             mexe: a Nina ja abriu a lista no celular.
--   · nao fixado            — decisao de pessoa manda (0041)
--   · nao iniciada          — quem ja comecou, terminou onde comecou
--   · sem foto              — foto e prova de que houve trabalho ali
--
-- Quem escolhe o dia novo continua sendo o alocador: ele e que conhece
-- capacidade, jornada, rua e a regra de uma lavagem por jazigo por dia.

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
     and foto_antes_url is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function sureya_soltar_roteiro(date, uuid) from public, anon;
grant execute on function sureya_soltar_roteiro(date, uuid) to authenticated, service_role;

-- ============================================================================
-- 3. DESDE QUANDO O ROTEIRO NAO E REFEITO
-- ============================================================================
--
-- O aviso na tela precisa de um marco. Sem ele, "o roteiro esta velho" seria
-- palpite — e a alternativa (recalcular sozinho a cada contrato salvo) e pior:
-- ela esta cadastrando duzentos contratos hoje, e nao quer a agenda inteira
-- se remexendo a cada Salvar.
alter table orgs add column if not exists roteiro_refeito_em timestamptz;

comment on column orgs.roteiro_refeito_em is
  'Quando o roteiro dos proximos dias foi refeito por inteiro pela ultima vez. '
  'A agenda compara com a criacao das lavagens futuras para dizer quantas '
  'entraram depois — e so ai oferecer o botao.';
