import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { enviarWhatsapp } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corpo: { interacaoId, acao: 'aprovou'|'editou'|'descartou', textoFinal? }
// - aprovou  -> envia o rascunho como está
// - editou   -> envia o textoFinal (rascunho corrigido)
// - descartou-> não envia nada
// Em todos os casos o score do contato é atualizado pela RPC (respeita RLS: humano logado).
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const interacaoId: string = body?.interacaoId;
  const acao: string = body?.acao;
  const textoFinal: string | undefined = body?.textoFinal;

  if (!interacaoId || !["aprovou", "editou", "descartou"].includes(acao)) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  // Carrega a interação (RLS garante que é da org do usuário).
  const { data: inter } = await db
    .from("interacoes_ia")
    .select("id,org_id,cliente_id,conversa_id,rascunho")
    .eq("id", interacaoId)
    .maybeSingle();
  if (!inter) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  const textoParaEnviar =
    acao === "editou" ? (textoFinal || "").trim() : (inter as any).rascunho;

  if (acao !== "descartou") {
    if (!textoParaEnviar)
      return NextResponse.json({ ok: false, erro: "texto_vazio" }, { status: 400 });

    // telefone do cliente
    const { data: cli } = await db
      .from("clientes")
      .select("telefone")
      .eq("id", (inter as any).cliente_id)
      .single();

    await enviarWhatsapp((cli as any).telefone, textoParaEnviar);

    // registra a saída na conversa
    await db.from("mensagens").insert({
      org_id: (inter as any).org_id,
      conversa_id: (inter as any).conversa_id,
      cliente_id: (inter as any).cliente_id,
      direcao: "saida",
      autor: "humano",
      texto: textoParaEnviar,
    });
  }

  // Move o score e fecha a interação.
  const { data: novoScore, error } = await db.rpc("sureya_registrar_acao_ia", {
    p_interacao: interacaoId,
    p_acao: acao,
    p_texto_final: acao === "editou" ? textoParaEnviar : null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, enviado: acao !== "descartou", score: novoScore });
}
