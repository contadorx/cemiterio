import { supabaseAdmin } from "./supabase-admin";
import { gerarCompetenciaDoMes, competenciaDe, type TumuloCobranca } from "./conta-corrente";

/**
 * O FECHAMENTO DA COMPETÊNCIA, do lado do servidor.
 *
 * Vive aqui — e não dentro da rota HTTP — porque dois donos precisam dele: o
 * cron do dia 1 e o botão da tela de Financeiro. Duplicar a regra em dois
 * lugares é como uma delas acaba divergindo da outra sem ninguém notar, e
 * essa em particular mexe em dinheiro.
 *
 * POR QUE POR COMPETÊNCIA, E NÃO PELA LAVAGEM EXECUTADA
 * A lavagem falha de maneiras honestas: a foto não sobe, o celular fica sem
 * sinal no cemitério, a Nina esquece de tocar no botão. Se o débito nascesse
 * do registro do serviço, cada uma dessas falhas viraria dinheiro perdido em
 * silêncio.
 */

export interface ResultadoCompetencia {
  competencia: string;
  lancados: number;
  repetidos: number;
  total: number;
}

async function planosDoMes(org: string, competencia: string) {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("tumulos")
    .select("id,familia_id,valor_lavagem,periodicidade,freq_pagamento,contratado,created_at")
    .eq("org_id", org)
    .eq("contratado", true)
    .not("familia_id", "is", null);

  if (error) throw new Error(error.message);

  const tumulos: TumuloCobranca[] = (data || []).map((t: any) => ({
    tumuloId: t.id,
    familiaId: t.familia_id,
    contratado: true,
    valorLavagem: Number(t.valor_lavagem || 0),
    periodicidade: t.periodicidade,
    freqPagamento: t.freq_pagamento,
  }));

  // O mês em que o plano começou é a âncora do ciclo: um plano anual assinado
  // em março cobra em março, não em janeiro.
  const mesInicial: Record<string, number> = {};
  for (const t of (data || []) as any[]) {
    mesInicial[t.id] = new Date(t.created_at).getMonth() + 1;
  }

  return gerarCompetenciaDoMes(tumulos, competencia, mesInicial);
}

/** Só olha, não grava. Alimenta a prévia da tela. */
export async function previewCompetencia(org: string, competencia?: string) {
  const db = supabaseAdmin();
  const comp = competencia || competenciaDe(new Date());
  const lancamentos = await planosDoMes(org, comp);

  const { data: jaFeitos } = await db
    .from("conta_corrente")
    .select("tumulo_id")
    .eq("competencia", comp)
    .eq("origem", "competencia");

  const feitos = new Set((jaFeitos || []).map((x: any) => x.tumulo_id));
  const novos = lancamentos.filter((l) => !feitos.has(l.tumuloId));

  return {
    competencia: comp,
    novos: novos.length,
    jaLancados: lancamentos.length - novos.length,
    total: Math.round(novos.reduce((s, l) => s + l.valor, 0) * 100) / 100,
    lancamentos: novos,
  };
}

/**
 * Grava os débitos do período.
 *
 * Os inserts vão UM A UM, de propósito. Em lote, um único conflito derrubaria
 * a transação inteira e o mês ficaria sem cobrança nenhuma — o erro mais caro
 * possível. Assim o que já existia é pulado e o resto entra.
 *
 * A trava contra cobrar duas vezes não está aqui: está no índice único
 * (tumulo_id, competencia). Regra de dinheiro se garante no banco.
 */
export async function fecharCompetencia(
  org: string,
  competencia?: string
): Promise<ResultadoCompetencia> {
  const db = supabaseAdmin();
  const comp = competencia || competenciaDe(new Date());
  const lancamentos = await planosDoMes(org, comp);

  let lancados = 0;
  let repetidos = 0;
  let total = 0;

  for (const l of lancamentos) {
    const { error } = await db.from("conta_corrente").insert({
      org_id: org,
      familia_id: l.familiaId,
      tumulo_id: l.tumuloId,
      tipo: "debito",
      origem: "competencia",
      competencia: l.competencia,
      valor: l.valor,
      descricao: l.descricao,
      data: comp,
    });

    if (!error) { lancados++; total += l.valor; }
    else if (error.code === "23505") repetidos++;   // já cobrado: o banco barrou
    else throw new Error(error.message);
  }

  return { competencia: comp, lancados, repetidos, total: Math.round(total * 100) / 100 };
}
