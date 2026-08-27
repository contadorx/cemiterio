import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { auditar } from "@/lib/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A RÉGUA DE PRIORIDADE, para ajustar (0136).
 *
 * O GET devolve o peso E QUANTOS JAZIGOS CADA CRITÉRIO ALCANÇA HOJE.
 *
 * O alcance não é enfeite: quando a régua nasceu, medido em 27/08, CINCO dos
 * seis critérios alcançavam zero — não havia falecido com data, ninguém tinha
 * pedido lavagem, nada tinha sido adiado. Sem o número ao lado, a Sureya
 * mexeria num peso, não veria efeito nenhum, e concluiria que a tela está
 * quebrada. Ela está certa; é o mundo que ainda não tem aquele caso.
 */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const [regua, alcance] = await Promise.all([
    db.from("prioridade_regua").select("*").eq("org_id", org).order("ordem"),
    db.rpc("sureya_prioridade_alcance", { p_org: org }),
  ]);

  if (regua.error) {
    return NextResponse.json({ ok: false, erro: regua.error.message }, { status: 500 });
  }

  // ALCANCE QUE NÃO DEU PARA LER VEM NULO, NÃO ZERO. Zero quer dizer "nenhum
  // jazigo se encaixa"; nulo quer dizer "não consegui contar". Vazio não é
  // zero, também aqui.
  const porCriterio = new Map<string, number>();
  if (!alcance.error) {
    for (const a of (alcance.data as any[]) || []) porCriterio.set(a.criterio, Number(a.alcanca) || 0);
  }

  return NextResponse.json({
    ok: true,
    criterios: (regua.data || []).map((r: any) => ({
      ...r,
      alcanca: alcance.error ? null : (porCriterio.get(r.criterio) ?? 0),
    })),
    // O que a régua faz com a fila de hoje, para o ajuste ter consequência
    // visível na mesma tela.
    leuOAlcance: !alcance.error,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  // VAZIO NÃO É ZERO — de novo, e aqui custa caro: um campo em branco virando
  // 0 desligaria o critério em silêncio, e a Sureya só descobriria pela agenda
  // saindo errada semanas depois.
  if (b?.peso !== undefined && b?.peso !== null && String(b.peso).trim() !== "") {
    const n = Number(String(b.peso).replace(",", "."));
    if (!Number.isFinite(n)) {
      return NextResponse.json({ ok: false, erro: "peso_invalido",
        mensagem: "O peso precisa ser um número." }, { status: 400 });
    }
    if (n < -200 || n > 200) {
      return NextResponse.json({ ok: false, erro: "peso_fora_da_faixa",
        mensagem: "O peso vai de -200 a 200. Negativo joga o caso para o fim da fila." }, { status: 400 });
    }
    patch.peso = Math.round(n);
  }
  if (typeof b?.ativo === "boolean") patch.ativo = b.ativo;

  const { data, error } = await db
    .from("prioridade_regua")
    .update(patch)
    .eq("org_id", org)
    .eq("id", id)
    .select("criterio,peso,ativo")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  // A ordem da rota da Nina mudou por decisão de alguém: fica registrado.
  await auditar(db, org, auth.userId, "mudou_regua_prioridade",
                { tipo: "prioridade_regua", id },
                { criterio: (data as any).criterio, peso: (data as any).peso, ativo: (data as any).ativo });

  return NextResponse.json({ ok: true, criterio: data });
}
