import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { conferir, type LinhaExtrato } from "@/lib/extrato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * IMPORTAR — depois que alguém olhou.
 *
 * A conferência do saldo roda DE NOVO aqui, sobre as linhas que chegaram. Não é
 * desconfiança da tela: é que a rota é uma porta pública do sistema, e uma
 * porta de dinheiro que confia no que o cliente manda é uma porta aberta.
 *
 * Importar duas vezes não dobra nada — a chave de cada linha é gerada no banco
 * e o índice único recusa a repetição. Reimportar o mês inteiro depois de ter
 * importado a primeira semana acrescenta só o que falta.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const linhas = (Array.isArray(b?.linhas) ? b.linhas : []) as LinhaExtrato[];
  if (!linhas.length) {
    return NextResponse.json({ ok: false, erro: "sem_linhas" }, { status: 400 });
  }

  const conf = conferir(
    linhas,
    b?.saldoInicial == null ? null : Number(b.saldoInicial),
  );
  if (conf.fecha === false) {
    return NextResponse.json(
      { ok: false, erro: "nao_fecha", mensagem: conf.problema },
      { status: 400 },
    );
  }

  const { data, error } = await auth.db.rpc("sureya_importar_extrato", {
    p_linhas: linhas as any,
    p_arquivo: b?.nome || null,
    p_formato: b?.formato || null,
    p_confere: conf.fecha,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, ...(data as any) });
}

// PUT { ids: [], natureza: "pessoal" | "negocio" | null } — o que é seu fica seu
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const ids = (Array.isArray(b?.ids) ? b.ids : []).map(String);
  if (!ids.length) return NextResponse.json({ ok: false, erro: "sem_ids" }, { status: 400 });

  const { data, error } = await auth.db.rpc("sureya_classificar_saidas", {
    p_ids: ids,
    p_natureza: b?.natureza ?? null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mudadas: Number(data) || 0 });
}
