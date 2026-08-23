-- =====================================================================
-- 0101 — A CONFERENCIA COBRA O VALOR CERTO PARA CADA REGIME
--
-- Depois da 0100 ha dois precos, e sao dois negocios diferentes:
--   contrato -> `tumulos.valor_mensal`, rateado pelo ritmo
--   avulso   -> `tumulos.valor_lavagem`, o preco de UMA ida
--
-- Entra tambem o RITMO como item proprio: ele e o divisor do rateio.
-- Sem periodicidade nao ha como dividir o mensal, e a lavagem cai no
-- valor cheio — que e o defeito que a 0100 acabou de consertar.
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
  -- RITMO DA LIMPEZA — obrigatorio no contrato, porque e o DIVISOR do rateio:
  -- sem ele nao da para saber quanto vale UMA lavagem de um combinado mensal.
  select 'ritmo da limpeza',
         case when not exists (select 1 from jaz) then 'pendente'
              when (select regime from f) <> 'contrato' then 'nao se aplica'
              when exists (select 1 from jaz where periodicidade is null) then 'pendente'
              else 'ok' end,
         case when not exists (select 1 from jaz) then 'nenhum jazigo para conferir'
              when (select regime from f) <> 'contrato' then 'avulso nao tem ritmo — a limpeza e pedida'
              else coalesce((select string_agg(identificacao || ': sem ritmo', ', ')
                              from jaz where periodicidade is null),
                            (select string_agg(distinct periodicidade::text, ' / ') from jaz)) end,
         '/painel/clientes/' || p_familia || '?de=conferencia', true,
         'O ritmo e o divisor do rateio: sem ele nao da para saber quanto vale uma lavagem.'
  union all
  -- O VALOR, e o campo depende do REGIME (0100):
  --   contrato -> valor_mensal do tumulo, rateado por lavagem
  --   avulso   -> valor_lavagem, o preco de UMA ida
  --
  -- Olhava so `valor_lavagem`: numa familia com contrato dava PENDENTE com o
  -- valor mensal preenchido, e OK com o avulso preenchido — as duas erradas.
  select 'valor combinado',
         case when not exists (select 1 from jaz) then 'pendente'
              when (select regime from f) = 'nao_definido' then 'atencao'
              when (select regime from f) = 'contrato'
                   and exists (select 1 from jaz where coalesce(valor_mensal,0) <= 0) then 'pendente'
              when (select regime from f) = 'avulso'
                   and exists (select 1 from jaz where coalesce(valor_lavagem,0) <= 0) then 'pendente'
              else 'ok' end,
         case when not exists (select 1 from jaz) then 'nenhum jazigo para conferir'
              when (select regime from f) = 'nao_definido' then 'defina antes se e contrato ou avulso'
              when (select regime from f) = 'contrato' then
                coalesce((select string_agg(identificacao || ': sem valor mensal', ', ')
                            from jaz where coalesce(valor_mensal,0) <= 0),
                         (select string_agg(identificacao || ': R$ ' ||
                                 to_char(valor_mensal,'FM999990.00') || '/mes = R$ ' ||
                                 to_char(coalesce(sureya_valor_da_lavagem(id),0),'FM999990.00') ||
                                 ' por lavagem', ' · ') from jaz))
              else
                coalesce((select string_agg(identificacao || ': sem valor', ', ')
                            from jaz where coalesce(valor_lavagem,0) <= 0),
                         (select string_agg(identificacao || ': R$ ' ||
                                 to_char(valor_lavagem,'FM999990.00') || ' por ida', ' · ') from jaz))
              end,
         '/painel/clientes/' || p_familia || '?de=conferencia', true,
         'Com contrato o valor e MENSAL e cada lavagem desconta a fracao. Avulso cobra por ida.'

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
  'O checklist de uma familia. O valor cobrado depende do regime: contrato usa valor_mensal do tumulo (rateado), avulso usa valor_lavagem.';

revoke execute on function public.sureya_conferencia_cadastro(uuid) from public, anon;
grant  execute on function public.sureya_conferencia_cadastro(uuid) to authenticated, service_role;
