import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const { data } = await db
    .from("clientes")
    .select("id,nome,telefone,modo,score,ativo_ia")
    .order("nome", { ascending: true });

  return NextResponse.json({ ok: true, clientes: data || [] });
}

// POST { nome, telefone, modo?, tumulo?:{identificacao,quadraCodigo,falecidoNome?}, plano?:{cadencia,qtdPorPassagem,valorVigente} }
export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const nome = (body?.nome || "").trim();
  const telefone = normalizarTelefone(body?.telefone || "");
  if (!nome || !telefone) {
    return NextResponse.json({ ok: false, erro: "nome_e_telefone_obrigatorios" }, { status: 400 });
  }

  // cliente
  const { data: cli, error: e1 } = await db
    .from("clientes")
    .insert({
      org_id: org,
      nome,
      telefone,
      modo: body?.modo === "automatico" ? "automatico" : "copiloto",
      ativo_ia: true,
    })
    .select("id")
    .single();
  if (e1) return NextResponse.json({ ok: false, erro: e1.message }, { status: 500 });
  const clienteId = (cli as any).id as string;

  let tumuloId: string | null = null;

  // túmulo opcional (garante cemitério + quadra)
  if (body?.tumulo?.identificacao) {
    // cemitério padrão
    let { data: cem } = await db.from("cemiterios").select("id").limit(1).maybeSingle();
    if (!cem) {
      const { data: novo } = await db
        .from("cemiterios")
        .insert({ org_id: org, nome: "Cemitério da Saudade — Vila Vitória, Mauá" })
        .select("id")
        .single();
      cem = novo as any;
    }
    const cemId = (cem as any).id;

    // quadra por código
    const codigo = (body.tumulo.quadraCodigo || "S/Q").trim();
    let { data: quad } = await db
      .from("quadras")
      .select("id")
      .eq("cemiterio_id", cemId)
      .eq("codigo", codigo)
      .maybeSingle();
    if (!quad) {
      const { data: novaQ } = await db
        .from("quadras")
        .insert({ org_id: org, cemiterio_id: cemId, codigo })
        .select("id")
        .single();
      quad = novaQ as any;
    }

    const { data: tum, error: e2 } = await db
      .from("tumulos")
      .insert({
        org_id: org,
        quadra_id: (quad as any).id,
        cliente_id: clienteId,
        identificacao: body.tumulo.identificacao.trim(),
        falecido_nome: body.tumulo.falecidoNome?.trim() || null,
      })
      .select("id")
      .single();
    if (!e2) tumuloId = (tum as any).id;
  }

  // plano opcional
  if (body?.plano?.cadencia && tumuloId) {
    await db.from("planos").insert({
      org_id: org,
      cliente_id: clienteId,
      tumulo_id: tumuloId,
      cadencia: body.plano.cadencia,
      qtd_por_passagem: Number(body.plano.qtdPorPassagem) || 1,
      valor_vigente: Number(body.plano.valorVigente) || 40,
      data_valor_vigente: new Date().toISOString().slice(0, 10),
      proximo_servico: new Date().toISOString().slice(0, 10),
    });
  }

  return NextResponse.json({ ok: true, clienteId });
}
