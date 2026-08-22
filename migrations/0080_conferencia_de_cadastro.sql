-- ============================================================================
-- SUREYA — 0080 · A DUPLA CONFERÊNCIA VIRA UMA LISTA QUE O BANCO RESPONDE
--
-- Build 7, etapa 1: "cadastro assistido e dupla conferência de uma amostra".
--
-- POR QUE ISTO É CÓDIGO E NÃO UMA FOLHA DE PAPEL
-- ---------------------------------------------------------------------------
-- Metade da conferência é comparar o sistema com o caderno — e essa metade é
-- humana, não tem como automatizar. Mas a outra metade é o sistema conferindo a
-- si mesmo: falta telefone? falta quadra? o plano está ativo sem data de
-- cobrança? tem dois responsáveis financeiros?
--
-- Essas perguntas o banco responde melhor que duas pessoas lendo tela, e sem
-- cansar na décima família. Deixar isso para o olho humano é gastar a atenção
-- dele no que a máquina faz melhor — e ele vai precisar dessa atenção inteira
-- para o saldo de abertura, que é a parte que só o caderno sabe.
--
-- O QUE ELA NÃO FAZ
-- ---------------------------------------------------------------------------
-- Não diz se o número está CERTO. Diz se está COMPLETO e COERENTE. Um saldo de
-- abertura de R$ 240,00 digitado onde deveria ser R$ 420,00 passa por aqui sem
-- reclamar — nenhuma consulta consegue saber disso. Por isso o roteiro manda
-- duas pessoas conferirem o saldo contra o caderno, separadamente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) A conferência de uma família
--
-- Devolve uma linha por item, com o veredito e o que fazer. Item que passa
-- também aparece: quem confere precisa ver que a pergunta foi feita, não só o
-- que sobrou.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_conferencia_cadastro(p_familia uuid)
returns table(item text, situacao text, detalhe text, onde text)
language sql
security definer
set search_path to 'public'
as $function$
  with f as (
    select * from familias where id = p_familia and org_id = current_org_id()
  ),
  pessoas as (select * from clientes c where c.familia_id = p_familia),
  resp as (select count(*) n from pessoas where responsavel_financeiro),
  jaz  as (select * from tumulos t where t.familia_id = p_familia),
  pl   as (select p.* from planos p join pessoas c on c.id = p.cliente_id where p.ativo),
  ab   as (select count(*) n, coalesce(sum(case when tipo::text='credito' then valor else -valor end),0) v
             from conta_corrente
            where familia_id = p_familia and origem = 'abertura'::sureya_origem_lancamento)

  select 'responsavel financeiro'::text,
         case when (select n from resp) = 1 then 'ok' else 'CORRIGIR' end,
         case when (select n from resp) = 0 then 'nenhuma pessoa marcada como responsavel'
              when (select n from resp) > 1 then (select n from resp) || ' pessoas marcadas — tem de ser uma'
              else 'exatamente um' end,
         '/painel/clientes?familiaId=' || p_familia

  union all
  select 'telefone de quem responde',
         case when exists (select 1 from pessoas
                            where responsavel_financeiro
                              and telefone is not null
                              and telefone not like 'sem-tel%'
                              and telefone not like 'anon:%'
                              and length(regexp_replace(telefone,'\D','','g')) >= 10)
              then 'ok' else 'CORRIGIR' end,
         coalesce((select telefone from pessoas where responsavel_financeiro limit 1),
                  'sem responsavel'),
         '/painel/clientes?familiaId=' || p_familia

  union all
  select 'jazigo cadastrado',
         case when (select count(*) from jaz) > 0 then 'ok' else 'CORRIGIR' end,
         (select count(*) from jaz) || ' jazigo(s)',
         '/painel/jazigos'

  union all
  -- Jazigo sem quadra cai no balde "S/Q", e foi assim que o mesmo jazigo virou
  -- dois registros (LEIA-ME leva 2). Na conferencia isso e falha, nao aviso.
  select 'jazigo com quadra e identificacao',
         case when not exists (select 1 from jaz where quadra_id is null
                                  or coalesce(identificacao,'') = '')
              then 'ok' else 'CORRIGIR' end,
         coalesce((select string_agg(coalesce(nullif(identificacao,''),'(sem identificacao)'), ', ')
                     from jaz where quadra_id is null or coalesce(identificacao,'') = ''),
                  'todos completos'),
         '/painel/jazigos'

  union all
  select 'contrato',
         case when (select contratado from f) then 'ok' else 'atencao' end,
         case when (select contratado from f) then 'familia contratada'
              else 'sem contrato — as limpezas serao cobradas como avulso' end,
         '/painel/clientes?familiaId=' || p_familia

  union all
  -- Plano ativo sem data de cobranca ou sem proximo servico e o que faz a
  -- agenda nao gerar e a cobranca nao sair — em silencio, dos dois lados.
  select 'plano com as datas preenchidas',
         case when not (select contratado from f) then 'nao se aplica'
              when exists (select 1 from pl where proxima_cobranca is null or proximo_servico is null)
                then 'CORRIGIR'
              when not exists (select 1 from pl) then 'CORRIGIR'
              else 'ok' end,
         case when not exists (select 1 from pl) then 'nenhum plano ativo'
              else coalesce((select string_agg(
                     case when proxima_cobranca is null then 'sem proxima cobranca'
                          else 'sem proximo servico' end, '; ')
                     from pl where proxima_cobranca is null or proximo_servico is null),
                   'datas completas') end,
         '/painel/planos'

  union all
  select 'valor da limpeza',
         case when not (select contratado from f) then 'nao se aplica'
              when exists (select 1 from jaz where coalesce(valor_lavagem,0) <= 0) then 'CORRIGIR'
              else 'ok' end,
         coalesce((select string_agg(identificacao || ': sem valor', ', ')
                     from jaz where coalesce(valor_lavagem,0) <= 0),
                  (select 'R$ ' || string_agg(to_char(valor_lavagem,'FM999990.00'), ' / ') from jaz)),
         '/painel/jazigos'

  union all
  -- O NUMERO QUE SO O CADERNO SABE.
  -- Aqui a conferencia so mostra o que foi digitado. Se esta certo, ninguem
  -- alem de quem tem o caderno na mao consegue dizer.
  select 'saldo de abertura',
         case when (select n from ab) > 1 then 'CORRIGIR'
              when (select n from ab) = 0 then 'CONFERIR NO CADERNO'
              else 'CONFERIR NO CADERNO' end,
         case when (select n from ab) > 1 then (select n from ab) || ' aberturas — tem de ser uma so'
              when (select n from ab) = 0 then 'nada lancado: a familia comeca zerada?'
              else 'lancado: R$ ' || to_char(abs((select v from ab)),'FM999990.00')
                   || case when (select v from ab) < 0 then ' em aberto' else ' a favor' end
                   || ' — bate com o caderno?' end,
         '/painel/clientes?familiaId=' || p_familia

  union all
  select 'consentimento registrado',
         case when exists (select 1 from pessoas where responsavel_financeiro
                             and consentimento_em is not null)
              then 'ok' else 'atencao' end,
         coalesce((select to_char(consentimento_em,'DD/MM/YYYY') from pessoas
                    where responsavel_financeiro and consentimento_em is not null limit 1),
                  'nao registrado'),
         '/painel/clientes?familiaId=' || p_familia;
$function$;

comment on function public.sureya_conferencia_cadastro is
  'Build 7 etapa 1: o que o BANCO consegue conferir sozinho no cadastro de uma '
  'familia. Nao diz se o numero esta certo — diz se esta completo e coerente. O '
  'saldo de abertura sempre volta como CONFERIR NO CADERNO, porque so o caderno '
  'sabe.';


-- ----------------------------------------------------------------------------
-- 2) Por onde começar a amostra
--
-- O roteiro pede 5 famílias, "as mais simples". Simples aqui é medível: um
-- jazigo, contrato, telefone que atende, e o cadastro sem pendência.
--
-- Começar pelas simples não é covardia — é separar erro de cadastro de erro do
-- sistema. Se a família mais simples já dá problema, o problema é o sistema.
-- ----------------------------------------------------------------------------
create or replace view sureya_candidatas_ao_piloto as
select f.id                                   as familia_id,
       f.nome                                 as familia,
       (select count(*) from tumulos t where t.familia_id = f.id)   as jazigos,
       (select count(*) from clientes c where c.familia_id = f.id)  as pessoas,
       f.contratado,
       (select count(*) from sureya_conferencia_cadastro(f.id)
         where situacao = 'CORRIGIR')                               as pendencias,
       (select string_agg(item, '; ') from sureya_conferencia_cadastro(f.id)
         where situacao = 'CORRIGIR')                               as o_que_falta
  from familias f
 where f.org_id = current_org_id()
 order by (select count(*) from sureya_conferencia_cadastro(f.id)
            where situacao = 'CORRIGIR') asc,
          (select count(*) from tumulos t where t.familia_id = f.id) asc,
          (select count(*) from clientes c where c.familia_id = f.id) asc,
          f.nome;

comment on view sureya_candidatas_ao_piloto is
  'As familias ordenadas da mais simples para a mais complicada, para escolher a '
  'amostra do piloto. Comecar pelas simples separa erro de cadastro de erro do '
  'sistema: se a mais simples ja da problema, o problema e o sistema.';

revoke execute on function public.sureya_conferencia_cadastro(uuid) from public, anon;

commit;
