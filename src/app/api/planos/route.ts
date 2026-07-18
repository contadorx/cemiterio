import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista dos planos com tudo que a gestão precisa ver e ajustar num lugar só:
 * valor, periodicidade, pago até, próxima lavagem, próxima cobrança e situação.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const q = req.nextUrl.searchParams;

  const { data: planos } = await db
    .from("planos")
    .select("id,cliente_id,tumulo_id,cadencia,qtd_por_passagem,valor_mensal,valor_vigente," +
            "data_valor_vigente,proximo_servico,proxima_cobranca,pago_ate,ativo,migrado_em," +
            "clientes(nome,telefone,tratamento,cobranca_antecipada,regua_cobranca)," +
            "tumulos(identificacao,rua,quadra_id,quadras(codigo))")
    .limit(400);

  const hoje = new Date().toISOString().slice(0, 10);
  let lista = (planos || []).map((p: any) => ({
    id: p.id,
    clienteId: p.cliente_id,
    cliente: p.clientes?.nome || "—",
    tratamento: p.clientes?.tratamento || "",
    antecipada: !!p.clientes?.cobranca_antecipada,
    regua: p.clientes?.regua_cobranca || "padrao",
    jazigo: p.tumulos?.identificacao || "—",
    quadra: p.tumulos?.quadras?.codigo || "",
    rua: p.tumulos?.rua || "",
    cadencia: p.cadencia,
    valorMensal: Number(p.valor_mensal ?? p.valor_vigente ?? 0),
    valorCiclo: Number(p.valor_vigente || 0),
    desde: p.data_valor_vigente,
    pagoAte: p.pago_ate,
    proximaLavagem: p.proximo_servico,
    proximaCobranca: p.proxima_cobranca,
    ativo: p.ativo !== false,
    conferido: !!p.migrado_em,
    atrasado: p.pago_ate ? p.pago_ate < hoje : null,
    faltaData: !p.proximo_servico || !p.proxima_cobranca,
  }));

  // filtros
  const busca = (q.get("busca") || "").trim().toLowerCase();
  if (busca) lista = lista.filter((p) =>
    p.cliente.toLowerCase().includes(busca) || p.jazigo.toLowerCase().includes(busca));
  if (q.get("quadra")) lista = lista.filter((p) => p.quadra === q.get("quadra"));
  if (q.get("cadencia")) lista = lista.filter((p) => p.cadencia === q.get("cadencia"));

  const sit = q.get("situacao") || "";
  if (sit === "falta_data") lista = lista.filter((p) => p.faltaData && p.ativo);
  if (sit === "nao_conferido") lista = lista.filter((p) => !p.conferido);
  if (sit === "atrasados") lista = lista.filter((p) => p.atrasado);
  if (sit === "inativos") lista = lista.filter((p) => !p.ativo);
  if (sit === "ativos") lista = lista.filter((p) => p.ativo);

  if (q.get("teste") !== "1") lista = lista.filter((p) => !p.cliente.startsWith("[TESTE]"));

  const ordem = q.get("ordem") || "quadra";
  if (ordem === "quadra") lista.sort((a, b) =>
    (a.quadra + a.rua + a.cliente).localeCompare(b.quadra + b.rua + b.cliente));
  if (ordem === "valor") lista.sort((a, b) => b.valorMensal - a.valorMensal);
  if (ordem === "lavagem") lista.sort((a, b) =>
    String(a.proximaLavagem || "9999").localeCompare(String(b.proximaLavagem || "9999")));
  if (ordem === "cobranca") lista.sort((a, b) =>
    String(a.proximaCobranca || "9999").localeCompare(String(b.proximaCobranca || "9999")));

  return NextResponse.json({
    ok: true,
    planos: lista,
    totais: {
      quantidade: lista.length,
      mensal: Math.round(lista.filter((p) => p.ativo).reduce((s, p) => s + p.valorMensal, 0) * 100) / 100,
      faltaData: lista.filter((p) => p.faltaData && p.ativo).length,
      naoConferidos: lista.filter((p) => !p.conferido).length,
    },
  });
}
