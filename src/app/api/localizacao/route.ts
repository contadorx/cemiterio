import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { diaOperacao, valorMensalDoPlano } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE = 2000;

/**
 * GET -> todos os jazigos com o que a planta precisa: GPS, quadra, cemitério,
 * família, situação de vencimento e as datas. A planta é desenhada no cliente
 * (projeção em metros), então aqui só devolvemos dados crus, já com a situação
 * calculada num só lugar — e a régua tem de ser EXATAMENTE a da tela de Gestão,
 * senão o mapa diz "vencido" onde a Gestão diz "em dia" e o dono do escritório
 * perde a confiança nos dois.
 *
 * Por isso, igual à Gestão de propósito:
 *  - o dia de hoje vem de diaOperacao() (fuso de São Paulo), a mesma função que
 *    /api/planos e /painel/planos passaram a usar;
 *  - o valor mensal sai de valorMensalDoPlano(), um lugar só para o plano antigo
 *    de valor_mensal NULL (ver o docblock dela: o significado de valor_vigente
 *    nessas linhas está em aberto, e por isso ela não divide nada);
 *  - famílias "[TESTE]" fora, a não ser com ?teste=1.
 *
 * Os planos vêm EMBUTIDOS no select dos jazigos (uma ida ao banco, sem risco de
 * dois .limit() desalinhados devolverem jazigo com plano como "sem plano").
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const incluirTeste = req.nextUrl.searchParams.get("teste") === "1";

  const { data: tums, error } = await db
    .from("tumulos")
    .select(
      "id,identificacao,numero,rua,lat,lng,gps_precisao,cliente_id,familia_id," +
      "quadras(codigo,ordem,cemiterios(nome)),clientes(nome),familias(nome)," +
      "planos(proxima_cobranca,proximo_servico,valor_mensal,valor_vigente,cadencia,ativo)",
    )
    .order("identificacao", { ascending: true })
    .limit(LIMITE);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const hoje = diaOperacao();
  const sem7 = diaOperacao(7), mes30 = diaOperacao(30);

  // um jazigo pode ter mais de um plano na base migrada: o ATIVO manda, e entre
  // dois ativos vale o de vencimento mais próximo (é o que cobra primeiro).
  function planoDoJazigo(lista: any): any {
    const ps = Array.isArray(lista) ? lista : lista ? [lista] : [];
    if (!ps.length) return null;
    return ps.reduce((a: any, b: any) => {
      if ((a.ativo !== false) !== (b.ativo !== false)) return a.ativo !== false ? a : b;
      return String(a.proxima_cobranca || "9999-12-31") <= String(b.proxima_cobranca || "9999-12-31") ? a : b;
    });
  }

  function situacao(p: any): string {
    if (!p) return "sem";
    if (p.ativo === false) return "inativo";
    const d = p.proxima_cobranca;
    if (!d) return "sem";
    if (d < hoje) return "vencido";
    if (d <= sem7) return "semana";
    if (d <= mes30) return "mes";
    return "emdia";
  }

  let jazigos = (tums || []).map((t: any) => {
    const p = planoDoJazigo(t.planos);
    return {
      id: t.id,
      identificacao: t.identificacao || "",
      rua: t.rua || null,
      numero: t.numero || null,
      quadra: t.quadras?.codigo || "sem quadra",
      quadraOrdem: Number(t.quadras?.ordem ?? 9999),
      cemiterio: t.quadras?.cemiterios?.nome || "sem cemitério",
      cliente: t.clientes?.nome || null,
      clienteId: t.cliente_id || null,
      // A FAMÍLIA é o vínculo desde a 0091; o contato é derivado dela e pode
      // não existir. O mapa dizia "sem família vinculada" olhando o CONTATO —
      // então todo jazigo de família sem telefone aparecia como órfão, por
      // mais vezes que fosse salvo. Mesmo defeito da lista de órfãos.
      familia: t.familias?.nome || null,
      familiaId: t.familia_id || null,
      lat: t.lat ?? null,
      lng: t.lng ?? null,
      precisao: t.gps_precisao ?? null,
      status: situacao(p),
      proximaCobranca: p?.proxima_cobranca || null,
      proximoServico: p?.proximo_servico || null,
      valorMensal: p ? valorMensalDoPlano(p.cadencia, p.valor_mensal, p.valor_vigente) : null,
      cadencia: p?.cadencia || null,
      temPlano: !!p,
      ativo: p ? p.ativo !== false : null,
      planos: Array.isArray(t.planos) ? t.planos.length : t.planos ? 1 : 0,
    };
  });

  if (!incluirTeste) {
    jazigos = jazigos.filter(
      (j) => !String(j.familia || j.cliente || "").startsWith("[TESTE]"),
    );
  }

  return NextResponse.json({
    ok: true,
    jazigos,
    hoje,
    // aviso honesto: se bateu o teto, a planta está incompleta e a tela diz isso
    truncado: (tums || []).length >= LIMITE,
    limite: LIMITE,
  });
}
