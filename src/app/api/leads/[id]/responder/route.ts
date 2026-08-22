import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { enviarWhatsapp } from "@/lib/evolution";
import type { MsgLead } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { texto } — responde o lead pelo WhatsApp, direto do app.
// É envio MANUAL: sai mesmo com os disparos automáticos desligados (a chave
// mestra só segura o que a IA e os crons mandam sozinhos).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const texto = (body?.texto || "").trim();
  if (!texto) return NextResponse.json({ ok: false, erro: "texto_vazio" }, { status: 400 });

  const { data: lead } = await db
    .from("leads")
    .select("id,telefone,mensagens,status,ignorado")
    .eq("id", params.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });
  if ((lead as any).ignorado) {
    return NextResponse.json({ ok: false, erro: "lead_ignorado" }, { status: 400 });
  }

  const telefone = (lead as any).telefone;
  if (!telefone) return NextResponse.json({ ok: false, erro: "sem_telefone" }, { status: 400 });

  // envia primeiro; só grava no histórico se o WhatsApp aceitou
  try {
    await enviarWhatsapp(telefone, texto);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: "falha_envio", detalhe: String(e?.message || e).slice(0, 300) },
      { status: 502 }
    );
  }

  const msgs: MsgLead[] = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
  msgs.push({ t: new Date().toISOString(), texto: texto.slice(0, 800), de: "nos" });

  const patch: Record<string, any> = { mensagens: msgs.slice(-40) };
  // ao responder, o lead sai de "novo" e passa a estar "em conversa"
  if ((lead as any).status === "novo") patch.status = "em_conversa";

  const { error } = await db.from("leads").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
