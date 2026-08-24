-- ============================================================================
-- 0130 — A REGUA NAO EMUDECE AOS TRINTA DIAS
-- ============================================================================
--
-- O QUE ESTAVA ACONTECENDO, MEDIDO EM 24/08
--
-- O ultimo degrau da regua e +30 dias, e o casamento e por igualdade exata:
--
--     and d.ativo and d.dias = r.dias_do_vencimento
--
-- Entao um debito com 31 dias nao casa com nada. Nem com 45, nem com 379. A
-- regua simplesmente para de falar, para sempre, no trigesimo primeiro dia.
--
--   43 debitos de  7 familias  R$ 1.565,00  passados dos 30 dias
--   19 debitos de 15 familias  R$   790,00  dentro da regua
--
-- R$ 1.565,00 de R$ 1.980,00 em aberto — 79% do dinheiro devido — estava na
-- zona de silencio. O mais velho com 379 dias. E o cron relatava isso como
-- `sem_degrau: 65`, um numero que parece diagnostico e escondia o fato.
--
-- ERAM DOIS SILENCIOS, NAO UM
--
-- O segundo eu nao tinha visto: a consulta so olhava dividas dentro de
-- `between (v_dia - 365) and (v_dia + 365)`. Passar de um ano tirava a divida
-- da regua por inteiro, independente de degrau — e a mais velha da producao
-- tem 379 dias, do lado de fora.
--
-- Quem achou foi o teste. Escrevi `regua_repete.sql` com uma divida de 379
-- dias justamente por ser a mais velha de verdade, e ele reprovou o conserto
-- do degrau. Sem esse numero eu teria consertado metade e dito que estava
-- resolvido.
--
-- POR QUE INTERVALO, E NAO MODULO
--
-- A primeira ideia foi repetir quando `(dias - degrau) % 30 = 0`. Medi antes de
-- escrever: HOJE isso alcancaria ZERO das 7 familias — nenhuma esta num
-- multiplo exato. Pior: modulo depende do cron rodar NAQUELE dia. Um dia
-- perdido, e a familia espera mais um mes. Repetir um erro de silencio para
-- consertar um erro de silencio.
--
-- O que uma pessoa quer dizer com "cobra de novo depois de um mes" nao e um
-- multiplo: e um INTERVALO desde a ultima vez que se falou. E isso que o
-- degrau que repete passa a fazer — robusto a dia perdido, e alcanca as 7
-- familias na primeira rodada.
--
-- O QUE NAO MUDA
--
--   · A regua NAO ENVIA. Continua enfileirando na liberacao, e o disparo
--     segue manual pela fila do Conversas. Nao ha caminho daqui para o
--     WhatsApp e esta migration nao abre nenhum.
--   · Uma cobranca por familia por dia — a guarda ja existia e continua na
--     frente da repeticao, para o contador nao mentir.
--   · `nao_cobrar` continua sendo respeitado, e o adiamento da 0124 tambem:
--     familia que combinou uma data nao e alcancada pela repeticao.
--   · Degrau normal (repetir_a_cada nulo) continua com igualdade exata. Nada
--     do comportamento de hoje muda para os degraus de -5 a +30.
--
-- O TERCEIRO CONTADOR
--
-- `repetidos` entra no retorno. Sem ele, a repeticao que NAO saiu porque ainda
-- esta dentro do intervalo cairia num silencio igual ao que esta migration
-- conserta. Mudar o `returns table` obriga a derrubar a funcao antes (a licao
-- da 0109): `create or replace` com outra lista de colunas nao substitui.
-- ============================================================================

-- ============================================================================
-- 1. O DEGRAU PODE REPETIR
-- ============================================================================
alter table regua_degraus
  add column if not exists repetir_a_cada smallint;

comment on column regua_degraus.repetir_a_cada is
  'Nulo: o degrau vale so no dia exato (comportamento de sempre). Numero N: '
  'depois do dia dele, o degrau volta a valer sempre que fizer N dias desde a '
  'ultima cobranca enfileirada para aquela familia. E intervalo, nao multiplo: '
  'um dia de cron perdido nao custa um mes de silencio.';

-- Sete dias e o piso. Nao e gosto: repetir a cada um ou dois dias deixa de ser
-- cobranca e vira perseguicao — e quem digita "3" achando que sao meses nao
-- descobre o engano pela tela, descobre pela familia.
alter table regua_degraus drop constraint if exists regua_degraus_repetir_sensato;
alter table regua_degraus add constraint regua_degraus_repetir_sensato
  check (repetir_a_cada is null or repetir_a_cada >= 7);

-- ============================================================================
-- 2. O ULTIMO DEGRAU DE CADA REGUA PASSA A REPETIR
-- ============================================================================
--
-- CONVERGENTE: so toca quem ainda esta nulo. Rodar de novo nao mexe em quem ja
-- tem resposta — inclusive em quem foi posto como "nao repete" a mao.
--
-- O TEXTO NAO E REESCRITO. O do degrau +30 diz:
--
--   "Sobre a mensalidade em aberto: me avise como prefere seguir. Se nao for
--    possivel continuar agora, tudo bem — e so me dizer para eu suspender as
--    visitas sem constrangimento."
--
-- Isso repete bem: pergunta, nao ameaca, e oferece uma saida. Sao palavras que
-- a Sureya ja aprovou, e nao cabe a uma migration trocar o que a casa diz para
-- as familias. Se ela quiser outras, o lugar e Configuracoes > Regua.
update regua_degraus d
   set repetir_a_cada = 30
 where d.ativo
   and d.repetir_a_cada is null
   and d.dias = (select max(x.dias) from regua_degraus x
                  where x.org_id = d.org_id and x.regua = d.regua and x.ativo);

-- ============================================================================
-- 3. A FUNCAO, EMENDADA — NAO REESCRITA
-- ============================================================================
--
-- `sureya_regua_do_dia` carrega sete guardas ganhas uma a uma (0111, 0116,
-- 0124). Redigitar as sete para mudar duas seria a forma mais provavel de
-- perder uma sem perceber. Entao a emenda e por SUBSTITUICAO DE TEXTO sobre a
-- definicao viva, e cada alvo que nao for achado DERRUBA a migration.
do $$
declare
  v_def  text;
  v_novo text;

  -- os alvos, um por um
  a1 text := 'adiados integer)';
  a2 text := '  v_semtel int := 0; v_adiado int := 0;';
  a3 text := '    select d.texto into v_texto' || E'\n' ||
             '      from regua_degraus d' || E'\n' ||
             '     where d.org_id = v_org and d.regua = r.regua' || E'\n' ||
             '       and d.ativo and d.dias = r.dias_do_vencimento' || E'\n' ||
             '     limit 1;';
  a4 text := '    v_nome := split_part(btrim(coalesce(r.quem, r.familia_nome, '''')), '' '', 1);';
  a5 text := '  return query select v_enf, v_ja, v_sem, v_pago, v_lim, v_semtel, v_adiado;';
  a6 text := '       and cc.data between (v_dia - 365) and (v_dia + 365)';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname = 'sureya_regua_do_dia'
     and pg_get_function_identity_arguments(p.oid) = 'p_dia date, p_org uuid';

  if v_def is null then
    raise exception '0130: sureya_regua_do_dia(date, uuid) nao existe — nada a emendar';
  end if;

  v_novo := v_def;

  -- (a) o contador novo no retorno
  if position(a1 in v_novo) = 0 then
    raise exception '0130: nao achei o fim do returns table (alvo 1)';
  end if;
  v_novo := replace(v_novo, a1, 'adiados integer, repetidos integer)');

  -- (b) as variaveis novas
  if position(a2 in v_novo) = 0 then
    raise exception '0130: nao achei a linha das variaveis (alvo 2)';
  end if;
  v_novo := replace(v_novo, a2,
    '  v_semtel int := 0; v_adiado int := 0; v_rep int := 0;' || E'\n' ||
    '  v_cada int := 0; v_repetindo boolean := false;');

  -- (c) O CASAMENTO DO DEGRAU.
  --     Exato continua ganhando de repeticao — `order by` primeiro pelo
  --     empate exato. Sem isso, um degrau que repete engoliria um degrau
  --     normal mais adiante na regua.
  if position(a3 in v_novo) = 0 then
    raise exception '0130: nao achei a busca do degrau (alvo 3)';
  end if;
  v_novo := replace(v_novo, a3,
    '    select d.texto, coalesce(d.repetir_a_cada, 0),' || E'\n' ||
    '           (r.dias_do_vencimento > d.dias)' || E'\n' ||
    '      into v_texto, v_cada, v_repetindo' || E'\n' ||
    '      from regua_degraus d' || E'\n' ||
    '     where d.org_id = v_org and d.regua = r.regua and d.ativo' || E'\n' ||
    '       and (d.dias = r.dias_do_vencimento' || E'\n' ||
    '            or (coalesce(d.repetir_a_cada, 0) > 0' || E'\n' ||
    '                and r.dias_do_vencimento > d.dias))' || E'\n' ||
    '     order by (d.dias = r.dias_do_vencimento) desc, d.dias desc' || E'\n' ||
    '     limit 1;');

  -- (d) A GUARDA DO INTERVALO, imediatamente antes de montar o texto.
  --     Fica DEPOIS do limite diario de proposito: assim a segunda divida da
  --     mesma familia no mesmo dia conta como `limitados`, que e o que ela e,
  --     e nao como `repetidos`.
  if position(a4 in v_novo) = 0 then
    raise exception '0130: nao achei o ponto antes do insert (alvo 4)';
  end if;
  v_novo := replace(v_novo, a4,
    '    if v_repetindo and v_cada > 0 then' || E'\n' ||
    '      if exists (' || E'\n' ||
    '        select 1 from fila_liberacao fl' || E'\n' ||
    '         where fl.org_id = v_org and fl.familia_id = r.familia_id' || E'\n' ||
    '           and fl.tipo = ''cobranca''' || E'\n' ||
    -- POR DATA, NAO POR CARIMBO. Comparar `criado_em` (timestamptz, com hora)
    -- com meia-noite faz "faz exatamente 30 dias" ainda bloquear: a mensagem
    -- das 12h de 30 dias atras e maior que a meia-noite de hoje. A guarda do
    -- limite diario, tres linhas abaixo, ja compara `criado_em::date` — e a
    -- mesma forma, pelo mesmo motivo. Quem achou foi o teste dos 30 dias.
    '           and fl.criado_em::date > (v_dia - v_cada)' || E'\n' ||
    '      ) then' || E'\n' ||
    '        v_rep := v_rep + 1;' || E'\n' ||
    '        continue;' || E'\n' ||
    '      end if;' || E'\n' ||
    '    end if;' || E'\n' ||
    E'\n' || a4);

  -- (e) devolver o contador novo
  if position(a5 in v_novo) = 0 then
    raise exception '0130: nao achei o return query (alvo 5)';
  end if;
  v_novo := replace(v_novo, a5,
    '  return query select v_enf, v_ja, v_sem, v_pago, v_lim, v_semtel, v_adiado, v_rep;');

  -- (f) A JANELA DE 365 DIAS PARA TRAS — o SEGUNDO silencio, e independente.
  --
  --     Quem achou isto foi o teste, nao eu. Escrevi `regua_repete.sql` com uma
  --     divida de 379 dias porque e a mais velha da producao, e ele reprovou o
  --     conserto: o degrau que repete casava, mas a divida nem chegava ao laco.
  --     A consulta so olhava `cc.data between (v_dia - 365) and (v_dia + 365)`.
  --
  --     Ou seja: passar de um ano tirava a divida da regua por inteiro,
  --     independente de degrau. Consertar so o degrau teria deixado a mais
  --     velha de todas exatamente onde estava — e eu teria dito que estava
  --     resolvido.
  --
  --     O limite para a frente FICA: lancamento com data muito adiante e erro
  --     de digitacao, e cobrar por causa dele seria pior. Para tras sai:
  --     divida velha e divida.
  if position(a6 in v_novo) = 0 then
    raise exception '0130: nao achei a janela de 365 dias (alvo 6)';
  end if;
  v_novo := replace(v_novo, a6, '       and cc.data <= (v_dia + 365)');

  -- Mudar a lista de colunas do `returns table` obriga a derrubar antes: com
  -- outra forma, `create or replace` nao substitui — falha (licao da 0109).
  drop function if exists sureya_regua_do_dia(date, uuid);
  execute v_novo;
end $$;

revoke all on function sureya_regua_do_dia(date, uuid) from public, anon;
grant execute on function sureya_regua_do_dia(date, uuid) to authenticated, service_role;

comment on function sureya_regua_do_dia(date, uuid) is
  'Percorre as competencias em aberto e enfileira na LIBERACAO a mensagem do '
  'degrau que caiu hoje. NUNCA ENVIA. Desde a 0130 o ultimo degrau pode '
  'repetir por intervalo, para a regua nao emudecer aos 30 dias.';
