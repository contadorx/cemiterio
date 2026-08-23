import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AS CONVERSAS DE WHATSAPP, DENTRO DE CONTATOS.
 *
 * POR QUE ELAS ESTAVAM ESCONDIDAS, E POR QUE VOLTAM AQUI
 * ---------------------------------------------------------------------------
 * `/painel/conversas` foi desligada junto com o agente de IA — era uma tela de
 * CRM, com abas de leads, rascunhos da IA e gestão de atendimento. O que o
 * middleware desligou foi a tela; o webhook nunca parou: toda mensagem que
 * chega continua sendo gravada, o áudio continua sendo transcrito, e o que ela
 * responde direto do celular continua entrando como saída.
 *
 * Ou seja: a conversa existe e ninguém consegue ler. Voltar a tela inteira
 * traria o CRM junto. O que volta aqui é só o que serve para falar com quem já
 * é da casa.
 *
 * "SOMENTE DE CONTATOS E CELULARES REGISTRADOS" — e é assim por construção, não
 * por filtro:
 *
 *   · telefone que o sistema RECONHECE vira `conversas` + `mensagens`;
 *   · telefone que ele não reconhece vira `leads`.
 *
 * As duas coisas aparecem nesta lista, porque as duas são gente com quem a
 * casa já tem contato — o lead do site é justamente quem escreveu para cá. Quem
 * não está em nenhum dos dois lugares não existe para esta tela.
 */

type Fio = {
  chave: string;
  tipo: "cliente" | "lead";
  id: string;
  nome: string;
  telefone: string | null;
  ultima: string | null;
  ultimaEm: string | null;
  ultimoAutor: string | null;
  esperando: boolean;
  familiaId: string | null;
};

const so = (v: any) => String(v ?? "").trim();

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const busca = so(req.nextUrl.searchParams.get("q")).toLowerCase();

  // ---- 1. quem é da casa: conversas ligadas a um cliente com telefone -------
  const { data: convs } = await auth.db
    .from("conversas")
    .select("id,cliente_id,estado,ultimo_autor,ultima_msg_em,updated_at,tipo," +
            "clientes(nome,telefone,familia_id)")
    .eq("org_id", org)
    .not("cliente_id", "is", null)
    .order("ultima_msg_em", { ascending: false, nullsFirst: false })
    .limit(200);

  const lista = (convs || []) as any[];

  // O TEXTO DA ÚLTIMA MENSAGEM vem numa consulta só, e não uma por conversa.
  // Com duzentas conversas seriam duzentas idas ao banco para desenhar uma
  // linha de prévia cada.
  const ids = lista.map((c) => c.id);
  const ultimaDe = new Map<string, { texto: string; em: string; autor: string }>();
  if (ids.length) {
    const { data: msgs } = await auth.db
      .from("mensagens")
      .select("conversa_id,texto,autor,created_at")
      .in("conversa_id", ids)
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const m of (msgs || []) as any[]) {
      // A lista vem do mais novo para o mais velho: a primeira que aparece de
      // cada conversa É a última dela.
      if (!ultimaDe.has(m.conversa_id)) {
        ultimaDe.set(m.conversa_id, { texto: m.texto || "", em: m.created_at, autor: m.autor });
      }
    }
  }

  const fios: Fio[] = [];

  for (const c of lista) {
    const tel = c.clientes?.telefone || null;
    // Sem telefone não há conversa possível — e a promessa da tela é falar.
    if (!tel) continue;
    const u = ultimaDe.get(c.id);
    // CONVERSA SEM MENSAGEM NÃO É CONVERSA.
    //
    // São 162 linhas em `conversas` e apenas 15 com mensagem: a tabela ganhou
    // uma linha por família na época do agente de IA, escrevendo alguém ou não.
    // Listar todas encheria a tela com 147 nomes sem nada embaixo, e o que
    // importa — as cinco esperando resposta — sumiria no meio.
    if (!u) continue;
    fios.push({
      chave: `cliente:${c.id}`,
      tipo: "cliente",
      id: c.id,
      nome: c.clientes?.nome || "sem nome",
      telefone: tel,
      ultima: u?.texto || null,
      ultimaEm: u?.em || c.ultima_msg_em || c.updated_at || null,
      ultimoAutor: u?.autor || c.ultimo_autor || null,
      // ESPERANDO É O ESTADO QUE O BANCO MANTÉM por gatilho — não uma conta
      // refeita aqui. Recalcular na tela foi o que já fez uma conversa
      // respondida continuar aparecendo como pendente.
      esperando: ["sem_resposta", "lida_sem_resposta"].includes(String(c.estado || "")),
      familiaId: c.clientes?.familia_id || null,
    });
  }

  // ---- 2. quem escreveu e ainda não é da casa: os leads --------------------
  // Inclui o contato do site: ele nasce em `leads` com `origem = 'site'`.
  const { data: leads } = await auth.db
    .from("leads")
    .select("id,nome,nome_wa,telefone,mensagens,status,origem,updated_at,created_at")
    .eq("org_id", org)
    .neq("status", "descartado")
    .order("updated_at", { ascending: false })
    .limit(200);

  for (const l of (leads || []) as any[]) {
    const msgs = Array.isArray(l.mensagens) ? l.mensagens : [];
    const ult = msgs.length ? msgs[msgs.length - 1] : null;
    fios.push({
      chave: `lead:${l.id}`,
      tipo: "lead",
      id: l.id,
      nome: so(l.nome) || so(l.nome_wa) || "sem nome",
      telefone: l.telefone || null,
      ultima: ult?.texto || null,
      ultimaEm: ult?.t || l.updated_at || l.created_at || null,
      // No lead a última mensagem guardada é sempre a de quem escreveu para cá:
      // o que sai daqui vai para o histórico com a marca de quem mandou.
      ultimoAutor: ult?.de === "nos" ? "humano" : "cliente",
      esperando: l.status === "novo",
      familiaId: null,
    });
  }

  const filtrados = busca
    ? fios.filter((f) =>
        f.nome.toLowerCase().includes(busca) ||
        (f.telefone || "").includes(busca.replace(/\D/g, "")))
    : fios;

  // Mais recente primeiro. Quem nunca trocou mensagem vai para o fim, e não
  // para o topo — sem data, um `sort` ingênuo os jogaria na frente de todo mundo.
  filtrados.sort((a, b) => {
    const da = a.ultimaEm || "";
    const db_ = b.ultimaEm || "";
    if (!da && !db_) return a.nome.localeCompare(b.nome);
    if (!da) return 1;
    if (!db_) return -1;
    return da < db_ ? 1 : -1;
  });

  return NextResponse.json({
    ok: true,
    fios: filtrados.slice(0, 200),
    resumo: {
      total: filtrados.length,
      esperando: filtrados.filter((f) => f.esperando).length,
    },
  });
}
