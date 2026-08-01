import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, exigirLogado } from "@/lib/roles";

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

/**
 * GET -> as leituras deste túmulo, da melhor para a pior.
 *
 * A posição no mapa é a MÉDIA das leituras (0013). Para consertar um ponto
 * errado é preciso ver de onde ele veio: quando foi marcada, com que precisão e
 * a que distância da posição atual. É a distância que denuncia a leitura feita
 * em casa — ela aparece com quilômetros ao lado de leituras com metros.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const [{ data: t }, { data: ls, error }] = await Promise.all([
    auth.db
      .from("tumulos")
      .select("id,identificacao,lat,lng,gps_precisao,gps_amostras,gps_atualizado_em")
      .eq("id", params.id)
      .maybeSingle(),
    auth.db
      .from("gps_leituras")
      .select("id,lat,lng,precisao,origem,created_at")
      .eq("tumulo_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!t) return NextResponse.json({ ok: false, erro: "tumulo_nao_encontrado" }, { status: 404 });

  const base = t as any;
  const leituras = ((ls as any[]) || []).map((l) => ({
    id: l.id,
    lat: l.lat,
    lng: l.lng,
    precisao: l.precisao,
    origem: l.origem,
    quando: l.created_at,
    // distância até a posição consolidada — é o número que expõe a leitura solta
    distancia:
      base.lat != null && base.lng != null && l.lat != null && l.lng != null
        ? metrosEntre(Number(base.lat), Number(base.lng), Number(l.lat), Number(l.lng))
        : null,
  }));

  return NextResponse.json({
    ok: true,
    tumulo: {
      id: base.id,
      identificacao: base.identificacao,
      lat: base.lat,
      lng: base.lng,
      precisao: base.gps_precisao,
      amostras: base.gps_amostras ?? 0,
      atualizadoEm: base.gps_atualizado_em,
    },
    leituras,
  });
}

/**
 * DELETE ?leitura=ID  -> apaga UMA leitura e recalcula a média.
 * DELETE (sem leitura) -> apaga TODAS e o jazigo sai do mapa.
 *
 * SÓ ADMIN. Marcar GPS é do campo (qualquer pessoa logada, é o trabalho dela);
 * apagar posição consolidada mexe no mapa de todo mundo e é decisão do
 * escritório. Sem o `confirmar=1` não apaga nada: DELETE sem corpo é fácil
 * demais de disparar por engano, e não existe desfazer.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const leitura = req.nextUrl.searchParams.get("leitura") || null;
  if (req.nextUrl.searchParams.get("confirmar") !== "1") {
    return NextResponse.json({ ok: false, erro: "sem_confirmacao" }, { status: 400 });
  }

  const { data, error } = await auth.db.rpc("sureya_apagar_gps", {
    p_tumulo: params.id,
    p_leitura: leitura,
  });

  if (error) {
    // a função nasce na migration 0034; sem ela a tela tem de dizer o que fazer
    const faltando = /sureya_apagar_gps|function .* does not exist|schema cache/i.test(error.message || "");
    return NextResponse.json(
      {
        ok: false,
        erro: faltando ? "migration_0034_pendente" : error.message,
        mensagem: faltando
          ? "Falta rodar a migration 0034 no banco (Supabase → SQL Editor)."
          : error.message,
      },
      { status: faltando ? 409 : 500 },
    );
  }

  const r = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    apagou: leitura ? "leitura" : "tudo",
    lat: r?.lat ?? null,
    lng: r?.lng ?? null,
    precisao: r?.precisao ?? null,
    amostras: r?.amostras ?? 0,
  });
}

/** Distância em metros entre dois pontos próximos (plano local, erro desprezível). */
function metrosEntre(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const mLat = 110540;
  const mLng = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lat1 - lat2) * mLat, (lng1 - lng2) * mLng);
}
