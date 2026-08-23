import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

export interface ResumoCobranca {
  lancados: number;
  valor_total: number;
  tumulos_tocados: number;
}

/**
 * A COBRANÇA DO CONTRATO — a rotina diária (0104).
 *
 * O QUE MUDOU, e por que isto é uma função e não um efeito da limpeza.
 *
 * Até a 0104 quem gerava dívida era a LAVAGEM: cada limpeza executada lançava
 * um débito. Isso fazia o razão responder por duas perguntas ao mesmo tempo —
 * *quanto a família deve* e *quais limpezas aconteceram* — e a segunda escrevia
 * na primeira:
 *
 *   · uma limpeza adiada barateava o mês
 *   · uma limpeza anotada em atraso virava dívida retroativa
 *   · e o contrato, que é o que a família combinou pagar, ficava sendo o
 *     RESULTADO da operação em vez do combinado
 *
 * Agora a dívida é do CONTRATO, lançada por competência, e a limpeza é
 * entrega. As duas caminham em separado — que era exatamente o pedido.
 *
 * CONVERGENTE. Roda toda manhã e não cobra duas vezes: a trava é um índice
 * único `(tumulo_id, competencia) where origem='competencia'`, e a data só
 * anda quando a linha entra. Meses parados são cobrados UM A UM, cada um na
 * sua competência — somar tudo num lançamento de hoje faria o relatório por
 * competência mentir, que é o relatório que a Sureya confere.
 *
 * ⚠ `p_org` explícito: `current_org_id()` lê `auth.uid()`, que é nulo na
 * service role do cron. É a mesma lição da 0103.
 */
export async function cobrarContratos(): Promise<ResumoCobranca> {
  const db = supabaseAdmin();
  const { data } = await db.rpc("sureya_cobrar_competencias", {
    p_ate: null, p_org: env.orgId(),
  });
  const l = (Array.isArray(data) ? data[0] : data) || {};
  return {
    lancados: Number((l as any).lancados) || 0,
    valor_total: Number((l as any).valor_total) || 0,
    tumulos_tocados: Number((l as any).tumulos_tocados) || 0,
  };
}
