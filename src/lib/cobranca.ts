import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

export interface ResumoCobranca {
  lancados: number;
  valor_total: number;
  tumulos_tocados: number;
}

/**
 * A COBRANÇA DO CONTRATO — a rotina diária (0104).
 *
 * O QUE MUDOU, e por que isto é uma função e não um efeito da limpeza.
 *
 * Até a 0104 quem gerava dívida era a LAVAGEM: cada limpeza executada lançava
 * um débito. Isso fazia o razão responder por duas perguntas ao mesmo tempo —
 * *quanto a família deve* e *quais limpezas aconteceram* — e a segunda escrevia
 * na primeira:
 *
 *   · uma limpeza adiada barateava o mês
 *   · uma limpeza anotada em atraso virava dívida retroativa
 *   · e o contrato, que é o que a família combinou pagar, ficava sendo o
 *     RESULTADO da operação em vez do combinado
 *
 * Agora a dívida é do CONTRATO, lançada por competência, e a limpeza é
 * entrega. As duas caminham em separado — que era exatamente o pedido.
 *
 * CONVERGENTE. Roda toda manhã e não cobra duas vezes: a trava é um índice
 * único `(tumulo_id, competencia) where origem='competencia'`, e a data só
 * anda quando a linha entra. Meses parados são cobrados UM A UM, cada um na
 * sua competência — somar tudo num lançamento de hoje faria o relatório por
 * competência mentir, que é o relatório que a Sureya confere.
 *
 * ⚠ `p_org` explícito: `current_org_id()` lê `auth.uid()`, que é nulo na
 * service role do cron. É a mesma lição da 0103.
 */
export async function cobrarContratos(): Promise<ResumoCobranca> {
  const db = supabaseAdmin();
  const { data } = await db.rpc("sureya_cobrar_competencias", {
    p_ate: null, p_org: env.orgId(),
  });
  const l = (Array.isArray(data) ? data[0] : data) || {};
  return {
    lancados: Number((l as any).lancados) || 0,
    valor_total: Number((l as any).valor_total) || 0,
    tumulos_tocados: Number((l as any).tumulos_tocados) || 0,
  };
}

export interface ResumoRegua {
  enfileirados: number; ja_existiam: number; sem_degrau: number;
  sem_saldo: number; por_limite_diario: number;
  /** Devia ser cobrado e não tem número no cadastro (0116). */
  sem_telefone: number;
}

/**
 * A RÉGUA DO DIA (0111).
 *
 * Percorre as competências em aberto e, para cada degrau que caiu hoje, põe
 * uma mensagem na FILA DE LIBERAÇÃO.
 *
 * ⚠ NÃO ENVIA NADA. Não existe caminho daqui para o WhatsApp — é a fila que é
 * a porta, e ela só sai por comando de quem lê. "O disparo é manual pela fila
 * do conversas" não é uma preferência: é a regra da casa.
 *
 * Roda DEPOIS de `cobrarContratos()` de propósito: a régua persegue dívida, e
 * a dívida de hoje pode ter nascido na etapa anterior desta mesma rotina.
 */
export async function rodarRegua(): Promise<ResumoRegua> {
  const db = supabaseAdmin();
  const { data } = await db.rpc("sureya_regua_do_dia", {
    p_dia: null, p_org: env.orgId(),
  });
  const l = (Array.isArray(data) ? data[0] : data) || {};
  // OS NOMES SÃO OS DA FUNÇÃO, e não os que eu gostaria que fossem.
  //
  // Três destes liam chaves que a `sureya_regua_do_dia` nunca devolveu
  // (`ja_existiam`, `sem_saldo`, `por_limite_diario`), e por isso o relatório
  // do cron dizia zero em três dos cinco contadores desde a 0111 — inclusive
  // no que conta cobrança que deixou de sair.
  return {
    enfileirados: Number((l as any).enfileirados) || 0,
    ja_existiam: Number((l as any).ja_enfileirados) || 0,
    sem_degrau: Number((l as any).sem_degrau) || 0,
    sem_saldo: Number((l as any).ja_pagos) || 0,
    por_limite_diario: Number((l as any).limitados) || 0,
    // Cadastro sem número: quem devia ser cobrado e não tem como (0116).
    sem_telefone: Number((l as any).sem_telefone) || 0,
  };
}
