import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH — o que dá para fazer com uma lavagem ainda não feita.
 *
 *  remarcar  { novaData, replanejar? , motivo? }
 *      Move a lavagem. Com replanejar (padrão), as seguintes deste jazigo
 *      andam junto, mantendo o intervalo combinado.
 *
 *  pular     { motivo? }
 *      Não faz esta, mas a régua continua: a próxima já vem do ciclo seguinte.
 *
 *  cancelar
 *      Marca cancelada, sem mexer no plano.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  if (acao === "remarcar") {
    if (!body?.novaData) {
      return NextResponse.json({ ok: false, erro: "novaData_obrigatoria" }, { status: 400 });
    }
    const { data, error } = await db.rpc("sureya_remarcar_servico", {
      p_servico: params.id,
      p_nova_data: body.novaData,
      p_replanejar: body?.replanejar !== false,
      p_motivo: body?.motivo || null,
    });
    if (error) {
      const amigavel = error.message.includes("ja_executado")
        ? "Esta lavagem já foi feita — não dá para remarcar."
        : error.message;
      return NextResponse.json({ ok: false, erro: amigavel }, { status: 400 });
    }
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return NextResponse.json({
      ok: true,
      novaData: r.nova_data,
      proximaDoJazigo: r.proxima_do_jazigo,
      seguintesMovidas: r.seguintes_movidas || 0,
    });
  }

  if (acao === "pular") {
    const { data, error } = await db.rpc("sureya_pular_servico", {
      p_servico: params.id, p_motivo: body?.motivo || null,
    });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, proximaDoJazigo: data });
  }

  if (acao === "cancelar") {
    const { error } = await db
      .from("servicos").update({ status: "cancelado" })
      .eq("id", params.id).neq("status", "executado");
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}

// DELETE — apaga a lavagem. Executada não pode: vira histórico da família.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { data, error } = await auth.db.rpc("sureya_excluir_servico", { p_servico: params.id });
  if (error) {
    const amigavel = error.message.includes("ja_executado")
      ? "Esta lavagem já foi feita. O histórico da família não pode ser apagado — se quiser, cancele o plano."
      : error.message;
    return NextResponse.json({ ok: false, erro: amigavel }, { status: 400 });
  }
  return NextResponse.json({ ok: !!data });
}
