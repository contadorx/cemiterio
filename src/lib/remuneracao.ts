import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * QUANTO A AJUDANTE GANHA
 *
 * Hoje a Nina recebe um fixo do mês. O Leandro quer poder pagar por jazigo
 * lavado — inteiro ou como adicional em cima do fixo — sem ter que decidir de
 * uma vez qual dos dois é o certo, porque a tarifa justa ainda não apareceu.
 *
 * Então o desenho é: a REGRA fica na tabela `remuneracao_regras`, e o quanto
 * ela ganhou naquele jazigo fica CONGELADO em `servicos.valor_executora` no
 * momento da conclusão. Igual ao `servicos.valor` (o que a família paga).
 * Mudar a regra em novembro não reescreve o que ela ganhou em agosto.
 *
 * A regra com `membro_id` nulo é a REGRA GERAL DA CASA: vale para quem ainda
 * não tem a própria. É o que faz "ela terá outras pessoas" funcionar sem
 * cadastrar cada uma.
 */

export type ModoRemuneracao = "mensal" | "por_jazigo" | "mensal_mais_jazigo";
export type BaseJazigo = "fixo" | "percentual";

export type Regra = {
  id?: string;
  membro_id: string | null;
  modo: ModoRemuneracao;
  valor_mensal: number;
  base_jazigo: BaseJazigo;
  valor_por_jazigo: number;
  percentual_receita: number;
  so_avulso: boolean;
  observacao?: string | null;
};

/** o que vale quando não há regra nenhuma cadastrada ainda */
export const REGRA_VAZIA: Regra = {
  membro_id: null,
  modo: "mensal",
  valor_mensal: 0,
  base_jazigo: "fixo",
  valor_por_jazigo: 0,
  percentual_receita: 0,
  so_avulso: false,
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Todas as regras da org, já resolvidas: a da pessoa quando existe, senão a
 * geral da casa. Uma consulta só — quem chama isso normalmente vai calcular
 * vários serviços seguidos.
 */
export async function carregarRegras(db: SupabaseClient, orgId?: string) {
  let q = db.from("remuneracao_regras").select("*");
  if (orgId) q = q.eq("org_id", orgId);
  const { data } = await q;
  const lista = (data || []) as any[];
  const geral = (lista.find((x) => !x.membro_id) as Regra) || null;
  const porMembro = new Map<string, Regra>();
  for (const x of lista) if (x.membro_id) porMembro.set(x.membro_id, x as Regra);

  return {
    geral,
    porMembro,
    /** a regra que vale para esta pessoa (a dela, ou a da casa, ou nada) */
    para(membroId: string | null | undefined): Regra {
      if (membroId && porMembro.has(membroId)) return porMembro.get(membroId)!;
      return geral || REGRA_VAZIA;
    },
    /** true quando a regra dela é própria, não herdada da casa */
    propria(membroId: string | null | undefined) {
      return !!(membroId && porMembro.has(membroId));
    },
  };
}

/**
 * Quanto vale ESTE serviço para quem executou.
 *
 * `avulso` = serviço sem plano periódico (o "novo" da conversa do Leandro).
 * `receita` = o que a família paga por ele — a base do percentual.
 *
 * Retorna 0 quando o modo é só mensal, ou quando a regra só paga avulso e este
 * serviço veio do plano. Zero é uma resposta legítima aqui: significa "este
 * jazigo já está dentro do fixo do mês".
 */
export function valorDoServico(regra: Regra, opts: { receita: number; avulso: boolean }): number {
  if (!regra) return 0;
  if (regra.modo === "mensal") return 0;
  if (regra.so_avulso && !opts.avulso) return 0;

  if (regra.base_jazigo === "percentual") {
    return r2((Number(opts.receita) || 0) * (Number(regra.percentual_receita) || 0) / 100);
  }
  return r2(Number(regra.valor_por_jazigo) || 0);
}

/** um serviço é avulso quando não nasceu de um plano periódico */
export function ehAvulso(servico: { origem?: string | null }): boolean {
  // AVULSO E `origem = 'pedido'` (0128).
  //
  // A regra antiga era `!plano_id`, e desde a 0100 ela responde "sim" para toda
  // lavagem de contrato — o gerador escreve plano_id null de proposito. Isto
  // aqui decide PAGAMENTO: uma regra com `so_avulso`, ou com valor diferente
  // para avulso, pagaria a Nina pelo balde errado. Nao custou nada ate hoje
  // so porque `remuneracao_regras` esta vazia.
  return servico?.origem === "pedido";
}

/**
 * Carimba `valor_executora` num serviço recém-concluído.
 *
 * Roda depois da conclusão e NUNCA derruba a resposta: se a tabela de regras
 * ainda não existir (migration 0031 não rodada), engole o erro e segue. A
 * conclusão da limpeza é mais importante que o carimbo — e o botão
 * "recalcular os não pagos" no painel conserta depois.
 */
export async function carimbarRemuneracao(
  db: SupabaseClient,
  args: {
    servicoId: string;
    orgId: string;
    executoraId: string | null;
    receita: number;
    avulso: boolean;
  }
): Promise<number | null> {
  try {
    if (!args.executoraId) return null;
    const regras = await carregarRegras(db, args.orgId);
    const valor = valorDoServico(regras.para(args.executoraId), {
      receita: args.receita,
      avulso: args.avulso,
    });
    await db.from("servicos").update({ valor_executora: valor }).eq("id", args.servicoId);
    return valor;
  } catch {
    return null;
  }
}
