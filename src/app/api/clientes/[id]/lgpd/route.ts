import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { auditar } from "@/lib/auditoria";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { acao:'anonimizar' | 'indicacao' | 'consentimento', via? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  if (acao === "anonimizar") {
    const { error } = await db.rpc("sureya_anonimizar_cliente", { p_cliente: params.id });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    const org = await orgAtual(db);
    if (org) await auditar(db, org, auth.userId, "anonimizou_cliente", { tipo: "cliente", id: params.id });
    return NextResponse.json({ ok: true });
  }

  if (acao === "consentimento") {
    const { error } = await db.rpc("sureya_registrar_consentimento", {
      p_cliente: params.id,
      p_via: body?.via || "cadastro",
    });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (acao === "indicacao") {
    const { data, error } = await db.rpc("sureya_gerar_codigo_indicacao", { p_cliente: params.id });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, codigo: data });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}

// GET -> exporta os dados do cliente (LGPD: direito de acesso/portabilidade)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const [{ data: cliente }, { data: tumulos }, { data: servicos }, { data: movimentos }, { data: mensagens }] =
    await Promise.all([
      db.from("clientes").select("nome,telefone,consentimento_em,codigo_indicacao,created_at").eq("id", params.id).maybeSingle(),
      db.from("tumulos").select("identificacao,falecido_nome").eq("cliente_id", params.id),
      db.from("servicos").select("data_prevista,data_executada,status").eq("cliente_id", params.id),
      db.from("movimentos").select("tipo,valor,data,descricao").eq("cliente_id", params.id),
      db.from("mensagens").select("direcao,autor,texto,created_at").eq("cliente_id", params.id).order("created_at"),
    ]);

  return NextResponse.json({
    ok: true,
    export: { cliente, tumulos, servicos, movimentos, mensagens, geradoEm: new Date().toISOString() },
  });
}
