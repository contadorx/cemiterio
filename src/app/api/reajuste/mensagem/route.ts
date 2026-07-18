import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase-server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let _cli: Anthropic | null = null;
function anthropic() {
  if (!_cli) _cli = new Anthropic({ apiKey: env.anthropicKey() });
  return _cli;
}

// POST { planoId, valorNovo } -> gera o texto do reajuste (não envia).
export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const planoId: string = body?.planoId;
  const valorNovo: number = Number(body?.valorNovo);
  if (!planoId || !valorNovo) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  const { data: plano } = await db
    .from("planos")
    .select("valor_vigente,data_valor_vigente,clientes(nome)")
    .eq("id", planoId)
    .maybeSingle();
  if (!plano) return NextResponse.json({ ok: false, erro: "plano_nao_encontrado" }, { status: 404 });

  const nome = (plano as any).clientes?.nome || "";
  const valorAtual = Number((plano as any).valor_vigente) || 0;

  try {
    const resp = await anthropic().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 400,
      system:
        "Você escreve uma mensagem de WhatsApp curta, calorosa e respeitosa para comunicar um reajuste de preço de um serviço de limpeza e manutenção de túmulos. O cliente costuma ser uma pessoa que cuida da memória de alguém querido. Seja gentil, agradeça a confiança, explique com naturalidade que o valor não é ajustado há um tempo, informe o novo valor e diga que segue à disposição. Sem tom comercial agressivo, sem pressão, sem justificar demais. Retorne apenas a mensagem, sem aspas.",
      messages: [
        {
          role: "user",
          content: `Cliente: ${nome || "(sem nome)"}. Valor atual: R$ ${valorAtual.toFixed(
            2
          )} por limpeza. Novo valor: R$ ${valorNovo.toFixed(2)}. Escreva a mensagem de reajuste.`,
        },
      ],
    });

    const texto = resp.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    return NextResponse.json({ ok: true, mensagem: texto });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "falha_ia" }, { status: 500 });
  }
}
