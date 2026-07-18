import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabaseAdmin } from "./supabase-admin";
import { enviarWhatsapp, baixarMidiaBase64 } from "./evolution";
import { extrairComprovante } from "./comprovante";
import { registrarComprovante } from "./conciliacao";
import { montarSystemPrompt, responderTool, type Assunto } from "./persona";
import {
  acharCliente,
  montarContexto,
  historicoConversa,
  type ClienteRow,
} from "./context";

// lazy: só cria (e exige a chave) quando de fato vai chamar a IA — nunca no build
let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: env.anthropicKey() });
  return _anthropic;
}

// Assuntos que uma pessoa SEMPRE trata — não graduam pro automático por mais alto que o score esteja.
const ASSUNTOS_SENSIVEIS: Assunto[] = ["luto", "reclamacao"];

interface SaidaIa {
  assunto: Assunto;
  resposta: string;
  sensivel: boolean;
  precisa_humano: boolean;
  motivo: string;
}

// Garante a conversa aberta do cliente.
async function garantirConversa(clienteId: string): Promise<string> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { data: aberta } = await db
    .from("conversas")
    .select("id,escalada_humano")
    .eq("org_id", org)
    .eq("cliente_id", clienteId)
    .eq("aberta", true)
    .maybeSingle();
  if (aberta) return (aberta as any).id;

  const { data: nova } = await db
    .from("conversas")
    .insert({ org_id: org, cliente_id: clienteId, aberta: true })
    .select("id")
    .single();
  return (nova as any).id;
}

async function conversaEscalada(conversaId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("conversas")
    .select("escalada_humano")
    .eq("org_id", env.orgId())
    .eq("id", conversaId)
    .maybeSingle();
  return !!(data as any)?.escalada_humano;
}

async function gravarMensagem(
  conversaId: string,
  clienteId: string,
  direcao: "entrada" | "saida",
  autor: "cliente" | "ia" | "humano" | "sistema",
  texto: string,
  midiaUrl?: string | null
) {
  const db = supabaseAdmin();
  await db.from("mensagens").insert({
    org_id: env.orgId(),
    conversa_id: conversaId,
    cliente_id: clienteId,
    direcao,
    autor,
    texto,
    midia_url: midiaUrl || null,
  });
}

async function chamarIa(
  cliente: ClienteRow,
  conversaId: string
): Promise<SaidaIa> {
  const ctx = await montarContexto(cliente);
  const historico = await historicoConversa(conversaId);

  const resp = await anthropic().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: montarSystemPrompt(ctx),
    messages: historico.length
      ? historico
      : [{ role: "user", content: "(cliente iniciou conversa)" }],
    tools: [responderTool],
    tool_choice: { type: "tool", name: "responder" },
  });

  const bloco = resp.content.find((b) => b.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") {
    // fallback defensivo: manda pra humano
    return {
      assunto: "outro",
      resposta: "",
      sensivel: true,
      precisa_humano: true,
      motivo: "IA não retornou resposta estruturada",
    };
  }
  return bloco.input as SaidaIa;
}

export type ResultadoAtendimento =
  | { acao: "ignorado"; motivo: string }
  | { acao: "escalado_em_andamento" }
  | { acao: "enviado_automatico"; texto: string }
  | { acao: "rascunho"; texto: string; assunto: Assunto; motivo: string };

// Ponto de entrada: uma mensagem recebida do cliente.
export async function processarMensagem(params: {
  telefone: string;
  texto: string;
  temMidia?: boolean;
  mensagemRaw?: any; // objeto data.* do Evolution, p/ baixar a mídia
}): Promise<ResultadoAtendimento> {
  const { telefone, texto, temMidia, mensagemRaw } = params;

  // 1) Allowlist: só cliente cadastrado e com IA ativa.
  const cliente = await acharCliente(telefone);
  if (!cliente) return { acao: "ignorado", motivo: "numero_nao_cadastrado" };
  if (!cliente.ativo_ia) return { acao: "ignorado", motivo: "ia_desativada" };

  const conversaId = await garantirConversa(cliente.id);

  // Tratamento de mídia: tenta ler comprovante de Pix.
  let notaEntrada = "";
  let forcarHumano = false;
  if (temMidia) {
    const midia = await baixarMidiaBase64(mensagemRaw);
    if (!midia) {
      notaEntrada = "[cliente enviou uma mídia que não consegui baixar]";
      forcarHumano = true;
    } else {
      const dados = await extrairComprovante(midia);
      if (dados.eh_comprovante && dados.confianca !== "baixa") {
        await registrarComprovante(cliente.id, midia, dados);
        const v = dados.valor ? `R$ ${dados.valor.toFixed(2)}` : "valor não identificado";
        const d = dados.data || "data não identificada";
        notaEntrada = `[comprovante de Pix recebido: ${v}, ${d} — registrado, aguardando conferência de uma pessoa]`;
        // NÃO força humano: a IA pode agradecer o recebimento; a conferência do dinheiro é à parte.
      } else {
        notaEntrada = "[cliente enviou uma imagem que não parece um comprovante]";
        forcarHumano = true;
      }
    }
  }

  const entrada = [texto, notaEntrada].filter(Boolean).join("\n");
  await gravarMensagem(conversaId, cliente.id, "entrada", "cliente", entrada);

  // 2) Se já está com uma pessoa, a IA cala.
  if (await conversaEscalada(conversaId)) {
    return { acao: "escalado_em_andamento" };
  }

  // 3) A IA pensa.
  const out = await chamarIa(cliente, conversaId);

  // 4) É sensível? luto/reclamação/preço/cancelamento OU a própria IA pediu humano
  //    OU mídia que não é comprovante claro.
  const sensivel =
    out.sensivel ||
    out.precisa_humano ||
    ASSUNTOS_SENSIVEIS.includes(out.assunto) ||
    forcarHumano;

  const db = supabaseAdmin();
  await db
    .from("conversas")
    .update({ ultimo_assunto: out.assunto })
    .eq("org_id", env.orgId())
    .eq("id", conversaId);

  // 5) Decisão: automático só em rotineiro, cliente em modo automático e score alto.
  const podeAutomatico =
    cliente.modo === "automatico" &&
    !sensivel &&
    cliente.score >= env.SCORE_LIMITE_AUTO;

  if (podeAutomatico) {
    await enviarWhatsapp(cliente.telefone, out.resposta);
    await gravarMensagem(conversaId, cliente.id, "saida", "ia", out.resposta);
    // registra a interação como enviada direto (alimenta o score positivamente)
    await db.from("interacoes_ia").insert({
      org_id: env.orgId(),
      cliente_id: cliente.id,
      conversa_id: conversaId,
      assunto: out.assunto,
      rascunho: out.resposta,
      acao_humana: "enviou_direto",
      texto_final: out.resposta,
    });
    return { acao: "enviado_automatico", texto: out.resposta };
  }

  // 6) Vira rascunho no painel (não envia). Sensível => escala a conversa.
  await db.from("interacoes_ia").insert({
    org_id: env.orgId(),
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
      .eq("org_id", env.orgId())
      .eq("id", conversaId);
  }

  return {
    acao: "rascunho",
    texto: out.resposta,
    assunto: out.assunto,
    motivo: sensivel ? out.motivo || "assunto sensível" : "modo copiloto / score baixo",
  };
}
