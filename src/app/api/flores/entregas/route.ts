import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { subirFotoServico } from "@/lib/servico";
import { registrarErro } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A ENTREGA — o que acontece quando o Leandro põe a flor.
 *
 * POST { acao: "entregar", id, fotoBase64?, mimetype?, observacao? }
 *      { acao: "pular",    id, motivo }
 *      { acao: "avulsa",   tumuloId, extraId, quantidade?, data }
 *      { acao: "ordem",    ids: [...] }
 *
 * NADA É ENVIADO AQUI. A foto entra na FILA DE LIBERAÇÃO e espera o comando —
 * é a regra da casa desde sempre, e o Leandro a repetiu ao pedir isto:
 * *"ele pode ficar também na liberação enquanto não disparamos automático"*.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const acao = String(b?.acao || "");

  // ------------------------------------------------------------------ ENTREGAR
  if (acao === "entregar") {
    const id = String(b?.id || "");
    if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

    // A FOTO SOBE ANTES DA TRANSAÇÃO. Se o upload falhar, a entrega ainda vale
    // — o que não pode é a entrega ficar registrada e a foto sumir sem que
    // ninguém saiba. Por isso o resultado do upload volta na resposta.
    const mime = String(b?.mimetype || "image/jpeg");
    const foto = b?.fotoBase64
      ? await subirFotoServico(`extra-${id}`, b.fotoBase64, mime, "depois")
      : null;

    const { data, error } = await db.rpc("sureya_registrar_entrega", {
      p_entrega: id,
      p_foto: foto,
      p_observacao: b?.observacao ? String(b.observacao).slice(0, 500) : null,
    });

    if (error) {
      // Clique repetido no sábado é a causa mais provável, e a frase precisa
      // dizer isso em vez de devolver o código.
      if (/entrega_ja_registrada/.test(error.message)) {
        return NextResponse.json(
          { ok: false, erro: "ja_registrada",
            mensagem: "Esta entrega já estava marcada como feita. Nada foi cobrado de novo." },
          { status: 409 });
      }
      await registrarErro("flores: registrar entrega falhou", error.message, { id });
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    }

    const r = (Array.isArray(data) ? data[0] : data) as any;

    // ------------------------------------------------------------- a fila
    // A foto entra na liberação com o mesmo desenho da foto da lavagem: nasce
    // `aguardando`, e o gatilho da porta (0085) aplica a chave de envio de
    // fotos da família. Sem foto não há o que mostrar, então não enfileira.
    let naFila = false;
    if (foto) {
      const { data: e } = await db
        .from("entregas_extras")
        .select("familia_id,tumulo_id,nome,data_prevista,familias(responsavel_id)")
        .eq("id", id).maybeSingle();

      const familiaId = (e as any)?.familia_id;
      if (familiaId) {
        const quando = new Date(((e as any).data_prevista) + "T12:00:00")
          .toLocaleDateString("pt-BR");
        const { error: eFila } = await db.from("fila_liberacao").insert({
          org_id: org,
          familia_id: familiaId,
          cliente_id: (e as any)?.familias?.responsavel_id ?? null,
          tumulo_id: (e as any)?.tumulo_id ?? null,
          entrega_id: id,
          tipo: "foto",
          status: "aguardando",
          texto: `${(e as any)?.nome || "Flores"} colocadas hoje, ${quando}. 🌿`,
          fotos: [foto],
        });
        naFila = !eFila;
        if (eFila) {
          await registrarErro("flores: foto nao entrou na fila", eFila.message, { id });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      foto, naFila,
      // Sem foto NÃO é erro: pode ter chovido, pode não ter dado. Mas a tela
      // precisa poder dizer isso, em vez de fingir que enviou.
      semFoto: !foto,
      lancamento: r?.lancamento ?? null,
      valor: Number(r?.valor) || 0,
      vence: r?.vence ?? null,
    });
  }

  // --------------------------------------------------------------------- PULAR
  if (acao === "pular") {
    const id = String(b?.id || "");
    const motivo = String(b?.motivo || "").trim().slice(0, 300);
    // O MOTIVO É OBRIGATÓRIO. "Pulada" sem motivo, três meses depois, é um
    // buraco na esteira que ninguém sabe explicar para a família que ligou.
    if (!id || !motivo) {
      return NextResponse.json(
        { ok: false, erro: "faltou",
          mensagem: "Diga por que não foi entregue — é o que se responde à família depois." },
        { status: 400 });
    }
    const { error } = await db
      .from("entregas_extras")
      .update({ status: "pulada", motivo })
      .eq("org_id", org).eq("id", id).eq("status", "prevista");
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // -------------------------------------------------------------------- AVULSA
  // "A família pediu um vaso para domingo." Nasce sem assinatura, e por isso
  // cobra sozinha — é o caminho `avulso` da 0117.
  if (acao === "avulsa") {
    const tumuloId = String(b?.tumuloId || "");
    const extraId = String(b?.extraId || "");
    const data = String(b?.data || "");
    if (!tumuloId || !extraId || !data) {
      return NextResponse.json(
        { ok: false, erro: "faltou", mensagem: "Escolha o jazigo, o item e o dia." },
        { status: 400 });
    }
    const [{ data: t }, { data: item }] = await Promise.all([
      db.from("tumulos").select("familia_id").eq("id", tumuloId).maybeSingle(),
      db.from("servicos_extras").select("nome,unidade,preco,custo").eq("id", extraId).maybeSingle(),
    ]);
    if (!item) return NextResponse.json({ ok: false, erro: "item_desconhecido" }, { status: 400 });

    const { error } = await db.from("entregas_extras").insert({
      org_id: org,
      tumulo_id: tumuloId,
      familia_id: (t as any)?.familia_id ?? null,
      extra_id: extraId,
      nome: (item as any).nome,
      unidade: (item as any).unidade || "un",
      quantidade: Number(b?.quantidade) > 0 ? Number(b.quantidade) : 1,
      // PREÇO DE HOJE, congelado na linha. O catálogo muda quando o
      // fornecedor muda; o que foi combinado, não.
      preco_unit: Number((item as any).preco) || 0,
      custo_unit: Number((item as any).custo) || 0,
      data_prevista: data,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return NextResponse.json(
          { ok: false, erro: "ja_existe",
            mensagem: "Já há uma entrega desse item nesse jazigo nesse dia." },
          { status: 409 });
      }
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // --------------------------------------------------------------------- ORDEM
  if (acao === "ordem") {
    const ids = Array.isArray(b?.ids) ? (b.ids as string[]) : [];
    for (let i = 0; i < ids.length; i++) {
      await db.from("entregas_extras").update({ ordem_dia: i + 1 })
        .eq("org_id", org).eq("id", ids[i]);
    }
    return NextResponse.json({ ok: true, ordenadas: ids.length });
  }

  return NextResponse.json({ ok: false, erro: "acao_desconhecida" }, { status: 400 });
}
