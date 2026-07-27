import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { diaOperacao, valorDoCiclo, valorMensalDoPlano, vencimentosIniciais } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { tumuloId, clienteId?, cadencia, lavagensPorCiclo?, valorMensal, inicio? }
// Cria o plano de um jazigo que ainda não tem, já com o vencimento calculado.
// Se clienteId não vier, usa o dono atual do jazigo.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const tumuloId = b?.tumuloId;
  const cadencia = b?.cadencia || "mensal";
  if (!tumuloId) return NextResponse.json({ ok: false, erro: "tumulo_obrigatorio" }, { status: 400 });

  const { data: tum } = await db.from("tumulos").select("id,cliente_id").eq("id", tumuloId).maybeSingle();
  if (!tum) return NextResponse.json({ ok: false, erro: "jazigo_nao_encontrado" }, { status: 404 });
  const clienteId = b?.clienteId || (tum as any).cliente_id;
  if (!clienteId) return NextResponse.json({ ok: false, erro: "jazigo_sem_familia" }, { status: 400 });

  // um plano por jazigo: se já existe, não duplica
  // limit(2) em vez de maybeSingle(): jazigo com dois planos (heranca de
  // importacao) fazia o maybeSingle estourar, o erro era descartado e a tela
  // criava um TERCEIRO plano no mesmo jazigo.
  const { data: existentes } = await db.from("planos").select("id").eq("tumulo_id", tumuloId).limit(2);
  if ((existentes || []).length) {
    return NextResponse.json({ ok: true, planoId: (existentes as any)[0].id, jaExistia: true });
  }

  // Sem valor legivel NAO inventa preco. O antigo `|| 40` transformava campo em
  // branco, NaN e "R$ 60" em honorario real de R$ 40, calado, para sempre.
  const valorMensal = Math.round((Number(b?.valorMensal) || NaN) * 100) / 100;
  if (!isFinite(valorMensal) || valorMensal <= 0) {
    return NextResponse.json({ ok: false, erro: "valor_mensal_invalido" }, { status: 400 });
  }
  const lav = Math.max(1, Math.min(12, Number(b?.lavagensPorCiclo) || 1));
  const venc = vencimentosIniciais(cadencia, b?.inicio);

  const { data: plano, error } = await db.from("planos").insert({
    org_id: org,
    cliente_id: clienteId,
    tumulo_id: tumuloId,
    cadencia,
    qtd_por_passagem: lav,
    lavagens_por_ciclo: lav,
    valor_mensal: valorMensal,
    valor_vigente: valorDoCiclo(cadencia, valorMensal),
    data_valor_vigente: diaOperacao(),
    ativo: true,
    proximo_servico: venc.proximo_servico,
    proxima_cobranca: venc.proxima_cobranca,
    pago_ate: venc.pago_ate,
  }).select("id").single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, planoId: (plano as any).id });
}

/**
 * Lista dos planos com tudo que a gestão precisa ver e ajustar num lugar só:
 * valor, periodicidade, pago até, próxima lavagem, próxima cobrança e situação.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const q = req.nextUrl.searchParams;

  const { data: planos } = await db
    .from("planos")
    .select("id,cliente_id,tumulo_id,cadencia,qtd_por_passagem,valor_mensal,valor_vigente," +
            "data_valor_vigente,proximo_servico,proxima_cobranca,pago_ate,ativo,migrado_em," +
            "clientes(nome,telefone,tratamento,cobranca_antecipada,regua_cobranca)," +
            "tumulos(identificacao,rua,quadra_id,quadras(codigo))")
    // ordem explícita: sem ela o Postgres devolvia 400 linhas quaisquer e as
    // contagens da tela mudavam entre recargas (e não fechavam com o Mapa)
    .order("proxima_cobranca", { ascending: true, nullsFirst: false })
    .limit(2000);

  const hoje = diaOperacao();
  let lista = (planos || []).map((p: any) => ({
    id: p.id,
    clienteId: p.cliente_id,
    cliente: p.clientes?.nome || "—",
    tratamento: p.clientes?.tratamento || "",
    antecipada: !!p.clientes?.cobranca_antecipada,
    regua: p.clientes?.regua_cobranca || "padrao",
    jazigo: p.tumulos?.identificacao || "—",
    quadra: p.tumulos?.quadras?.codigo || "",
    rua: p.tumulos?.rua || "",
    cadencia: p.cadencia,
    valorMensal: valorMensalDoPlano(p.cadencia, p.valor_mensal, p.valor_vigente),
    valorCiclo: Number(p.valor_vigente || 0),
    // PLANO ANTIGO: veio da importacao/seed sem valor_mensal separado, so com
    // valor_vigente. A tela precisa saber disto para NAO chamar esse numero de
    // "mensal" nem multiplicar por cadencia (o significado da coluna esta em
    // disputa — ver migrations/0027_DECISAO_valor_vigente_diagnostico.sql).
    legado: p.valor_mensal == null,
    desde: p.data_valor_vigente,
    pagoAte: p.pago_ate,
    proximaLavagem: p.proximo_servico,
    proximaCobranca: p.proxima_cobranca,
    ativo: p.ativo !== false,
    conferido: !!p.migrado_em,
    atrasado: p.pago_ate ? p.pago_ate < hoje : null,
    faltaData: !p.proximo_servico || !p.proxima_cobranca,
  }));

  // filtros
  const busca = (q.get("busca") || "").trim().toLowerCase();
  if (busca) lista = lista.filter((p) =>
    p.cliente.toLowerCase().includes(busca) || p.jazigo.toLowerCase().includes(busca));
  if (q.get("quadra")) lista = lista.filter((p) => p.quadra === q.get("quadra"));
  if (q.get("cadencia")) lista = lista.filter((p) => p.cadencia === q.get("cadencia"));

  const sit = q.get("situacao") || "";
  if (sit === "falta_data") lista = lista.filter((p) => p.faltaData && p.ativo);
  if (sit === "nao_conferido") lista = lista.filter((p) => !p.conferido);
  if (sit === "atrasados") lista = lista.filter((p) => p.atrasado);
  if (sit === "inativos") lista = lista.filter((p) => !p.ativo);
  if (sit === "ativos") lista = lista.filter((p) => p.ativo);

  if (q.get("teste") !== "1") lista = lista.filter((p) => !p.cliente.startsWith("[TESTE]"));

  const ordem = q.get("ordem") || "quadra";
  if (ordem === "quadra") lista.sort((a, b) =>
    (a.quadra + a.rua + a.cliente).localeCompare(b.quadra + b.rua + b.cliente));
  if (ordem === "valor") lista.sort((a, b) => b.valorMensal - a.valorMensal);
  if (ordem === "lavagem") lista.sort((a, b) =>
    String(a.proximaLavagem || "9999").localeCompare(String(b.proximaLavagem || "9999")));
  if (ordem === "cobranca") lista.sort((a, b) =>
    String(a.proximaCobranca || "9999").localeCompare(String(b.proximaCobranca || "9999")));

  return NextResponse.json({
    ok: true,
    planos: lista,
    // as datas de referência dos baldes vão JUNTO com a lista: se a tela
    // calculasse "hoje" no navegador, um computador com a data errada pintaria
    // de vermelho quem está em dia — e discordaria do Mapa, que já lê a situação
    // pronta do servidor. Um relógio só para as duas telas.
    hoje,
    sem7: diaOperacao(7),
    mes30: diaOperacao(30),
    totais: {
      quantidade: lista.length,
      mensal: Math.round(lista.filter((p) => p.ativo).reduce((s, p) => s + p.valorMensal, 0) * 100) / 100,
      faltaData: lista.filter((p) => p.faltaData && p.ativo).length,
      naoConferidos: lista.filter((p) => !p.conferido).length,
    },
  });
}
