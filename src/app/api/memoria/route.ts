import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AS PRÓXIMAS DATAS, E O QUE FOI SEGURADO.
 *
 * A tela mostra as duas metades juntas de propósito. Um painel que só lista o
 * que VAI sair esconde a parte que mais importa quando alguém pergunta "por
 * que a família Alcantara não recebeu nada?" — e essa pergunta chega sempre
 * depois, quando ninguém lembra mais a regra de cabeça.
 *
 * O motor grava `motivo_supressao` em toda decisão de segurar (0096). Aqui
 * esse motivo vira uma linha na tela, e não um campo que só existe no banco.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const ate = new Date();
  ate.setMonth(ate.getMonth() + 12);
  const limite = ate.toISOString().slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: o }, { data: eventos }, { data: semData }, { count: totalFalecidos }] =
    await Promise.all([
      auth.db.from("orgs").select("lembretes_memoria").eq("id", org).maybeSingle(),

      auth.db.from("eventos_memoria")
        .select("id,tipo,ano,data_evento,data_disparo,tem_oferta,status,motivo_supressao,"
              + "falecidos(nome,apelido_familiar),tumulos(identificacao),familias(nome)")
        .eq("org_id", org)
        .gte("data_evento", hoje)
        .lte("data_evento", limite)
        .order("data_evento", { ascending: true })
        .limit(400),

      // QUEM AINDA NÃO TEM DATA. É a fila de trabalho de cadastro, e é o que
      // explica um calendário vazio sem que ninguém precise adivinhar.
      auth.db.from("falecidos")
        .select("id,nome,tumulo_id,precisao_falecimento,precisao_nascimento,tumulos(identificacao)")
        .eq("org_id", org)
        .neq("precisao_falecimento", "dia")
        .neq("precisao_nascimento", "dia")
        .limit(200),

      auth.db.from("falecidos").select("id", { count: "exact", head: true }).eq("org_id", org),
    ]);

  return NextResponse.json({
    ok: true,
    ligado: !!(o as any)?.lembretes_memoria,
    eventos: eventos || [],
    semData: semData || [],
    totalFalecidos: totalFalecidos ?? 0,
  });
}

/** PUT { ligado } — a chave geral da casa. */
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  if (typeof b?.ligado !== "boolean") {
    return NextResponse.json({ ok: false, erro: "informe_ligado" }, { status: 400 });
  }

  const { error } = await auth.db
    .from("orgs").update({ lembretes_memoria: b.ligado }).eq("id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
