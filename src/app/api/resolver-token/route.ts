import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?t=TOKEN -> decide o destino do QR:
//   equipe logada  -> app de campo, já no túmulo certo
//   qualquer outro -> portal da família
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") || "";
  if (token.length < 16) return NextResponse.json({ destino: "invalido" });

  // é alguém da equipe?
  let ehEquipe = false;
  try {
    const db = supabaseServer();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) {
      const { data: membro } = await db.from("membros").select("papel").limit(1).maybeSingle();
      ehEquipe = !!membro;
    }
  } catch {
    ehEquipe = false;
  }

  if (!ehEquipe) return NextResponse.json({ destino: "familia" });

  // equipe: acha o túmulo e o serviço aberto mais próximo
  const adm = supabaseAdmin();
  const { data: tumulo } = await adm
    .from("tumulos")
    .select("id,identificacao")
    .eq("qr_token", token)
    .maybeSingle();

  if (!tumulo) return NextResponse.json({ destino: "familia" });

  const { data: servico } = await adm
    .from("servicos")
    .select("id,data_prevista,status")
    .eq("tumulo_id", (tumulo as any).id)
    .in("status", ["pendente", "agendado"])
    .order("data_prevista", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    destino: "campo",
    tumuloId: (tumulo as any).id,
    identificacao: (tumulo as any).identificacao,
    servicoId: (servico as any)?.id || null,
  });
}
