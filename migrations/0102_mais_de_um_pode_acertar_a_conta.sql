-- 0102 — MAIS DE UM PODE ACERTAR A CONTA
--
-- O PEDIDO
--   "mantenha somente os contatos da familia, pois nele consigo indicar o
--    contato financeiro, permita um ou mais contatos financeiros"
--
-- O QUE IMPEDIA
--   A tela ja tinha o botao e a rota ja aceitava `acertaConta`, mas a segunda
--   marcacao morria no banco:
--
--     CREATE UNIQUE INDEX idx_familia_um_responsavel
--       ON clientes (familia_id) WHERE responsavel_financeiro = true;
--
--   Um indice UNICO parcial: no maximo uma pessoa por familia com a marca.
--   O erro apareceria como violacao de chave — nada a ver com o que a Sureya
--   tentou fazer. O limite estava a uma camada de distancia da tela.
--
-- AS DUAS PERGUNTAS QUE ESTAVAM COLADAS
--   Este indice existia de quando havia UMA pergunta so. Hoje sao duas:
--
--     familias.responsavel_id       QUEM RESPONDE pela familia — o titular.
--                                   E um. Aparece no cabecalho, e quem recebe
--                                   a cobranca, tem historico com data (0091).
--
--     clientes.responsavel_financeiro   QUEM PODE ACERTAR A CONTA. Podem ser
--                                   varios: o filho que paga um mes, a filha
--                                   que paga o outro, o genro que resolve o
--                                   Pix. Todos legitimos, nenhum deles vira
--                                   "o responsavel" por isso.
--
--   Este arquivo separa as duas. O titular continua sendo um — nada aqui mexe
--   em `responsavel_id`.
--
-- QUEM LIA A MARCA, E POR QUE CADA UM SOBREVIVE A VARIOS
--   sureya_familias_sem_responsavel  NOT EXISTS — pergunta "tem ao menos um?"
--   sureya_alertas                   NOT EXISTS — idem
--   sureya_concluir_lavagem          so desempate de ORDER BY, com limit 1
--   sureya_familia_para_cliente      marca a primeira pessoa; segue valendo
--   sureya_conferencia_cadastro      le `familias.responsavel_id`, nao a marca
--   sureya_definir_responsavel_interno   APAGAVA a marca de todos. Corrigido
--                                        abaixo — era o unico que quebrava.
--
-- MEDIDO ANTES (producao, 2026-08-23)
--   365 familias · 341 marcados · 0 familias com mais de um marcado
--   0 titulares sem a marca · 0 familias com gente e sem ninguem marcado
--   0 familias cujo marcado e diferente do titular
--   Dado limpo: nao ha o que consertar, so o que liberar.

begin;

-- ---------------------------------------------------------------------------
-- 1. O TETO DE UM CAI. O INDICE FICA.
-- ---------------------------------------------------------------------------
-- O indice nao existia so para proibir: ele tambem e o que faz
-- "quem acerta a conta desta familia?" nao varrer a tabela inteira. Sai o
-- UNIQUE, fica o indice.
drop index if exists idx_familia_um_responsavel;

create index if not exists idx_familia_quem_acerta_conta
  on clientes (familia_id)
  where responsavel_financeiro = true;

-- ---------------------------------------------------------------------------
-- 2. TROCAR O TITULAR NAO APAGA MAIS QUEM PAGA
-- ---------------------------------------------------------------------------
-- A versao velha limpava a marca de TODOS antes de marcar o novo titular —
-- ela precisava, porque o indice unico recusaria os dois ao mesmo tempo.
--
-- Sem o unique, essa limpeza deixa de ser necessaria e passa a ser um
-- estrago: a Sureya marca tres filhos como quem acerta a conta, troca o
-- titular por qualquer motivo, e os tres perdem a marca sem que ninguem
-- tenha pedido. Some trabalho de cadastro numa operacao que nao era sobre
-- isso.
--
-- A regra nova: o titular E, por definicao, alguem que acerta a conta —
-- entao ele ENTRA na lista. Ninguem sai dela.
create or replace function public.sureya_definir_responsavel_interno(
  p_org uuid, p_familia uuid, p_cliente uuid default null, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := p_org;
  v_ja  uuid;
begin
  -- O contato tem de ser DESTA familia: um id errado colado no lugar faria a
  -- cobranca de uma familia apontar para a pessoa de outra.
  if p_cliente is not null then
    perform 1 from clientes where id = p_cliente and org_id = v_org and familia_id = p_familia;
    if not found then
      raise exception 'contato_nao_e_desta_familia' using errcode = '23514';
    end if;
  end if;

  select responsavel_id into v_ja from familias where id = p_familia and org_id = v_org;
  if not found then
    raise exception 'familia_nao_encontrada' using errcode = '42501';
  end if;

  -- Convergente: repor o mesmo contato nao escreve troca nenhuma.
  if v_ja is not distinct from p_cliente then return; end if;

  -- SOMA, NAO SUBSTITUI (0102). O titular passa a acertar a conta; quem ja
  -- acertava continua acertando. Antes daqui havia um `update ... set
  -- responsavel_financeiro = false` em toda a familia, exigido pelo indice
  -- unico que este arquivo derrubou.
  if p_cliente is not null then
    update clientes set responsavel_financeiro = true
     where id = p_cliente and not responsavel_financeiro;
  end if;

  update familias set responsavel_id = p_cliente, updated_at = now()
   where id = p_familia and org_id = v_org;

  -- O jazigo segue a familia: cliente_id no tumulo passa a ser campo derivado.
  update tumulos set cliente_id = p_cliente
   where familia_id = p_familia and org_id = v_org and cliente_id is distinct from p_cliente;

  insert into familia_responsavel_log (org_id, familia_id, cliente_id, por, motivo)
  values (v_org, p_familia, p_cliente, auth.uid(), nullif(btrim(coalesce(p_motivo,'')), ''));
end $function$;

-- ---------------------------------------------------------------------------
-- 3. ZERO CONTINUA SENDO PROIBIDO
-- ---------------------------------------------------------------------------
-- O teto saiu; o PISO fica. `sureya_alertas` e `sureya_familias_sem_responsavel`
-- perguntam "existe ao menos um?" — uma familia com gente e sem ninguem que
-- acerte a conta e uma familia que a cobranca nao sabe cobrar.
--
-- Antes, o piso vinha de graca: como so podia haver um, desmarca-lo era uma
-- troca, nunca um esvaziamento. Com varios, desmarcar o ultimo passa a ser
-- possivel — e e exatamente o clique que ninguem quer dar sem perceber.
--
-- Recusa em vez de corrigir sozinho: escolher um substituto seria adivinhar
-- quem paga, e essa e a pergunta que a Sureya esta respondendo.
create or replace function public.sureya_guarda_quem_acerta_a_conta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- So olha o clique que TIRA a marca de alguem que continua na familia.
  if old.responsavel_financeiro and not new.responsavel_financeiro
     and new.familia_id is not null then

    if not exists (select 1 from clientes c
                    where c.familia_id = new.familia_id
                      and c.id <> new.id
                      and c.responsavel_financeiro) then
      raise exception 'familia_ficaria_sem_quem_acerta_a_conta'
        using errcode = '23514',
              hint = 'Marque outra pessoa antes de tirar esta.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guarda_quem_acerta_a_conta on clientes;
create trigger trg_guarda_quem_acerta_a_conta
  before update of responsavel_financeiro on clientes
  for each row
  execute function public.sureya_guarda_quem_acerta_a_conta();

commit;
