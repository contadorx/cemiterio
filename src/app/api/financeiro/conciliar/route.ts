import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { calcularSaldo } from "@/lib/financeiro";
import { auditar } from "@/lib/auditoria";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Corpo: { comprovanteId, aprovar,
 *          valor?, data?, tumuloId?, competencia?, descricao? }
 *
 * Os cinco últimos são A DECISÃO de quem confere (0134). A tela oferecia só
 * "Confirmar" e "Rejeitar" — e confirmar sem saber de quem é, quanto a família
 * deve e a que o pagamento se refere não é conferência, é carimbo.
 *
 * `valor` e `data` CORRIGEM o comprovante: a leitura da IA é um palpite bom,
 * não um fato. Quem tem o extrato do banco do lado é a pessoa.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const comprovanteId: string = body?.comprovanteId;
  const aprovar: boolean = !!body?.aprovar;
  if (!comprovanteId) return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });

  // Vazio é DIFERENTE de zero aqui: vazio quer dizer "não corrigi nada, use o
  // que a leitura achou". Um `Number("")` viraria 0 e a função recusaria.
  const cru = body?.valor;
  const valor = cru === "" || cru === null || cru === undefined
    ? null
    : Number(String(cru).replace(",", "."));
  if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) {
    return NextResponse.json(
      { ok: false, erro: "valor_invalido",
        mensagem: "O valor conferido precisa ser maior que zero." },
      { status: 400 });
  }

  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.data || "")) ? String(body.data) : null;
  // A competência chega como "2026-08" e o banco guarda data: o dia 1 é a
  // convenção que o resto do sistema já usa para dizer "o mês inteiro".
  const competencia = /^\d{4}-\d{2}$/.test(String(body?.competencia || ""))
    ? `${body.competencia}-01` : null;

  const { data: comp } = await db
    .from("comprovantes")
    .select("cliente_id")
    .eq("id", comprovanteId)
    .maybeSingle();

  const { error } = await db.rpc("sureya_conciliar_comprovante", {
    p_comprovante: comprovanteId,
    p_aprovar: aprovar,
    p_valor: valor,
    p_data: data,
    p_tumulo: body?.tumuloId || null,
    p_competencia: competencia,
    p_descricao: String(body?.descricao || "").trim().slice(0, 300) || null,
  });
  if (error) {
    return NextResponse.json({
      ok: false, erro: error.message,
      mensagem: /valor_invalido/.test(error.message)
        ? "O valor conferido precisa ser maior que zero."
        : error.message,
    }, { status: 400 });
  }

  // pagamento entrou e quitou? zera a régua de cobrança gentil
  if (aprovar && (comp as any)?.cliente_id) {
    const s = await calcularSaldo((comp as any).cliente_id);
    // Quitou o que JA VENCEU (0114): uma competencia com vencimento la na
    // frente nao pode segurar a regua queimada.
    if (s.vencido >= -0.005) {
      await db
        .from("clientes")
        .update({ cobranca_nivel: 0, cobranca_em: null })
        .eq("id", (comp as any).cliente_id);
    }
  }

  const org = await orgAtual(db);
  if (org) {
    await auditar(db, org, auth.userId, aprovar ? "confirmou_pagamento" : "rejeitou_comprovante", { tipo: "comprovante", id: comprovanteId });
  }

  return NextResponse.json({ ok: true, status: aprovar ? "confirmado" : "rejeitado" });
}
