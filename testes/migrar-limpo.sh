#!/usr/bin/env bash
# ============================================================================
# O REPOSITÓRIO RECONSTRÓI O BANCO?
#
# Aplica a trilha inteira de `migrations/` a um PostgreSQL vazio e falha se
# qualquer arquivo não aplicar.
#
# Esta é a pergunta central do Build 0. Ela já foi respondida com "não" três
# vezes, e cada vez o motivo era diferente:
#
#   · 0051 fazia `select id into v_org from orgs limit 1` e inseria dados de
#     uma operação específica: em banco vazio, `v_org` nulo estourava o
#     `not null` de `ruas.org_id`;
#   · `quitacoes` e 5 colunas de `movimentos` não existiam em migration alguma;
#   · 32 colunas e 15 funções `sureya_*` só existiam dentro do banco.
#
# Nenhum desses aparece em revisão de código. Todos aparecem aqui, na hora.
#
# USO
#   testes/migrar-limpo.sh                  # sobe um Postgres temporário
#   DATABASE_URL=postgres://... testes/migrar-limpo.sh   # usa um já existente
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
PORTA=${PGPORT_TESTE:-55433}
DIR=${PGDATA_TESTE:-/tmp/sureya-migrar-limpo}
PROPRIO=0

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "$PGBIN" ]; then
    echo "PostgreSQL não encontrado. Instale-o ou aponte DATABASE_URL."; exit 2
  fi
  PROPRIO=1
  rm -rf "$DIR"; mkdir -p "$DIR"
  DONO=$(id -u postgres >/dev/null 2>&1 && echo postgres || echo "$(id -un)")
  chown "$DONO" "$DIR" 2>/dev/null || true
  RODA() { if [ "$DONO" = "$(id -un)" ]; then bash -c "$1"; else su "$DONO" -c "$1"; fi; }
  RODA "$PGBIN/initdb -D $DIR -U postgres --auth=trust" >/dev/null 2>&1
  RODA "$PGBIN/pg_ctl -D $DIR -o '-p $PORTA -k /tmp' -l $DIR/pg.log start" >/dev/null 2>&1
  for _ in $(seq 1 20); do pg_isready -h /tmp -p "$PORTA" >/dev/null 2>&1 && break; sleep 0.5; done
  export PGHOST=/tmp PGPORT=$PORTA PGUSER=postgres
  psql -q -d postgres -c "drop database if exists sureya_limpo" >/dev/null 2>&1
  psql -q -d postgres -c "create database sureya_limpo" >/dev/null
  ALVO="-d sureya_limpo"
else
  ALVO="$DATABASE_URL"
fi

encerrar() {
  if [ "$PROPRIO" = "1" ]; then
    RODA "$PGBIN/pg_ctl -D $DIR -m immediate stop" >/dev/null 2>&1
    rm -rf "$DIR"
  fi
}
trap encerrar EXIT

# ---------------------------------------------------------------------------
# O que o Supabase fornece pronto e não é responsabilidade do repositório.
# Se um destes stubs precisar crescer, é sinal de dependência nova em
# infraestrutura — vale registrar, não esconder.
# ---------------------------------------------------------------------------
psql -q $ALVO -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(),
  email text, raw_user_meta_data jsonb, created_at timestamptz default now(), banned_until timestamptz);
create table if not exists storage.buckets (id text primary key, name text,
  public boolean default false, file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid, created_at timestamptz default now(), metadata jsonb);
-- `unaccent_simples` é usada por sureya_palpites_entrada e também só existe no
-- banco de produção. Não tem prefixo `sureya_`, então nem saiu na extração.
create or replace function unaccent_simples(t text) returns text language sql immutable as $$
  select translate(coalesce(t,''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                                   'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'); $$;
SQL

ok=0; falhou=0
for f in $(ls migrations/*.sql | grep -vE "SEED|_diagnostico" | sort -V); do
  saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f "$f" 2>&1)
  if [ $? -eq 0 ]; then
    ok=$((ok+1))
  else
    falhou=$((falhou+1))
    echo "FALHOU  $(basename "$f")"
    echo "$saida" | grep -m2 -E "ERROR|DETAIL" | sed 's/^/         /'
  fi
done

echo
echo "============================================================"
echo "migrations aplicadas: $ok    falharam: $falhou"
if [ "$falhou" -gt 0 ]; then
  echo "O repositório NÃO reconstrói o banco."
  echo "============================================================"
  exit 1
fi

# ---------------------------------------------------------------------------
# O PLACAR
#
# Os numeros da direita vieram da consulta 5 de
# `migrations/_diagnostico/0063_gerar_ddl_do_que_falta.sql`, rodada no Supabase
# de producao em 21/08/2026. Divergencia aqui significa objeto que existe num
# lado e nao no outro — foi assim que apareceram as 32 colunas, as 15 funcoes e
# os 4 gatilhos que so existiam dentro do banco.
#
# Quando producao mudar de proposito, atualize estes esperados no mesmo commit:
# o valor do teste esta em eles serem a verdade conferida, nao um numero velho.
# ---------------------------------------------------------------------------
ESPERADO_TABELAS=${ESPERADO_TABELAS:-55}
# DELTA DELIBERADO DE TABELAS
#   0075  +1  competencias — um mes fechado passa a ser um FATO, com data e
#             autor. Antes, "fechado" era so a lembranca de quem apertou o botao.
#   0085  +1  modelos_mensagem — os textos da casa viram um CONJUNTO. A frase
#             de reserva escrita dentro da funcao chegou na tela em producao.
#   0091  +1  familia_responsavel_log — "muda ano apos ano" e um fato com data
#   0095  +1  falecidos — um tumulo guarda varias pessoas, e cada data
#             precisa ter dono para dar para agrupar em vez de disparar 3x.
#   0096  +1  eventos_memoria — o calendario, e o registro do que NAO foi
#             enviado e por que.
#   0110  +1  regua_degraus — a regua era tres nomes fixos com os degraus
#             dentro do TypeScript. Personalizar exigia mexer em codigo, que e
#             o oposto de "vou ajustando".
#   0117  +2  assinaturas_extras e entregas_extras — "flores no ultimo sabado"
#             so existia na cabeca do Leandro, e a compra do buque era chute.
#   0119  +1  pausas_tumulo — parar nao e cancelar. O jeito antigo de parar era
#             desmarcar `contratado`, que APAGA o combinado.
#   0127  +1  servicos_arquivados — o Leandro mandou apagar 257 lavagens da
#             tela de Avulsos. A copia vem antes do delete: o que sai do lugar
#             vivo muda de sala, nao evapora.
TABELAS_DELTA=${TABELAS_DELTA:-11}
ESPERADO_FUNCOES=${ESPERADO_FUNCOES:-56}
ESPERADO_GATILHOS=${ESPERADO_GATILHOS:-14}

# DELTA DELIBERADO DE GATILHOS
#   0058  +1  trg_espelha_plano_no_jazigo   (ja contado no 14 de producao)
#   0071  +2  trg_espelha_movimento_na_conta, trg_espelha_status_movimento
#   0081  +1  trg_jazigo_herda_familia — jazigo com dono pertence a familia do
#             dono, e sem isso a lavagem no jazigo importado falha inteira
#   0074  -2  os dois da 0071 sao APOSENTADOS: com `movimentos` congelado nao ha
#             mais o que espelhar, e gatilho que nunca dispara engana quem le o
#             esquema depois.
# Soma zero. Enquanto a 0074 nao subir, producao tera 2 gatilhos a MAIS que o
# repositorio — e este numero volta a fechar quando ela subir.
#   0095  +1  trg_falecido_espelha — mantem tumulos.falecido_nome, que 21
#             arquivos leem, igual ao nome do falecido principal.
#   0098  +1  trg_cc_competencia — a competencia estava NULA em 100% dos
#             lancamentos; sem ela nao ha relatorio por competencia.
#   0102  +1  trg_guarda_quem_acerta_a_conta — recusa tirar a marca do ULTIMO
#             que acerta a conta de uma familia que ainda tem gente.
#   0131  +2  tg_nome_proprio_cliente e tg_nome_proprio_familia — sao cinco
#             portas que escrevem nome; consertar numa e deixar quatro
#             escrevendo torto e o defeito de forma de sempre.
GATILHOS_DELTA=${GATILHOS_DELTA:-11}
ESPERADO_POLICIES=${ESPERADO_POLICIES:-62}

# AS 7 POLICIES QUE PRODUCAO TEM A MAIS — E QUE NAO VAMOS RECRIAR
#
# A extracao (CONSULTA A) resolveu o misterio: NAO sao regras novas. Sao a
# MESMA regra criada duas vezes, por migrations diferentes, com nomes
# diferentes, em 7 tabelas:
#
#   assinaturas_push        assinaturas_push_org + push_org
#   categorias_financeiras  cat_fin_org          + categorias_financeiras_org
#   entradas_banco          entradas_banco_org   + entradas_org
#   historico_cliente       hist_cliente_org     + historico_cliente_org
#   lancamentos             lanc_org             + lancamentos_org
#   servicos_extras         extras_org           + servicos_extras_org
#   telefones_ignorados     tel_ign_org          + telefones_ignorados_org
#
# Duplicata permissiva nao muda o acesso (elas se somam com OU), mas e uma
# armadilha de manutencao: apagar uma deixa a outra valendo, e o commit parece
# ter apertado. Por isso a 0067 usa policy RESTRICTIVE, que entra com E.
#
# O repositorio cria so a versao unica de cada. Somamos as 7 aqui para o placar
# fechar, em vez de reproduzir a duplicacao no repositorio.
POLICIES_DUPLICADAS=${POLICIES_DUPLICADAS:-7}

# DELTA DELIBERADO DE POLICIES
#   0059  +1   quitacoes_org (a tabela e nova no repositorio)
#   0067  +41  as restritivas que separam campo de administracao
#   0074  +1   movimentos_congelado (RESTRICTIVE: o razao antigo vira historia)
#   0085  +1   trg_fila_politica_de_foto — a chave de envio e o texto de
#              reserva aplicados na PORTA da fila, valendo para todo caminho
#   0089  +1   trg_textos_iniciais — organizacao nova nascia sem texto nenhum
#   0091  +1   trg_primeiro_contato_assume — familia criada sozinha ganha dono
#   0075  +2   competencias_org e competencias_so_admin_escreve
#   0079  +5   as restritivas de DELETE que faltavam (clientes, tumulos,
#              membros, orgs, movimentos) — a 0067 tinha posto a guarda so no
#              WITH CHECK, que o DELETE nao consulta
#   0085  +4   modelos_mensagem: a de org mais uma restritiva POR COMANDO
#   0091  +4   familia_responsavel_log, mesmo desenho
#              (insert, update, delete) — de novo a licao da 0079
# Ajuste no mesmo commit em que criar ou remover policy.
#   0095  +2  falecidos: a da org e a restritiva de DELETE (o campo cadastra,
#             so admin apaga).
#   0096  +4  eventos_memoria: a da org e uma restritiva POR COMANDO.
#   0110  +4  regua_degraus: a da org e uma restritiva POR COMANDO (a licao da
#             0079 — DELETE nunca consulta `with check`).
#   0117  +8  assinaturas_extras e entregas_extras: a da org e uma restritiva
#              POR COMANDO em cada uma — de novo a licao da 0079.
#   0119  +4  pausas_tumulo, mesmo desenho.
#   0127  +5  servicos_arquivados: a da org, uma restritiva POR COMANDO e a que
#              fecha para o campo. Um arquivo que se apaga nao e arquivo.
POLICIES_DELTA=${POLICIES_DELTA:-89}

# DELTA DELIBERADO DE FUNCOES
#   0066  +1  sureya_concluir_lavagem
#   0068  +1  sureya_iniciar_lavagem
#   0071  +2  sureya_espelha_movimento_na_conta, sureya_espelha_status_movimento
#   0073  +1  sureya_lancar  (a porta unica do razao da familia)
#   0074  -2  as duas de espelho da 0071 sao aposentadas junto com os gatilhos
#   0075  +4  sureya_funil, sureya_pendencias_da_competencia,
#             sureya_fechar_competencia, sureya_reabrir_competencia
#   0077  +4  sureya_fila_reservar, sureya_fila_soltar, sureya_fila_concluir,
#             sureya_fila_destravar
#   0078  +2  sureya_arquivos_do_cliente, sureya_expurgo_previa
#   0080  +1  sureya_conferencia_cadastro
#   0081  +1  sureya_jazigo_herda_familia
#   0082  +2  sureya_reordenar_dia, sureya_priorizar_servico
#   0085  +4  sureya_texto_modelo, sureya_envia_fotos, sureya_primeiro_nome,
#             sureya_fila_politica_de_foto (o gatilho da porta da fila)
#   0086  +1  sureya_textos_do_tipo — a lista que a tela oferece
#   0088  +1  sureya_datar_lavagem — a limpeza anotada depois cai no mes certo
#   0089  +2  sureya_semear_textos e a casca sureya_textos_iniciais
#   0091  +3  sureya_definir_responsavel (+ o miolo _interno) e
#             sureya_primeiro_contato_assume
#   0092  +1  sureya_agenda_fora_do_lugar — a UNICA definicao de "fora do
#             lugar". sureya_reorganizar_agenda nao entra na conta: ela cai e
#             nasce de novo (o retorno ganhou colunas), mas ja existia.
#   0094  +1  sureya_familia_silencia — o que esta familia nao recebe. A 0093
#             nao entra: view nao e funcao, e este contador so conta pg_proc.
# Saldo: +30. As demais migrations desta
# leva (0057, 0060, 0062) so SUBSTITUEM corpo de funcao que ja estava la —
# por isso nao entram na conta. Ajuste no mesmo commit em que criar funcao.
#   0095  +1  sureya_espelhar_falecido_principal
#   0096  +6  sureya_recebe_lembrete, sureya_data_no_ano,
#             sureya_gerar_eventos_memoria, sureya_semear_textos_memoria,
#             sureya_texto_memoria, sureya_lembretes_do_dia
#   0097  +1  sureya_conferir_familia — o ok da conferencia vira um fato com
#             data e autor. sureya_conferencia_cadastro nao entra: ela cai e
#             nasce de novo (o retorno ganhou colunas), mas ja existia.
#   0098  +2  sureya_carimbar_competencia (o gatilho) e
#             sureya_conferir_evento — o ok por lancamento.
#   0100  +2  sureya_lavagens_no_mes e sureya_valor_da_lavagem — o combinado
#             e MENSAL e cada lavagem desconta a fracao do mes.
#   0102  +1  sureya_guarda_quem_acerta_a_conta — o teto de UM pagador caiu,
#             entao o PISO de um passa a precisar de guarda propria. Antes ele
#             vinha de graca do indice unico: com um so, desmarcar era trocar.
#   0104  +2  sureya_meses_da_cobranca e sureya_cobrar_competencias — a divida
#             passa a ser do CONTRATO, lancada por competencia. Antes quem
#             gerava dinheiro era a lavagem, e nada alimentava a competencia.
#   0105  +1  sureya_painel_do_mes — todo numero do painel sai de UMA funcao.
#             Cada cartao com a sua consulta e como a agenda quebrou: contador
#             e movedor com definicoes diferentes, e o aviso que nunca zerava.
#   0106  +1  sureya_etapas_das_familias — a lista dizia "falta contrato" numa
#             familia conferida e completa: ela perguntava a FAMILIA o valor e
#             o inicio, que a D-24 moveu para o TUMULO. Uma definicao so.
#   0108  +2  sureya_fundir_familias e sureya_excluir_familia — 31 nomes
#             repetidos, 97 familias, NENHUMA vazia. Duplicata pede fusao;
#             excluir e para o que sobra depois.
#   0109  +1  sureya_cobrancas_a_lancar — a tela precisa avisar "2 competencias
#             a lancar" ANTES de alguem mandar cobrar. (O cobrador ganhou um
#             parametro, mas a versao velha foi derrubada: nao soma.)
#   0112  +0  o cobrador e a previa foram REESCRITOS (uma competencia por mes
#             do periodo, e pre/pos-pago), sem funcao nova.
#   0111  +1  sureya_regua_do_dia — a regua ENFILEIRA, nunca envia. Nao ha
#             caminho daqui para o WhatsApp, e e de proposito.
#   0113  +1  sureya_cancelar_reenvio_do_servico — descartar na fila de
#             liberacao nao alcancava a tentativa de reenvio: a foto descartada
#             sairia sozinha no dia em que a entrega voltasse.
# Saldo: +52.
#   0117  +4  sureya_proxima_data_extra, sureya_gerar_entregas_extras,
#             sureya_registrar_entrega, sureya_compras_de_extras
#   0119  +3  sureya_tumulo_parado, sureya_parar_servico, sureya_retomar_servico
#   0120  +1  sureya_painel_detalhe — o relatorio por tras de cada cartao. O
#             painel era um placar: dizia "11 jazigos" e nao levava aos onze.
#   0125  +2  sureya_aprender_ordem_na_rua (o gatilho que faz a rua aprender)
#             e sureya_soltar_roteiro. Mais 1 gatilho.
#   0124  +2  sureya_cobranca_adiada e sureya_adiar_mensagem. A regua foi
#             recriada (a lista de retorno ganhou `adiados`), nao acrescentada.
#   0123  +1  sureya_registrar_pagamento — o pagamento com desconto, juros,
#             multa e outros nasce inteiro ou nao nasce. O painel foi remendado
#             por substituicao de texto, sem funcao nova.
#   0122  +3  sureya_importar_extrato, sureya_classificar_saidas e
#             sureya_chave_entrada_banco (o gatilho da chave). Mais 1 tabela
#             (importacoes_extrato), 1 gatilho e 5 policies.
#             `entradas_banco` tinha ZERO linhas desde a 0045: a tabela, a
#             API, a tela e o palpiteiro existiam, e nada nunca entrou porque
#             so dava para digitar uma a uma. Em agosto foram 112 Pix.
#   0121  +3  sureya_saude_whatsapp, sureya_rastro_telefone,
#             sureya_limpar_eventos_webhook — as tres respondem a mesma
#             pergunta em escalas diferentes: "chegou?". Antes delas o sistema
#             recebeu 1215 eventos e nao sabia dizer o destino de nenhum.
#   0131  +2  sureya_nome_proprio e sureya_arruma_nome — 110 dos 339 contatos
#             estavam em CAIXA ALTA, e o nome vai nas mensagens.
FUNCOES_DELTA=${FUNCOES_DELTA:-73}

tb=$(psql -q $ALVO -tAc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")
fn=$(psql -q $ALVO -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sureya\_%';")
tg=$(psql -q $ALVO -tAc "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal;")
po=$(psql -q $ALVO -tAc "select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';")

divergiu=0
linha() {
  if [ "$2" = "$3" ]; then
    printf "  %-10s %4s  = producao (%s)\n" "$1" "$2" "$3"
  else
    printf "  %-10s %4s != producao (%s)   <-- DIVERGENCIA\n" "$1" "$2" "$3"
    divergiu=1
  fi
}
echo "PLACAR — repositorio reconstruido x producao (21/08/2026)"
linha "tabelas"  "$tb" "$((ESPERADO_TABELAS + TABELAS_DELTA))"
linha "funcoes"  "$fn" "$((ESPERADO_FUNCOES + FUNCOES_DELTA))"
linha "gatilhos" "$tg" "$((ESPERADO_GATILHOS + GATILHOS_DELTA))"
linha "policies" "$((po + POLICIES_DUPLICADAS))" "$((ESPERADO_POLICIES + POLICIES_DELTA))"
if [ "$POLICIES_DUPLICADAS" -gt 0 ]; then
  echo
  echo "  nota: $POLICIES_DUPLICADAS policies duplicadas em producao nao sao"
  echo "        reproduzidas aqui de proposito (mesma regra, dois nomes)."
fi
echo

if [ "$divergiu" = "1" ]; then
  echo "As migrations aplicam, mas o resultado NAO e o banco de producao:"
  echo "algum objeto existe so de um lado."
  echo "Rode a consulta 5 do _diagnostico/0063 e compare."
  echo "============================================================"
  exit 1
fi

# ---------------------------------------------------------------------------
# O CONGELAMENTO DO RAZAO ANTIGO
#
# O placar prova que os OBJETOS existem. Nao prova que eles se comportam — e
# "esta congelado" e exatamente o tipo de afirmacao que ninguem percebe estar
# errada ate alguem escrever dinheiro no lugar errado. Por isso tem prova
# propria, aqui, em banco limpo, rodando como superusuario (mais poderoso que o
# service role: se a trava segura ai, segura em qualquer papel).
# ---------------------------------------------------------------------------
echo "CONGELAMENTO — o razao antigo virou historia"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/congelamento.sql 2>&1); then
  echo "$saida" | grep -E "CONGELAMENTO FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "O razao antigo voltou a aceitar escrita, ou o novo parou de aceitar."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# AS ESCRITAS DE DINHEIRO
#
# Depois da 0073 nenhuma funcao escreve em `movimentos`. Aqui cada porta de
# dinheiro e exercitada de verdade e cobrada pelo EFEITO — passar sem erro nao
# e prova de nada quando o defeito possivel e "lancou no lugar errado".
# ---------------------------------------------------------------------------
echo "ESCRITAS — as portas de dinheiro"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/escritas.sql 2>&1); then
  echo "$saida" | grep -E "ESCRITAS FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Alguma porta de dinheiro nao faz o que promete."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O FUNIL E O FECHAMENTO
#
# O que precisa ser provado aqui nao e "a funcao roda" — e que ela RECUSE. Um
# fechamento que sempre aceita e decorativo, e o estrago nao aparece no dia:
# aparece quando o numero ja fechado muda depois.
# ---------------------------------------------------------------------------
echo "FECHAMENTO — o funil, e a recusa"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/fechamento.sql 2>&1); then
  echo "$saida" | grep -E "FECHAMENTO FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "O fechamento aceita o que nao deveria, ou recusa o que deveria passar."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O OUTBOX DA FILA
#
# O criterio de saida do Build 6 e literal: "envio repetido nao duplica
# mensagem". Isso nao da para verificar lendo — so exercitando a falha no meio
# do envio e conferindo de onde a retentativa recomeca.
# ---------------------------------------------------------------------------
echo "OUTBOX — a fila lembra o que aconteceu"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/outbox.sql 2>&1); then
  echo "$saida" | grep -E "OUTBOX FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "A fila pode estar reenviando foto que ja saiu."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# A FAMILIA EXISTE SEM CONTATO
#
# O efeito que nao aparece em tela: a lavagem de uma familia sem contato tem de
# virar cobranca do mesmo jeito. Antes da 0091 o debito era decidido pelo
# contato, e sem ele o dinheiro sumia calado.
# ---------------------------------------------------------------------------
echo "FAMILIA — existe sem contato, e o responsavel pode mudar"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/familia_sem_contato.sql 2>&1); then
  echo "$saida" | grep -E "FAMILIA FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Cadastro travado sem telefone, ou limpeza que acontece e nao vira cobranca."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O CONTATO DO SITE TEM PARA ONDE IR
#
# O formulario publico prometia "respondemos no mesmo dia" e avisava apontando
# para uma rota que o middleware devolve 404. O teste cobra a fila que faltava.
# ---------------------------------------------------------------------------
echo "CONTATOS — a fila de quem escreveu pelo site"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/contatos.sql 2>&1); then
  echo "$saida" | grep -E "CONTATOS FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Um contato do site pode ficar sem atendimento e ninguem descobre."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# A LIMPEZA REGISTRADA DEPOIS, PELO PAINEL
#
# Ate a 0088 este caminho tinha implementacao propria da regra de dinheiro. O
# teste cobra que agora ele passa pela MESMA transacao do campo, e que a data
# retroativa sobrevive a ela.
# ---------------------------------------------------------------------------
echo "REGISTRO PELO PAINEL — limpeza feita antes, anotada depois"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/registro_painel.sql 2>&1); then
  echo "$saida" | grep -E "REGISTRO FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Limpeza anotada pelo painel pode nao virar dinheiro, nem foto, nem cair no mes certo."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# OS TEXTOS DA CASA E A CHAVE DE ENVIO
#
# O que a Sureya viu na tela em 22/08 foi a frase de reserva escrita dentro da
# funcao, nao o texto da casa. Aqui esse caminho e percorrido de proposito.
# ---------------------------------------------------------------------------
echo "MENSAGENS — o conjunto de textos e a chave de envio de fotos"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/mensagens.sql 2>&1); then
  echo "$saida" | grep -E "MENSAGENS FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "A familia pode receber um bilhete de sistema, ou receber foto que pediu para nao receber."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# AS RUAS COSTURADAS
#
# A 0084 e migration de DADOS: em banco vazio ela nao faz nada, entao aplicar
# sem erro nao prova coisa alguma. Este teste monta a planta das 4 quadras,
# reaplica o arquivo e cobra o efeito — inclusive rodando duas vezes.
# ---------------------------------------------------------------------------
echo "ROTEIRO — a Principal em todas as quadras, as ruas partidas costuradas"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/roteiro.sql 2>&1); then
  echo "$saida" | grep -E "ROTEIRO FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "A Nina pode estar andando a mesma rua duas vezes no mesmo dia."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# REORGANIZAR A AGENDA — contador e movedor tem de dar o mesmo numero
#
# O botao "Reorganizar a agenda" nao funcionava, e nao por acaso: a tela
# contava com uma regra e o banco movia com outra. Duas lavagens numa segunda
# passada eram "fora do lugar" para o contador (estavam no passado) e estavam
# no lugar para o movedor (segunda e dia de trabalho). O aviso nunca zerava.
# Este teste monta o mesmo cenario e cobra que as duas pontas concordem.
# ---------------------------------------------------------------------------
echo "AGENDA — o que o aviso conta e o que o botao move"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/agenda.sql 2>&1); then
  echo "$saida" | grep -E "AGENDA FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "O aviso da agenda vai voltar a ficar na tela para sempre."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# A LISTA E A FICHA DIZEM A MESMA COISA
#
# A ficha dizia "conferida, nada faltando" e a lista, no mesmo minuto, dizia
# "iniciar controle · sem plano". A lista perguntava a FAMILIA o valor e o
# inicio, que a D-24 moveu para o TUMULO.
# ---------------------------------------------------------------------------
echo "ETAPA — a lista nao contradiz a ficha"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/etapa_da_familia.sql 2>&1); then
  echo "$saida" | grep -E "ETAPA FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Duas telas com contas diferentes sobre os mesmos fatos."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# A REGUA DE COBRANCA
#
# O risco aqui tem nome: mandar a mesma cobranca duas vezes, ou mandar para
# quem ja pagou. A fila nao tem desfazer depois de liberada.
# ---------------------------------------------------------------------------
echo "REGUA — cobra quem deve, uma vez, e nunca envia sozinha"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/regua.sql 2>&1); then
  echo "$saida" | grep -E "REGUA FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Cobrar quem pagou, ou cobrar duas vezes, custa a relacao."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# FLORES E EXTRAS
#
# O risco aqui tem nome: comprar buque a mais toda semana, ou deixar a familia
# sem flor no sabado que ela espera. "Ultimo sabado" nao e "quarto sabado", e
# em tres meses de cada quatro os dois dao a mesma data — o erro so aparece no
# mes de cinco sabados, e aparece na mao de quem esperava a flor.
# ---------------------------------------------------------------------------
echo "PAUSA — parar e retomar a pedido da familia"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/pausa.sql 2>&1); then
  echo "$saida" | grep -E "PAUSA FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Cobrar de quem pediu para parar e a conversa mais cara desta casa."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

echo "FLORES — o ultimo sabado, a compra prevista e o que virou dinheiro"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/flores.sql 2>&1); then
  echo "$saida" | grep -E "FLORES FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Buque comprado a mais e prejuizo; buque a menos e telefonema."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O RASTRO DA MENSAGEM
#
# O risco aqui ja se realizou: dezenove dias de WhatsApp mudo (04/08 a 22/08 de
# 2026) sem que nenhuma tela dissesse isso, e uma pergunta — "o comprovante da
# Josiane chegou?" — sem resposta possivel. O que este teste protege e a
# capacidade de RESPONDER, que e diferente de a mensagem chegar.
# ---------------------------------------------------------------------------
echo "RASTRO — para onde foi a mensagem, e ha quanto tempo o whats esta calado"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/rastro_whatsapp.sql 2>&1); then
  echo "$saida" | grep -E "RASTRO FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Sem rastro, 'a mensagem sumiu' vira deducao — e deducao ja errou aqui."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O EXTRATO
#
# O risco aqui tem valor em reais: importar duas vezes e creditar duas vezes,
# ou o gasto pessoal da Sureya virar despesa do negocio. `entradas_banco` ficou
# com zero linhas desde a 0045 — agora que entra em lote, entra certo.
# ---------------------------------------------------------------------------
echo "EXTRATO — o extrato entra inteiro, sem dobrar e sem misturar o pessoal"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/extrato.sql 2>&1); then
  echo "$saida" | grep -E "EXTRATO FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Credito em dobro e dinheiro que a familia nao mandou."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O PAGAMENTO COMPOSTO
#
# O risco aqui e o mais caro: mexer no que a familia deve. Desconto que nao
# abate, juro que abate ao contrario, ou cinco linhas entrando pela metade.
# ---------------------------------------------------------------------------
echo "PAGAMENTO — desconto, juros, multa e outros na mesma escrita"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/pagamento_composto.sql 2>&1); then
  echo "$saida" | grep -E "PAGAMENTO FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Conta de familia errada e a confianca que nao volta."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# ADIAR A COBRANCA
#
# O risco aqui nao e um numero errado: e uma promessa quebrada. Ela disse
# "combinado, dia 15" e uma segunda cobranca sai no dia 12.
# ---------------------------------------------------------------------------
echo "ADIAR — a data combinada segura a regua ate la"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/adiar_cobranca.sql 2>&1); then
  echo "$saida" | grep -E "ADIAR FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Cobrar depois de combinar uma data e a confianca que nao volta."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O ROTEIRO
#
# Dois riscos: o refazer levar junto o que a Nina ja abriu no celular, e a rua
# aprender por cima da ordem que alguem digitou a mao.
# ---------------------------------------------------------------------------
echo "RECALCULO — a rua aprende, e o refazer so solta o que pode"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/roteiro_recalculo.sql 2>&1); then
  echo "$saida" | grep -E "ROTEIRO FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Rota que muda debaixo de quem ja saiu para o campo e dia perdido."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O NOME DA PESSOA
#
# Um erro aqui nao da erro: da uma mensagem constrangedora para uma familia de
# luto, e ninguem descobre pelo log.
# ---------------------------------------------------------------------------
echo "NOME — maiuscula arrumada sem perder palavra, e so o primeiro na mensagem"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/nome_proprio.sql 2>&1); then
  echo "$saida" | grep -E "NOME FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "O campo nome guarda a referencia que acha a pessoa no cemiterio."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# A REGUA QUE VOLTA A FALAR
#
# O defeito consertado na 0130 nao dava erro: a regua parava no dia 31 e
# ninguem via. O risco de consertar errado tem a mesma cara — passar a falar
# demais, ou de menos, calado.
# ---------------------------------------------------------------------------
echo "REGUA — o ultimo degrau nao pode ser o ultimo recado"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/regua_repete.sql 2>&1); then
  echo "$saida" | grep -E "REGUA FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Cobranca que nao sai e dinheiro parado; cobranca todo dia e perseguicao."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# A PORTA DO ANONIMO
#
# Nao confere uma lista de funcoes: confere uma REGRA contra todas as que
# existirem no dia. O defeito de 24/08 nao foi alguem abrir a porta — foi
# ninguem fechar: o Supabase concede EXECUTE a anon por padrao em `public`.
# ---------------------------------------------------------------------------
echo "ANONIMO — security definer nao passa pela RLS; o grant e o cadeado"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/porta_do_anonimo.sql 2>&1); then
  echo "$saida" | grep -E "ANONIMO FALHOU|ERROR|^    sureya" | sed 's/^/  /'
  echo
  echo "A chave anonima e publica. Funcao aberta a ela e funcao aberta a todos."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# DE ONDE VEIO A LAVAGEM
#
# O risco nao e a coluna faltar: e a regra voltar a ser deduzida por ausencia.
# Foi assim que 258 de 262 servicos viraram "avulsos" — uma conta certa ate a
# 0100 que ninguem reviu quando o contrato mudou de casa.
# ---------------------------------------------------------------------------
echo "ORIGEM — contrato nao e pedido, e nao saber tem nome proprio"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/origem_do_servico.sql 2>&1); then
  echo "$saida" | grep -E "ORIGEM FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Avulso deduzido por ausencia foi o defeito. Nao pode voltar."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O PAINEL DO MES
#
# O risco aqui nao e um numero errado: e DOIS numeros que discordam. O aging
# tem de somar o em aberto, a lista de devedores tem de somar o mesmo, e a
# quebra das lavagens tem de fechar com o total.
# ---------------------------------------------------------------------------
echo "PAINEL — os numeros do mes batem entre si"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/painel_do_mes.sql 2>&1); then
  echo "$saida" | grep -E "PAINEL FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Um painel que discorda de si mesmo ensina a nao confiar na tela."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# A COBRANCA E DO CONTRATO
#
# O razao respondia por duas perguntas: quanto a familia deve, e quais limpezas
# aconteceram. Enquanto a lavagem lancava o debito, a segunda escrevia na
# primeira — limpeza adiada baixava o mes, limpeza anotada em atraso virava
# divida retroativa. A 0104 separa as duas.
# ---------------------------------------------------------------------------
echo "COBRANCA — a divida e do contrato, por competencia"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/cobranca_por_competencia.sql 2>&1); then
  echo "$saida" | grep -E "COBRANCA FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Ou a familia e cobrada duas vezes, ou nao e cobrada."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# O MOTOR DE MEMORIA RODA
#
# A 0096 escreveu o motor inteiro e ele nunca foi executado. Um motor que trata
# de luto nao pode estrear na casa de alguem: aqui ele roda pela primeira vez,
# com as supressoes obrigatorias sendo cobradas uma a uma.
# ---------------------------------------------------------------------------
echo "MEMORIA — datas, luto e a chave geral"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/memoria.sql 2>&1); then
  echo "$saida" | grep -E "MEMORIA FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Lembrete de luto e o erro que nao se desfaz."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# QUEM ACERTA A CONTA PODE SER MAIS DE UM
#
# A tela oferecia "tambem acerta a conta" e o banco recusava o segundo clique:
# um indice UNICO parcial prendia a familia a um pagador so. O teste cobra que
# o teto caiu, que o PISO ficou (nunca zero) e que trocar o titular — outra
# pergunta — nao apaga mais quem paga.
# ---------------------------------------------------------------------------
echo "PAGADORES — mais de um pode acertar a conta, nunca nenhum"
if ! saida=$(psql -q $ALVO -v ON_ERROR_STOP=1 -f testes/quem_acerta_a_conta.sql 2>&1); then
  echo "$saida" | grep -E "PAGADORES FALHOU|ERROR" | sed 's/^/  /'
  echo
  echo "Ou a familia volta a ter um pagador so, ou pode ficar sem nenhum."
  echo "============================================================"
  exit 1
fi
echo "$saida" | sed -n 's/.*NOTICE: *ok */  ok  /p' || true
echo

# ---------------------------------------------------------------------------
# NINGUEM ESCREVE NO RAZAO ANTIGO
#
# Depois da 0074 a lista tem de estar VAZIA. Qualquer nome aqui e uma funcao
# escrevendo dinheiro numa tabela congelada — ela vai falhar em producao com
# `permission denied`, e o pior caso nao e o erro: e alguem "consertar" o erro
# devolvendo a escrita ao razao antigo e voltando a ter dois saldos.
# ---------------------------------------------------------------------------
achadas=$(psql -q $ALVO -tAc "
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.prosrc ~* '(insert into|update|delete from)[[:space:]]+movimentos'
   order by 1;" | tr '\n' ' ')
if [ -n "$(echo "$achadas" | tr -d ' ')" ]; then
  echo "ESCREVEM NO RAZAO ANTIGO (deveria estar vazio):"
  for f in $achadas; do printf "  !!  %s\n" "$f"; done
  echo
  echo "\`movimentos\` esta congelado desde a 0074. Ver DECISOES.md D-01."
  echo "============================================================"
  exit 1
fi
echo "NINGUEM ESCREVE NO RAZAO ANTIGO — congelado desde a 0074."
echo

echo "O repositorio reconstroi o banco."
echo "============================================================"
