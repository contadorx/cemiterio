-- ============================================================================
-- SUREYA — 0072 · O ESPELHO TAMBÉM PRECISA DESFAZER
--
-- CORRIGE UM BURACO ABERTO PELA PRÓPRIA 0071.
--
-- O QUE ESTAVA ERRADO
-- ---------------------------------------------------------------------------
-- A 0071 espelhou `movimentos` → `conta_corrente` em dois eventos:
--
--     after insert                 → cria a linha espelhada
--     after update of status_conc  → acompanha a conferência
--
-- Faltou o terceiro: **apagar**. E doze funções escrevem em `movimentos`,
-- três delas apagando:
--
--     sureya_excluir_servico          delete ... where servico_id = ...
--     sureya_desidentificar_entrada   delete ... where id = v_mov
--     sureya_saldo_abertura           delete a abertura anterior, insere a nova
--
-- Como `movimento_id` foi criada com `on delete set null`, apagar o movimento
-- não apagava o espelho: só desligava o vínculo. A linha ficava em
-- `conta_corrente` indistinguível de um lançamento nativo — e continuava
-- pesando no saldo da família.
--
-- REPRODUZIDO EM BANCO LIMPO, COM A TRILHA INTEIRA APLICADA
-- ---------------------------------------------------------------------------
-- (1) Débito de 100,00, depois apagado:
--
--       depois do insert   movimentos 1   conta_corrente 1   saldo −100,00
--       DEPOIS DO DELETE   movimentos 0   conta_corrente 1   saldo −100,00
--
--     Dívida fantasma: o lançamento não existe mais e a família continua
--     devendo.
--
-- (2) `sureya_saldo_abertura` — a casa digita 500,00 e corrige para 300,00.
--     A função apaga a abertura anterior e insere a nova:
--
--       razão antigo (movimentos)       −300,00   ← certo
--       razão da família (conta_corrente) −800,00 ← as duas somadas
--
--     Cobrança de 800,00 sobre uma dívida de 300,00. E como as leituras já
--     migraram, é o 800,00 que aparece na ficha.
--
-- POR QUE `on delete cascade` E NÃO UM GATILHO
-- ---------------------------------------------------------------------------
-- Um gatilho `before delete` funcionaria, mas a integridade referencial já
-- resolve isso de forma declarativa e sem depender de ordem de execução — e
-- ordem de gatilho contra ação de chave estrangeira é exatamente o tipo de
-- detalhe que passa despercebido numa revisão.
--
-- `cascade` diz o que é verdade: a linha espelhada **não tem vida própria**.
-- Ela existe porque um movimento existe. Sumindo a origem, some o espelho.
--
-- Lançamento nascido direto em `conta_corrente` tem `movimento_id` nulo e não
-- é tocado por nada disto.
--
-- E A CORREÇÃO DE VALOR?
-- ---------------------------------------------------------------------------
-- O gatilho de update só olhava `status_conc`. Hoje nenhuma função corrige
-- `valor` de um movimento — mas o dia em que uma corrigir, o espelho ficaria
-- com o valor velho, calado. Aqui ele passa a acompanhar valor, tipo, data e
-- descrição também.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Apagar o movimento apaga o espelho
-- ----------------------------------------------------------------------------
alter table conta_corrente
  drop constraint if exists conta_corrente_movimento_id_fkey;

alter table conta_corrente
  add constraint conta_corrente_movimento_id_fkey
  foreign key (movimento_id) references movimentos(id) on delete cascade;

comment on column conta_corrente.movimento_id is
  'Espelho: aponta para a linha de `movimentos` que originou esta. '
  'ON DELETE CASCADE de proposito — linha espelhada nao tem vida propria. '
  'Lancamento nascido direto em conta_corrente tem este campo nulo.';


-- ----------------------------------------------------------------------------
-- 2) O espelho acompanha a correção, não só a conferência
-- ----------------------------------------------------------------------------
create or replace function public.sureya_espelha_status_movimento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update conta_corrente
     set status_conc = new.status_conc,
         tipo        = new.tipo::text::sureya_tipo_lancamento,
         valor       = new.valor,
         data        = new.data,
         descricao   = new.descricao
   where movimento_id = new.id
     and (status_conc is distinct from new.status_conc
       or valor       is distinct from new.valor
       or data        is distinct from new.data
       or descricao   is distinct from new.descricao
       or tipo::text  is distinct from new.tipo::text);
  return new;
end
$function$;

revoke execute on function public.sureya_espelha_status_movimento() from public, anon, authenticated;

drop trigger if exists trg_espelha_status_movimento on movimentos;
create trigger trg_espelha_status_movimento
  after update of status_conc, valor, data, descricao, tipo on movimentos
  for each row
  execute function public.sureya_espelha_status_movimento();


-- ----------------------------------------------------------------------------
-- 3) Reparar o que já tenha ficado órfão
--
-- Entre a 0071 entrar em produção e esta correção, qualquer chamada às três
-- funções que apagam pode ter deixado espelho para trás. Órfão desse tipo é
-- reconhecível: `movimento_id` nulo (o `set null` da chave antiga apagou o
-- vínculo) e nenhum lançamento nativo com aquela cara.
--
-- NÃO APAGA NADA AUTOMATICAMENTE. Apagar linha de dinheiro por heurística é
-- pior que a doença. A view lista os candidatos para conferência humana.
-- ----------------------------------------------------------------------------
create or replace view sureya_espelhos_orfaos as
select l.id,
       l.familia_id,
       f.nome as familia,
       l.data,
       l.tipo::text   as tipo,
       l.valor,
       l.origem::text as origem,
       l.descricao,
       l.servico_id,
       case
         when l.servico_id is not null and not exists
              (select 1 from servicos s where s.id = l.servico_id)
           then 'o servico que originou esta linha nao existe mais'
         when l.descricao like 'Saldo de abertura%'
          and (select count(*) from conta_corrente x
                where x.familia_id = l.familia_id
                  and x.descricao like 'Saldo de abertura%') > 1
           then 'ha mais de um saldo de abertura para esta familia'
         else 'sem sinal de orfandade'
       end as suspeita
  from conta_corrente l
  join familias f on f.id = l.familia_id
 where l.org_id = current_org_id()
   and l.movimento_id is null
   and (
     (l.servico_id is not null and not exists
        (select 1 from servicos s where s.id = l.servico_id))
     or (l.descricao like 'Saldo de abertura%'
         and (select count(*) from conta_corrente x
               where x.familia_id = l.familia_id
                 and x.descricao like 'Saldo de abertura%') > 1)
   );

comment on view sureya_espelhos_orfaos is
  'Build 4: linhas de conta_corrente que parecem espelho abandonado — o '
  'movimento de origem foi apagado enquanto a chave ainda era ON DELETE SET '
  'NULL (antes da 0072). Nao apaga nada: e lista para conferencia humana, '
  'porque apagar linha de dinheiro por heuristica e pior que o problema.';

commit;


-- ============================================================================
-- CONFERÊNCIA DEPOIS DE RODAR
--
--   -- a chave tem de estar em CASCADE
--   select confdeltype from pg_constraint
--    where conname = 'conta_corrente_movimento_id_fkey';       -- 'c' = cascade
--
--   -- nenhum espelho abandonado (hoje: vazia)
--   select * from sureya_espelhos_orfaos;
--
-- ROLLBACK
--   Voltar a chave para `on delete set null` e recriar a 0071 do gatilho de
--   status. Mas o rollback traz o buraco de volta: apagar movimento volta a
--   deixar divida fantasma no razao da familia.
-- ============================================================================
