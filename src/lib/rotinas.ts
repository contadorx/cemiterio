import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * O CARIMBO DAS ROTINAS AUTOMÁTICAS.
 *
 * Antes disto, o sistema só registrava ERRO. "Nunca rodou" e "rodou perfeito"
 * davam na mesma tela verde de Config → Diagnóstico. Aqui a rotina diz que
 * passou por ali, e o painel pode cobrar quando ela some.
 *
 * Nunca lança: um problema no carimbo não pode derrubar a rotina que ele mede.
 */

export type ChaveRotina = "minuto" | "diario" | "convites" | "perfis" | "webhook";

/** Quanto tempo cada rotina pode ficar em silêncio antes de virar aviso. */
export const LIMITE_MINUTOS: Record<ChaveRotina, number> = {
  // roda a cada minuto; 15 min de silêncio já é problema
  minuto: 15,
  // uma vez por dia; 26h dá folga para atraso da plataforma
  diario: 26 * 60,
  convites: 26 * 60,
  perfis: 26 * 60,
  // o webhook depende de a FAMÍLIA escrever. Silêncio aqui pode ser só um dia
  // calmo — por isso o limite é longo e o texto no painel é ameno.
  webhook: 48 * 60,
};

export const NOME_ROTINA: Record<ChaveRotina, string> = {
  minuto: "Respostas e envios (a cada minuto)",
  diario: "Agenda e cobranças (todo dia, de manhã)",
  convites: "Convites e avaliações (todo dia, à tarde)",
  perfis: "Perfis das famílias (todo dia, de madrugada)",
  webhook: "Chegada de mensagens do WhatsApp",
};

/** O que quebra na prática quando cada uma para. Texto para o painel. */
export const IMPACTO_ROTINA: Record<ChaveRotina, string> = {
  minuto: "As respostas param na fila e as fotos não saem para as famílias.",
  diario: "A agenda para de ser criada — a Nina fica sem serviço e a família sem limpeza.",
  convites: "Convites de data e pedidos de avaliação deixam de sair.",
  perfis: "Só o aprendizado da IA sobre as famílias fica desatualizado.",
  webhook: "Mensagem de família pode estar chegando e não entrando no sistema.",
};

export async function carimbarRotina(
  chave: ChaveRotina,
  ok: boolean,
  resumo?: Record<string, any>,
  erro?: string,
): Promise<void> {
  try {
    const db = supabaseAdmin();
    const agora = new Date().toISOString();
    await db.from("rotinas").upsert(
      {
        org_id: env.orgId(),
        chave,
        ultima_tentativa: agora,
        ...(ok ? { ultimo_sucesso: agora } : {}),
        ok,
        resumo: resumo || null,
        ultimo_erro: ok ? null : String(erro || "").slice(0, 500),
      },
      { onConflict: "org_id,chave" },
    );
  } catch (e) {
    console.error("[rotinas] não consegui carimbar:", (e as any)?.message || e);
  }
}
