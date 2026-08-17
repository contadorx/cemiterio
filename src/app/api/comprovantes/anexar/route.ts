import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { subirArquivo } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ANEXAR COMPROVANTE À MÃO.
 *
 * POR QUE ISTO PRECISA EXISTIR
 * Até agora o comprovante só entrava por um caminho: a família mandava a foto
 * do Pix no WhatsApp e o agente de IA lia. Os dois lados desse caminho estão
 * desligados — o agente por decisão, e a instância pode cair a qualquer
 * momento.
 *
 * Resultado: sem WhatsApp conectado, NÃO HAVIA COMO registrar um comprovante.
 * O dinheiro entrava na conta da Sureya e o sistema não sabia.
 *
 * Agora ela tira uma foto da tela — ou salva o print que a família mandou no
 * WhatsApp pessoal dela — e anexa aqui. Funciona com a instância de pé ou
 * caída, e não depende de nenhuma automação.
 *
 * O status nasce `confirmado`: quem anexou foi a própria Sureya, olhando. O
 * `a_conferir` existia para o que o robô lia sozinho e podia estar errado.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const clienteId = String(b?.clienteId || "");
  const base64 = String(b?.imagemBase64 || "");

  if (!clienteId) {
    return NextResponse.json({ ok: false, erro: "cliente_obrigatorio" }, { status: 400 });
  }
  if (!base64) {
    return NextResponse.json({ ok: false, erro: "imagem_obrigatoria" }, { status: 400 });
  }

  // O cliente tem de existir e ser visível sob RLS: sem isto um id de outra
  // org anexaria comprovante na ficha errada.
  const { data: cli } = await db
    .from("clientes").select("id").eq("id", clienteId).maybeSingle();
  if (!cli) {
    return NextResponse.json({ ok: false, erro: "cliente_nao_encontrado" }, { status: 404 });
  }

  let url: string;
  try {
    const limpo = base64.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(limpo, "base64");
    const mime = String(b?.mimetype || "image/jpeg");
    const ext = mime.includes("png") ? "png" : "jpg";

    const envio = await subirArquivo(
      db,
      "comprovantes",
      `${org}/${clienteId}/${Date.now()}.${ext}`,
      bytes,
      mime,
    );
    if (!envio.ok) {
      return NextResponse.json(
        { ok: false, erro: "falha_upload", mensagem: envio.erro },
        { status: 500 },
      );
    }
    url = envio.url;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: "falha_upload", mensagem: String(e?.message || e) },
      { status: 500 },
    );
  }

  const valor = Number(String(b?.valor ?? "").replace(",", "."));

  const { data, error } = await db
    .from("comprovantes")
    .insert({
      org_id: org,
      cliente_id: clienteId,
      imagem_url: url,
      valor_extraido: isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null,
      data_extraida: b?.data || new Date().toISOString().slice(0, 10),
      status: "confirmado",
    })
    .select("id,imagem_url")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, url: data.imagem_url });
}
