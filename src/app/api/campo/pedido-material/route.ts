import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { itens: [{ id?, nome, acabou: boolean }], observacao? }
// A ajudante marca o que está faltando. Zera o estoque dos marcados e abre
// uma ocorrência de falta de material, para o dono ver no painel.
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const itens: { id?: string; nome: string; acabou?: boolean }[] = Array.isArray(b?.itens) ? b.itens : [];
  const marcados = itens.filter((i) => i.acabou && i.nome);
  if (!marcados.length && !b?.observacao) {
    return NextResponse.json({ ok: false, erro: "nada_marcado" }, { status: 400 });
  }

  const adm = supabaseAdmin();

  for (const it of marcados) {
    const nome = String(it.nome).trim().toLowerCase();
    if (it.id) {
      await adm.from("materiais")
        .update({ estoque: 0, atualizado_em: new Date().toISOString() })
        .eq("id", it.id).eq("org_id", org);
    } else {
      await adm.from("materiais").upsert(
        { org_id: org, nome, unidade: "un", estoque: 0, alerta_minimo: 1,
          atualizado_em: new Date().toISOString() },
        { onConflict: "org_id,nome", ignoreDuplicates: false }
      );
    }
  }

  const lista = marcados.map((i) => i.nome).join(", ");
  const descricao =
    (lista ? `Faltando: ${lista}.` : "") + (b?.observacao ? ` ${b.observacao}` : "");

  await adm.from("ocorrencias").insert({
    org_id: org,
    tipo: "falta_material",
    descricao: descricao.trim(),
    impacto: 0,
    registrada_por: auth.userId,
  });

  return NextResponse.json({ ok: true, pedidos: marcados.length });
}
