import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { valorDaLimpeza } from "@/lib/valor-limpeza";

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
 * Corpo: { tumuloId, dataPrevista, valor?, observacao?, prioridade?,
 *           clienteId?, momentoCobranca? }
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
    .select("id,cliente_id,familia_id,identificacao,codigo")
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
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    return NextResponse.json({ ok: false, erro: "valor_invalido" }, { status: 400 });
  }

  // QUANDO SE RECEBE (0132). Vazio herda "depois", que é como o sistema sempre
  // se comportou. `contra_foto` existe no enum desde sempre e continua aceito.
  const momento = String(b?.momentoCobranca || "").trim();
  if (momento && !["antes", "depois", "contra_foto"].includes(momento)) {
    return NextResponse.json(
      { ok: false, erro: "momento_invalido",
        mensagem: "O recebimento é antes, depois, ou contra a foto." },
      { status: 400 });
  }

  // QUEM PEDIU, DENTRE OS CONTATOS DA FAMÍLIA.
  //
  // Sem escolha, herda o contato que acerta a conta do jazigo — o que esta
  // rota já fazia. Com escolha, o pedido fica no nome de quem ligou: numa
  // família com quatro pessoas, "foi a Sônia que pediu" é a diferença entre
  // saber e adivinhar na hora de cobrar.
  //
  // O contato é conferido contra a FAMÍLIA do jazigo: um id de outra família
  // passaria pelo banco (a coluna só exige que exista) e poria o pedido no
  // nome de um estranho.
  let clienteId = (tum as any).cliente_id as string | null;
  if (b?.clienteId) {
    const { data: quem } = await db
      .from("clientes").select("id,familia_id")
      .eq("id", String(b.clienteId)).eq("org_id", org).maybeSingle();
    if (!quem || (quem as any).familia_id !== (tum as any).familia_id) {
      return NextResponse.json(
        { ok: false, erro: "contato_de_outra_familia",
          mensagem: "Esse contato não é desta família." },
        { status: 400 });
    }
    clienteId = (quem as any).id;
  }

  const base: Record<string, any> = {
    org_id: org,
    tumulo_id: tumuloId,
    plano_id: null,
    // Esta porta SÓ é aberta por alguém pedindo — é a tela de marcar uma
    // limpeza para um jazigo, com a data que a família quer (0128).
    origem: "pedido",
    cliente_id: clienteId,
    ...(momento ? { momento_cobranca: momento } : {}),
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
        // A LIMPEZA CONSOME O QUE FOI PAGO.
        //
        // No modo consumo cada limpeza debita o seu valor, e o saldo passa a
        // mostrar a sobra: pagou R$ 100, recebeu duas de R$ 25, sobram R$ 50 a
        // favor dela. No modo competência o valor é 0, porque o mês já foi
        // debitado inteiro — somar os dois cobraria duas vezes.
        const valorLimpeza = await valorDaLimpeza(fam);
        await db.from("conta_corrente").insert({
          org_id: org,
          familia_id: fam,
          tumulo_id: tumuloId,
          tipo: "debito",
          origem: "lavagem",
          competencia: null,
          valor: valorLimpeza,
          descricao: `Limpeza realizada${onde}`,
          data,
        });
      }
    } catch {
      // Só o registro visual. A limpeza está gravada em `servicos`, que é a
      // prova do trabalho — não pode cair por causa do espelho.
    }
  }

  // ==========================================================================
  // RECEBIMENTO ANTES: A DÍVIDA NASCE AGORA (0132)
  // ==========================================================================
  //
  // "Antes" só é uma escolha de verdade se ela FIZER alguma coisa. Guardar a
  // palavra e cobrar do mesmo jeito na conclusão seria um rótulo.
  //
  // Então o débito entra hoje, com o preço que foi digitado — e a partir daí a
  // régua de cobrança enxerga e a família pode pagar antes da limpeza.
  //
  // O PREÇO É O DO SERVIÇO, e não `valorDaLimpeza()`. Aquela conta devolve
  // ZERO para família que não seja contratada em modo consumo — uma avulsa
  // para quem não tem contrato viraria um débito de R$ 0,00, trabalho feito
  // que nunca vira dinheiro.
  //
  // Sem valor não há débito: cobrar R$ 0,00 é pior que não cobrar, porque
  // parece cobrança feita.
  let cobrancaCriada = false;
  if (!jaFeita && momento === "antes" && valor !== null && valor > 0) {
    const fam = (tum as any).familia_id;
    if (fam) {
      const onde = (tum as any)?.codigo ? ` · ${(tum as any).codigo}` : "";
      const { error: eDeb } = await db.from("conta_corrente").insert({
        org_id: org,
        familia_id: fam,
        tumulo_id: tumuloId,
        cliente_id: clienteId,
        servico_id: (srv as any)?.id || null,
        tipo: "debito",
        // `avulso` é a origem que a 0073 reservou para "a limpeza fora do
        // plano, o arranjo de flores, o bronze" — é exatamente este caso.
        origem: "avulso",
        competencia: null,
        valor,
        descricao: `Limpeza avulsa${onde}`,
        data,
      });
      cobrancaCriada = !eDeb;
    }
  }

  return NextResponse.json({
    ok: true,
    servicoId: (srv as any)?.id,
    jaFeita,
    dataPrevista: data,
    momentoCobranca: momento || "depois",
    cobrancaCriada,
    semMigration: semColuna,
  });
}
