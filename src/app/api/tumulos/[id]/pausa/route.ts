import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PARAR E RETOMAR O SERVIÇO DE UM JAZIGO (0119).
 *
 * GET  → a situação e o histórico de paradas
 * POST { acao: "parar",   motivo, desde? }
 *      { acao: "retomar", em?, motivo? }
 *
 * Parar NÃO é cancelar. O combinado fica inteiro — valor, ritmo, datas — e só
 * deixa de acontecer. Era isso que faltava: no lugar, desmarcava-se
 * `contratado`, que apaga o combinado e obriga a recadastrar de memória.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data, error } = await db
    .from("pausas_tumulo")
    .select("id,inicio,fim,motivo,motivo_retomada,created_at")
    .eq("org_id", org).eq("tumulo_id", params.id)
    .order("inicio", { ascending: false });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = (data as any[]) || [];
  const aberta = lista.find((p) => !p.fim) || null;

  return NextResponse.json({
    ok: true,
    // "Está parado?" vem do MESMO lugar que o cobrador consulta: a pausa sem
    // data de fim. Sem booleano espelhado para desencontrar.
    parado: !!aberta,
    desde: aberta?.inicio ?? null,
    motivo: aberta?.motivo ?? null,
    historico: lista,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({} as any));
  const acao = String(b?.acao || "");

  if (acao === "parar") {
    const { data, error } = await db.rpc("sureya_parar_servico", {
      p_tumulo: params.id,
      p_motivo: String(b?.motivo || ""),
      p_desde: b?.desde || null,
    });
    if (error) {
      if (/motivo_obrigatorio/.test(error.message)) {
        return NextResponse.json(
          { ok: false, erro: "motivo_obrigatorio",
            mensagem: "Diga por que está parando. Meses depois, essa é a pergunta que a família faz." },
          { status: 400 });
      }
      if (/duplicate|unique|uq_pausa_aberta/i.test(error.message)) {
        return NextResponse.json(
          { ok: false, erro: "ja_parado",
            mensagem: "Este jazigo já está parado. Retome antes de parar de novo." },
          { status: 409 });
      }
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    }
    const r = (Array.isArray(data) ? data[0] : data) as any;
    return NextResponse.json({
      ok: true,
      desde: r?.desde ?? null,
      // O QUE SAIU DA FRENTE, dito em número. "Parado" sem dizer que tirou
      // três limpezas da agenda esconde metade do efeito.
      lavagensCanceladas: Number(r?.agendados_cancelados) || 0,
      entregasCanceladas: Number(r?.entregas_canceladas) || 0,
    });
  }

  if (acao === "retomar") {
    const { data, error } = await db.rpc("sureya_retomar_servico", {
      p_tumulo: params.id,
      p_em: b?.em || null,
      p_motivo: b?.motivo ? String(b.motivo) : null,
    });
    if (error) {
      if (/nao_estava_parado/.test(error.message)) {
        return NextResponse.json(
          { ok: false, erro: "nao_estava_parado",
            mensagem: "Este jazigo não está parado. Retomar de novo empurraria a cobrança mais uma vez." },
          { status: 409 });
      }
      if (/retomada_antes_da_parada/.test(error.message)) {
        return NextResponse.json(
          { ok: false, erro: "data_invalida",
            mensagem: "A retomada não pode ser antes da parada." },
          { status: 400 });
      }
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    }
    const r = (Array.isArray(data) ? data[0] : data) as any;
    return NextResponse.json({
      ok: true,
      mesesParados: Number(r?.meses_parados) || 0,
      proximaCobranca: r?.nova_cobranca ?? null,
      periodoInicio: r?.novo_periodo ?? null,
    });
  }

  return NextResponse.json({ ok: false, erro: "acao_desconhecida" }, { status: 400 });
}
