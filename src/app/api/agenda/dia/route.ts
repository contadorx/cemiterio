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

  let q = db
    .from("servicos")
    .select(
      "id,status,ordem_dia,tumulo_id,tumulos(identificacao,lat,lng,gps_precisao,gps_amostras,falecido_nome,foto_referencia_url,foto_enquadramento_url,quadras(codigo,ordem)),clientes(nome)"
    )
    .eq("data_prevista", data)
    .in("status", ["pendente", "agendado", "executado"]);

  // D5: a ajudante vê só a própria rota; o dono vê tudo (ou filtra por ?executora=)
  if (auth.papel === "campo") {
    q = q.or(`executora_id.eq.${auth.userId},executora_id.is.null`);
  } else {
    const exec = req.nextUrl.searchParams.get("executora");
    if (exec) q = q.eq("executora_id", exec);
  }

  const { data: servs, error } = await q.order("ordem_dia", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = (servs || []).map((s: any) => ({
    id: s.id,
    tumuloId: s.tumulo_id,
    status: s.status,
    ordem: s.ordem_dia,
    tumulo: s.tumulos?.identificacao || "",
    quadra: s.tumulos?.quadras?.codigo || "—",
    falecido: s.tumulos?.falecido_nome || null,
    cliente: s.clientes?.nome || null,
    lat: s.tumulos?.lat ?? null,
    lng: s.tumulos?.lng ?? null,
    gpsPrecisao: s.tumulos?.gps_precisao ?? null,
    gpsAmostras: s.tumulos?.gps_amostras ?? 0,
    fotoReferencia: s.tumulos?.foto_referencia_url || null,
    fotoEnquadramento: s.tumulos?.foto_enquadramento_url || null,
  }));

  const total = lista.length;
  const feitos = lista.filter((x) => x.status === "executado").length;

  return NextResponse.json({ ok: true, data, total, feitos, lista });
}
