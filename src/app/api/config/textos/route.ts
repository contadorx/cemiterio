import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OS TEXTOS DA CASA (migration 0085).
 *
 * Um CONJUNTO por tipo, não um texto só. A família de plano mensal recebe doze
 * mensagens de foto por ano; ler o mesmo parágrafo doze vezes transforma
 * cuidado em formulário. O sorteio entre os ativos é feito no banco, preso ao
 * id do serviço — o mesmo serviço devolve sempre o mesmo texto, para uma
 * reparação não trocar a mensagem que a Sureya já leu na fila.
 *
 * `{nome}` vira o primeiro nome de quem recebe, COM o tratamento ("Sr. André",
 * não "Sr." nem "André"). `{jazigo}` vira o código do jazigo.
 */
const TIPOS = ["foto", "cobranca", "lembrete", "agradecimento"] as const;

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const tipo = req.nextUrl.searchParams.get("tipo") || "foto";
  if (!TIPOS.includes(tipo as any)) {
    return NextResponse.json({ ok: false, erro: "tipo_invalido" }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("modelos_mensagem")
    .select("id,tipo,texto,ativo,ordem")
    .eq("org_id", org).eq("tipo", tipo)
    .order("ordem").order("created_at");

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tipo, modelos: data || [] });
}

// POST { tipo, texto } -> cria um modelo novo no fim da lista.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const tipo = String(b?.tipo || "foto");
  const texto = String(b?.texto || "").trim();
  if (!TIPOS.includes(tipo as any)) {
    return NextResponse.json({ ok: false, erro: "tipo_invalido" }, { status: 400 });
  }
  if (!texto) return NextResponse.json({ ok: false, erro: "texto_vazio" }, { status: 400 });

  const { data: ultimo } = await auth.db
    .from("modelos_mensagem").select("ordem")
    .eq("org_id", org).eq("tipo", tipo)
    .order("ordem", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await auth.db
    .from("modelos_mensagem")
    .insert({ org_id: org, tipo, texto, ordem: (Number((ultimo as any)?.ordem) || 0) + 1 })
    .select("id,tipo,texto,ativo,ordem").maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, modelo: data });
}

// PUT { id, texto?, ativo? }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (b.texto !== undefined) {
    const t = String(b.texto || "").trim();
    if (!t) return NextResponse.json({ ok: false, erro: "texto_vazio" }, { status: 400 });
    patch.texto = t;
  }
  if (b.ativo !== undefined) patch.ativo = !!b.ativo;

  // DESLIGAR O ÚLTIMO ATIVO É RECUSADO.
  //
  // Com zero modelos ativos, `sureya_texto_modelo` cai na frase antiga — que é
  // exatamente o bilhete de sistema que apareceu na tela em 22/08 e que esta
  // leva inteira existe para tirar do caminho. Melhor recusar aqui, com o
  // motivo escrito, do que deixar a casa voltar sozinha para o texto ruim.
  if (patch.ativo === false) {
    const { data: alvo } = await auth.db
      .from("modelos_mensagem").select("tipo,ativo").eq("id", id).eq("org_id", org).maybeSingle();
    if ((alvo as any)?.ativo) {
      const { count } = await auth.db
        .from("modelos_mensagem").select("id", { count: "exact", head: true })
        .eq("org_id", org).eq("tipo", (alvo as any).tipo).eq("ativo", true);
      if ((count || 0) <= 1) {
        return NextResponse.json({ ok: false, erro: "ultimo_ativo" }, { status: 400 });
      }
    }
  }

  const { error } = await auth.db
    .from("modelos_mensagem").update(patch).eq("id", id).eq("org_id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE ?id=... — apagar de vez. Vale a mesma trava do último ativo.
export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const { data: alvo } = await auth.db
    .from("modelos_mensagem").select("tipo,ativo").eq("id", id).eq("org_id", org).maybeSingle();
  if (!alvo) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  if ((alvo as any).ativo) {
    const { count } = await auth.db
      .from("modelos_mensagem").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("tipo", (alvo as any).tipo).eq("ativo", true);
    if ((count || 0) <= 1) {
      return NextResponse.json({ ok: false, erro: "ultimo_ativo" }, { status: 400 });
    }
  }

  const { error } = await auth.db
    .from("modelos_mensagem").delete().eq("id", id).eq("org_id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
