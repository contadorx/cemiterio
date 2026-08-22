import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { descreverFrequencia } from "@/lib/frequencia";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";
import { anexarJazigo, criarPlanoSeFaltar, explicarErroJazigo } from "@/lib/jazigo";
import { valorMensalDoPlano, valorMensalEfetivo, diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const q = req.nextUrl.searchParams;

  // Filtro por família: usado pelo bloco "Pessoas da família" na ficha, que
  // lista o filho que paga e a neta que acompanha. Sem o filtro, ele teria de
  // baixar as 400 pessoas e peneirar no navegador.
  const familiaId = q.get("familiaId");

  let consulta = db
    .from("clientes")
    .select("id,nome,telefone,familia_id,responsavel_financeiro,parentesco,recebe_fotos,modo,score,ativo_ia,envio_automatico,regua_cobranca,cobranca_nivel,anonimizado_em,observacoes")
    .order("nome")
    .limit(400);

  if (familiaId) consulta = consulta.eq("familia_id", familiaId);

  const { data: clientes } = await consulta;

  const ids = (clientes || []).map((c: any) => c.id);

  // A ETAPA DO CADASTRO.
  //
  // São 66 famílias e o trabalho é feito aos poucos: ligar o túmulo, depois
  // preencher o contrato, depois começar a registrar limpeza. Sem saber em que
  // pé cada uma está, a Sureya reabre as mesmas fichas para descobrir que já
  // fez — e as que faltam somem no meio.
  //
  // A etapa é DERIVADA dos dados, não marcada à mão: um campo "já conferi"
  // desatualiza no dia em que alguém mexe por outro caminho.
  const familiaIds = [...new Set((clientes || []).map((c: any) => c.familia_id).filter(Boolean))];

  const [{ data: tumsFam }, { data: famsInfo }, { data: servs }] = await Promise.all([
    db.from("tumulos").select("familia_id,periodicidade,contratado")
      .in("familia_id", familiaIds.length ? familiaIds : ["-"]),
    db.from("familias").select("id,contratado,valor_mensal,freq_pagamento,inicio_cobranca")
      .in("id", familiaIds.length ? familiaIds : ["-"]),
    db.from("servicos").select("cliente_id").not("data_executada", "is", null)
      .in("cliente_id", ids.length ? ids : ["-"]),
  ]);

  const tumulosPorFamilia = new Map<string, any[]>();
  for (const t of (tumsFam || []) as any[]) {
    tumulosPorFamilia.set(t.familia_id, [...(tumulosPorFamilia.get(t.familia_id) || []), t]);
  }
  const infoFamilia = new Map<string, any>();
  for (const x of (famsInfo || []) as any[]) infoFamilia.set(x.id, x);

  const servicosPorCliente = new Map<string, number>();
  for (const sv of (servs || []) as any[]) {
    servicosPorCliente.set(sv.cliente_id, (servicosPorCliente.get(sv.cliente_id) || 0) + 1);
  }

  const [{ data: tums }, { data: plans }, { data: movs }] = await Promise.all([
    db.from("tumulos").select("cliente_id,identificacao,rua,quadra_id,quadras(codigo)").in("cliente_id", ids.length ? ids : ["-"]),
    db.from("planos").select("cliente_id,cadencia,lavagens_por_ciclo,valor_mensal,valor_vigente,ativo,proximo_servico,proxima_cobranca,pago_ate,migrado_em").in("cliente_id", ids.length ? ids : ["-"]),
    db.from("movimentos").select("cliente_id,tipo,valor,status_conc").in("cliente_id", ids.length ? ids : ["-"]),
  ]);

  const porCliente = new Map<string, any>();
  for (const c of (clientes || []) as any[]) {
    porCliente.set(c.id, { ...c, jazigos: [], cadencias: [], saldo: 0, mensal: 0,
                           proximaLavagem: null, proximaCobranca: null,
                           temPlanoAtivo: false, conferido: true });
  }
  for (const t of (tums || []) as any[]) {
    const x = porCliente.get(t.cliente_id); if (!x) continue;
    x.jazigos.push({ id: t.identificacao, quadra: t.quadras?.codigo || "", rua: t.rua || "" });
  }
  for (const p of (plans || []) as any[]) {
    const x = porCliente.get(p.cliente_id); if (!x) continue;
    if (p.ativo) {
      x.cadencias.push(descreverFrequencia(p.cadencia, p.lavagens_por_ciclo ?? 1));
      // "por mes" de verdade: preco por limpeza x limpezas do ciclo / meses.
      // Somar valor_mensal cru punha um plano anual e um quinzenal no mesmo
      // patamar, e o total da carteira ficava fantasioso.
      x.mensal += valorMensalEfetivo(
        p.cadencia, p.lavagens_por_ciclo,
        valorMensalDoPlano(p.cadencia, p.valor_mensal, p.valor_vigente),
      );
      if (p.proximo_servico && (!x.proximaLavagem || p.proximo_servico < x.proximaLavagem)) x.proximaLavagem = p.proximo_servico;
      if (p.proxima_cobranca && (!x.proximaCobranca || p.proxima_cobranca < x.proximaCobranca)) x.proximaCobranca = p.proxima_cobranca;
      x.temPlanoAtivo = true;
      if (!p.migrado_em) x.conferido = false;
    }
  }
  for (const m of (movs || []) as any[]) {
    const x = porCliente.get(m.cliente_id); if (!x) continue;
    if (m.status_conc !== "confirmado") continue;
    x.saldo += m.tipo === "credito" ? Number(m.valor) : -Number(m.valor);
  }

  let lista = [...porCliente.values()].map((c) => ({
    ...c,
    saldo: Math.round(c.saldo * 100) / 100,
    mensal: Math.round(c.mensal * 100) / 100,
    cadencias: [...new Set(c.cadencias)],
    quadras: [...new Set(c.jazigos.map((j: any) => j.quadra).filter(Boolean))],
    ruas: [...new Set(c.jazigos.map((j: any) => j.rua).filter(Boolean))],
    atrasado: c.saldo < -0.005,
    faltaData: c.temPlanoAtivo && (!c.proximaLavagem || !c.proximaCobranca),
    conferido: c.conferido,
  }));

  // ------------------------------- filtros
  const busca = (q.get("busca") || "").trim().toLowerCase();
  if (busca) {
    lista = lista.filter((c) =>
      String(c.nome).toLowerCase().includes(busca) ||
      String(c.telefone).includes(busca) ||
      c.jazigos.some((j: any) => String(j.id).toLowerCase().includes(busca)));
  }
  const quadra = q.get("quadra") || "";
  if (quadra) lista = lista.filter((c) => c.quadras.includes(quadra));
  const rua = q.get("rua") || "";
  if (rua) lista = lista.filter((c) => c.ruas.includes(rua));
  const cadencia = q.get("cadencia") || "";
  if (cadencia) lista = lista.filter((c) => c.cadencias.includes(cadencia));
  const regua = q.get("regua") || "";
  if (regua) lista = lista.filter((c) => c.regua_cobranca === regua);

  const situacao = q.get("situacao") || "";
  if (situacao === "atrasados") lista = lista.filter((c) => c.atrasado);
  if (situacao === "em_dia") lista = lista.filter((c) => !c.atrasado);
  if (situacao === "adiantados") lista = lista.filter((c) => c.saldo > 0.005);
  if (situacao === "sem_telefone") lista = lista.filter((c) => String(c.telefone).startsWith("sem-tel"));
  if (situacao === "ia_desligada") lista = lista.filter((c) => !c.ativo_ia);
  if (situacao === "envio_desligado") lista = lista.filter((c) => c.envio_automatico === false);
  if (situacao === "automatico") lista = lista.filter((c) => c.modo === "automatico");
  if (situacao === "falta_data") lista = lista.filter((c) => c.faltaData);
  if (situacao === "nao_conferido") lista = lista.filter((c) => !c.conferido);

  const venceEm = Number(q.get("venceEm") || 0);
  if (venceEm > 0) {
    const limite = new Date(Date.now() + venceEm * 86400000).toISOString().slice(0, 10);
    const hoje = diaOperacao();
    lista = lista.filter((c) =>
      (c.proximaCobranca && c.proximaCobranca <= limite) ||
      (c.proximaLavagem && c.proximaLavagem >= hoje && c.proximaLavagem <= limite));
  }
  if (q.get("teste") !== "1") lista = lista.filter((c) => !String(c.nome).startsWith("[TESTE]"));

  const ordem = q.get("ordem") || "nome";
  if (ordem === "saldo") lista.sort((a, b) => a.saldo - b.saldo);
  if (ordem === "valor") lista.sort((a, b) => b.mensal - a.mensal);
  if (ordem === "lavagem") lista.sort((a, b) => String(a.proximaLavagem || "9").localeCompare(String(b.proximaLavagem || "9")));
  if (ordem === "cobranca") lista.sort((a, b) => String(a.proximaCobranca || "9").localeCompare(String(b.proximaCobranca || "9")));

  const totais = {
    quantidade: lista.length,
    mensal: Math.round(lista.reduce((s, c) => s + c.mensal, 0) * 100) / 100,
    emAberto: Math.round(lista.filter((c) => c.atrasado).reduce((s, c) => s + Math.abs(c.saldo), 0) * 100) / 100,
    atrasados: lista.filter((c) => c.atrasado).length,
    faltaData: lista.filter((c) => c.faltaData).length,
  };

  // As quatro etapas, na ordem do trabalho:
  //   sem_tumulo   -> família cadastrada, nenhuma pedra ligada
  //   sem_contrato -> tem pedra, mas falta valor / quando cobrar / ritmo
  //   pronta       -> contrato completo, ainda sem limpeza registrada
  //   operacional  -> contrato completo e limpeza acontecendo
  const comEtapa = lista.map((c: any) => {
    const meus = tumulosPorFamilia.get(c.familia_id) || [];
    const fam = infoFamilia.get(c.familia_id);
    const servicos = servicosPorCliente.get(c.id) || 0;

    const contratoOk = !!fam?.contratado && Number(fam?.valor_mensal) > 0
      && !!fam?.freq_pagamento && !!fam?.inicio_cobranca
      && meus.some((t: any) => t.contratado && t.periodicidade);

    const etapa = !meus.length ? "sem_tumulo"
      : !contratoOk ? "sem_contrato"
      : servicos > 0 ? "operacional"
      : "pronta";

    return { ...c, etapa, qtdTumulos: meus.length, qtdServicos: servicos };
  });

  const filtroEtapa = q.get("etapa");
  const final = filtroEtapa ? comEtapa.filter((c: any) => c.etapa === filtroEtapa) : comEtapa;

  const porEtapa = {
    sem_tumulo: comEtapa.filter((c: any) => c.etapa === "sem_tumulo").length,
    sem_contrato: comEtapa.filter((c: any) => c.etapa === "sem_contrato").length,
    pronta: comEtapa.filter((c: any) => c.etapa === "pronta").length,
    operacional: comEtapa.filter((c: any) => c.etapa === "operacional").length,
  };

  return NextResponse.json({ ok: true, clientes: final, totais, porEtapa });
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const nome = (body?.nome || "").trim();
  const telefone = normalizarTelefone(body?.telefone || "");
  if (!nome || !telefone) {
    return NextResponse.json({ ok: false, erro: "nome_e_telefone_obrigatorios" }, { status: 400 });
  }

  // Aceita o formato aninhado novo (jazigo/plano) e ainda o antigo (tumulo/plano).
  const jz = body?.jazigo || body?.tumulo || {};
  const pl = body?.plano || {};

  // cliente
  const { data: cli, error: e1 } = await db
    .from("clientes")
    .insert({
      org_id: org,
      nome,
      telefone,
      tratamento: body?.tratamento || null,
      modo: body?.modo === "automatico" ? "automatico" : "copiloto",
      ativo_ia: true,
      consentimento_em: body?.consentimento ? new Date().toISOString() : null,
      consentimento_via: body?.consentimento ? "cadastro" : null,
    })
    .select("id")
    .single();
  if (e1) return NextResponse.json({ ok: false, erro: e1.message }, { status: 500 });
  const clienteId = (cli as any).id as string;

  // JAZIGO + PLANO: a mesma funcao que a ficha da familia usa (src/lib/jazigo.ts).
  // Antes isto vivia so aqui, em linha, e falhava CALADO: se a identificacao ja
  // existisse em outra familia, a familia nascia sem jazigo e a tela dizia "ok".
  let tumuloId: string | null = null;
  let avisoJazigo: string | null = null;
  let avisoPlano: string | null = null;

  if (jz?.vincularTumuloId || jz?.identificacao) {
    const r = await anexarJazigo(db, org, clienteId, {
      vincularTumuloId: jz?.vincularTumuloId ?? null,
      identificacao: jz?.identificacao ?? null,
      quadraCodigo: jz?.quadraCodigo ?? null,
      rua: jz?.rua ?? null,
      numero: jz?.numero ?? null,
      falecidoNome: jz?.falecidoNome ?? null,
      cemiterioId: jz?.cemiterioId ?? null,
    });
    if (r.ok) tumuloId = r.tumuloId;
    else avisoJazigo = explicarErroJazigo(r.erro, r.detalhe);
  }

  if (tumuloId && pl?.cadencia && pl.cadencia !== "avulso") {
    const rp = await criarPlanoSeFaltar(db, org, clienteId, tumuloId, {
      cadencia: pl.cadencia,
      lavagensPorCiclo: pl.lavagensPorCiclo ?? pl.qtdPorPassagem ?? null,
      valorMensal: pl.valorMensal ?? pl.valorVigente ?? null,
      inicio: pl.inicio ?? null,
    });
    if (!rp.ok) avisoPlano = explicarErroJazigo(rp.erro);
  }

  // A familia FOI criada mesmo quando o jazigo falha — por isso ok:true com aviso.
  return NextResponse.json({ ok: true, clienteId, tumuloId, avisoJazigo, avisoPlano });
}
