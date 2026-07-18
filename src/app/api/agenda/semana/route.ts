import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?inicio=yyyy-mm-dd (default hoje) -> 14 dias de agenda p/ o dono gerir.
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const inicio = req.nextUrl.searchParams.get("inicio") || new Date().toISOString().slice(0, 10);
  const fim = new Date(new Date(inicio + "T00:00:00").getTime() + 13 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await db
    .from("servicos")
    .select("id,data_prevista,ordem_dia,status,valor,tumulos(identificacao,falecido_nome,quadras(codigo)),clientes(nome)")
    .gte("data_prevista", inicio)
    .lte("data_prevista", fim)
    .neq("status", "cancelado")
    .order("data_prevista", { ascending: true })
    .order("ordem_dia", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const porDia: Record<string, any[]> = {};
  for (const s of data || []) {
    const d = (s as any).data_prevista;
    porDia[d] = porDia[d] || [];
    porDia[d].push({
      id: (s as any).id,
      status: (s as any).status,
      tumulo: (s as any).tumulos?.identificacao || "",
      quadra: (s as any).tumulos?.quadras?.codigo || "—",
      falecido: (s as any).tumulos?.falecido_nome || null,
      cliente: (s as any).clientes?.nome || null,
      valor: (s as any).valor,
    });
  }

  return NextResponse.json({ ok: true, inicio, fim, dias: porDia });
}
