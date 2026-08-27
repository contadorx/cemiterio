import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabaseAdmin } from "./supabase-admin";
import { baixarMidiaBase64 } from "./evolution";
import { subirArquivo, BUCKET_CONVERSAS } from "./storage";
import { enviarTextoComRetry } from "./envio";
import { disparosAtivos } from "./disparos";
import { extrairComprovante, decidirLeitura } from "./comprovante";
import { registrarComprovante } from "./conciliacao";
import { transcreverAudio } from "./transcricao";
import { montarSystemPrompt, responderTool, type Assunto } from "./persona";
import { registrarErro } from "./monitor";
import { podeChamarIa } from "./custo-ia";
import { avaliarRetencao } from "./retencao";
import { escolherModelo, registrarChamada, precisaModeloBom, type EscolhaModelo, type Proposito } from "./modelo-ia";
import { quebrarEmBolhas, pausaMs } from "./bolhas";
import {
  acharCliente,
  montarContexto,
  historicoConversa,
  carregarConfigIa,
  type ClienteRow,
} from "./context";

// lazy: só cria (e exige a chave) quando de fato vai chamar a IA — nunca no build
let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: env.anthropicKey() });
  return _anthropic;
}

// Assuntos que uma pessoa SEMPRE trata — não graduam pro automático.
const ASSUNTOS_SENSIVEIS: Assunto[] = ["luto", "reclamacao"];

interface SaidaIa {
  assunto: Assunto;
  resposta: string;
  sensivel: boolean;
  precisa_humano: boolean;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
  // pedido de serviço ADICIONAL detectado na conversa (fora do plano)
  pedido?: boolean;
  pedido_resumo?: string;
  pedido_prazo?: string;
  pedido_ocasiao?: string;
}

export async function garantirConversa(
  clienteId: string
): Promise<{ id: string; escalada: boolean; ultimaEntrada: string | null }> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { data: aberta } = await db
    .from("conversas")
    .select("id,escalada_humano,ultima_entrada_at")
    .eq("org_id", org)
    .eq("cliente_id", clienteId)
    .eq("aberta", true)
    .maybeSingle();
  if (aberta) {
    return {
      id: (aberta as any).id,
      escalada: !!(aberta as any).escalada_humano,
      ultimaEntrada: (aberta as any).ultima_entrada_at || null,
    };
  }
  const { data: nova } = await db
    .from("conversas")
    .insert({ org_id: org, cliente_id: clienteId, aberta: true })
    .select("id")
    .single();
  return { id: (nova as any).id, escalada: false, ultimaEntrada: null };
}

/**
 * Guarda a imagem que a família mandou e devolve a URL.
 *
 * NUNCA LANÇA. Se o depósito falhar, a mensagem tem de entrar assim mesmo —
 * perder a mensagem inteira porque a foto não subiu seria trocar um problema
 * pequeno por um grande. Devolve `null` e a nota na conversa diz que não
 * consegui guardar, para a Sureya saber que houve uma imagem.
 */
async function guardarMidiaDaConversa(
  clienteId: string,
  midia: { base64: string; mimetype: string },
): Promise<string | null> {
  try {
    const bytes = Buffer.from(midia.base64, "base64");
    const ext = (midia.mimetype.split("/")[1] || "jpg").split(";")[0].replace(/[^a-z0-9]/gi, "");
    const caminho = `${env.orgId()}/clientes/${clienteId}/${Date.now()}.${ext}`;
    const r = await subirArquivo(supabaseAdmin(), BUCKET_CONVERSAS, caminho, bytes, midia.mimetype);
    if (!r.ok) {
      await registrarErro("conversa: nao consegui guardar a imagem", r.erro, { clienteId });
      return null;
    }
    return r.url;
  } catch (e: any) {
    await registrarErro("conversa: nao consegui guardar a imagem", e?.message || String(e), { clienteId });
    return null;
  }
}

async function gravarMensagem(
  conversaId: string,
  clienteId: string,
  direcao: "entrada" | "saida",
  autor: "cliente" | "ia" | "humano" | "sistema",
  texto: string,
  opts?: { midiaUrl?: string | null; processada?: boolean; transcrita?: boolean }
) {
  const db = supabaseAdmin();
  await db.from("mensagens").insert({
    org_id: env.orgId(),
    conversa_id: conversaId,
    cliente_id: clienteId,
    direcao,
    autor,
    texto,
    midia_url: opts?.midiaUrl || null,
    processada: opts?.processada ?? true,
    transcrita: opts?.transcrita || false,
  });
}

async function chamarIa(cliente: ClienteRow, conversaId: string): Promise<SaidaIa> {
  // teto de custo diário (A8): se estourou, escala pra humano em vez de gastar
  const custo = await podeChamarIa();
  if (!custo.pode) {
    return {
      assunto: "outro",
      resposta: "",
      sensivel: true,
      precisa_humano: true,
      confianca: "baixa",
      motivo: `teto diário de IA atingido (${custo.usadas}/${custo.teto})`,
    };
  }

  const ctx = await montarContexto(cliente);
  const historico = await historicoConversa(conversaId);
  const config = await carregarConfigIa();
  const score = Number((cliente as any).score) || 0;

  // O conhecimento do negócio (~fixo, ~2-3k tokens) é o mesmo para todas as
  // famílias. Como bloco próprio com cache_control, é cobrado uma vez e
  // reaproveitado nas chamadas seguintes (janela de 5 min) — inclusive entre
  // famílias diferentes, e entre os dois passes abaixo. O contexto do cliente
  // vai no bloco seguinte, sem cache, porque muda a cada conversa.
  const system = [
    {
      type: "text",
      text: `CONHECIMENTO DO NEGÓCIO (preços, procedimentos, respostas — use como fonte)\n${config.conhecimento || ""}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: montarSystemPrompt(ctx, { conhecimento: null, tom: config.tom }),
    },
    // cast: o cache_control é aceito pela API estável, mas os tipos do SDK 0.32
    // só o declaram no namespace beta. Runtime OK.
  ] as any;
  const messages = historico.length
    ? historico
    : [{ role: "user" as const, content: "(cliente iniciou conversa)" }];

  // Uma chamada ao modelo escolhido → saída estruturada (ou null se não estruturou).
  const rodar = async (
    escolha: EscolhaModelo,
    proposito: Proposito,
    assunto: string | null
  ): Promise<SaidaIa | null> => {
    const resp = await anthropic().messages.create({
      model: escolha.modelo,
      max_tokens: 1024,
      system,
      messages,
      tools: [responderTool],
      tool_choice: { type: "tool", name: "responder" },
    });
    await registrarChamada({
      proposito, escolha, usage: (resp as any).usage,
      assunto, clienteId: (cliente as any).id,
    });
    const bloco = resp.content.find((b) => b.type === "tool_use");
    return !bloco || bloco.type !== "tool_use" ? null : (bloco.input as SaidaIa);
  };

  // PASSE 1 — classificar + rascunhar BARATO (Haiku). Classificar é tarefa
  // interna ("ninguém lê o rótulo"); a filosofia do sistema já manda ir de
  // econômico. A mesma chamada já devolve um rascunho, que serve para a rotina.
  const escolhaClass = await escolherModelo({ proposito: "classificacao" });
  let saida = await rodar(escolhaClass, "classificacao", null);
  if (!saida) {
    return {
      assunto: "outro", resposta: "", sensivel: true, precisa_humano: true,
      confianca: "baixa", motivo: "IA não retornou resposta estruturada",
    };
  }

  // PASSE 2 — só gasta o modelo BOM para ESCREVER quando o assunto pede cuidado
  // (luto, reclamação, cobrança) ou o passe barato ficou em dúvida. Rotina com
  // confiança alta fica com o rascunho barato. Reescreve apenas se o modelo bom
  // for de fato diferente do que já classificou — senão seria pagar duas vezes.
  if (precisaModeloBom(saida)) {
    const escolhaBoa = await escolherModelo({ proposito: "atendimento", assunto: saida.assunto, score });
    if (escolhaBoa.modelo !== escolhaClass.modelo) {
      const melhor = await rodar(escolhaBoa, "atendimento", saida.assunto);
      if (melhor) saida = melhor; // a palavra final, no caso sensível, é do modelo bom
    }
  }
  return saida;
}

// ----------------------------------------------------------------------------
// REGISTRO da entrada (webhook): grava, trata mídia/áudio, decide se processa já.
// ----------------------------------------------------------------------------
export type ResultadoRegistro =
  | { tipo: "lead" }
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "escalado"; conversaId: string; nomeCliente?: string }
  | { tipo: "ok"; conversaId: string; processarAgora: boolean; nomeCliente?: string };

export async function registrarEntrada(params: {
  telefone: string;
  texto: string;
  temMidia?: boolean;
  temAudio?: boolean;
  transcrito?: boolean;   // o texto veio de um áudio que foi transcrito
  mensagemRaw?: any;
}): Promise<ResultadoRegistro> {
  const { telefone, texto, temMidia, temAudio, transcrito, mensagemRaw } = params;

  const cliente = await acharCliente(telefone);
  if (!cliente) return { tipo: "lead" };
  if (!cliente.ativo_ia) return { tipo: "ignorado", motivo: "ia_desativada" };

  const conv = await garantirConversa(cliente.id);
  const db = supabaseAdmin();

  let nota = "";
  let escalarDireto = false;
  /**
   * A IMAGEM QUE A FAMÍLIA MANDOU FICA GUARDADA — SEMPRE.
   *
   * O que acontecia: a imagem era baixada, passava pelo leitor de comprovante,
   * e só sobrevivia se ele a reconhecesse como Pix. Quando não reconhecia, o
   * sistema escrevia "[cliente enviou uma imagem que não parece um
   * comprovante]" e JOGAVA A IMAGEM FORA.
   *
   * Ou seja: ela era descartada exatamente no caso em que a leitura falhou —
   * que é justamente quando um humano precisa olhar. A Sureya lia a frase e
   * não tinha como saber o que era: a foto do túmulo, um print de outro banco,
   * uma dúvida escrita à mão.
   *
   * Medido em 27/08: 39 mensagens no sistema, ZERO com mídia. E a Kátia mandou
   * imagem duas vezes no mesmo dia (10:24 e 13:06), as duas descartadas.
   *
   * `gravarMensagem` já aceitava `midiaUrl` desde sempre. Ninguém passava.
   */
  let midiaUrl: string | null = null;

  if (temAudio) {
    // ÁUDIO JÁ TRANSCRITO NÃO SE TRANSCREVE DE NOVO.
    //
    // O webhook baixa a mídia e transcreve antes de chamar esta função — e
    // manda o resultado em `texto`, com `transcrito: true`. Aqui o áudio era
    // baixado e transcrito UMA SEGUNDA VEZ: custo dobrado no Groq/OpenAI em
    // todo áudio de família, e o mesmo texto aparecendo duas vezes na conversa
    // (uma limpo, outra com o prefixo "[áudio]").
    if (transcrito && texto?.trim()) {
      // nada a fazer: o texto que chegou JÁ é a transcrição
    } else {
      const midia = await baixarMidiaBase64(mensagemRaw);
      const ouvido = midia ? await transcreverAudio(midia.base64, midia.mimetype) : null;
      if (ouvido) {
        nota = `[áudio] ${ouvido}`;
      } else {
        nota = "[cliente enviou um áudio que não consegui ouvir]";
        escalarDireto = true;
      }
    }
  } else if (temMidia) {
    const midia = await baixarMidiaBase64(mensagemRaw);
    if (!midia) {
      nota = "[cliente enviou uma mídia que não consegui baixar]";
      escalarDireto = true;
    } else {
      // GUARDA PRIMEIRO, LÊ DEPOIS.
      //
      // Nesta ordem de propósito: se o leitor de comprovante estourar, a
      // imagem já está salva. Guardar depois da leitura faria a falha do
      // leitor levar a imagem junto — que é a forma antiga do mesmo defeito.
      midiaUrl = await guardarMidiaDaConversa(cliente.id, midia);

      const dados = await extrairComprovante(midia);
      // MESMA REGRA DA PORTA DA MÃO (`/api/comprovantes/ler`). Era escrita
      // aqui e lá, com as mesmas palavras — e duas cópias de uma regra sempre
      // começam iguais e terminam discordando.
      if (decidirLeitura(dados).confiavel) {
        await registrarComprovante(cliente.id, midia, dados);
        const v = dados.valor ? `R$ ${dados.valor.toFixed(2)}` : "valor não identificado";
        const d = dados.data || "data não identificada";
        nota = `[comprovante de Pix recebido: ${v}, ${d} — registrado, aguardando conferência de uma pessoa]`;
      } else {
        // A frase muda: antes ela era um beco sem saída ("não parece um
        // comprovante" e ponto). Agora ela diz que a imagem está ali.
        nota = midiaUrl
          ? "[a família mandou uma imagem — está aqui na conversa]"
          : "[cliente enviou uma imagem que não consegui guardar]";
        escalarDireto = true;
      }
    }
  }

  const entrada = [texto, nota].filter(Boolean).join("\n");
  await gravarMensagem(conv.id, cliente.id, "entrada", "cliente", entrada,
                       { processada: false, transcrita: !!transcrito, midiaUrl });
  await db
    .from("conversas")
    .update({ ultima_entrada_at: new Date().toISOString() })
    .eq("org_id", env.orgId())
    .eq("id", conv.id);

  if (escalarDireto && !conv.escalada) {
    await db
      .from("conversas")
      .update({ escalada_humano: true })
      .eq("org_id", env.orgId())
      .eq("id", conv.id);
    return { tipo: "escalado", conversaId: conv.id, nomeCliente: cliente.nome };
  }
  if (conv.escalada) return { tipo: "escalado", conversaId: conv.id, nomeCliente: cliente.nome };

  // Estratégia sem agendador: SEMPRE devolvemos "ok" e deixamos o chamador (webhook)
  // agendar um processamento diferido via waitUntil. Se outra mensagem chegar dentro
  // da janela, ela reagenda e a anterior é absorvida (aguardarEProcessar confere o carimbo).
  return { tipo: "ok", conversaId: conv.id, processarAgora: false, nomeCliente: cliente.nome };
}

// Espera a janela de debounce e processa a conversa UMA vez, se ela "amadureceu"
// (ou seja, se nenhuma mensagem mais nova chegou depois). Feito pra rodar em waitUntil,
// sem bloquear a resposta ao Evolution nem depender de cron externo.
export async function aguardarEProcessar(conversaId: string): Promise<void> {
  const db = supabaseAdmin();
  const org = env.orgId();

  // marca de tempo desta rajada no momento do agendamento
  const { data: c0 } = await db
    .from("conversas")
    .select("ultima_entrada_at")
    .eq("org_id", org)
    .eq("id", conversaId)
    .maybeSingle();
  const carimbo = (c0 as any)?.ultima_entrada_at || null;

  // dorme a janela de debounce
  await new Promise((r) => setTimeout(r, env.DEBOUNCE_SEGUNDOS * 1000));

  // se chegou mensagem mais nova depois do carimbo, outra execução cuidará: sai
  const { data: c1 } = await db
    .from("conversas")
    .select("ultima_entrada_at")
    .eq("org_id", org)
    .eq("id", conversaId)
    .maybeSingle();
  const agora = (c1 as any)?.ultima_entrada_at || null;
  if (carimbo && agora && new Date(agora).getTime() > new Date(carimbo).getTime()) {
    return; // rajada ainda crescendo; a execução da mensagem mais nova processa
  }

  try {
    await processarConversa(conversaId);
  } catch (e) {
    console.error("[debounce] processarConversa falhou:", (e as any)?.message || e);
    await registrarErro("debounce", e, { conversaId });
  }
}

// ----------------------------------------------------------------------------
// PROCESSAMENTO da conversa: consome as entradas pendentes e responde/rascunha.
// Seguro contra corrida: quem marcar as pendências primeiro processa; o outro sai.
// ----------------------------------------------------------------------------
export type ResultadoProcesso =
  | { acao: "nada_novo" }
  | { acao: "escalado" }
  | { acao: "duplicado" }
  | { acao: "enviado_automatico"; texto: string }
  | { acao: "rascunho"; texto: string; assunto: Assunto; motivo: string };

export async function processarConversa(conversaId: string): Promise<ResultadoProcesso> {
  const db = supabaseAdmin();
  const org = env.orgId();

  // trava de corrida: marca as pendências; se ninguém foi marcado, outro job já pegou
  const { data: marcadas } = await db
    .from("mensagens")
    .update({ processada: true })
    .eq("org_id", org)
    .eq("conversa_id", conversaId)
    .eq("processada", false)
    .select("id");
  if (!marcadas || marcadas.length === 0) return { acao: "nada_novo" };

  const { data: conv } = await db
    .from("conversas")
    .select("cliente_id,escalada_humano")
    .eq("org_id", org)
    .eq("id", conversaId)
    .maybeSingle();
  if (!conv) return { acao: "nada_novo" };
  if ((conv as any).escalada_humano) return { acao: "escalado" };

  const { data: cli } = await db
    .from("clientes")
    .select("id,nome,telefone,ativo_ia,modo,score,perfil_ia,instrucoes_ia")
    .eq("org_id", org)
    .eq("id", (conv as any).cliente_id)
    .maybeSingle();
  if (!cli) return { acao: "nada_novo" };
  const cliente = cli as ClienteRow;

  const out = await chamarIa(cliente, conversaId);

  // Pedido de serviço adicional NUNCA sai sozinho: tem preço e ocupa agenda.
  const temPedido = !!out.pedido && !!(out.pedido_resumo || "").trim();

  const sensivel =
    out.sensivel || out.precisa_humano || temPedido ||
    ASSUNTOS_SENSIVEIS.includes(out.assunto);

  await db
    .from("conversas")
    .update({ ultimo_assunto: out.assunto })
    .eq("org_id", org)
    .eq("id", conversaId);

  // idempotência de envio: mesma resposta nos últimos 60s não sai de novo
  const { data: ultSaida } = await db
    .from("mensagens")
    .select("texto,created_at")
    .eq("org_id", org)
    .eq("conversa_id", conversaId)
    .eq("direcao", "saida")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    ultSaida &&
    (ultSaida as any).texto === out.resposta &&
    Date.now() - new Date((ultSaida as any).created_at).getTime() < 60_000
  ) {
    return { acao: "duplicado" };
  }

  // Assuntos e palavras que NUNCA vão sozinhos, por mais alto que seja o score.
  // A família não percebe: para ela, é a Sureya que respondeu.
  // o que a família escreveu por último — é ali que aparecem as palavras que pedem cuidado
  const { data: ultEntrada } = await db
    .from("mensagens")
    .select("texto")
    .eq("conversa_id", conversaId)
    .eq("direcao", "entrada")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ---------------------------------------------------------------------
  // O pedido não pode morrer dentro da conversa.
  // Aqui ele vira um AVISO no painel — não vira serviço: preço e agenda são
  // decisão de gente. O índice único da 0035 garante um aviso aberto por
  // conversa, então follow-up ("e aí, já lavou?") não gera aviso novo.
  // ---------------------------------------------------------------------
  if (temPedido) {
    const prazo = /^\d{4}-\d{2}-\d{2}$/.test((out.pedido_prazo || "").trim())
      ? (out.pedido_prazo as string).trim()
      : null;
    await db.from("pedidos_conversa").insert({
      org_id: org,
      cliente_id: (conv as any).cliente_id,
      conversa_id: conversaId,
      resumo: (out.pedido_resumo || "").trim().slice(0, 400),
      trecho: ((ultEntrada as any)?.texto || "").slice(0, 1000) || null,
      prazo,
      ocasiao: (out.pedido_ocasiao || "").trim().slice(0, 80) || null,
      origem: "ia",
      status: "novo",
    });
    // erro aqui não derruba o atendimento: ou é o índice único (já existe aviso
    // aberto) ou é a migration 0035 ainda não rodada. A resposta à família não
    // pode depender disso.
  }

  const trava = await avaliarRetencao({
    assunto: out.assunto,
    textoDaFamilia: (ultEntrada as any)?.texto || null,
    sensivel,
    confianca: out.confianca,
    score: cliente.score,
  });

  // Chave mestra: se os disparos automáticos estão desligados (migração/captura
  // das quadras), a IA NUNCA envia sozinha — vira rascunho para aprovação.
  const disparosLigados = await disparosAtivos();

  const podeAutomatico =
    disparosLigados &&
    cliente.modo === "automatico" &&
    !trava.reter &&
    cliente.score >= env.SCORE_LIMITE_AUTO &&
    out.confianca === "alta";

  if (podeAutomatico) {
    // B3: manda em 1-3 bolhas curtas, com pausa entre elas (mais humano)
    const bolhas = quebrarEmBolhas(out.resposta);
    for (let i = 0; i < bolhas.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, pausaMs(bolhas[i - 1])));
      await enviarTextoComRetry(cliente.telefone, bolhas[i]);
    }
    await gravarMensagem(conversaId, cliente.id, "saida", "ia", out.resposta);
    await db.from("interacoes_ia").insert({
      org_id: org,
      cliente_id: cliente.id,
      conversa_id: conversaId,
      assunto: out.assunto,
      rascunho: out.resposta,
      acao_humana: "enviou_direto",
      texto_final: out.resposta,
    });
    return { acao: "enviado_automatico", texto: out.resposta };
  }

  await db.from("interacoes_ia").insert({
    org_id: org,
    cliente_id: cliente.id,
    conversa_id: conversaId,
    assunto: out.assunto,
    rascunho: out.resposta,
    acao_humana: null,
    motivo_retencao: (temPedido ? "pedido de serviço adicional — precisa de preço e agenda" : null)
      || (!disparosLigados ? "disparos automáticos desligados" : null)
      || trava.motivo
      || (cliente.modo !== "automatico" ? "contato em modo copiloto"
      : cliente.score < env.SCORE_LIMITE_AUTO ? `score ${Math.round(cliente.score)} abaixo de ${env.SCORE_LIMITE_AUTO}`
      : out.confianca !== "alta" ? "a IA ficou em dúvida" : null),
  });

  if (sensivel) {
    await db
      .from("conversas")
      .update({ escalada_humano: true })
      .eq("org_id", org)
      .eq("id", conversaId);
  }

  return {
    acao: "rascunho",
    texto: out.resposta,
    assunto: out.assunto,
    motivo: sensivel
      ? out.motivo || "assunto sensível"
      : out.confianca !== "alta"
      ? "confiança baixa da IA"
      : "modo copiloto / score baixo",
  };
}

// Consolida rajadas maduras (chamado pelo cron por minuto).
export async function processarPendentes(): Promise<{ processadas: number }> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: pend } = await db
    .from("mensagens")
    .select("conversa_id")
    .eq("org_id", org)
    .eq("processada", false)
    .limit(200);

  const ids = [...new Set((pend || []).map((m: any) => m.conversa_id))];
  if (!ids.length) return { processadas: 0 };

  const corte = new Date(Date.now() - env.DEBOUNCE_SEGUNDOS * 1000).toISOString();
  const { data: maduras } = await db
    .from("conversas")
    .select("id")
    .eq("org_id", org)
    .in("id", ids)
    .lte("ultima_entrada_at", corte)
    .limit(10);

  let n = 0;
  for (const c of maduras || []) {
    try {
      const r = await processarConversa((c as any).id);
      if (r.acao !== "nada_novo") n++;
    } catch (e) {
      console.error("[cron] processarConversa falhou:", (e as any)?.message || e);
    }
  }
  return { processadas: n };
}
