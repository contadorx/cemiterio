import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { enviarTextoComRetry } from "./envio";

// Número desconhecido escreveu: registrar como lead (em vez de silêncio total).
// Na primeira mensagem, se houver saudação configurada, responde UMA vez.
export async function tratarLead(telefone: string, texto: string, nomeWa?: string | null) {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: lead } = await db
    .from("leads")
    .select("id,mensagens,respondido_inicial,status")
    .eq("org_id", org)
    .eq("telefone", telefone)
    .maybeSingle();

  const novaMsg = { t: new Date().toISOString(), texto: (texto || "").slice(0, 800) };

  if (!lead) {
    await db.from("leads").insert({
      org_id: org,
      telefone,
      nome_wa: nomeWa || null,
      mensagens: [novaMsg],
      status: "novo",
    });
  } else {
    const msgs = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
    msgs.push(novaMsg);
    await db
      .from("leads")
      .update({ mensagens: msgs.slice(-20), nome_wa: nomeWa || undefined })
      .eq("id", (lead as any).id);
  }

  // saudação inicial (uma vez só)
  const jaRespondeu = !!(lead as any)?.respondido_inicial;
  if (!jaRespondeu) {
    const { data: cfg } = await db
      .from("config_ia")
      .select("msg_lead_inicial")
      .eq("org_id", org)
      .maybeSingle();
    const saudacao = ((cfg as any)?.msg_lead_inicial || "").trim();
    if (saudacao) {
      await enviarTextoComRetry(telefone, saudacao);
      await db
        .from("leads")
        .update({ respondido_inicial: true, status: "em_conversa" })
        .eq("org_id", org)
        .eq("telefone", telefone);
    }
  }
}
