import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?mes=yyyy-mm -> CSV dos movimentos do mês (para Excel/contabilidade)
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const mes = req.nextUrl.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const ini = `${mes}-01`;
  const fim = new Date(new Date(ini + "T00:00:00").getFullYear(), new Date(ini + "T00:00:00").getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const { data: movs } = await db
    .from("movimentos")
    .select("data,tipo,valor,status_conc,descricao,origem,clientes(nome)")
    .gte("data", ini)
    .lte("data", fim)
    .order("data", { ascending: true });

  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const linhas = ["data;cliente;tipo;valor;status;origem;descricao"];
  for (const m of movs || []) {
    linhas.push(
      [
        (m as any).data,
        esc((m as any).clientes?.nome || ""),
        (m as any).tipo,
        Number((m as any).valor).toFixed(2),
        (m as any).status_conc,
        (m as any).origem,
        esc((m as any).descricao || ""),
      ].join(";")
    );
  }

  const csv = "\uFEFF" + linhas.join("\n"); // BOM p/ Excel abrir com acento certo
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeiro-${mes}.csv"`,
    },
  });
}
