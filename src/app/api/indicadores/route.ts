import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { ehDoPeriodo } from "@/lib/financeiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Indicadores de gestão para o Início.
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const hoje = new Date();
  const mes = hoje.toISOString().slice(0, 7);
  const ini = `${mes}-01`;
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  const trintaAtras = new Date(Date.now() - 30 * 86400000).toISOString();

  // OS DOIS NUMEROS VEM DO RAZAO DA FAMILIA (DECISOES.md D-01).
  // Antes vinham de `movimentos`, e por isso a familia Anninha — que devia
  // R$ 240,00 registrados so no razao novo — nao entrava no "a receber".
  const [
    { data: movsMes },
    { data: todosMov },
    { data: clientes },
    { data: servMes },
    { data: aval },
    { data: interacoes },
  ] = await Promise.all([
    db.from("conta_corrente").select("tipo,valor,status_conc,data,origem").gte("data", ini).lte("data", fim),
    db.from("conta_corrente").select("familia_id,tipo,valor,status_conc"),
    db.from("clientes").select("id,anonimizado_em"),
    db.from("servicos").select("id,status,data_executada").gte("data_executada", ini).lte("data_executada", fim + "T23:59:59"),
    db.from("avaliacoes").select("nota").not("respondida_em", "is", null),
    db.from("interacoes_ia").select("acao_humana,created_at").gte("created_at", trintaAtras),
  ]);

  // financeiro do mês
  let recebido = 0;
  let executado = 0;
  for (const m of movsMes || []) {
    // Saldo de abertura tem data, mas nao e trabalho do mes nem dinheiro que
    // entrou no mes: e o que a familia ja devia. Ver `ehDoPeriodo`.
    if (!ehDoPeriodo((m as any).origem)) continue;
    const v = Number((m as any).valor) || 0;
    if ((m as any).tipo === "credito" && (m as any).status_conc === "confirmado") recebido += v;
    else if ((m as any).tipo === "debito") executado += v;
  }

  // A RECEBER: soma dos saldos negativos, por FAMILIA — que e quem deve.
  // Agrupar por pessoa aqui contaria a mesma divida uma vez por membro.
  // Aqui a abertura CONTA: ela e divida de verdade, so nao e do mes.
  const saldo = new Map<string, number>();
  for (const m of todosMov || []) {
    const st = (m as any).status_conc;
    if (st === "rejeitado" || st === "a_conferir") continue;
    const fid = (m as any).familia_id;
    if (!fid) continue;
    const v = Number((m as any).valor) || 0;
    saldo.set(fid, (saldo.get(fid) || 0) + ((m as any).tipo === "credito" ? v : -v));
  }
  let aReceber = 0;
  for (const s of saldo.values()) if (s < 0) aReceber += -s;

  const clientesAtivos = (clientes || []).filter((c: any) => !c.anonimizado_em).length;
  const servExecutados = (servMes || []).filter((s: any) => s.status === "executado").length;

  const notas = (aval || []).map((a: any) => a.nota).filter(Boolean);
  const mediaAval = notas.length ? notas.reduce((s: number, n: number) => s + n, 0) / notas.length : null;

  // % automático (últimos 30d): enviou_direto vs total decidido
  const decididas = (interacoes || []).filter((i: any) => i.acao_humana);
  const auto = decididas.filter((i: any) => i.acao_humana === "enviou_direto").length;
  const pctAuto = decididas.length ? Math.round((auto / decididas.length) * 100) : null;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return NextResponse.json({
    ok: true,
    mes,
    recebidoMes: r2(recebido),
    executadoMes: r2(executado),
    aReceber: r2(aReceber),
    clientesAtivos,
    servExecutadosMes: servExecutados,
    mediaAvaliacoes: mediaAval,
    pctAutomatico: pctAuto,
  });
}
