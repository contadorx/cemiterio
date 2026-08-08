import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { enviarTextoComRetry } from "@/lib/envio";
import { MARCA } from "@/lib/marca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/familia/link — "perdi o link do acompanhamento".
 *
 * O PROBLEMA REAL
 * -----------------------------------------------------------------------------
 * O portal da família é um link com token (/familia/TOKEN). Ele chega uma vez,
 * pelo WhatsApp, e some na conversa. Seis meses depois a pessoa quer ver as
 * fotos, não acha o link, e o caminho dela é te ligar — ou desistir.
 *
 * A DECISÃO DE SEGURANÇA (é o ponto todo desta rota)
 * -----------------------------------------------------------------------------
 * O link NUNCA aparece na tela. A pessoa digita o telefone e o link é ENVIADO
 * para aquele número no WhatsApp. Quem não é dono do aparelho não recebe nada.
 *
 * E a resposta é SEMPRE a mesma, exista ou não o cadastro: "se este telefone
 * estiver na nossa lista, o link chega em instantes". Sem isso, o formulário
 * viraria uma máquina de descobrir quem é cliente seu — digita um número, vê se
 * dá "encontrado". Isso é dado da família, e não é para vazar por curiosidade.
 *
 * Por isso, aqui, erro e sucesso têm a mesma cara. É de propósito.
 */

const RESPOSTA_UNICA = {
  ok: true,
  mensagem:
    "Se este telefone estiver na nossa lista, o link do acompanhamento chega no WhatsApp em instantes.",
};

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { telefone?: string; empresa?: string };

  // armadilha de robô
  if (String(b?.empresa ?? "").trim()) return NextResponse.json(RESPOSTA_UNICA);

  const digitos = String(b?.telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) {
    return NextResponse.json(
      { ok: false, mensagem: "Confira o telefone com o DDD." },
      { status: 400 },
    );
  }
  const telefone = digitos.length <= 11 ? `55${digitos}` : digitos;

  let org: string;
  let db: ReturnType<typeof supabaseAdmin>;
  try {
    org = env.orgId();
    db = supabaseAdmin();
  } catch {
    return NextResponse.json(RESPOSTA_UNICA); // nem o erro de config a gente conta
  }

  try {
    // 1) de quem é este telefone? principal ou adicional (telefones_cliente)
    let clienteId: string | null = null;

    const { data: cli } = await db
      .from("clientes")
      .select("id,nome")
      .eq("org_id", org)
      .eq("telefone", telefone)
      .maybeSingle();
    if (cli) clienteId = (cli as any).id;

    if (!clienteId) {
      const { data: extra } = await db
        .from("telefones_cliente")
        .select("cliente_id")
        .eq("org_id", org)
        .eq("telefone", telefone)
        .maybeSingle();
      if (extra) clienteId = (extra as any).cliente_id;
    }

    if (!clienteId) return NextResponse.json(RESPOSTA_UNICA);

    // 2) os jazigos dessa família
    const { data: tumulos } = await db
      .from("tumulos")
      .select("id,identificacao,falecido_nome,qr_token")
      .eq("org_id", org)
      .eq("cliente_id", clienteId)
      .limit(10);

    const lista = ((tumulos as any[]) || []);
    if (!lista.length) return NextResponse.json(RESPOSTA_UNICA);

    // 3) garante token para cada um (quem nunca teve, ganha agora)
    const base = origemDoSite(req);
    const linhas: string[] = [];

    for (const t of lista) {
      let token = t.qr_token as string | null;
      if (!token) {
        token = randomBytes(16).toString("hex");
        const { error } = await db.from("tumulos").update({ qr_token: token }).eq("id", t.id);
        if (error) continue;
      }
      const quem = t.falecido_nome ? `${t.falecido_nome} — ` : "";
      linhas.push(`${quem}jazigo ${t.identificacao}\n${base}/familia/${token}`);
    }

    if (!linhas.length) return NextResponse.json(RESPOSTA_UNICA);

    const texto =
      `${MARCA.nome}\n\n` +
      `Aqui está o seu acompanhamento — as fotos de cada visita ficam nesta página:\n\n` +
      linhas.join("\n\n") +
      `\n\nGuarde este link. Ele não expira.`;

    await enviarTextoComRetry(telefone, texto);
  } catch {
    // qualquer falha vira a mesma resposta: a página não pode virar um detector
    // de "este número é cliente?".
  }

  return NextResponse.json(RESPOSTA_UNICA);
}

/**
 * O endereço público do site, para montar o link.
 * Usa o host da própria requisição — assim funciona igual no domínio final, na
 * pré-visualização da Vercel e no seu computador, sem variável nova.
 */
function origemDoSite(req: NextRequest): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || MARCA.site;
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
