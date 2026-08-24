import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, exigirLogado } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O CATÁLOGO DE FLORES E EXTRAS — a lista de preços da casa.
 *
 * É daqui que sai o que se combina no jazigo (0117): nome, unidade, preço e
 * CUSTO. O custo é metade do assunto — sem ele a previsão de compra do sábado
 * não existe, e a pergunta "esse serviço paga?" não tem resposta.
 *
 * GET  ?todos=1  → inclui os desligados (a tela de edição precisa deles, ou
 *                  não haveria como religar um item)
 * POST { id?, nome, ... } → cria, ou ATUALIZA pelo id
 * DELETE ?id=    → apaga, e só quando ninguém usa
 */
export async function GET(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const todos = req.nextUrl.searchParams.get("todos") === "1";

  let q = auth.db.from("servicos_extras").select("*");
  if (!todos) q = q.eq("ativo", true);
  const { data, error } = await q.order("categoria").order("nome");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // QUANTOS COMBINADOS USAM CADA ITEM. Mudar o preço aqui NÃO mexe em contrato
  // já feito — o combinado congela preço e custo no dia em que é criado, para
  // um reajuste do buquê não reescrever o passado de todo mundo (0117).
  // Mostrar o número é o que deixa isso visível antes de alguém se enganar.
  const { data: usos } = await auth.db
    .from("assinaturas_extras").select("extra_id").eq("ativo", true);
  const porItem = new Map<string, number>();
  for (const u of ((usos as any[]) || [])) {
    porItem.set(u.extra_id, (porItem.get(u.extra_id) || 0) + 1);
  }

  const mes = new Date().getMonth() + 1;
  const lista = ((data as any[]) || []).map((e) => ({
    ...e,
    // sazonal fora de época continua no catálogo, mas marcado
    naEpoca: !e.sazonal || (Array.isArray(e.meses) && e.meses.includes(mes)),
    margem: Math.round((Number(e.preco) - Number(e.custo)) * 100) / 100,
    combinados: porItem.get(e.id) || 0,
  }));

  return NextResponse.json({ ok: true, extras: lista, mes });
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const nome = String(b?.nome || "").trim().slice(0, 120);
  if (!nome) {
    return NextResponse.json(
      { ok: false, erro: "nome_obrigatorio", mensagem: "O item precisa de um nome." },
      { status: 400 });
  }

  const campos = {
    nome,
    descricao: b?.descricao ? String(b.descricao).slice(0, 300) : null,
    categoria: String(b?.categoria || "outro"),
    preco: Number(String(b?.preco ?? "").replace(",", ".")) || 0,
    custo: Number(String(b?.custo ?? "").replace(",", ".")) || 0,
    unidade: String(b?.unidade || "un").slice(0, 20),
    sazonal: !!b?.sazonal,
    meses: Array.isArray(b?.meses) && b.meses.length ? b.meses.map(Number) : null,
    ativo: b?.ativo !== false,
  };

  // ATUALIZAR PELO ID, e não pelo nome.
  //
  // O upsert era `onConflict: "org_id,nome"`. Isso impedia RENOMEAR: corrigir
  // "Flores frescas" para "Buquê simples" criava um segundo item em vez de
  // mudar o primeiro, e o catálogo ia enchendo de duplicata a cada correção
  // de digitação.
  const id = String(b?.id || "");
  const { error } = id
    ? await auth.db.from("servicos_extras").update(campos).eq("id", id).eq("org_id", org)
    : await auth.db.from("servicos_extras").insert({ org_id: org, ...campos });

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return NextResponse.json(
        { ok: false, erro: "nome_repetido",
          mensagem: "Já existe um item com esse nome. Dois iguais no catálogo viram dois preços para a mesma coisa." },
        { status: 409 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * APAGAR SÓ O QUE NINGUÉM USA.
 *
 * Com combinado ativo ou entrega feita, apagar levaria junto a explicação do
 * que a família recebeu — e o débito no razão ficaria sem nada que dissesse de
 * onde veio. Nesse caso, DESLIGAR: o item some de quem escolhe e o histórico
 * fica de pé.
 */
export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const [{ count: combinados }, { count: entregas }] = await Promise.all([
    auth.db.from("assinaturas_extras").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("extra_id", id),
    auth.db.from("entregas_extras").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("extra_id", id),
  ]);

  if ((combinados || 0) > 0 || (entregas || 0) > 0) {
    await auth.db.from("servicos_extras").update({ ativo: false })
      .eq("id", id).eq("org_id", org);
    return NextResponse.json({
      ok: true, desligado: true,
      mensagem: `Desliguei em vez de apagar: há ${combinados || 0} combinado(s) e `
        + `${entregas || 0} entrega(s) usando este item, e o histórico fica.`,
    });
  }

  const { error } = await auth.db.from("servicos_extras").delete()
    .eq("id", id).eq("org_id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, desligado: false });
}
