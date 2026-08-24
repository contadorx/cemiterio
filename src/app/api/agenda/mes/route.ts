import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { gerarCalendarioMes } from "@/lib/agenda";
import { mesOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST { mes: "2026-11", distribuir? }
//
// `incluirAvulsos` e `dataAvulsos` saíram na 0128: eram a única porta do
// sistema que fabricava avulso sem ninguém pedir. Avulso é o que a família
// solicita — e pedido tem dono, data e preço próprios.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const mes = String(b?.mes || "").match(/^\d{4}-\d{2}$/) ? b.mes : mesOperacao();

  const r = await gerarCalendarioMes(mes, { distribuir: b?.distribuir !== false });
  return NextResponse.json({ ok: true, ...r });
}
