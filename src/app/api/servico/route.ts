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

  // DUAS SITUAÇÕES DIFERENTES, e confundi-las gerava serviço fantasma:
  //
  //   dataPrevista  -> agendar algo que AINDA VAI ser feito (nasce pendente)
  //   dataExecutada -> registrar algo que JÁ FOI feito (nasce executado)
  //
  // A ficha da família usa a segunda: a Sureya limpou um túmulo ela mesma e
  // está anotando depois. Antes só existia a primeira, então o registro caía
  // como "pendente" e a limpeza aparecia na agenda como se faltasse fazer.
  const jaFeita = !!b?.dataExecutada;
  const data = String(b?.dataExecutada || b?.dataPrevista || "");

  if (!tumuloId) {
    return NextResponse.json(
      { ok: false, erro: "sem_tumulo", mensagem: "Escolha o jazigo." },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json(
      { ok: false, erro: "sem_data", mensagem: jaFeita ? "Escolha o dia em que a limpeza foi feita." : "Escolha a data em que a limpeza precisa estar feita." },
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
    status: jaFeita ? "executado" : "pendente",
    ...(jaFeita ? { data_executada: new Date(`${data}T12:00:00`).toISOString() } : {}),
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

  // A LAVAGEM APARECE NO EXTRATO — valor zero, só para acompanhar.
  //
  // Isto já acontecia quando a Nina concluía pelo app, mas NÃO quando a Sureya
  // registrava à mão: a limpeza ficava só na lista de serviços e sumia da
  // conta corrente, onde ela olha o histórico da família.
  //
  // Não mexe no saldo: quem gera a dívida é a competência. Se a lavagem também
  // lançasse valor, a família seria cobrada duas vezes pelo mesmo serviço.
  if (jaFeita) {
    try {
      const { data: tumInfo } = await db
        .from("tumulos").select("familia_id,codigo").eq("id", tumuloId).maybeSingle();
      const fam = (tumInfo as any)?.familia_id;
      if (fam) {
        const onde = (tumInfo as any)?.codigo ? ` · ${(tumInfo as any).codigo}` : "";
        await db.from("conta_corrente").insert({
          org_id: org,
          familia_id: fam,
          tumulo_id: tumuloId,
          tipo: "debito",          // lado irrelevante: o valor é 0
          origem: "lavagem",
          competencia: null,
          valor: 0,
          descricao: `Limpeza realizada${onde}`,
          data,
        });
      }
    } catch {
      // Só o registro visual. A limpeza está gravada em `servicos`, que é a
      // prova do trabalho — não pode cair por causa do espelho.
    }
  }

  return NextResponse.json({
    ok: true,
    servicoId: (srv as any)?.id,
    jaFeita,
    dataPrevista: data,
    semMigration: semColuna,
  });
}
