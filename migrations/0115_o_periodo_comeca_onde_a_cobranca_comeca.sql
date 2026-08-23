-- 0115 — O PERÍODO COMEÇA ONDE A COBRANÇA COMEÇA
--
-- A PERGUNTA
--   "Analisa a Magda, ela pagou junho, pós, agora ele tem que lançar julho e
--    agosto e cobrar em setembro, veja se está certo no banco e no
--    comportamento."
--
--   Estava errado, e o erro era de modelo — o mesmo tipo de erro da 0114.
--
-- O QUE ESTAVA ERRADO
--   O cobrador derivava o período CONTANDO N MESES PARA TRÁS a partir de
--   `proxima_cobranca`. Com isso `proxima_cobranca` respondia por duas
--   perguntas ao mesmo tempo: *quando ela paga* e *que meses o pagamento
--   cobre*. Enquanto os dois coincidiram, ninguém viu.
--
--   Magda: paga em setembro, a cada 2 meses, começou a ser cobrada em julho.
--     contando para trás:  ago + set   ← não é o que foi combinado
--     o que foi combinado: jul + ago, pagos em setembro
--
--   Anninha: paga em dezembro, a cada 6, começou em julho.
--     contando para trás:  jul a dez   ← coincide, por acaso
--
--   Duas famílias, a mesma regra, e só uma das duas certa. O campo
--   `inicio_cobranca` — que a tela chama de "cobrar a partir de" e que a casa
--   preenche desde sempre — não era lido por ninguém.
--
-- O QUE PASSA A VALER
--   inicio_cobranca   ONDE O PERÍODO COMEÇA   (âncora, não se move)
--   proxima_cobranca  QUANDO ELA PAGA         (o vencimento das N linhas)
--   meses_entre_...   O TAMANHO DO PERÍODO
--
--   Só no PÓS-PAGO. No pré-pago não há pergunta: quem paga adiantado paga os
--   meses que vêm a partir da data em que paga, e o período começa ali.
--
--   O período do ciclo atual é `inicio_cobranca` deslocado pelos ciclos que já
--   fecharam — e quantos fecharam se lê do próprio razão, contando as
--   competências já lançadas para aquele túmulo. Sem campo novo, e
--   auto-corrigível: se a Sureya apagar um lançamento errado, a âncora anda de
--   volta sozinha.
--
--   As três leituras que a 0114 separou continuam de pé: a competência é o mês
--   prestado, `data` é o vencimento (agora sempre o de `proxima_cobranca`), e
--   inadimplência só olha o que já venceu.

begin;

drop function if exists public.sureya_cobrar_competencias(date, uuid, uuid);

create or replace function public.sureya_cobrar_competencias(
  p_ate date default null, p_org uuid default null, p_familia uuid default null)
returns table(lancados integer, valor_total numeric, tumulos_tocados integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_ate date; v_mes_ate date; v_dia_venc int; r record;
  v_lanc int := 0; v_total numeric := 0; v_toc int := 0;
  v_meses int; v_comp date; v_andou boolean; v_entrou int; v_ja int;
  v_ini date; v_fim date; v_mes date; v_venc date; v_rotulo text; v_tocou boolean;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using
      errcode = '42501',
      hint = 'Sem sessao do painel: passe p_org (e o cron sempre passa).';
  end if;
  v_ate := coalesce(p_ate, current_date);
  v_mes_ate := date_trunc('month', v_ate)::date;

  select coalesce(dia_vencimento, 10) into v_dia_venc from orgs where id = v_org;

  for r in
    select t.id, t.familia_id, t.valor_mensal, t.proxima_cobranca, t.identificacao,
           t.inicio_cobranca, t.meses_entre_cobrancas, t.cobranca_no_fim,
           f.freq_pagamento::text as freq
      from tumulos t
      join familias f on f.id = t.familia_id
     where t.org_id = v_org
       and t.contratado
       and t.familia_id is not null
       and coalesce(t.valor_mensal, 0) > 0
       and t.proxima_cobranca is not null
       and (p_familia is null or t.familia_id = p_familia)
       -- PÓS-PAGO ENTRA ANTES DE VENCER: os meses já prestados viram receita
       -- mesmo com a cobrança lá na frente (0114). Pré-pago só na data.
       and (t.cobranca_no_fim or t.proxima_cobranca <= v_ate)
  loop
    v_meses := coalesce(r.meses_entre_cobrancas, sureya_meses_da_cobranca(r.freq));
    v_comp  := date_trunc('month', r.proxima_cobranca)::date;
    v_tocou := false;
    v_andou := false;

    -- QUANTOS MESES JÁ FORAM LANÇADOS PARA ESTE TÚMULO. É daqui que sai
    -- quantos ciclos já fecharam, sem campo de controle novo.
    select count(*) into v_ja
      from conta_corrente
     where org_id = v_org and tumulo_id = r.id
       and origem = 'competencia' and tipo = 'debito';

    -- O COMEÇO DO PERÍODO ATUAL.
    --
    -- A ÂNCORA É COISA DO PÓS-PAGO, e só dele.
    --
    -- No PRÉ-PAGO não há ambiguidade nenhuma: quem paga adiantado está
    -- pagando os meses que vêm A PARTIR da data em que paga. O período é
    -- `proxima_cobranca .. +N-1` e sempre foi.
    --
    -- No PÓS-PAGO a pergunta existe de verdade — "esses R$ 200 cobrem que
    -- meses?" — e a resposta é o campo que a tela chama de "cobrar a partir
    -- de", deslocado pelos ciclos que já fecharam.
    --
    -- Ler a âncora nos dois casos foi a primeira versão desta migração, e o
    -- ensaio em produção mostrou o estrago: a AUREA tem `inicio_cobranca` em
    -- dez/2025 e cobrança mensal, porque o contrato começou lá e ela foi
    -- cobrada por fora até agora. O cobrador lançaria a competência de
    -- DEZEMBRO DE 2025 vencendo em 10/08/2026 — receita no mês errado, e o
    -- atraso pingando um mês por vez. Cinco famílias na mesma situação.
    if r.cobranca_no_fim and r.inicio_cobranca is not null then
      v_ini := (date_trunc('month', r.inicio_cobranca)
                + ((v_ja / v_meses) * v_meses || ' months')::interval)::date;
    elsif r.cobranca_no_fim then
      -- Pós-pago sem âncora (deriva de cadastro antigo, ver 0104): o período
      -- termina na cobrança, que era o comportamento até a 0114.
      v_ini := (v_comp - ((v_meses - 1) || ' months')::interval)::date;
    else
      v_ini := v_comp;
    end if;

    loop
      v_fim := (v_ini + ((v_meses - 1) || ' months')::interval)::date;

      if r.cobranca_no_fim then
        -- Nada deste período foi prestado ainda.
        exit when v_ini > v_mes_ate;
      else
        -- A data de cobrar ainda não chegou: quem paga adiantado não deve nada.
        exit when v_comp > v_ate;
      end if;

      -- O VENCIMENTO É A DATA DA COBRANÇA, uma só para as N linhas do período.
      v_venc := (v_comp + (v_dia_venc - 1))::date;

      v_rotulo := case
        when v_meses = 1 then to_char(v_ini, 'MM/YYYY')
        else to_char(v_ini, 'MM/YYYY') || ' a ' || to_char(v_fim, 'MM/YYYY')
      end;

      v_mes := v_ini;
      while v_mes <= v_fim loop
        -- No pós-pago, só o que já foi prestado (0114).
        exit when r.cobranca_no_fim and v_mes > v_mes_ate;

        insert into conta_corrente
          (org_id, familia_id, cliente_id, tumulo_id, tipo, origem,
           competencia, valor, descricao, data, canal)
        select v_org, r.familia_id, f.responsavel_id, r.id, 'debito', 'competencia',
               v_mes, round(r.valor_mensal, 2),
               'Contrato · ' || to_char(v_mes, 'MM/YYYY')
                 || coalesce(' · ' || r.identificacao, '')
                 || case when v_meses > 1
                         then ' (parte de ' || v_rotulo || ', vence em '
                              || to_char(v_venc, 'DD/MM/YYYY') || ')'
                         else '' end,
               v_venc, 'automatico'
          from familias f where f.id = r.familia_id
        on conflict do nothing;

        get diagnostics v_entrou = row_count;
        if v_entrou > 0 then
          v_lanc := v_lanc + 1;
          v_total := v_total + round(r.valor_mensal, 2);
          v_tocou := true;
        end if;

        v_mes := (v_mes + interval '1 month')::date;
      end loop;

      -- O CICLO SÓ FECHA QUANDO O ÚLTIMO MÊS DO PERÍODO FOI PRESTADO. Enquanto
      -- não fecha, o período continua aberto recebendo os meses que forem
      -- acontecendo, e a data de cobrar não anda. No pré-pago o período inteiro
      -- sai de uma vez, então fecha sempre.
      exit when r.cobranca_no_fim and v_fim > v_mes_ate;

      v_ini  := (v_ini  + (v_meses || ' months')::interval)::date;
      v_comp := (v_comp + (v_meses || ' months')::interval)::date;
      v_andou := true;
    end loop;

    if v_andou then
      update tumulos set proxima_cobranca = v_comp where id = r.id;
    end if;
    if v_tocou then v_toc := v_toc + 1; end if;
  end loop;

  return query select v_lanc, v_total, v_toc;
end $$;

revoke all on function public.sureya_cobrar_competencias(date, uuid, uuid) from public, anon;
grant execute on function public.sureya_cobrar_competencias(date, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A PRÉVIA PASSA A ENSAIAR O COBRADOR, EM VEZ DE REFAZER A CONTA
-- ---------------------------------------------------------------------------
-- `sureya_cobrancas_a_lancar` (0109) tinha a ARITMÉTICA DO PERÍODO ESCRITA DE
-- NOVO, em SQL, ao lado da do cobrador. Enquanto as duas concordaram ninguém
-- viu; hoje, com a âncora mudando, a ficha diria "2 competências desde agosto"
-- e o botão lançaria julho e agosto.
--
-- É o mesmo defeito de forma que já apareceu quatro vezes neste banco: duas
-- funções com contas diferentes sobre os mesmos fatos (0092 na agenda, 0105 no
-- painel, 0106 lista × ficha, e a competência do D-33). Corrigir a segunda
-- conta não resolve: ela volta a divergir na próxima mudança.
--
-- Então a prévia deixa de ter conta própria. Ela RODA O COBRADOR de verdade
-- dentro de um bloco com exceção — que no PostgreSQL é uma subtransação — mede
-- o que ele escreveu, e derruba tudo. As variáveis plpgsql sobrevivem ao
-- rollback; as linhas, não.
--
-- Por construção, o que a tela promete é exatamente o que o botão faz.
create or replace function public.sureya_cobrancas_a_lancar(
  p_familia uuid, p_ate date default null)
returns table(competencias integer, valor numeric, desde date)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_antes uuid[];
  v_n int := 0; v_v numeric := 0; v_desde date;
begin
  select org_id into v_org from familias where id = p_familia;
  if v_org is null then
    return query select 0, 0::numeric, null::date;
    return;
  end if;

  -- O QUE JÁ EXISTIA, para saber depois o que é novo. `created_at` não serve
  -- de marca: ele nasce de `now()`, que é constante dentro da transação.
  select coalesce(array_agg(cc.id), '{}'::uuid[]) into v_antes
    from conta_corrente cc
   where cc.org_id = v_org and cc.familia_id = p_familia
     and cc.origem = 'competencia' and cc.tipo = 'debito';

  begin
    perform sureya_cobrar_competencias(coalesce(p_ate, current_date), v_org, p_familia);

    -- Tabela com apelido, colunas qualificadas: `valor` e `competencias` sao
    -- tambem os parametros de saida desta funcao, e sem o apelido o Postgres
    -- recusa a referencia como ambigua.
    select count(*), coalesce(sum(cc.valor), 0), min(cc.competencia)
      into v_n, v_v, v_desde
      from conta_corrente cc
     where cc.org_id = v_org and cc.familia_id = p_familia
       and cc.origem = 'competencia' and cc.tipo = 'debito'
       and not (cc.id = any(v_antes));

    -- E AGORA DESFAZ. Abrir a ficha nunca pode criar dívida.
    raise exception 'ENSAIO_DA_PREVIA';
  exception when others then
    -- Só o sentinela é engolido. Um erro de verdade (permissão, cadastro
    -- inconsistente) tem de chegar a quem chamou, e não virar "nada a lançar".
    if sqlerrm is distinct from 'ENSAIO_DA_PREVIA' then raise; end if;
  end;

  return query select coalesce(v_n, 0), coalesce(v_v, 0::numeric), v_desde;
end $$;

revoke all on function public.sureya_cobrancas_a_lancar(uuid, date) from public, anon;
grant execute on function public.sureya_cobrancas_a_lancar(uuid, date) to authenticated, service_role;

commit;
