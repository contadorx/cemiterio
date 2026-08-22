-- ============================================================================
-- SUREYA — 0058 · O PLANO VOLTA A CHEGAR NO JAZIGO
--
-- GRAVIDADE: P0. Rodar DEPOIS da 0052 (que cria `tumulos.proximo_servico`).
--
-- O PROBLEMA, AGORA COM O CÓDIGO DAS FUNÇÕES NA MÃO
-- ---------------------------------------------------------------------------
-- A migration 0049 mudou o contrato de `planos` para `tumulos`, e `src/lib/*`
-- foi junto. Mas a extração do banco mostrou que **o lado de escrita ficou em
-- `planos`** — e não em um lugar só:
--
--   sureya_lead_vira_cliente         insert into planos (...)
--   sureya_reagenda_apos_execucao    update planos set proximo_servico   ← gatilho
--   sureya_remarcar_servico          update planos set proximo_servico
--   sureya_pular_servico             update planos set proximo_servico
--   sureya_aplicar_reajuste          update planos set valor_vigente
--   sureya_adiar_reajuste            update planos set reajuste_adiado_ate
--
-- E do lado da aplicação, o mesmo:
--   POST /api/planos                 insert into planos, sem tocar em tumulos
--   /api/tumulos/importar            idem
--
-- Enquanto isso, quem PLANEJA a agenda lê `tumulos`:
--   src/lib/agenda.ts:207   select ... from tumulos where contratado
--
-- As duas metades voltaram a se desencontrar. É literalmente o bug que o
-- comentário do `agenda.ts` descreve como já resolvido:
--
--     "A Sureya configurava 'limpa toda semana', o valor entrava na conta
--      corrente — e a Nina nunca recebia o serviço."
--
-- O que ele não previu foi a volta pela outra porta: o contrato continua sendo
-- ESCRITO em `planos` por seis funções e duas rotas.
--
-- CONSEQUÊNCIAS CONCRETAS
--   · lead convertido cria plano e NUNCA entra na agenda (104 leads no banco);
--   · concluir uma lavagem avança o ponteiro em `planos` — a agenda, que lê
--     `tumulos`, não fica sabendo;
--   · remarcar e pular replanejam em `planos` e não mudam nada de fato;
--   · reajuste muda `planos.valor_vigente` e o valor cobrado sai de
--     `tumulos.valor_lavagem`.
--
-- POR QUE UM GATILHO, E NÃO SEIS CORREÇÕES
-- ---------------------------------------------------------------------------
-- Corrigir função por função exigiria reemitir seis funções e duas rotas, e
-- deixaria a sétima — a que ninguém lembrou — quebrada do mesmo jeito. Um
-- gatilho em `planos` fecha a CLASSE inteira: qualquer escrita em `planos`,
-- venha de onde vier, chega no jazigo.
--
-- Isto NÃO decide qual tabela é a fonte da verdade. Essa decisão é do Build 4
-- ("resolver a convivência de `movimentos` e `conta_corrente`" — aqui é o
-- mesmo problema, aplicado ao contrato). Enquanto ela não vem, o espelho
-- impede que a divergência continue produzindo agenda vazia.
--
-- Direção única de propósito: `planos` → `tumulos`. O caminho contrário já
-- existe e funciona (`agenda.ts:296` avança `tumulos.proximo_servico` ao
-- gerar). Espelhar nos dois sentidos criaria laço de gatilho.
-- ============================================================================

begin;

create or replace function public.sureya_espelha_plano_no_jazigo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.tumulo_id is null then
    return new;
  end if;

  update tumulos t set
    -- `avulso` e `por_data` não entram na esteira automática: é a regra que a
    -- 0049 escreveu no comentário da coluna `contratado`.
    contratado = (coalesce(new.ativo, false)
                  and new.cadencia is not null
                  and new.cadencia::text not in ('avulso', 'por_data')),

    periodicidade = case
      when new.cadencia is not null and new.cadencia::text not in ('avulso','por_data')
      then new.cadencia
      else null
    end,

    proximo_servico = case
      when new.cadencia is not null and new.cadencia::text not in ('avulso','por_data')
      then new.proximo_servico
      else null
    end,

    -- Decisão da migration 0038: `valor_vigente` é o preço de UMA limpeza.
    -- `tumulos.valor_lavagem` guarda a mesma coisa, com o nome certo.
    valor_lavagem = coalesce(new.valor_vigente, new.valor_mensal, t.valor_lavagem)

  where t.id = new.tumulo_id
    and t.org_id = new.org_id;

  return new;
end
$function$;

comment on function public.sureya_espelha_plano_no_jazigo() is
  'Espelha o contrato de `planos` para `tumulos` (migration 0058). Existe '
  'porque a 0049 mudou a LEITURA do contrato para `tumulos` e deixou a '
  'ESCRITA em `planos`, em seis funções e duas rotas. Direção única.';

-- A 0057 roda ANTES desta migration, então o laço dela não alcançou esta
-- função. Sem estas duas linhas ela nasceria com o EXECUTE para PUBLIC que a
-- 0057 existe para eliminar — e o teste em banco limpo pegou exatamente isso.
-- Função de gatilho não se chama direto, mas privilégio pendurado nela só
-- serve para confundir quem for auditar depois.
revoke execute on function public.sureya_espelha_plano_no_jazigo() from public, anon, authenticated;

drop trigger if exists trg_espelha_plano_no_jazigo on planos;

create trigger trg_espelha_plano_no_jazigo
  after insert or update of cadencia, proximo_servico, valor_vigente, valor_mensal, ativo, tumulo_id
  on planos
  for each row
  execute function public.sureya_espelha_plano_no_jazigo();


-- ----------------------------------------------------------------------------
-- Uma passada para trazer o que já está em `planos`
--
-- `planos` tem 1 linha hoje, então isto encosta em quase nada. Existe pelo
-- ambiente de homologação, onde a tabela pode estar cheia, e para o caso de a
-- carteira antiga ser reimportada.
-- ----------------------------------------------------------------------------
update tumulos t set
  contratado      = true,
  periodicidade   = p.cadencia,
  proximo_servico = coalesce(t.proximo_servico, p.proximo_servico),
  valor_lavagem   = coalesce(t.valor_lavagem, p.valor_vigente, p.valor_mensal)
from planos p
where p.tumulo_id = t.id
  and p.org_id = t.org_id
  and p.ativo
  and p.cadencia is not null
  and p.cadencia::text not in ('avulso', 'por_data')
  and t.contratado is distinct from true;

commit;


-- ============================================================================
-- CONFERÊNCIA
--
-- (a) O espelho funciona? (num jazigo de teste, em HOMOLOGAÇÃO)
--     update planos set proximo_servico = current_date + 3 where id = '<plano>';
--     select contratado, periodicidade, proximo_servico, valor_lavagem
--       from tumulos where id = (select tumulo_id from planos where id = '<plano>');
--     → proximo_servico tem de ter acompanhado.
--
-- (b) Concluir uma lavagem passa a mover o jazigo?
--     O gatilho `sureya_reagenda_apos_execucao` escreve em `planos`; o desta
--     migration leva a `tumulos`. Marque um serviço como executado e confira
--     `tumulos.proximo_servico`.
--
--     RESSALVA: aquele gatilho só age quando `servicos.plano_id` não é nulo.
--     Com `planos` tendo 1 linha, quase todo serviço tem `plano_id` nulo — ele
--     não vai disparar. O caminho que realmente avança o ponteiro hoje é o
--     `agenda.ts:296`, ao gerar. Isto está registrado no BUILD_1.md como
--     pergunta aberta para o Build 4, não como resolvido.
--
-- (c) Nenhum laço de gatilho: `sureya_espelha_plano_no_jazigo` só escreve em
--     `tumulos`, e não existe gatilho em `tumulos` que escreva em `planos`.
--     Confirme:
--     select tgname, tgrelid::regclass from pg_trigger
--      where not tgisinternal and tgrelid = 'tumulos'::regclass;
-- ============================================================================
