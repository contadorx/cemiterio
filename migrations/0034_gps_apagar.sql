-- ============================================================================
-- SUREYA — Migration 0034 · Apagar uma leitura de GPS errada
--
-- POR QUE ISTO PRECISA EXISTIR
-- ---------------------------------------------------------------------------
-- A 0013 fez a posição do túmulo melhorar com o uso: cada visita grava uma
-- LEITURA e a posição vira a média ponderada de todas. Ótimo enquanto todas as
-- leituras são de verdade — e sem saída nenhuma quando uma delas não é.
--
-- Um jazigo marcado em casa, dentro do carro ou com o sinal preso na torre
-- entra na média e nunca mais sai: as visitas seguintes só DILUEM o erro. Não
-- havia como apagar. O ponto ficava no mapa, puxando a planta inteira para o
-- lado errado, e a tela só sabia dizer "remarque na próxima passagem" — o que
-- não resolve, porque remarcar ADICIONA leitura, não remove a ruim.
--
-- O QUE ESTA FUNÇÃO FAZ
-- ---------------------------------------------------------------------------
--   apagar UMA leitura  -> tira aquela linha e RECALCULA a média com o resto
--   apagar TODAS        -> zera as leituras e limpa lat/lng do túmulo, que sai
--                          do mapa até alguém marcar de novo no campo
--
-- Recalcular é obrigatório: sem isso a linha some do histórico mas o estrago
-- continua gravado em tumulos.lat/lng, que é o que o mapa desenha.
--
-- A conta é IDÊNTICA à da 0013 (média ponderada por 1/precisão², 20 melhores
-- leituras, precisão da média = 1/raiz(soma dos pesos)) — de propósito: se as
-- duas divergirem, apagar uma leitura irrelevante mexeria na posição, e a
-- posição de um jazigo não pode depender de qual função foi chamada por
-- último.
--
-- HISTÓRICO: apaga mesmo, não marca como descartada. É uma coordenada errada de
-- um túmulo, não um lançamento financeiro; guardar linha morta só criaria a
-- pergunta "por que este ponto voltou?" no dia em que alguém recalculasse sem
-- filtrar. Quem apaga é admin (ver a rota), e o número de amostras na ficha
-- mostra o resultado.
-- ============================================================================

create or replace function sureya_apagar_gps(
  p_tumulo  uuid,
  p_leitura uuid default null
)
returns table (lat double precision, lng double precision, precisao double precision, amostras int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_lat   double precision;
  v_lng   double precision;
  v_prec  double precision;
  v_n     int;
  v_soma_peso double precision;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  if not exists (select 1 from tumulos where id = p_tumulo and org_id = v_org) then
    raise exception 'tumulo_nao_encontrado';
  end if;

  if p_leitura is null then
    delete from gps_leituras where tumulo_id = p_tumulo and org_id = v_org;
  else
    delete from gps_leituras
     where id = p_leitura and tumulo_id = p_tumulo and org_id = v_org;
  end if;

  -- sobrou alguma leitura? mesma conta da 0013.
  with melhores as (
    select l.lat, l.lng, l.precisao, 1.0 / (l.precisao * l.precisao) as peso
      from gps_leituras l
     where l.tumulo_id = p_tumulo and l.org_id = v_org
       and l.precisao is not null and l.precisao > 0
     order by l.precisao asc
     limit 20
  )
  select sum(m.lat * m.peso) / nullif(sum(m.peso), 0),
         sum(m.lng * m.peso) / nullif(sum(m.peso), 0),
         sum(m.peso),
         count(*)
    into v_lat, v_lng, v_soma_peso, v_n
  from melhores m;

  if v_n is null or v_n = 0 or v_lat is null then
    -- SEM LEITURA NENHUMA o túmulo volta a não ter posição. Limpar lat/lng é o
    -- ponto inteiro da operação: é lá que o mapa lê. Jazigo importado com
    -- coordenada e sem leitura nenhuma também é limpo aqui — é exatamente o
    -- caso de "essa coordenada está errada e não tem de onde recalcular".
    update tumulos set
      lat = null, lng = null,
      gps_precisao = null,
      gps_amostras = 0,
      gps_atualizado_em = null
    where id = p_tumulo and org_id = v_org;
    return query select null::double precision, null::double precision,
                        null::double precision, 0;
    return;
  end if;

  v_prec := case when v_soma_peso > 0 then 1.0 / sqrt(v_soma_peso) else null end;

  update tumulos set
    lat = v_lat,
    lng = v_lng,
    gps_precisao = round(v_prec::numeric, 2),
    gps_amostras = v_n,
    gps_atualizado_em = now()
  where id = p_tumulo and org_id = v_org;

  return query select v_lat, v_lng, round(v_prec::numeric, 2)::double precision, v_n;
end;
$$;

revoke all on function sureya_apagar_gps(uuid, uuid) from public;
grant execute on function sureya_apagar_gps(uuid, uuid) to authenticated;

-- ============================================================================
-- FIM 0034.
-- ============================================================================
