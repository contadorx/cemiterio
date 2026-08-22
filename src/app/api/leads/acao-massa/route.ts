import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { converterLead } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { ids: string[], acao: 'converter' | 'descartar' | 'nao_eh_lead' | 'em_conversa' }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === "string") : [];
  const acao: string = body?.acao || "";

  if (!ids.length) return NextResponse.json({ ok: false, erro: "sem_ids" }, { status: 400 });
  if (ids.length > 300) return NextResponse.json({ ok: false, erro: "muitos_ids" }, { status: 400 });

  if (acao === "descartar") {
    const { error } = await db.from("leads").update({ status: "descartado" }).in("id", ids);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, afetados: ids.length });
  }

  if (acao === "em_conversa") {
    const { error } = await db.from("leads").update({ status: "em_conversa" }).in("id", ids);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, afetados: ids.length });
  }

  if (acao === "nao_eh_lead") {
    // bloqueia os números: não voltam a virar lead nem escrevendo de novo
    const { data: leads } = await db.from("leads").select("telefone").in("id", ids);
    const bloqueios = (leads || [])
      .map((l: any) => l.telefone)
      .filter(Boolean)
      .map((telefone: string) => ({ org_id: org, telefone, motivo: null }));
    if (bloqueios.length) {
      await db.from("telefones_ignorados").upsert(bloqueios, { onConflict: "org_id,telefone" });
    }
    const { error } = await db.from("leads")
      .update({ ignorado: true, status: "descartado" }).in("id", ids);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, afetados: ids.length });
  }

  if (acao === "converter") {
    // um a um: cada conversão cria cliente + leva o histórico. Uma falha (ex.:
    // telefone já é cliente) não impede as outras.
    let criados = 0;
    const falhas: string[] = [];
    for (const id of ids) {
      const r = await converterLead(db, org, id);
      if (r.ok) criados++;
      else falhas.push(id);
    }
    return NextResponse.json({ ok: true, criados, falhas: falhas.length });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}
