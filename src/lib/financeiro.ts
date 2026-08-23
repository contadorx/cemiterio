import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { diaOperacao, proximaData } from "./vencimento";
import { auditar } from "./auditoria";

/**
 * O QUE CONTA COMO MOVIMENTO **DO PERIODO**, E O QUE E SO HISTORIA
 * ---------------------------------------------------------------------------
 * `conta_corrente` guarda duas coisas com a mesma cara de lancamento:
 *
 *   · o que ACONTECEU — uma limpeza, um pagamento, uma competencia fechada;
 *   · o que a familia JA DEVIA quando entrou no sistema (`origem = 'abertura'`).
 *
 * A segunda tem data, e a data e o dia em que alguem digitou. Em producao ha
 * uma linha assim: debito de R$ 240,00 carimbado 17/08/2026, que e divida
 * anterior ao sistema inteiro.
 *
 * Para o SALDO, ela conta — a familia deve mesmo.
 * Para qualquer relatorio POR PERIODO, ela nao pode contar: somaria R$ 240,00
 * de "limpeza executada em agosto" que ninguem executou, e o mes fecharia com
 * um numero que nao corresponde a trabalho nenhum.
 *
 * E a mesma confusao que a auditoria descreve na home (CA-02): misturar o que
 * aconteceu no mes com o que a familia devia desde sempre.
 *
 * Esta funcao existe para a regra morar num lugar so. Se aparecer outra origem
 * de historia migrada, e aqui que ela entra — e todos os relatorios acertam
 * juntos.
 */
export function ehDoPeriodo(origem: string | null | undefined): boolean {
  return origem !== "abertura";
}

export interface Saldo {
  saldo: number;      // só confirmados: créditos − débitos, no razão da FAMÍLIA
  aConferir: number;  // créditos informados, ainda não batidos com o extrato
  /**
   * VENCIDO E A VENCER SÃO COISAS DIFERENTES (0114).
   *
   * `conta_corrente.data` é o VENCIMENTO num débito de contrato. Quem paga no
   * fim do período tem a competência de julho vencendo em dezembro: os dois
   * meses já prestados são receita de julho e de agosto e não são dívida
   * nenhuma até o dia 10 de dezembro.
   *
   * `saldo` continua sendo a posição inteira (é o que o fechamento e o
   * histórico leem). Quem pergunta "posso cobrar?" lê `vencido`.
   *
   * Mesmo sinal de `saldo`: negativo = deve.
   */
  vencido: number;
  /** Débito já lançado cujo vencimento ainda não chegou. Sempre positivo. */
  aVencer: number;
  /** true = a pessoa não tem família; o saldo devolvido é zero por ausência de
   *  dado, não por estar em dia. Hoje não ocorre em nenhum dos 298 cadastros. */
  semFamilia?: boolean;
}

/**
 * O SALDO E DA FAMILIA — decisao de 22/08/2026.
 *
 * A pergunta que o Build 4 precisava responder era "a divida e da pessoa ou da
 * familia?". A resposta foi: **da familia, e sempre tem um responsavel
 * financeiro** — que nao e quem deve, e quem responde.
 *
 * Ate aqui esta funcao somava `movimentos`, que e por PESSOA. E os lancamentos
 * novos vinham entrando em `conta_corrente`, que e por FAMILIA. As duas
 * metades se desencontraram, e a medicao mostrou o estrago:
 *
 *     Familia Anninha    movimentos: 0 linhas, saldo 0,00
 *                        conta_corrente: 1 linha, saldo -240,00
 *
 * Ela devia 240,00 e a regua de cobranca — que chama esta funcao — nao a
 * enxergava. Nao era caso raro: era a primeira linha da lista.
 *
 * Continua recebendo `clienteId` porque e assim que as cinco chamadas fazem, e
 * porque a pessoa e o que a tela tem na mao. A funcao resolve a familia dela e
 * soma o razao da familia. Duas pessoas da mesma familia passam a devolver o
 * MESMO saldo — que e o ponto da decisao.
 */
export async function calcularSaldo(clienteId: string): Promise<Saldo> {
  const db = supabaseAdmin();

  const { data: cli } = await db
    .from("clientes")
    .select("familia_id")
    .eq("org_id", env.orgId())
    .eq("id", clienteId)
    .maybeSingle();

  const familiaId = (cli as any)?.familia_id as string | null;

  // Pessoa sem familia nao deveria existir (o gatilho
  // `sureya_familia_para_cliente` cria uma no cadastro, e hoje sao zero casos).
  // Se aparecer, e cadastro incompleto: devolver zero seria dizer "esta em dia"
  // sobre alguem de quem nao se sabe nada. Zero e o unico numero honesto aqui,
  // mas quem chama precisa poder distinguir — dai `semFamilia`.
  if (!familiaId) return { saldo: 0, aConferir: 0, vencido: 0, aVencer: 0, semFamilia: true };

  const { data, error } = await db
    .from("conta_corrente")
    .select("tipo,valor,status_conc,data")
    .eq("org_id", env.orgId())
    .eq("familia_id", familiaId);

  // ERRO AQUI NAO PODE VIRAR SALDO ZERO.
  //
  // Saldo zero significa "em dia" para a regua de cobranca e para o aviso de
  // saldo baixo. Uma falha de leitura que devolvesse zero calaria a cobranca de
  // uma familia inadimplente — o mesmo modo de falha que deixou a agenda
  // parada por meses.
  if (error) throw new Error(`saldo_indisponivel: ${error.message}`);

  let saldo = 0;
  let aConferir = 0;
  let vencido = 0;
  let aVencer = 0;
  const hoje = new Date().toISOString().slice(0, 10);
  for (const m of data || []) {
    const st = (m as any).status_conc;
    const v = Number((m as any).valor) || 0;
    if (st === "rejeitado") continue;
    if (st === "a_conferir") {
      // Comprovante informado e ainda nao batido com o extrato NAO e saldo.
      // E o que a conferencia existe para impedir.
      if ((m as any).tipo === "credito") aConferir += v;
      continue;
    }
    const credito = (m as any).tipo === "credito";
    saldo += credito ? v : -v;
    if (!credito && String((m as any).data) > hoje) aVencer += v;
    else vencido += credito ? v : -v;
  }
  const cent = (x: number) => Math.round(x * 100) / 100;
  return { saldo: cent(saldo), aConferir: cent(aConferir),
           vencido: cent(vencido), aVencer: cent(aVencer) };
}

/**
 * O SALDO DE VARIAS FAMILIAS, OPCIONALMENTE COMO ELE ERA NUMA DATA.
 *
 * ESTA E A REGRA. As outras funcoes de saldo deste arquivo chamam esta.
 *
 * POR QUE O CORTE DE DATA MORA AQUI
 * ---------------------------------------------------------------------------
 * A auditoria reprova a home (CA-02) por misturar dois tempos na mesma linha:
 *
 *     "falta limpar"  → as lavagens do MES ESCOLHIDO
 *     "falta pagar"   → o saldo de HOJE
 *
 * Escolher julho em setembro mostrava as limpezas de julho ao lado da divida de
 * setembro. Nao da para chamar isso de fechamento de julho.
 *
 * `ate` resolve: o saldo passa a ser o do FIM da competencia escolhida — como a
 * conta estava naquele dia, inclusive quem devia e depois pagou. E o que torna
 * o mes uma fotografia em vez de um espelho.
 *
 * Sem `ate`, devolve o saldo de agora, que e o que a cobranca e a ficha querem.
 *
 * O QUE ESTAVA ACONTECENDO EM TRES LUGARES DIFERENTES
 * ---------------------------------------------------------------------------
 * `api/mes` (a home) tinha a sua propria copia da soma, e ela divergia em tres
 * pontos — cada um capaz de mudar o numero que a responsavel le:
 *
 *   1. pulava `origem = 'lavagem'` com o comentario "eles tem valor zero".
 *      Isso era verdade ate a 0073. Em `modo_cobranca = consumo` — que e o de
 *      TODAS as 298 familias — a lavagem passou a carregar o valor. A home
 *      estaria escondendo a divida de cada limpeza;
 *   2. nao filtrava `status_conc`, entao comprovante nao conferido e ate
 *      lancamento rejeitado entravam no saldo;
 *   3. somava com o sinal invertido (debito positivo).
 *
 * Tres copias da mesma regra e tres oportunidades de divergir. Agora e uma.
 */
export async function calcularSaldosPorFamilia(
  familiaIds: string[],
  opts?: { ate?: string },
): Promise<Map<string, Saldo>> {
  const fora = new Map<string, Saldo>();
  const ids = [...new Set(familiaIds.filter(Boolean))];
  if (!ids.length) return fora;

  const db = supabaseAdmin();
  let q = db
    .from("conta_corrente")
    .select("familia_id,tipo,valor,status_conc,data")
    .eq("org_id", env.orgId())
    .in("familia_id", ids);
  if (opts?.ate) q = q.lte("data", opts.ate);

  const { data, error } = await q;

  // ERRO DE LEITURA NAO VIRA SALDO ZERO — nem aqui, nem em lote, nem na ficha.
  // Zero significa "em dia", e uma falha silenciosa calaria a cobranca de uma
  // familia inadimplente.
  if (error) throw new Error(`saldo_indisponivel: ${error.message}`);

  for (const fid of ids) fora.set(fid, { saldo: 0, aConferir: 0, vencido: 0, aVencer: 0 });

  // O CORTE DO VENCIDO ACOMPANHA `opts.ate`. Pedir "o saldo como era em 31/07"
  // e responder com o vencimento de hoje daria duas leituras da mesma data.
  const corte = opts?.ate || new Date().toISOString().slice(0, 10);

  for (const m of data || []) {
    const fid = (m as any).familia_id as string;
    const acc = fora.get(fid);
    if (!acc) continue;
    const st = (m as any).status_conc;
    const v = Number((m as any).valor) || 0;
    if (st === "rejeitado") continue;
    if (st === "a_conferir") {
      // Comprovante informado e ainda nao batido com o extrato NAO e saldo.
      if ((m as any).tipo === "credito") acc.aConferir += v;
      continue;
    }
    const credito = (m as any).tipo === "credito";
    acc.saldo += credito ? v : -v;
    if (!credito && String((m as any).data) > corte) acc.aVencer += v;
    else acc.vencido += credito ? v : -v;
  }

  for (const [fid, acc] of fora) {
    const cent = (x: number) => Math.round(x * 100) / 100;
    fora.set(fid, {
      saldo: cent(acc.saldo),
      aConferir: cent(acc.aConferir),
      vencido: cent(acc.vencido),
      aVencer: cent(acc.aVencer),
    });
  }
  return fora;
}

/**
 * O MESMO SALDO, PARA UMA LISTA INTEIRA, EM DUAS CONSULTAS.
 *
 * POR QUE ESTA FUNCAO EXISTE
 * ---------------------------------------------------------------------------
 * `calcularSaldo()` faz duas consultas por pessoa. Nas telas de lista — a de
 * clientes (400 linhas), indicadores, reajuste, relatorio — isso seria 800
 * consultas para desenhar uma tela. As rotas que fazem isso hoje ja resolveram
 * o problema do jeito certo: baixam TODOS os lancamentos de uma vez e agrupam
 * em memoria. So que baixavam de `movimentos`, que e o razao errado.
 *
 * Esta funcao preserva o formato (uma consulta so, agrupada em memoria) e troca
 * o razao. A regra de soma e IDENTICA a de `calcularSaldo()` — e tem de
 * continuar sendo. Se as duas divergirem, a lista de clientes vai mostrar um
 * numero e a ficha da mesma pessoa vai mostrar outro, que e exatamente o
 * sintoma que o Build 4 existiu para acabar.
 *
 * PESSOAS DA MESMA FAMILIA DEVOLVEM O MESMO SALDO
 * ---------------------------------------------------------------------------
 * Isso e a decisao, nao um efeito colateral. Numa lista de PESSOAS, a divida da
 * familia aparece em cada membro dela. Quem precisar contar familias — e nao
 * pessoas — filtra por `responsavel_financeiro`, que e exatamente para isso que
 * ele serve.
 *
 * @param clientes pares { id, familia_id } que quem chama JA TEM em maos. Pedir
 *                 assim evita uma terceira consulta so para redescobrir a
 *                 familia de gente que a rota acabou de carregar.
 */
export async function calcularSaldosEmLote(
  clientes: { id: string; familia_id: string | null }[],
): Promise<Map<string, Saldo>> {
  const fora = new Map<string, Saldo>();
  for (const c of clientes)
    fora.set(c.id, { saldo: 0, aConferir: 0, vencido: 0, aVencer: 0, semFamilia: !c.familia_id });

  const familiaIds = [...new Set(clientes.map((c) => c.familia_id).filter(Boolean))] as string[];
  if (!familiaIds.length) return fora;

  // Uma regra so: quem soma e `calcularSaldosPorFamilia`. Esta funcao existe
  // para traduzir pessoa -> familia, que e o que as telas de lista tem na mao.
  const porFamilia = await calcularSaldosPorFamilia(familiaIds);

  for (const c of clientes) {
    if (!c.familia_id) continue;
    fora.set(c.id, porFamilia.get(c.familia_id) || { saldo: 0, aConferir: 0, vencido: 0, aVencer: 0 });
  }
  return fora;
}

/**
 * DINHEIRO ENTROU E A CONTA ZEROU? ENTAO A REGUA DE COBRANCA VOLTA AO COMECO.
 *
 * POR QUE ISTO EXISTE NUM LUGAR SO
 * ---------------------------------------------------------------------------
 * Havia SEIS portas para registrar pagamento e cada uma se comportava de um
 * jeito. A que o dono usa todo dia (a ficha da familia) PROMETE na tela que
 * "zera a regua de cobranca" — e nao zerava. O estrago nao e cobrar de novo
 * (proativo.ts recheca o saldo antes de escrever); e o contrario: cobranca_nivel
 * ficava queimado e, na PROXIMA vez que a familia ficasse em aberto, a regua a
 * pulava para sempre, em silencio, porque o nivel ja estava no teto.
 *
 * Agora toda porta de dinheiro chama esta funcao. Ela so zera quando a conta
 * realmente ficou quitada (saldo >= 0) — pagamento parcial nao apaga o historico
 * de lembretes, senao a familia recomecaria a regua do zero a cada R$ 10 pagos.
 *
 * Nunca lanca: um problema aqui nao pode derrubar o registro do pagamento.
 */
export async function zerarReguaSeQuitou(clienteId: string): Promise<boolean> {
  try {
    const s = await calcularSaldo(clienteId);
    // O QUE JA VENCEU (0114): debito com vencimento la na frente nao e divida
    // e nao pode manter a regua queimada.
    if (s.vencido < -0.005) return false;    // ainda deve: mantem a regua onde está
    const db = supabaseAdmin();
    await db
      .from("clientes")
      .update({ cobranca_nivel: 0, cobranca_em: null })
      .eq("org_id", env.orgId())
      .eq("id", clienteId);
    await avancarVencimentos(clienteId);
    return true;
  } catch (e) {
    console.error("[financeiro] nao consegui zerar a regua:", (e as any)?.message || e);
    return false;
  }
}

/**
 * QUITOU? O VENCIMENTO ANDA SOZINHO (decisao de 08/08/2026).
 * ===========================================================================
 * `planos.proxima_cobranca` e `pago_ate` alimentam os baldes de vencimento da
 * tela de Jazigos e o "quem esta atrasado" da Carteira. Ate aqui, essas datas
 * SO mudavam se alguem digitasse, jazigo a jazigo — os baldes valiam o que a
 * memoria do dono valesse. A funcao que avanca a data (`proximaData`, em
 * vencimento.ts) existia desde sempre e nao era chamada por ninguem.
 *
 * Agora: quando o pagamento zera a conta da familia, cada plano ativo dela que
 * ja venceu (ou vence hoje) anda um ciclo para frente e `pago_ate` passa a ser
 * a data que acabou de ser paga.
 *
 * TRES CUIDADOS, todos deliberados:
 *  1. so anda o que ESTAVA vencido. Plano que vence daqui a 20 dias nao pula
 *     um ciclo so porque a familia adiantou outro jazigo.
 *  2. anda UM ciclo por pagamento, nunca varios de uma vez: uma familia com
 *     4 meses de atraso que paga tudo tem a data corrigida no proximo mes, e
 *     nao empurrada para daqui a 4 — o atraso continua visivel, que e o certo.
 *  3. avulso e por_data nao tem ciclo: `proximaData` devolve null e o plano e
 *     deixado em paz.
 *
 * Cada mudanca vai para `auditoria` — a data e do sistema, mas a trilha e sua:
 * de/para, plano e cliente, para voce conferir depois e corrigir se quiser.
 */
async function avancarVencimentos(clienteId: string): Promise<void> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const hoje = diaOperacao();

  const { data: planos } = await db
    .from("planos")
    .select("id,cadencia,proxima_cobranca,pago_ate")
    .eq("org_id", org)
    .eq("cliente_id", clienteId)
    .eq("ativo", true);

  for (const p of (planos || []) as any[]) {
    const venc = p.proxima_cobranca as string | null;
    if (!venc || venc > hoje) continue;          // ainda nao venceu: nao mexe
    const nova = proximaData(p.cadencia, venc);
    if (!nova) continue;                          // avulso/por_data: sem ciclo

    const { error } = await db
      .from("planos")
      .update({ proxima_cobranca: nova, pago_ate: venc })
      .eq("id", p.id)
      .eq("org_id", org);
    if (error) {
      console.error("[financeiro] nao avancei o vencimento:", error.message);
      continue;
    }

    await auditar(db, org, null, "vencimento_avancado",
      { tipo: "plano", id: p.id },
      { cliente_id: clienteId, de: venc, para: nova, pago_ate: venc, motivo: "pagamento quitou a conta" });
  }
}

export function saldoTexto(s: Saldo): string {
  let base: string;
  if (Math.abs(s.saldo) < 0.005) base = "em dia";
  else if (s.saldo > 0) base = `adiantado R$ ${s.saldo.toFixed(2)}`;
  else base = `em aberto R$ ${Math.abs(s.saldo).toFixed(2)}`;
  return s.aConferir > 0.005 ? `${base} (R$ ${s.aConferir.toFixed(2)} a conferir)` : base;
}
