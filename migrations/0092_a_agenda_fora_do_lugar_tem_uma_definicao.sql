-- =====================================================================
-- 0092 — A AGENDA FORA DO LUGAR TEM UMA DEFINICAO SO
--
-- O QUE ESTAVA QUEBRADO (medido em producao em 23/08/2026)
-- ---------------------------------------------------------------------
-- O aviso "N lavagem(ns) marcada(s) em dia que nao se trabalha" nunca
-- zerava, e o botao "Reorganizar a agenda" nao mudava nada. Nao era
-- impressao: contador e movedor usavam definicoes DIFERENTES.
--
--   · o contador (/api/agenda/reorganizar GET) marcava como fora do
--     lugar tudo que caisse em dia nao trabalhado OU que ja tivesse
--     passado (data_prevista < hoje);
--   · sureya_reorganizar_agenda so mexia em
--     data_prevista <> sureya_proximo_dia_util(data_prevista).
--
-- As duas lavagens de 17/08/2026 estavam numa SEGUNDA-FEIRA, que e dia
-- de trabalho. Logo proximo_dia_util(17/08) = 17/08, a funcao nao via
-- nada para mover, e o contador seguia contando 2 para sempre.
--
-- E havia um terceiro estado que ninguem contava nem movia: QUATRO
-- lavagens do jazigo Perrela na mesma data (24/08), com data_plano
-- 01/08, 09/08, 17/08 e 25/08. Tres estavam atrasadas, o alocador
-- empurrou todas para o primeiro dia util, e o campo recebia o mesmo
-- jazigo quatro vezes seguidas.
--
-- E, por fim, o motivo de "reorganizar" nao poder funcionar nem depois
-- de mover: alocarAgenda() so enxerga status = 'pendente'. Tudo em
-- producao estava 'agendado'. Mover zero linhas para 'pendente' deixava
-- o alocador sem nada para alocar.
--
-- O QUE ESTA MIGRACAO FAZ
-- ---------------------------------------------------------------------
-- 1. Cria sureya_agenda_fora_do_lugar(): UMA definicao, com a
--    discriminacao (dia nao util, atrasada, repetida no jazigo). O
--    contador da tela passa a ler daqui, e nao de uma regra propria em
--    TypeScript — foi a divergencia entre as duas que criou o aviso
--    eterno.
-- 2. Reescreve sureya_reorganizar_agenda com EXATAMENTE o mesmo
--    predicado, devolvendo o que move para 'pendente' (para o alocador
--    poder redistribuir) e reancorando a data em data_plano.
--
-- POR QUE data_plano E NAO data_prevista
-- ---------------------------------------------------------------------
-- data_prevista e reescrita pelo alocador a cada passada. Reancorar por
-- ela seria ler a data que ele mesmo escreveu — as quatro do Perrela
-- voltariam todas para 24/08. data_plano e a data teorica, congelada no
-- nascimento do servico: 01/08, 09/08, 17/08, 25/08. Com ela, o
-- alocador tem como espalhar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- O QUE ESTA FORA DO LUGAR
--
-- "repetida" nao conta as duas linhas do par: conta as EXCEDENTES. Se o
-- Perrela tem quatro no mesmo dia, uma pode ficar e tres precisam sair —
-- dizer "4 repetidas" faria a tela pedir para mover uma lavagem que esta
-- no lugar certo. Fica a de data_plano mais antiga: e a mais atrasada, a
-- que menos pode esperar.
--
-- 'executado' e 'cancelado' ficam de fora: lavagem que ja aconteceu nao
-- se remarca, e a data dela e registro, nao plano.
-- ---------------------------------------------------------------------
create or replace function public.sureya_agenda_fora_do_lugar(
  p_dias_a_frente int default 120
)
returns table(
  total int, dia_nao_util int, atrasadas int, repetidas int, primeira_data date
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with base as (
    select
      s.id,
      s.data_prevista,
      s.data_prevista <> sureya_proximo_dia_util(s.data_prevista) as dia_ruim,
      s.data_prevista < current_date                              as atrasada,
      row_number() over (
        partition by s.tumulo_id, s.data_prevista
        order by coalesce(s.data_plano, s.data_prevista), s.id
      ) > 1 as excedente
    from servicos s
    where s.org_id = current_org_id()
      and s.status in ('pendente', 'agendado')
      and s.data_prevista is not null
      and s.data_prevista between current_date - 30
                              and current_date + p_dias_a_frente
  )
  select
    count(*) filter (where dia_ruim or atrasada or excedente)::int,
    count(*) filter (where dia_ruim)::int,
    count(*) filter (where atrasada)::int,
    count(*) filter (where excedente)::int,
    min(data_prevista) filter (where dia_ruim or atrasada or excedente)
  from base;
$$;

comment on function public.sureya_agenda_fora_do_lugar(int) is
  'O que esta fora do lugar na agenda, com a discriminacao. E a MESMA regra que sureya_reorganizar_agenda usa para mover — contador e movedor divergiam, e o aviso da tela nunca zerava.';

revoke execute on function public.sureya_agenda_fora_do_lugar(int) from public, anon;
grant  execute on function public.sureya_agenda_fora_do_lugar(int) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- MOVER O QUE ESTA FORA DO LUGAR
--
-- O retorno ganha colunas, entao a funcao cai e nasce de novo:
-- create or replace nao muda a assinatura de saida de uma RETURNS TABLE.
--
-- O que ela NAO faz: escolher o dia. Ela devolve a lavagem para
-- 'pendente' com a data teorica dela, e quem distribui e alocarAgenda(),
-- que conhece capacidade, jornada, rua e a regra de uma lavagem por
-- jazigo por dia. Duas cabecas decidindo o mesmo dia foi o que produziu
-- o Perrela quadruplicado.
-- ---------------------------------------------------------------------
drop function if exists public.sureya_reorganizar_agenda(int);

create function public.sureya_reorganizar_agenda(
  p_dias_a_frente int default 90
)
returns table(
  movidos int, para_hoje int, dias_liberados int,
  por_dia_ruim int, por_atraso int, por_repeticao int
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org  uuid;
  r      record;
  v_nova date;
  v_mov  int := 0;
  v_hoje int := 0;
  v_dias int := 0;
  v_ruim int := 0;
  v_atr  int := 0;
  v_rep  int := 0;
  v_datas date[] := '{}';
  v_guarda int;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  for r in
    with base as (
      select
        s.id,
        s.tumulo_id,
        s.data_prevista,
        coalesce(s.data_plano, s.data_prevista) as ancora,
        s.data_prevista <> sureya_proximo_dia_util(s.data_prevista) as dia_ruim,
        s.data_prevista < current_date                              as atrasada,
        row_number() over (
          partition by s.tumulo_id, s.data_prevista
          order by coalesce(s.data_plano, s.data_prevista), s.id
        ) > 1 as excedente
      from servicos s
      where s.org_id = v_org
        and s.status in ('pendente', 'agendado')
        and s.data_prevista is not null
        and s.data_prevista between current_date - 30
                                and current_date + p_dias_a_frente
    )
    select * from base
    where dia_ruim or atrasada or excedente
    order by ancora, data_prevista
  loop
    -- A ancora e a data teorica do plano, nunca o passado: uma lavagem
    -- atrasada e devida HOJE. Puxa-la para tras nao recupera o tempo,
    -- so a esconde num dia que ja passou.
    v_nova := sureya_proximo_dia_util(greatest(r.ancora, current_date));

    -- ------------------------------------------------------------------
    -- E NAO EMPILHAR DE NOVO.
    --
    -- Sem este laco a funcao NAO CONVERGE, e isso apareceu no teste antes
    -- de aparecer em producao: as tres lavagens excedentes do Perrela tem
    -- data de plano toda no passado, entao `greatest(ancora, hoje)` da o
    -- MESMO dia para as tres. Elas voltavam para a fila empilhadas do
    -- jeito que estavam, o contador seguia acusando 3, e cada clique em
    -- "Reorganizar" dizia "3 movidas" para sempre.
    --
    -- Aqui a funcao so garante o piso: uma lavagem por jazigo por dia.
    -- Escolher BEM o dia (capacidade, rua, serpentina) continua sendo do
    -- alocador, que roda logo depois — este laco nao decide rota, so
    -- impede que a pilha se remonte.
    -- ------------------------------------------------------------------
    v_guarda := 0;
    while v_guarda < 400 and exists (
      select 1 from servicos o
       where o.org_id = v_org
         and o.tumulo_id = r.tumulo_id
         and o.id <> r.id
         and o.status in ('pendente', 'agendado')
         and o.data_prevista = v_nova
    ) loop
      v_nova := sureya_proximo_dia_util(v_nova + 1);
      v_guarda := v_guarda + 1;
    end loop;

    update servicos
       set data_prevista = v_nova,
           ordem_dia     = null,
           -- Volta para 'pendente' de proposito: e o unico estado que o
           -- alocador enxerga. Sem isto a funcao movia a data e o
           -- alocador continuava sem nada para redistribuir.
           status        = 'pendente'
     where id = r.id
       and org_id = v_org;

    v_mov := v_mov + 1;
    if not (r.data_prevista = any(v_datas)) then
      v_datas := v_datas || r.data_prevista;
    end if;
    if v_nova = current_date then v_hoje := v_hoje + 1; end if;
    if r.dia_ruim  then v_ruim := v_ruim + 1; end if;
    if r.atrasada  then v_atr  := v_atr  + 1; end if;
    if r.excedente then v_rep  := v_rep  + 1; end if;
  end loop;

  -- "dias liberados" e quantos dias TINHAM alguma coisa fora do lugar.
  -- Conta-se sobre v_datas, recolhido dentro do laco: depois do update
  -- as datas antigas nao existem mais para serem contadas, e contar as
  -- novas responderia outra pergunta.
  v_dias := coalesce(array_length(v_datas, 1), 0);

  return query select v_mov, v_hoje, v_dias, v_ruim, v_atr, v_rep;
end
$function$;

comment on function public.sureya_reorganizar_agenda(int) is
  'Devolve para pendente, reancorada em data_plano, toda lavagem em dia nao trabalhado, atrasada ou repetida no mesmo jazigo no mesmo dia. Quem escolhe o dia novo e alocarAgenda().';

revoke execute on function public.sureya_reorganizar_agenda(int) from public, anon;
grant  execute on function public.sureya_reorganizar_agenda(int) to authenticated, service_role;
