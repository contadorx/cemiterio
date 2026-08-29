import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { env } from "@/lib/env";
import { responderTool } from "@/lib/persona";
import { montarSystemDeProducao } from "@/lib/atendimento";
import {
  carregarCliente, montarContexto, historicoConversa, carregarConfigIa,
} from "@/lib/context";
import { escolherModelo, registrarChamada } from "@/lib/modelo-ia";
import { podeChamarIa } from "@/lib/custo-ia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * A BANCADA DE CALIBRAÇÃO — a mesma pergunta, com dois ajustes, lado a lado.
 *
 * ---------------------------------------------------------------------------
 * O QUE HAVIA ANTES, E POR QUE NÃO SERVIA
 * ---------------------------------------------------------------------------
 * `/api/simulador` deixava conversar com a IA para "testar o tom". Três coisas
 * o tornavam incapaz de responder a pergunta que importa:
 *
 *   1. A FAMÍLIA ERA FICTÍCIA. O contexto era montado à mão ali dentro —
 *      "Maria (teste)", "Família Exemplo", saldo "em dia". Nenhum dos blocos
 *      que causaram os 44% de promessas (a tabela de extras da casa, os
 *      pedidos em aberto, os comprovantes a conferir) existia naquele
 *      contexto, porque ele não passava por `montarContexto`.
 *
 *   2. O PROMPT ERA OUTRO. A produção manda DOIS blocos, o primeiro cacheado;
 *      o simulador mandava um só, com o conhecimento embutido. Afinar ali era
 *      afinar contra um prompt que nunca rodou.
 *
 *   3. E ELE DIZIA "✓ sairia automático". Medido em 29/08: ZERO das 334
 *      famílias com IA ligada estão em modo automático — nenhuma mensagem sai
 *      sozinha, por decisão sua. O rótulo ensinava a confiar num caminho que
 *      não existe.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA ROTA FAZ
 * ---------------------------------------------------------------------------
 * Pega uma CONVERSA DE VERDADE, monta o contexto pelo MESMO caminho da
 * produção (`montarContexto` + `montarSystemDeProducao`) e responde a última
 * mensagem da família DUAS VEZES: uma com o tom e o conhecimento salvos, outra
 * com o rascunho que você está escrevendo. As duas respostas voltam lado a
 * lado.
 *
 * NÃO GRAVA RASCUNHO, NÃO CRIA COMPROMISSO, NÃO MANDA NADA PARA NINGUÉM.
 * O disparo continua sendo manual, pela fila das conversas. A única marca que
 * ela deixa é o custo da chamada — em `chamadas_ia`, com propósito
 * `calibragem`, para o gasto de testar não se esconder dentro do atendimento.
 *
 * ---------------------------------------------------------------------------
 * TEMPERATURA ZERO, DOS DOIS LADOS
 * ---------------------------------------------------------------------------
 * O modelo é amostrado: a MESMA pergunta com o MESMO prompt dá textos
 * diferentes a cada rodada. Numa tela de "antes e depois" isso é veneno — a
 * diferença que você veria seria em parte o seu ajuste e em parte o acaso, sem
 * jeito de separar, e você acabaria mudando o tom por causa de ruído.
 *
 * Com temperatura 0 dos dois lados, o que sobra de diferença é o seu ajuste. É
 * uma escolha da BANCADA, não da produção — e a tela diz isso.
 */

let _cli: Anthropic | null = null;
function anthropic() {
  if (!_cli) _cli = new Anthropic({ apiKey: env.anthropicKey() });
  return _cli;
}

/** As conversas que dá para calibrar: as que têm mensagem de família. */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data, error } = await auth.db
    .from("mensagens")
    .select("conversa_id,texto,created_at,autor,clientes(nome)")
    .eq("org_id", org)
    .eq("autor", "cliente")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // UMA LINHA POR CONVERSA, a mais recente. Em 29/08 são 17 conversas com
  // mensagem de família, de 174 no total — as outras 157 são só coisa que
  // saiu daqui, e não há o que calibrar contra uma conversa em que ninguém
  // perguntou nada.
  const vistas = new Set<string>();
  const lista: any[] = [];
  for (const m of (data as any[]) || []) {
    if (!m.conversa_id || vistas.has(m.conversa_id)) continue;
    vistas.add(m.conversa_id);
    lista.push({
      conversaId: m.conversa_id,
      cliente: m.clientes?.nome || "(sem nome)",
      ultima: m.texto || "",
      em: m.created_at,
    });
  }

  return NextResponse.json({ ok: true, conversas: lista, quantas: lista.length });
}

type Lado = {
  resposta: string;
  assunto: string | null;
  confianca: string | null;
  precisaHumano: boolean;
  prometeuVoltar: boolean;
  promessaSobre: string | null;
  motivo: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const conversaId = String(b?.conversaId || "").trim();
  if (!conversaId) return NextResponse.json({ ok: false, erro: "sem_conversa" }, { status: 400 });

  const { data: conv } = await auth.db
    .from("conversas").select("id,cliente_id").eq("org_id", org).eq("id", conversaId).maybeSingle();
  const clienteId = (conv as any)?.cliente_id as string | undefined;
  if (!clienteId) {
    return NextResponse.json(
      { ok: false, erro: "conversa_sem_familia",
        mensagem: "Esta conversa não está ligada a uma família — não há contexto para calibrar." },
      { status: 400 });
  }

  const cliente = await carregarCliente(clienteId);
  if (!cliente) return NextResponse.json({ ok: false, erro: "familia_sumiu" }, { status: 404 });

  // O TETO DO DIA VALE PARA A BANCADA TAMBÉM, e ela é a última da fila.
  // Testar o tom não pode consumir a cota que faz a IA responder uma família
  // de verdade — então se o teto está a duas chamadas de estourar, a bancada
  // recusa e diz por quê, em vez de gastar e deixar o atendimento mudo depois.
  const custo = await podeChamarIa();
  if (!custo.pode || (custo.teto > 0 && custo.usadas + 1 > custo.teto)) {
    return NextResponse.json(
      { ok: false, erro: "teto_do_dia",
        mensagem: `O teto de IA do dia está no fim (${custo.usadas}/${custo.teto}). `
                + `A bancada não passa na frente das famílias — tente amanhã ou suba o teto.` },
      { status: 429 });
  }

  const ctx = await montarContexto(cliente);
  const historicoReal = await historicoConversa(conversaId);
  const salvo = await carregarConfigIa();

  // A MENSAGEM DIGITADA ENTRA DEPOIS DA CONVERSA DE VERDADE, não no lugar
  // dela. É como testar "e se ela perguntasse isso agora?" sem perder tudo o
  // que já foi combinado com esta família.
  const extra = String(b?.mensagem || "").trim();
  const historico = extra
    ? [...historicoReal, { role: "user" as const, content: extra }]
    : historicoReal;
  if (!historico.length) {
    return NextResponse.json(
      { ok: false, erro: "conversa_vazia",
        mensagem: "Esta conversa não tem mensagem nenhuma para responder." },
      { status: 400 });
  }

  const rascunho = {
    conhecimento: b?.conhecimento === undefined ? salvo.conhecimento : String(b.conhecimento || ""),
    tom: b?.tom === undefined ? salvo.tom : String(b.tom || ""),
  };

  // IGUAL NÃO SE COMPARA CONSIGO MESMO. Sem ajuste nenhum, rodar os dois lados
  // gastaria o dobro para mostrar duas vezes a mesma coisa — e duas amostras
  // do mesmo prompt lado a lado convidam a ler diferença onde não há mudança.
  const mudou = (rascunho.conhecimento || "") !== (salvo.conhecimento || "")
             || (rascunho.tom || "") !== (salvo.tom || "");

  const escolha = await escolherModelo({ proposito: "atendimento", assunto: null,
                                         score: Number((cliente as any).score) || 0 });

  async function responder(config: { conhecimento: string | null; tom: string | null }): Promise<Lado> {
    const resp = await anthropic().messages.create({
      model: escolha.modelo,
      max_tokens: 1024,
      // ZERO dos dois lados: o que sobrar de diferença é o ajuste, não o acaso.
      temperature: 0,
      system: montarSystemDeProducao(ctx, config),
      messages: historico,
      tools: [responderTool],
      tool_choice: { type: "tool", name: "responder" },
    });
    await registrarChamada({
      proposito: "calibragem", escolha, usage: (resp as any).usage,
      assunto: null, clienteId: cliente!.id,
    });
    const bloco = resp.content.find((x) => x.type === "tool_use");
    if (!bloco || bloco.type !== "tool_use") {
      return { resposta: "", assunto: null, confianca: null, precisaHumano: true,
               prometeuVoltar: false, promessaSobre: null,
               motivo: "o modelo não devolveu resposta estruturada" };
    }
    const o = bloco.input as any;
    return {
      resposta: String(o.resposta || ""),
      assunto: o.assunto || null,
      confianca: o.confianca || null,
      precisaHumano: !!o.precisa_humano,
      prometeuVoltar: !!o.prometeu_voltar,
      promessaSobre: o.promessa_sobre || null,
      motivo: o.motivo || null,
    };
  }

  try {
    const antes = await responder(salvo);
    let depois: Lado | null = null;
    if (mudou) {
      const segundo = await podeChamarIa();
      if (segundo.pode) depois = await responder(rascunho);
    }

    return NextResponse.json({
      ok: true,
      familia: ctx.nome,
      // O QUE ELA RECEBEU. É o coração da bancada: em 29/08 a IA prometeu
      // conferir o preço de um vaso que estava cadastrado — porque o catálogo
      // não chegava até ela. Ver o que chegou é o que permite descobrir isso
      // sem ler 25 conversas à mão.
      recebeu: {
        saldo: ctx.saldoTexto || null,
        jazigos: (ctx.tumulos || []).length,
        extras: (ctx.catalogo || []).map((c: any) => `${c.nome}: ${c.preco}`),
        pedidosAbertos: (ctx.pedidosAbertos || []).map((p: any) => p.resumo),
        comprovantesPendentes: (ctx.comprovantesPendentes || []).length,
        mensagensLidas: historico.length,
      },
      antes,
      depois,
      mudou,
      modelo: escolha.apelido,
      // Nunca deixar a tela adivinhar: se o segundo lado não rodou, ela diz por quê.
      porQueSemDepois: mudou ? (depois ? null : "o teto de IA do dia acabou no meio da rodada")
                             : "você ainda não mudou nada — não há o que comparar",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: "falha_no_modelo", mensagem: String(e?.message || e) },
      { status: 500 });
  }
}
