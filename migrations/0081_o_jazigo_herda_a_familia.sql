-- ============================================================================
-- SUREYA — 0081 · O JAZIGO HERDA A FAMÍLIA DE QUEM É DELE
--
-- ACHADO ÀS VÉSPERAS DA IMPORTAÇÃO EM MASSA — e é bom que tenha sido antes.
--
-- O QUE ACONTECE HOJE
-- ---------------------------------------------------------------------------
-- `api/tumulos/importar` cria o jazigo assim:
--
--     insert into tumulos (org_id, quadra_id, cliente_id, identificacao, ...)
--
-- Sem `familia_id`. E **nenhum gatilho preenche** — conferido em produção: os
-- únicos gatilhos de `tumulos` são o que herda o cemitério e o de `updated_at`.
--
-- O cliente ganha família sozinho (`sureya_familia_para_cliente`, da 0049). O
-- jazigo não. E desde o Build 4 o sistema inteiro é no grão da FAMÍLIA.
--
-- O ESTRAGO, REPRODUZIDO EM BANCO LIMPO
-- ---------------------------------------------------------------------------
-- Importei um jazigo pelo caminho exato da rota e mandei a Nina concluir a
-- lavagem:
--
--     a conclusao FALHOU: null value in column "familia_id" of relation
--                         "conta_corrente" violates not-null constraint
--     razao da familia:   0 linha(s), R$ 0
--     servico executado:  0
--
-- **A lavagem não acontece.** Não é "a cobrança falha e o resto segue": a
-- transação inteira desfaz. A pessoa de campo toca em concluir, recebe um erro
-- que não diz nada para ela, e não fica registro de nada — nem a foto.
--
-- E a conferência de cadastro (0080) procura jazigo por `familia_id`, então
-- esse jazigo também apareceria como "família sem jazigo cadastrado", mesmo com
-- o jazigo ali.
--
-- Hoje isso não morde porque os 57 jazigos com dono vieram pela tela, que
-- preenche os dois campos. A importação da carteira inteira — que é o próximo
-- passo do piloto — entraria toda pelo caminho quebrado.
--
-- POR QUE GATILHO E NÃO CONSERTO NA ROTA
-- ---------------------------------------------------------------------------
-- Consertar a rota tapa uma porta. São pelo menos três que criam jazigo
-- (importar, vincular-lote, o cadastro do campo), e nada impede a quarta. A
-- regra é do dado, não da tela: **jazigo com dono pertence à família do dono.**
-- No banco ela vale para todas as portas, inclusive as que ainda não existem.
-- ============================================================================

begin;

create or replace function public.sureya_jazigo_herda_familia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_fam uuid;
begin
  if new.cliente_id is null then
    return new;
  end if;

  select c.familia_id into v_fam from clientes c where c.id = new.cliente_id;

  if new.familia_id is null then
    -- O caso da importacao: veio so o dono, a familia se deduz dele.
    new.familia_id := v_fam;

  elsif tg_op = 'UPDATE'
        and new.cliente_id is distinct from old.cliente_id
        and v_fam is not null
        and new.familia_id = old.familia_id then
    -- O JAZIGO MUDOU DE DONO E A FAMILIA NAO FOI MEXIDA JUNTO.
    --
    -- `cliente_id` e `familia_id` discordando nunca esta certo: significa que o
    -- dinheiro do jazigo vai para uma familia e a pessoa responsavel e de
    -- outra. Conferido em producao: hoje sao ZERO linhas assim, e a ideia e que
    -- continue zero.
    --
    -- So corrige quando `familia_id` NAO foi tocado na mesma alteracao — se
    -- alguem mudou os dois de proposito, a escolha dessa pessoa vale.
    new.familia_id := v_fam;
  end if;

  return new;
end
$function$;

comment on function public.sureya_jazigo_herda_familia is
  'Jazigo com dono pertence a familia do dono. A regra e do dado, nao da tela: '
  'sao tres portas que criam jazigo e nada impede a quarta.';

revoke execute on function public.sureya_jazigo_herda_familia() from public, anon, authenticated;

drop trigger if exists trg_jazigo_herda_familia on tumulos;
create trigger trg_jazigo_herda_familia
  before insert or update of cliente_id, familia_id on tumulos
  for each row
  execute function public.sureya_jazigo_herda_familia();


-- ----------------------------------------------------------------------------
-- Reparo do que já estiver assim
--
-- Em produção, hoje: zero linhas. O `update` fica porque outros ambientes
-- (e qualquer importação feita antes desta migration) podem ter.
-- ----------------------------------------------------------------------------
update tumulos t
   set familia_id = c.familia_id
  from clientes c
 where c.id = t.cliente_id
   and t.familia_id is null
   and c.familia_id is not null;

commit;


-- ============================================================================
-- CONFERÊNCIA
--
--   -- nenhum jazigo com dono e sem familia
--   select count(*) from tumulos
--    where cliente_id is not null and familia_id is null;          -- 0
--
--   -- e nenhum discordando do dono
--   select count(*) from tumulos t join clientes c on c.id = t.cliente_id
--    where t.familia_id is distinct from c.familia_id;             -- 0
--
-- ROLLBACK
--   `drop trigger trg_jazigo_herda_familia on tumulos;` — mas o rollback traz
--   de volta o jazigo importado sem familia, e com ele a lavagem que falha
--   inteira. Nao reverta sem consertar as tres rotas antes.
-- ============================================================================
