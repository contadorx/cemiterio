import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * O QUE NUNCA VAI SOZINHO
 *
 * O score alto diz que a IA acerta o tom com aquela família em assunto de rotina.
 * Não diz que ela deve responder sobre a morte de alguém, uma reclamação séria
 * ou um pedido de cancelamento. Nesses casos, errar não tem conserto.
 *
 * Então existem três travas, e qualquer uma segura a resposta:
 *   1. ASSUNTO na lista de sempre-manual (luto, reclamação, cancelamento)
 *   2. PALAVRA crítica no texto da família (faleceu, advogado, processo...)
 *   3. A própria IA marcou como sensível ou de baixa confiança
 *
 * A família nunca percebe: para ela, a Sureya respondeu — só demorou um pouco.
 */

export interface Retencao {
  reter: boolean;
  motivo: string | null;
}

function normalizar(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function avaliarRetencao(args: {
  assunto?: string | null;
  textoDaFamilia?: string | null;
  sensivel?: boolean;
  confianca?: string | null;
  score?: number | null;
}): Promise<Retencao> {
  const db = supabaseAdmin();
  const { data: org } = await db
    .from("orgs")
    .select("assuntos_sempre_manual,palavras_criticas")
    .eq("id", env.orgId())
    .maybeSingle();

  const sempreManual: string[] = (org as any)?.assuntos_sempre_manual || [
    "luto", "reclamacao", "cancelamento",
  ];
  const criticas: string[] = (org as any)?.palavras_criticas || [];

  // 1. assunto que nunca é automático
  const assunto = normalizar(args.assunto || "");
  if (assunto && sempreManual.map(normalizar).includes(assunto)) {
    return { reter: true, motivo: `assunto "${args.assunto}" nunca vai automático` };
  }

  // 2. palavra crítica no que a família escreveu
  const texto = normalizar(args.textoDaFamilia || "");
  if (texto) {
    for (const p of criticas) {
      const alvo = normalizar(p);
      if (alvo && texto.includes(alvo)) {
        return { reter: true, motivo: `a família escreveu "${p}"` };
      }
    }
  }

  // 3. a própria IA levantou a mão
  if (args.sensivel) return { reter: true, motivo: "a IA marcou como assunto sensível" };
  if (args.confianca === "baixa") return { reter: true, motivo: "a IA ficou em dúvida" };

  return { reter: false, motivo: null };
}
