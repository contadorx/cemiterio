import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * CONSUMO DE MATERIAL POR LIMPEZA
 *
 * Cada material tem uma estimativa de quanto se gasta em UMA limpeza
 * (ex.: 0,05 vassoura — ou seja, uma vassoura dura 20 limpezas).
 * A cada limpeza concluída, o estoque cai por essa estimativa e o custo do
 * material entra no resultado daquele jazigo.
 *
 * A estimativa não fica congelada: quando se compra de novo, o sistema compara
 * quanto foi comprado com quantas limpezas houve desde a compra anterior e
 * SUGERE o consumo real — que você aprova ou não.
 */

export interface CustoMaterial {
  total: number;
  itens: { nome: string; quantidade: number; custo: number }[];
}

/** Baixa o estoque e devolve o custo de material daquela limpeza. */
export async function consumirMaterial(servicoId: string): Promise<CustoMaterial> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: mats } = await db
    .from("materiais")
    .select("id,nome,estoque,consumo_por_limpeza,custo_unitario")
    .eq("org_id", org)
    .gt("consumo_por_limpeza", 0);

  const itens: CustoMaterial["itens"] = [];
  let total = 0;

  for (const m of (mats || []) as any[]) {
    const qtd = Number(m.consumo_por_limpeza) || 0;
    if (qtd <= 0) continue;
    const custo = qtd * (Number(m.custo_unitario) || 0);
    total += custo;
    itens.push({ nome: m.nome, quantidade: qtd, custo: Math.round(custo * 10000) / 10000 });

    await db.from("materiais").update({
      estoque: Math.max(0, Number(m.estoque) - qtd),
      atualizado_em: new Date().toISOString(),
    }).eq("id", m.id);
  }

  total = Math.round(total * 100) / 100;
  if (total > 0) {
    await db.from("servicos").update({ custo_estimado: total }).eq("id", servicoId).eq("org_id", org);
  }
  return { total, itens };
}

/**
 * Registra uma compra e SUGERE a nova estimativa de consumo, comparando o que
 * foi comprado com quantas limpezas aconteceram desde a compra anterior.
 * Nada é aplicado sem aprovação.
 */
export async function registrarCompra(args: {
  materialId: string;
  quantidade: number;
  valorTotal: number;
  data?: string;
}): Promise<{ compraId: string | null; consumoSugerido: number | null; limpezas: number; consumoAtual: number }> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: mat } = await db
    .from("materiais").select("id,nome,estoque,consumo_por_limpeza,custo_unitario")
    .eq("org_id", org).eq("id", args.materialId).maybeSingle();
  if (!mat) return { compraId: null, consumoSugerido: null, limpezas: 0, consumoAtual: 0 };

  const { data: anterior } = await db
    .from("compras_material").select("data")
    .eq("org_id", org).eq("material_id", args.materialId)
    .order("data", { ascending: false }).limit(1).maybeSingle();

  // limpezas feitas desde a compra anterior
  let limpezas = 0;
  if (anterior) {
    const { count } = await db
      .from("servicos").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("status", "executado")
      .gte("data_executada", (anterior as any).data);
    limpezas = count || 0;
  }

  // se gastou a quantidade comprada em N limpezas, o consumo real é quantidade/N
  const consumoSugerido = limpezas > 0
    ? Math.round((Number(args.quantidade) / limpezas) * 10000) / 10000
    : null;

  const { data: compra } = await db.from("compras_material").insert({
    org_id: org,
    material_id: args.materialId,
    quantidade: args.quantidade,
    valor_total: args.valorTotal,
    data: args.data || new Date().toISOString().slice(0, 10),
    limpezas_periodo: limpezas,
    consumo_medido: consumoSugerido,
    aplicado: false,
  }).select("id").single();

  // a compra sempre repõe o estoque e atualiza o custo unitário
  const novoCusto = Number(args.quantidade) > 0
    ? Math.round((Number(args.valorTotal) / Number(args.quantidade)) * 100) / 100
    : Number((mat as any).custo_unitario) || 0;

  await db.from("materiais").update({
    estoque: Number((mat as any).estoque) + Number(args.quantidade),
    custo_unitario: novoCusto,
    atualizado_em: new Date().toISOString(),
  }).eq("id", args.materialId);

  return {
    compraId: (compra as any)?.id || null,
    consumoSugerido,
    limpezas,
    consumoAtual: Number((mat as any).consumo_por_limpeza) || 0,
  };
}

/** Aplica a estimativa sugerida por uma compra (a aprovação do dono). */
export async function aplicarConsumoSugerido(compraId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { data: c } = await db
    .from("compras_material").select("id,material_id,consumo_medido")
    .eq("org_id", org).eq("id", compraId).maybeSingle();
  if (!c || (c as any).consumo_medido == null) return false;

  await db.from("materiais").update({
    consumo_por_limpeza: (c as any).consumo_medido,
    consumo_confirmado: true,
  }).eq("id", (c as any).material_id);

  await db.from("compras_material").update({ aplicado: true }).eq("id", compraId);
  return true;
}
