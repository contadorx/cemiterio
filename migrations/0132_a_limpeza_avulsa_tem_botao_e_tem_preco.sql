-- ============================================================================
-- 0132 — A LIMPEZA AVULSA TEM BOTAO, TEM PRECO E TEM DONO
-- ============================================================================
--
-- A PERGUNTA FOI "ONDE FICA O BOTAO?". A RESPOSTA E: NAO EXISTIA.
--
-- `POST /api/servico` foi escrita para isso — ela ate diz, no proprio
-- cabecalho, "agora tem botao na ficha da familia". Medido em 24/08: NENHUMA
-- tela chama essa rota. O botao nunca foi feito.
--
-- Pior: o vazio da tela de Avulsos promete o botao com todas as letras ("elas
-- nascem na ficha da familia, no botao Nova limpeza avulsa"). Esse texto e meu,
-- de ontem, e estava mentindo.
--
-- O QUE FALTAVA NO BANCO
--
-- O enum `sureya_momento_cobranca` ('antes' | 'depois' | 'contra_foto') JA
-- EXISTE — e mora so em `planos`. A conclusao le assim:
--
--     select coalesce(p.momento_cobranca::text, 'depois') into v_momento
--       from planos p where p.id = v_s.plano_id;
--
-- Como `plano_id` e nulo em toda lavagem desde a 0100, isso resolve SEMPRE
-- para 'depois'. O pre-pago e o contra-foto viraram codigo morto sem ninguem
-- perceber — mais um orfao da mudanca de casa do contrato.
--
-- Entao nao ha vocabulario novo aqui: o momento da cobranca desce de `planos`
-- para `servicos`, que e onde o Leandro pediu que ele ficasse ("recebimento
-- antes ou depois", por limpeza).
--
-- E O PRECO?
--
-- Ja estava certo, e vale dizer por que: a cascata da conclusao comeca em
-- `coalesce(nullif(v_s.valor, 0), 0)` — O VALOR DO PROPRIO SERVICO. Uma avulsa
-- com preco digitado e cobrada pelo preco dela.
--
-- Isso importa porque `valorDaLimpeza()`, que a rota antiga usava, devolve
-- ZERO para familia que nao seja `contratado` em modo `consumo`. Ou seja: uma
-- avulsa para quem nao tem contrato viraria um debito de R$ 0,00 — trabalho
-- feito que nunca vira dinheiro (a pendencia 21, aberta ha meses).
-- ============================================================================

-- ============================================================================
-- 0. O TIPO EXISTIA SO EM PRODUCAO — achado por esta migration
-- ============================================================================
--
-- Ao aplicar a 0132 no banco limpo do harness: `type "sureya_momento_cobranca"
-- does not exist`. Em producao ele existe; na trilha, nao.
--
-- A origem: a 0026 cria `planos.momento_cobranca` como TEXT. Alguem converteu
-- a coluna para enum direto no banco, sem migration. O placar do harness nunca
-- pegou porque ele conta OBJETOS — tabelas, funcoes, gatilhos, policies —, e
-- nao o tipo de uma coluna.
--
-- A 0062 chega a usar `::sureya_momento_cobranca`, mas dentro de um corpo
-- plpgsql: o cast so e resolvido em tempo de execucao, entao nunca falhou na
-- reconstrucao. O tipo passou dez migrations invisivel.
--
-- Aqui ele entra na trilha, com exatamente os valores de producao. Idempotente:
-- onde ja existe, nao faz nada.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sureya_momento_cobranca') then
    create type sureya_momento_cobranca as enum ('antes', 'depois', 'contra_foto');
  end if;
end $$;

-- FICA DITO, E NAO CONSERTADO AQUI: `planos.momento_cobranca` continua `text`
-- na trilha e enum em producao. Igualar mexe na tabela legada que ainda dobra a
-- geracao no jazigo Perrela — e assunto da fatia que aposenta `planos`, nao
-- desta. O que importava era o tipo existir.

-- ============================================================================
-- 1. O MOMENTO DA COBRANCA DESCE PARA O SERVICO
-- ============================================================================
alter table servicos
  add column if not exists momento_cobranca sureya_momento_cobranca;

comment on column servicos.momento_cobranca is
  'Quando esta limpeza e cobrada: `antes` (a familia paga para ser feita), '
  '`depois` (o padrao — cobra ao concluir) ou `contra_foto` (a entrega da foto '
  'e que libera a cobranca). Nulo herda `depois`. Vale sobretudo para a AVULSA: '
  'no contrato quem gera divida e a competencia, nao a lavagem.';

-- ============================================================================
-- 2. A CONCLUSAO PASSA A OLHAR O SERVICO PRIMEIRO
-- ============================================================================
--
-- Emenda por substituicao de texto sobre a definicao viva, com o alvo
-- verificado: `sureya_concluir_lavagem` e a transacao mais delicada do sistema
-- (status, foto, divida, extrato, fila, remuneracao e material, tudo ou nada)
-- e redigitar seria a forma mais provavel de perder uma parte sem perceber.
--
-- A ORDEM E: o servico manda; sem ele, o plano legado; sem os dois, 'depois'.
-- O plano fica na cascata de proposito — as quatro lavagens que ainda tem
-- `plano_id` nao podem mudar de comportamento por causa desta migration.
do $$
declare
  v_def text;
  alvo  text := '  select coalesce(p.momento_cobranca::text, ''depois'') into v_momento' || E'\n' ||
                '    from planos p where p.id = v_s.plano_id;';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname = 'sureya_concluir_lavagem';

  if v_def is null then
    raise exception '0132: sureya_concluir_lavagem nao existe';
  end if;
  if position(alvo in v_def) = 0 then
    raise exception '0132: nao achei a leitura do momento_cobranca na conclusao';
  end if;

  execute replace(v_def, alvo,
    '  -- O SERVICO MANDA (0132). Depois dele o plano legado, e so entao o' || E'\n' ||
    '  -- padrao. Ate aqui so havia a linha do plano — e como `plano_id` e nulo' || E'\n' ||
    '  -- em toda lavagem desde a 0100, ela resolvia SEMPRE para ''depois''.' || E'\n' ||
    '  select coalesce(' || E'\n' ||
    '           v_s.momento_cobranca::text,' || E'\n' ||
    '           (select p.momento_cobranca::text from planos p where p.id = v_s.plano_id),' || E'\n' ||
    '           ''depois'') into v_momento;');
end $$;

revoke all on function sureya_concluir_lavagem(uuid, text, text, integer, text, uuid)
  from public, anon;
grant execute on function sureya_concluir_lavagem(uuid, text, text, integer, text, uuid)
  to authenticated, service_role;

-- ============================================================================
-- 3. ACHAR AS AVULSAS PENDENTES DE PAGAMENTO
-- ============================================================================
-- A pre-paga em aberto e a pergunta "quem ainda nao pagou o que pediu?".
-- Indice parcial: ocupa o tamanho da resposta, nao o da tabela.
create index if not exists idx_servicos_pre_pago
  on servicos (org_id, status, data_prevista)
  where momento_cobranca = 'antes';
