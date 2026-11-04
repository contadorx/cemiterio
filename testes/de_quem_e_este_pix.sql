-- ============================================================================
-- DE QUEM E ESTE PIX, E A QUE MESES ELE SE REFERE (0163 + 0164)
--
-- O CASO REAL, MEDIDO: extrato de outubro/2026 com 248 Pix de 196 nomes
-- distintos, R$ 19.805,00 recebidos. O sistema cobrou R$ 3.400 e registrou
-- R$ 0. Dos 196 nomes, 69 casam com o cadastro e 127 nao — porque quem paga
-- nem sempre e quem esta cadastrado e porque o Bradesco corta o nome em 21
-- letras. E muita gente pagou o ANUAL.
--
-- O QUE PODE DAR ERRADO AQUI E DINHEIRO, E TODO ERRO E SILENCIOSO:
--
--   creditar duas vezes   confirmar o mesmo Pix duas vezes deixa a familia
--                         adiantada sem ter pago — e ninguem reclama de um
--                         saldo a favor.
--   previa que escreve    abrir a tela para ver a que meses o dinheiro vai
--                         viraria lancar dinheiro.
--   zero debitos calado   `sureya_debitos_em_aberto` com org nula devolve
--                         vazio sem erro: o anual inteiro viraria sobra.
--   licao do proprio chute  aprender sem alguem confirmar faria o palpite
--                         mais fraco (o nome) virar lei no mes seguinte.
--   duas licoes iguais    o mesmo nome apontando para duas familias e duvida,
--                         e duvida nao pode virar sorteio na conciliacao.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci64(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'DE QUEM E ESTE PIX FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

-- SESSAO DE ADMIN. `sureya_lancar` e a porta antiga de dois argumentos leem
-- `current_org_id()`, que sai de `membros` por auth.uid() e exige membro ATIVO
-- desde a 0055. Sem isto o teste exercitaria so o caminho do cron.
insert into auth.users (id, email)
  values ('64646464-0000-0000-0000-00000000000a','pix@sureya.test')
  on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','64646464-0000-0000-0000-00000000000a', false);

do $$
declare
  v_org uuid := '64646464-6464-6464-6464-646464646464';
  o_out uuid := '64646464-6464-6464-6464-6464646464ff';
  v_fam uuid := '64646464-0000-0000-0000-0000000000fa';
  v_cli uuid := '64646464-0000-0000-0000-0000000000c1';
  f_out uuid := '64646464-0000-0000-0000-0000000000fb';
  c_out uuid := '64646464-0000-0000-0000-0000000000c9';
  v_cem uuid := '64646464-0000-0000-0000-0000000000ce';
  v_qua uuid := '64646464-0000-0000-0000-0000000000dd';
  v_tum uuid := '64646464-0000-0000-0000-0000000000a1';
  e_anual uuid := '64646464-0000-0000-0000-0000000000e1';
  e_dois  uuid := '64646464-0000-0000-0000-0000000000e2';
  e_sobra uuid := '64646464-0000-0000-0000-0000000000e3';
  v_n int; v_soma numeric; v_erro text; v_lanc uuid; v_ac int; v_corr boolean;
  v_i int; v_comp date;
begin
  insert into orgs (id, nome) values (v_org, 'Teste 0164'), (o_out, 'Outra org')
    on conflict (id) do nothing;
  insert into membros (org_id, user_id, papel, ativo)
    values (v_org, '64646464-0000-0000-0000-00000000000a', 'admin', true)
    on conflict do nothing;
  insert into cemiterios (id, org_id, nome) values (v_cem, v_org, 'Cem')
    on conflict (id) do nothing;
  insert into quadras (id, org_id, cemiterio_id, codigo) values (v_qua, v_org, v_cem, 'Q1')
    on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (v_fam, v_org, 'Tonelloti')
    on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (f_out, o_out, 'De fora')
    on conflict (id) do nothing;
  insert into clientes (id, org_id, nome, familia_id)
    values (v_cli, v_org, 'Maria Tonelloti', v_fam) on conflict (id) do nothing;
  insert into clientes (id, org_id, nome, familia_id)
    values (c_out, o_out, 'Alheio', f_out) on conflict (id) do nothing;
  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo)
    values (v_tum, v_org, v_qua, v_fam, 'T-1', 'Q1-R1-001') on conflict (id) do nothing;

  -- =========================================================================
  -- DOZE MESES EM ABERTO, R$ 40 cada: a familia que vai pagar o anual.
  -- =========================================================================
  for v_i in 0 .. 11 loop
    v_comp := (date '2026-11-01' + (v_i || ' month')::interval)::date;
    perform sureya_lancar(
      p_cliente := v_cli, p_tipo := 'debito', p_valor := 40.00,
      p_origem := 'competencia', p_descricao := 'Lavagem ' || to_char(v_comp, 'MM/YYYY'),
      p_data := v_comp, p_status := 'confirmado', p_tumulo := v_tum,
      p_competencia := v_comp, p_org := v_org);
  end loop;

  -- =========================================================================
  -- 1. A COMPETENCIA APARECE NA LISTA DO QUE SE DEVE
  --
  -- Sem ela a tela nao consegue perguntar "a que meses?" — e era essa pergunta
  -- que faltava para o anual.
  -- =========================================================================
  select count(*), count(competencia) into v_n, v_i
    from sureya_debitos_em_aberto(v_cli, v_org);
  perform ci64('os doze meses em aberto aparecem', v_n = 12, 'vieram ' || v_n);
  perform ci64('e cada um traz a competencia', v_i = 12,
               v_i || ' dos ' || v_n || ' tem competencia — a tela nao pode agrupar por mes');

  -- O DEFEITO QUE EU MESMO IA DEIXAR PASSAR: sem `p_org`, org nula devolve
  -- ZERO debitos SEM ERRO, e o Pix inteiro viraria adiantamento. E por isso
  -- que `sureya_identificar_entrada_meses` passa `v_org` adiante — este assert
  -- guarda o motivo, desligando a sessao por um instante.
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into v_n from sureya_debitos_em_aberto(v_cli);
  perform ci64('sem sessao e sem p_org a lista vem vazia, como o Postgres manda',
               v_n = 0, 'mudou de comportamento: vieram ' || v_n);
  select count(*) into v_n from sureya_debitos_em_aberto(v_cli, v_org);
  perform ci64('mas com p_org ela responde mesmo sem sessao', v_n = 12,
               'vieram ' || v_n || ' — o cron e o teste veriam a familia sem divida');
  perform set_config('request.jwt.claim.sub', '64646464-0000-0000-0000-00000000000a', true);

  -- =========================================================================
  -- 2. O ENSAIO NAO ESCREVE NADA
  -- =========================================================================
  insert into entradas_banco (id, org_id, valor, data, remetente)
  values (e_anual, v_org, 480.00, date '2026-11-03', 'KATIA F DOS SANTOS')
  on conflict (id) do nothing;

  select count(*), sum(valor) into v_n, v_soma
    from sureya_identificar_entrada_meses(e_anual, v_cli, null, null, true, v_org);
  perform ci64('o ensaio devolve os doze meses', v_n = 12, 'vieram ' || v_n || ' linhas');
  perform ci64('e a soma do ensaio bate com o Pix, ao centavo', v_soma = 480.00,
               'a previa soma ' || v_soma || ' e o Pix e 480,00');

  perform ci64('o ensaio nao cria credito nenhum',
               not exists (select 1 from conta_corrente
                            where org_id = v_org and cliente_id = v_cli and tipo = 'credito'),
               'a previa escreveu no razao — abrir a tela virou lancar dinheiro');
  perform ci64('e nao quita nada',
               (select count(*) from quitacoes where org_id = v_org) = 0,
               'o ensaio quitou meses de verdade');
  perform ci64('e a entrada continua sem dono',
               (select identificada_em from entradas_banco where id = e_anual) is null,
               'o ensaio identificou a entrada');

  -- =========================================================================
  -- 3. AGORA VALENDO: R$ 480 cobrem os doze meses
  -- =========================================================================
  perform sureya_identificar_entrada_meses(e_anual, v_cli, null, null, false, v_org);

  select count(*) into v_n from quitacoes q
    join conta_corrente cc on cc.id = q.debito_id
   where q.org_id = v_org and cc.origem = 'competencia';
  perform ci64('os doze meses sao quitados', v_n = 12, 'quitou ' || v_n);

  select sum(valor) into v_soma from quitacoes where org_id = v_org;
  perform ci64('e a soma das quitacoes e o valor do Pix', v_soma = 480.00,
               'as quitacoes somam ' || v_soma);

  perform ci64('o credito nasce carimbado no mes MAIS ANTIGO que paga',
               (select competencia from conta_corrente
                 where org_id = v_org and cliente_id = v_cli and tipo = 'credito')
               = date '2026-11-01',
               'o credito do anual foi carimbado no mes do extrato, e o relatorio '
               'por competencia passa a mentir');

  perform ci64('nada ficou em aberto depois do anual',
               (select count(*) from sureya_debitos_em_aberto(v_cli, v_org)) = 0,
               'sobrou mes em aberto numa familia que pagou o ano todo');

  -- =========================================================================
  -- 4. CONFIRMAR DUAS VEZES NAO CREDITA DUAS VEZES
  -- =========================================================================
  begin
    perform sureya_identificar_entrada_meses(e_anual, v_cli, null, null, false, v_org);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci64('entrada ja identificada recusa de novo',
               v_erro = 'entrada_ja_identificada',
               'veio ' || coalesce(v_erro, 'NENHUM ERRO') || ' — o mesmo Pix virou dois creditos');

  -- A PORTA ANTIGA, de dois argumentos, continua idempotente: a tela conta
  -- com isso desde a 0073 e ela agora delega para a funcao de cima.
  select sureya_identificar_entrada(e_anual, v_cli) into v_lanc;
  perform ci64('a porta antiga devolve o credito de antes, sem estourar',
               v_lanc = (select lancamento_id from entradas_banco where id = e_anual),
               'a porta de dois argumentos deixou de ser idempotente');

  -- =========================================================================
  -- 5. SO OS MESES ESCOLHIDOS — e a sobra aparece
  -- =========================================================================
  for v_i in 0 .. 2 loop
    v_comp := (date '2027-11-01' + (v_i || ' month')::interval)::date;
    perform sureya_lancar(
      p_cliente := v_cli, p_tipo := 'debito', p_valor := 40.00,
      p_origem := 'competencia', p_descricao := 'Lavagem ' || to_char(v_comp, 'MM/YYYY'),
      p_data := v_comp, p_status := 'confirmado', p_tumulo := v_tum,
      p_competencia := v_comp, p_org := v_org);
  end loop;

  insert into entradas_banco (id, org_id, valor, data, remetente)
  values (e_dois, v_org, 80.00, date '2027-11-05', 'MARIA TONELLOTI')
  on conflict (id) do nothing;

  select count(*) into v_n from sureya_identificar_entrada_meses(
    e_dois, v_cli,
    array(select lancamento_id from sureya_debitos_em_aberto(v_cli, v_org) limit 2),
    null, true, v_org);
  perform ci64('escolhendo dois meses, so dois entram no plano', v_n = 2, 'vieram ' || v_n);

  insert into entradas_banco (id, org_id, valor, data, remetente)
  values (e_sobra, v_org, 500.00, date '2027-11-06', 'QUEM PAGOU DEMAIS')
  on conflict (id) do nothing;

  select count(*) into v_n from sureya_identificar_entrada_meses(
    e_sobra, v_cli, null, null, true, v_org) where debito_id is null;
  perform ci64('o que nao couber aparece como sobra, e nao escondido num mes',
               v_n = 1, 'a sobra nao aparece: a conta nao fecharia na tela');

  select valor into v_soma from sureya_identificar_entrada_meses(
    e_sobra, v_cli, null, null, true, v_org) where debito_id is null;
  perform ci64('e a sobra e exatamente o que passou', v_soma = 380.00,
               'a sobra deu ' || v_soma || ' e deveria ser 380,00 (500 - 3 x 40)');

  -- =========================================================================
  -- 6. O CLIENTE DE OUTRA ORG E RECUSADO
  --
  -- SECURITY DEFINER ignora RLS; so o GRANT protege a porta (licao da 0129).
  -- A conferencia do dono tem de estar DENTRO da funcao.
  -- =========================================================================
  begin
    perform sureya_identificar_entrada_meses(e_dois, c_out, null, null, true, v_org);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci64('creditar para cliente de outra org e recusado',
               v_erro = 'cliente_de_outra_org',
               'veio ' || coalesce(v_erro, 'NENHUM ERRO') || ' — o dinheiro de uma '
               'organizacao entraria no razao de outra');

  -- =========================================================================
  -- 7. O BANCO APRENDE QUEM E QUEM (0163)
  -- =========================================================================
  select acertos, corrigiu into v_ac, v_corr from sureya_aprender_apelido_banco(
    'KATIA F DOS SANTOS', 'Katia F dos Santos', null, v_cli, v_org);
  perform ci64('a primeira licao nasce com um acerto', v_ac = 1 and v_corr = false,
               'acertos=' || v_ac || ' corrigiu=' || v_corr);

  perform ci64('e a licao guarda a familia, nao so a pessoa',
               (select familia_id from apelidos_banco
                 where org_id = v_org and nome_banco = 'KATIA F DOS SANTOS') = v_fam,
               'a familia nao foi deduzida do cliente — a licao morre se a pessoa '
               'mudar de lugar no cadastro');

  select acertos, corrigiu into v_ac, v_corr from sureya_aprender_apelido_banco(
    'KATIA F DOS SANTOS', 'KATIA F DOS SANTOS', null, v_cli, v_org);
  perform ci64('confirmar o mesmo nome de novo soma um acerto',
               v_ac = 2 and v_corr = false, 'acertos=' || v_ac);

  perform ci64('e nao cria uma segunda licao para o mesmo nome',
               (select count(*) from apelidos_banco
                 where org_id = v_org and nome_banco = 'KATIA F DOS SANTOS') = 1,
               'duas licoes para o mesmo nome: a conciliacao passaria a sortear');

  -- CORRECAO: alguem disse antes que era desta familia e agora diz que e de
  -- outra. A ultima palavra e de quem esta olhando, e a contagem reinicia —
  -- herdar os acertos da licao errada faria o erro parecer provado.
  insert into familias (id, org_id, nome)
  values ('64646464-0000-0000-0000-0000000000fc', v_org, 'Mendes')
  on conflict (id) do nothing;
  select acertos, corrigiu into v_ac, v_corr from sureya_aprender_apelido_banco(
    'KATIA F DOS SANTOS', 'KATIA F DOS SANTOS',
    '64646464-0000-0000-0000-0000000000fc', null, v_org);
  perform ci64('corrigir a licao zera a contagem e avisa que corrigiu',
               v_ac = 1 and v_corr = true, 'acertos=' || v_ac || ' corrigiu=' || v_corr);

  -- A FORMA E CONFERIDA, nao refeita. `normalizarNomeBanco` (TypeScript) e o
  -- unico dono da regra; o banco so recusa o que nao chega na forma dela.
  begin
    perform sureya_aprender_apelido_banco('katia minuscula', 'x', null, v_cli, v_org);
    v_erro := null;
  exception when others then v_erro := 'recusou';
  end;
  perform ci64('nome fora da forma normalizada e recusado', v_erro = 'recusou',
               'entrou minusculo — e agora existem duas licoes para a mesma pessoa');

  begin
    perform sureya_aprender_apelido_banco('ESPACO  DOBRADO', 'x', null, v_cli, v_org);
    v_erro := null;
  exception when others then v_erro := 'recusou';
  end;
  perform ci64('espaco dobrado tambem e recusado', v_erro = 'recusou',
               '"A  B" e "A B" viveriam como duas licoes diferentes');

  -- LICAO SEM ALVO NAO ENSINA NADA.
  begin
    perform sureya_aprender_apelido_banco('SEM ALVO NENHUM', 'x', null, null, v_org);
    v_erro := null;
  exception when others then v_erro := 'recusou';
  end;
  perform ci64('licao sem familia e sem cliente e recusada', v_erro = 'recusou',
               'guardou um nome apontando para ninguem');

  -- ALVO DE OUTRA ORG: a mesma porta da 0129.
  begin
    perform sureya_aprender_apelido_banco('ALVO DE FORA', 'x', f_out, null, v_org);
    v_erro := null;
  exception when others then v_erro := 'recusou';
  end;
  perform ci64('licao apontando para familia de outra org e recusada',
               v_erro = 'recusou', 'um id de outra organizacao entrou pela funcao');

  -- DUAS INSTRUCOES, E NAO UMA.
  --
  -- Escrito como `esquecer(...) and not exists (...)` isto falhava: os dois
  -- lados estao na MESMA instrucao, e o subselect le o snapshot de quando ela
  -- comecou — a linha apagada ainda aparece. O teste acusaria um defeito que
  -- nao existe, e o conserto seria no lugar errado.
  v_corr := sureya_esquecer_apelido_banco('KATIA F DOS SANTOS', v_org);
  perform ci64('esquecer diz que apagou', v_corr,
               'a funcao nao achou a licao que estava ali');
  perform ci64('e a licao sai mesmo',
               not exists (select 1 from apelidos_banco
                            where org_id = v_org and nome_banco = 'KATIA F DOS SANTOS'),
               'a licao errada nao sai, e vai mandar na conciliacao do mes que vem');

  raise notice 'DE QUEM E ESTE PIX: tudo certo.';
end $$;

-- ---------------------------------------------------------------------------
-- A PORTA DO ANONIMO. SECURITY DEFINER ignora RLS; so o GRANT protege.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'sureya_aprender_apelido_banco(text, text, uuid, uuid, uuid)',
    'sureya_esquecer_apelido_banco(text, uuid)',
    'sureya_identificar_entrada_meses(uuid, uuid, uuid[], uuid, boolean, uuid)',
    'sureya_debitos_em_aberto(uuid, uuid)'
  ] loop
    perform ci64('anon nao executa ' || split_part(f, '(', 1),
                 not has_function_privilege('anon', f, 'execute'),
                 'a porta esta aberta para o anonimo — e a funcao ignora RLS');
  end loop;
end $$;

drop function if exists ci64(text, boolean, text);
