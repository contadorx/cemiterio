-- ============================================================================
-- SUREYA — 0066 · BUILD 2 · A CONCLUSÃO VIRA UMA TRANSAÇÃO DE NEGÓCIO
--
-- Rodar DEPOIS de 0052, 0055, 0057, 0058, 0059, 0060, 0061, 0062, 0064 e 0065.
--
-- O QUE A AUDITORIA DIZ (P0 nº 2 e nº 3)
-- ---------------------------------------------------------------------------
--   "A conclusão faz upload, atualiza `servicos`, insere histórico/fila,
--    calcula e insere movimento, consome material, registra remuneração e
--    dispara efeitos posteriores em etapas separadas. Alguns erros são
--    deliberadamente engolidos. Depois que o serviço vira `executado`, uma
--    nova tentativa retorna `jaExecutado` e não necessariamente repara tudo
--    que falhou após essa transição."
--
--   "Uma pessoa de campo pode assumir ou concluir serviço de outra pessoa se
--    obtiver/adivinhar o UUID."
--
-- Confirmado no código. `src/app/api/servico/concluir/route.ts` faz:
--
--     .update({ ..., executora_id: auth.userId })
--     .eq("id", servicoId)
--     .neq("status", "executado")
--
-- O filtro é só id + status. **Nunca compara `executora_id` com quem está
-- chamando** — apenas sobrescreve. Qualquer conta de campo conclui o serviço
-- de qualquer outra, e leva junto a remuneração.
--
-- E depois da transição vêm SEIS efeitos em blocos try/catch mudos: extrato,
-- fila de liberação, débito, valor congelado, remuneração e consumo. Se a
-- conexão cair no meio, a lavagem fica executada e não cobrada — e a segunda
-- tentativa devolve `jaExecutado: true` sem reparar nada.
--
-- O QUE ESTA FUNÇÃO FAZ DIFERENTE
-- ---------------------------------------------------------------------------
-- 1. AUTORIZA no banco: campo só conclui o que é dele.
-- 2. Uma função PL/pgSQL é UMA transação: ou todos os efeitos entram, ou
--    nenhum. Não existe mais "executado sem débito".
-- 3. É CONVERGENTE, não apenas idempotente. Rodar de novo num serviço já
--    executado não devolve "já foi" — ela confere cada efeito e **cria o que
--    estiver faltando**. É isso que transforma uma falha parcial antiga em
--    algo reparável: basta chamar de novo.
-- 4. Devolve um diagnóstico dizendo o que criou e o que reparou, em vez de um
--    booleano.
--
-- O UPLOAD FICA FORA, ANTES — como a auditoria pede. Storage não participa de
-- transação de banco; a função recebe as URLs já prontas.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) AS CHAVES QUE TORNAM A IDEMPOTÊNCIA REAL
--
-- Sem restrição única, "confere se já existe e insere" é uma corrida: dois
-- toques simultâneos passam os dois pelo `if not exists` e inserem os dois.
-- O índice único é o que faz o banco recusar o segundo.
--
-- A auditoria pede exatamente isto: "definir chaves únicas por efeito e
-- comportamento para repetição/concorrência".
-- ----------------------------------------------------------------------------

-- Um débito por serviço. Parcial: estornos e créditos do mesmo serviço podem
-- coexistir (é assim que `sureya_estornar_servico` funciona).
create unique index if not exists uq_movimentos_debito_por_servico
  on movimentos (servico_id)
  where tipo = 'debito' and servico_id is not null and estorna_movimento is null;

-- Uma mensagem por serviço e tipo. Impede a fila ganhar duas fotos da mesma
-- lavagem quando a conclusão é reprocessada.
create unique index if not exists uq_fila_liberacao_servico_tipo
  on fila_liberacao (servico_id, tipo)
  where servico_id is not null;

-- O extrato da lavagem precisava de uma chave e não tinha: `conta_corrente`
-- não guarda `servico_id`. Sem isso, reprocessar duplicava a linha
-- "Limpeza realizada" na ficha da família.
alter table conta_corrente add column if not exists servico_id uuid references servicos(id) on delete set null;

create unique index if not exists uq_conta_corrente_lavagem
  on conta_corrente (servico_id)
  where origem = 'lavagem' and servico_id is not null;


-- ----------------------------------------------------------------------------
-- 2) A FUNÇÃO
-- ----------------------------------------------------------------------------
create or replace function public.sureya_concluir_lavagem(
  p_servico        uuid,
  p_foto_depois    text,
  p_foto_antes     text    default null,
  p_duracao_min    int     default null,
  p_texto_mensagem text    default null,
  p_destinatario   uuid    default null
)
returns table(
  ja_estava_executado boolean,
  valor               numeric,
  debito_criado       boolean,
  extrato_criado      boolean,
  fila_criada         boolean,
  remuneracao         numeric,
  custo_material      numeric,
  reparos             text[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org        uuid;
  v_uid        uuid := auth.uid();
  v_s          record;
  v_momento    text;
  v_valor      numeric := 0;
  v_familia    uuid;
  v_codigo     text;
  v_ja         boolean := false;
  v_deb        boolean := false;
  v_ext        boolean := false;
  v_fila       boolean := false;
  v_remun      numeric;
  v_custo      numeric := 0;
  -- `text[] || 'literal'` e ambiguo: o Postgres tenta resolver como
  -- array||array e estoura "malformed array literal". Cada acrescimo
  -- abaixo leva `::text` explicito. Achado testando o clique duplo.
  v_reparos    text[]  := '{}';
  v_regra      record;
  v_avulso     boolean;
  v_dest       uuid;
  v_texto      text;
  m            record;
begin
  v_org := current_org_id();
  if v_org is null then
    raise exception 'sem_org' using errcode = '42501';
  end if;

  -- ------------------------------------------------------------------
  -- AUTORIZAÇÃO — o P0 nº 3
  --
  -- `for update` trava a linha até o fim da transação: dois toques
  -- simultâneos no mesmo serviço viram um depois do outro, não dois em
  -- paralelo. É o que impede a corrida antes mesmo do índice único agir.
  -- ------------------------------------------------------------------
  select * into v_s from servicos
   where id = p_servico and org_id = v_org
   for update;

  if not found then
    raise exception 'servico_nao_encontrado' using errcode = '42501';
  end if;

  -- Admin opera qualquer serviço da organização. Campo só o que está
  -- atribuído a ela — ou um ainda sem dono, que ela reserva ao concluir.
  if not is_admin() then
    if not is_campo() then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if v_s.executora_id is not null and v_s.executora_id <> v_uid then
      raise exception 'servico_de_outra_executora' using errcode = '42501';
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- COMO ESTA FAMÍLIA PAGA
  -- 'antes'       = pré-pago, não debita de novo
  -- 'contra_foto' = a entrega é que libera a cobrança
  -- ------------------------------------------------------------------
  select coalesce(p.momento_cobranca::text, 'depois') into v_momento
    from planos p where p.id = v_s.plano_id;
  v_momento := coalesce(v_momento, 'depois');

  select t.familia_id, t.codigo into v_familia, v_codigo
    from tumulos t where t.id = v_s.tumulo_id;

  -- ------------------------------------------------------------------
  -- 1. A TRANSIÇÃO
  -- ------------------------------------------------------------------
  if v_s.status::text = 'executado' then
    v_ja := true;
    v_reparos := v_reparos || 'servico ja estava executado: conferindo os efeitos'::text;
  else
    update servicos set
      status          = 'executado',
      data_executada  = now(),
      duracao_minutos = coalesce(p_duracao_min, duracao_minutos),
      foto_depois_url = coalesce(p_foto_depois, foto_depois_url),
      -- A foto do ANTES só é gravada quando vem uma nova: ela normalmente já
      -- subiu no "Começar". Escrever null aqui apagava o ponteiro no banco e
      -- o arquivo virava órfão no Storage.
      foto_antes_url  = coalesce(p_foto_antes, foto_antes_url),
      executora_id    = coalesce(executora_id, v_uid),
      cobranca_liberada_em = case when v_momento = 'contra_foto'
                                  then now() else cobranca_liberada_em end
    where id = p_servico;
  end if;

  -- ------------------------------------------------------------------
  -- 2. QUANTO ESTA LAVAGEM VALE
  -- Cascata: o que está no serviço → o plano → o jazigo → a referência da
  -- casa. `tumulos.valor_lavagem` entrou na cascata porque desde a migration
  -- 0049 é DE LÁ que a cobrança lê — `planos` ficou como legado.
  -- ------------------------------------------------------------------
  v_valor := coalesce(nullif(v_s.valor, 0), 0);
  if v_valor = 0 and v_s.plano_id is not null then
    select coalesce(nullif(p.valor_vigente,0), nullif(p.valor_mensal,0)) into v_valor
      from planos p where p.id = v_s.plano_id;
  end if;
  if coalesce(v_valor,0) = 0 and v_s.tumulo_id is not null then
    select nullif(t.valor_lavagem, 0) into v_valor from tumulos t where t.id = v_s.tumulo_id;
  end if;
  if coalesce(v_valor,0) = 0 then
    select coalesce(nullif(o.valor_referencia_limpeza,0), 40) into v_valor
      from orgs o where o.id = v_org;
  end if;
  v_valor := coalesce(v_valor, 40);

  if coalesce(v_s.valor, 0) = 0 and v_valor > 0 then
    update servicos set valor = v_valor where id = p_servico;
    if v_ja then v_reparos := v_reparos || 'valor do servico estava zerado: congelado agora'::text; end if;
  end if;

  -- ------------------------------------------------------------------
  -- 3. O DÉBITO
  -- O `on conflict do nothing` sobre o índice único é a trava real; o
  -- `if not exists` seria uma corrida entre dois toques simultâneos.
  -- ------------------------------------------------------------------
  if v_s.cliente_id is not null and v_momento <> 'antes' and v_valor > 0 then
    insert into movimentos (org_id, cliente_id, tipo, valor, origem, servico_id,
                            status_conc, descricao, data)
    values (v_org, v_s.cliente_id, 'debito', v_valor, 'servico', p_servico,
            'confirmado', 'Limpeza executada', current_date)
    on conflict do nothing;
    v_deb := found;
    if v_deb and v_ja then
      v_reparos := v_reparos || 'debito estava faltando: lancado agora'::text;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 4. O EXTRATO DA FAMÍLIA — valor ZERO, de propósito
  -- Quem gera a dívida é a competência. Se a lavagem também lançasse valor,
  -- a família seria cobrada duas vezes pelo mesmo serviço.
  -- ------------------------------------------------------------------
  if v_familia is not null then
    insert into conta_corrente (org_id, familia_id, tumulo_id, servico_id, tipo, origem,
                                competencia, valor, descricao, data)
    values (v_org, v_familia, v_s.tumulo_id, p_servico, 'debito', 'lavagem',
            null, 0, 'Limpeza realizada' || coalesce(' · ' || v_codigo, ''), current_date)
    on conflict do nothing;
    v_ext := found;
    if v_ext and v_ja then
      v_reparos := v_reparos || 'registro no extrato estava faltando: criado agora'::text;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 5. A FILA DE LIBERAÇÃO — outbox, nada é enviado aqui
  --
  -- Para quem vai: quem recebe as fotos de carinho, não necessariamente quem
  -- paga. É o filho que acerta a conta, mas às vezes é a neta que acompanha.
  -- ------------------------------------------------------------------
  if v_familia is not null and coalesce(p_foto_depois, '') <> '' then
    v_dest := p_destinatario;
    if v_dest is null then
      select c.id into v_dest from clientes c
       where c.familia_id = v_familia
       order by (c.recebe_fotos is true) desc,
                (c.responsavel_financeiro is true) desc,
                c.created_at
       limit 1;
    end if;

    if v_dest is not null then
      v_texto := coalesce(nullif(btrim(p_texto_mensagem), ''),
                          'A limpeza foi feita. Segue a foto. 🌿');
      insert into fila_liberacao (org_id, familia_id, cliente_id, tumulo_id, servico_id,
                                  tipo, texto, fotos)
      values (v_org, v_familia, v_dest, v_s.tumulo_id, p_servico, 'foto', v_texto,
              to_jsonb(array_remove(array[
                coalesce(p_foto_antes, v_s.foto_antes_url), p_foto_depois], null)))
      on conflict do nothing;
      v_fila := found;
      if v_fila and v_ja then
        v_reparos := v_reparos || 'mensagem da familia estava faltando: entrou na fila'::text;
      end if;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 6. A REMUNERAÇÃO — congelada agora (migration 0031)
  -- Mesma regra de `src/lib/remuneracao.ts:valorDoServico`. A receita é o
  -- valor RESOLVIDO acima, não o que estava gravado: passar o valor cru fazia
  -- a família pagar R$ 40 e a ajudante ganhar R$ 0,00 nos avulsos.
  -- ------------------------------------------------------------------
  if coalesce(v_s.executora_id, v_uid) is not null and v_s.valor_executora is null then
    v_avulso := v_s.plano_id is null;
    select * into v_regra from remuneracao_regras
     where org_id = v_org and membro_id = coalesce(v_s.executora_id, v_uid)
     limit 1;
    if not found then
      select * into v_regra from remuneracao_regras
       where org_id = v_org and membro_id is null limit 1;
    end if;

    if found then
      if v_regra.modo = 'mensal' or (v_regra.so_avulso and not v_avulso) then
        v_remun := 0;
      elsif v_regra.base_jazigo = 'percentual' then
        v_remun := round(v_valor * coalesce(v_regra.percentual_receita,0) / 100.0, 2);
      else
        v_remun := round(coalesce(v_regra.valor_por_jazigo,0), 2);
      end if;
      update servicos set valor_executora = v_remun where id = p_servico;
      if v_ja then v_reparos := v_reparos || 'remuneracao estava faltando: carimbada agora'::text; end if;
    end if;
  else
    v_remun := v_s.valor_executora;
  end if;

  -- ------------------------------------------------------------------
  -- 7. O CONSUMO DE MATERIAL
  --
  -- `custo_estimado is null` é a chave de idempotência: sem ela, reprocessar
  -- baixava o estoque DE NOVO. O `src/lib/consumo.ts` não tinha essa trava —
  -- só não aparecia porque a rota antiga retornava cedo em reprocessamento.
  -- ------------------------------------------------------------------
  if v_s.custo_estimado is null then
    for m in
      select id, estoque, consumo_por_limpeza, custo_unitario
        from materiais
       where org_id = v_org and coalesce(consumo_por_limpeza,0) > 0
       for update
    loop
      v_custo := v_custo + m.consumo_por_limpeza * coalesce(m.custo_unitario, 0);
      update materiais set
        estoque = greatest(0, coalesce(estoque,0) - m.consumo_por_limpeza),
        atualizado_em = now()
      where id = m.id;
    end loop;
    v_custo := round(v_custo, 2);
    update servicos set custo_estimado = v_custo where id = p_servico;
    if v_ja and v_custo > 0 then
      v_reparos := v_reparos || 'consumo de material estava faltando: baixado agora'::text;
    end if;
  else
    v_custo := v_s.custo_estimado;
  end if;

  return query select v_ja, v_valor, v_deb, v_ext, v_fila, v_remun, v_custo, v_reparos;
end
$function$;

comment on function public.sureya_concluir_lavagem(uuid, text, text, int, text, uuid) is
  'Build 2: conclui a lavagem como UMA transação. Autoriza no banco (campo só '
  'conclui o serviço atribuído a ela), transiciona, debita, registra no extrato, '
  'enfileira a mensagem, carimba a remuneração e baixa o material. É CONVERGENTE: '
  'chamar de novo num serviço já executado repara os efeitos que faltarem.';

revoke execute on function public.sureya_concluir_lavagem(uuid, text, text, int, text, uuid)
  from public, anon;
grant  execute on function public.sureya_concluir_lavagem(uuid, text, text, int, text, uuid)
  to authenticated, service_role;

commit;


-- ============================================================================
-- RECONCILIAÇÃO — o que a auditoria pede como critério de saída
--
-- "Criar reconciliação diária: serviço executado x fotos x financeiro x
--  remuneração x fila."
--
-- Esta consulta é essa reconciliação. Toda linha que voltar é uma lavagem
-- executada com algum efeito faltando — e cada uma é reparável chamando
-- `sureya_concluir_lavagem` de novo com o mesmo id.
--
-- Antes do piloto ela tem de voltar VAZIA.
-- ============================================================================
create or replace view sureya_lavagens_incompletas as
select s.id                                   as servico_id,
       s.data_executada::date                 as dia,
       t.identificacao                         as jazigo,
       c.nome                                  as familia,
       (s.foto_depois_url is null)             as sem_foto,
       (s.valor is null or s.valor = 0)        as sem_valor,
       (m.id is null)                          as sem_debito,
       (cc.id is null)                         as sem_extrato,
       (f.id is null)                          as sem_mensagem,
       (s.valor_executora is null)             as sem_remuneracao,
       (s.custo_estimado is null)              as sem_material
  from servicos s
  left join tumulos  t on t.id = s.tumulo_id
  left join clientes c on c.id = s.cliente_id
  left join movimentos m
         on m.servico_id = s.id and m.tipo = 'debito' and m.estorna_movimento is null
  left join conta_corrente cc
         on cc.servico_id = s.id and cc.origem = 'lavagem'
  left join fila_liberacao f
         on f.servico_id = s.id and f.tipo = 'foto'
 where s.status::text = 'executado'
   and s.org_id = current_org_id()
   and (s.foto_depois_url is null
        or s.valor is null or s.valor = 0
        or m.id  is null
        or cc.id is null
        or f.id  is null
        or s.valor_executora is null
        or s.custo_estimado is null);

comment on view sureya_lavagens_incompletas is
  'Reconciliação do Build 2: lavagens executadas com efeito faltando. Cada linha '
  'é reparável chamando sureya_concluir_lavagem() de novo com o mesmo servico_id. '
  'Antes do piloto, tem de voltar vazia.';
