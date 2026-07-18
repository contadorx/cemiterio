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
    .select("id,cliente_id,aberta,escalada_humano,ultimo_assunto,updated_at,resolvida,arquivada_em,tipo,fixada,membro_id,clientes(nome,telefone)")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (situacao === "arquivadas") sel = sel.not("arquivada_em", "is", null);
  else sel = sel.is("arquivada_em", null);

  if (situacao === "escaladas") sel = sel.eq("escalada_humano", true);
  if (situacao === "resolvidas") sel = sel.eq("resolvida", true);
  if (situacao === "pendentes") sel = sel.eq("resolvida", false);

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

  // "pendentes" de verdade: com rascunho a aprovar OU escalada.
  // A caixa da equipe nunca é filtrada — ela fica sempre visível.
  if (situacao === "pendentes") {
    lista = lista.filter((c: any) => c.tipo === "equipe" || comRascunho.has(c.id) || c.escalada_humano);
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
    rascunhoPendente: comRascunho.has(c.id),
    ultima: ultima.get(c.id) || null,
  }));

  // contadores para os botões de filtro
  const { count: nPend } = await db.from("conversas")
    .select("id", { count: "exact", head: true }).is("arquivada_em", null).eq("resolvida", false);
  const { count: nEsc } = await db.from("conversas")
    .select("id", { count: "exact", head: true }).is("arquivada_em", null).eq("escalada_humano", true);
  const { count: nArq } = await db.from("conversas")
    .select("id", { count: "exact", head: true }).not("arquivada_em", "is", null);

  // a caixa da equipe sempre no topo
  conversas.sort((a: any, b: any) => {
    if (a.fixada !== b.fixada) return a.fixada ? -1 : 1;
    return String(b.atualizada).localeCompare(String(a.atualizada));
  });

  return NextResponse.json({
    ok: true,
    conversas,
    contadores: { pendentes: nPend || 0, escaladas: nEsc || 0, arquivadas: nArq || 0 },
  });
}
