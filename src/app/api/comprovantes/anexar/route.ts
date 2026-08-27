import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinar } from "@/lib/storage";
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
  // O IDENTIFICADOR DA TRANSAÇÃO É O QUE IMPEDE O CRÉDITO EM DOBRO.
  //
  // Com a leitura voltando a valer pelas DUAS portas, o mesmo Pix pode entrar
  // duas vezes: a família manda a foto no WhatsApp e a Sureya anexa o print do
  // mesmo pagamento. Sem trava, o razão da família credita dois.
  //
  // O E2E do Pix é único por pagamento e vem impresso no comprovante. Onde ele
  // foi lido, ele tranca (índice único da 0121).
  const idTransacao = String(b?.idTransacao || "").trim() || null;

  if (idTransacao) {
    const { data: repetido } = await db
      .from("comprovantes")
      .select("id,cliente_id,valor_extraido,data_extraida")
      .eq("id_transacao", idTransacao)
      .maybeSingle();
    if (repetido) {
      return NextResponse.json({
        ok: false,
        erro: "comprovante_repetido",
        mensagem:
          "Este mesmo pagamento já está registrado — o identificador da "
          + "transação bate com um comprovante que já existe. Se for outro "
          + "pagamento, apague o identificador lido e anexe de novo.",
        existente: repetido,
      }, { status: 409 });
    }
  }

  const { data, error } = await db
    .from("comprovantes")
    .insert({
      org_id: org,
      cliente_id: clienteId,
      imagem_url: url,
      valor_extraido: isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null,
      data_extraida: b?.data || new Date().toISOString().slice(0, 10),
      id_transacao: idTransacao,
      status: "confirmado",
    })
    .select("id,imagem_url")
    .single();

  if (error) {
    // O índice único da 0121 é a segunda linha de defesa: entre a consulta
    // acima e este insert, o caminho do WhatsApp pode ter gravado o mesmo Pix.
    if (String(error.message).includes("idx_comprovante_transacao_unica")) {
      return NextResponse.json({
        ok: false,
        erro: "comprovante_repetido",
        mensagem: "Este mesmo pagamento acabou de ser registrado por outro caminho.",
      }, { status: 409 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  // Balde fechado: quem acabou de anexar precisa conseguir conferir o que
  // anexou, e o endereço cru não abre.
  return NextResponse.json({
    ok: true, id: data.id,
    url: await assinar(supabaseAdmin(), data.imagem_url),
  });
}
