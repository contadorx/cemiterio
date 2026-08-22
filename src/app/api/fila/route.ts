import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { enviarWhatsapp, enviarWhatsappMidia } from "@/lib/evolution";
import { statusConexao } from "@/lib/evolution-admin";

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

  // O ESTADO DO WHATSAPP vai junto com a lista.
  // Sem isto, a Sureya só descobriria que a instância caiu ao tocar em
  // "Enviar" — depois de revisar cada mensagem. Melhor avisar no topo.
  let whatsapp = "desconhecido";
  try {
    const st = await statusConexao();
    whatsapp = st.estado;
  } catch {
    whatsapp = "erro";
  }

  return NextResponse.json({ ok: true, itens, whatsapp });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { id, acao, texto } = await req.json();

  if (!id || !["enviar", "descartar"].includes(acao)) {
    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  }

  // Reserva o item ANTES de enviar: muda para 'enviando' e só o primeiro
  // pedido consegue. Sem isto, um clique duplo mandaria a mesma foto duas
  // vezes para a família — e o WhatsApp não tem desfazer.
  const alvo = acao === "enviar" ? "enviando" : "descartado";
  const { data: item, error: eRes } = await db
    .from("fila_liberacao")
    .update({ status: alvo, decidido_em: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", org)
    .eq("status", "aguardando")
    .select("id,fotos,clientes(telefone,nome)")
    .maybeSingle();

  if (eRes) return NextResponse.json({ ok: false, erro: eRes.message }, { status: 500 });
  if (!item) {
    return NextResponse.json(
      { ok: false, erro: "Esta mensagem já foi decidida." },
      { status: 409 }
    );
  }

  if (acao === "descartar") return NextResponse.json({ ok: true });

  // -------------------------------------------------------------------
  // O ENVIO DE VERDADE, pela Evolution.
  //
  // POR QUE NÃO wa.me: o link `wa.me?text=` carrega SÓ TEXTO. As fotos do
  // antes e do depois — que são o motivo da mensagem existir — ficariam para
  // trás, e a Sureya teria que anexá-las à mão, uma a uma, depois de aprovar.
  // Isso devolveria exatamente o trabalho que a fila existe para tirar.
  //
  // Isto NÃO é o agente de IA de volta: nada sai daqui sozinho. Cada envio é
  // consequência direta de a Sureya olhar a prévia e tocar em "Enviar".
  // -------------------------------------------------------------------
  const telefone = (item as any).clientes?.telefone as string | undefined;
  if (!telefone) {
    await db.from("fila_liberacao").update({ status: "aguardando" }).eq("id", id);
    return NextResponse.json(
      { ok: false, erro: "Esta pessoa não tem WhatsApp cadastrado." },
      { status: 400 }
    );
  }

  const fotos: string[] = Array.isArray((item as any).fotos) ? (item as any).fotos : [];
  const corpo = String(texto || "");

  try {
    if (!fotos.length) {
      await enviarWhatsapp(telefone, corpo);
    } else {
      // A legenda vai na PRIMEIRA foto. Assim a família abre a conversa e vê a
      // imagem com a palavra junto, como quem manda uma foto para um parente —
      // e não um texto seguido de anexos soltos.
      await enviarWhatsappMidia(telefone, fotos[0], corpo);
      for (const extra of fotos.slice(1)) {
        await enviarWhatsappMidia(telefone, extra, "");
      }
    }
  } catch (e: any) {
    // Falhou o envio: DEVOLVE PARA A FILA. Marcar como enviado o que não saiu
    // faria a família sumir da lista sem ter recebido nada — o pior desfecho,
    // porque ninguém descobriria.
    await db
      .from("fila_liberacao")
      .update({ status: "aguardando", decidido_em: null })
      .eq("id", id);

    const detalhe = String(e?.message || "");
    const semConexao = /401|403|404|closed|not connected|instance/i.test(detalhe);

    return NextResponse.json({
      ok: false,
      erro: semConexao
        ? "O WhatsApp está desconectado. Reconecte em Config e tente de novo — a mensagem continua na fila."
        : "Não consegui enviar agora. A mensagem continua na fila.",
      detalhe: detalhe.slice(0, 300),
    }, { status: 502 });
  }

  await db
    .from("fila_liberacao")
    .update({ status: "enviado", texto_final: corpo })
    .eq("id", id);

  return NextResponse.json({ ok: true, fotosEnviadas: fotos.length });
}
