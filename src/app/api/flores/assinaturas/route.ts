import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { descreverRitmo, gerarEsteiraDeExtras } from "@/lib/extras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O COMBINADO DE FLORES DE UM JAZIGO.
 *
 * GET  ?familiaId=  |  ?tumuloId=   → os combinados e o catálogo
 * POST { tumuloId, extraId, quantidade, diaSemana, semanas[], cobranca, ... }
 * PATCH { id, ...campos }           → ajustar, ou desligar com { ativo: false }
 * DELETE ?id=                       → só para o combinado que nunca entregou
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const familiaId = req.nextUrl.searchParams.get("familiaId");
  const tumuloId = req.nextUrl.searchParams.get("tumuloId");

  let q = db.from("assinaturas_extras")
    .select("id,tumulo_id,familia_id,extra_id,quantidade,dia_semana,semanas," +
            "cobranca,preco_unit,custo_unit,inicio,proxima,ativo,observacao," +
            "servicos_extras(nome,unidade,categoria),tumulos(identificacao,codigo)")
    .eq("org_id", org);
  if (familiaId) q = q.eq("familia_id", familiaId);
  if (tumuloId) q = q.eq("tumulo_id", tumuloId);

  const [{ data, error }, { data: catalogo }] = await Promise.all([
    q.order("created_at"),
    db.from("servicos_extras").select("id,nome,categoria,preco,custo,unidade")
      .eq("org_id", org).eq("ativo", true).order("categoria").order("nome"),
  ]);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    catalogo: catalogo || [],
    assinaturas: ((data as any[]) || []).map((a) => ({
      id: a.id,
      tumuloId: a.tumulo_id,
      jazigo: a.tumulos?.identificacao || a.tumulos?.codigo || null,
      extraId: a.extra_id,
      nome: a.servicos_extras?.nome || "extra",
      unidade: a.servicos_extras?.unidade || "un",
      quantidade: Number(a.quantidade) || 1,
      diaSemana: a.dia_semana,
      semanas: a.semanas || [],
      // A FRASE VEM DO SERVIDOR. Um combinado que só existe como
      // {dia_semana: 6, semanas: [-1]} é um combinado que ninguém confere.
      ritmo: descreverRitmo(a.dia_semana, a.semanas || []),
      cobranca: a.cobranca,
      preco: Number(a.preco_unit) || 0,
      custo: Number(a.custo_unit) || 0,
      inicio: a.inicio,
      proxima: a.proxima,
      ativo: a.ativo,
      observacao: a.observacao,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const tumuloId = String(b?.tumuloId || "");
  const extraId = String(b?.extraId || "");
  const semanas = Array.isArray(b?.semanas) ? b.semanas.map(Number) : [-1];
  const diaSemana = Number(b?.diaSemana);

  if (!tumuloId || !extraId || !Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    return NextResponse.json(
      { ok: false, erro: "faltou", mensagem: "Escolha o jazigo, o item e o dia da semana." },
      { status: 400 });
  }
  if (!semanas.length || semanas.length > 5) {
    return NextResponse.json(
      { ok: false, erro: "semanas", mensagem: "Escolha ao menos uma semana do mês." },
      { status: 400 });
  }

  const [{ data: t }, { data: item }] = await Promise.all([
    db.from("tumulos").select("familia_id").eq("id", tumuloId).maybeSingle(),
    db.from("servicos_extras").select("preco,custo").eq("id", extraId).maybeSingle(),
  ]);
  if (!item) return NextResponse.json({ ok: false, erro: "item_desconhecido" }, { status: 400 });

  const { error } = await db.from("assinaturas_extras").insert({
    org_id: org,
    tumulo_id: tumuloId,
    familia_id: (t as any)?.familia_id ?? null,
    extra_id: extraId,
    quantidade: Number(b?.quantidade) > 0 ? Number(b.quantidade) : 1,
    dia_semana: diaSemana,
    semanas,
    cobranca: b?.cobranca === "avulso" ? "avulso" : "recorrente",
    // O PREÇO E O CUSTO DE HOJE, congelados. Um reajuste do buquê no catálogo
    // não pode reescrever o que já foi combinado com a família.
    preco_unit: Number(b?.preco ?? (item as any).preco) || 0,
    custo_unit: Number(b?.custo ?? (item as any).custo) || 0,
    inicio: b?.inicio || new Date().toISOString().slice(0, 10),
    observacao: b?.observacao ? String(b.observacao).slice(0, 300) : null,
  });

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return NextResponse.json(
        { ok: false, erro: "ja_existe",
          mensagem: "Este jazigo já tem um combinado ativo desse item. Ajuste o que existe em vez de criar outro — dois iguais comprariam buquê a mais toda semana." },
        { status: 409 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });
  }

  // A ESTEIRA JÁ NASCE CHEIA. Combinar hoje e só ver a data amanhã, quando o
  // cron rodar, é o tipo de espera que faz duvidar se salvou.
  let esteira = null;
  try { esteira = await gerarEsteiraDeExtras(); } catch { /* o cron pega depois */ }

  return NextResponse.json({ ok: true, esteira });
}

export async function PATCH(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const id = String(b?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const campos: Record<string, any> = {};
  if (b?.quantidade !== undefined) campos.quantidade = Number(b.quantidade) || 1;
  if (b?.diaSemana !== undefined) campos.dia_semana = Number(b.diaSemana);
  if (Array.isArray(b?.semanas)) campos.semanas = b.semanas.map(Number);
  if (b?.cobranca !== undefined) campos.cobranca = b.cobranca === "avulso" ? "avulso" : "recorrente";
  if (b?.preco !== undefined) campos.preco_unit = Number(b.preco) || 0;
  if (b?.custo !== undefined) campos.custo_unit = Number(b.custo) || 0;
  if (b?.observacao !== undefined) campos.observacao = String(b.observacao || "").slice(0, 300) || null;
  if (typeof b?.ativo === "boolean") campos.ativo = b.ativo;

  // MUDOU O RITMO? A PRÓXIMA DATA SE PERDE DE PROPÓSITO.
  //
  // `proxima` guardada é a resposta da regra ANTIGA. Deixá-la ali faria a
  // esteira continuar entregando no sábado velho por mais um ciclo — sem erro
  // nenhum, o que é o pior jeito de errar. Nula, o gerador recalcula.
  if (campos.dia_semana !== undefined || campos.semanas !== undefined) campos.proxima = null;

  if (!Object.keys(campos).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_mudar" }, { status: 400 });
  }

  const { error } = await db.from("assinaturas_extras")
    .update(campos).eq("org_id", org).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });

  // AS ENTREGAS AINDA NÃO FEITAS SEGUEM O COMBINADO NOVO. As já entregues
  // ficam como estão: são fato, não plano.
  if (campos.proxima === null || campos.quantidade !== undefined
      || campos.preco_unit !== undefined || campos.ativo === false) {
    await db.from("entregas_extras").delete()
      .eq("org_id", org).eq("assinatura_id", id).eq("status", "prevista");
  }

  let esteira = null;
  try { esteira = await gerarEsteiraDeExtras(); } catch { /* o cron pega depois */ }
  return NextResponse.json({ ok: true, esteira });
}

export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  // APAGAR SÓ O QUE NUNCA ENTREGOU. Com entrega feita, apagar levaria junto o
  // registro do que a família recebeu — e o débito ficaria no razão sem nada
  // que explicasse de onde veio. Nesse caso, desligar.
  const { count } = await db
    .from("entregas_extras").select("id", { count: "exact", head: true })
    .eq("org_id", org).eq("assinatura_id", id).eq("status", "entregue");

  if ((count || 0) > 0) {
    await db.from("assinaturas_extras").update({ ativo: false })
      .eq("org_id", org).eq("id", id);
    await db.from("entregas_extras").delete()
      .eq("org_id", org).eq("assinatura_id", id).eq("status", "prevista");
    return NextResponse.json({
      ok: true, desligado: true,
      mensagem: `Desliguei em vez de apagar: já houve ${count} entrega(s) feita(s), e o histórico fica.`,
    });
  }

  await db.from("entregas_extras").delete().eq("org_id", org).eq("assinatura_id", id);
  const { error } = await db.from("assinaturas_extras").delete().eq("org_id", org).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, desligado: false });
}
