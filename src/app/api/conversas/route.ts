import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista de conversas com filtros de gestão.
 * ?situacao = pendentes | escaladas | resolvidas | arquivadas | todas
 * ?assunto  = cobranca | agendamento | duvida | luto | reclamacao | outro
 * ?busca    = nome ou telefone
 * ?de / ?ate = período (data da última movimentação)
 */
/**
 * O estado vem PRONTO do banco (coluna conversas.estado, mantida por gatilho).
 *
 * Antes era calculado aqui comparando respondida_em > ultima_msg_cliente_em, e
 * isso falhava: no Postgres now() devolve o horário do início da transação, então
 * responder logo após a mensagem chegar deixava os dois horários iguais — e a
 * conversa continuava aparecendo como "esperando resposta" mesmo já respondida.
 */
function estadoDa(c: any): string {
  return c.estado || "sem_movimento";
}

/**
 * Quem "precisa de você". Esta regra tem que ser a MESMA usada pelo contador —
 * senão a aba diz (1) e a lista vem vazia, que foi o que aconteceu.
 * A versão em SQL está em sureya_contadores_conversas().
 */
function precisaDeVoce(c: any, temRascunho: boolean): boolean {
  return (
    c.tipo === "equipe" ||
    temRascunho ||
    !!c.escalada_humano ||
    ["sem_resposta", "lida_sem_resposta"].includes(estadoDa(c))
  );
}

/** Há quanto tempo a família espera. */
function esperaDe(c: any): string | null {
  if (!c.ultima_msg_cliente_em) return null;
  const resposta = c.respondida_em ? new Date(c.respondida_em).getTime() : 0;
  const familia = new Date(c.ultima_msg_cliente_em).getTime();
  if (resposta > familia) return null;

  const min = Math.floor((Date.now() - familia) / 60000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const q = req.nextUrl.searchParams;

  const situacao = q.get("situacao") || "pendentes";
  const assunto = q.get("assunto") || "";
  const busca = (q.get("busca") || "").trim().toLowerCase();
  const de = q.get("de") || "";
  const ate = q.get("ate") || "";

  let sel = db
    .from("conversas")
    .select("id,cliente_id,aberta,escalada_humano,ultimo_assunto,updated_at,resolvida,arquivada_em,tipo,fixada,membro_id,ultimo_autor,ultima_msg_em,aguardando_desde,respondida_em,estado,ultima_msg_cliente_em,lida_em,clientes(nome,telefone,foto_url)")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (situacao === "arquivadas") sel = sel.not("arquivada_em", "is", null);
  else sel = sel.is("arquivada_em", null);

  if (situacao === "escaladas") sel = sel.eq("escalada_humano", true);
  if (situacao === "resolvidas") sel = sel.eq("resolvida", true);
  if (situacao === "pendentes") sel = sel.eq("resolvida", false);
  if (situacao === "sem_resposta") sel = sel.in("estado", ["sem_resposta", "lida_sem_resposta"]);
  if (situacao === "aguardando") sel = sel.in("estado", ["sem_resposta", "lida_sem_resposta"]);

  if (assunto) sel = sel.eq("ultimo_assunto", assunto);
  if (de) sel = sel.gte("updated_at", de);
  if (ate) sel = sel.lte("updated_at", ate + "T23:59:59");

  const { data: convs } = await sel;
  let lista = convs || [];

  if (busca) {
    lista = lista.filter((c: any) => {
      const n = String(c.clientes?.nome || "").toLowerCase();
      const t = String(c.clientes?.telefone || "");
      return n.includes(busca) || t.includes(busca);
    });
  }

  const ids = lista.map((c: any) => c.id);

  const ultima = new Map<string, { texto: string; autor: string }>();
  if (ids.length) {
    const { data: msgs } = await db
      .from("mensagens")
      .select("conversa_id,texto,autor,created_at")
      .in("conversa_id", ids)
      .order("created_at", { ascending: false });
    for (const m of msgs || []) {
      if (!ultima.has((m as any).conversa_id)) {
        ultima.set((m as any).conversa_id, { texto: (m as any).texto || "", autor: (m as any).autor });
      }
    }
  }

  const comRascunho = new Set<string>();
  if (ids.length) {
    const { data: rasc } = await db
      .from("interacoes_ia")
      .select("conversa_id")
      .in("conversa_id", ids)
      .is("acao_humana", null);
    for (const r of rasc || []) comRascunho.add((r as any).conversa_id);
  }

  // quem espera há mais tempo aparece antes
  lista.sort((a: any, b: any) => {
    const ea = a.aguardando_desde ? new Date(a.aguardando_desde).getTime() : Infinity;
    const eb = b.aguardando_desde ? new Date(b.aguardando_desde).getTime() : Infinity;
    return ea - eb;
  });

  // "pendentes" de verdade: com rascunho a aprovar OU escalada.
  // A caixa da equipe nunca é filtrada — ela fica sempre visível.
  if (situacao === "pendentes") {
    lista = lista.filter((c: any) => precisaDeVoce(c, comRascunho.has(c.id)));
  }

  // nome dos membros, para rotular a caixa da equipe
  const membroIds = lista.filter((c: any) => c.tipo === "equipe").map((c: any) => c.membro_id).filter(Boolean);
  const nomeMembro = new Map<string, string>();
  if (membroIds.length) {
    const { data: ms } = await db.from("membros").select("user_id,nome").in("user_id", membroIds);
    for (const m of ms || []) nomeMembro.set((m as any).user_id, (m as any).nome || "Equipe");
  }

  const conversas = lista.map((c: any) => ({
    id: c.id,
    tipo: c.tipo || "familia",
    fixada: !!c.fixada,
    cliente: c.tipo === "equipe"
      ? `${nomeMembro.get(c.membro_id) || "Equipe"} · campo`
      : c.clientes?.nome || "—",
    telefone: c.clientes?.telefone || "",
    assunto: c.ultimo_assunto,
    escalada: c.escalada_humano,
    resolvida: c.resolvida,
    arquivada: !!c.arquivada_em,
    atualizada: c.updated_at,
    estado: estadoDa(c),
    esperandoHa: esperaDe(c),
    rascunhoPendente: comRascunho.has(c.id),
    ultima: ultima.get(c.id) || null,
    foto: c.clientes?.foto_url || null,
    // estado: de quem é a bola?
    ultimoAutor: c.ultimo_autor || null,
    aguardandoDesde: c.aguardando_desde || null,
    respondidaEm: c.respondida_em || null,
    horasEsperando: c.aguardando_desde
      ? Math.floor((Date.now() - new Date(c.aguardando_desde).getTime()) / 3600000)
      : null,
  }));

  // contadores: uma função só no banco, com a MESMA regra da lista
  const { data: cont } = await db.rpc("sureya_contadores_conversas");
  const c0 = (Array.isArray(cont) ? cont[0] : cont) || {};
  const { count: semResposta } = await db.from("conversas")
    .select("id", { count: "exact", head: true })
    .is("arquivada_em", null)
    .in("estado", ["sem_resposta", "lida_sem_resposta"]);


  // a caixa da equipe sempre no topo
  conversas.sort((a: any, b: any) => {
    if (a.fixada !== b.fixada) return a.fixada ? -1 : 1;
    return String(b.atualizada).localeCompare(String(a.atualizada));
  });

  return NextResponse.json({
    ok: true,
    conversas,
    contadores: {
      pendentes: c0.pendentes || 0,
      aguardando: c0.aguardando || 0,
      escaladas: c0.escaladas || 0,
      arquivadas: c0.arquivadas || 0,
      resolvidas: c0.resolvidas || 0,
    },
  });
}
