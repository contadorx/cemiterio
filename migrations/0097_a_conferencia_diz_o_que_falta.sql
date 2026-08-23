-- =====================================================================
-- 0097 — A CONFERENCIA DIZ O QUE FALTA, E O QUE E OPCIONAL
--
-- O QUE ESTAVA ERRADO NA FICHA
-- ---------------------------------------------------------------------
-- A conferencia tinha tres situacoes — 'ok', 'CORRIGIR', 'atencao' — mas
-- quem lia nao conseguia separar o que TRAVA o piloto do que so avisa.
-- Dois casos concretos, da ficha da familia ALCANTARA:
--
--   contrato .............. "sem contrato — as limpezas serao cobradas
--                            como avulso"   -> atencao
--   plano com as datas .... "nenhum plano ativo"  -> nao se aplica
--
-- "Sem contrato" nao e a mesma coisa que "avulso": a primeira e uma
-- lacuna, a segunda e uma DECISAO. Hoje as duas moram no mesmo lugar —
-- `contratado = false` — e por isso a familia que ninguem decidiu ainda
-- aparece verde, como se estivesse resolvida.
--
-- AS DECISOES
-- ---------------------------------------------------------------------
-- 1. REGIME e explicito, com tres estados. `nao_definido` e o padrao, e
--    e PENDENCIA: alguem precisa dizer se aquela familia tem contrato ou
--    e avulso. Sem isso a lavagem acontece e ninguem sabe como cobrar.
--
-- 2. Cada item declara se e OBRIGATORIO. O que e obrigatorio e falta vira
--    'pendente'; o que e opcional e falta vira 'atencao'. A tela deixa de
--    adivinhar pela cor.
--
-- 3. O OK DA FAMILIA vira um fato com data e autor. "Os blocos devem vir
--    preenchidos para dar um ok" — e o ok tem de ficar registrado, senao
--    na segunda passada ninguem lembra quais ja foram conferidas.
--    Conferir de novo depois de mexer no cadastro e o certo: por isso o
--    ok guarda TAMBEM quantas pendencias havia na hora, e a tela avisa
--    quando o numero mudou desde entao.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sureya_regime_familia') then
    create type public.sureya_regime_familia as enum
      ('nao_definido', 'contrato', 'avulso');
  end if;
end $$;

alter table public.familias
  add column if not exists regime sureya_regime_familia not null default 'nao_definido',
  -- O OK da conferencia: um fato com data e autor.
  add column if not exists conferida_em timestamptz,
  add column if not exists conferida_por uuid,
  -- Quantas pendencias havia quando alguem deu o ok. Se hoje ha mais, o
  -- ok envelheceu e a tela precisa dizer isso.
  add column if not exists conferida_com_pendencias int;

comment on column public.familias.regime is
  'contrato | avulso | nao_definido. "Sem contrato" era ambiguo: nao dava para separar a familia que ninguem decidiu da que e avulsa de proposito.';
comment on column public.familias.conferida_em is
  'Quando alguem deu o ok na conferencia deste cadastro. Guarda tambem quantas pendencias havia na hora (conferida_com_pendencias), para o ok poder envelhecer.';

-- QUEM JA TEM CONTRATO JA ESTA DECIDIDO. O resto fica `nao_definido` de
-- proposito: marcar todo mundo como avulso seria inventar uma decisao que
-- ninguem tomou, e e justamente essa decisao que a conferencia cobra.
update public.familias set regime = 'contrato'
 where contratado and regime = 'nao_definido';

-- ---------------------------------------------------------------------
-- A CONFERENCIA
--
-- Ganha duas colunas: `obrigatorio` (trava o piloto?) e `acao` (o que
-- fazer, em palavras de quem vai fazer). E a situacao passa a ser
-- 'pendente' em vez de 'CORRIGIR' — a tela grita em maiuscula quando
-- precisa, e o dado nao precisa gritar junto.
-- ---------------------------------------------------------------------
drop view if exists public.sureya_candidatas_ao_piloto;
drop function if exists public.sureya_conferencia_cadastro(uuid);

create function public.sureya_conferencia_cadastro(p_familia uuid)
returns table(
  item text, situacao text, detalhe text, onde text,
  obrigatorio boolean, acao text
)
language sql
security definer
set search_path to 'public'
as $function$
  with f as (
    select * from familias where id = p_familia and org_id = current_org_id()
  ),
  pessoas as (select * from clientes c where c.familia_id = p_familia),
  resp as (
    -- O responsavel de verdade e o ponteiro da familia (0091). O booleano
    -- em `clientes` ficou como espelho e ainda e lido em varios lugares,
    -- mas quem manda aqui e `familias.responsavel_id`.
    select c.* from clientes c join f on f.responsavel_id = c.id
  ),
  jaz  as (select * from tumulos t where t.familia_id = p_familia),
  pl   as (select p.* from planos p join pessoas c on c.id = p.cliente_id where p.ativo),
  ab   as (select count(*) n,
                  coalesce(sum(case when tipo::text='credito' then valor else -valor end),0) v
             from conta_corrente
            where familia_id = p_familia
              and origem = 'abertura'::sureya_origem_lancamento)

  -- ------------------------------------------------------ OBRIGATORIOS
  select 'responsavel financeiro'::text,
         case when exists (select 1 from resp) then 'ok' else 'pendente' end,
         coalesce((select nome from resp), 'ninguem definido'),
         '/painel/conferencia/' || p_familia,
         true,
         'Abra a ficha e marque quem responde pelo dinheiro desta familia.'
  union all
  select 'telefone de quem responde',
         case when exists (select 1 from resp
                            where telefone is not null
                              and telefone not like 'sem-tel%'
                              and telefone not like 'anon:%'
                              and length(regexp_replace(telefone,'\D','','g')) >= 10)
              then 'ok' else 'pendente' end,
         coalesce((select telefone from resp), 'sem responsavel definido'),
         '/painel/conferencia/' || p_familia,
         true,
         'Sem telefone valido, nenhuma mensagem chega — nem foto, nem cobranca.'
  union all
  select 'jazigo cadastrado',
         case when (select count(*) from jaz) > 0 then 'ok' else 'pendente' end,
         (select count(*) from jaz) || ' jazigo(s)',
         '/painel/jazigos',
         true,
         'Ligue pelo menos um jazigo a esta familia.'
  union all
  select 'jazigo com quadra e identificacao',
         case when not exists (select 1 from jaz) then 'pendente'
              when not exists (select 1 from jaz where quadra_id is null
                                  or coalesce(identificacao,'') = '')
              then 'ok' else 'pendente' end,
         case when not exists (select 1 from jaz) then 'nenhum jazigo para conferir'
              else coalesce((select string_agg(coalesce(nullif(identificacao,''),'(sem identificacao)'), ', ')
                     from jaz where quadra_id is null or coalesce(identificacao,'') = ''),
                  'todos completos') end,
         '/painel/jazigos',
         true,
         'Sem quadra e identificacao o jazigo nao entra no roteiro do dia.'
  union all
  -- CONTRATO OU AVULSO — as duas valem; nao decidir e que nao vale.
  select 'contrato ou avulso',
         case (select regime from f)
           when 'contrato' then 'ok'
           when 'avulso'   then 'ok'
           else 'pendente' end,
         case (select regime from f)
           when 'contrato' then 'familia com contrato'
           when 'avulso'   then 'avulso — cada limpeza e cobrada na hora'
           else 'ninguem decidiu ainda se e contrato ou avulso' end,
         '/painel/conferencia/' || p_familia,
         true,
         'Escolha uma das duas. Nao e o mesmo fluxo de cobranca, e a lavagem nao espera.'
  union all
  -- VALOR DA LIMPEZA — obrigatorio nos DOIS regimes.
  --
  -- Estava como "nao se aplica" quando nao havia contrato. Mas avulso
  -- cobra POR LAVAGEM: sem valor, a limpeza acontece e o lancamento sai
  -- zerado. E o jeito mais silencioso de trabalhar de graca.
  select 'valor da limpeza',
         case when not exists (select 1 from jaz) then 'pendente'
              when (select regime from f) = 'nao_definido' then 'atencao'
              when exists (select 1 from jaz where coalesce(valor_lavagem,0) <= 0) then 'pendente'
              else 'ok' end,
         coalesce((select string_agg(identificacao || ': sem valor', ', ')
                     from jaz where coalesce(valor_lavagem,0) <= 0),
                  (select 'R$ ' || string_agg(to_char(valor_lavagem,'FM999990.00'), ' / ') from jaz),
                  'nenhum jazigo para conferir'),
         '/painel/jazigos',
         true,
         'Avulso tambem cobra por lavagem: sem valor, o lancamento sai zerado.'

  -- --------------------------------------------------------- AVISOS
  union all
  -- PLANO COM DATAS — so cobra de quem tem CONTRATO. Avulso nao tem plano
  -- e isso e o certo, nao uma falta.
  select 'plano com as datas preenchidas',
         case (select regime from f)
           when 'avulso' then 'ok'
           when 'nao_definido' then 'nao se aplica'
           else case when not exists (select 1 from pl) then 'atencao'
                     when exists (select 1 from pl where proxima_cobranca is null
                                     or proximo_servico is null) then 'atencao'
                     else 'ok' end
         end,
         case (select regime from f)
           when 'avulso' then 'avulso nao usa plano — as limpezas sao pedidas uma a uma'
           when 'nao_definido' then 'defina antes se e contrato ou avulso'
           else case when not exists (select 1 from pl) then 'contrato sem plano ativo'
                     else coalesce((select string_agg(
                            case when proxima_cobranca is null then 'sem proxima cobranca'
                                 else 'sem proximo servico' end, '; ')
                            from pl where proxima_cobranca is null or proximo_servico is null),
                          'datas completas') end
         end,
         '/painel/planos',
         false,
         'Com contrato, o plano sem data nao gera nem cobranca nem agenda.'
  union all
  select 'saldo de abertura',
         case when (select n from ab) > 1 then 'pendente'
              else 'CONFERIR NO CADERNO' end,
         case when (select n from ab) > 1 then (select n from ab) || ' aberturas — tem de ser uma so'
              when (select n from ab) = 0 then 'nada lancado: a familia comeca zerada?'
              else 'lancado: R$ ' || to_char(abs((select v from ab)),'FM999990.00')
                   || case when (select v from ab) < 0 then ' em aberto' else ' a favor' end
                   || ' — bate com o caderno?' end,
         '/painel/conferencia/' || p_familia,
         false,
         'Confira contra o caderno, com duas pessoas, separadamente.'
  union all
  select 'consentimento registrado',
         case when exists (select 1 from resp where consentimento_em is not null)
              then 'ok' else 'atencao' end,
         coalesce((select to_char(consentimento_em,'DD/MM/YYYY') from resp
                    where consentimento_em is not null),
                  'nao registrado'),
         '/painel/conferencia/' || p_familia,
         false,
         'Registre quando a familia autorizou receber mensagens.';
$function$;

comment on function public.sureya_conferencia_cadastro(uuid) is
  'O checklist de uma familia. `obrigatorio` separa o que TRAVA o piloto do que so avisa — antes as duas coisas moravam na mesma cor.';

revoke execute on function public.sureya_conferencia_cadastro(uuid) from public, anon;
grant  execute on function public.sureya_conferencia_cadastro(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- A LISTA — com o nome que a ficha precisa mostrar
--
-- O titulo era "ALCANTARA · 1 jazigo · 1 pessoa · sem contrato". Nome da
-- familia e contagem. Faltava a coisa mais util para quem vai ligar: DE
-- QUEM E o telefone que vai atender. O titulo passa a ser
-- "ALCANTARA — Maria Alcantara", e as contagens descem para a segunda
-- linha, onde contagem deve ficar.
--
-- `pendencias` conta so o que e OBRIGATORIO. Antes contava tudo que nao
-- fosse 'ok', e por isso uma familia com consentimento nao registrado —
-- que e um aviso — aparecia com o mesmo peso de uma sem telefone.
-- ---------------------------------------------------------------------
create or replace view public.sureya_candidatas_ao_piloto
with (security_invoker = true) as
select f.id                                   as familia_id,
       f.nome                                 as familia,
       c.nome                                 as responsavel,
       c.telefone                             as telefone,
       f.regime::text                         as regime,
       f.contratado,
       f.conferida_em,
       f.conferida_com_pendencias,
       (select count(*) from tumulos t where t.familia_id = f.id)   as jazigos,
       (select count(*) from clientes cl where cl.familia_id = f.id) as pessoas,
       (select count(*) from sureya_conferencia_cadastro(f.id)
         where situacao = 'pendente' and obrigatorio)               as pendencias,
       (select count(*) from sureya_conferencia_cadastro(f.id)
         where situacao = 'atencao')                                as avisos,
       (select string_agg(item, '; ') from sureya_conferencia_cadastro(f.id)
         where situacao = 'pendente' and obrigatorio)               as o_que_falta
  from familias f
  left join clientes c on c.id = f.responsavel_id
 where f.org_id = current_org_id()
 order by (select count(*) from sureya_conferencia_cadastro(f.id)
            where situacao = 'pendente' and obrigatorio) asc,
          (select count(*) from tumulos t where t.familia_id = f.id) asc,
          f.nome;

comment on view sureya_candidatas_ao_piloto is
  'As familias da mais simples para a mais complicada. `pendencias` conta so o OBRIGATORIO: antes um consentimento nao registrado pesava igual a um telefone faltando.';

revoke all    on public.sureya_candidatas_ao_piloto from public, anon;
grant  select on public.sureya_candidatas_ao_piloto to authenticated, service_role;

-- ---------------------------------------------------------------------
-- DAR O OK
--
-- Recusa quando ainda ha pendencia obrigatoria: dar ok no que esta
-- incompleto e o mesmo que nao conferir, e pior, porque fica registrado
-- que foi conferido.
-- ---------------------------------------------------------------------
create or replace function public.sureya_conferir_familia(
  p_familia uuid, p_ok boolean default true
)
returns table(ok boolean, pendencias int, mensagem text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid; v_pend int;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  if not exists (select 1 from familias where id = p_familia and org_id = v_org) then
    return query select false, 0, 'familia nao encontrada'::text; return;
  end if;

  -- DESFAZER o ok e sempre permitido: quem conferiu pode ter percebido
  -- que errou, e obrigar a "corrigir" o cadastro so para poder tirar o
  -- carimbo seria absurdo.
  if not p_ok then
    update familias set conferida_em = null, conferida_por = null,
           conferida_com_pendencias = null
     where id = p_familia and org_id = v_org;
    return query select true, 0, 'ok removido'::text; return;
  end if;

  select count(*) into v_pend from sureya_conferencia_cadastro(p_familia)
   where situacao = 'pendente' and obrigatorio;

  if v_pend > 0 then
    return query select false, v_pend,
      ('ainda faltam ' || v_pend || ' item(ns) obrigatorio(s)')::text;
    return;
  end if;

  update familias
     set conferida_em = now(), conferida_por = auth.uid(),
         conferida_com_pendencias = 0
   where id = p_familia and org_id = v_org;

  return query select true, 0, 'conferida'::text;
end $$;

comment on function public.sureya_conferir_familia(uuid, boolean) is
  'Carimba o ok da conferencia. Recusa enquanto houver pendencia obrigatoria: ok em cadastro incompleto e pior que nenhum ok, porque fica registrado como conferido.';

revoke execute on function public.sureya_conferir_familia(uuid, boolean) from public, anon;
grant  execute on function public.sureya_conferir_familia(uuid, boolean) to authenticated, service_role;
