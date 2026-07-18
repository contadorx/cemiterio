import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { lat, lng, precisao, origem? } -> registra a leitura e recalcula a
// posição do túmulo pela média ponderada de todas as leituras.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const lat = Number(b?.lat);
  const lng = Number(b?.lng);
  const precisao = Number(b?.precisao);

  if (!isFinite(lat) || !isFinite(lng) || !isFinite(precisao)) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }
  if (precisao > 30) {
    return NextResponse.json(
      { ok: false, erro: "precisao_insuficiente", mensagem: "Sinal fraco. Chegue mais perto do túmulo e tente de novo." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.db.rpc("sureya_registrar_gps", {
    p_tumulo: params.id,
    p_lat: lat,
    p_lng: lng,
    p_precisao: precisao,
    p_origem: b?.origem || "confirmacao",
  });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  const r = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    lat: r?.lat,
    lng: r?.lng,
    precisao: r?.precisao,
    amostras: r?.amostras,
  });
}
