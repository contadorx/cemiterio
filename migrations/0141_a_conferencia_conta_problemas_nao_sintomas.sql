-- ============================================================================
-- 0141 — A CONFERENCIA CONTA PROBLEMAS, NAO SINTOMAS
-- ============================================================================
--
-- O QUE SE MEDIU EM PRODUCAO, EM 28/08
--
--   363 familias · 63 conferidas · 293 com pendencia obrigatoria
--
--   contrato ou avulso                 290
--   jazigo cadastrado                  122
--   jazigo com quadra e identificacao  122
--   ritmo da limpeza                   122
--   valor combinado                    122
--   telefone de quem responde           33
--   responsavel financeiro              27
--
-- OLHE AS QUATRO LINHAS DE 122. E O MESMO NUMERO QUATRO VEZES.
--
-- Sao as 122 familias sem jazigo nenhum. A funcao marca `pendente` em quatro
-- itens, e TRES deles dizem, literalmente, "nenhum jazigo para conferir" —
-- eles nao encontraram problema, eles nao tiveram o que olhar.
--
-- O efeito: a soma das pendencias era 838 para 293 familias. Quem varre a
-- lista cadastra o jazigo de UMA familia e ve QUATRO pendencias sumirem de uma
-- vez sem ter feito mais nada, e aprende que o numero nao quer dizer nada.
-- Contagem inflada e a mesma doenca do alarme que sempre grita.
--
-- O CONSERTO E O QUE A PROPRIA FUNCAO JA FAZIA EM OUTRO LUGAR.
--
-- `ritmo da limpeza` ja devolve 'nao se aplica' quando a familia e avulsa —
-- porque avulso nao tem ritmo, e nao ter nao e faltar. Sem jazigo, esses tres
-- itens estao exatamente na mesma situacao: nao ha o que conferir. Passam a
-- 'nao se aplica', e a unica pendencia que sobra e a de verdade — o jazigo.
--
-- ISTO NAO ALTERA UMA LINHA DE DADO. A funcao so le e classifica; o que muda
-- e o que ela CHAMA de pendencia. As 122 familias continuam com o mesmo
-- cadastro pela metade; o que muda e a conferencia parar de contar quatro
-- vezes o mesmo buraco.
--
-- MEDIDO DEPOIS: a soma cai de 838 para 472, e a lista de tipos passa a ter
-- quatro linhas em vez de sete:
--
--   290  contrato ou avulso
--   122  jazigo cadastrado
--    33  telefone de quem responde
--    27  responsavel financeiro
--
-- O numero de familias com pendencia NAO muda (293) — e o certo: elas
-- continuam com o mesmo cadastro pela metade. O que sumiu foi a contagem
-- quadruplicada do mesmo buraco.
-- ============================================================================

create or replace function public.sureya_conferencia_cadastro(p_familia uuid)
returns table(item text, situacao text, detalhe text, onde text, obrigatorio boolean, acao text)
language sql
security definer
set search_path to 'public'
as $function$
  with f as (select * from familias where id = p_familia and org_id = current_org_id()),
  pessoas as (select * from clientes c where c.familia_id = p_familia),
  resp as (select c.* from clientes c join f on f.responsavel_id = c.id),
  jaz  as (select * from tumulos t where t.familia_id = p_familia),
  pl   as (select p.* from planos p join pessoas c on c.id = p.cliente_id where p.ativo),
  ab   as (select count(*) n, coalesce(sum(case when tipo::text='credito' then valor else -valor end),0) v
             from conta_corrente where familia_id = p_familia
              and origem = 'abertura'::sureya_origem_lancamento)
  select 'responsavel financeiro'::text,
         case when exists (select 1 from resp) then 'ok' else 'pendente' end,
         coalesce((select nome from resp), 'ninguem definido'),
         '/painel/clientes/' || p_familia || '?de=conferencia', true,
         'Abra a ficha e marque quem responde pelo dinheiro desta familia.'
  union all
  select 'telefone de quem responde',
         case when exists (select 1 from resp where telefone is not null
                             and telefone not like 'sem-tel%' and telefone not like 'anon:%'
                             and length(regexp_replace(telefone,'\D','','g')) >= 10)
              then 'ok' else 'pendente' end,
         coalesce((select telefone from resp), 'sem responsavel definido'),
         '/painel/clientes/' || p_familia || '?de=conferencia', true,
         'Sem telefone valido, nenhuma mensagem chega — nem foto, nem cobranca.'
  union all
  -- A CAUSA. Esta continua obrigatoria e pendente: e o buraco de verdade.
  select 'jazigo cadastrado',
         case when (select count(*) from jaz) > 0 then 'ok' else 'pendente' end,
         (select count(*) from jaz) || ' jazigo(s)',
         '/painel/clientes/' || p_familia || '?de=conferencia', true,
         'Ligue pelo menos um jazigo a esta familia.'
  union all
  -- DERIVADA. Sem jazigo nao ha o que conferir — e nao ter o que olhar nao e
  -- ter encontrado um problema. Mesma regra que `ritmo da limpeza` ja usava
  -- para o avulso.
  select 'jazigo com quadra e identificacao',
         case when not exists (select 1 from jaz) then 'nao se aplica'
              when not exists (select 1 from jaz where quadra_id is null
                                  or coalesce(identificacao,'') = '') then 'ok' else 'pendente' end,
         case when not exists (select 1 from jaz) then 'depende do jazigo, que ainda nao existe'
              else coalesce((select string_agg(coalesce(nullif(identificacao,''),'(sem identificacao)'), ', ')
                     from jaz where quadra_id is null or coalesce(identificacao,'') = ''),
                  'todos completos') end,
         '/painel/jazigos', true,
         'Sem quadra e identificacao o jazigo nao entra no roteiro do dia.'
  union all
  select 'contrato ou avulso',
         case (select regime from f) when 'contrato' then 'ok' when 'avulso' then 'ok'
              else 'pendente' end,
         case (select regime from f)
           when 'contrato' then 'familia com contrato'
           when 'avulso'   then 'avulso — cada limpeza e cobrada na hora'
           else 'ninguem decidiu ainda se e contrato ou avulso' end,
         '/painel/clientes/' || p_familia || '?de=conferencia', true,
         'Escolha uma das duas. Nao e o mesmo fluxo de cobranca, e a lavagem nao espera.'
  union all
  -- DERIVADA (ver acima). Continua obrigatoria quando HA jazigo.
  select 'ritmo da limpeza',
         case when not exists (select 1 from jaz) then 'nao se aplica'
              when (select regime from f) <> 'contrato' then 'nao se aplica'
              when exists (select 1 from jaz where periodicidade is null) then 'pendente'
              else 'ok' end,
         case when not exists (select 1 from jaz) then 'depende do jazigo, que ainda nao existe'
              when (select regime from f) <> 'contrato' then 'avulso nao tem ritmo — a limpeza e pedida'
              else coalesce((select string_agg(identificacao || ': sem ritmo', ', ')
                              from jaz where periodicidade is null),
                            (select string_agg(distinct periodicidade::text, ' / ') from jaz)) end,
         '/painel/clientes/' || p_familia || '?de=conferencia', true,
         'O ritmo e o divisor do rateio: sem ele nao da para saber quanto vale uma lavagem.'
  union all
  -- DERIVADA (ver acima).
  select 'valor combinado',
         case when not exists (select 1 from jaz) then 'nao se aplica'
              when (select regime from f) = 'nao_definido' then 'atencao'
              when (select regime from f) = 'contrato'
                   and exists (select 1 from jaz where coalesce(valor_mensal,0) <= 0) then 'pendente'
              when (select regime from f) = 'avulso'
                   and exists (select 1 from jaz where coalesce(valor_lavagem,0) <= 0) then 'pendente'
              else 'ok' end,
         case when not exists (select 1 from jaz) then 'depende do jazigo, que ainda nao existe'
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
  union all
  select 'plano com as datas preenchidas',
         case (select regime from f)
           when 'avulso' then 'ok'
           when 'nao_definido' then 'nao se aplica'
           else case when not exists (select 1 from pl) then 'atencao'
                     when exists (select 1 from pl where proxima_cobranca is null
                                     or proximo_servico is null) then 'atencao'
                     else 'ok' end end,
         case (select regime from f)
           when 'avulso' then 'avulso nao usa plano — as limpezas sao pedidas uma a uma'
           when 'nao_definido' then 'defina antes se e contrato ou avulso'
           else case when not exists (select 1 from pl) then 'contrato sem plano ativo'
                     else coalesce((select string_agg(
                            case when proxima_cobranca is null then 'sem proxima cobranca'
                                 else 'sem proximo servico' end, '; ')
                            from pl where proxima_cobranca is null or proximo_servico is null),
                          'datas completas') end end,
         '/painel/clientes/' || p_familia || '?de=conferencia', false,
         'Com contrato, o plano sem data nao gera nem cobranca nem agenda.'
  union all
  select 'saldo de abertura',
         case when (select n from ab) > 1 then 'pendente' else 'CONFERIR NO CADERNO' end,
         case when (select n from ab) > 1 then (select n from ab) || ' aberturas — tem de ser uma so'
              when (select n from ab) = 0 then 'nada lancado: a familia comeca zerada?'
              else 'lancado: R$ ' || to_char(abs((select v from ab)),'FM999990.00')
                   || case when (select v from ab) < 0 then ' em aberto' else ' a favor' end
                   || ' — bate com o caderno?' end,
         '/painel/clientes/' || p_familia || '?de=conferencia', false,
         'Confira contra o caderno, com duas pessoas, separadamente.'
  union all
  select 'consentimento registrado',
         case when exists (select 1 from resp where consentimento_em is not null)
              then 'ok' else 'atencao' end,
         coalesce((select to_char(consentimento_em,'DD/MM/YYYY') from resp
                    where consentimento_em is not null), 'nao registrado'),
         '/painel/clientes/' || p_familia || '?de=conferencia', false,
         'Registre quando a familia autorizou receber mensagens.';
$function$;

-- A funcao ja era SECURITY DEFINER e le a organizacao pelo `current_org_id()`
-- de dentro. O revoke abaixo repoe a garantia da 0129 apos o replace.
revoke execute on function public.sureya_conferencia_cadastro(uuid) from public, anon;
grant  execute on function public.sureya_conferencia_cadastro(uuid) to authenticated;
