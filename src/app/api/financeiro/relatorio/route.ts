import { NextRequest, NextResponse } from "next/server";
import { ehDoPeriodo } from "@/lib/financeiro";
import { exigirAdmin } from "@/lib/roles";
import { env } from "@/lib/env";
import { mesOperacao } from "@/lib/vencimento";

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

  const mes = req.nextUrl.searchParams.get("mes") || mesOperacao();
  const ini = `${mes}-01`;
  const fimDate = new Date(new Date(ini + "T00:00:00").getFullYear(), new Date(ini + "T00:00:00").getMonth() + 1, 0);
  const fim = fimDate.toISOString().slice(0, 10);

  // LANCAMENTOS DO MES, NO RAZAO DA FAMILIA (DECISOES.md D-01).
  const { data: movs } = await db
    .from("conta_corrente")
    .select("tipo,valor,status_conc,data,familia_id,origem")
    .gte("data", ini)
    .lte("data", fim);

  let recebido = 0;
  let executado = 0;
  let aConferir = 0;
  for (const m of movs || []) {
    // Saldo de abertura tem data mas nao e movimento do mes. Ver `ehDoPeriodo`.
    if (!ehDoPeriodo((m as any).origem)) continue;
    const v = Number((m as any).valor) || 0;
    const st = (m as any).status_conc;
    if ((m as any).tipo === "credito" && st === "confirmado") recebido += v;
    else if ((m as any).tipo === "credito" && st === "a_conferir") aConferir += v;
    else if ((m as any).tipo === "debito") executado += v;
  }

  // SALDO ATUAL POR FAMILIA (tudo, nao so o mes). Aqui a abertura CONTA: ela e
  // divida de verdade — so nao e movimento do mes.
  //
  // O relatorio passa a listar FAMILIA, nao pessoa. Com o saldo no grao da
  // familia, listar pessoas repetiria a mesma divida uma vez por membro e o
  // "total a receber" sairia multiplicado. O nome exibido e o do RESPONSAVEL
  // FINANCEIRO, que e para quem a cobranca se dirige; se faltar, cai no nome da
  // familia.
  const { data: todos } = await db
    .from("conta_corrente")
    .select("familia_id,tipo,valor,status_conc");
  const [{ data: responsaveis }, { data: familias }] = await Promise.all([
    db.from("clientes").select("nome,familia_id").eq("responsavel_financeiro", true),
    db.from("familias").select("id,nome"),
  ]);
  const nomeDe = new Map<string, string>((familias || []).map((f: any) => [f.id, f.nome]));
  for (const r of (responsaveis || []) as any[]) {
    if (r.familia_id) nomeDe.set(r.familia_id, r.nome);
  }

  const saldoPorCli = new Map<string, number>();
  for (const m of todos || []) {
    const st = (m as any).status_conc;
    if (st === "rejeitado" || st === "a_conferir") continue;
    const cid = (m as any).familia_id;
    if (!cid) continue;
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
