import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { diaOperacao, proximaData } from "./vencimento";
import { auditar } from "./auditoria";

export interface Saldo {
  saldo: number;      // só confirmados: créditos − débitos, no razão da FAMÍLIA
  aConferir: number;  // créditos informados, ainda não batidos com o extrato
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
  if (!familiaId) return { saldo: 0, aConferir: 0, semFamilia: true };

  const { data, error } = await db
    .from("conta_corrente")
    .select("tipo,valor,status_conc")
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
    saldo += (m as any).tipo === "credito" ? v : -v;
  }
  return { saldo: Math.round(saldo * 100) / 100, aConferir: Math.round(aConferir * 100) / 100 };
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
    if (s.saldo < -0.005) return false;      // ainda deve: mantem a regua onde está
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
