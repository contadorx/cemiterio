import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET ?origem=https://... -> plaquetas dos túmulos que já têm portal ativo.
// Cada plaqueta traz o QR do link do portal da família.
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const origem = (req.nextUrl.searchParams.get("origem") || "").replace(/\/$/, "");
  if (!origem) return NextResponse.json({ ok: false, erro: "origem_obrigatoria" }, { status: 400 });

  const { data: tumulos } = await db
    .from("tumulos")
    .select("id,identificacao,falecido_nome,qr_token,quadras(codigo)")
    .not("qr_token", "is", null)
    .limit(200);

  const plaquetas = [];
  for (const t of tumulos || []) {
    // destino único: decide entre app de campo (equipe) e portal (família)
    const url = `${origem}/t/${(t as any).qr_token}`;
    // nível Q tolera ~25% de sujeira/desgaste — necessário em ambiente externo
    const qr = await QRCode.toDataURL(url, { margin: 2, width: 400, errorCorrectionLevel: "Q" });
    plaquetas.push({
      id: (t as any).id,
      identificacao: (t as any).identificacao,
      falecido: (t as any).falecido_nome,
      quadra: (t as any).quadras?.codigo || "—",
      url,
      qr,
    });
  }

  return NextResponse.json({ ok: true, plaquetas });
}
