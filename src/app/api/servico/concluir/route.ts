import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { subirFotoServico, notificarFamilia } from "@/lib/servico";
import { consumirMaterial } from "@/lib/consumo";
import { carimbarRemuneracao, ehAvulso } from "@/lib/remuneracao";
import { diaOperacao } from "@/lib/vencimento";
import { registrarErro } from "@/lib/monitor";
import { rascunhoDaLavagem } from "@/lib/mensagens";
import { valorDaLimpeza } from "@/lib/valor-limpeza";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { servicoId, fotoDepoisBase64, mimetype, fotoAntesBase64?, lat?, lng? }
// A foto do DEPOIS fecha o serviço, DEBITA o razão do cliente (A1) e vai pra família.
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const servicoId: string = body?.servicoId;
  const fotoDepois: string = body?.fotoDepoisBase64;
  const mimetype: string = body?.mimetype || "image/jpeg";
  const fotoAntes: string | undefined = body?.fotoAntesBase64;
  const lat = body?.lat != null ? Number(body.lat) : null;
  const lng = body?.lng != null ? Number(body.lng) : null;

  if (!servicoId || !fotoDepois) {
    return NextResponse.json({ ok: false, erro: "foto_depois_obrigatoria" }, { status: 400 });
  }

  const urlDepois = await subirFotoServico(servicoId, fotoDepois, mimetype, "depois");
  const urlAntes = fotoAntes ? await subirFotoServico(servicoId, fotoAntes, mimetype, "antes") : null;
  if (!urlDepois) {
    return NextResponse.json({ ok: false, erro: "falha_upload_foto" }, { status: 500 });
  }

  // tempo gasto: do "iniciar" até agora. Sem início registrado fica nulo,
  // e o painel mostra "não medido" em vez de inventar um número.
  const { data: antes } = await db
    .from("servicos").select("iniciado_em").eq("id", servicoId).maybeSingle();
  const inicio = (antes as any)?.iniciado_em ? new Date((antes as any).iniciado_em).getTime() : null;
  const duracao = inicio ? Math.max(1, Math.round((Date.now() - inicio) / 60000)) : null;

  // COMO ESTA FAMILIA PAGA (corrige a divergencia apontada na entrega 15):
  // esta porta debitava sempre, mesmo em plano pre-pago — a familia que pagou
  // adiantado era cobrada duas vezes. Agora as duas portas (campo e painel)
  // leem o momento_cobranca do plano e se comportam igual.
  const { data: planoCob } = await db
    .from("servicos")
    .select("planos(momento_cobranca)")
    .eq("id", servicoId)
    .maybeSingle();
  const momento = ((planoCob as any)?.planos?.momento_cobranca as string) || "depois";
  const agoraIso = new Date().toISOString();

  // marca executado (idempotente: só transiciona se ainda não executado)
  const { data: serv, error } = await db
    .from("servicos")
    .update({
      status: "executado",
      data_executada: agoraIso,
      duracao_minutos: duracao,
      foto_depois_url: urlDepois,
      // A FOTO DO ANTES SO E GRAVADA QUANDO VEM UMA NOVA.
      //
      // Ela normalmente ja subiu la no "Comecar" (api/campo/iniciar grava
      // foto_antes_url). O Concluir so manda fotoAntesBase64 se a Nina tirar
      // OUTRA — e a propria tela desaconselha isso ("aqui ela so aparece
      // confirmada", senao fotografaria o jazigo ja limpo).
      //
      // Escrevendo `foto_antes_url: urlAntes` sem condicional, TODA conclusao
      // normal do campo gravava null e APAGAVA a foto do antes: o arquivo
      // continuava no Storage, mas o ponteiro do banco sumia. Ninguem percebia
      // porque nem o portal da familia nem o WhatsApp mostram o antes — e o
      // site vende "antes e depois" em tres lugares.
      //
      // O concluir-admin (painel) ja fazia certo; agora as duas portas
      // se comportam igual.
      ...(urlAntes ? { foto_antes_url: urlAntes } : {}),
      executora_id: auth.userId,
      // no "contra_foto" e a entrega que libera a cobranca
      ...(momento === "contra_foto" ? { cobranca_liberada_em: agoraIso } : {}),
    })
    .eq("id", servicoId)
    .neq("status", "executado")
    .select("org_id,tumulo_id,cliente_id,valor,plano_id,executora_id,planos(cadencia)")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!serv) {
    // já estava executado antes — não duplica débito nem notificação

  return NextResponse.json({ ok: true, jaExecutado: true });
  }

  const orgId = (serv as any).org_id as string;
  const clienteId = (serv as any).cliente_id as string | null;

  // ------------------------------------------------------------------
  // REGISTRO DA LAVAGEM NO EXTRATO — valor ZERO, de propósito.
  //
  // A lavagem aparece na conta corrente para a Sureya acompanhar numa lista
  // só: "limpou dia 15, limpou dia 22, cobrou no fim do mês". É histórico
  // dentro do extrato financeiro.
  //
  // MAS NÃO MEXE NO SALDO. Quem gera a dívida é a competência. Se a lavagem
  // também lançasse valor, a família seria cobrada duas vezes pelo mesmo
  // serviço — uma pela execução e outra pelo fechamento do mês.
  //
  // Falhar aqui não pode derrubar a conclusão: a Nina já fez o trabalho.
  // ------------------------------------------------------------------
  try {
    const tumuloRegistro = (serv as any).tumulo_id as string | null;
    const { data: tReg } = await db
      .from("tumulos").select("familia_id,codigo").eq("id", tumuloRegistro).maybeSingle();
    const famReg = (tReg as any)?.familia_id as string | null;

    if (famReg) {
      const hoje = agoraIso.slice(0, 10);
      const onde = (tReg as any)?.codigo ? ` · ${(tReg as any).codigo}` : "";
      await db.from("conta_corrente").insert({
        org_id: orgId,
        familia_id: famReg,
        tumulo_id: tumuloRegistro,
        tipo: "debito",           // lado irrelevante: o valor é 0
        origem: "lavagem",
        competencia: null,
        valor: 0,
        descricao: `Limpeza realizada${onde}`,
        data: hoje,
      });
    }
  } catch {
    // Índice único barrou (reprocessamento) ou algo falhou: é só o registro
    // visual do extrato. A lavagem está gravada em `servicos`, que é a prova.
  }

  // ------------------------------------------------------------------
  // RASCUNHO PARA A FILA DE LIBERAÇÃO
  //
  // A lavagem acabou de ser concluída, então esta é a hora de preparar a
  // mensagem com as fotos. Mas NADA É ENVIADO AQUI: o rascunho entra na fila
  // como 'aguardando' e fica parado até a Sureya olhar e aprovar, uma
  // mensagem por vez.
  //
  // Isso é deliberado. O que faz a família ficar é receber a foto do túmulo
  // limpo com uma palavra de gente — mensagem automática de robô quebra
  // exatamente esse encanto, ainda mais com público idoso. O sistema tira o
  // trabalho repetitivo (baixar foto, achar o contato, digitar o texto) e
  // devolve a decisão para ela.
  //
  // Falhar aqui não pode derrubar a conclusão da lavagem: a Nina já fez o
  // serviço e a foto já subiu. Por isso todo o bloco vai em try/catch mudo.
  // ------------------------------------------------------------------
  try {
    const tumuloId = (serv as any).tumulo_id as string | null;

    const { data: tum } = await db
      .from("tumulos")
      .select("familia_id,foto_antes_url")
      .eq("id", tumuloId)
      .maybeSingle();

    const familiaId = (tum as any)?.familia_id as string | null;

    if (familiaId) {
      // Para quem vai: quem recebe as fotos de carinho, não necessariamente
      // quem paga. É o filho que acerta a conta, mas às vezes é a neta que
      // acompanha o cuidado.
      const { data: pessoas } = await db
        .from("clientes")
        .select("id,nome,recebe_fotos,responsavel_financeiro")
        .eq("familia_id", familiaId);

      const lista = (pessoas || []) as any[];
      const destino =
        lista.find((p) => p.recebe_fotos) ||
        lista.find((p) => p.responsavel_financeiro) ||
        lista[0];

      if (destino) {
        const rascunho = rascunhoDaLavagem({
          familiaId,
          clienteId: destino.id,
          tumuloId: tumuloId!,
          servicoId,
          nome: destino.nome || "",
          fotoAntes: (tum as any)?.foto_antes_url || urlAntes || null,
          fotoDepois: urlDepois || null,
        });

        await db.from("fila_liberacao").insert({
          org_id: orgId,
          familia_id: rascunho.familiaId,
          cliente_id: rascunho.clienteId,
          tumulo_id: rascunho.tumuloId,
          servico_id: rascunho.servicoId,
          tipo: rascunho.tipo,
          texto: rascunho.texto,
          fotos: rascunho.fotos,
        });
      }
    }
  } catch {
    // Silêncio proposital: a lavagem está registrada e a foto salva. Se o
    // rascunho não nasceu, a Sureya manda a mensagem à mão, como sempre fez.
  }

  // O QUE ESTA LAVAGEM VALEU, resolvido uma vez e usado por todos daqui pra
  // baixo: o debito, o carimbo da remuneracao e o proprio servico.
  let valor = Number((serv as any).valor) || 0;
  let debitoFalhou = false;

  // ----- A1: débito no razão (idempotente por servico_id) -----
  // momento "antes" = pre-pago: a familia ja pagou, nao debita de novo.
  if (clienteId && momento !== "antes") {
    if (!valor && (serv as any).plano_id) {
      const { data: plano } = await db
        .from("planos")
        .select("valor_vigente")
        .eq("id", (serv as any).plano_id)
        .maybeSingle();
      valor = Number((plano as any)?.valor_vigente) || 0;
    }
    if (!valor) {
      const { data: org } = await db
        .from("orgs")
        .select("valor_referencia_limpeza")
        .eq("id", orgId)
        .maybeSingle();
      valor = Number((org as any)?.valor_referencia_limpeza) || 40;
    }

    const { data: jaDebitado } = await db
      .from("movimentos")
      .select("id")
      .eq("servico_id", servicoId)
      .eq("tipo", "debito")
      .maybeSingle();

    if (!jaDebitado) {
      const { error: eDeb } = await db.from("movimentos").insert({
        org_id: orgId,
        cliente_id: clienteId,
        tipo: "debito",
        valor,
        origem: "servico",
        servico_id: servicoId,
        status_conc: "confirmado",
        descricao: "Limpeza executada",
        // o debito entra no dia de Sao Paulo: com UTC, limpeza concluida
        // depois das 21h caia no dia (e no mes) seguinte
        data: diaOperacao(),
      });
      // DEBITO QUE FALHA NAO PODE VIRAR ok:true CALADO.
      // Antes: um console.error e a resposta seguia como sucesso. A limpeza
      // ficava feita e NAO cobrada, sem sinal em lugar nenhum — o prejuizo so
      // aparecia meses depois, se alguem cruzasse servicos com movimentos.
      // Agora vai para erros_log (aparece em Config -> Diagnostico) e volta na
      // resposta, para a tela poder avisar.
      if (eDeb) {
        debitoFalhou = true;
        console.error("[concluir] débito falhou:", eDeb.message);
        await registrarErro("servico/concluir: débito não lançado", eDeb.message, {
          servicoId, clienteId, valor,
        });
      }
    }
  }

  // CONGELA O VALOR NO SERVICO (paridade com o concluir-admin, que ja fazia).
  // O debito saia pela cascata valor -> plano -> referencia da casa, mas o
  // servico continuava com `valor` nulo: a tela de Avulsos mostrava "—" ao lado
  // de "lançada · R$ 40,00", e o Resultado por jazigo nao via receita nenhuma.
  if (valor > 0 && !Number((serv as any).valor)) {
    await db.from("servicos").update({ valor }).eq("id", servicoId);
  }

  // GPS do túmulo na primeira conclusão
  if (lat != null && lng != null && (serv as any)?.tumulo_id) {
    // a leitura da Nina ENTRA NA MÉDIA; a posição oficial vem do cadastro.
    // Se o jazigo ainda não tem posição, a primeira leitura dela vira o ponto inicial.
    await db.rpc("sureya_registrar_gps", {
      p_tumulo: (serv as any).tumulo_id,
      p_lat: lat, p_lng: lng,
      p_precisao: body?.precisao != null ? Number(body.precisao) : 15,
      p_origem: "conclusao",
    }).then(() => null, () => null);
  }

  // quanto ESTA lavagem vale para quem executou, congelado agora (0031).
  // Nao derruba a conclusao se a regra ainda nao existir.
  // A RECEITA E O VALOR RESOLVIDO, nao o que estava gravado antes.
  // Passava `serv.valor` cru — que e nulo justamente nos avulsos. Numa regra
  // por percentual, a familia pagava R$ 40 e a ajudante ganhava R$ 0,00, sem
  // erro em lugar nenhum.
  await carimbarRemuneracao(db, {
    servicoId,
    orgId,
    executoraId: auth.userId,
    receita: valor,
    avulso: ehAvulso(serv as any),
  });

  const aviso = await notificarFamilia(servicoId, urlDepois);
  const notificado = aviso.enviado;

  // baixa o estoque pelo consumo estimado e guarda o custo desta limpeza
  const material = await consumirMaterial(servicoId).catch(() => ({ total: 0, itens: [] }));

  return NextResponse.json({ ok: true, duracao, material, notificado, motivoEnvio: aviso.motivo, valor, debitoFalhou });
}
