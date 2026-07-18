import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * NÚMERO DESCONHECIDO — apenas REGISTRA, nunca responde.
 *
 * O WhatsApp é o número pessoal da Sureya. Uma mensagem de número desconhecido
 * pode ser uma amiga, um parente, alguém do outro trabalho ou um engano.
 * Responder automaticamente seria invasivo e constrangedor.
 *
 * Então: registramos o contato para ela ver no painel e decidir. Se for cliente
 * em potencial, ela converte em lead e aí sim a IA ajuda na prospecção — com o
 * contexto que ela mesma escreveu.
 */
export async function tratarLead(telefone: string, texto: string, nomeWa?: string | null) {
  const db = supabaseAdmin();
  const org = env.orgId();

  // número marcado como "não é lead" nem chega a ser registrado
  const { data: bloqueado } = await db
    .from("telefones_ignorados")
    .select("id").eq("org_id", org).eq("telefone", telefone).maybeSingle();
  if (bloqueado) return;

  const { data: lead } = await db
    .from("leads")
    .select("id,mensagens,status")
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
      respondido_inicial: false,   // continua false: NUNCA respondemos sozinhos
    });
    return;
  }

  const msgs = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
  msgs.push(novaMsg);
  await db
    .from("leads")
    .update({ mensagens: msgs.slice(-20), nome_wa: nomeWa || undefined })
    .eq("id", (lead as any).id);
}
