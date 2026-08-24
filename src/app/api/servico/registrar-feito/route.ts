import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { subirFotoServico } from "@/lib/servico";
import { registrarErro } from "@/lib/monitor";
import { rascunhoDaLavagem } from "@/lib/mensagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * REGISTRAR UMA LIMPEZA QUE JÁ FOI FEITA — pelo painel, com data e foto.
 *
 * O QUE JÁ EXISTIA E POR QUE NÃO SERVIA
 * ---------------------------------------------------------------------------
 * `POST /api/servico` com `dataExecutada` já criava um serviço `executado`. Só
 * que por fora da transação da casa:
 *
 *   · inseria em `conta_corrente` com um `insert` próprio — uma SEGUNDA
 *     implementação da regra de dinheiro, que é justamente o que a 0073 veio
 *     acabar ao criar a porta única;
 *   · não aceitava foto, então a mensagem nunca chegava à fila de liberação;
 *   · não calculava remuneração da executora nem baixava material.
 *
 * Uma limpeza registrada pelo painel valia menos que a mesma limpeza registrada
 * pelo campo, e a diferença não aparecia em tela nenhuma.
 *
 * O CAMINHO DAQUI
 * ---------------------------------------------------------------------------
 *   1. cria o serviço JÁ `executado`, com a data informada;
 *   2. sobe as fotos e grava as URLs no serviço;
 *   3. chama `sureya_concluir_lavagem` — a MESMA transação do campo;
 *   4. chama `sureya_datar_lavagem` para o lançamento cair no mês certo.
 *
 * POR QUE O PASSO 1 CRIA JÁ EXECUTADO
 * A função é convergente: vendo o serviço já executado, ela NÃO reescreve o
 * status — e é dentro desse `update` que mora `data_executada = now()`. Criar
 * pendente e deixar ela concluir apagaria a data informada e carimbaria hoje.
 * Este é o único jeito de a data retroativa sobreviver sem mexer na assinatura
 * da função, que é o que criaria a ambiguidade de sobrecarga que já custou caro
 * neste repositório (ver o comentário em `concluir-admin`).
 *
 * NADA É ENVIADO AQUI
 * `notificarFamilia` não é chamada de propósito. Registro retroativo entra na
 * FILA e espera aprovação — é o pedido dela, e é o certo: uma limpeza de três
 * semanas atrás não deve disparar mensagem sozinha no meio da noite.
 *
 * A FOTO É OPCIONAL
 * Sem foto a limpeza é registrada inteira — débito, extrato, remuneração,
 * material, histórico, urgência do jazigo — e só não há mensagem para aprovar,
 * porque não há o que mandar. A resposta diz isso, para a tela poder avisar.
 */

// POST { tumuloId, data, fotoDepoisBase64?, fotoAntesBase64?, mimetype?,
//        executoraId?, duracaoMinutos?, observacao? }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const tumuloId = String(b?.tumuloId || "");
  const data = String(b?.data || "");

  if (!tumuloId) {
    return NextResponse.json(
      { ok: false, erro: "sem_tumulo", mensagem: "Escolha o jazigo." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json(
      { ok: false, erro: "sem_data", mensagem: "Escolha o dia em que a limpeza foi feita." },
      { status: 400 });
  }
  // Data no futuro não é registro de coisa feita. A função do banco também
  // recusa; recusar aqui é para a mensagem ser em português na tela.
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (data > hojeStr) {
    return NextResponse.json(
      { ok: false, erro: "data_no_futuro",
        mensagem: "Essa data ainda não chegou. Para agendar uma limpeza, use a agenda." },
      { status: 400 });
  }

  const { data: tum } = await db
    .from("tumulos").select("id,cliente_id,familia_id,identificacao,codigo,contratado,valor_mensal")
    .eq("id", tumuloId).eq("org_id", org).maybeSingle();
  if (!tum) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  const ehContratado =
    !!(tum as any).contratado && Number((tum as any).valor_mensal || 0) > 0;

  // ------------------------------------------------------------ o serviço
  //
  // Reaproveita um serviço que já exista para este jazigo neste dia, em vez de
  // criar um segundo. É o caso comum de a limpeza já estar na agenda e ela
  // estar só registrando que foi feita — e dois serviços no mesmo dia viram
  // duas cobranças.
  const { data: existente } = await db
    .from("servicos").select("id,status")
    .eq("org_id", org).eq("tumulo_id", tumuloId).eq("data_prevista", data)
    .in("status", ["pendente", "agendado", "executado"])
    .maybeSingle();

  let servicoId = (existente as any)?.id as string | undefined;
  const reaproveitado = !!servicoId;

  const carimbo = new Date(`${data}T12:00:00-03:00`).toISOString();

  if (!servicoId) {
    const linha: Record<string, any> = {
      org_id: org,
      tumulo_id: tumuloId,
      plano_id: null,
      // DE ONDE VEIO (0128). Aqui ninguém pediu nada: alguém está registrando
      // uma limpeza que JÁ ACONTECEU. Então quem responde é o ESTADO DO
      // JAZIGO — jazigo com contrato produz lavagem de contrato lançada com
      // atraso; jazigo sem contrato só é lavado porque pediram.
      //
      // O mesmo corte do cobrador: contratado E valor_mensal > 0. Marcado como
      // contratado por R$ 0,00 não é contrato.
      origem: ehContratado ? "contrato" : "pedido",
      cliente_id: (tum as any).cliente_id,
      data_prevista: data,
      data_desejada: data,
      status: "executado",                // ver o comentário grande acima
      data_executada: carimbo,
      prioridade: 5,
    };
    const obs = String(b?.observacao || "").trim().slice(0, 400);
    if (obs) linha.observacao = obs;
    if (b?.executoraId) linha.executora_id = b.executoraId;

    const { data: novo, error } = await db
      .from("servicos").insert(linha).select("id").maybeSingle();
    if (error || !novo) {
      return NextResponse.json(
        { ok: false, erro: error?.message || "nao_criou" }, { status: 500 });
    }
    servicoId = (novo as any).id;
  } else {
    // Serviço que já existia: carimba executado com a data informada ANTES de
    // chamar a transação, pelo mesmo motivo.
    const patch: Record<string, any> = { status: "executado", data_executada: carimbo };
    if (b?.executoraId) patch.executora_id = b.executoraId;
    const { error } = await db.from("servicos").update(patch).eq("id", servicoId);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  // ------------------------------------------------------------ as fotos
  const mime = b?.mimetype || "image/jpeg";
  const urlDepois = b?.fotoDepoisBase64
    ? await subirFotoServico(servicoId!, b.fotoDepoisBase64, mime, "depois") : null;
  const urlAntes = b?.fotoAntesBase64
    ? await subirFotoServico(servicoId!, b.fotoAntesBase64, mime, "antes") : null;

  // Foto pedida que não subiu é FALHA, não "segue sem". A Sureya escolheu o
  // arquivo: deixar passar calado faria a limpeza ficar sem o entregável e ela
  // só descobrir quando a família perguntasse.
  if (b?.fotoDepoisBase64 && !urlDepois) {
    return NextResponse.json(
      { ok: false, erro: "falha_ao_subir_foto", servicoId,
        mensagem: "A limpeza foi criada, mas a foto não subiu. Tente registrar de novo com a mesma data — o sistema aproveita o mesmo serviço." },
      { status: 500 });
  }

  if (urlDepois || urlAntes) {
    const patchFotos: Record<string, any> = {};
    if (urlDepois) patchFotos.foto_depois_url = urlDepois;
    if (urlAntes) patchFotos.foto_antes_url = urlAntes;
    // Gravadas ANTES da transação porque, vendo o serviço já executado, ela não
    // reescreve essas colunas — ela só confere os efeitos.
    await db.from("servicos").update(patchFotos).eq("id", servicoId);
  }

  const duracao = b?.duracaoMinutos ? Math.max(1, Number(b.duracaoMinutos)) : null;
  if (duracao) {
    await db.from("servicos")
      .update({ duracao_ajustada: duracao, motivo_ajuste: "informado pelo painel" })
      .eq("id", servicoId);
  }

  // ------------------------------------------------------- texto da mensagem
  // Mesma composição das outras duas portas, para as três gerarem o mesmo
  // rascunho. Sem foto não há mensagem, então nem monta.
  let texto: string | null = null;
  let destinatario: string | null = null;
  if (urlDepois) {
    try {
      const familiaId = (tum as any)?.familia_id as string | null;
      if (familiaId) {
        const { data: pessoas } = await db
          .from("clientes").select("id,nome,recebe_fotos,responsavel_financeiro")
          .eq("familia_id", familiaId);
        const lista = (pessoas || []) as any[];
        const destino =
          lista.find((p) => p.recebe_fotos) ||
          lista.find((p) => p.responsavel_financeiro) ||
          lista[0];
        if (destino) {
          destinatario = destino.id;
          texto = rascunhoDaLavagem({
            familiaId, clienteId: destino.id, tumuloId, servicoId: servicoId!,
            nome: destino.nome || "", fotoAntes: urlAntes, fotoDepois: urlDepois,
          }).texto;
        }
      }
    } catch {
      // Sem texto, o gatilho da fila (0085) põe um modelo da casa. Nada sai
      // sem aprovação de qualquer forma.
    }
  }

  // ------------------------------------------------------------- a transação
  const { data: res, error: eRpc } = await db.rpc("sureya_concluir_lavagem", {
    p_servico: servicoId,
    p_foto_depois: urlDepois,
    p_foto_antes: urlAntes,
    p_duracao_min: null,
    p_texto_mensagem: texto,
    p_destinatario: destinatario,
  });

  if (eRpc) {
    const negado = eRpc.code === "42501" || /sem_permissao|sem_org/.test(eRpc.message || "");
    if (!negado) {
      await registrarErro("servico/registrar-feito: transação recusada", eRpc.message, { servicoId });
    }
    return NextResponse.json(
      { ok: false, erro: eRpc.message, servicoId }, { status: negado ? 403 : 500 });
  }

  const r = (Array.isArray(res) ? res[0] : res) as any;

  // ---------------------------------------------------- a data do lançamento
  // A transação carimba `current_date`. Numa limpeza do mês corrente não muda
  // nada; numa de agosto anotada em setembro, muda a competência — e
  // competência é cobrança.
  const { data: datado, error: eData } = await db.rpc("sureya_datar_lavagem", {
    p_servico: servicoId, p_data: data,
  });
  if (eData) {
    // A limpeza está registrada e o dinheiro lançado: o que falhou foi só o
    // alinhamento da data. Vale registrar e seguir, e não desfazer nada.
    await registrarErro("servico/registrar-feito: datar falhou", eData.message, { servicoId });
  }
  const d = (Array.isArray(datado) ? datado[0] : datado) as any;

  // A mensagem entrou na fila? Pergunta ao banco em vez de deduzir de
  // `fila_criada`: a chave de envio de fotos (0085) pode ter cancelado a linha
  // no gatilho, e nesse caso `fila_criada` volta falso sem nada de errado.
  const { count: naFila } = await db
    .from("fila_liberacao").select("id", { count: "exact", head: true })
    .eq("org_id", org).eq("servico_id", servicoId).eq("tipo", "foto");

  return NextResponse.json({
    ok: true,
    servicoId,
    reaproveitado,
    data,
    comFoto: !!urlDepois,
    naFila: (naFila || 0) > 0,
    valor: Number(r?.valor) || 0,
    debitou: !!r?.debito_criado,
    remuneracao: r?.remuneracao ?? null,
    material: Number(r?.custo_material) || 0,
    lancamentosDatados: Number(d?.lancamentos_ajustados) || 0,
    // "já estava executado" é o normal AQUI — o serviço nasce executado de
    // propósito. Mostrar isso como reparo assustaria à toa.
    reparos: ((r?.reparos as string[]) || []).filter((x) => !/ja estava executado/i.test(x)),
  });
}
