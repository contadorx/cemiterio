import { NextRequest, NextResponse } from "next/server";
import { exigirLogado, exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A Nina também precisa ler a lista (para pedir o que falta).
export async function GET() {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const { data } = await auth.db
    .from("materiais")
    .select("id,nome,unidade,estoque,alerta_minimo,atualizado_em")
    .order("nome");
  return NextResponse.json({ ok: true, materiais: data || [] });
}

// POST { nome, unidade, estoque, alertaMinimo } — cadastra ou atualiza pelo nome
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const nome = String(b?.nome || "").trim().toLowerCase();
  if (!nome) return NextResponse.json({ ok: false, erro: "nome_obrigatorio" }, { status: 400 });

  const { error } = await auth.db.from("materiais").upsert(
    {
      org_id: org, nome,
      unidade: b?.unidade || "un",
      estoque: Number(b?.estoque) || 0,
      alerta_minimo: Number(b?.alertaMinimo) || 0,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "org_id,nome" }
  );
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
