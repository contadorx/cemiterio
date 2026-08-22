-- ============================================================================
-- SUREYA — 0070 · BUILD 4 · A DIVERGÊNCIA ENTRE OS DOIS RAZÕES, MEDIDA
--
-- NÃO ALTERA DADO NENHUM. Cria duas views de leitura.
--
-- O QUE A AUDITORIA PEDE
-- ---------------------------------------------------------------------------
--   "Resolver a convivência de `movimentos` e `conta_corrente`: fonte oficial,
--    espelho e reconciliação explícitos."
--
-- Essa é a entrega nº 2 do Build 4. Mas a nº 1 é uma DECISÃO da responsável —
-- qual dos dois é a verdade. Esta migration não decide: ela mede, para a
-- decisão ser tomada olhando número e não impressão.
--
-- O QUE A MEDIÇÃO JÁ MOSTROU (produção, 22/08/2026)
-- ---------------------------------------------------------------------------
--   movimentos       2 linhas   saldo  +20,00
--   conta_corrente   6 linhas   saldo −170,00
--
-- E os DOIS PRIMEIROS eventos são os MESMOS, gravados nas duas tabelas:
--
--   01/08  débito  40,00  "Limpeza executada"                     (movimentos)
--   01/08  débito  40,00  "Limpeza executada · migrado do controle anterior"
--   02/08  crédito 60,00  "Comprovante de Pix (aguardando conferência)"
--   02/08  crédito 60,00  "... · migrado do controle anterior"
--
-- O sufixo conta a história: alguém migrou `movimentos` para `conta_corrente`
-- e **não parou de escrever em `movimentos`**. Não é espelho — é duplicata.
--
-- Depois disso, `conta_corrente` recebeu mais quatro lançamentos que
-- `movimentos` nunca viu: duas lavagens, um pagamento de 100,00 e um saldo de
-- abertura de 240,00.
--
-- A CONSEQUÊNCIA CONCRETA
-- ---------------------------------------------------------------------------
-- `calcularSaldo()` (src/lib/financeiro.ts:11) — a função que a régua de
-- cobrança, o aviso de saldo baixo e a ficha da família usam — lê
-- **`movimentos`**. Ou seja: os 240,00 de abertura e os 100,00 de pagamento
-- que estão em `conta_corrente` **não existem** para a cobrança automática.
--
-- Uma família com dívida registrada no razão novo é invisível para quem cobra.
--
-- O MESMO CONCEITO, DUAS IMPLEMENTAÇÕES
-- ---------------------------------------------------------------------------
-- Saldo de abertura é o exemplo mais limpo:
--
--   /api/clientes/[id]/saldo-abertura → sureya_saldo_abertura → movimentos,
--        origem 'ajuste',   descrição "Saldo de abertura (migração)"
--   /api/conta-corrente (ação abertura) → conta_corrente,
--        origem 'abertura', descrição "Situação inicial · em aberto"
--
-- Duas rotas, dois razões, dois enums, o mesmo conceito de negócio.
--
-- E a divisão atravessa o produto: **15 arquivos** leem ou escrevem
-- `movimentos`, **8** leem ou escrevem `conta_corrente`.
--
-- POR QUE AGORA É A HORA
-- ---------------------------------------------------------------------------
-- Somados, os dois razões têm **oito linhas** para 298 famílias. Migrar oito
-- linhas é trivial; migrar oito mil, depois do piloto, não é. A janela para
-- decidir barato é agora.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) O saldo de cada família nos dois razões, lado a lado
--
-- O grão é diferente entre eles — e essa é justamente uma das perguntas que a
-- decisão precisa responder:
--
--   `movimentos`     é por CLIENTE (pessoa)
--   `conta_corrente` é por FAMÍLIA
--
-- A view junta pelo `clientes.familia_id` para poder comparar. Onde a família
-- tem mais de uma pessoa, o lado `movimentos` é a soma delas.
-- ----------------------------------------------------------------------------
create or replace view sureya_divergencia_financeira as
with por_familia as (
  select f.id   as familia_id,
         f.nome as familia,
         f.org_id
    from familias f
),
mov as (
  select c.familia_id,
         count(*)                                                          as linhas,
         coalesce(sum(case when m.tipo::text = 'credito' then m.valor
                           else -m.valor end) filter
                  (where m.status_conc::text = 'confirmado'), 0)           as saldo
    from movimentos m
    join clientes c on c.id = m.cliente_id
   where c.familia_id is not null
   group by c.familia_id
),
cc as (
  select l.familia_id,
         count(*)                                                          as linhas,
         coalesce(sum(case when l.tipo::text = 'credito' then l.valor
                           else -l.valor end), 0)                          as saldo
    from conta_corrente l
   group by l.familia_id
)
select p.familia_id,
       p.familia,
       coalesce(mov.linhas, 0)          as linhas_movimentos,
       coalesce(mov.saldo, 0)           as saldo_movimentos,
       coalesce(cc.linhas, 0)           as linhas_conta_corrente,
       coalesce(cc.saldo, 0)            as saldo_conta_corrente,
       coalesce(cc.saldo, 0) - coalesce(mov.saldo, 0) as diferenca,
       case
         when coalesce(mov.linhas,0) = 0 and coalesce(cc.linhas,0) = 0 then 'sem lançamento'
         when coalesce(mov.linhas,0) = 0 then 'só no razão novo (conta_corrente)'
         when coalesce(cc.linhas,0)  = 0 then 'só no razão antigo (movimentos)'
         when abs(coalesce(cc.saldo,0) - coalesce(mov.saldo,0)) < 0.005 then 'iguais'
         else 'DIVERGEM'
       end                              as situacao
  from por_familia p
  left join mov on mov.familia_id = p.familia_id
  left join cc  on cc.familia_id  = p.familia_id
 where p.org_id = current_org_id()
   and (coalesce(mov.linhas,0) > 0 or coalesce(cc.linhas,0) > 0)
 order by abs(coalesce(cc.saldo,0) - coalesce(mov.saldo,0)) desc;

comment on view sureya_divergencia_financeira is
  'Build 4: compara o saldo de cada familia nos dois razoes (movimentos x '
  'conta_corrente). Insumo da decisao sobre qual e a fonte da verdade. '
  'Enquanto os dois existirem, toda linha marcada DIVERGEM e um numero que a '
  'operacao ve diferente dependendo da tela que abrir.';


-- ----------------------------------------------------------------------------
-- 2) Os eventos que foram gravados NOS DOIS razões
--
-- Casar por (data, valor, tipo) não é chave — é heurística. Serve para
-- dimensionar a duplicação, não para apagar nada automaticamente. A decisão
-- sobre o que fazer com cada par é humana.
--
-- O sufixo "migrado do controle anterior" é a pista mais confiável: foi
-- escrito pela migração de dados, e o par dele em `movimentos` é o original.
-- ----------------------------------------------------------------------------
create or replace view sureya_lancamentos_duplicados as
select l.familia_id,
       f.nome                       as familia,
       l.data,
       l.tipo::text                 as tipo,
       l.valor,
       l.descricao                  as descricao_conta_corrente,
       m.descricao                  as descricao_movimentos,
       l.origem::text               as origem_conta_corrente,
       m.origem::text               as origem_movimentos,
       (l.descricao like '%migrado do controle anterior%') as marcado_como_migrado
  from conta_corrente l
  join familias f on f.id = l.familia_id
  join clientes c on c.familia_id = l.familia_id
  join movimentos m
    on m.cliente_id = c.id
   and m.data       = l.data
   and m.valor      = l.valor
   and m.tipo::text = l.tipo::text
 where l.org_id = current_org_id()
 order by l.data;

comment on view sureya_lancamentos_duplicados is
  'Build 4: eventos que existem NOS DOIS razoes. Casamento por (data, valor, '
  'tipo) e heuristica, nao chave — serve para dimensionar, nao para apagar. '
  'Quem tem "migrado do controle anterior" na descricao veio da migracao de '
  'dados, e o par em `movimentos` e o original.';

commit;


-- ============================================================================
-- COMO USAR — as três perguntas que a decisão precisa responder
--
-- (a) QUEM É O DEVEDOR: a família ou a pessoa?
--     `conta_corrente` diz família; `movimentos` diz pessoa. A auditoria já
--     pergunta isso ("quem é devedor: pessoa ou família") e o produto já se
--     moveu: a 0049 criou `familias` e o cadastro cria uma família por pessoa
--     automaticamente (gatilho `sureya_familia_para_cliente`).
--
--         select * from sureya_divergencia_financeira;
--
--     Onde `linhas_movimentos` e `linhas_conta_corrente` forem ambos > 0, a
--     operação vê números diferentes dependendo da tela.
--
-- (b) QUANTO JÁ ESTÁ DUPLICADO?
--
--         select * from sureya_lancamentos_duplicados;
--
-- (c) O QUE A COBRANÇA ENXERGA HOJE?
--     `calcularSaldo()` lê `movimentos`. Compare com o razão novo:
--
--         select familia, saldo_movimentos as o_que_a_cobranca_ve,
--                saldo_conta_corrente as o_que_a_ficha_mostra, situacao
--           from sureya_divergencia_financeira
--          where situacao <> 'iguais';
--
-- ----------------------------------------------------------------------------
-- RECOMENDAÇÃO (a decisão continua sendo da responsável)
--
-- `conta_corrente` como fonte da verdade, `movimentos` congelado como legado:
--
--   · o grão certo é a família — é como a operação fala ("a família Silva
--     está devendo"), é o que o cadastro cria sozinho, e é o que a competência
--     precisa para fechar o mês;
--   · `conta_corrente` tem `competencia`, que `movimentos` não tem — e sem
--     competência não existe fechamento de mês;
--   · é para onde a atividade recente foi (6 linhas contra 2);
--   · a migração de dados já foi tentada uma vez nessa direção, como o sufixo
--     "migrado do controle anterior" registra.
--
-- O que essa escolha custa: `calcularSaldo()` e os outros 14 arquivos que leem
-- `movimentos` precisam passar a ler `conta_corrente`. É trabalho conhecido e
-- mecânico — e é o único jeito de a régua de cobrança parar de ignorar dívida
-- registrada no razão novo.
--
-- O que NÃO fazer: manter os dois e "somar quando precisar". Hoje nenhum
-- código soma os dois (conferido arquivo por arquivo), e é isso que impede o
-- saldo de dobrar. Basta alguém somar uma vez para a família ser cobrada em
-- dobro por uma limpeza só.
-- ============================================================================
