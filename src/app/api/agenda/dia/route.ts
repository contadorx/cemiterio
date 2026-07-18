import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?data=yyyy-mm-dd  (default: hoje) — lista ordenada dos túmulos do dia.
export async function GET(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const data = req.nextUrl.searchParams.get("data") || new Date().toISOString().slice(0, 10);

  const { data: servs, error } = await db
    .from("servicos")
    .select(
      "id,status,ordem_dia,tumulos(identificacao,lat,lng,falecido_nome,foto_referencia_url,quadras(codigo,ordem)),clientes(nome)"
    )
    .eq("data_prevista", data)
    .in("status", ["pendente", "agendado", "executado"])
    .order("ordem_dia", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = (servs || []).map((s: any) => ({
    id: s.id,
    status: s.status,
    ordem: s.ordem_dia,
    tumulo: s.tumulos?.identificacao || "",
    quadra: s.tumulos?.quadras?.codigo || "—",
    falecido: s.tumulos?.falecido_nome || null,
    cliente: s.clientes?.nome || null,
    lat: s.tumulos?.lat ?? null,
    lng: s.tumulos?.lng ?? null,
    fotoReferencia: s.tumulos?.foto_referencia_url || null,
  }));

  const total = lista.length;
  const feitos = lista.filter((x) => x.status === "executado").length;

  return NextResponse.json({ ok: true, data, total, feitos, lista });
}
