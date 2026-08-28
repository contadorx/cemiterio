import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A CONFERÊNCIA DE CADASTRO.
 *
 * Sem `familiaId`: a lista, da mais simples para a mais complicada.
 * Com `familiaId`: o checklist daquela família, item por item.
 *
 * As perguntas moram no banco (`sureya_conferencia_cadastro`, 0080/0097). Aqui
 * só se pergunta — e agora se responde a duas coisas: o REGIME (contrato ou
 * avulso) e o OK da família.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const familiaId = req.nextUrl.searchParams.get("familiaId");

  if (familiaId) {
    const { data, error } = await auth.db
      .rpc("sureya_conferencia_cadastro", { p_familia: familiaId });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, itens: data || [] });
  }

  const { data, error } = await auth.db
    .from("sureya_candidatas_ao_piloto")
    .select("familia_id,familia,responsavel,telefone,regime,contratado," +
            "conferida_em,conferida_com_pendencias,jazigos,pessoas,pendencias,avisos,o_que_falta")
    .limit(400);

  // LISTA VAZIA POR ERRO SE LÊ COMO "ESTÁ TUDO CONFERIDO".
  // Mesma regra do funil e do saldo: falha aparece, não vira zero.
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const todas = (data || []) as any[];

  // ==========================================================================
  // A CONFERÊNCIA VIRA UMA FILA DE DECISÕES (0141)
  // ==========================================================================
  //
  // Medido em 28/08: 363 famílias, 293 com pendência — e 290 delas travadas
  // pela MESMA pergunta binária, "contrato ou avulso". O cartão da tela dizia
  // "abra a ficha e escolha uma das duas": 290 aberturas para 290 escolhas.
  //
  // A contagem por tipo sai de `o_que_falta`, que a view JÁ traz. Uma segunda
  // consulta para contar o que já está na mão seria uma segunda conta sobre os
  // mesmos fatos — o defeito que este projeto mais repete.
  const porPendencia: Record<string, number> = {};
  for (const f of todas) {
    for (const item of String(f.o_que_falta || "").split("; ")) {
      const k = item.trim();
      if (k) porPendencia[k] = (porPendencia[k] || 0) + 1;
    }
  }

  // FILTRAR PELO QUE FALTA. Varrer 290 famílias é trabalho de uma tarde; varrer
  // 363 procurando quais são as 290 é trabalho de duas.
  const falta = (req.nextUrl.searchParams.get("falta") || "").trim();
  const familias = falta
    ? todas.filter((f) => String(f.o_que_falta || "").split("; ").some((i) => i.trim() === falta))
    : todas;

  // OS BLOCOS VÊM PREENCHIDOS.
  //
  // Antes, cada família era um clique para expandir e só então uma ida ao
  // servidor. Conferir trinta famílias eram sessenta cliques antes de ler a
  // primeira linha — e o pedido é justamente poder bater o olho e dar o ok.
  //
  // Uma consulta por família, em paralelo, com teto: com quatrocentas famílias
  // isso viraria quatrocentas consultas e a tela nasceria travada. Acima do
  // teto, as de baixo continuam abrindo sob demanda.
  const TETO = 60;
  const preencher = familias.slice(0, TETO);
  const itens: Record<string, any[]> = {};
  await Promise.all(
    preencher.map(async (f) => {
      const { data: d } = await auth.db
        .rpc("sureya_conferencia_cadastro", { p_familia: f.familia_id });
      itens[f.familia_id] = (d as any[]) || [];
    }),
  );

  return NextResponse.json({
    ok: true,
    familias,
    itens,
    preenchidas: preencher.length,
    // O RESUMO É DO TODO, NÃO DO FILTRO.
    //
    // Com um filtro ligado, contar `familias` faria "363 famílias" virar "290"
    // e o número mudaria de significado sem avisar — quem filtrou por "sem
    // regime" leria "290 famílias" e acharia que perdeu 73 do cadastro.
    filtro: falta || null,
    mostrando: familias.length,
    porPendencia,
    resumo: {
      total: todas.length,
      // "Pronta" agora conta só o OBRIGATÓRIO: antes um consentimento não
      // registrado — que é um aviso — pesava igual a um telefone faltando.
      prontas: todas.filter((f) => Number(f.pendencias) === 0).length,
      conferidas: todas.filter((f) => !!f.conferida_em).length,
      // Uma família pronta mas sem regime definido não serve para o piloto:
      // ninguém sabe como cobrar a limpeza dela.
      prontasContratadas: todas.filter(
        (f) => Number(f.pendencias) === 0 && f.regime === "contrato").length,
      avulsas: todas.filter((f) => f.regime === "avulso").length,
      semRegime: todas.filter((f) => f.regime === "nao_definido").length,
    },
  });
}

/**
 * POST — as duas decisões que se toma olhando a conferência.
 *
 *   { familiaId, regime: "contrato" | "avulso" }  → decide como se cobra
 *   { familiaId, ok: true | false }               → dá (ou tira) o ok
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const familiaId = String(b?.familiaId || "").trim();
  if (!familiaId) return NextResponse.json({ ok: false, erro: "sem_familia" }, { status: 400 });

  if (typeof b?.regime === "string") {
    const regime = b.regime;
    if (!["contrato", "avulso", "nao_definido"].includes(regime)) {
      return NextResponse.json({ ok: false, erro: "regime_invalido" }, { status: 400 });
    }
    // `contratado` continua sendo lido em vários lugares (planos, competência,
    // o card do piloto). Enquanto isso durar, os dois andam juntos — duas
    // verdades sobre a mesma coisa é como a ambiguidade voltou da última vez.
    const { error } = await auth.db
      .from("familias")
      .update({ regime, contratado: regime === "contrato" })
      .eq("id", familiaId);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, regime });
  }

  if (typeof b?.ok === "boolean") {
    const { data, error } = await auth.db
      .rpc("sureya_conferir_familia", { p_familia: familiaId, p_ok: b.ok });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return NextResponse.json({
      ok: !!r.ok, pendencias: r.pendencias || 0, mensagem: r.mensagem || null,
    });
  }

  return NextResponse.json({ ok: false, erro: "nada_para_fazer" }, { status: 400 });
}
