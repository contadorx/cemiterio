import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { acao: 'converter', nome } -> cria o cliente com o telefone do lead
// POST { acao: 'descartar' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  const { data: lead } = await db
    .from("leads")
    .select("id,telefone,nome_wa,status")
    .eq("id", params.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  if (acao === "descartar") {
    await db.from("leads").update({ status: "descartado" }).eq("id", params.id);
    return NextResponse.json({ ok: true });
  }

  if (acao === "converter") {
    const org = await orgAtual(db);
    if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

    const nome = (body?.nome || (lead as any).nome_wa || "Cliente").trim();
    const { data: cli, error } = await db
      .from("clientes")
      .insert({
        org_id: org,
        nome,
        telefone: (lead as any).telefone,
        modo: "copiloto",
        ativo_ia: true,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    await db.from("leads").update({ status: "convertido" }).eq("id", params.id);
    return NextResponse.json({ ok: true, clienteId: (cli as any).id });
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
