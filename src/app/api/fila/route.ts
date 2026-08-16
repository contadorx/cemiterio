import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";

/**
 * FILA DE LIBERAÇÃO — o sistema prepara, a Sureya decide.
 *
 * Não existe cron, gatilho ou rotina que envie sozinha. A única forma de uma
 * mensagem sair daqui é um POST com acao='enviar', disparado pelo toque da
 * Sureya na tela. Isso é por desenho: robô conversando com idoso quebra
 * exatamente o que faz o cliente ficar.
 */

export async function GET() {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data, error } = await db
    .from("fila_liberacao")
    .select(
      "id,tipo,status,texto,fotos,criado_em," +
        "familias(nome),clientes(nome,telefone),tumulos(codigo,ruas(nome),quadras(codigo))"
    )
    .eq("org_id", org)
    .eq("status", "aguardando")
    .order("criado_em", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const itens = (data || []).map((f: any) => ({
    id: f.id,
    tipo: f.tipo,
    texto: f.texto,
    fotos: Array.isArray(f.fotos) ? f.fotos : [],
    criadoEm: f.criado_em,
    familia: f.familias?.nome ?? null,
    para: f.clientes?.nome ?? null,
    telefone: f.clientes?.telefone ?? null,
    local: f.tumulos
      ? [f.tumulos.quadras?.codigo, f.tumulos.ruas?.nome].filter(Boolean).join(" · ")
      : null,
  }));

  return NextResponse.json({ ok: true, itens });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { id, acao, texto } = await req.json();

  if (!id || !["enviar", "descartar"].includes(acao)) {
    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  }

  // Só mexe no que ainda está aguardando: protege contra clique duplo, que
  // reenviaria a mesma mensagem para a família.
  const { data, error } = await db
    .from("fila_liberacao")
    .update({
      status: acao === "enviar" ? "enviado" : "descartado",
      texto_final: acao === "enviar" ? (texto || null) : null,
      decidido_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", org)
    .eq("status", "aguardando")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { ok: false, erro: "Esta mensagem já foi decidida." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
