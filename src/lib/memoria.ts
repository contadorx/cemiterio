/**
 * DATAS DE MEMÓRIA — falecimento e nascimento são guardados como MM-DD.
 *
 * O que importa é o DIA DO ANO (a mensagem de carinho sai todo ano, 7 dias
 * antes), então o ano não é guardado. Antes a rota fazia `slice(-5)` cego:
 * quem digitasse "23-07-1998" gravava "-1998" no banco e a ficha ficava
 * eternamente "com alteração não salva". Aqui a conversão é explícita e
 * recusa o que não entende, para o erro aparecer na tela e não no dado.
 *
 * Aceita: MM-DD · AAAA-MM-DD · DD/MM/AAAA · DD/MM · DD.MM.AAAA
 * Devolve MM-DD, ou null se não der para entender.
 */
export function normalizarMMDD(valor: any): string | null {
  const s = String(valor ?? "").trim();
  if (!s) return "";

  const valida = (mes: string, dia: string) => {
    const m = Number(mes), d = Number(dia);
    if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
    return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };

  let g = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);          // AAAA-MM-DD
  if (g) return valida(g[2], g[3]);

  g = s.match(/^(\d{1,2})-(\d{1,2})$/);                       // MM-DD
  if (g) return valida(g[1], g[2]);

  g = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);         // DD/MM/AAAA
  if (g) return valida(g[2], g[1]);

  g = s.match(/^(\d{1,2})[/.](\d{1,2})$/);                    // DD/MM
  if (g) return valida(g[2], g[1]);

  return null;
}

/**
 * DATA DE MEMÓRIA COM ANO — para a tabela `falecidos` (0095).
 *
 * `normalizarMMDD` acima é do formato VELHO (`tumulos.datas_gatilho`), que
 * guardava só o dia do ano. Ele continua aqui porque a coluna ainda existe,
 * mas não recebe mais escrita nova: quem grava data de falecido é esta função.
 *
 * O ANO É O QUE MUDA TUDO. Sem ele:
 *   · "completam-se {{anos}} anos" não tem número
 *   · o marco de 1 ano não existe
 *   · e a zona de silêncio do luto — < 90 dias bloqueia tudo, < 6 meses
 *     bloqueia oferta — é uma conta impossível
 *
 * A última é a que não dá para negociar. Mandar oferta de serviço para quem
 * enterrou alguém há seis semanas é o erro que não se desfaz.
 *
 * Aceita: AAAA-MM-DD · DD/MM/AAAA · DD.MM.AAAA
 * Devolve "AAAA-MM-DD", "" para vazio (apagar), ou null se não entendeu.
 */
export function lerDataDeMemoria(valor: any): string | null {
  const s = String(valor ?? "").trim();
  if (!s) return "";

  const montar = (ano: string, mes: string, dia: string): string | null => {
    const a = Number(ano), m = Number(mes), d = Number(dia);
    if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
    // Uma data de nascimento em 1780, ou num ano à frente de hoje, não é
    // digitação — é engano. O limite de baixo é folgado de propósito: há
    // lápides de 1800.
    if (!(a >= 1800 && a <= new Date().getFullYear())) return null;
    const iso = `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // 31/02 passa nas faixas acima e não existe no calendário. Só o próprio
    // Date sabe disso — e se ele "consertar" para 03/03, a data está errada.
    const teste = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(teste.getTime()) || teste.getUTCDate() !== d || teste.getUTCMonth() + 1 !== m) {
      return null;
    }
    return iso;
  };

  let g = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);            // AAAA-MM-DD
  if (g) return montar(g[1], g[2], g[3]);

  g = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);          // DD/MM/AAAA
  if (g) return montar(g[3], g[2], g[1]);

  return null;
}

/**
 * O quanto se sabe da data. É o enum `sureya_precisao_data` (0095).
 *
 * Não é enfeite de cadastro: o motor só dispara em `dia`. "Faleceu em 1998",
 * sem mês nem dia, viraria um lembrete em 1º de janeiro — uma data inventada
 * pelo sistema, mandada para quem perdeu alguém.
 */
export const PRECISOES = ["dia", "mes_ano", "ano", "desconhecida"] as const;
export type Precisao = (typeof PRECISOES)[number];

export const PRECISAO_ROTULO: Record<string, string> = {
  dia: "dia certo",
  mes_ano: "só o mês e o ano",
  ano: "só o ano",
  desconhecida: "não se sabe",
};

/* ------------------------------------------------------------------------ */
/*  O MOTOR DE DATAS — o lado servidor                                       */
/* ------------------------------------------------------------------------ */

import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

export interface ResumoMemoria {
  criados: number; ja_existiam: number; sem_data: number;
  enfileirados: number; suprimidos: number; agrupados: number;
  por_luto: number; por_frequencia: number; sem_chave: number;
  desligado?: boolean;
}

/**
 * A ROTINA DIÁRIA DE MEMÓRIA.
 *
 * Duas etapas, nesta ordem e por um motivo:
 *
 *   1. `sureya_gerar_eventos_memoria` desenha o CALENDÁRIO — todas as datas
 *      dos próximos ~13 meses viram linhas `previsto`. É convergente: rodar
 *      de novo não duplica.
 *   2. `sureya_lembretes_do_dia` DECIDE o dia de hoje — aplica as quatro
 *      supressões obrigatórias e enfileira o que sobrou.
 *
 * A separação é o que permite a tela "próximas datas" existir: o calendário
 * é conhecido com meses de antecedência, e a decisão é do dia. Sem a etapa 1
 * não haveria o que mostrar; sem a 2, a decisão viraria um efeito colateral
 * de abrir uma tela.
 *
 * ⚠ `p_org` NÃO É OPCIONAL AQUI, embora a função aceite nulo.
 *
 * As duas resolvem a organização por `current_org_id()`, que é
 * `select org_id from membros where user_id = auth.uid()`. O cron roda com a
 * service role: `auth.uid()` é nulo. Sem passar a organização explicitamente,
 * a chamada morre em `sem_organizacao` — foi por isso que a 0103 acrescentou
 * o parâmetro.
 *
 * NADA É ENVIADO AQUI. O que sai da etapa 2 entra em `fila_liberacao`, que é
 * a porta única desde a 0094. Alguém lê e libera. "Disparo nunca automático"
 * não é uma preferência de configuração — é a regra da casa, e o motor não
 * tem caminho para furá-la.
 */
export async function rotinaDeMemoria(): Promise<ResumoMemoria> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const zero: ResumoMemoria = {
    criados: 0, ja_existiam: 0, sem_data: 0,
    enfileirados: 0, suprimidos: 0, agrupados: 0,
    por_luto: 0, por_frequencia: 0, sem_chave: 0,
  };

  // A CHAVE GERAL VEM DESLIGADA DE FÁBRICA (0096). Enquanto a casa não a
  // liga, a rotina não desenha calendário nem decide nada — e diz que não
  // fez, em vez de devolver zeros que parecem "dia sem datas".
  const { data: o } = await db
    .from("orgs").select("lembretes_memoria").eq("id", org).maybeSingle();
  if (!(o as any)?.lembretes_memoria) return { ...zero, desligado: true };

  const { data: g } = await db.rpc("sureya_gerar_eventos_memoria", {
    p_dias_a_frente: 400, p_org: org,
  });
  const { data: d } = await db.rpc("sureya_lembretes_do_dia", {
    p_dia: null, p_org: org,
  });

  const linha = (x: any) => (Array.isArray(x) ? x[0] : x) || {};
  return { ...zero, ...linha(g), ...linha(d) };
}
