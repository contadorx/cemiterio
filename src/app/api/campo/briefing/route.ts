import { NextRequest, NextResponse } from "next/server";
import { primeiroNome } from "@/lib/mensagens";
import { exigirLogado } from "@/lib/roles";
import { montarBriefing } from "@/lib/briefing";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { orgAtual } from "@/lib/org";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> orientação do dia para quem está no campo (abre o dia).
export async function GET(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const nome = primeiroNome(auth.nome || "");
  // o dono também pode abrir o campo: assume a rota que escolher
  const escolhida = req.nextUrl.searchParams.get("executora");
  const executoraId = auth.papel === "campo"
    ? auth.userId
    : escolhida && escolhida !== "todos" ? escolhida : null;

  const briefing = await montarBriefing(executoraId, nome);

  // marca o início do dia (só a primeira vez)
  try {
    const org = await orgAtual(auth.db);
    if (org) {
      const adm = supabaseAdmin();
      await adm
        .from("dias_campo")
        .upsert(
          {
            org_id: org,
            executora_id: executoraId,
            // o "dia de campo" e o dia de Sao Paulo (mesmo dia da rota)
            data: diaOperacao(),
            meta_tumulos: briefing.totalHoje,
            iniciado_em: new Date().toISOString(),
          },
          { onConflict: "org_id,executora_id,data", ignoreDuplicates: true }
        );
    }
  } catch {
    /* abrir o dia é secundário; não bloqueia o briefing */
  }

  return NextResponse.json({ ok: true, briefing });
}
