import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { descreverFrequencia } from "@/lib/frequencia";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";
import { valorDoCiclo, vencimentosIniciais } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const q = req.nextUrl.searchParams;

  const { data: clientes } = await db
    .from("clientes")
    .select("id,nome,telefone,modo,score,ativo_ia,regua_cobranca,cobranca_nivel,anonimizado_em,observacoes")
    .order("nome")
    .limit(400);

  const ids = (clientes || []).map((c: any) => c.id);

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
      x.mensal += Number(p.valor_mensal) || 0;
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
  if (situacao === "automatico") lista = lista.filter((c) => c.modo === "automatico");
  if (situacao === "falta_data") lista = lista.filter((c) => c.faltaData);
  if (situacao === "nao_conferido") lista = lista.filter((c) => !c.conferido);

  const venceEm = Number(q.get("venceEm") || 0);
  if (venceEm > 0) {
    const limite = new Date(Date.now() + venceEm * 86400000).toISOString().slice(0, 10);
    const hoje = new Date().toISOString().slice(0, 10);
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

  return NextResponse.json({ ok: true, clientes: lista, totais });
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

  let tumuloId: string | null = null;

  // --- JAZIGO ---
  if (jz?.vincularTumuloId) {
    // vincula um jazigo já cadastrado (ex.: capturado no campo) a esta família.
    // Só vincula se ainda estiver SEM dono — não rouba jazigo de outra família.
    const patch: Record<string, any> = { cliente_id: clienteId };
    if (jz.rua) patch.rua = jz.rua;
    if (jz.falecidoNome) patch.falecido_nome = jz.falecidoNome.trim();
    const { data: vinc } = await db.from("tumulos").update(patch)
      .eq("id", jz.vincularTumuloId).is("cliente_id", null).select("id");
    // só considera vinculado se a linha existia e estava órfã
    tumuloId = (vinc && vinc.length) ? jz.vincularTumuloId : null;
  } else if (jz?.identificacao) {
    // cria um jazigo novo (garante cemitério + quadra por código)
    let cemId = jz.cemiterioId || null;
    if (!cemId) {
      const { data: cem } = await db.from("cemiterios").select("id").limit(1).maybeSingle();
      if (cem) cemId = (cem as any).id;
      else {
        const { data: novo } = await db.from("cemiterios")
          .insert({ org_id: org, nome: "Cemitério" }).select("id").single();
        cemId = (novo as any)?.id;
      }
    }
    const codigo = String(jz.quadraCodigo || "S/Q").trim();
    let { data: quad } = await db.from("quadras")
      .select("id").eq("cemiterio_id", cemId).eq("codigo", codigo).maybeSingle();
    if (!quad) {
      const { data: novaQ } = await db.from("quadras")
        .insert({ org_id: org, cemiterio_id: cemId, codigo }).select("id").single();
      quad = novaQ as any;
    }
    const quadId = (quad as any).id;
    const ident = String(jz.identificacao).trim();
    const rua = jz.rua?.trim() || null;
    const falecido = jz.falecidoNome?.trim() || null;

    // já existe esse jazigo nessa quadra? reaproveita (evita duplicar)
    const { data: existente } = await db.from("tumulos")
      .select("id,cliente_id").eq("quadra_id", quadId).ilike("identificacao", ident).maybeSingle();

    if (existente && !(existente as any).cliente_id) {
      // existe e está órfão → vincula a esta família
      await db.from("tumulos")
        .update({ cliente_id: clienteId, rua, falecido_nome: falecido })
        .eq("id", (existente as any).id);
      tumuloId = (existente as any).id;
    } else if (!existente) {
      const { data: tum, error: e2 } = await db.from("tumulos").insert({
        org_id: org, quadra_id: quadId, cliente_id: clienteId,
        identificacao: ident, rua, falecido_nome: falecido,
      }).select("id").single();
      if (!e2) tumuloId = (tum as any).id;
    }
    // else: já existe e é de outra família → não mexe (evita duplicar e não rouba)
  }

  // --- PLANO --- (com vencimento calculado a partir da periodicidade)
  const cadencia = pl?.cadencia;
  if (cadencia && cadencia !== "avulso" && tumuloId) {
    // não duplica se o jazigo vinculado já tinha plano
    const { data: jaTem } = await db.from("planos").select("id").eq("tumulo_id", tumuloId).maybeSingle();
    if (!jaTem) {
      const valorMensal = Number(pl.valorMensal ?? pl.valorVigente) || 40;
      const lav = Math.max(1, Math.min(12, Number(pl.lavagensPorCiclo ?? pl.qtdPorPassagem) || 1));
      const venc = vencimentosIniciais(cadencia, pl.inicio);
      await db.from("planos").insert({
        org_id: org,
        cliente_id: clienteId,
        tumulo_id: tumuloId,
        cadencia,
        qtd_por_passagem: lav,
        lavagens_por_ciclo: lav,
        valor_mensal: valorMensal,
        valor_vigente: valorDoCiclo(cadencia, valorMensal),
        data_valor_vigente: new Date().toISOString().slice(0, 10),
        ativo: true,
        proximo_servico: venc.proximo_servico,
        proxima_cobranca: venc.proxima_cobranca,
        pago_ate: venc.pago_ate,
      });
    }
  }

  return NextResponse.json({ ok: true, clienteId, tumuloId });
}
