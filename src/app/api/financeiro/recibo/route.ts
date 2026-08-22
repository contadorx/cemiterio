import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { env } from "@/lib/env";
import { MARCA } from "@/lib/marca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?movimentoId=... -> dados do recibo de um pagamento (crédito confirmado)
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const movimentoId = req.nextUrl.searchParams.get("movimentoId");
  if (!movimentoId) return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });

  // O ID PODE SER DE QUALQUER UM DOS DOIS RAZOES.
  //
  // Enquanto `movimentos` e `conta_corrente` convivem, ha pagamento que existe
  // so no razao novo — em producao, o de R$ 100,00 de 08/08 e um deles. Antes
  // desta mudanca, pedir o recibo dele devolvia "nao_e_pagamento": a familia
  // pagava e nao tinha como receber comprovante. Procura nos dois, comecando
  // pelo novo, que e a fonte da verdade.
  const { data: lanc } = await db
    .from("conta_corrente")
    .select("id,valor,data,tipo,status_conc,descricao,familia_id,familias(nome)")
    .eq("id", movimentoId)
    .maybeSingle();

  let mov: any = null;
  if (lanc) {
    // No razao da familia o titular do recibo e o RESPONSAVEL FINANCEIRO — a
    // pessoa a quem a cobranca se dirige. E o mesmo criterio de D-01.
    const { data: resp } = await db
      .from("clientes").select("nome")
      .eq("familia_id", (lanc as any).familia_id)
      .eq("responsavel_financeiro", true)
      .maybeSingle();
    mov = { ...(lanc as any), clientes: { nome: (resp as any)?.nome || (lanc as any).familias?.nome } };
  } else {
    const { data: antigo } = await db
      .from("movimentos")
      .select("id,valor,data,tipo,status_conc,descricao,cliente_id,clientes(nome)")
      .eq("id", movimentoId)
      .maybeSingle();
    mov = antigo;
  }

  if (!mov || (mov as any).tipo !== "credito") {
    return NextResponse.json({ ok: false, erro: "nao_e_pagamento" }, { status: 400 });
  }

  // Comprovante informado e ainda nao conferido NAO vira recibo. Recibo e a
  // casa dizendo "recebi"; dizer isso antes de bater o extrato e o que a
  // conferencia existe para impedir.
  if ((mov as any).status_conc === "a_conferir" || (mov as any).status_conc === "rejeitado") {
    return NextResponse.json({ ok: false, erro: "pagamento_nao_confirmado" }, { status: 400 });
  }

  const { data: org } = await db.from("orgs").select("nome,marca_nome,marca_assinatura").eq("id", env.orgId()).maybeSingle();

  return NextResponse.json({
    ok: true,
    recibo: {
      numero: (mov as any).id.slice(0, 8).toUpperCase(),
      cliente: (mov as any).clientes?.nome || "—",
      valor: Number((mov as any).valor),
      data: (mov as any).data,
      descricao: (mov as any).descricao || "Pagamento de serviço de limpeza",
      emitente: (org as any)?.marca_nome || (org as any)?.nome || MARCA.nome,
      assinatura: (org as any)?.marca_assinatura || MARCA.assinatura,
    },
  });
}
