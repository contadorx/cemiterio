-- ============================================================================
-- 0128 — O SERVICO DIZ DE ONDE VEIO
-- ============================================================================
--
-- A REGRA, NAS PALAVRAS DO LEANDRO:
--   "avulso tem o estado do tumulo, mas o servico somente o solicitado"
--
-- Sao duas perguntas diferentes, e o sistema respondia as duas com o mesmo
-- campo — por isso errava as duas.
--
--   TUMULO   tem ESTADO:  contratado, ou avulso. Ja mora em `tumulos`
--            (`contratado` + `valor_mensal`). Nao precisa de campo novo.
--
--   SERVICO  tem ORIGEM:  nasceu do contrato, ou de alguem PEDIR.
--            Nao existia. E o que esta migration cria.
--
-- POR QUE NAO DAVA PARA DEDUZIR
--
-- Ate a 0100 valia `avulso = plano_id is null`. Naquela migration o contrato
-- saiu de `planos` e foi morar no tumulo, e o gerador passou a escrever
-- `plano_id: null` em TODA lavagem de contrato — com o comentario "o plano e o
-- proprio tumulo agora". O escritor mudou de ideia; os leitores nao souberam.
-- Resultado medido em 24/08: 258 de 262 servicos chamados de avulsos, os 258
-- em jazigo contratado.
--
-- `canal` (0120) tambem nao serve: ele diz QUEM digitou (automatico, campo,
-- manual_adm, importacao), nao POR QUE a lavagem existe. Uma lavagem digitada
-- por `manual_adm` pode ser contrato lancado com atraso ou avulso pedido por
-- telefone.
--
-- O TERCEIRO VALOR NAO E ENFEITE
--
-- `nao_definido` existe porque das 5 lavagens que sobraram em producao, 4 nao
-- tem como saber. Elas tem `data_desejada`, mas `data_desejada` nao e prova de
-- pedido: o "registrar limpeza ja feita" preenche esse campo mecanicamente,
-- com a data que a pessoa digitou. Duas delas vieram por ali, sem valor.
--
-- Marcar as 4 como `pedido` seria inventar quatro fatos. Marcar como
-- `contrato` tambem. Vazio nao e zero — a mesma licao da margem (0120), da
-- natureza (0122) e do fecha (0124). O mesmo desenho de `sureya_regime_familia`,
-- que ja tem `nao_definido` pelo mesmo motivo.
--
-- O DEFAULT E `contrato` DE PROPOSITO
--
-- Quem mais escreve em `servicos` e o gerador de contrato — e ele nao vai
-- errar por esquecimento. As tres portas de pedido gravam `pedido` na mao.
-- ============================================================================

-- ============================================================================
-- 1. O TIPO
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sureya_origem_servico') then
    create type sureya_origem_servico as enum ('contrato', 'pedido', 'nao_definido');
  end if;
end $$;

-- ============================================================================
-- 2. A COLUNA
-- ============================================================================
alter table servicos
  add column if not exists origem sureya_origem_servico not null default 'contrato';

comment on column servicos.origem is
  'Por que esta lavagem existe: `contrato` (o gerador a devia), `pedido` '
  '(alguem da familia pediu) ou `nao_definido` (nasceu antes da 0128 e nao ha '
  'como saber). AVULSO E `pedido` — nunca a ausencia de outra coisa.';

-- O ARQUIVO ACOMPANHA. `servicos_arquivados` (0127) nasceu de um `like
-- servicos` — copia da forma no dia em que foi criada, nao vinculo vivo. Sem
-- esta linha, a receita de volta do LEIA-ME quebraria: `jsonb_populate_record`
-- nao acharia a chave `origem` e tentaria gravar nulo numa coluna not null.
-- As 257 arquivadas sao todas de contrato — foi por isso que sairam.
--
-- E UM AVISO PARA QUEM ARQUIVAR DA PROXIMA VEZ: no arquivo, `arquivado_em` e
-- `motivo` ficam ANTES de `origem` — a coluna nova entrou no fim de `servicos`
-- e no fim do arquivo, que ja tinha as duas. As formas deixaram de ser
-- iguais. Arquive POR NOME (jsonb_populate_record), nunca com
-- `select s.*, now(), '...'` posicional: isso gravaria `origem` dentro de
-- `arquivado_em`. O teste `origem_do_servico.sql` guarda essa porta.
alter table servicos_arquivados
  add column if not exists origem sureya_origem_servico not null default 'contrato';

-- ============================================================================
-- 3. O QUE JA ESTAVA LA
-- ============================================================================
--
-- CONVERGENTE, nao so idempotente: roda de novo e chega no mesmo lugar. So
-- toca linha que ainda esta no default e tem prova documental.
--
--   `data_plano` preenchida  = o carimbo do gerador de contrato. E prova.
--   `data_plano` vazia       = nao ha prova de nada. `nao_definido`.
update servicos
   set origem = 'nao_definido'
 where origem = 'contrato'
   and data_plano is null
   and plano_id is null;

-- ============================================================================
-- 4. ACHAR OS PEDIDOS DEPRESSA
-- ============================================================================
-- A tela de Avulsos so pergunta por `pedido`, e eles serao sempre poucos
-- diante da agenda inteira. Indice parcial: ocupa o tamanho da resposta, nao
-- o da tabela.
create index if not exists idx_servicos_pedidos
  on servicos (org_id, status, data_prevista)
  where origem = 'pedido';
