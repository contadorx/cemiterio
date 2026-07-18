import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

export interface Briefing {
  saudacao: string;
  totalHoje: number;
  quadras: string[];
  atencoes: string[];   // avisos que mudam o cuidado do dia
  materiais: string[];  // o que está acabando
  pendencias: number;   // backlog acumulado
  meta: string;
}

function saudacaoDaHora(): string {
  const h = new Date().getUTCHours() - 3; // BRT
  const hora = (h + 24) % 24;
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

// Monta a orientação do dia para a ajudante: o que tem, onde, e o que exige atenção.
export async function montarBriefing(executoraId: string | null, nome?: string): Promise<Briefing> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const hoje = new Date().toISOString().slice(0, 10);

  let q = db
    .from("servicos")
    .select("id,status,adiado_vezes,tumulos(identificacao,falecido_nome,datas_gatilho,quadras(codigo)),clientes(nome)")
    .eq("org_id", org)
    .eq("data_prevista", hoje)
    .in("status", ["pendente", "agendado", "executado"]);
  if (executoraId) q = q.or(`executora_id.eq.${executoraId},executora_id.is.null`);
  const { data: servs } = await q;

  const lista = servs || [];
  const pendentesHoje = lista.filter((s: any) => s.status !== "executado");

  // quadras do dia
  const quadras = [...new Set(lista.map((s: any) => s.tumulos?.quadras?.codigo).filter(Boolean))].sort();

  // atenções: datas de memória próximas, serviços já adiados, clientes que pedem capricho
  const atencoes: string[] = [];
  const jaAvisado = new Set<string>();   // evita repetir o alerta do mesmo túmulo
  const alvo = new Date(Date.now() + 7 * 86400000);
  const mmddAlvo = `${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(alvo.getDate()).padStart(2, "0")}`;

  for (const s of lista as any[]) {
    if (s.status === "executado") continue;
    const t = s.tumulos;
    if (!t) continue;

    const datas = Array.isArray(t.datas_gatilho) ? t.datas_gatilho : [];
    for (const d of datas) {
      const mmdd = String(d?.data || "").slice(-5);
      if (mmdd && mmdd <= mmddAlvo && mmdd >= new Date().toISOString().slice(5, 10)) {
        if (!jaAvisado.has(`mem:${t.identificacao}`)) {
          jaAvisado.add(`mem:${t.identificacao}`);
          atencoes.push(
            `${t.identificacao} (${t.quadras?.codigo || "?"}): data de memória chegando — capriche, a família pode visitar.`
          );
        }
        break;
      }
    }
    if ((s.adiado_vezes || 0) >= 2 && !jaAvisado.has(`adi:${t.identificacao}`)) {
      jaAvisado.add(`adi:${t.identificacao}`);
      atencoes.push(`${t.identificacao}: já ficou pra depois ${s.adiado_vezes}x — prioridade hoje.`);
    }
  }

  // materiais acabando
  const { data: mats } = await db
    .from("materiais")
    .select("nome,estoque,alerta_minimo,unidade")
    .eq("org_id", org);
  const materiais = (mats || [])
    .filter((m: any) => Number(m.estoque) <= Number(m.alerta_minimo))
    .map((m: any) => `${m.nome} (${m.estoque} ${m.unidade})`);

  // backlog acumulado (sem data)
  const { count: backlog } = await db
    .from("servicos")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org)
    .eq("status", "pendente")
    .is("data_prevista", null);

  const total = pendentesHoje.length;
  const meta =
    total === 0
      ? "Hoje não há túmulos na sua rota."
      : total <= 5
      ? `São ${total} — dia tranquilo.`
      : total <= 15
      ? `São ${total} túmulos hoje.`
      : `São ${total} túmulos — dia cheio, vá com calma e com água.`;

  return {
    saudacao: `${saudacaoDaHora()}${nome ? `, ${nome}` : ""}!`,
    totalHoje: total,
    quadras: quadras as string[],
    atencoes: atencoes.slice(0, 5),
    materiais,
    pendencias: backlog || 0,
    meta,
  };
}
