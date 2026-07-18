import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

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
  const hoje = new Date().toISOString().slice(0, 10);

  let q = db
    .from("servicos")
    .select("id,status,adiado_vezes,tumulos(identificacao,falecido_nome,datas_gatilho,rua,foto_referencia_url,lat,quadras(codigo))")
    .eq("org_id", org)
    .eq("data_prevista", hoje);
  if (executoraId) q = q.or(`executora_id.eq.${executoraId},executora_id.is.null`);

  const { data: lista } = await q;
  const todos = (lista || []) as any[];
  const feitos = todos.filter((s) => s.status === "executado").length;
  const pendentes = todos.filter((s) => s.status !== "executado");

  const quadras = [...new Set(todos.map((s) => s.tumulos?.quadras?.codigo).filter(Boolean))].sort();
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
    precisamAtencao,
    materiaisAcabando: materiais.length,
    materiais,
  };
}
