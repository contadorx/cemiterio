import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { servicoId, motivo }
// "Não deu para fazer": volta pro backlog com prioridade alta e registra o porquê.
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  if (!b?.servicoId) return NextResponse.json({ ok: false, erro: "servico_obrigatorio" }, { status: 400 });

  const adm = supabaseAdmin();
  const org = env.orgId();

  const { data: s } = await adm
    .from("servicos").select("id,adiado_vezes,prioridade,tumulo_id,status,data_prevista")
    .eq("org_id", org).eq("id", b.servicoId).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, erro: "servico_nao_encontrado" }, { status: 404 });

  // DOIS TOQUES NÃO SÃO DOIS ADIAMENTOS.
  // Cada chamada somava +15 de prioridade e +1 em "adiado_vezes". Na tela do
  // campo, um toque duplicado (o normal com luva, no sol) fazia o cartão dizer
  // "ficou para depois 2x" sem ter ficado — e a prioridade subia o dobro,
  // furando a fila de quem realmente ficou para trás.
  if ((s as any).status === "pendente" && (s as any).data_prevista === null) {
    return NextResponse.json({ ok: true, jaEstavaAdiado: true });
  }

  const motivo = String(b?.motivo || "").trim() || "não informado";

  await adm.from("servicos").update({
    status: "pendente",
    data_prevista: null,
    ordem_dia: null,
    iniciado_em: null,
    prioridade: (Number((s as any).prioridade) || 0) + 15,   // sobe na fila
    adiado_vezes: (Number((s as any).adiado_vezes) || 0) + 1,
    motivo_adiamento: motivo,
    motivo_nao_feito: motivo,
  }).eq("id", b.servicoId).eq("org_id", org);

  // vira ocorrência, para o dono enxergar o padrão
  const tipo = /chuv/i.test(motivo) ? "chuva"
    : /água|agua/i.test(motivo) ? "falta_agua"
    : /material/i.test(motivo) ? "falta_material"
    : /achei|encontr/i.test(motivo) ? "tumulo_nao_encontrado"
    : /acesso|fechad|portão|portao/i.test(motivo) ? "acesso"
    : "outro";

  await adm.from("ocorrencias").insert({
    org_id: org, servico_id: b.servicoId, tipo,
    descricao: motivo, impacto: 1, registrada_por: auth.userId,
  });

  return NextResponse.json({ ok: true });
}
