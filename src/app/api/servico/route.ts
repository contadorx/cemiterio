import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/servico — marca UMA limpeza avulsa para UM jazigo.
 *
 * Faltava a porta de entrada mais simples do sistema. Para marcar um serviço
 * esporádico só havia dois caminhos, e nenhum servia:
 *   · plano com cadência "avulso" + agenda com "incluir avulsos" — isso é
 *     CAMPANHA EM LOTE (Finados, Dia das Mães): joga a mesma data em todos os
 *     avulsos de uma vez;
 *   · o pedido nascido numa conversa de WhatsApp (0035) — só cobre quem pediu
 *     por mensagem.
 *
 * O serviço esporádico chega por qualquer canal: telefonema, alguém que passou
 * no cemitério, você lembrando. Agora tem botão na ficha da família.
 *
 * Corpo: { tumuloId, dataPrevista, valor?, observacao?, prioridade? }
 * Nasce com plano_id = null (avulso) e status "pendente" — é assim que o
 * alocador da agenda enxerga e o app de campo recebe.
 *
 * `dataPrevista` é gravada TAMBÉM em `data_desejada` (migration 0037): é a data
 * que a família pediu, e essa o alocador nunca reescreve. Ele prefere esse dia,
 * pode antecipar se estiver cheio, e nunca passa dele.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const tumuloId = b?.tumuloId;
  const data = String(b?.dataPrevista || "");

  if (!tumuloId) {
    return NextResponse.json(
      { ok: false, erro: "sem_tumulo", mensagem: "Escolha o jazigo." },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json(
      { ok: false, erro: "sem_data", mensagem: "Escolha a data em que a limpeza precisa estar feita." },
      { status: 400 },
    );
  }

  const { data: tum } = await db
    .from("tumulos")
    .select("id,cliente_id,identificacao")
    .eq("id", tumuloId)
    .maybeSingle();
  if (!tum) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  // Já existe limpeza marcada para este jazigo nesse dia? Não duplica.
  const { data: jaTem } = await db
    .from("servicos")
    .select("id,status")
    .eq("org_id", org)
    .eq("tumulo_id", tumuloId)
    .eq("data_prevista", data)
    .in("status", ["pendente", "agendado", "executado"])
    .maybeSingle();

  if (jaTem) {
    return NextResponse.json({
      ok: false,
      erro: "ja_existe",
      mensagem: `Este jazigo já tem uma limpeza ${(jaTem as any).status} nesse dia.`,
    }, { status: 400 });
  }

  const valor =
    b?.valor === "" || b?.valor === null || b?.valor === undefined ? null : Number(b.valor);
  if (valor !== null && !Number.isFinite(valor)) {
    return NextResponse.json({ ok: false, erro: "valor_invalido" }, { status: 400 });
  }

  const base: Record<string, any> = {
    org_id: org,
    tumulo_id: tumuloId,
    plano_id: null,                 // avulso: não pertence a nenhum plano
    cliente_id: (tum as any).cliente_id,
    data_prevista: data,
    status: "pendente",
    valor,
    // pedido com data pedida pela família entra na frente da fila do dia
    prioridade: Number.isFinite(Number(b?.prioridade)) ? Number(b.prioridade) : 5,
  };

  const observacao = String(b?.observacao || "").trim().slice(0, 400);

  // Colunas das migrations 0036/0037. Se elas ainda não foram rodadas, o
  // serviço nasce assim mesmo — sem o recado e sem a data congelada, nunca sem
  // o trabalho.
  const comExtras: Record<string, any> = { ...base, data_desejada: data };
  if (observacao) comExtras.observacao = observacao;

  let { data: srv, error } = await db
    .from("servicos")
    .insert(comExtras)
    .select("id")
    .maybeSingle();

  const msg = `${error?.message || ""}`.toLowerCase();
  const semColuna = msg.includes("observacao") || msg.includes("data_desejada");
  if (error && semColuna) {
    const r2 = await db.from("servicos").insert(base).select("id").maybeSingle();
    srv = r2.data;
    error = r2.error;
  }

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    servicoId: (srv as any)?.id,
    dataPrevista: data,
    semMigration: semColuna,
  });
}
