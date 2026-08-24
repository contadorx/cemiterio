-- ============================================================================
-- O PAINEL DO MES (0105) — todo numero sai da mesma conta
--
-- O risco deste arquivo nao e um numero errado: e DOIS numeros que discordam.
-- Um painel em que "em aberto" e "inadimplencia" diferem por meio real ensina
-- a nao confiar em nenhum dos dois — foi o que aconteceu com o aviso da agenda
-- ate a 0092, quando o contador e o movedor usavam definicoes diferentes.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci16(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'PAINEL FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000016','CI Painel')
on conflict do nothing;
insert into cemiterios (id, org_id, nome)
values ('dddddddd-0000-0000-0000-000000000016','aaaaaaaa-0000-0000-0000-000000000016','CI Cem Painel')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
values ('eeeeeeee-0000-0000-0000-000000000016','aaaaaaaa-0000-0000-0000-000000000016',
        'dddddddd-0000-0000-0000-000000000016','Q Painel', 1)
on conflict do nothing;

-- Duas familias: uma paga, outra nao.
insert into familias (id, org_id, nome, freq_pagamento, contratado) values
  ('ff000000-0000-0000-0000-000000000161','aaaaaaaa-0000-0000-0000-000000000016','Paga Em Dia','mensal',true),
  ('ff000000-0000-0000-0000-000000000162','aaaaaaaa-0000-0000-0000-000000000016','Deve Ha Muito','mensal',true)
on conflict do nothing;

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, proxima_cobranca) values
  ('11100000-0000-0000-0000-000000000161','aaaaaaaa-0000-0000-0000-000000000016',
   'eeeeeeee-0000-0000-0000-000000000016','ff000000-0000-0000-0000-000000000161','CI-PN-A',
   true, 100, date_trunc('month', current_date)::date),
  ('11100000-0000-0000-0000-000000000162','aaaaaaaa-0000-0000-0000-000000000016',
   'eeeeeeee-0000-0000-0000-000000000016','ff000000-0000-0000-0000-000000000162','CI-PN-B',
   true, 60, date_trunc('month', current_date)::date)
on conflict do nothing;

-- A divida antiga: uma competencia de 5 meses atras, nunca paga.
insert into conta_corrente (org_id, familia_id, tumulo_id, tipo, origem, competencia, valor, descricao, data)
values ('aaaaaaaa-0000-0000-0000-000000000016','ff000000-0000-0000-0000-000000000162',
        '11100000-0000-0000-0000-000000000162','debito','competencia',
        (date_trunc('month', current_date) - interval '5 months')::date, 60,'divida velha',
        (date_trunc('month', current_date) - interval '5 months')::date)
on conflict do nothing;

select * from sureya_cobrar_competencias(current_date, 'aaaaaaaa-0000-0000-0000-000000000016');

-- A que paga, paga tudo do mes.
insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values ('aaaaaaaa-0000-0000-0000-000000000016','ff000000-0000-0000-0000-000000000161',
        'credito','pagamento', date_trunc('month', current_date)::date, 100,'pagou', current_date)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1 · OS NUMEROS BATEM ENTRE SI
-- ---------------------------------------------------------------------------
-- Nao basta cada cartao estar certo: o aging tem de SOMAR o em aberto, senao a
-- tela mostra duas verdades ao mesmo tempo.
select ci16('o aging soma exatamente o em aberto',
  (select (p->'inadimplencia'->>'ate_30')::numeric
        + (p->'inadimplencia'->>'d31_60')::numeric
        + (p->'inadimplencia'->>'d61_90')::numeric
        + (p->'inadimplencia'->>'acima_90')::numeric
        = (p->'inadimplencia'->>'em_aberto')::numeric
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'as faixas do aging nao fecham com o total em aberto');

select ci16('e a lista de devedores soma o mesmo',
  (select (select coalesce(sum((d->>'saldo')::numeric),0)
             from jsonb_array_elements(p->'devedores') d)
        = (p->'inadimplencia'->>'em_aberto')::numeric
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'a lista mostra um total e o cartao mostra outro');

-- A MARGEM SO EXISTE SE HOUVER CUSTO LANCADO (0120).
--
-- Este teste garantia o contrario ate a auditoria: exigia que a margem fosse
-- sempre `receita - custos`. Com `lancamentos` VAZIO — e ele esta vazio em
-- producao desde sempre — isso devolvia a receita inteira com cara de lucro.
-- Ausencia de registro apresentada como medicao.
--
-- Agora nulo, e a tela e obrigada a dizer "nao da para saber".
select ci16('sem custo lancado, a margem e NULA — e nao a receita inteira',
  (select (p->'resultado'->>'margem') is null
      and (p->'resultado'->>'tem_custo')::boolean = false
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'receita menos zero devolvia a receita como se fosse lucro');

-- (o caso COM custo lancado vai no fim do arquivo, depois do teste
--  que exige a contagem de despesas em zero)

-- ---------------------------------------------------------------------------
-- 2 · A DIVIDA VELHA CAI NA FAIXA CERTA
-- ---------------------------------------------------------------------------
-- A idade conta da competencia em aberto mais ANTIGA. Cinco meses tem de cair
-- em "acima de 90 dias" — se caisse em "ate 30", a cobranca trataria uma
-- divida velha como recente.
select ci16('divida de cinco meses aparece acima de 90 dias',
  (select (p->'inadimplencia'->>'acima_90')::numeric > 0
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'a divida velha foi classificada como recente');

select ci16('quem pagou o mes NAO aparece entre os devedores',
  (select not exists (
     select 1 from jsonb_array_elements(p->'devedores') d
      where d->>'familia_id' = 'ff000000-0000-0000-0000-000000000161')
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'cobrou de quem esta em dia');

-- ---------------------------------------------------------------------------
-- 3 · VAZIO NAO E ZERO
-- ---------------------------------------------------------------------------
-- `lancamentos` esta vazio em producao. O painel tem de devolver a CONTAGEM
-- junto do total, senao a tela nao consegue distinguir "custo zero" de
-- "ninguem lancou" — e mostraria margem cheia com cara de fato.
select ci16('custos devolvem a contagem, nao so o total',
  (select p->'custos' ? 'lancamentos'
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'sem a contagem a tela nao sabe se e custo zero ou falta de registro');

select ci16('e com nenhuma despesa lancada a contagem e zero',
  (select (p->'custos'->>'lancamentos')::int = 0
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'contou despesa que nao existe');

-- ---------------------------------------------------------------------------
-- 4 · COBRADO E NAO ENTREGUE — o risco que a 0104 criou
-- ---------------------------------------------------------------------------
-- Enquanto a limpeza gerava a cobranca, o risco era servico sem faturar. Agora
-- o contrato cobra sozinho e o risco inverteu: debitar o mes sem ter ido.
select ci16('as duas cobradas sem limpeza aparecem como nao entregues',
  (select (p->'sem_entrega'->>'tumulos')::int = 2
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'cobrou e nao entregou, e o painel nao acusou');

-- Uma limpeza executada tira o jazigo da lista.
insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada)
values ('99999999-0000-0000-0000-000000000161','aaaaaaaa-0000-0000-0000-000000000016',
        '11100000-0000-0000-0000-000000000161','executado', current_date, now())
on conflict do nothing;

select ci16('e a limpeza executada tira o jazigo da lista',
  (select (p->'sem_entrega'->>'tumulos')::int = 1
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'entregou e o painel continua acusando');

-- ---------------------------------------------------------------------------
-- 5 · CAMPO E ANOTADA SAO COISAS DIFERENTES
-- ---------------------------------------------------------------------------
-- So `iniciado_em` prova que alguem esteve no jazigo. Somar as duas apagaria a
-- unica diferenca que importa entre registro e memoria.
select ci16('a limpeza sem iniciado_em conta como ANOTADA',
  (select (p->'lavagens'->>'anotadas')::int = 1 and (p->'lavagens'->>'pelo_campo')::int = 0
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'anotada pelo painel entrou como registro de campo');

update servicos set iniciado_em = now() where id='99999999-0000-0000-0000-000000000161';

select ci16('e com iniciado_em ela vira registro de CAMPO',
  (select (p->'lavagens'->>'pelo_campo')::int = 1 and (p->'lavagens'->>'anotadas')::int = 0
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'o carimbo do campo nao mudou a classificacao');

select ci16('e as duas somam as executadas',
  (select (p->'lavagens'->>'pelo_campo')::int + (p->'lavagens'->>'anotadas')::int
        = (p->'lavagens'->>'executadas')::int
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'a quebra por origem nao fecha com o total');

-- ---------------------------------------------------------------------------
-- 6 · A CARTEIRA
-- ---------------------------------------------------------------------------
select ci16('o contrato por mes soma os jazigos contratados',
  (select (p->'carteira'->>'mensal_contratado')::numeric = 160
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'R$100 + R$60 tinha de dar R$160 por mes');

select ci16('e o ticket medio e a media, nao a soma',
  (select (p->'carteira'->>'ticket')::numeric = 80
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'o ticket medio saiu errado');

-- ---------------------------------------------------------------------------
-- A MARGEM VOLTA A EXISTIR QUANDO HA O QUE SUBTRAIR
-- ---------------------------------------------------------------------------
-- POR ULTIMO de proposito: este bloco LANCA uma despesa, e o teste de
-- "nenhuma despesa lancada" acima precisa rodar antes com a tabela vazia.
insert into categorias_financeiras (id, org_id, nome, tipo)
values ('cf000000-0000-0000-0000-000000000016','aaaaaaaa-0000-0000-0000-000000000016',
        'Materiais','saida')
on conflict do nothing;
insert into lancamentos (org_id, categoria_id, tipo, valor, data, descricao)
values ('aaaaaaaa-0000-0000-0000-000000000016','cf000000-0000-0000-0000-000000000016',
        'saida', 40, current_date, 'balde e escova')
on conflict do nothing;

select ci16('com custo lancado, a margem e receita menos custos',
  (select (p->'resultado'->>'receita')::numeric - (p->'resultado'->>'custos')::numeric
        = (p->'resultado'->>'margem')::numeric
      and (p->'resultado'->>'tem_custo')::boolean = true
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'quando ha o que subtrair, a conta tem de fechar');
-- ---------------------------------------------------------------------------
-- OS BLOCOS OPERACIONAIS, E O NUMERO QUE ABRE (0120)
-- ---------------------------------------------------------------------------
-- A auditoria de 24/08 achou o painel medindo bem o dinheiro e quase nada da
-- operacao. O que ela mediu em producao, e que nao aparecia em lugar nenhum:
--
--   78 jazigos contratados, 2 atendidos no mes   -> nao havia denominador
--   5 lavagens, 4 SEM FOTO                       -> a prova nao era contada
--   159 sugestoes da IA, 157 descartadas         -> nao existia no painel
--   12 mensagens sairam, 0 pela fila             -> nao existia no painel

-- COBERTURA: o denominador que faltava.
select ci16('a cobertura diz quantos jazigos ficaram SEM atendimento',
  (select (p->'cobertura'->>'contratados')::int >= 0
      and (p->'cobertura'->>'nao_atendidos')::int
        = greatest(0, (p->'cobertura'->>'em_servico')::int
                    - (p->'cobertura'->>'atendidos')::int)
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  '"5 lavagens" sem denominador nao diz se a casa entregou ou nao');

-- E o parado NAO conta como nao atendido: quem pediu para parar nao e falha.
select ci16('quem esta parado sai da conta de cobertura',
  (select (p->'cobertura'->>'em_servico')::int
        = (p->'cobertura'->>'contratados')::int - (p->'cobertura'->>'parados')::int
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'contar o jazigo parado como nao atendido cobraria da casa um servico que a familia cancelou');

-- A FOTO E CONTADA: com + sem tem de fechar com as executadas.
select ci16('com foto mais sem foto fecha com as executadas',
  (select (p->'lavagens'->>'com_foto')::int + (p->'lavagens'->>'sem_foto')::int
        = (p->'lavagens'->>'executadas')::int
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'a foto e o entregavel: quatro de cinco lavagens sem prova passavam despercebidas');

-- MENSAGENS E IA existem no painel.
select ci16('o painel conta mensagem e disparo',
  (select p ? 'mensagens'
      and (p->'mensagens') ? 'saidas' and (p->'mensagens') ? 'pela_fila'
      and (p->'mensagens') ? 'sem_resposta'
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'a casa manda mensagem todo mes e o painel nao dizia quantas');

select ci16('e conta o que a IA sugeriu, o que foi usado e quanto custou',
  (select p ? 'ia'
      and (p->'ia') ? 'sugestoes' and (p->'ia') ? 'usadas' and (p->'ia') ? 'custo'
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  '159 sugestoes e 2 usadas e a pergunta "a IA ajuda?" — e nao havia onde ver');

select ci16('o aproveitamento da IA e nulo quando ela nao sugeriu nada',
  (select (p->'ia'->>'sugestoes')::int > 0
       or (p->'ia'->>'aproveitamento') is null
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'zero de zero nao e 0%% de aproveitamento, e ausencia de dado');

-- FLORES tem lugar proprio.
select ci16('as flores tem bloco proprio, com custo e margem',
  (select p ? 'flores'
      and (p->'flores') ? 'receita' and (p->'flores') ? 'custo' and (p->'flores') ? 'margem'
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'o servico novo precisa de uma linha propria para se saber se paga');

-- ---------------------------------------------------------------------------
-- O NUMERO ABRE, E A LISTA BATE COM O CARTAO
-- ---------------------------------------------------------------------------
-- E o ponto do pedido: "abrem relatorios de gestao". E o risco e o de sempre —
-- o cartao dizer 2 e a lista trazer 3.
select ci16('o detalhe de lavagens traz UMA LINHA POR LAVAGEM do cartao',
  (select jsonb_array_length(
            sureya_painel_detalhe('lavagens', current_date, 'aaaaaaaa-0000-0000-0000-000000000016'))
        = (p->'lavagens'->>'executadas')::int
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'cartao e lista contando o mesmo fato de dois jeitos e o defeito de forma desta casa');

select ci16('o detalhe de NAO ATENDIDOS bate com a cobertura',
  (select jsonb_array_length(
            sureya_painel_detalhe('nao_atendidos', current_date, 'aaaaaaaa-0000-0000-0000-000000000016'))
        = (p->'cobertura'->>'nao_atendidos')::int
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'e a lista mais acionavel do painel: contratado, em servico, e ninguem foi la');

select ci16('o detalhe de SEM FOTO bate com o cartao',
  (select jsonb_array_length(
            sureya_painel_detalhe('sem_foto', current_date, 'aaaaaaaa-0000-0000-0000-000000000016'))
        = (p->'lavagens'->>'sem_foto')::int
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'sem a lista, "4 sem foto" nao diz QUAIS quatro');

select ci16('o detalhe de COBRADA E NAO ENTREGUE bate com o cartao',
  (select jsonb_array_length(
            sureya_painel_detalhe('sem_entrega', current_date, 'aaaaaaaa-0000-0000-0000-000000000016'))
        = (p->'sem_entrega'->>'tumulos')::int
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'este e o numero que cobra da casa: dinheiro lancado sem limpeza no mes');

select ci16('o detalhe de devedores bate com a inadimplencia',
  (select jsonb_array_length(
            sureya_painel_detalhe('devedores', current_date, 'aaaaaaaa-0000-0000-0000-000000000016'))
        = (p->'inadimplencia'->>'familias')::int
     from (select sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000016') as p) z),
  'a lista de devedores e o cartao de inadimplencia sao a mesma pergunta');

-- BLOCO DESCONHECIDO E RECUSADO, com a lista do que existe.
do $$
declare v_erro text;
begin
  begin
    perform sureya_painel_detalhe('inventado', current_date, 'aaaaaaaa-0000-0000-0000-000000000016');
    v_erro := 'passou';
  exception when others then v_erro := sqlerrm;
  end;
  perform ci16('bloco desconhecido e recusado, e nao devolve lista vazia',
    v_erro = 'bloco_desconhecido',
    'lista vazia por nome errado leria como "nao ha nada", que e mentira diferente');
end $$;
