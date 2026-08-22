import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const { data } = await auth.db
    .from("orgs")
    .select("nome,marca_nome,marca_assinatura,chave_pix,site,limpezas_por_dia,dias_trabalhados_semana,teto_ia_dia,custo_hora_campo,custo_mensal_ajudante,minutos_padrao_limpeza")
    .eq("id", org)
    .maybeSingle();
  return NextResponse.json({ ok: true, casa: data || {} });
}

// PUT { marca_nome, marca_assinatura, chave_pix, site, limpezas_por_dia, ... }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const b = await req.json().catch(() => ({}));

  const patch: Record<string, any> = {};
  for (const c of ["marca_nome", "marca_assinatura", "chave_pix", "site"]) {
    if (b[c] !== undefined) patch[c] = String(b[c] || "").trim() || null;
  }
  for (const c of ["limpezas_por_dia", "dias_trabalhados_semana", "teto_ia_dia",
                   "custo_hora_campo", "custo_mensal_ajudante", "minutos_padrao_limpeza"]) {
    if (b[c] !== undefined) patch[c] = Number(b[c]) || 0;
  }
  if (patch.marca_nome) patch.nome = patch.marca_nome;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }
  const { error } = await auth.db.from("orgs").update(patch).eq("id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
