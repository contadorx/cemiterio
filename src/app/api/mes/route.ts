import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O MÊS — a tela que responde a única pergunta que importa no dia a dia:
 *
 *      QUEM FOI LIMPO E QUEM PAGOU?
 *
 * Uma linha por família, duas colunas. O painel inicial mostrava capacidade
 * do dia, rascunhos da IA e leads novos — números de um sistema que saiu de
 * escopo, e nenhum deles dizia se o mês estava fechando.
 *
 * Regra de ordenação: as pendências sobem. Quem está devendo E sem limpeza
 * aparece primeiro; quem está em dia e limpo desce para o fim. Assim a tela
 * é útil sem rolar.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const hoje = new Date();
  const competencia =
    req.nextUrl.searchParams.get("competencia") ||
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;

  // Limites do mês pedido, para filtrar as limpezas.
  const inicio = competencia;
  const d = new Date(competencia + "T12:00:00");
  d.setMonth(d.getMonth() + 1);
  const fim = d.toISOString().slice(0, 10);

  const [famRes, tumRes, servRes, ccRes] = await Promise.all([
    db.from("familias").select("id,nome,contratado").eq("org_id", org).order("nome"),
    db.from("tumulos").select("id,familia_id,contratado,codigo,ruas(nome),quadras(codigo)").eq("org_id", org),
    db.from("servicos")
      .select("id,tumulo_id,data_executada,status")
      .eq("org_id", org)
      .gte("data_executada", inicio)
      .lt("data_executada", fim),
    db.from("conta_corrente").select("familia_id,tipo,valor,origem").eq("org_id", org),
  ]);

  const familias = (famRes.data || []) as any[];
  const tumulos = (tumRes.data || []) as any[];
  const servicos = (servRes.data || []) as any[];
  const lancamentos = (ccRes.data || []) as any[];

  // Saldo por família. Os registros de LAVAGEM ficam de fora: eles têm valor
  // zero e existem só para acompanhar o serviço no extrato.
  const saldo = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.origem === "lavagem") continue;
    const v = Number(l.valor);
    saldo.set(l.familia_id, (saldo.get(l.familia_id) || 0) + (l.tipo === "debito" ? v : -v));
  }

  // Limpezas do mês por túmulo.
  const limpezasPorTumulo = new Map<string, number>();
  for (const s of servicos) {
    if (!s.data_executada) continue;
    limpezasPorTumulo.set(s.tumulo_id, (limpezasPorTumulo.get(s.tumulo_id) || 0) + 1);
  }

  const tumulosPorFamilia = new Map<string, any[]>();
  for (const t of tumulos) {
    if (!t.familia_id) continue;
    tumulosPorFamilia.set(t.familia_id, [...(tumulosPorFamilia.get(t.familia_id) || []), t]);
  }

  const dinheiro = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const linhas = familias.map((f) => {
    const meus = tumulosPorFamilia.get(f.id) || [];
    const contratados = meus.filter((t) => t.contratado);
    const limpos = contratados.filter((t) => (limpezasPorTumulo.get(t.id) || 0) > 0).length;
    const s = Math.round((saldo.get(f.id) || 0) * 100) / 100;

    return {
      familiaId: f.id,
      nome: f.nome,
      tumulos: meus.length,
      contratados: contratados.length,
      limpos,
      // "Falta limpar" é sobre o TRABALHO: túmulos que a Nina deve limpar.
      // "Sem plano" é sobre o CONTRATO, que mora na família — uma família sem
      // plano tem as limpezas cobradas como avulso.
      limpezaOk: contratados.length > 0 && limpos >= contratados.length,
      semPlano: !f.contratado,
      saldo: s,
      pagamentoOk: s <= 0.005,
      frase: s <= 0.005 ? "Em dia" : `Em aberto · ${dinheiro(s)}`,
      local: meus[0]
        ? [meus[0].quadras?.codigo, meus[0].ruas?.nome].filter(Boolean).join(" · ")
        : null,
    };
  });

  // Pendências primeiro: quanto mais coisa faltando, mais acima.
  const peso = (l: any) => (l.limpezaOk ? 0 : 2) + (l.pagamentoOk ? 0 : 1);
  linhas.sort((a, b) => peso(b) - peso(a) || a.nome.localeCompare(b.nome));

  return NextResponse.json({
    ok: true,
    competencia,
    linhas,
    resumo: {
      familias: linhas.length,
      faltaLimpar: linhas.filter((l) => !l.limpezaOk && !l.semPlano).length,
      faltaPagar: linhas.filter((l) => !l.pagamentoOk).length,
      emAberto: Math.round(
        linhas.filter((l) => l.saldo > 0).reduce((s, l) => s + l.saldo, 0) * 100
      ) / 100,
    },
  });
}
