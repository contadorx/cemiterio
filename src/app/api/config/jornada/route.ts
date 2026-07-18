import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const [{ data: o }, { data: bloq }] = await Promise.all([
    auth.db.from("orgs")
      .select("dias_semana,hora_inicio,hora_fim,intervalo_almoco_min,limpezas_por_dia")
      .eq("id", org).maybeSingle(),
    auth.db.from("dias_sem_campo").select("id,data,motivo").order("data"),
  ]);
  return NextResponse.json({ ok: true, jornada: o || {}, bloqueados: bloq || [] });
}

// PUT { dias_semana:[], hora_inicio, hora_fim, intervalo_almoco_min, limpezas_por_dia }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const b = await req.json().catch(() => ({}));

  const patch: Record<string, any> = {};
  if (Array.isArray(b.dias_semana)) {
    const nums: number[] = (b.dias_semana as any[]).map((x) => Number(x));
    const dias: number[] = Array.from(new Set<number>(nums))
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, z) => a - z);
    if (!dias.length) return NextResponse.json({ ok: false, erro: "escolha_ao_menos_um_dia" }, { status: 400 });
    patch.dias_semana = dias;
    patch.dias_trabalhados_semana = dias.length;   // mantém a capacidade coerente
  }
  for (const c of ["hora_inicio", "hora_fim"]) if (b[c]) patch[c] = b[c];
  if (b.intervalo_almoco_min !== undefined) patch.intervalo_almoco_min = Number(b.intervalo_almoco_min) || 0;
  if (b.limpezas_por_dia !== undefined) patch.limpezas_por_dia = Number(b.limpezas_por_dia) || 1;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }
  const { error } = await auth.db.from("orgs").update(patch).eq("id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// POST { data, motivo } — bloqueia um dia (feriado, cemitério fechado)
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const b = await req.json().catch(() => ({}));
  if (!b?.data) return NextResponse.json({ ok: false, erro: "data_obrigatoria" }, { status: 400 });
  const { error } = await auth.db.from("dias_sem_campo")
    .upsert({ org_id: org, data: b.data, motivo: b.motivo || null }, { onConflict: "org_id,data" });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE ?id=
export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id_obrigatorio" }, { status: 400 });
  await auth.db.from("dias_sem_campo").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
