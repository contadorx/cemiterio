import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?mes=yyyy-mm  -> visão financeira do mês:
//  - recebido (créditos confirmados no mês)
//  - executado (débitos no mês = serviço prestado)
//  - a conferir (créditos a_conferir no mês)
//  - por cliente (saldo atual de cada um: adiantado / em aberto)
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const mes = req.nextUrl.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const ini = `${mes}-01`;
  const fimDate = new Date(new Date(ini + "T00:00:00").getFullYear(), new Date(ini + "T00:00:00").getMonth() + 1, 0);
  const fim = fimDate.toISOString().slice(0, 10);

  // movimentos do mês
  const { data: movs } = await db
    .from("movimentos")
    .select("tipo,valor,status_conc,data,cliente_id")
    .gte("data", ini)
    .lte("data", fim);

  let recebido = 0;
  let executado = 0;
  let aConferir = 0;
  for (const m of movs || []) {
    const v = Number((m as any).valor) || 0;
    const st = (m as any).status_conc;
    if ((m as any).tipo === "credito" && st === "confirmado") recebido += v;
    else if ((m as any).tipo === "credito" && st === "a_conferir") aConferir += v;
    else if ((m as any).tipo === "debito") executado += v;
  }

  // saldo atual por cliente (todos os movimentos, não só do mês)
  const { data: todos } = await db
    .from("movimentos")
    .select("cliente_id,tipo,valor,status_conc");
  const { data: clientes } = await db.from("clientes").select("id,nome");
  const nomeDe = new Map((clientes || []).map((c: any) => [c.id, c.nome]));

  const saldoPorCli = new Map<string, number>();
  for (const m of todos || []) {
    const st = (m as any).status_conc;
    if (st === "rejeitado" || st === "a_conferir") continue;
    const cid = (m as any).cliente_id;
    const v = Number((m as any).valor) || 0;
    saldoPorCli.set(cid, (saldoPorCli.get(cid) || 0) + ((m as any).tipo === "credito" ? v : -v));
  }

  const emAberto: { cliente: string; valor: number }[] = [];
  const adiantados: { cliente: string; valor: number }[] = [];
  let totalReceber = 0;
  for (const [cid, saldo] of saldoPorCli) {
    if (saldo < -0.005) {
      emAberto.push({ cliente: nomeDe.get(cid) || "—", valor: Math.abs(saldo) });
      totalReceber += Math.abs(saldo);
    } else if (saldo > 0.005) {
      adiantados.push({ cliente: nomeDe.get(cid) || "—", valor: saldo });
    }
  }
  emAberto.sort((a, b) => b.valor - a.valor);
  adiantados.sort((a, b) => b.valor - a.valor);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return NextResponse.json({
    ok: true,
    mes,
    recebido: r2(recebido),
    executado: r2(executado),
    aConferir: r2(aConferir),
    totalReceber: r2(totalReceber),
    emAberto: emAberto.map((x) => ({ ...x, valor: r2(x.valor) })),
    adiantados: adiantados.map((x) => ({ ...x, valor: r2(x.valor) })),
  });
}
