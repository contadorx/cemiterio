-- ============================================================================
-- SUREYA — 0071 · BUILD 4 · A DÍVIDA É DA FAMÍLIA
--
-- Rodar DEPOIS da 0069 e da 0070.
--
-- A DECISÃO (tomada pela responsável em 22/08/2026)
-- ---------------------------------------------------------------------------
--     "É a família, mas sempre tem um responsável financeiro."
--
-- Duas afirmações, e as duas viram regra:
--
--   1. O SALDO É DA FAMÍLIA.  `conta_corrente` passa a ser a fonte da verdade.
--      `movimentos` vira legado — continua sendo escrito por ora, mas ninguém
--      mais calcula saldo a partir dele.
--
--   2. TODA FAMÍLIA TEM UM RESPONSÁVEL.  Ele não é quem *deve* — é quem
--      *responde*: para quem a cobrança vai, quem assina o combinado. A dívida
--      continua sendo da família mesmo que o responsável mude.
--
-- Isso resolve o que a AUDITORIA_GOLIVE deixou em aberto ("quem é devedor:
-- pessoa ou família") e o que a 0070 mediu: a Família Anninha devia 240,00 no
-- razão novo e a cobrança automática não a enxergava, porque `calcularSaldo()`
-- lia o antigo.
--
-- O QUE ESTA MIGRATION FAZ
-- ---------------------------------------------------------------------------
-- Não apaga nada e não move dinheiro. Ela:
--   · dá a `conta_corrente` as duas colunas que faltavam para ser a verdade;
--   · liga `movimentos` a `conta_corrente` por um espelho, para nada do que
--     ainda escreve no razão antigo se perder;
--   · torna o invariante do responsável verificável.
--
-- O espelho é o mesmo recurso da 0058 (`planos` → `tumulos`) e pelo mesmo
-- motivo: são 15 arquivos escrevendo em `movimentos`. Corrigir os 15 de uma vez
-- é arriscado; um gatilho fecha a classe inteira e dá tempo de migrar cada um
-- com calma.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) `status_conc` — o "a conferir" precisa existir no razão novo
--
-- `movimentos` distingue três estados: `a_conferir`, `confirmado`, `rejeitado`.
-- É como um Pix informado pela família entra sem virar saldo até alguém bater
-- com o extrato. `conta_corrente` não tinha esse conceito.
--
-- Sem esta coluna, mudar o cálculo de saldo de razão faria todo comprovante
-- não conferido virar dinheiro na hora — exatamente o que a conferência existe
-- para impedir.
--
-- Default `confirmado`: as seis linhas que já existem foram lançadas à mão pela
-- administração, e lançamento manual nasce conferido.
-- ----------------------------------------------------------------------------
alter table conta_corrente
  add column if not exists status_conc sureya_status_conc not null default 'confirmado';

comment on column conta_corrente.status_conc is
  'a_conferir = informado, ainda nao bateu com o extrato (nao entra no saldo). '
  'confirmado = vale. rejeitado = descartado. Mesmo significado que em '
  '`movimentos`, trazido junto com a decisao de 22/08: o saldo e da familia.';

create index if not exists idx_conta_corrente_saldo
  on conta_corrente (org_id, familia_id)
  where status_conc = 'confirmado';


-- ----------------------------------------------------------------------------
-- 2) `movimento_id` — a chave do espelho
--
-- Sem ela, "já espelhei este lançamento?" só teria resposta por heurística
-- (data + valor + tipo), e heurística não serve como chave de idempotência: a
-- família que paga R$ 40 duas vezes no mesmo dia teria o segundo pagamento
-- descartado como duplicata.
-- ----------------------------------------------------------------------------
alter table conta_corrente
  add column if not exists movimento_id uuid references movimentos(id) on delete set null;

create unique index if not exists uq_conta_corrente_movimento
  on conta_corrente (movimento_id) where movimento_id is not null;

comment on column conta_corrente.movimento_id is
  'Lancamento de origem em `movimentos`, quando veio pelo espelho. Nulo = '
  'nasceu direto no razao novo. E a chave que impede espelhar duas vezes.';


-- ----------------------------------------------------------------------------
-- 3) Casar o que JÁ foi duplicado, antes de ligar o espelho
--
-- A 0070 mostrou dois eventos gravados nas duas tabelas, com o sufixo
-- "migrado do controle anterior" na cópia. Sem casar esses pares primeiro, o
-- backfill do passo 4 os inseriria uma terceira vez.
--
-- O casamento por (família, data, valor, tipo) é heurística — e aqui é seguro
-- porque está restrito às linhas que a própria migração de dados marcou.
-- ----------------------------------------------------------------------------
update conta_corrente l
   set movimento_id = m.id
  from movimentos m
  join clientes c on c.id = m.cliente_id
 where l.movimento_id is null
   and l.descricao like '%migrado do controle anterior%'
   and c.familia_id  = l.familia_id
   and m.data        = l.data
   and m.valor       = l.valor
   and m.tipo::text  = l.tipo::text;


-- ----------------------------------------------------------------------------
-- 4) O espelho: `movimentos` → `conta_corrente`
--
-- Direção única, como na 0058. `conta_corrente` nunca escreve de volta em
-- `movimentos` — isso criaria laço e, pior, ressuscitaria o razão que está
-- sendo aposentado.
--
-- O mapeamento de `origem` é explícito porque os dois enums são diferentes:
--
--     sureya_origem_movimento    -> sureya_origem_lancamento
--     servico                    -> lavagem
--     pix_comprovante            -> pagamento
--     conciliacao_manual         -> pagamento
--     psp_auto                   -> pagamento
--     ajuste                     -> ajuste
-- ----------------------------------------------------------------------------
create or replace function public.sureya_espelha_movimento_na_conta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_familia uuid;
begin
  select c.familia_id into v_familia from clientes c where c.id = new.cliente_id;
  if v_familia is null then
    -- Movimento sem família não tem onde entrar no razão novo. Hoje isso não
    -- acontece (conferido: zero movimentos órfãos), e se passar a acontecer é
    -- sinal de cadastro incompleto — não de erro deste gatilho.
    return new;
  end if;

  insert into conta_corrente (
    org_id, familia_id, tumulo_id, servico_id, movimento_id,
    tipo, origem, competencia, valor, descricao, comprovante_id, data, status_conc
  )
  select new.org_id,
         v_familia,
         s.tumulo_id,
         new.servico_id,
         new.id,
         new.tipo::text::sureya_tipo_lancamento,
         (case new.origem::text
            when 'servico'            then 'lavagem'
            when 'pix_comprovante'    then 'pagamento'
            when 'conciliacao_manual' then 'pagamento'
            when 'psp_auto'           then 'pagamento'
            else 'ajuste'
          end)::sureya_origem_lancamento,
         null,
         new.valor,
         new.descricao,
         new.comprovante_id,
         new.data,
         new.status_conc
    from (select 1) _
    left join servicos s on s.id = new.servico_id
  on conflict do nothing;

  return new;
end
$function$;

comment on function public.sureya_espelha_movimento_na_conta() is
  'Espelha `movimentos` para `conta_corrente` (migration 0071). Existe porque a '
  'decisao de 22/08 fez `conta_corrente` a fonte da verdade e 15 arquivos ainda '
  'escrevem no razao antigo. Direcao unica. Sai quando os 15 migrarem.';

revoke execute on function public.sureya_espelha_movimento_na_conta() from public, anon, authenticated;

drop trigger if exists trg_espelha_movimento_na_conta on movimentos;
create trigger trg_espelha_movimento_na_conta
  after insert on movimentos
  for each row
  execute function public.sureya_espelha_movimento_na_conta();

-- Mudança de status também precisa chegar: um comprovante que sai de
-- `a_conferir` para `confirmado` vira saldo, e o razão novo tem de saber.
create or replace function public.sureya_espelha_status_movimento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update conta_corrente set status_conc = new.status_conc
   where movimento_id = new.id and status_conc is distinct from new.status_conc;
  return new;
end
$function$;

revoke execute on function public.sureya_espelha_status_movimento() from public, anon, authenticated;

drop trigger if exists trg_espelha_status_movimento on movimentos;
create trigger trg_espelha_status_movimento
  after update of status_conc on movimentos
  for each row
  execute function public.sureya_espelha_status_movimento();


-- ----------------------------------------------------------------------------
-- 5) Trazer o que já está em `movimentos` e ainda não chegou
-- ----------------------------------------------------------------------------
insert into conta_corrente (
  org_id, familia_id, tumulo_id, servico_id, movimento_id,
  tipo, origem, competencia, valor, descricao, comprovante_id, data, status_conc
)
select m.org_id, c.familia_id, s.tumulo_id, m.servico_id, m.id,
       m.tipo::text::sureya_tipo_lancamento,
       (case m.origem::text
          when 'servico'            then 'lavagem'
          when 'pix_comprovante'    then 'pagamento'
          when 'conciliacao_manual' then 'pagamento'
          when 'psp_auto'           then 'pagamento'
          else 'ajuste'
        end)::sureya_origem_lancamento,
       null, m.valor, m.descricao, m.comprovante_id, m.data, m.status_conc
  from movimentos m
  join clientes c on c.id = m.cliente_id
  left join servicos s on s.id = m.servico_id
 where c.familia_id is not null
   and not exists (select 1 from conta_corrente l where l.movimento_id = m.id)
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- 6) O invariante do responsável, verificável
--
-- `idx_familia_um_responsavel` já garante NO MÁXIMO um por família. Falta o
-- outro lado — PELO MENOS um — e esse não dá para exigir com constraint: a
-- família nasce antes da pessoa, e um `not null` aqui quebraria o cadastro.
--
-- Então vira view de conferência. Hoje ela volta vazia (298 famílias, zero sem
-- responsável); o valor está em avisar no dia em que deixar de voltar.
-- ----------------------------------------------------------------------------
create or replace view sureya_familias_sem_responsavel as
select f.id as familia_id,
       f.nome as familia,
       (select count(*) from clientes c where c.familia_id = f.id) as pessoas,
       (select coalesce(sum(case when l.tipo::text = 'credito' then l.valor
                                 else -l.valor end), 0)
          from conta_corrente l
         where l.familia_id = f.id and l.status_conc = 'confirmado')  as saldo
  from familias f
 where f.org_id = current_org_id()
   and not exists (select 1 from clientes c
                    where c.familia_id = f.id and c.responsavel_financeiro)
 order by saldo;

comment on view sureya_familias_sem_responsavel is
  'Build 4: familias sem responsavel financeiro. A decisao de 22/08 diz que '
  'sempre tem um — esta view e como se sabe que continua verdade. Familia com '
  'saldo negativo aqui e divida sem ninguem a quem cobrar.';

commit;


-- ============================================================================
-- CONFERÊNCIA
--
-- (a) A divergência foi a zero?
--     select * from sureya_divergencia_financeira where situacao <> 'iguais';
--     → depois desta migration, `só no razão antigo` tem de sumir. O que
--       sobrar como `só no razão novo` está certo: é lançamento que nasceu
--       direto no razão da família e nunca existiu no antigo.
--
-- (b) Nada foi duplicado?
--     select count(*) from conta_corrente;
--     → antes: 6. Depois: 6 + (movimentos ainda não espelhados). Com os dois
--       pares "migrado do controle anterior" já casados no passo 3, o
--       acréscimo esperado é ZERO — os dois movimentos existentes já têm par.
--
-- (c) O espelho funciona daqui para frente? (em HOMOLOGAÇÃO)
--     insert into movimentos (org_id, cliente_id, tipo, valor, origem,
--                             status_conc, descricao, data)
--     values (current_org_id(), '<cliente>', 'credito', 10, 'ajuste',
--             'confirmado', 'teste do espelho', current_date);
--     select * from conta_corrente where descricao = 'teste do espelho';
--     → uma linha, com `movimento_id` preenchido.
--
-- (d) Toda família tem responsável?
--     select * from sureya_familias_sem_responsavel;
--     → tem de voltar vazia.
--
-- ----------------------------------------------------------------------------
-- O QUE ESTA MIGRATION **NÃO** DECIDE — e precisa de você
--
-- `familias.modo_cobranca` separa dois mundos:
--     'consumo'      cada lavagem vira dívida
--     'competencia'  o mês inteiro vira dívida, e a lavagem é só registro
--
-- Hoje `sureya_concluir_lavagem` (0066) lança débito em `movimentos` **sempre**
-- (exceto pré-pago), e grava em `conta_corrente` uma linha de valor ZERO como
-- marcador. Com o espelho ligado, o débito real chega no razão novo — e no modo
-- `competencia` ele vai SOMAR com o lançamento do mês.
--
-- Isso ainda não acontece: das 298 famílias, 3 têm contrato e nenhuma
-- competência foi lançada (`conta_corrente` tem 0 linhas com origem
-- 'competencia'). Mas acontece no dia em que o fechamento de mês rodar.
--
-- A pergunta: **no modo `competencia`, a lavagem deve gerar débito?**
-- Minha leitura do código diz que não — o comentário da 0066 escreve isso com
-- todas as letras ("quem gera a dívida é a competência; se a lavagem também
-- lançasse valor, a família seria cobrada duas vezes"). Mas quem decide é você,
-- e a correção é de uma linha na 0066.
-- ============================================================================
