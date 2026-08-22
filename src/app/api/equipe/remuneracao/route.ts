import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import {
  carregarRegras, valorDoServico, ehAvulso, REGRA_VAZIA, type Regra,
} from "@/lib/remuneracao";
import { diaOperacao, mesOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * REMUNERACAO DA EQUIPE — regras, relatorio do mes e acerto.
 *
 * GET  ?mes=YYYY-MM  → o relatorio completo do mes, pessoa por pessoa, com a
 *                      COMPARACAO entre pagar pelo mes e pagar por jazigo.
 * PUT                → grava a regra de uma pessoa (ou a regra geral da casa).
 * POST {acao}        → "recalcular" (aplica a regra de hoje no que ainda nao
 *                      foi pago) ou "acerto" (fecha e lanca a saida no caixa).
 *
 * Nao mexe na conta_equipe (reembolso de material) — sao dois dinheiros
 * diferentes: la e devolucao do que ela gastou, aqui e o trabalho dela.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function faixaDoMes(mes: string) {
  const base = /^\d{4}-\d{2}$/.test(mes) ? mes : mesOperacao();
  const [a, m] = base.split("-").map(Number);
  const ini = `${base}-01`;
  const prox = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { mes: base, ini, prox };
}

// ---------------------------------------------------------------- GET
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const { mes, ini, prox } = faixaDoMes(req.nextUrl.searchParams.get("mes") || "");

  const [{ data: equipe }, regrasRes] = await Promise.all([
    db.from("membros").select("user_id,nome,papel,ativo").eq("ativo", true),
    carregarRegras(db).catch(() => null),
  ]);

  if (!regrasRes) {
    return NextResponse.json({
      ok: false,
      erro: "tabela_ausente",
      dica: "rode a migration 0031_remuneracao_equipe.sql no SQL Editor antes de usar esta aba",
    }, { status: 400 });
  }

  // servicos EXECUTADOS no mes (a base do por-jazigo)
  //
  // ESTA TELA MOSTRAVA QUATRO ZEROS E NAO DIZIA QUE ESTAVA QUEBRADA.
  // O select pedia `tumulos(codigo,quadra)` — colunas que NAO existem em
  // tumulos (`codigo` e de quadras; o tumulo tem `identificacao` e `quadra_id`).
  // O PostgREST rejeita o select INTEIRO por causa disso, e como o erro era
  // descartado (`const { data } = await ...`, sem olhar `error`), a lista vinha
  // vazia: jazigos 0, receita R$ 0,00, comparativo zerado — bem ao lado de um
  // "A pagar" com o valor certo, porque aquela outra consulta nao tem join.
  // Uma tela se contradizendo em silencio.
  //
  // Agora: colunas certas, e o erro aparece em vez de virar zero.
  const { data: doMes, error: eDoMes } = await db
    .from("servicos")
    .select("id,executora_id,valor,valor_executora,pago_executora_em,plano_id,data_executada,tumulos(identificacao,quadras(codigo)),planos(cadencia)")
    .eq("status", "executado")
    .gte("data_executada", ini)
    .lt("data_executada", prox)
    .order("data_executada", { ascending: false });

  if (eDoMes) {
    return NextResponse.json({
      ok: false,
      erro: "consulta_falhou",
      dica: `Não consegui ler as limpezas do mês: ${eDoMes.message}`,
    }, { status: 500 });
  }

  // O FIXO DESTE MES JA FOI PAGO? (0043)
  // Sem isto, a tela oferecia pagar o mesmo salario de novo — e o banco nao
  // tinha como saber que ja tinha saido.
  const { data: fixosPagos } = await db
    .from("acertos_equipe")
    .select("membro_id,valor_mensal,created_at")
    .eq("mes_ref", mes);
  const jaPagouFixo = new Map<string, any>();
  for (const f of (fixosPagos || []) as any[]) jaPagouFixo.set(f.membro_id, f);

  // tudo que ainda NAO foi pago, de qualquer mes — e isso que sai no acerto
  const { data: emAberto } = await db
    .from("servicos")
    .select("id,executora_id,valor_executora,data_executada")
    .eq("status", "executado")
    .is("pago_executora_em", null)
    .not("valor_executora", "is", null);

  const servicos = (doMes || []) as any[];
  const abertos = (emAberto || []) as any[];

  // quem aparece: a equipe cadastrada + quem executou algo no mes
  const nomes = new Map<string, string>();
  for (const m of (equipe || []) as any[]) nomes.set(m.user_id, m.nome || "sem nome");
  const ids = new Set<string>([
    ...((equipe || []) as any[]).filter((m) => m.papel === "campo").map((m) => m.user_id),
    ...servicos.map((s) => s.executora_id).filter(Boolean),
    ...abertos.map((s) => s.executora_id).filter(Boolean),
  ]);

  const pessoas = [...ids].map((id) => {
    const regra: Regra = regrasRes.para(id);
    const meus = servicos.filter((s) => s.executora_id === id);
    const avulsos = meus.filter((s) => ehAvulso(s));
    const receita = r2(meus.reduce((t, s) => t + (Number(s.valor) || 0), 0));

    // o que a regra de hoje diria para cada servico deste mes
    const congelado = r2(meus.reduce((t, s) => t + (Number(s.valor_executora) || 0), 0));
    const porRegraHoje = r2(meus.reduce(
      (t, s) => t + valorDoServico(regra, { receita: Number(s.valor) || 0, avulso: ehAvulso(s) }), 0));

    // A COMPARACAO que ele pediu: os tres cenarios lado a lado, com a MESMA
    // tarifa, para ele ver qual e melhor antes de decidir.
    const soMensal = r2(Number(regra.valor_mensal) || 0);
    const cenarioPorJazigo = r2(meus.reduce((t, s) => t + valorDoServico(
      { ...regra, modo: "por_jazigo", so_avulso: false },
      { receita: Number(s.valor) || 0, avulso: ehAvulso(s) }), 0));
    const cenarioSoAvulso = r2(avulsos.reduce((t, s) => t + valorDoServico(
      { ...regra, modo: "por_jazigo", so_avulso: false },
      { receita: Number(s.valor) || 0, avulso: true }), 0));

    const fixoDoMes = jaPagouFixo.get(id) || null;
    const mensalDevidoBruto = regra.modo === "por_jazigo" ? 0 : soMensal;
    // já pago = não deve mais. O total do MÊS continua contando o fixo (é o
    // custo do mês, pago ou não); o que zera é o "a pagar".
    const mensalDevido = fixoDoMes ? 0 : mensalDevidoBruto;
    const totalDoMes = r2(mensalDevidoBruto + congelado);

    const meusAbertos = abertos.filter((s) => s.executora_id === id);
    const aPagarJazigos = r2(meusAbertos.reduce((t, s) => t + (Number(s.valor_executora) || 0), 0));

    return {
      membroId: id,
      nome: nomes.get(id) || "executora sem cadastro",
      regra,
      regraPropria: regrasRes.propria(id),
      jazigos: meus.length,
      jazigosAvulsos: avulsos.length,
      receita,
      // o que ela recebe pela regra vigente
      mensalDevido,
      porJazigoCongelado: congelado,
      totalDoMes,
      // divergencia entre o congelado e a regra de hoje (mudou a regra no meio)
      porRegraHoje,
      divergente: Math.abs(porRegraHoje - congelado) >= 0.01,
      // os cenarios para comparar
      comparacao: {
        soMensal,
        soPorJazigo: cenarioPorJazigo,
        mensalMaisAvulsos: r2(soMensal + cenarioSoAvulso),
        mensalMaisTodos: r2(soMensal + cenarioPorJazigo),
        // quanto sobra do que a familia paga depois de pagar ela
        margemSeMensal: r2(receita - soMensal),
        margemSePorJazigo: r2(receita - cenarioPorJazigo),
        // custo por jazigo em cada cenario, o numero que decide
        custoJazigoSeMensal: meus.length ? r2(soMensal / meus.length) : 0,
        custoJazigoSePorJazigo: meus.length ? r2(cenarioPorJazigo / meus.length) : 0,
        // quanto ela ganha por jazigo hoje, na media
        ganhoMedio: meus.length ? r2(totalDoMes / meus.length) : 0,
      },
      // o fixo deste mês já saiu? (0043)
      fixoPago: !!fixoDoMes,
      fixoPagoEm: fixoDoMes?.created_at || null,
      fixoPagoValor: fixoDoMes ? Number(fixoDoMes.valor_mensal) : null,
      aPagar: {
        jazigos: aPagarJazigos,
        servicos: meusAbertos.length,
        maisAntigo: meusAbertos.map((s) => s.data_executada).sort()[0] || null,
      },
      servicos: meus.map((s) => ({
        id: s.id,
        data: s.data_executada,
        // quadra vem de tumulos->quadras->codigo; o numero do jazigo e a
        // identificacao (as colunas antigas `codigo`/`quadra` nunca existiram
        // em tumulos, e eram o motivo de a tela inteira vir zerada)
        jazigo: [s.tumulos?.quadras?.codigo, s.tumulos?.identificacao]
          .filter(Boolean).join(" · ") || "sem código",
        avulso: ehAvulso(s),
        receita: Number(s.valor) || 0,
        ganho: Number(s.valor_executora) || 0,
        pago: !!s.pago_executora_em,
      })),
    };
  }).sort((a, b) => b.jazigos - a.jazigos);

  return NextResponse.json({
    ok: true,
    mes,
    regraGeral: regrasRes.geral || { ...REGRA_VAZIA },
    temRegraGeral: !!regrasRes.geral,
    pessoas,
    totais: {
      jazigos: servicos.length,
      receita: r2(servicos.reduce((t, s) => t + (Number(s.valor) || 0), 0)),
      custoEquipe: r2(pessoas.reduce((t, p) => t + p.totalDoMes, 0)),
      aPagar: r2(pessoas.reduce((t, p) => t + p.aPagar.jazigos, 0)),
      semCarimbo: servicos.filter((s) => s.valor_executora == null && s.executora_id).length,
    },
  });
}

// ---------------------------------------------------------------- PUT (regra)
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));

  const { data: org } = await auth.db.from("orgs").select("id").limit(1).maybeSingle();
  const orgId = (org as any)?.id;
  if (!orgId) return NextResponse.json({ ok: false, erro: "org_nao_encontrada" }, { status: 400 });

  const linha = {
    org_id: orgId,
    membro_id: b?.membroId || null,   // null = regra geral da casa
    modo: ["mensal", "por_jazigo", "mensal_mais_jazigo"].includes(b?.modo) ? b.modo : "mensal",
    valor_mensal: Number(b?.valorMensal) || 0,
    base_jazigo: b?.baseJazigo === "percentual" ? "percentual" : "fixo",
    valor_por_jazigo: Number(b?.valorPorJazigo) || 0,
    percentual_receita: Number(b?.percentualReceita) || 0,
    so_avulso: !!b?.soAvulso,
    observacao: b?.observacao || null,
    atualizado_em: new Date().toISOString(),
  };

  // upsert manual: o unique e parcial (membro_id null), o onConflict nao pega
  const { data: ja } = await auth.db
    .from("remuneracao_regras").select("id")
    .eq("org_id", orgId)
    .filter("membro_id", linha.membro_id ? "eq" : "is", linha.membro_id ?? null)
    .maybeSingle();

  const q = ja
    ? auth.db.from("remuneracao_regras").update(linha).eq("id", (ja as any).id)
    : auth.db.from("remuneracao_regras").insert(linha);
  const { error } = await q;
  if (error) {
    const falta = /remuneracao_regras/.test(error.message) && /does not exist|relation/.test(error.message);
    return NextResponse.json({
      ok: false,
      erro: falta ? "rode a migration 0031_remuneracao_equipe.sql antes" : error.message,
    }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------- POST (ações)
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const b = await req.json().catch(() => ({}));

  // ---------- recalcular: aplica a regra de HOJE no que ainda não foi pago ----
  // Indispensável porque ele está definindo as regras DEPOIS de já ter serviços
  // executados no banco. O que já foi pago fica intocado.
  if (b?.acao === "recalcular") {
    const regras = await carregarRegras(db).catch(() => null);
    if (!regras) return NextResponse.json({ ok: false, erro: "rode a migration 0031 antes" }, { status: 400 });

    const { data: alvo } = await db
      .from("servicos")
      .select("id,executora_id,valor,plano_id,planos(cadencia)")
      .eq("status", "executado")
      .is("pago_executora_em", null)
      .not("executora_id", "is", null);

    let mudados = 0;
    for (const s of ((alvo || []) as any[])) {
      const novo = valorDoServico(regras.para(s.executora_id), {
        receita: Number(s.valor) || 0,
        avulso: ehAvulso(s),
      });
      const { error } = await db.from("servicos").update({ valor_executora: novo }).eq("id", s.id);
      if (!error) mudados++;
    }
    return NextResponse.json({ ok: true, recalculados: mudados, total: (alvo || []).length });
  }

  // ---------- acerto: fecha o período e lança a saída no caixa ---------------
  if (b?.acao === "acerto") {
    const membroId = String(b?.membroId || "");
    if (!membroId) return NextResponse.json({ ok: false, erro: "membro_obrigatorio" }, { status: 400 });

    const { data: org } = await db.from("orgs").select("id").limit(1).maybeSingle();
    const orgId = (org as any)?.id;

    // os serviços que entram: não pagos desta pessoa (opcionalmente até uma data)
    let q = db.from("servicos").select("id,valor_executora")
      .eq("status", "executado")
      .eq("executora_id", membroId)
      .is("pago_executora_em", null)
      .not("valor_executora", "is", null);
    if (b?.ate) q = q.lte("data_executada", `${b.ate}T23:59:59`);
    const { data: itens } = await q;

    const lista = ((itens || []) as any[]).filter((s) => Number(s.valor_executora) > 0);
    const somaJazigos = r2(lista.reduce((t, s) => t + Number(s.valor_executora), 0));
    const parteMensal = r2(Number(b?.valorMensal) || 0);
    const total = r2(somaJazigos + parteMensal);

    if (total <= 0) {
      return NextResponse.json({ ok: false, erro: "Não há nada a acertar para esta pessoa." }, { status: 400 });
    }

    const agora = new Date().toISOString();
    // um id de lote para saber, depois, o que saiu junto
    const lote = (globalThis.crypto as any)?.randomUUID?.() || null;
    const mesRef = String(b?.mesRef || "").slice(0, 7) || agora.slice(0, 7);

    // ------------------------------------------------------------------
    // O FIXO DO MÊS SÓ SAI UMA VEZ (0043).
    //
    // Antes, a parte fixa não ficava registrada em lugar nenhum — clicar
    // "Acertar" duas vezes no mesmo mês pagava o salário duas vezes, e a única
    // pista era a descrição do lançamento. Agora quem recusa é o banco: a
    // chave primária é (org, membro, mês).
    // ------------------------------------------------------------------
    if (parteMensal > 0) {
      const { error: eFixo } = await db.from("acertos_equipe").insert({
        org_id: orgId,
        membro_id: membroId,
        mes_ref: mesRef,
        valor_mensal: parteMensal,
        lote,
        observacao: b?.observacao || null,
      });
      if (eFixo) {
        const jaPago = String(eFixo.code) === "23505" || /duplicat|unique/i.test(eFixo.message || "");
        if (jaPago) {
          return NextResponse.json({
            ok: false,
            erro: "fixo_ja_pago",
            mensagem:
              `O fixo de ${mesRef} desta pessoa já foi acertado. Se quiser pagar só os ` +
              `jazigos que entraram depois, refaça o acerto sem incluir o fixo.`,
          }, { status: 400 });
        }
        // tabela ainda não existe (0043 não rodada): avisa, mas não trava o acerto
        console.error("[acerto] não registrei o fixo:", eFixo.message);
      }
    }

    // saída no caixa, na categoria da equipe (usa a sua se já existir)
    const { data: cat } = await db
      .from("categorias_financeiras").select("id,nome")
      .eq("tipo", "saida").eq("ativa", true).ilike("nome", "%equipe%").limit(1).maybeSingle();

    const { data: nome } = await db.from("membros")
      .select("nome").eq("user_id", membroId).maybeSingle();

    const descricao =
      `Acerto ${(nome as any)?.nome || "equipe"}` +
      (lista.length ? ` — ${lista.length} jazigo(s) R$ ${somaJazigos.toFixed(2)}` : "") +
      (parteMensal ? ` + mensal R$ ${parteMensal.toFixed(2)}` : "") +
      (b?.observacao ? ` — ${b.observacao}` : "");

    // ------------------------------------------------------------------
    // O CAIXA PRIMEIRO, OS JAZIGOS DEPOIS.
    //
    // A ordem era o contrário: os serviços eram marcados como pagos e, se o
    // lançamento falhasse, viravam um aviso de texto — jazigos "pagos" sem
    // saída nenhuma no caixa, e sem tela para desmarcar. Agora, se o caixa
    // falhar, nada foi marcado e dá para tentar de novo à vontade.
    // ------------------------------------------------------------------
    const { data: lanc, error: eLanc } = await db.from("lancamentos").insert({
      org_id: orgId,
      tipo: "saida",
      valor: total,
      data: b?.data || diaOperacao(),
      categoria_id: (cat as any)?.id || null,
      descricao,
    }).select("id").maybeSingle();

    if (eLanc) {
      // desfaz o registro do fixo: ninguém foi pago, então o mês continua aberto
      if (parteMensal > 0) {
        await db.from("acertos_equipe").delete()
          .eq("org_id", orgId).eq("membro_id", membroId).eq("mes_ref", mesRef);
      }
      return NextResponse.json({
        ok: false,
        erro: "caixa_falhou",
        mensagem: `Não lancei a saída no caixa (${eLanc.message}). Nada foi marcado como pago — pode tentar de novo.`,
      }, { status: 500 });
    }

    if (lista.length) {
      const { error: eMarca } = await db.from("servicos")
        .update({ pago_executora_em: agora, ...(lote ? { pago_executora_lote: lote } : {}) })
        .in("id", lista.map((s) => s.id));
      if (eMarca) {
        // o dinheiro já saiu no caixa; avisa com o que precisa ser conferido à mão
        return NextResponse.json({
          ok: true,
          pago: total,
          jazigos: lista.length,
          somaJazigos,
          parteMensal,
          lancado: true,
          avisoCaixa:
            `A saída de R$ ${total.toFixed(2)} foi lançada no caixa, mas não consegui marcar ` +
            `os ${lista.length} jazigo(s) como pagos (${eMarca.message}). Eles vão aparecer ` +
            `de novo no próximo acerto — confira antes de pagar.`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      pago: total,
      jazigos: lista.length,
      somaJazigos,
      parteMensal,
      mesRef,
      lancamentoId: (lanc as any)?.id || null,
      lancado: true,
      avisoCaixa: null,
    });
  }

  return NextResponse.json({ ok: false, erro: "acao_desconhecida" }, { status: 400 });
}
