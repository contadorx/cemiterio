import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { converterLead } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> o lead completo (para a tela de conversa do lead)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const { data, error } = await auth.db
    .from("leads")
    .select("id,telefone,nome,nome_wa,contexto,jazigo_ref,mensagens,status,origem,proximo_passo,ignorado,motivo_ignorado,cliente_id,created_at,updated_at")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, lead: data });
}

// POST { acao: 'converter', nome } -> cria o cliente com o telefone do lead
// POST { acao: 'descartar' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  if (acao === "descartar") {
    await db.from("leads").update({ status: "descartado" }).eq("id", params.id);
    return NextResponse.json({ ok: true });
  }

  if (acao === "converter") {
    const org = await orgAtual(db);
    if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

    const r = await converterLead(db, org, params.id, body?.nome);
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 500 });
    return NextResponse.json({ ok: true, clienteId: r.clienteId, jaEra: r.jaEra });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}

/**
 * PATCH { status?, ignorado?, motivoIgnorado?, contexto?, proximoPasso? }
 *
 * "ignorado" é diferente de "descartado": o descartado sai da lista, mas volta
 * se a pessoa escrever de novo. O ignorado nunca mais aparece — é para quem não
 * é cliente e não vai ser (amiga, parente, entregador, engano). O número entra
 * numa lista de bloqueio, então nem chega a virar lead outra vez.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  if (b.status && ["novo", "em_conversa", "convertido", "descartado"].includes(b.status)) {
    patch.status = b.status;
  }
  for (const c of ["contexto", "jazigo_ref", "nome", "proximo_passo"]) {
    if (b[c] !== undefined) patch[c] = b[c] || null;
  }

  if (b.ignorado !== undefined) {
    patch.ignorado = !!b.ignorado;
    patch.motivo_ignorado = b.motivoIgnorado || null;
    if (b.ignorado) patch.status = "descartado";

    const { data: lead } = await db
      .from("leads").select("org_id,telefone").eq("id", params.id).maybeSingle();
    if (lead) {
      if (b.ignorado) {
        // bloqueia o número: não volta a virar lead nem escrevendo de novo
        await db.from("telefones_ignorados").upsert(
          { org_id: (lead as any).org_id, telefone: (lead as any).telefone,
            motivo: b.motivoIgnorado || null },
          { onConflict: "org_id,telefone" }
        );
      } else {
        await db.from("telefones_ignorados").delete().eq("telefone", (lead as any).telefone);
      }
    }
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }
  const { error } = await db.from("leads").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — apaga o registro de vez (para engano puro, sem histórico a guardar)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const { error } = await auth.db.from("leads").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
