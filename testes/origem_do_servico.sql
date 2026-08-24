-- ============================================================================
-- DE ONDE VEIO A LAVAGEM (0128)
--
-- O risco aqui nao e a coluna: e a REGRA voltar a ser deduzida por ausencia.
-- Foi assim que 258 de 262 servicos viraram "avulsos" — uma conta que estava
-- certa ate a 0100 e que ninguem reviu quando o contrato mudou de casa.
--
-- Entao o que este arquivo prova nao e "existe a coluna origem". E:
--   1. lavagem de contrato NUNCA e pedido, mesmo sem plano_id;
--   2. o backfill nao inventou fato nenhum onde nao havia prova;
--   3. o default nao deixa o gerador errar por esquecimento.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci28(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'ORIGEM FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('a0280000-0000-0000-0000-000000000001','CI Origem', 10) on conflict do nothing;
insert into cemiterios (id, org_id, nome) values
  ('d0280000-0000-0000-0000-000000000001','a0280000-0000-0000-0000-000000000001','CI Cem Origem')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem) values
  ('e0280000-0000-0000-0000-000000000001','a0280000-0000-0000-0000-000000000001',
   'd0280000-0000-0000-0000-000000000001','Q Origem', 1) on conflict do nothing;
insert into familias (id, org_id, nome) values
  ('f0280000-0000-0000-0000-000000000001','a0280000-0000-0000-0000-000000000001','Familia CI Origem')
on conflict do nothing;

-- Um jazigo COM contrato e um SEM. O estado do tumulo e a outra metade da
-- regra: "avulso tem o estado do tumulo, mas o servico somente o solicitado".
insert into tumulos (id, org_id, quadra_id, cemiterio_id, familia_id, identificacao,
                     contratado, valor_mensal) values
 ('40280000-0000-0000-0000-000000000001','a0280000-0000-0000-0000-000000000001',
  'e0280000-0000-0000-0000-000000000001','d0280000-0000-0000-0000-000000000001',
  'f0280000-0000-0000-0000-000000000001','CI com contrato', true, 100),
 ('40280000-0000-0000-0000-000000000002','a0280000-0000-0000-0000-000000000001',
  'e0280000-0000-0000-0000-000000000001','d0280000-0000-0000-0000-000000000001',
  'f0280000-0000-0000-0000-000000000001','CI sem contrato', false, null)
on conflict do nothing;

select ci28('o cenario foi criado mesmo (ids nao colidiram com outro teste)',
  (select count(*) from tumulos
    where org_id = 'a0280000-0000-0000-0000-000000000001') = 2,
  'on conflict do nothing engole colisao em silencio, e o erro aparece tres passos depois');

-- ---------------------------------------------------------------------------
-- 1. O DEFAULT E CONTRATO
-- ---------------------------------------------------------------------------
-- O gerador escreve centenas de linhas por rodada. Se o default fosse "pedido"
-- ou nulo, uma linha esquecida viraria um avulso fantasma na tela da Sureya.
insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_plano) values
 ('50280000-0000-0000-0000-0000000000a1','a0280000-0000-0000-0000-000000000001',
  '40280000-0000-0000-0000-000000000001','pendente', current_date + 7, current_date + 7);

select ci28('lavagem gravada sem dizer a origem nasce como contrato',
  (select origem::text from servicos where id='50280000-0000-0000-0000-0000000000a1') = 'contrato',
  'o gerador nao pode virar fabrica de avulso por esquecimento');

-- ---------------------------------------------------------------------------
-- 2. SEM PLANO NAO E PEDIDO — o defeito inteiro em uma verificacao
-- ---------------------------------------------------------------------------
select ci28('lavagem de contrato sem plano_id NAO e pedido',
  (select origem::text <> 'pedido' and plano_id is null from servicos
    where id='50280000-0000-0000-0000-0000000000a1'),
  'era exatamente esta conta que chamava 258 de 262 servicos de avulsos');

select ci28('e ela nao aparece na fila dos pedidos',
  (select count(*) from servicos
    where org_id='a0280000-0000-0000-0000-000000000001' and origem = 'pedido') = 0,
  'a tela de Avulsos pergunta por origem = pedido');

-- ---------------------------------------------------------------------------
-- 3. O PEDIDO APARECE, E SO ELE
-- ---------------------------------------------------------------------------
insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_desejada, origem) values
 ('50280000-0000-0000-0000-0000000000a2','a0280000-0000-0000-0000-000000000001',
  '40280000-0000-0000-0000-000000000002','pendente', current_date + 3, current_date + 3, 'pedido');

select ci28('o que foi pedido entra na fila dos pedidos',
  (select count(*) from servicos
    where org_id='a0280000-0000-0000-0000-000000000001' and origem = 'pedido') = 1, '');

-- Um jazigo COM contrato tambem pode receber pedido: lavagem extra fora do
-- combinado e a coisa mais comum do negocio.
insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_desejada, origem) values
 ('50280000-0000-0000-0000-0000000000a3','a0280000-0000-0000-0000-000000000001',
  '40280000-0000-0000-0000-000000000001','pendente', current_date + 4, current_date + 4, 'pedido');

select ci28('jazigo COM contrato tambem pode ter lavagem pedida',
  (select count(*) from servicos s join tumulos t on t.id = s.tumulo_id
    where s.origem = 'pedido' and t.contratado
      and s.org_id='a0280000-0000-0000-0000-000000000001') = 1,
  'pedir uma limpeza extra fora do contrato e o caso mais comum que existe');

-- ---------------------------------------------------------------------------
-- 4. O BACKFILL NAO INVENTA FATO
-- ---------------------------------------------------------------------------
-- `data_desejada` NAO e prova de pedido: o "registrar limpeza ja feita"
-- preenche esse campo mecanicamente. Sem `data_plano` e sem plano, nao ha como
-- saber — e nao saber tem nome proprio.
insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_desejada, data_plano) values
 ('50280000-0000-0000-0000-0000000000a4','a0280000-0000-0000-0000-000000000001',
  '40280000-0000-0000-0000-000000000001','executado', current_date - 10, current_date - 10, null);

update servicos
   set origem = 'nao_definido'
 where origem = 'contrato' and data_plano is null and plano_id is null;

select ci28('linha velha sem prova nenhuma vira nao_definido',
  (select origem::text from servicos where id='50280000-0000-0000-0000-0000000000a4') = 'nao_definido',
  'marcar como pedido seria inventar um fato; como contrato, tambem');

select ci28('e nao_definido NAO conta como avulso',
  (select count(*) from servicos
    where org_id='a0280000-0000-0000-0000-000000000001' and origem = 'pedido') = 2,
  'vazio nao e zero: nao saber nao pode virar uma medicao');

select ci28('o backfill rodado de novo nao mexe em quem ja tem resposta',
  (select origem::text from servicos where id='50280000-0000-0000-0000-0000000000a2') = 'pedido',
  'convergente, nao so idempotente: so toca quem ainda esta no default');

-- ---------------------------------------------------------------------------
-- 5. O ARQUIVO ACOMPANHA A FORMA (0127 + 0128)
-- ---------------------------------------------------------------------------
-- `servicos_arquivados` nasceu de um `like servicos` — copia da forma, nao
-- vinculo vivo. Coluna nova em `servicos` NAO aparece la sozinha, e a receita
-- de volta do LEIA-ME quebraria com nulo numa coluna not null.
select ci28('a coluna origem existe tambem no arquivo',
  (select count(*) from information_schema.columns
    where table_name='servicos_arquivados' and column_name='origem') = 1,
  'sem ela, a receita de restaurar a 0127 quebra');

-- POR NOME, NUNCA POR POSICAO. `servicos_arquivados` tem `arquivado_em` e
-- `motivo` ANTES de `origem` — a coluna nova entrou no fim de `servicos`, mas
-- no arquivo entrou depois das duas. Um `select s.*, now(), 'x'` posicional
-- gravaria `origem` dentro de `arquivado_em`. Foi este teste que descobriu.
insert into servicos_arquivados
select (jsonb_populate_record(null::servicos_arquivados,
          to_jsonb(s)
          || jsonb_build_object('arquivado_em', now(), 'motivo', 'teste'))).*
  from servicos s where s.id='50280000-0000-0000-0000-0000000000a2';

select ci28('o arquivo aceita a lavagem sem trocar coluna de lugar',
  (select arquivado_em is not null from servicos_arquivados
    where id='50280000-0000-0000-0000-0000000000a2'),
  'insert posicional no arquivo grava origem dentro de arquivado_em');

select ci28('e a receita de ida e volta funciona com a coluna nova',
  (select origem::text from servicos_arquivados
    where id='50280000-0000-0000-0000-0000000000a2') = 'pedido',
  'a receita do LEIA-ME da 0127 precisa continuar valendo depois da 0128');

drop function ci28(text, boolean, text);
