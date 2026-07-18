import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { enviarWhatsapp } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { texto } — envia a mensagem no WhatsApp, registra e assume a conversa
// (escalada_humano = true) pra IA não responder por cima.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const texto = (body?.texto || "").trim();
  if (!texto) return NextResponse.json({ ok: false, erro: "texto_vazio" }, { status: 400 });

  const { data: conv } = await db
    .from("conversas")
    .select("id,org_id,cliente_id,clientes(telefone)")
    .eq("id", params.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  const telefone = (conv as any).clientes?.telefone;
  if (!telefone) return NextResponse.json({ ok: false, erro: "sem_telefone" }, { status: 400 });

  await enviarWhatsapp(telefone, texto);

  await db.from("mensagens").insert({
    org_id: (conv as any).org_id,
    conversa_id: (conv as any).id,
    cliente_id: (conv as any).cliente_id,
    direcao: "saida",
    autor: "humano",
    texto,
  });

  // Responder NÃO tira a IA da conversa. Antes, cada resposta manual escalava a
  // conversa para sempre — e a IA parava de acompanhar aquela família, voltando
  // a tratar tudo como novo depois. Agora ela continua junto, aprendendo do que
  // você escreveu. Para assumir de vez, use "Assumir" na tela da conversa.
  await db.from("conversas").update({
    resolvida: false,
    ultimo_autor: "humano",
  }).eq("id", params.id);

  // o que você escreveu é a melhor lição sobre esta família: marca para redestilar
  if ((conv as any).cliente_id) {
    await db.from("clientes")
      .update({ perfil_ia_msgs: 999 })   // força a próxima destilação
      .eq("id", (conv as any).cliente_id)
      .then(() => null, () => null);
  }

  return NextResponse.json({ ok: true });
}
