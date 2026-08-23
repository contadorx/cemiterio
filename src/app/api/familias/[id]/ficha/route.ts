import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { calcularSaldo } from "@/lib/financeiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A FICHA COMPLETA DA FAMÍLIA — tudo que a conferência cobra, numa chamada.
 *
 * A versão anterior desta tela era uma bancada estreita: pessoas, regime e
 * jazigos, e mais nada. Faltava o que a conferência pergunta e não dava para
 * responder ali — o plano com as datas, o valor de cada jazigo, e sobretudo o
 * EXTRATO: o que já foi lançado, em que competência, por qual porta.
 *
 * Uma chamada só, e não seis: quem abre esta tela veio corrigir, e uma tela que
 * carrega em pedaços faz a pessoa corrigir o que apareceu primeiro e ir embora
 * antes do resto aparecer.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const id = params.id;

  const [
    { data: fam }, { data: contatos }, { data: jaz },
    { data: itens }, { data: eventos }, { data: semCobranca }, { data: hist },
  ] = await Promise.all([
    auth.db.from("familias")
      .select("id,nome,responsavel_id,regime,contratado,conferida_em,modo_cobranca," +
              "enviar_fotos,silenciar")
      .eq("id", id).maybeSingle(),
    auth.db.from("clientes")
      .select("id,nome,telefone,responsavel_financeiro,recebe_fotos,created_at," +
              "parentesco,tratamento,observacoes,consentimento_em")
      .eq("familia_id", id).order("created_at"),
    auth.db.from("tumulos")
      .select("id,identificacao,codigo,valor_lavagem,quadra_id,periodicidade," +
              "quadras(codigo),ruas(nome)")
      .eq("familia_id", id).order("codigo"),
    auth.db.rpc("sureya_conferencia_cadastro", { p_familia: id }),
    auth.db.from("sureya_eventos_da_familia")
      .select("id,competencia,data,tipo,origem,canal,valor,valor_com_sinal,descricao," +
              "jazigo,servico_id,conferido_em,nota_conferencia,e_estorno")
      .eq("familia_id", id)
      .order("competencia", { ascending: false }).order("data", { ascending: false })
      .limit(300),
    auth.db.from("sureya_lavagens_sem_cobranca")
      .select("servico_id,jazigo,dia,competencia,canal,valor_sugerido")
      .eq("familia_id", id).order("dia"),
    auth.db.from("familia_responsavel_log")
      .select("id,cliente_id,desde,motivo")
      .eq("familia_id", id).order("desde", { ascending: false }).limit(20),
  ]);

  if (!fam) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  // OS PLANOS penduram no cliente, não na família — herança de quando a
  // família era o apelido de um contato. Enquanto for assim, buscar por
  // família é buscar pelos contatos dela.
  const idsContatos = ((contatos as any[]) || []).map((c) => c.id);
  const { data: planos } = idsContatos.length
    ? await auth.db.from("planos")
        .select("id,cliente_id,ativo,cadencia,qtd_por_passagem,valor_mensal,valor_vigente," +
                "proxima_cobranca,proximo_servico,tumulo_id")
        .in("cliente_id", idsContatos)
    : { data: [] as any[] };

  const respId = (fam as any).responsavel_id as string | null;
  const saldo = respId ? await calcularSaldo(respId).catch(() => null) : null;

  const nomePorId = new Map<string, string>(
    ((contatos as any[]) || []).map((c) => [c.id, c.nome]),
  );

  return NextResponse.json({
    ok: true,
    familia: {
      id: (fam as any).id,
      nome: (fam as any).nome,
      responsavelId: respId,
      responsavel: respId ? nomePorId.get(respId) || null : null,
      regime: (fam as any).regime || "nao_definido",
      contratado: !!(fam as any).contratado,
      conferidaEm: (fam as any).conferida_em || null,
      modoCobranca: (fam as any).modo_cobranca || null,
      enviarFotos: (fam as any).enviar_fotos,
      silenciar: Array.isArray((fam as any).silenciar) ? (fam as any).silenciar : [],
    },
    // O saldo é da FAMÍLIA (D-10): pai e filha veem o mesmo número.
    saldo: saldo ? { valor: saldo.saldo, texto: (saldo as any).texto || null } : null,
    contatos: ((contatos as any[]) || []).map((c) => ({
      id: c.id, nome: c.nome, telefone: c.telefone,
      paga: !!c.responsavel_financeiro, recebeFotos: !!c.recebe_fotos,
      parentesco: c.parentesco || null, tratamento: c.tratamento || null,
      observacoes: c.observacoes || null, consentimentoEm: c.consentimento_em || null,
    })),
    jazigos: ((jaz as any[]) || []).map((t) => ({
      id: t.id, identificacao: t.identificacao, codigo: t.codigo || null,
      quadra: t.quadras?.codigo || null, rua: t.ruas?.nome || null,
      valor: t.valor_lavagem ?? null, periodicidade: t.periodicidade || null,
      completo: !!t.quadra_id && !!String(t.identificacao || "").trim(),
    })),
    planos: ((planos as any[]) || []).map((p) => ({
      id: p.id, ativo: p.ativo !== false, cadencia: p.cadencia,
      qtdPorPassagem: p.qtd_por_passagem, valor: p.valor_vigente ?? p.valor_mensal,
      proximaCobranca: p.proxima_cobranca || null,
      proximoServico: p.proximo_servico || null,
      tumuloId: p.tumulo_id || null,
      // É o que a conferência marca como "atenção": plano ativo sem data não
      // gera nem cobrança nem agenda.
      semData: p.ativo !== false && (!p.proxima_cobranca || !p.proximo_servico),
    })),
    conferencia: (itens as any[]) || [],
    eventos: (eventos as any[]) || [],
    semCobranca: (semCobranca as any[]) || [],
    historicoResponsavel: ((hist as any[]) || []).map((h) => ({
      id: h.id,
      quem: h.cliente_id ? (nomePorId.get(h.cliente_id) || "contato removido") : null,
      desde: h.desde, motivo: h.motivo || null,
    })),
  });
}

/**
 * PATCH — as correções que a conferência cobra e que não são de pessoa.
 *
 *   { jazigoId, valor }                              → o valor da limpeza
 *   { planoId, proximaCobranca?, proximoServico? }   → as datas do plano
 *
 * NÃO passa dinheiro por aqui. Valor de jazigo e data de plano são o COMBINADO
 * — o que vai ser cobrado da próxima vez. O que já foi lançado é imutável e se
 * corrige por estorno, que tem tela própria e deixa rastro.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));

  if (b?.jazigoId) {
    const valor = Number(b?.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      return NextResponse.json(
        { ok: false, erro: "valor_invalido", mensagem: "Informe um valor válido." },
        { status: 400 });
    }
    // O jazigo tem de ser DESTA família: sem esta conferência, um id de outra
    // passaria pela RLS (a organização é a mesma) e teria o preço trocado daqui.
    const { data: t } = await auth.db
      .from("tumulos").select("id,familia_id").eq("id", b.jazigoId).maybeSingle();
    if (!t || (t as any).familia_id !== params.id) {
      return NextResponse.json({ ok: false, erro: "nao_e_desta_familia" }, { status: 404 });
    }
    const { error } = await auth.db
      .from("tumulos").update({ valor_lavagem: valor }).eq("id", b.jazigoId);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b?.planoId) {
    const { data: p } = await auth.db
      .from("planos").select("id,cliente_id,clientes(familia_id)")
      .eq("id", b.planoId).maybeSingle();
    if (!p || (p as any).clientes?.familia_id !== params.id) {
      return NextResponse.json({ ok: false, erro: "nao_e_desta_familia" }, { status: 404 });
    }
    const campos: Record<string, any> = {};
    if (typeof b?.proximaCobranca === "string") campos.proxima_cobranca = b.proximaCobranca || null;
    if (typeof b?.proximoServico === "string") campos.proximo_servico = b.proximoServico || null;
    if (b?.ativo === false || b?.ativo === true) campos.ativo = b.ativo;
    if (!Object.keys(campos).length) {
      return NextResponse.json({ ok: false, erro: "nada_para_mudar" }, { status: 400 });
    }
    const { error } = await auth.db.from("planos").update(campos).eq("id", b.planoId);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "nada_para_fazer" }, { status: 400 });
}
