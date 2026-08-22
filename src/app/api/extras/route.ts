import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, exigirLogado } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?sazonais=1 — catálogo de serviços extras
export async function GET(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const { data } = await auth.db
    .from("servicos_extras")
    .select("*")
    .eq("ativo", true)
    .order("ordem");

  const mes = new Date().getMonth() + 1;
  const lista = (data || []).map((e: any) => ({
    ...e,
    // sazonal fora de época continua no catálogo, mas marcado
    naEpoca: !e.sazonal || (Array.isArray(e.meses) && e.meses.includes(mes)),
    margem: Math.round((Number(e.preco) - Number(e.custo)) * 100) / 100,
  }));

  return NextResponse.json({ ok: true, extras: lista, mes });
}

// POST — cria ou atualiza um item do catálogo
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const b = await req.json().catch(() => ({}));
  if (!b?.nome) return NextResponse.json({ ok: false, erro: "nome_obrigatorio" }, { status: 400 });

  const { error } = await auth.db.from("servicos_extras").upsert({
    org_id: org,
    nome: String(b.nome).trim(),
    descricao: b?.descricao || null,
    categoria: b?.categoria || "outro",
    preco: Number(b?.preco) || 0,
    custo: Number(b?.custo) || 0,
    unidade: b?.unidade || "un",
    sazonal: !!b?.sazonal,
    meses: Array.isArray(b?.meses) && b.meses.length ? b.meses : null,
    ativo: b?.ativo !== false,
  }, { onConflict: "org_id,nome" });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
