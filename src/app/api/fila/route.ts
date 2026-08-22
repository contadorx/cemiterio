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

  // O QUE MORREU NO MEIO DO CAMINHO VOLTA PARA A FILA.
  //
  // A reserva marca `enviando` antes de chamar a Evolution. Se o processo cair
  // ali — timeout da função, deploy no meio, rede — ninguém devolvia o item. E
  // a tela lista só `aguardando`: a mensagem sumia, a família não recebia, e
  // não havia tela em que isso aparecesse. Pior tipo de falha, porque não gera
  // erro para alguém ver.
  //
  // Roda ao abrir a tela, não em cron: rotina que mexe em fila sozinha, sem
  // ninguém olhando, é justamente como o item some.
  await db.rpc("sureya_fila_destravar", { p_minutos: 10 }).then(
    () => {}, (e: any) => console.error("[fila] destravar falhou:", e?.message),
  );

  const { data, error } = await db
    .from("fila_liberacao")
    .select(
      "id,tipo,status,texto,fotos,criado_em," +
        "tentativas,ultimo_erro,ultimo_erro_em,erro_tipo,fotos_enviadas," +
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
    // O ESTADO LEGÍVEL. Sem isto a tela só sabe dizer "aguardando" — e uma
    // mensagem que falhou seis vezes fica igualzinha a uma que acabou de
    // entrar na fila.
    tentativas: Number(f.tentativas) || 0,
    ultimoErro: f.ultimo_erro || null,
    ultimoErroEm: f.ultimo_erro_em || null,
    erroTipo: f.erro_tipo || null,
    fotosEnviadas: Number(f.fotos_enviadas) || 0,
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
  if (acao === "descartar") {
    const { data: d, error: eD } = await db
      .from("fila_liberacao")
      .update({ status: "descartado", decidido_em: new Date().toISOString() })
      .eq("id", id).eq("org_id", org).eq("status", "aguardando")
      .select("id").maybeSingle();
    if (eD) return NextResponse.json({ ok: false, erro: eD.message }, { status: 500 });
    if (!d) return NextResponse.json({ ok: false, erro: "Esta mensagem já foi decidida." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  // A reserva continua sendo "só o primeiro pedido consegue" — o clique duplo
  // perde a corrida contra `where status = 'aguardando'`. O que ela passou a
  // devolver é ONDE O ENVIO ANTERIOR PAROU.
  const { data: reservado, error: eRes } = await db
    .rpc("sureya_fila_reservar", { p_item: id });

  if (eRes) return NextResponse.json({ ok: false, erro: eRes.message }, { status: 500 });
  const item = (Array.isArray(reservado) ? reservado[0] : reservado) as any;
  if (!item) {
    return NextResponse.json(
      { ok: false, erro: "Esta mensagem já foi decidida." },
      { status: 409 }
    );
  }

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
  const telefone = (item as any).telefone as string | undefined;
  if (!telefone) {
    // FALHA PERMANENTE: tentar de novo não resolve. Alguém tem de pôr o
    // telefone no cadastro. A tela precisa saber a diferença, porque a ação é
    // outra.
    await db.rpc("sureya_fila_soltar", {
      p_item: id,
      p_erro: "Esta pessoa não tem WhatsApp cadastrado.",
      p_tipo: "permanente",
    });
    return NextResponse.json(
      { ok: false, erro: "Esta pessoa não tem WhatsApp cadastrado." },
      { status: 400 }
    );
  }

  const fotos: string[] = Array.isArray((item as any).fotos) ? (item as any).fotos : [];
  const corpo = String(texto || "");

  // ONDE A TENTATIVA ANTERIOR PAROU.
  //
  // Aqui estava o bug que o critério de saída do Build 6 nomeia — *"envio
  // repetido não duplica mensagem"*. O envio manda a legenda na primeira foto e
  // depois as outras, uma a uma. Se a segunda falhava, o item voltava para a
  // fila e a Sureya tocava em Enviar de novo: **a primeira foto saía pela
  // segunda vez.** Do lado da família, duas fotos iguais do túmulo do pai, com
  // a mesma legenda. E o WhatsApp não tem desfazer.
  //
  // `fotos_enviadas` é o marcador. Ele nunca diminui, então a retomada nunca
  // volta atrás.
  let enviadas = Number((item as any).fotos_enviadas) || 0;

  try {
    if (!fotos.length) {
      // Mensagem sem foto: ou saiu, ou não saiu. Não há meio caminho para
      // retomar — e por isso `enviadas` continua zero.
      await enviarWhatsapp(telefone, corpo);
    } else {
      // A legenda vai na PRIMEIRA foto. Assim a família abre a conversa e vê a
      // imagem com a palavra junto, como quem manda uma foto para um parente —
      // e não um texto seguido de anexos soltos.
      //
      // Numa retomada, a legenda JÁ FOI com a foto que já saiu. Repeti-la seria
      // mandar o texto duas vezes.
      for (let i = enviadas; i < fotos.length; i++) {
        await enviarWhatsappMidia(telefone, fotos[i], i === 0 ? corpo : "");
        enviadas = i + 1;
      }
    }
  } catch (e: any) {
    const detalhe = String(e?.message || "");
    const semConexao = /401|403|404|closed|not connected|instance/i.test(detalhe);

    // DEVOLVE PARA A FILA, GUARDANDO ONDE PAROU E POR QUÊ. Marcar como enviado
    // o que não saiu faria a família sumir da lista sem ter recebido nada — o
    // pior desfecho, porque ninguém descobriria.
    await db.rpc("sureya_fila_soltar", {
      p_item: id,
      p_erro: detalhe.slice(0, 500),
      // Desconexão é transitória: reconectar resolve. O resto entra como
      // transitório também, porque errar para o lado de "tente de novo" é mais
      // barato que marcar como permanente algo que sairia na segunda tentativa.
      p_tipo: "transitorio",
      p_fotos_enviadas: enviadas,
    });

    return NextResponse.json({
      ok: false,
      erro: semConexao
        ? "O WhatsApp está desconectado. Reconecte em Config e tente de novo — a mensagem continua na fila."
        : "Não consegui enviar agora. A mensagem continua na fila.",
      detalhe: detalhe.slice(0, 300),
      // Quantas já saíram: a tela pode dizer "2 de 3 fotos foram; ao tentar de
      // novo mando só a que falta".
      fotosEnviadas: enviadas,
      totalFotos: fotos.length,
    }, { status: 502 });
  }

  await db.rpc("sureya_fila_concluir", {
    p_item: id, p_texto: corpo, p_fotos: enviadas,
  });

  return NextResponse.json({ ok: true, fotosEnviadas: enviadas });
}
