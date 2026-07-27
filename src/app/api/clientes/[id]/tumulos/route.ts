import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { anexarJazigo, criarPlanoSeFaltar, explicarErroJazigo } from "@/lib/jazigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/clientes/[id]/tumulos
 *
 * Acrescenta um jazigo a uma família JÁ CADASTRADA — o caminho que não existia.
 * Antes, a ficha só sabia vincular jazigo órfão vindo do campo; se não houvesse
 * nenhum órfão, a tela não oferecia nada e a família ficava sem jazigo para
 * sempre.
 *
 * Corpo:
 *   { vincularTumuloId }                                  → liga um já cadastrado
 *   { identificacao, quadraCodigo?, rua?, numero?,        → cria (ou reaproveita)
 *     falecidoNome?, cemiterioId? }
 *   + plano?: { cadencia, lavagensPorCiclo, valorMensal, inicio }
 *
 * O plano é opcional: sem cadência (ou "avulso") o jazigo entra sem plano e a
 * ficha continua oferecendo "Criar plano" depois.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) {
    return NextResponse.json(
      { ok: false, erro: "sem_org", mensagem: explicarErroJazigo("sem_org") },
      { status: 400 },
    );
  }

  const clienteId = params.id;
  const { data: cli } = await db.from("clientes").select("id").eq("id", clienteId).maybeSingle();
  if (!cli) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  const b = await req.json().catch(() => ({}));

  const r = await anexarJazigo(db, org, clienteId, {
    vincularTumuloId: b?.vincularTumuloId ?? null,
    identificacao: b?.identificacao ?? null,
    quadraCodigo: b?.quadraCodigo ?? null,
    rua: b?.rua ?? null,
    numero: b?.numero ?? null,
    falecidoNome: b?.falecidoNome ?? null,
    cemiterioId: b?.cemiterioId ?? null,
  });

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, erro: r.erro, mensagem: explicarErroJazigo(r.erro, r.detalhe) },
      { status: 400 },
    );
  }

  // Plano opcional. Se o valor vier ilegível, o jazigo JÁ está salvo — a tela
  // avisa que faltou só o plano em vez de fingir que nada aconteceu.
  const pl = b?.plano || null;
  let planoCriado = false;
  let avisoPlano: string | null = null;
  if (pl && pl.cadencia && pl.cadencia !== "avulso") {
    const rp = await criarPlanoSeFaltar(db, org, clienteId, r.tumuloId, {
      cadencia: pl.cadencia,
      lavagensPorCiclo: pl.lavagensPorCiclo ?? null,
      valorMensal: pl.valorMensal ?? null,
      inicio: pl.inicio ?? null,
    });
    if (rp.ok) planoCriado = rp.criado;
    else avisoPlano = explicarErroJazigo(rp.erro);
  }

  return NextResponse.json({
    ok: true,
    tumuloId: r.tumuloId,
    reaproveitado: r.reaproveitado,
    planoCriado,
    avisoPlano,
  });
}
