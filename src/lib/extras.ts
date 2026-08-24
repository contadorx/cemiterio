import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * FLORES E OUTROS EXTRAS — a esteira (0117).
 *
 * O QUE ESTA ESTEIRA É, E O QUE ELA NÃO É
 * ---------------------------------------------------------------------------
 * Ela NÃO é a agenda. A agenda é da lavagem: tem alocador que mede capacidade
 * por duração, tem a Nina executando, tem o painel contando "lavagens
 * executadas". Flor não entra ali — foi decisão do Leandro (rota própria) e é
 * o desenho certo por dentro: `servicos` significa lavagem em quinze lugares,
 * e uma flor contada como lavagem calaria o aviso de jazigo cobrado sem
 * limpeza.
 *
 * Ela É uma lista de datas que ainda não aconteceram, que vira dinheiro só
 * quando acontecem.
 *
 * ⚠ `p_org` explícito em tudo: `current_org_id()` lê `auth.uid()`, que é nulo
 * na service role do cron. Lição da 0103.
 */

export interface ResumoEsteira {
  criadas: number;
  assinaturas: number;
  proxima: string | null;
}

/**
 * ENCHE A ESTEIRA até o horizonte. Roda no cron diário.
 *
 * CONVERGENTE: a trava é um índice único `(tumulo_id, extra_id, data_prevista)`,
 * então rodar dez vezes no mesmo dia dá o mesmo resultado. Isso importa porque
 * o dia em que ela deixar de ser convergente é o dia em que o Leandro compra
 * buquê a mais — e ninguém confere buquê a mais, só falta.
 */
export async function gerarEsteiraDeExtras(ate?: string): Promise<ResumoEsteira> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("sureya_gerar_entregas_extras", {
    p_ate: ate ?? null,
    p_org: env.orgId(),
  });
  if (error) throw new Error(`esteira_indisponivel: ${error.message}`);
  const l = (Array.isArray(data) ? data[0] : data) || {};
  return {
    criadas: Number((l as any).criadas) || 0,
    assinaturas: Number((l as any).assinaturas) || 0,
    proxima: (l as any).proxima ?? null,
  };
}

export interface Compra {
  de: string;
  ate: string;
  datas: {
    data: string;
    jazigos: number;
    itens: { nome: string; unidade: string; quantidade: number; custo: number; preco: number }[];
    custo: number;
    preco: number;
  }[];
  custo: number;
  preco: number;
  margem: number;
  entregas: number;
}

/**
 * A PREVISÃO DE COMPRA — o papel que se leva para a floricultura.
 *
 * Agrupa por data e por item porque é assim que se compra: "sábado 27, seis
 * buquês frescos e dois arranjos". Uma linha por jazigo seria a lista da rota,
 * que é outra pergunta e já está na esteira.
 *
 * Conta só o que está PREVISTO: o que já foi entregue sai da conta sozinho, ou
 * o Leandro compraria de novo o que já pôs.
 */
export async function preverCompras(de?: string, ate?: string): Promise<Compra> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("sureya_compras_de_extras", {
    p_de: de ?? null, p_ate: ate ?? null, p_org: env.orgId(),
  });
  if (error) throw new Error(`compras_indisponiveis: ${error.message}`);
  return (data || { datas: [], custo: 0, preco: 0, margem: 0, entregas: 0 }) as Compra;
}

/** 0 = domingo … 6 = sábado. Escrito por extenso porque a tela e a mensagem leem daqui. */
export const DIAS_DA_SEMANA = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
] as const;

/**
 * O RITMO EM UMA FRASE — "todo último sábado do mês".
 *
 * A tela mostra isto e a conferência lê isto. Um combinado que só existe como
 * `{dia_semana: 6, semanas: [-1]}` é um combinado que ninguém confere.
 */
export function descreverRitmo(diaSemana: number, semanas: number[]): string {
  const dia = DIAS_DA_SEMANA[diaSemana] ?? "dia";
  const s = [...(semanas || [])].sort((a, b) => a - b);
  if (!s.length) return dia;
  if (s.length >= 5 || (s.length === 4 && !s.includes(-1))) return `todo ${dia}`;
  if (s.length === 1 && s[0] === -1) return `todo último ${dia} do mês`;

  const ordinal = (n: number) => (n === -1 ? "último" : `${n}º`);
  const nomes = s.map(ordinal);
  const ultimo = nomes.pop();
  return nomes.length
    ? `${nomes.join(", ")} e ${ultimo} ${dia} do mês`
    : `${ultimo} ${dia} do mês`;
}
