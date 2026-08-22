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

  // A EXPORTACAO TEM DE TRAZER OS DOIS RAZOES.
  //
  // Desde a decisao de 22/08 (DECISOES.md D-01) a vida financeira da pessoa
  // esta em `conta_corrente`, no grao da familia — e ha familia cuja divida
  // inteira so existe la. Exportar apenas `movimentos` devolveria um arquivo
  // vazio no campo financeiro para quem tem lancamento, o que faz o direito de
  // acesso falhar exatamente onde ele mais importa.
  //
  // O razao da familia vai identificado como tal: e um extrato COMPARTILHADO
  // entre os membros, nao um registro individual, e quem le o arquivo precisa
  // saber disso.
  const { data: cli } = await db
    .from("clientes").select("familia_id").eq("id", params.id).maybeSingle();
  const familiaId = (cli as any)?.familia_id as string | null;

  const [{ data: cliente }, { data: tumulos }, { data: servicos }, { data: movimentos }, { data: contaCorrente }, { data: mensagens }] =
    await Promise.all([
      db.from("clientes").select("nome,telefone,consentimento_em,codigo_indicacao,created_at").eq("id", params.id).maybeSingle(),
      db.from("tumulos").select("identificacao,falecido_nome").eq("cliente_id", params.id),
      db.from("servicos").select("data_prevista,data_executada,status").eq("cliente_id", params.id),
      db.from("movimentos").select("tipo,valor,data,descricao").eq("cliente_id", params.id),
      familiaId
        ? db.from("conta_corrente").select("tipo,valor,data,descricao,origem,status_conc").eq("familia_id", familiaId)
        : Promise.resolve({ data: [] } as any),
      db.from("mensagens").select("direcao,autor,texto,created_at").eq("cliente_id", params.id).order("created_at"),
    ]);

  return NextResponse.json({
    ok: true,
    export: {
      cliente,
      tumulos,
      servicos,
      contaCorrenteDaFamilia: contaCorrente || [],
      movimentosLegado: movimentos,
      mensagens,
      geradoEm: new Date().toISOString(),
    },
  });
}
