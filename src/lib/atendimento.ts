import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabaseAdmin } from "./supabase-admin";
import { baixarMidiaBase64 } from "./evolution";
import { enviarTextoComRetry } from "./envio";
import { extrairComprovante } from "./comprovante";
import { registrarComprovante } from "./conciliacao";
import { transcreverAudio } from "./transcricao";
import { montarSystemPrompt, responderTool, type Assunto } from "./persona";
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
}

async function garantirConversa(
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

async function gravarMensagem(
  conversaId: string,
  clienteId: string,
  direcao: "entrada" | "saida",
  autor: "cliente" | "ia" | "humano" | "sistema",
  texto: string,
  opts?: { midiaUrl?: string | null; processada?: boolean }
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
  });
}

async function chamarIa(cliente: ClienteRow, conversaId: string): Promise<SaidaIa> {
  const ctx = await montarContexto(cliente);
  const historico = await historicoConversa(conversaId);
  const config = await carregarConfigIa();

  const resp = await anthropic().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: montarSystemPrompt(ctx, { conhecimento: config.conhecimento, tom: config.tom }),
    messages: historico.length
      ? historico
      : [{ role: "user", content: "(cliente iniciou conversa)" }],
    tools: [responderTool],
    tool_choice: { type: "tool", name: "responder" },
  });

  const bloco = resp.content.find((b) => b.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") {
    return {
      assunto: "outro",
      resposta: "",
      sensivel: true,
      precisa_humano: true,
      confianca: "baixa",
      motivo: "IA não retornou resposta estruturada",
    };
  }
  return bloco.input as SaidaIa;
}

// ----------------------------------------------------------------------------
// REGISTRO da entrada (webhook): grava, trata mídia/áudio, decide se processa já.
// ----------------------------------------------------------------------------
export type ResultadoRegistro =
  | { tipo: "lead" }
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "escalado"; conversaId: string }
  | { tipo: "ok"; conversaId: string; processarAgora: boolean };

export async function registrarEntrada(params: {
  telefone: string;
  texto: string;
  temMidia?: boolean;
  temAudio?: boolean;
  mensagemRaw?: any;
}): Promise<ResultadoRegistro> {
  const { telefone, texto, temMidia, temAudio, mensagemRaw } = params;

  const cliente = await acharCliente(telefone);
  if (!cliente) return { tipo: "lead" };
  if (!cliente.ativo_ia) return { tipo: "ignorado", motivo: "ia_desativada" };

  const conv = await garantirConversa(cliente.id);
  const db = supabaseAdmin();

  let nota = "";
  let escalarDireto = false;

  if (temAudio) {
    const midia = await baixarMidiaBase64(mensagemRaw);
    const transcrito = midia ? await transcreverAudio(midia.base64, midia.mimetype) : null;
    if (transcrito) {
      nota = `[áudio] ${transcrito}`;
    } else {
      nota = "[cliente enviou um áudio que não consegui ouvir]";
      escalarDireto = true;
    }
  } else if (temMidia) {
    const midia = await baixarMidiaBase64(mensagemRaw);
    if (!midia) {
      nota = "[cliente enviou uma mídia que não consegui baixar]";
      escalarDireto = true;
    } else {
      const dados = await extrairComprovante(midia);
      if (dados.eh_comprovante && dados.confianca !== "baixa") {
        await registrarComprovante(cliente.id, midia, dados);
        const v = dados.valor ? `R$ ${dados.valor.toFixed(2)}` : "valor não identificado";
        const d = dados.data || "data não identificada";
        nota = `[comprovante de Pix recebido: ${v}, ${d} — registrado, aguardando conferência de uma pessoa]`;
      } else {
        nota = "[cliente enviou uma imagem que não parece um comprovante]";
        escalarDireto = true;
      }
    }
  }

  const entrada = [texto, nota].filter(Boolean).join("\n");
  await gravarMensagem(conv.id, cliente.id, "entrada", "cliente", entrada, { processada: false });
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
    return { tipo: "escalado", conversaId: conv.id };
  }
  if (conv.escalada) return { tipo: "escalado", conversaId: conv.id };

  // Debounce: mensagem isolada responde já; rajada espera o cron consolidar.
  const agora = Date.now();
  const prev = conv.ultimaEntrada ? new Date(conv.ultimaEntrada).getTime() : 0;
  const processarAgora = !prev || agora - prev > env.DEBOUNCE_SEGUNDOS * 1000;

  return { tipo: "ok", conversaId: conv.id, processarAgora };
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

  const sensivel =
    out.sensivel || out.precisa_humano || ASSUNTOS_SENSIVEIS.includes(out.assunto);

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

  const podeAutomatico =
    cliente.modo === "automatico" &&
    !sensivel &&
    cliente.score >= env.SCORE_LIMITE_AUTO &&
    out.confianca === "alta";

  if (podeAutomatico) {
    await enviarTextoComRetry(cliente.telefone, out.resposta);
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
