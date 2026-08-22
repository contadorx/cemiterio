import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

// Uma mensagem da thread do lead. Sem `de` = veio do lead (entrada).
// `de: "nos"` = resposta nossa (saída). `via: "celular"` = ela digitou no
// aparelho, não no painel — capturada pelo webhook.
export type MsgLead = { t?: string; texto: string; de?: "nos"; via?: "celular" };

export type ResultadoConversao =
  | { ok: true; clienteId: string; jaEra?: boolean }
  | { ok: false; erro: string };

/**
 * Transforma um lead em cliente.
 *
 * - cria o cliente (nome + telefone, modo copiloto);
 * - leva a conversa do lead junto: abre uma conversa real e copia as mensagens
 *   (o que a pessoa escreveu + o que respondemos pelo app), para o histórico não
 *   se perder;
 * - vincula o lead ao cliente (leads.cliente_id) e marca como convertido.
 *
 * Idempotente: se o lead já foi convertido, devolve o cliente existente.
 * A migração do histórico é best-effort — se falhar, o cliente ainda é criado.
 */
export async function converterLead(
  db: SupabaseClient,
  org: string,
  leadId: string,
  nomeManual?: string
): Promise<ResultadoConversao> {
  const { data: lead } = await db
    .from("leads")
    .select("id,telefone,nome,nome_wa,contexto,mensagens,cliente_id,status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, erro: "nao_encontrado" };

  // já convertido antes: não cria de novo
  if ((lead as any).cliente_id) {
    return { ok: true, clienteId: (lead as any).cliente_id, jaEra: true };
  }

  const nome = (nomeManual || (lead as any).nome || (lead as any).nome_wa || "Cliente").trim();

  const { data: cli, error } = await db
    .from("clientes")
    .insert({
      org_id: org,
      nome,
      telefone: (lead as any).telefone,
      modo: "copiloto",
      ativo_ia: true,
      observacoes: (lead as any).contexto || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, erro: error.message };

  const clienteId = (cli as any).id as string;

  // leva a conversa junto (best-effort: nunca derruba a conversão)
  try {
    const msgs: MsgLead[] = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
    if (msgs.length) {
      const { data: conv } = await db
        .from("conversas")
        .insert({ org_id: org, cliente_id: clienteId, aberta: true })
        .select("id")
        .single();
      const conversaId = (conv as any)?.id;
      if (conversaId) {
        const linhas = msgs
          .filter((m) => m && m.texto)
          .map((m) => ({
            org_id: org,
            conversa_id: conversaId,
            cliente_id: clienteId,
            direcao: m.de === "nos" ? "saida" : "entrada",
            autor: m.de === "nos" ? "humano" : "cliente",
            texto: m.texto,
            processada: true, // já é histórico: a IA não deve reprocessar
          }));
        if (linhas.length) await db.from("mensagens").insert(linhas);
      }
    }
  } catch (e) {
    console.error("[converterLead] histórico não migrou:", (e as any)?.message || e);
  }

  await db.from("leads").update({ status: "convertido", cliente_id: clienteId }).eq("id", leadId);
  return { ok: true, clienteId };
}

/**
 * VINCULA o lead a uma família que JÁ EXISTE.
 *
 * Diferente do converterLead: aqui não nasce cliente nenhum. É o caso da
 * família que já está na carteira e escreveu de outro aparelho (o do marido, o
 * do filho, o comercial) — o sistema não reconheceu o número e abriu um lead.
 *
 * Faz três coisas:
 *  1. leva a conversa do lead para a conversa aberta daquela família (ou abre
 *     uma), preservando quem escreveu o quê;
 *  2. GUARDA O NÚMERO em telefones_cliente. Sem isso o vínculo valeria uma vez
 *     só: na mensagem seguinte o número voltaria a cair como lead;
 *  3. marca o lead como convertido e aponta para o cliente.
 *
 * Idempotente: lead já vinculado devolve o cliente que já estava lá.
 */
export async function vincularLeadACliente(
  db: SupabaseClient,
  org: string,
  leadId: string,
  clienteId: string,
  rotulo?: string
): Promise<ResultadoConversao> {
  const { data: lead } = await db
    .from("leads")
    .select("id,telefone,nome,nome_wa,contexto,mensagens,cliente_id,status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, erro: "nao_encontrado" };
  if ((lead as any).cliente_id) {
    return { ok: true, clienteId: (lead as any).cliente_id, jaEra: true };
  }

  const { data: cli } = await db
    .from("clientes")
    .select("id,telefone")
    .eq("org_id", org)
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return { ok: false, erro: "cliente_nao_encontrado" };

  const telefone = ((lead as any).telefone as string) || "";

  // 1) o número passa a pertencer a esta família
  if (telefone && telefone !== (cli as any).telefone) {
    const { error } = await db.from("telefones_cliente").insert({
      org_id: org,
      cliente_id: clienteId,
      telefone,
      rotulo: rotulo || (lead as any).nome_wa || null,
    });
    // duplicado (número já de outra família) ou tabela ausente: não derruba o
    // vínculo, mas avisa no log — é o único ponto que exige a migration 0033.
    if (error) console.error("[vincularLead] telefone não guardado:", error.message);
  }

  // 2) a conversa vai junto (best-effort)
  try {
    const msgs: MsgLead[] = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
    if (msgs.length) {
      const { data: aberta } = await db
        .from("conversas")
        .select("id")
        .eq("org_id", org)
        .eq("cliente_id", clienteId)
        .eq("aberta", true)
        .maybeSingle();
      let conversaId = (aberta as any)?.id as string | undefined;
      if (!conversaId) {
        const { data: nova } = await db
          .from("conversas")
          .insert({ org_id: org, cliente_id: clienteId, aberta: true })
          .select("id")
          .single();
        conversaId = (nova as any)?.id;
      }
      if (conversaId) {
        const linhas = msgs
          .filter((m) => m && m.texto)
          .map((m) => ({
            org_id: org,
            conversa_id: conversaId,
            cliente_id: clienteId,
            direcao: m.de === "nos" ? "saida" : "entrada",
            autor: m.de === "nos" ? "humano" : "cliente",
            texto: m.texto,
            processada: true, // já é histórico: a IA não reprocessa
            pelo_celular: m.via === "celular",
          }));
        if (linhas.length) {
          const { error } = await db.from("mensagens").insert(linhas);
          if (error) {
            // coluna pelo_celular ainda não existe (0033 não rodou)
            await db.from("mensagens").insert(
              linhas.map(({ pelo_celular, ...resto }) => resto)
            );
          }
        }
      }
    }
  } catch (e) {
    console.error("[vincularLead] histórico não migrou:", (e as any)?.message || e);
  }

  await db.from("leads").update({ status: "convertido", cliente_id: clienteId }).eq("id", leadId);
  return { ok: true, clienteId };
}

/**
 * NÚMERO DESCONHECIDO — apenas REGISTRA, nunca responde.
 *
 * O WhatsApp é o número pessoal da Sureya. Uma mensagem de número desconhecido
 * pode ser uma amiga, um parente, alguém do outro trabalho ou um engano.
 * Responder automaticamente seria invasivo e constrangedor.
 *
 * Então: registramos o contato para ela ver no painel e decidir. Se for cliente
 * em potencial, ela converte em lead e aí sim a IA ajuda na prospecção — com o
 * contexto que ela mesma escreveu.
 */
export async function tratarLead(telefone: string, texto: string, nomeWa?: string | null) {
  const db = supabaseAdmin();
  const org = env.orgId();

  // número marcado como "não é lead" nem chega a ser registrado
  const { data: bloqueado } = await db
    .from("telefones_ignorados")
    .select("id").eq("org_id", org).eq("telefone", telefone).maybeSingle();
  if (bloqueado) return;

  const { data: lead } = await db
    .from("leads")
    .select("id,mensagens,status")
    .eq("org_id", org)
    .eq("telefone", telefone)
    .maybeSingle();

  const novaMsg = { t: new Date().toISOString(), texto: (texto || "").slice(0, 800) };

  if (!lead) {
    await db.from("leads").insert({
      org_id: org,
      telefone,
      nome_wa: nomeWa || null,
      mensagens: [novaMsg],
      status: "novo",
      respondido_inicial: false,   // continua false: NUNCA respondemos sozinhos
    });
    return;
  }

  const msgs = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
  msgs.push(novaMsg);
  await db
    .from("leads")
    .update({ mensagens: msgs.slice(-20), nome_wa: nomeWa || undefined })
    .eq("id", (lead as any).id);
}
