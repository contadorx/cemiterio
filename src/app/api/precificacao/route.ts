import { NextRequest, NextResponse } from "next/server";
import { diasDaCasa } from "@/lib/jornada";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { precificar, SEMANAS_MES, type Custos } from "@/lib/precificacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O QUE CUSTA E O QUE SE COBRA (só leitura, não grava nada).
 *
 * ---------------------------------------------------------------------------
 * O QUE O SISTEMA SABE E O QUE ELE NÃO SABE — medido em 29/08
 * ---------------------------------------------------------------------------
 * SABE, com precisão: 82 túmulos contratados, a periodicidade de cada um e o
 * valor mensal de todos os 82. Disso sai a carga de trabalho (182 lavagens por
 * mês) e a receita (R$ 3.150).
 *
 * NÃO SABE quase nada do custo. Todas as tabelas estão VAZIAS:
 *   materiais          0 linhas
 *   compras_material   0
 *   remuneracao_regras 0
 *   acertos_equipe     0
 *   conta_equipe       0
 * E dos 25 serviços cadastrados, 6 executados, com `custo_estimado` = 0,00 e
 * ZERO pagamento de equipe lançado.
 *
 * A ÚNICA âncora de custo que existe está em `orgs`: `custo_mensal_ajudante`
 * (R$ 1.840,00) — um número que alguém digitou de verdade.
 *
 * Por isso esta rota NÃO INVENTA custo. Ela devolve o que o sistema mede, o
 * que ele tem cadastrado como custo, e deixa a tela pedir o resto — material e
 * transporte por lavagem — a quem sabe. Preencher esses buracos com uma
 * estimativa minha e apresentar o resultado como "o custo" seria transformar
 * um chute numa decisão de preço.
 */

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data: orgRow } = await auth.db
    .from("orgs")
    .select("custo_mensal_ajudante,limpezas_por_dia,dias_semana,dias_trabalhados_semana,valor_referencia_limpeza")
    .eq("id", org).maybeSingle();

  const { data: tums, error } = await auth.db
    .from("tumulos")
    .select("id,codigo,periodicidade,valor_mensal,familias(nome)")
    .eq("org_id", org)
    .eq("contratado", true)
    .limit(5000);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const contratos = ((tums as any[]) || []).map((t) => ({
    id: t.id,
    familia: t.familias?.nome || null,
    codigo: t.codigo || null,
    periodicidade: t.periodicidade || null,
    valorMensal: t.valor_mensal === null || t.valor_mensal === undefined
      ? null : Number(t.valor_mensal),
  }));

  // A CAPACIDADE VEM DA MESMA CONFIGURAÇÃO QUE O ALOCADOR USA.
  // Inventar outra aqui faria a tela de preço discordar da agenda sobre quantas
  // lavagens cabem no mês — e as duas estariam certas segundo a própria conta.
  const porDia = Number((orgRow as any)?.limpezas_por_dia) || 0;
  const diasSemana = diasDaCasa(orgRow).length;
  const capacidadeMes = porDia > 0 && diasSemana > 0
    ? Math.round(porDia * diasSemana * SEMANAS_MES) : null;

  // Os custos que o pedido trouxer valem; o que não vier cai no que está
  // cadastrado, e o que não está cadastrado vale ZERO E SE DECLARA — a tela
  // avisa quais buracos estão sendo tratados como zero, para ninguém ler a
  // sobra como se fosse lucro.
  const q = req.nextUrl.searchParams;
  const num = (k: string): number | null => {
    const v = q.get(k);
    if (v === null || v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const ajudanteCadastrado = Number((orgRow as any)?.custo_mensal_ajudante) || 0;
  const custos: Custos = {
    ajudanteMes: num("ajudante") ?? ajudanteCadastrado,
    materialPorLavagem: num("material") ?? 0,
    transportePorLavagem: num("transporte") ?? 0,
    sistemaMes: num("sistema") ?? 0,
  };

  const conta = precificar(contratos, custos, capacidadeMes);

  return NextResponse.json({
    ok: true,
    ...conta,
    custos,
    referencia: (orgRow as any)?.valor_referencia_limpeza === null
      || (orgRow as any)?.valor_referencia_limpeza === undefined
      ? null : Number((orgRow as any).valor_referencia_limpeza),
    // VAZIO NÃO É ZERO — e aqui vazio disfarçado de zero vira preço errado.
    // Se material e transporte não foram informados, a sobra na tela é o TETO
    // do que pode sobrar, nunca o que sobra. A tela tem de dizer isso.
    buracos: [
      custos.materialPorLavagem > 0 ? null : "material por lavagem",
      custos.transportePorLavagem > 0 ? null : "transporte por lavagem",
      custos.sistemaMes > 0 ? null : "sistema e telefone por mês",
      ajudanteCadastrado > 0 ? null : "pagamento da ajudante",
    ].filter(Boolean),
    ajudanteVeioDoCadastro: num("ajudante") === null && ajudanteCadastrado > 0,
  });
}
