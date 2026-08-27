import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinar } from "@/lib/storage";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/comprovantes — o que espera conferência, COM O CONTEXTO DA DECISÃO.
 *
 * Antes esta rota devolvia cinco campos: imagem, valor, data, E2E e o nome do
 * contato. E a tela tinha dois botões, "Confirmar pagamento" e "Rejeitar".
 *
 * Isso é uma decisão cega. Para dizer "sim, este dinheiro entrou" é preciso
 * saber DE QUEM é, QUANTO essa família deve, e A QUE o pagamento se refere —
 * e nada disso estava na tela. Confirmar virava um sim automático.
 *
 * Agora vem junto:
 *   · a FAMÍLIA (não só o contato), e se ela tem contrato
 *   · o SALDO em aberto
 *   · as COMPETÊNCIAS vencidas, da mais velha para a mais nova
 *   · os JAZIGOS dela
 *
 * SOBRE "A QUE SE REFERE": o razão desta casa é um saldo corrente, não uma
 * lista de faturas quitadas uma a uma. Escolher a competência aqui é gravar
 * uma REFERÊNCIA no lançamento — "isto era o agosto dela" —, não marcar aquela
 * competência como paga. A diferença importa: prometer quitação item a item
 * seria inventar um mecanismo que o sistema não tem.
 */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data } = await db
    .from("comprovantes")
    .select("id,imagem_url,valor_extraido,data_extraida,id_transacao,created_at,cliente_id," +
            "clientes(nome,telefone,familia_id)")
    .eq("status", "a_conferir")
    .eq("org_id", org)
    .order("created_at", { ascending: true });

  const linhas = (data || []) as any[];

  // O LINK QUE ABRE, NO LUGAR DO ENDEREÇO CRU (0139).
  //
  // `comprovantes` é um balde FECHADO: o endereço guardado no banco não abre
  // sozinho. Assinar em lote, aqui, é o que mantém o N+1 fora da tela — e
  // `assinar` devolve `null` quando não consegue, para a fila dizer "não
  // consegui abrir este" em vez de mostrar uma imagem quebrada.
  const adm = supabaseAdmin();
  const links = new Map<string, string | null>();
  await Promise.all(linhas.map(async (c) => {
    links.set(c.id, await assinar(adm, c.imagem_url));
  }));
  const familias = [...new Set(linhas.map((c) => c.clientes?.familia_id).filter(Boolean))];

  // UMA consulta por assunto, e não uma por comprovante: são poucas linhas na
  // tela, mas o N+1 aqui vira lentidão no dia em que a fila crescer.
  const [{ data: fams }, { data: lanc }, { data: tums }] = await Promise.all([
    familias.length
      ? db.from("familias").select("id,nome,contratado,regime").in("id", familias)
      : Promise.resolve({ data: [] as any[] } as any),
    familias.length
      ? db.from("conta_corrente")
          .select("familia_id,tipo,valor,origem,competencia,data,status_conc")
          .in("familia_id", familias).eq("status_conc", "confirmado")
      : Promise.resolve({ data: [] as any[] } as any),
    familias.length
      ? db.from("tumulos")
          .select("id,familia_id,identificacao,codigo,contratado,valor_mensal,quadras(codigo),ruas(nome)")
          .in("familia_id", familias)
      : Promise.resolve({ data: [] as any[] } as any),
  ]);

  const porFamilia = new Map<string, any>();
  for (const f of (fams || []) as any[]) porFamilia.set(f.id, f);

  const saldo = new Map<string, number>();
  const competencias = new Map<string, { competencia: string; valor: number; venceu: string }[]>();
  for (const l of (lanc || []) as any[]) {
    const v = Number(l.valor) || 0;
    saldo.set(l.familia_id, (saldo.get(l.familia_id) || 0) + (l.tipo === "debito" ? v : -v));
    if (l.tipo === "debito" && l.origem === "competencia" && l.competencia) {
      const lista = competencias.get(l.familia_id) || [];
      lista.push({ competencia: String(l.competencia).slice(0, 7), valor: v, venceu: l.data });
      competencias.set(l.familia_id, lista);
    }
  }

  const jazigos = new Map<string, any[]>();
  for (const t of (tums || []) as any[]) {
    const lista = jazigos.get(t.familia_id) || [];
    lista.push({
      id: t.id,
      rotulo: [t.quadras?.codigo, t.ruas?.nome, t.identificacao || t.codigo]
        .filter(Boolean).join(" · "),
      contratado: !!t.contratado && Number(t.valor_mensal || 0) > 0,
    });
    jazigos.set(t.familia_id, lista);
  }

  const comprovantes = linhas.map((c: any) => {
    const famId = c.clientes?.familia_id || null;
    const fam = famId ? porFamilia.get(famId) : null;
    const meus = famId ? (jazigos.get(famId) || []) : [];
    const comps = (famId ? competencias.get(famId) || [] : [])
      .sort((a, b) => (a.venceu || "").localeCompare(b.venceu || ""));

    return {
      id: c.id,
      imagem: links.get(c.id) ?? null,
      // NÃO CONSEGUI ABRIR ≠ NÃO TEM IMAGEM, e aqui a diferença decide
      // dinheiro: sem este aviso a tela mostraria a linha SEM o comprovante e
      // ela confirmaria o recebimento sem ter olhado nada.
      imagemFalhou: !!c.imagem_url && !links.get(c.id),
      valor: c.valor_extraido === null ? null : Number(c.valor_extraido),
      data: c.data_extraida,
      idTransacao: c.id_transacao,
      cliente: c.clientes?.nome || c.clientes?.telefone || "—",
      clienteId: c.cliente_id,
      quando: c.created_at,

      familiaId: famId,
      familia: fam?.nome || null,
      // `null` aqui é informação, não falta dela: quer dizer "ninguém decidiu
      // ainda se esta família é contrato ou avulso" (0128).
      regime: fam ? (fam.contratado ? "contrato" : (fam.regime || "nao_definido")) : null,
      devendo: famId ? Math.round((saldo.get(famId) || 0) * 100) / 100 : null,
      competencias: comps,
      jazigos: meus,
      // A família sem contrato é o caso comum de quem está sendo cadastrada
      // agora. Não é erro — mas quem confirma precisa saber, porque o dinheiro
      // vai ficar como saldo a favor dela até haver o que abater.
      semContrato: !!fam && !meus.some((j: any) => j.contratado),
    };
  });

  return NextResponse.json({ ok: true, comprovantes });
}
