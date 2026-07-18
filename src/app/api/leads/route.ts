import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const status = req.nextUrl.searchParams.get("status") || "";
  const origem = req.nextUrl.searchParams.get("origem") || "";

  let q = auth.db
    .from("leads")
    .select("id,telefone,nome,nome_wa,contexto,jazigo_ref,mensagens,status,origem,proximo_passo,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  if (origem) q = q.eq("origem", origem);

  const { data } = await q;
  return NextResponse.json({ ok: true, leads: data || [] });
}

// POST { telefone, nome, contexto, jazigoRef, proximoPasso } — prospecção manual
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const tel = String(b?.telefone || "").replace(/\D/g, "");
  if (!b?.nome || tel.length < 10) {
    return NextResponse.json({ ok: false, erro: "nome_e_telefone_obrigatorios" }, { status: 400 });
  }
  const telefone = tel.startsWith("55") ? tel : `55${tel}`;

  const { error } = await auth.db.from("leads").upsert({
    org_id: org,
    telefone,
    nome: String(b.nome).trim(),
    contexto: b?.contexto || null,
    jazigo_ref: b?.jazigoRef || null,
    proximo_passo: b?.proximoPasso || null,
    origem: "manual",
    status: "novo",
    mensagens: [],
    respondido_inicial: false,
  }, { onConflict: "org_id,telefone" });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
