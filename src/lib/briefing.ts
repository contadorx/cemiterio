import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { diaOperacao } from "./vencimento";

/**
 * BRIEFING DO DIA — curto e direto.
 *
 * A pessoa que abre isso está de pé, no portão do cemitério, com o celular numa
 * mão e o balde na outra. Então: uma saudação, quantos jazigos, e quantos pedem
 * atenção. O QUE pede atenção fica no card de cada jazigo, na hora de fazer —
 * que é quando a informação serve.
 */
export interface Briefing {
  saudacao: string;
  totalHoje: number;
  feitos: number;
  quadras: string[];
  // AS RUAS DO DIA — o que faltava para a frase do portão fazer sentido.
  // "Quadra 1" sozinho não diz para onde andar; "Quadra 1 — Ruas 3, 4 e 5"
  // diz, e ela se posiciona antes de dar o primeiro passo.
  ruas: string[];
  frase: string;              // "Quadra 1 — Ruas 3, 4 e 5"
  porRua: { rua: string; quantos: number }[];
  precisamAtencao: number;      // só o NÚMERO; o detalhe vai no card
  materiaisAcabando: number;
  materiais: string[];
}

/** Avisos de UM jazigo — vão no card dele, não no resumo. */
export interface AvisoJazigo {
  tipo: "memoria" | "adiado" | "primeira" | "atrasado";
  texto: string;
}

function saudacaoDaHora(): string {
  const h = Number(
    new Date().toLocaleString("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" })
  );
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Datas de memória chegando nos próximos 10 dias. */
function memoriaChegando(datas: any): string | null {
  const lista = Array.isArray(datas) ? datas : [];
  const hoje = new Date();
  for (const d of lista) {
    const mmdd = String(d?.data || "").slice(-5);
    if (!/^\d{2}-\d{2}$/.test(mmdd)) continue;
    const [m, dia] = mmdd.split("-").map(Number);
    const alvo = new Date(hoje.getFullYear(), m - 1, dia);
    const faltam = Math.floor((alvo.getTime() - hoje.getTime()) / 86400000);
    if (faltam >= 0 && faltam <= 10) {
      return d?.tipo === "nascimento" ? "aniversário chegando" : "data de memória chegando";
    }
  }
  return null;
}

export function avisosDoJazigo(s: any): AvisoJazigo[] {
  const avisos: AvisoJazigo[] = [];
  const mem = memoriaChegando(s?.tumulos?.datas_gatilho);
  if (mem) avisos.push({ tipo: "memoria", texto: `${mem} — capriche, a família pode visitar` });
  if ((s?.adiado_vezes || 0) >= 2) {
    avisos.push({ tipo: "adiado", texto: `ficou pra depois ${s.adiado_vezes}x — hoje é prioridade` });
  }
  if (!s?.tumulos?.foto_referencia_url && !s?.tumulos?.lat) {
    avisos.push({ tipo: "primeira", texto: "primeira visita — tire a foto de longe pra achar depois" });
  }
  return avisos;
}

export async function montarBriefing(executoraId: string | null, nome: string): Promise<Briefing> {
  const db = supabaseAdmin();
  const org = env.orgId();
  // mesmo dia que a rota do campo e que o alocador usam (fuso de Sao Paulo)
  const hoje = diaOperacao();

  let q = db
    .from("servicos")
    .select("id,status,adiado_vezes,tumulos(identificacao,falecido_nome,datas_gatilho,rua,foto_referencia_url,lat,ruas(nome,ordem),quadras(codigo,cemiterios(nome)))")
    .eq("org_id", org)
    .eq("data_prevista", hoje);
  if (executoraId) q = q.or(`executora_id.eq.${executoraId},executora_id.is.null`);

  const { data: lista } = await q;
  const todos = (lista || []) as any[];
  const feitos = todos.filter((s) => s.status === "executado").length;
  const pendentes = todos.filter((s) => s.status !== "executado");

  // 0044 — com mais de um cemitério no dia, "Q-12, Q-3" não diz para onde ir.
  // Com um só, o texto continua exatamente como era.
  const cems = [...new Set(todos.map((s) => s.tumulos?.quadras?.cemiterios?.nome).filter(Boolean))];
  const quadras = [...new Set(
    todos.map((s) => {
      const q = s.tumulos?.quadras?.codigo;
      if (!q) return null;
      const c = s.tumulos?.quadras?.cemiterios?.nome;
      return cems.length > 1 && c ? `${c} · ${q}` : q;
    }).filter(Boolean),
  )].sort();
  // AS RUAS, na ordem em que se caminha — não na ordem do nome. A Rua 7 pode
  // ser a terceira a ser percorrida; quem manda é `ruas.ordem`, cadastrada uma
  // vez conforme o terreno.
  const ruasComOrdem = new Map<string, number>();
  const contagem = new Map<string, number>();
  for (const sv of pendentes) {
    const nome = (sv as any).tumulos?.ruas?.nome;
    if (!nome) continue;
    const ord = Number((sv as any).tumulos?.ruas?.ordem ?? 9999);
    if (!ruasComOrdem.has(nome)) ruasComOrdem.set(nome, ord);
    contagem.set(nome, (contagem.get(nome) || 0) + 1);
  }
  const ruas = [...ruasComOrdem.keys()].sort(
    (a, b) => (ruasComOrdem.get(a) || 0) - (ruasComOrdem.get(b) || 0),
  );
  const porRua = ruas.map((r) => ({ rua: r, quantos: contagem.get(r) || 0 }));

  // "Quadra 1 — Ruas 3, 4 e 5". Escrito para ser lido de pé, no portão, com o
  // celular numa mão: uma frase, sem lista para percorrer.
  const juntar = (itens: string[]) =>
    itens.length <= 1
      ? itens[0] || ""
      : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
  // Só abrevia para "Ruas 3, 4 e 5" quando TODAS são ruas numeradas. Com uma
  // transversal no meio, "Ruas 8 e Transversal 3" sairia torto — aí vale o
  // nome inteiro de cada uma.
  const soRuas = ruas.every((r) => /^Rua\s*\d+$/i.test(r));
  const trecho = !ruas.length
    ? ""
    : soRuas
      ? `${ruas.length > 1 ? "Ruas" : "Rua"} ${juntar(ruas.map((r) => r.replace(/^Rua\s*/i, "")))}`
      : juntar(ruas);
  const frase = [juntar(quadras as string[]), trecho].filter(Boolean).join(" — ");

  const precisamAtencao = pendentes.filter((s) => avisosDoJazigo(s).length > 0).length;

  const { data: mats } = await db
    .from("materiais").select("nome,estoque,alerta_minimo").eq("org_id", org);
  const materiais = (mats || [])
    .filter((m: any) => Number(m.estoque) <= Number(m.alerta_minimo))
    .map((m: any) => m.nome);

  const primeiro = (nome || "").trim().split(/\s+/)[0] || "";

  return {
    saudacao: `${saudacaoDaHora()}${primeiro ? `, ${primeiro}` : ""}!`,
    totalHoje: pendentes.length,
    feitos,
    quadras,
    ruas,
    frase,
    porRua,
    precisamAtencao,
    materiaisAcabando: materiais.length,
    materiais,
  };
}
