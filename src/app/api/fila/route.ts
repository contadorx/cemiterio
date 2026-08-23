import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { enviarWhatsapp, enviarWhatsappMidia } from "@/lib/evolution";
import { statusConexao } from "@/lib/evolution-admin";

/**
 * FILA DE LIBERAÇÃO — o sistema prepara, a Sureya decide.
 *
 * Não existe cron, gatilho ou rotina que envie sozinha. A única forma de uma
 * mensagem sair daqui é um POST com acao='enviar', disparado pelo toque da
 * Sureya na tela. Isso é por desenho: robô conversando com idoso quebra
 * exatamente o que faz o cliente ficar.
 */

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const org = env.orgId();

  // FILTRO POR TIPO.
  //
  // Desde a 0094 a fila recebe TUDO: foto da lavagem, cobrança, lembrete,
  // agradecimento, comemorativa e convite de serviço. Numa lista única, decidir
  // sobre trinta fotos e duas cobranças no mesmo scroll é como as cobranças
  // passam batido — são decisões de natureza diferente, tomadas em momentos
  // diferentes.
  //
  // O filtro é aplicado no BANCO e não na tela: o limite de 100 itens é do
  // banco, e filtrar depois traria as 100 fotos e mostraria zero cobranças.
  const tipoFiltro = (req.nextUrl.searchParams.get("tipo") || "").trim();

  // O QUE MORREU NO MEIO DO CAMINHO VOLTA PARA A FILA.
  //
  // A reserva marca `enviando` antes de chamar a Evolution. Se o processo cair
  // ali — timeout da função, deploy no meio, rede — ninguém devolvia o item. E
  // a tela lista só `aguardando`: a mensagem sumia, a família não recebia, e
  // não havia tela em que isso aparecesse. Pior tipo de falha, porque não gera
  // erro para alguém ver.
  //
  // Roda ao abrir a tela, não em cron: rotina que mexe em fila sozinha, sem
  // ninguém olhando, é justamente como o item some.
  await db.rpc("sureya_fila_destravar", { p_minutos: 10 }).then(
    () => {}, (e: any) => console.error("[fila] destravar falhou:", e?.message),
  );

  let consulta = db
    .from("fila_liberacao")
    .select(
      "id,tipo,status,texto,fotos,criado_em,servico_id,familia_id,tumulo_id," +
        "tentativas,ultimo_erro,ultimo_erro_em,erro_tipo,fotos_enviadas," +
        "familias(nome,silenciar),clientes(nome,telefone)," +
        "tumulos(codigo,identificacao,ruas(nome),quadras(codigo))," +
        "servicos(foto_antes_url,foto_depois_url,data_executada)"
    )
    .eq("org_id", org)
    .eq("status", "aguardando");
  if (tipoFiltro) consulta = consulta.eq("tipo", tipoFiltro);

  const { data, error } = await consulta
    .order("criado_em", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // QUANTAS DE CADA TIPO ESTÃO ESPERANDO — contadas SEM o filtro, senão os
  // números das abas sumiriam assim que uma aba fosse escolhida.
  const { data: todosTipos } = await db
    .from("fila_liberacao").select("tipo")
    .eq("org_id", org).eq("status", "aguardando").limit(2000);
  const porTipo: Record<string, number> = {};
  for (const r of ((todosTipos as any[]) || [])) {
    porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1;
  }

  // ------------------------------------------------------------------------
  // QUANDO ESTA FAMÍLIA RECEBEU FOTO PELA ÚLTIMA VEZ (migration 0087)
  //
  // Pedido dela: "preciso da indicação da última data de foto enviada para
  // decidir ou não enviar — não quero manter a frequência toda data". A foto é
  // um gesto; mandar em toda limpeza transforma carinho em rotina, e a família
  // de plano semanal receberia cinquenta por ano.
  //
  // Duas consultas em lote, não uma por item: com vinte mensagens na fila, uma
  // por item seriam quarenta idas ao banco para desenhar uma linha de texto.
  //
  // A view junta os DOIS caminhos de envio — a fila e o envio automático da
  // conclusão. Olhar só a fila diria "nunca recebeu" para quem recebeu pela
  // conclusão, e a Sureya mandaria de novo achando que era a primeira vez.
  // ------------------------------------------------------------------------
  const familiaIds = [...new Set((data || []).map((f: any) => f.familia_id).filter(Boolean))];
  const tumuloIds  = [...new Set((data || []).map((f: any) => f.tumulo_id).filter(Boolean))];

  const [{ data: ultFam }, { data: ultJaz }, { data: cfg }, { data: ultAcao }] = await Promise.all([
    familiaIds.length
      ? db.from("sureya_ultima_foto_familia").select("familia_id,ultima_em,total")
          .eq("org_id", org).in("familia_id", familiaIds)
      : Promise.resolve({ data: [] } as any),
    tumuloIds.length
      ? db.from("sureya_ultima_foto_jazigo").select("tumulo_id,ultima_em,total")
          .eq("org_id", org).in("tumulo_id", tumuloIds)
      : Promise.resolve({ data: [] } as any),
    db.from("orgs").select("dias_entre_fotos,disparos_ativos").eq("id", org).maybeSingle(),
    // A ÚLTIMA AÇÃO — de qualquer tipo, não só foto (0094).
    //
    // A pergunta que ela faz antes de liberar não é só "já mandei foto?": é
    // "eu já não falei com essa gente esta semana?". Três mensagens no mesmo
    // dia, cada uma de um tipo, cada uma liberada sozinha sem que nada na tela
    // dissesse que as outras duas existiam — é assim que se cansa uma família.
    familiaIds.length
      ? db.from("sureya_ultima_acao_familia").select("familia_id,tipo,dia")
          .eq("org_id", org).in("familia_id", familiaIds)
      : Promise.resolve({ data: [] } as any),
  ]);

  // O SALDO DA FAMÍLIA — para separar "cobrança" de "INADIMPLENTE".
  //
  // Os dois não são a mesma fila e não se decidem do mesmo jeito. A cobrança
  // de rotina vai para quem tem uma competência a vencer; a de inadimplência
  // vai para quem já deve, e essa conversa tem outro tom, outro texto e outra
  // urgência. Sem o saldo aqui, a tela não conseguia distinguir e a Sureya
  // liberava as duas com o mesmo clique.
  const { data: saldos } = familiaIds.length
    ? await db.from("saldo_familia").select("familia_id,saldo")
        .eq("org_id", org).in("familia_id", familiaIds)
    : { data: [] as any[] };
  const saldoDaFamilia = new Map<string, number>(
    ((saldos || []) as any[]).map((r) => [r.familia_id, Number(r.saldo) || 0]),
  );

  const porFamilia = new Map<string, any>(((ultFam || []) as any[]).map((r) => [r.familia_id, r]));
  const porJazigo  = new Map<string, any>(((ultJaz || []) as any[]).map((r) => [r.tumulo_id, r]));

  // Duas leituras da mesma lista, porque são duas perguntas: a última do MESMO
  // tipo ("já mandei cobrança para essa família?") e a última de QUALQUER tipo
  // ("já falei com essa gente?").
  const acoesDaFamilia = new Map<string, any[]>();
  for (const a of ((ultAcao as any[]) || [])) {
    const arr = acoesDaFamilia.get(a.familia_id) || [];
    arr.push(a);
    acoesDaFamilia.set(a.familia_id, arr);
  }

  // Zero desliga o aviso. `?? 30` cobre o banco antigo, antes da coluna existir.
  const diasEntreFotos = Number((cfg as any)?.dias_entre_fotos ?? 30) || 0;

  const itens = (data || []).map((f: any) => {
    // QUAL É O ANTES E QUAL É O DEPOIS.
    //
    // `fotos` é montada como `[antes, depois]` com os nulos removidos (0066).
    // Com duas fotos a ordem resolve; com UMA, a posição não diz nada — pode
    // ser um serviço sem foto do antes, ou sem a do depois. Adivinhar pela
    // posição erra o rótulo justamente no caso em que ele importa.
    //
    // Por isso o rótulo vem do serviço, comparando a URL. Foto que não casa com
    // nenhuma das duas fica sem rótulo, em vez de receber um chute.
    const antes  = f.servicos?.foto_antes_url  || null;
    const depois = f.servicos?.foto_depois_url || null;
    const fotos = (Array.isArray(f.fotos) ? f.fotos : []).map((url: string) => ({
      url,
      etapa: url === antes ? "antes" : url === depois ? "depois" : null,
    }));

    return {
    id: f.id,
    tipo: f.tipo,
    texto: f.texto,
    fotos,
    criadoEm: f.criado_em,
    // QUANDO A LIMPEZA FOI FEITA — não quando a mensagem entrou na fila. É o
    // que a família vai perguntar, e é o que o roadmap pede ("data/hora").
    executadoEm: f.servicos?.data_executada ?? null,
    familia: f.familias?.nome ?? null,
    // Família e destinatário são coisas diferentes: a mensagem é sobre o jazigo
    // da família, e vai para UMA pessoa dela. A tela mostrava `para || familia`,
    // que some com a distinção justamente quando o destinatário é a neta e não
    // quem contratou.
    para: f.clientes?.nome ?? null,
    jazigo: f.tumulos?.identificacao || f.tumulos?.codigo || null,
    telefone: f.clientes?.telefone ?? null,
    local: f.tumulos
      ? [f.tumulos.quadras?.codigo, f.tumulos.ruas?.nome].filter(Boolean).join(" · ")
      : null,
    // O ESTADO LEGÍVEL. Sem isto a tela só sabe dizer "aguardando" — e uma
    // mensagem que falhou seis vezes fica igualzinha a uma que acabou de
    // entrar na fila.
    tentativas: Number(f.tentativas) || 0,
    ultimoErro: f.ultimo_erro || null,
    ultimoErroEm: f.ultimo_erro_em || null,
    erroTipo: f.erro_tipo || null,
    fotosEnviadas: Number(f.fotos_enviadas) || 0,

    // A ÚLTIMA FOTO QUE ESTA FAMÍLIA RECEBEU.
    //
    // `null` aqui significa NUNCA recebeu — que é diferente de "recebeu hoje" e
    // é justamente o caso em que ela manda sem pensar. A tela precisa dizer as
    // duas coisas com palavras diferentes.
    // Positivo = a família DEVE. É o corte do grupo "Inadimplente".
    saldoDevedor: Math.max(0, saldoDaFamilia.get(f.familia_id) ?? 0),
    ultimaFotoFamiliaEm: porFamilia.get(f.familia_id)?.ultima_em ?? null,
    ultimaFotoFamiliaTotal: Number(porFamilia.get(f.familia_id)?.total) || 0,
    // O grão do jazigo responde a segunda pergunta, que só existe para família
    // com mais de uma pedra: "recebeu foto há 8 dias" pode ter sido da OUTRA.
    ultimaFotoJazigoEm: porJazigo.get(f.tumulo_id)?.ultima_em ?? null,

    // A ÚLTIMA AÇÃO DESTA FAMÍLIA (0094), nas duas leituras.
    ultimaAcao: (() => {
      const arr = acoesDaFamilia.get(f.familia_id) || [];
      if (!arr.length) return null;
      const maisRecente = arr.reduce((a, b) => (a.dia >= b.dia ? a : b));
      const mesmoTipo = arr.find((a) => a.tipo === f.tipo) || null;
      return {
        tipo: maisRecente.tipo,
        dia: maisRecente.dia,
        mesmoTipoDia: mesmoTipo?.dia ?? null,
      };
    })(),

    // O QUE ESTA FAMÍLIA PEDIU PARA NÃO RECEBER. Vai junto para a tela poder
    // oferecer "não enviar mais deste tipo" já sabendo o estado atual — e para
    // não oferecer silenciar o que já está silenciado.
    silenciados: Array.isArray(f.familias?.silenciar) ? f.familias.silenciar : [],
    familiaId: f.familia_id ?? null,
    };
  });

  // O ESTADO DO WHATSAPP vai junto com a lista.
  // Sem isto, a Sureya só descobriria que a instância caiu ao tocar em
  // "Enviar" — depois de revisar cada mensagem. Melhor avisar no topo.
  let whatsapp = "desconhecido";
  try {
    const st = await statusConexao();
    whatsapp = st.estado;
  } catch {
    whatsapp = "erro";
  }

  // A CHAVE MESTRA vai para a tela. Enquanto ela estiver desligada, NADA sai
  // sozinho — nem a resposta da IA, nem a fila de envios, nem a foto da
  // conclusão. O envio pela tela continua funcionando: ele não passa por aqui.
  // Quem lê a fila precisa saber em qual dos dois mundos está.
  const disparosAutomaticos = !!(cfg as any)?.disparos_ativos;

  return NextResponse.json({ ok: true, itens, whatsapp, diasEntreFotos, porTipo,
                             disparosAutomaticos, tipo: tipoFiltro || null });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { id, acao, texto } = await req.json();

  // O `id` e conferido ANTES de qualquer acao. Sem isto, `restaurar` sem id
  // viraria um update com `.eq("id", undefined)` — que o PostgREST nao rejeita
  // do jeito que se espera, e o resultado seria uma consulta sem filtro de id.
  if (!id || !["enviar", "descartar", "restaurar"].includes(acao)) {
    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  }

  // DESFAZER O DESCARTE.
  //
  // "Não enviar" era irreversível: a mensagem saía da lista e não havia como
  // trazê-la de volta pela tela. Descartar por engano a foto da limpeza do
  // túmulo do pai de alguém não deveria custar um chamado técnico.
  //
  // Só volta o que foi descartado — `where status = 'descartado'` garante que
  // isto nunca ressuscita algo já enviado.
  if (acao === "restaurar") {
    const { data: d, error: eR } = await db
      .from("fila_liberacao")
      .update({ status: "aguardando", decidido_em: null, decidido_por: null })
      .eq("id", id).eq("org_id", org).eq("status", "descartado")
      .select("id").maybeSingle();
    if (eR) return NextResponse.json({ ok: false, erro: eR.message }, { status: 500 });
    if (!d) {
      return NextResponse.json(
        { ok: false, erro: "Esta mensagem não está descartada." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, restaurada: true });
  }

  // Reserva o item ANTES de enviar: muda para 'enviando' e só o primeiro
  // pedido consegue. Sem isto, um clique duplo mandaria a mesma foto duas
  // vezes para a família — e o WhatsApp não tem desfazer.
  if (acao === "descartar") {
    const { data: d, error: eD } = await db
      .from("fila_liberacao")
      .update({ status: "descartado", decidido_em: new Date().toISOString() })
      .eq("id", id).eq("org_id", org).eq("status", "aguardando")
      .select("id").maybeSingle();
    if (eD) return NextResponse.json({ ok: false, erro: eD.message }, { status: 500 });
    if (!d) return NextResponse.json({ ok: false, erro: "Esta mensagem já foi decidida." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  // A reserva continua sendo "só o primeiro pedido consegue" — o clique duplo
  // perde a corrida contra `where status = 'aguardando'`. O que ela passou a
  // devolver é ONDE O ENVIO ANTERIOR PAROU.
  const { data: reservado, error: eRes } = await db
    .rpc("sureya_fila_reservar", { p_item: id });

  if (eRes) return NextResponse.json({ ok: false, erro: eRes.message }, { status: 500 });
  const item = (Array.isArray(reservado) ? reservado[0] : reservado) as any;
  if (!item) {
    return NextResponse.json(
      { ok: false, erro: "Esta mensagem já foi decidida." },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------
  // O ENVIO DE VERDADE, pela Evolution.
  //
  // POR QUE NÃO wa.me: o link `wa.me?text=` carrega SÓ TEXTO. As fotos do
  // antes e do depois — que são o motivo da mensagem existir — ficariam para
  // trás, e a Sureya teria que anexá-las à mão, uma a uma, depois de aprovar.
  // Isso devolveria exatamente o trabalho que a fila existe para tirar.
  //
  // Isto NÃO é o agente de IA de volta: nada sai daqui sozinho. Cada envio é
  // consequência direta de a Sureya olhar a prévia e tocar em "Enviar".
  // -------------------------------------------------------------------
  const telefone = (item as any).telefone as string | undefined;
  if (!telefone) {
    // FALHA PERMANENTE: tentar de novo não resolve. Alguém tem de pôr o
    // telefone no cadastro. A tela precisa saber a diferença, porque a ação é
    // outra.
    await db.rpc("sureya_fila_soltar", {
      p_item: id,
      p_erro: "Esta pessoa não tem WhatsApp cadastrado.",
      p_tipo: "permanente",
    });
    return NextResponse.json(
      { ok: false, erro: "Esta pessoa não tem WhatsApp cadastrado." },
      { status: 400 }
    );
  }

  const fotos: string[] = Array.isArray((item as any).fotos) ? (item as any).fotos : [];
  const corpo = String(texto || "");

  // ONDE A TENTATIVA ANTERIOR PAROU.
  //
  // Aqui estava o bug que o critério de saída do Build 6 nomeia — *"envio
  // repetido não duplica mensagem"*. O envio manda a legenda na primeira foto e
  // depois as outras, uma a uma. Se a segunda falhava, o item voltava para a
  // fila e a Sureya tocava em Enviar de novo: **a primeira foto saía pela
  // segunda vez.** Do lado da família, duas fotos iguais do túmulo do pai, com
  // a mesma legenda. E o WhatsApp não tem desfazer.
  //
  // `fotos_enviadas` é o marcador. Ele nunca diminui, então a retomada nunca
  // volta atrás.
  let enviadas = Number((item as any).fotos_enviadas) || 0;

  try {
    if (!fotos.length) {
      // Mensagem sem foto: ou saiu, ou não saiu. Não há meio caminho para
      // retomar — e por isso `enviadas` continua zero.
      await enviarWhatsapp(telefone, corpo);
    } else {
      // A legenda vai na PRIMEIRA foto. Assim a família abre a conversa e vê a
      // imagem com a palavra junto, como quem manda uma foto para um parente —
      // e não um texto seguido de anexos soltos.
      //
      // Numa retomada, a legenda JÁ FOI com a foto que já saiu. Repeti-la seria
      // mandar o texto duas vezes.
      for (let i = enviadas; i < fotos.length; i++) {
        await enviarWhatsappMidia(telefone, fotos[i], i === 0 ? corpo : "");
        enviadas = i + 1;
      }
    }
  } catch (e: any) {
    const detalhe = String(e?.message || "");
    const semConexao = /401|403|404|closed|not connected|instance/i.test(detalhe);

    // DEVOLVE PARA A FILA, GUARDANDO ONDE PAROU E POR QUÊ. Marcar como enviado
    // o que não saiu faria a família sumir da lista sem ter recebido nada — o
    // pior desfecho, porque ninguém descobriria.
    await db.rpc("sureya_fila_soltar", {
      p_item: id,
      p_erro: detalhe.slice(0, 500),
      // Desconexão é transitória: reconectar resolve. O resto entra como
      // transitório também, porque errar para o lado de "tente de novo" é mais
      // barato que marcar como permanente algo que sairia na segunda tentativa.
      p_tipo: "transitorio",
      p_fotos_enviadas: enviadas,
    });

    return NextResponse.json({
      ok: false,
      erro: semConexao
        ? "O WhatsApp está desconectado. Reconecte em Config e tente de novo — a mensagem continua na fila."
        : "Não consegui enviar agora. A mensagem continua na fila.",
      detalhe: detalhe.slice(0, 300),
      // Quantas já saíram: a tela pode dizer "2 de 3 fotos foram; ao tentar de
      // novo mando só a que falta".
      fotosEnviadas: enviadas,
      totalFotos: fotos.length,
    }, { status: 502 });
  }

  await db.rpc("sureya_fila_concluir", {
    p_item: id, p_texto: corpo, p_fotos: enviadas,
  });

  return NextResponse.json({ ok: true, fotosEnviadas: enviadas });
}
