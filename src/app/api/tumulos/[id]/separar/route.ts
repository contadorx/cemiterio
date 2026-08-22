import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tumulos/[id]/separar — desfaz a fusão de dois jazigos.
 *
 * O ESTRAGO QUE ISTO CONSERTA
 * -----------------------------------------------------------------------------
 * O cadastro de campo procura na quadra um jazigo com a mesma identificação. Se
 * acha, devolve aquele — e a foto e o GPS que você acabou de tirar vão para cima
 * de um túmulo que não é o que está na sua frente. Fica uma linha só carregando
 * a descrição de um e a foto do outro.
 *
 * Separar cria a linha que faltava e MUDA DE LUGAR o que veio da segunda visita:
 * fotos e GPS saem do registro antigo e passam para o novo. Não é cópia — é
 * mudança. O jazigo antigo fica com a descrição dele e sem foto, que é a verdade:
 * a foto dele nunca foi tirada, foi a do vizinho que entrou no lugar.
 *
 * As leituras de GPS vão junto. A média do jazigo antigo estava contaminada com
 * as coordenadas do outro túmulo; deixá-la ali seria manter um ponto errado no
 * mapa com cara de ponto certo. Ele volta a não ter posição — e você remarca na
 * próxima passagem, que é rápido e é honesto.
 *
 * body: { identificacao, rua?, numero?, falecidoNome?, observacoes?, clienteId?,
 *         levar?: "ambos" | "fotos" | "gps" | "nada" }
 */

const CAMPOS_FOTO = ["foto_referencia_url", "foto_enquadramento_url"];
const CAMPOS_GPS = ["lat", "lng", "gps_precisao", "gps_atualizado_em"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({} as any));
  const identificacao = String(b?.identificacao ?? "").trim();
  if (!identificacao) {
    return NextResponse.json(
      { ok: false, erro: "sem_identificacao", mensagem: "Diga o número do jazigo novo." },
      { status: 400 },
    );
  }
  const levar = ["ambos", "fotos", "gps", "nada"].includes(b?.levar) ? b.levar : "ambos";

  const { data: orig, error: e1 } = await db
    .from("tumulos").select("*").eq("id", params.id).maybeSingle();
  if (e1) return NextResponse.json({ ok: false, erro: e1.message }, { status: 500 });
  if (!orig) return NextResponse.json({ ok: false, erro: "jazigo_nao_encontrado" }, { status: 404 });

  const o = orig as any;

  // já existe alguém com esse número na quadra? separar para criar outra fusão
  // seria trocar de problema.
  const { data: choque } = await db
    .from("tumulos").select("id,identificacao")
    .eq("quadra_id", o.quadra_id).limit(200);
  const alvo = identificacao.toLowerCase();
  const bate = ((choque as any[]) || []).find(
    (t) => String(t.identificacao || "").trim().toLowerCase() === alvo,
  );
  if (bate) {
    return NextResponse.json(
      { ok: false, erro: "identificacao_em_uso",
        mensagem: `Já existe o jazigo ${identificacao} nesta quadra. Use outro número (ou a rua no número, ex.: "12-B") — foi justamente número repetido que criou a confusão.` },
      { status: 409 },
    );
  }

  // o que MUDA DE LUGAR: só o que existe mesmo na linha antiga
  const mover: Record<string, any> = {};
  const limpar: Record<string, any> = {};
  const levaFoto = levar === "ambos" || levar === "fotos";
  const levaGps = levar === "ambos" || levar === "gps";

  for (const c of CAMPOS_FOTO) {
    if (!levaFoto) continue;
    if (o[c] !== undefined && o[c] !== null) { mover[c] = o[c]; limpar[c] = null; }
  }
  for (const c of CAMPOS_GPS) {
    if (!levaGps) continue;
    if (o[c] !== undefined && o[c] !== null) { mover[c] = o[c]; limpar[c] = null; }
  }
  if (levaGps && o.gps_amostras !== undefined) {
    mover.gps_amostras = o.gps_amostras || 0;
    limpar.gps_amostras = 0;
  }

  const novo: Record<string, any> = {
    org_id: o.org_id,
    quadra_id: o.quadra_id,
    cliente_id: b?.clienteId === undefined ? o.cliente_id : b.clienteId || null,
    identificacao,
    falecido_nome: b?.falecidoNome ? String(b.falecidoNome).trim() : null,
    observacoes: b?.observacoes ? String(b.observacoes).trim() : null,
    ...mover,
  };
  if (o.rua !== undefined) novo.rua = b?.rua ? String(b.rua).trim() : null;
  if (o.numero !== undefined) novo.numero = b?.numero ? String(b.numero).trim() : null;

  const { data: criado, error: e2 } = await db
    .from("tumulos").insert(novo).select("id").single();
  if (e2) return NextResponse.json({ ok: false, erro: e2.message }, { status: 500 });
  const novoId = (criado as any).id as string;

  // tira do antigo o que passou para o novo
  if (Object.keys(limpar).length) {
    const { error: e3 } = await db.from("tumulos").update(limpar).eq("id", params.id);
    if (e3) {
      return NextResponse.json(
        { ok: false, erro: e3.message, tumuloId: novoId,
          mensagem: "O jazigo novo foi criado, mas não consegui limpar o antigo. Confira os dois na lista." },
        { status: 500 },
      );
    }
  }

  // as leituras de GPS acompanham a posição; sem isso a média voltaria sozinha
  let leiturasMovidas = 0;
  if (levaGps) {
    const { data: ls } = await db
      .from("gps_leituras").select("id").eq("tumulo_id", params.id);
    leiturasMovidas = ((ls as any[]) || []).length;
    if (leiturasMovidas) {
      await db.from("gps_leituras").update({ tumulo_id: novoId }).eq("tumulo_id", params.id);
    }
  }

  return NextResponse.json({
    ok: true,
    tumuloId: novoId,
    levouFotos: levaFoto && CAMPOS_FOTO.some((c) => c in mover),
    levouGps: levaGps && "lat" in mover,
    leiturasMovidas,
  });
}
