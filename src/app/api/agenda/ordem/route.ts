import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MEXER NA ORDEM DO DIA.
 *
 *   POST { data, ids[], executoraId? }  → define a sequência
 *   PUT  { servicoId }                  → põe este como o próximo
 *
 * A roteirização automática continua sendo por sequência de quadra e rua, com
 * serpentina. Isto não a substitui: é o ajuste por cima dela, para o dia em que
 * a família liga pedindo, ou o dia em que quem está no chão vê que a ordem não
 * serve.
 *
 * Quem pode: `exigirLogado()` deixa passar admin e campo — e a **função no banco**
 * decide o resto, porque é lá que dá para saber se o dia é da pessoa. Campo só
 * mexe no próprio.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  if (!b?.data || !Array.isArray(b?.ids) || !b.ids.length) {
    return NextResponse.json({ ok: false, erro: "data_e_ids_obrigatorios" }, { status: 400 });
  }

  const { data, error } = await auth.db.rpc("sureya_reordenar_dia", {
    p_data: b.data,
    p_ids: b.ids,
    p_executora: b.executoraId ?? null,
  });

  if (error) {
    // A RECUSA É INFORMAÇÃO. `ids_de_outro_dia` quer dizer que a lista foi
    // montada errada — quase sempre a tela mandou o dia que não estava vendo.
    const conhecida = /ids_de_outro_dia|so_o_proprio_dia|lista_vazia/.test(error.message);
    return NextResponse.json(
      { ok: false, erro: error.message, recusa: conhecida },
      { status: conhecida ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, reordenados: data });
}

export async function PUT(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  if (!b?.servicoId) {
    return NextResponse.json({ ok: false, erro: "servico_obrigatorio" }, { status: 400 });
  }

  const { error } = await auth.db.rpc("sureya_priorizar_servico", { p_servico: b.servicoId });
  if (error) {
    const conhecida = /servico_de_outra_executora|ja_executado|servico_nao_encontrado/.test(error.message);
    return NextResponse.json(
      { ok: false, erro: error.message, recusa: conhecida },
      { status: conhecida ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
