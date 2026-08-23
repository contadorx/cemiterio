-- =====================================================================
-- 0099 — O "ABRIR" DA CONFERENCIA APONTA PARA A FICHA DE VERDADE
--
-- A 0097 mandava para `/painel/conferencia/<familia>`, uma tela que eu
-- tinha feito reproduzindo a ficha: pessoas, regime, jazigos, e mais
-- nada. Era decisao errada, e o motivo e bom — REPRODUZIR A FICHA E
-- CRIAR UMA SEGUNDA VERDADE sobre a mesma familia. A copia nao tinha
-- contrato, nem limpezas, nem o fechamento do mes; e cada coisa que
-- faltasse mandava a pessoa para a ficha original no meio da correcao.
--
-- A ficha de verdade e `/painel/clientes/<id>`, e ela passou a aceitar o
-- id da FAMILIA — antes so abria pela PESSOA, que era a confusao de
-- origem: a tela mostrava o dinheiro da familia e os jazigos do contato.
--
-- `?de=conferencia` e o caminho de volta: quem chegou pela conferencia
-- volta para ela, e quem chegou pela lista volta para a lista.
-- =====================================================================

create or replace function public.sureya_conferencia_cadastro(p_familia uuid)
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
         '/painel/clientes/' || p_familia || '?de=conferencia',
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
         '/painel/clientes/' || p_familia || '?de=conferencia',
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
         '/painel/clientes/' || p_familia || '?de=conferencia',
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
         '/painel/clientes/' || p_familia || '?de=conferencia',
         false,
         'Confira contra o caderno, com duas pessoas, separadamente.'
  union all
  select 'consentimento registrado',
         case when exists (select 1 from resp where consentimento_em is not null)
              then 'ok' else 'atencao' end,
         coalesce((select to_char(consentimento_em,'DD/MM/YYYY') from resp
                    where consentimento_em is not null),
                  'nao registrado'),
         '/painel/clientes/' || p_familia || '?de=conferencia',
         false,
         'Registre quando a familia autorizou receber mensagens.';
$function$;

comment on function public.sureya_conferencia_cadastro(uuid) is
  'O checklist de uma familia. `onde` aponta para a ficha de verdade (/painel/clientes/<familia>), e nao para uma copia dela.';

revoke execute on function public.sureya_conferencia_cadastro(uuid) from public, anon;
grant  execute on function public.sureya_conferencia_cadastro(uuid) to authenticated, service_role;
