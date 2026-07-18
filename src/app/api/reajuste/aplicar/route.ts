import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { enviarWhatsapp } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { acao:'enviar', clienteId, texto }  -> manda a mensagem no WhatsApp
// POST { acao:'aplicar', planoId, valorNovo } -> grava o novo valor (com histórico)
export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const acao = body?.acao;

  if (acao === "enviar") {
    const clienteId = body?.clienteId;
    const texto = (body?.texto || "").trim();
    if (!clienteId || !texto) return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });

    const { data: cli } = await db.from("clientes").select("telefone").eq("id", clienteId).maybeSingle();
    if (!cli) return NextResponse.json({ ok: false, erro: "cliente_nao_encontrado" }, { status: 404 });

    await enviarWhatsapp((cli as any).telefone, texto);

    // registra na conversa aberta, se houver
    const { data: conv } = await db
      .from("conversas")
      .select("id,org_id")
      .eq("cliente_id", clienteId)
      .eq("aberta", true)
      .maybeSingle();
    if (conv) {
      await db.from("mensagens").insert({
        org_id: (conv as any).org_id,
        conversa_id: (conv as any).id,
        cliente_id: clienteId,
        direcao: "saida",
        autor: "humano",
        texto,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (acao === "aplicar") {
    const planoId = body?.planoId;
    const valorNovo = Number(body?.valorNovo);
    if (!planoId || !valorNovo) return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });

    const { error } = await db.rpc("sureya_aplicar_reajuste", {
      p_plano: planoId,
      p_novo_valor: valorNovo,
      p_motivo: "Reajuste de valor",
    });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}
