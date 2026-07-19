import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { alocarAgenda } from "@/lib/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET — quantos serviços estão em dia que não se trabalha (só olha, não mexe)
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { data: servicos } = await auth.db
    .from("servicos")
    .select("id,data_prevista")
    .in("status", ["pendente", "agendado"])
    .not("data_prevista", "is", null)
    .gte("data_prevista", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
    .limit(500);

  const { data: cfg } = await auth.db.from("orgs").select("dias_semana").limit(1).maybeSingle();
  const dias: number[] = (cfg as any)?.dias_semana || [1, 2, 3, 4, 5, 6];
  const hoje = new Date().toISOString().slice(0, 10);

  const foraDaJornada = (servicos || []).filter((s: any) => {
    const d = new Date(s.data_prevista + "T12:00:00Z").getUTCDay();
    return !dias.includes(d) || s.data_prevista < hoje;
  });

  return NextResponse.json({
    ok: true,
    foraDaJornada: foraDaJornada.length,
    diasTrabalhados: dias,
  });
}

// POST { diasAFrente } — move o que está em dia inválido e redistribui
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  const dias = Math.max(7, Math.min(365, Number(b?.diasAFrente) || 120));

  const { data, error } = await auth.db.rpc("sureya_reorganizar_agenda", {
    p_dias_a_frente: dias,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const r = (Array.isArray(data) ? data[0] : data) || {};
  // depois de mover, redistribui pelos dias respeitando a capacidade
  const aloc = await alocarAgenda();

  return NextResponse.json({
    ok: true,
    movidos: r.movidos || 0,
    paraHoje: r.para_hoje || 0,
    diasLiberados: r.dias_liberados || 0,
    ...aloc,
  });
}
