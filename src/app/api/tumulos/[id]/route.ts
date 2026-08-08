import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { normalizarMMDD } from "@/lib/memoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { identificacao?, rua?, numero?, quadra_id?, cliente_id?, observacoes?,
//         falecido_nome?, data_falecimento? ('MM-DD' ou 'AAAA-MM-DD'), data_nascimento?,
//         limparFoto?: 'lapide'|'longe'|'ambas', limparGps?: boolean }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  for (const c of ["identificacao", "rua", "quadra_id", "numero", "observacoes"]) {
    // === "" e não `||`: "0" é um número de jazigo válido e não pode virar null
    if (body[c] !== undefined) patch[c] = body[c] === "" || body[c] === null ? null : body[c];
  }
  // vincular/desvincular o jazigo a uma família (ex.: um jazigo capturado no campo)
  if (body.cliente_id !== undefined) patch.cliente_id = body.cliente_id || null;
  if (body.falecido_nome !== undefined) patch.falecido_nome = body.falecido_nome || null;

  if (body.data_falecimento !== undefined || body.data_nascimento !== undefined) {
    const datas: { tipo: string; data: string }[] = [];
    for (const [campo, tipo] of [["data_falecimento", "falecimento"], ["data_nascimento", "nascimento"]]) {
      if (!body[campo]) continue;
      const d = normalizarMMDD(body[campo]);
      if (!d) {
        return NextResponse.json(
          { ok: false, erro: `data de ${tipo} não entendida — use MM-DD (ex.: 07-23)` },
          { status: 400 },
        );
      }
      datas.push({ tipo, data: d });
    }
    patch.datas_gatilho = datas;
  }

  // Apagar a foto que entrou no jazigo errado. A imagem em si fica no storage
  // (barato e reversivel); o que sai e o vinculo — que e o que engana quem olha.
  const limparFoto = body.limparFoto; // "lapide" | "longe" | "ambas"
  if (limparFoto === "lapide" || limparFoto === "ambas") patch.foto_referencia_url = null;
  if (limparFoto === "longe" || limparFoto === "ambas") patch.foto_enquadramento_url = null;

  // Apagar a posicao. Um ponto errado no mapa e pior que ponto nenhum: o ponto
  // errado leva a ajudante ate o tumulo do vizinho com cara de certeza.
  if (body.limparGps) {
    patch.lat = null;
    patch.lng = null;
    patch.gps_precisao = null;
    patch.gps_amostras = 0;
    patch.gps_atualizado_em = null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }

  // Numero repetido na mesma quadra foi o que fundiu dois tumulos numa linha so.
  // Nao vou deixar a tela de correcao recriar o problema que ela veio consertar.
  if (patch.identificacao !== undefined || patch.quadra_id !== undefined) {
    const { data: atual } = await db
      .from("tumulos").select("id,quadra_id,identificacao").eq("id", params.id).maybeSingle();
    const quadra = patch.quadra_id ?? (atual as any)?.quadra_id;
    const ident = String(patch.identificacao ?? (atual as any)?.identificacao ?? "").trim().toLowerCase();
    if (quadra && ident) {
      const { data: vizinhos } = await db
        .from("tumulos").select("id,identificacao").eq("quadra_id", quadra).limit(300);
      const bate = ((vizinhos as any[]) || []).find(
        (t) => t.id !== params.id && String(t.identificacao || "").trim().toLowerCase() === ident,
      );
      if (bate) {
        return NextResponse.json(
          { ok: false, erro: "identificacao_em_uso",
            mensagem: `Ja existe outro jazigo com o numero ${patch.identificacao ?? ident} nesta quadra. Dois com o mesmo numero e exatamente o que embaralhou foto e descricao — use um numero que separe os dois (ex.: "12-A" e "12-B").` },
          { status: 409 },
        );
      }
    }
  }

  const { error } = await db.from("tumulos").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // as leituras individuais mantem a media viva; limpar o GPS sem elas nao limpa
  if (body.limparGps) await db.from("gps_leituras").delete().eq("tumulo_id", params.id);

  return NextResponse.json({ ok: true });
}


// DELETE — remove o jazigo. Bloqueia se já houver limpeza executada,
// para não apagar o histórico que a família vê no portal.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { count } = await db
    .from("servicos").select("id", { count: "exact", head: true })
    .eq("tumulo_id", params.id).eq("status", "executado");
  if ((count || 0) > 0) {
    return NextResponse.json(
      { ok: false, erro: "tem_historico",
        mensagem: `Este jazigo já tem ${count} limpeza(s) registrada(s). Em vez de excluir, desative o plano — o histórico e as fotos da família são preservados.` },
      { status: 400 }
    );
  }

  await db.from("servicos").delete().eq("tumulo_id", params.id);
  await db.from("planos").delete().eq("tumulo_id", params.id);
  await db.from("gps_leituras").delete().eq("tumulo_id", params.id);
  const { error } = await db.from("tumulos").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
