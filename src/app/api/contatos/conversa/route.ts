import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { enviarWhatsapp } from "@/lib/evolution";
import { registrarErro } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * UMA CONVERSA — ler e responder, dentro de Contatos.
 *
 * Duas origens, uma tela: quem já é da casa mora em `conversas`+`mensagens`;
 * quem escreveu e ainda não é mora em `leads.mensagens`. A diferença é do
 * banco, não do trabalho — para quem responde é a mesma coisa.
 *
 * ⚠ NADA AQUI É AUTOMÁTICO. A mensagem só sai quando alguém escreve e toca em
 * enviar. É a mesma regra da fila de liberação, e pelo mesmo motivo: robô
 * conversando com idoso quebra o que faz o cliente ficar.
 */

const so = (v: any) => String(v ?? "").trim();

// GET ?tipo=cliente|lead&id=...
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const tipo = so(req.nextUrl.searchParams.get("tipo"));
  const id = so(req.nextUrl.searchParams.get("id"));
  if (!id || !["cliente", "lead"].includes(tipo)) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  if (tipo === "cliente") {
    const { data: conv } = await auth.db
      .from("conversas")
      .select("id,cliente_id,estado,clientes(nome,telefone,familia_id)")
      .eq("org_id", org).eq("id", id).maybeSingle();
    if (!conv) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

    const { data: msgs } = await auth.db
      .from("mensagens")
      .select("id,direcao,autor,texto,created_at,transcrita,pelo_celular")
      .eq("conversa_id", id)
      .order("created_at", { ascending: true })
      .limit(300);

    return NextResponse.json({
      ok: true,
      quem: {
        nome: (conv as any).clientes?.nome || "sem nome",
        telefone: (conv as any).clientes?.telefone || null,
        familiaId: (conv as any).clientes?.familia_id || null,
        clienteId: (conv as any).cliente_id,
      },
      mensagens: (msgs || []).map((m: any) => ({
        id: m.id,
        minha: m.direcao === "saida",
        // "quem escreveu" importa: o que ela mandou do próprio celular, o que
        // a IA mandou no tempo em que respondia, e o que o campo registrou são
        // coisas diferentes na leitura de uma conversa.
        autor: m.autor,
        texto: m.texto,
        em: m.created_at,
        transcrita: !!m.transcrita,
        peloCelular: !!m.pelo_celular,
      })),
    });
  }

  const { data: lead } = await auth.db
    .from("leads")
    .select("id,nome,nome_wa,telefone,mensagens,status,origem,cemiterio_interesse,contexto")
    .eq("org_id", org).eq("id", id).maybeSingle();
  if (!lead) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  const msgs = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
  return NextResponse.json({
    ok: true,
    quem: {
      nome: so((lead as any).nome) || so((lead as any).nome_wa) || "sem nome",
      telefone: (lead as any).telefone || null,
      familiaId: null,
      leadId: (lead as any).id,
      origem: (lead as any).origem || null,
      cemiterio: (lead as any).cemiterio_interesse || null,
    },
    mensagens: msgs.map((m: any, i: number) => ({
      id: `l${i}`,
      minha: m?.de === "nos",
      autor: m?.de === "nos" ? "humano" : "cliente",
      texto: m?.texto || "",
      em: m?.t || null,
      transcrita: false,
      peloCelular: false,
    })),
  });
}

// POST { tipo, id, texto } — envia pelo WhatsApp e guarda no histórico.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const tipo = so(b?.tipo);
  const id = so(b?.id);
  const texto = so(b?.texto).slice(0, 4000);
  if (!id || !["cliente", "lead"].includes(tipo)) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }
  if (!texto) return NextResponse.json({ ok: false, erro: "texto_vazio" }, { status: 400 });

  // ------------------------------------------------------ de quem é o número
  let telefone: string | null = null;
  let clienteId: string | null = null;

  if (tipo === "cliente") {
    const { data: conv } = await auth.db
      .from("conversas").select("id,cliente_id,clientes(telefone)")
      .eq("org_id", org).eq("id", id).maybeSingle();
    if (!conv) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });
    telefone = (conv as any).clientes?.telefone || null;
    clienteId = (conv as any).cliente_id || null;
  } else {
    const { data: lead } = await auth.db
      .from("leads").select("id,telefone,mensagens").eq("org_id", org).eq("id", id).maybeSingle();
    if (!lead) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });
    telefone = (lead as any).telefone || null;
  }

  if (!telefone) {
    return NextResponse.json(
      { ok: false, erro: "sem_telefone", mensagem: "Este contato não tem WhatsApp cadastrado." },
      { status: 400 },
    );
  }

  // ------------------------------------------------------------------ envia
  //
  // ENVIAR PRIMEIRO, GRAVAR DEPOIS. Ao contrário: um erro do WhatsApp deixaria
  // no histórico uma mensagem que a família nunca recebeu — e é justamente o
  // histórico que ela usa para decidir o que dizer em seguida.
  try {
    await enviarWhatsapp(telefone, texto);
  } catch (e: any) {
    await registrarErro("contatos/conversa: envio falhou", e?.message || String(e), { tipo, id });
    return NextResponse.json({
      ok: false, erro: "falha_envio",
      mensagem: "O WhatsApp não aceitou a mensagem. Confira a conexão em Configurações › WhatsApp.",
    }, { status: 502 });
  }

  // ------------------------------------------------------------- e registra
  if (tipo === "cliente") {
    const { error } = await auth.db.from("mensagens").insert({
      org_id: org, conversa_id: id, cliente_id: clienteId,
      direcao: "saida", autor: "humano", texto,
      // Já é decisão de gente: a IA não tem o que processar aqui.
      processada: true,
    });
    // A mensagem JÁ SAIU. Falhar a resposta agora faria ela mandar de novo.
    if (error) {
      await registrarErro("contatos/conversa: enviada mas não gravada", error.message, { id });
      return NextResponse.json({ ok: true, avisoHistorico: true });
    }
  } else {
    const { data: lead } = await auth.db
      .from("leads").select("mensagens").eq("org_id", org).eq("id", id).maybeSingle();
    const antigas = Array.isArray((lead as any)?.mensagens) ? (lead as any).mensagens : [];
    const { error } = await auth.db.from("leads").update({
      mensagens: [...antigas, { t: new Date().toISOString(), texto, de: "nos" }].slice(-40),
    }).eq("id", id).eq("org_id", org);
    if (error) {
      await registrarErro("contatos/conversa: enviada mas não gravada no lead", error.message, { id });
      return NextResponse.json({ ok: true, avisoHistorico: true });
    }
  }

  return NextResponse.json({ ok: true });
}
