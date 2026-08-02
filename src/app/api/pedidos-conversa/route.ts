import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/pedidos-conversa — os pedidos de SERVIÇO ADICIONAL que apareceram nas
 * conversas de WhatsApp e ainda não viraram trabalho.
 *
 * Existe porque a conversa era um beco sem saída: a família pedia uma limpeza
 * extra para o Dia dos Pais, a IA respondia com carinho, e ali acabava. Nenhum
 * serviço, nenhuma agenda, nenhum preço.
 *
 * Não confundir com /api/extras/pedidos, que é a venda de itens (vela, flor)
 * já com preço fechado. Aqui o preço ainda NÃO existe — é isso que a pessoa
 * precisa decidir.
 *
 *   GET    ?status=novo|registrado|descartado|todos
 *   POST   { conversaId?, clienteId, resumo, trecho?, prazo?, ocasiao?, tumuloId? }
 *          → registro manual, para conversa que já aconteceu
 *   PUT    { pedidoId, acao: "registrar" | "descartar",
 *            tumuloId?, dataPrevista?, valor? }
 */

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function diasAte(prazo: string | null): number | null {
  if (!prazo) return null;
  const a = new Date(hojeSP() + "T00:00:00Z").getTime();
  const b = new Date(prazo + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

function faltaMigration(erro: any): boolean {
  const m = `${erro?.message || ""} ${erro?.details || ""}`.toLowerCase();
  return m.includes("pedidos_conversa") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const status = req.nextUrl.searchParams.get("status") || "novo";

  let q = db
    .from("pedidos_conversa")
    .select(
      "id,cliente_id,conversa_id,tumulo_id,resumo,trecho,prazo,ocasiao,origem,status,servico_id,criado_em," +
        "clientes(nome,telefone),tumulos(identificacao)",
    )
    .order("prazo", { ascending: true, nullsFirst: false })
    .order("criado_em", { ascending: true });

  if (status !== "todos") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    if (faltaMigration(error)) {
      return NextResponse.json({ ok: true, pedidos: [], semMigration: true });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });
  }

  const pedidos = (data || []).map((p: any) => ({
    id: p.id,
    clienteId: p.cliente_id,
    cliente: p.clientes?.nome || p.clientes?.telefone || "—",
    conversaId: p.conversa_id,
    tumuloId: p.tumulo_id,
    tumulo: p.tumulos?.identificacao || null,
    resumo: p.resumo,
    trecho: p.trecho,
    prazo: p.prazo,
    diasAte: diasAte(p.prazo),
    ocasiao: p.ocasiao,
    origem: p.origem,
    status: p.status,
    servicoId: p.servico_id,
    quando: p.criado_em,
  }));

  return NextResponse.json({ ok: true, pedidos });
}

// Registro MANUAL — a conversa da d. Cida já aconteceu e a IA não vai reprocessar.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const resumo = String(b?.resumo || "").trim();
  if (!resumo) {
    return NextResponse.json(
      { ok: false, erro: "sem_resumo", mensagem: "Escreva em uma linha o que a família pediu." },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from("pedidos_conversa")
    .insert({
      org_id: org,
      cliente_id: b?.clienteId || null,
      conversa_id: b?.conversaId || null,
      tumulo_id: b?.tumuloId || null,
      resumo: resumo.slice(0, 400),
      trecho: b?.trecho ? String(b.trecho).slice(0, 1000) : null,
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(String(b?.prazo || "")) ? b.prazo : null,
      ocasiao: b?.ocasiao ? String(b.ocasiao).slice(0, 80) : null,
      origem: "humano",
      status: "novo",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (faltaMigration(error)) {
      return NextResponse.json(
        { ok: false, erro: "sem_migration", mensagem: "Falta rodar a migration 0035 no banco." },
        { status: 400 },
      );
    }
    // o índice único barrou: já existe um aviso aberto para esta conversa
    if (`${error.message}`.toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { ok: false, erro: "ja_existe", mensagem: "Esta conversa já tem um pedido em aberto." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: (data as any)?.id });
}

export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const pedidoId = b?.pedidoId;
  const acao = b?.acao;
  if (!pedidoId || !["registrar", "descartar"].includes(acao)) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  const { data: ped, error: errPed } = await db
    .from("pedidos_conversa")
    .select("id,cliente_id,tumulo_id,prazo,status")
    .eq("id", pedidoId)
    .maybeSingle();

  if (errPed && faltaMigration(errPed)) {
    return NextResponse.json(
      { ok: false, erro: "sem_migration", mensagem: "Falta rodar a migration 0035 no banco." },
      { status: 400 },
    );
  }
  if (!ped) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });
  if ((ped as any).status !== "novo") {
    return NextResponse.json({ ok: false, erro: "ja_tratado" }, { status: 400 });
  }

  if (acao === "descartar") {
    await db.from("pedidos_conversa").update({ status: "descartado" }).eq("id", pedidoId);
    return NextResponse.json({ ok: true, status: "descartado" });
  }

  // registrar = nasce um serviço AVULSO (plano_id null), pendente, com data.
  const tumuloId = b?.tumuloId || (ped as any).tumulo_id;
  if (!tumuloId) {
    return NextResponse.json(
      { ok: false, erro: "sem_tumulo", mensagem: "Escolha o jazigo. Serviço sem jazigo não chega no campo." },
      { status: 400 },
    );
  }

  const dataPrevista =
    /^\d{4}-\d{2}-\d{2}$/.test(String(b?.dataPrevista || ""))
      ? b.dataPrevista
      : (ped as any).prazo || hojeSP();

  const valor = b?.valor === "" || b?.valor === null || b?.valor === undefined ? null : Number(b.valor);
  if (valor !== null && !Number.isFinite(valor)) {
    return NextResponse.json({ ok: false, erro: "valor_invalido" }, { status: 400 });
  }

  const { data: srv, error: errSrv } = await db
    .from("servicos")
    .insert({
      org_id: org,
      tumulo_id: tumuloId,
      plano_id: null, // avulso
      cliente_id: (ped as any).cliente_id,
      data_prevista: dataPrevista,
      status: "pendente",
      valor,
      prioridade: 5, // pedido com data pedida pela família entra na frente
    })
    .select("id")
    .maybeSingle();

  if (errSrv) return NextResponse.json({ ok: false, erro: errSrv.message }, { status: 400 });

  await db
    .from("pedidos_conversa")
    .update({
      status: "registrado",
      servico_id: (srv as any)?.id || null,
      tumulo_id: tumuloId,
      registrado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);

  return NextResponse.json({ ok: true, status: "registrado", servicoId: (srv as any)?.id, dataPrevista });
}
