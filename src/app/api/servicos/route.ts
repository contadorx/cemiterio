import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/servicos — a lista que faltava.
 *
 * O sistema tinha três telas que mostram serviço, e todas filtram por data:
 * a agenda (janela de dias), o Início (só o que vence hoje) e o campo (só hoje).
 * Resultado: um serviço marcado para daqui a dez dias não aparecia em lugar
 * nenhum, e a ficha da família não listava serviço nenhum — nem os feitos.
 *
 * Aqui não há filtro de data. Duas leituras:
 *   ?clienteId=…               → tudo daquela família: o que vem e o que já foi,
 *                                avulso e de plano, com mês, execução e cobrança
 *   ?tipo=avulso&situacao=abertos → a fila dos avulsos em aberto
 *
 * "Cobrado" não é campo do serviço: é a existência de um débito em `movimentos`
 * com aquele `servico_id`. É o mesmo lançamento que a conclusão cria — por isso
 * essa lista é a prova do que foi faturado, não uma segunda contabilidade.
 */

const BASE =
  "id,data_prevista,data_executada,status,valor,plano_id,cliente_id,tumulo_id,prioridade," +
  "tumulos(identificacao),clientes(nome,telefone),planos(cadencia)";
const EXTRAS = ",data_desejada,desejada_estourada,observacao";

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function diasAte(d: string | null): number | null {
  if (!d) return null;
  const a = new Date(hojeSP() + "T00:00:00Z").getTime();
  const b = new Date(d + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const clienteId = sp.get("clienteId");
  const tipo = sp.get("tipo");                       // avulso | plano | (vazio = todos)
  const situacao = sp.get("situacao") || "todos";    // abertos | feitos | todos
  const limite = Math.min(Number(sp.get("limite")) || 120, 400);

  function montar(cols: string) {
    let q = db.from("servicos").select(cols).eq("org_id", org);
    if (clienteId) q = q.eq("cliente_id", clienteId);
    if (tipo === "avulso") q = q.is("plano_id", null);
    if (tipo === "plano") q = q.not("plano_id", "is", null);
    if (situacao === "abertos") q = q.in("status", ["pendente", "agendado"]);
    if (situacao === "feitos") q = q.eq("status", "executado");
    if (situacao !== "abertos") q = q.neq("status", "cancelado");
    return q.order("data_prevista", { ascending: false, nullsFirst: false }).limit(limite);
  }

  // As colunas data_desejada/desejada_estourada/observacao são das migrations
  // 0036/0037. Sem elas a lista continua — só não mostra a data pedida.
  let r = await montar(BASE + EXTRAS);
  let temMigration = true;
  if (r.error) {
    temMigration = false;
    r = await montar(BASE);
  }
  if (r.error) return NextResponse.json({ ok: false, erro: r.error.message }, { status: 400 });

  const linhas = (r.data || []) as any[];

  // QUANTO CADA LIMPEZA VALEU.
  //
  // O serviço não carrega valor — o dinheiro vive na conta corrente, para não
  // haver dois números para a mesma coisa. Mas a lista precisa MOSTRAR o
  // valor: sem ele, a Sureya vê "três limpezas" e não sabe quanto isso
  // consumiu do que a família pagou.
  //
  // O casamento é por túmulo + data, que é como o lançamento nasce.
  const ids = linhas.map((s) => s.id);
  const cobr = new Map<string, number>();
  const porTumuloData = new Map<string, number>();

  const tumulosDaLista = [...new Set(linhas.map((s) => s.tumulo_id).filter(Boolean))];
  if (tumulosDaLista.length) {
    const { data: lav } = await db
      .from("conta_corrente")
      .select("tumulo_id,data,valor")
      .eq("org_id", org)
      .eq("origem", "lavagem")
      .in("tumulo_id", tumulosDaLista);

    for (const l of (lav || []) as any[]) {
      porTumuloData.set(`${l.tumulo_id}|${String(l.data).slice(0, 10)}`, Number(l.valor) || 0);
    }
  }

  if (ids.length) {
    // "Cobrado" = existe debito para este servico, no razao da familia
    // (DECISOES.md D-01). O gatilho da 0071 espelha os debitos do razao antigo
    // para ca, entao ler so este alcança os dois — e alcança tambem os debitos
    // de origem `lavagem`, que nunca existiram em `movimentos`.
    const { data: movs } = await db
      .from("conta_corrente")
      .select("servico_id,valor")
      .eq("org_id", org)
      .eq("tipo", "debito")
      .in("servico_id", ids);
    for (const m of (movs || []) as any[]) {
      if (m.servico_id) cobr.set(m.servico_id, Number(m.valor) || 0);
    }
  }

  const servicos = linhas.map((s: any) => {
    const pedida = s.data_desejada ?? null;
    return {
      id: s.id,
      avulso: !s.plano_id,
      cadencia: s.planos?.cadencia || null,
      clienteId: s.cliente_id,
      cliente: s.clientes?.nome || s.clientes?.telefone || "—",
      tumuloId: s.tumulo_id,
      tumulo: s.tumulos?.identificacao || "—",
      status: s.status,
      dataPrevista: s.data_prevista,
      dataPedida: pedida,
      diasAte: diasAte(pedida),
      estourou:
        !!s.desejada_estourada ||
        (!!pedida && !!s.data_prevista && s.status !== "executado" && s.data_prevista > pedida),
      executadaEm: s.data_executada ? String(s.data_executada).slice(0, 10) : null,
      mes: (s.data_executada ? String(s.data_executada) : s.data_prevista || "").slice(0, 7) || null,
      valor: s.valor === null || s.valor === undefined ? null : Number(s.valor),
      // O que esta limpeza consumiu do que a família pagou.
      valorLimpeza: s.data_executada
        ? porTumuloData.get(`${s.tumulo_id}|${String(s.data_executada).slice(0, 10)}`) ?? null
        : null,
      observacao: s.observacao ?? null,
      cobrado: cobr.has(s.id),
      valorCobrado: cobr.get(s.id) ?? null,
    };
  });

  return NextResponse.json({ ok: true, servicos, temMigration, hoje: hojeSP() });
}
