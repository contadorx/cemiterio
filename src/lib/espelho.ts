import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { acharCliente } from "./context";
import { garantirConversa } from "./atendimento";
import type { MsgLead } from "./leads";
import { subirArquivo, BUCKET_CONVERSAS } from "./storage";
import { registrarErro } from "./monitor";

/**
 * O ESPELHO — o que ela digita direto no WhatsApp do celular.
 *
 * Até aqui o webhook jogava fora tudo que chegava marcado como `fromMe`: o
 * painel mostrava só metade da conversa (o que a família escreveu), nunca a
 * resposta. Quando a Sureya respondia pelo aparelho — que é o normal, ela vive
 * no celular — o histórico ficava mudo do lado dela.
 *
 * Agora essas mensagens são gravadas como saída, marcadas com `pelo_celular`
 * para diferenciar do que saiu pelo painel.
 *
 * TRÊS CUIDADOS, porque `fromMe` também volta para o que o PRÓPRIO sistema
 * enviou:
 *
 *  1. ECO — o Evolution devolve, como `fromMe`, a mensagem que o painel acabou
 *     de mandar. `enviarWhatsapp` não devolve id, então não dá para casar por
 *     id: dedupe por texto idêntico na mesma conversa dentro de 10 minutos.
 *  2. RESPOSTA DOBRADA — se ela responde pelo celular durante a janela de
 *     debounce, a IA ainda responderia àquela entrada. Ao gravar a saída,
 *     marcamos as entradas pendentes como processadas: quem respondeu foi ela.
 *  3. LEAD NUNCA NASCE DAQUI — o WhatsApp é o número pessoal dela. Se ela
 *     manda mensagem para uma amiga, isso não é lead. Só anexamos a saída a um
 *     lead que JÁ existe.
 */

const JANELA_ECO_MS = 10 * 60 * 1000;

export type ResultadoEspelho =
  | { tipo: "cliente"; conversaId: string }
  | { tipo: "eco" }
  | { tipo: "lead" }
  | { tipo: "nada" };

function textoDaSaida(texto: string, temMidia?: boolean, temAudio?: boolean): string {
  const t = (texto || "").trim();
  if (t) return t;
  if (temAudio) return "[áudio enviado pelo celular]";
  if (temMidia) return "[foto/arquivo enviado pelo celular]";
  return "";
}

/**
 * A FOTO QUE SAI PELO CELULAR TAMBÉM É GUARDADA (0160).
 *
 * MEDIDO EM 04/11/2026: 71 fotos entraram pelas famílias e TODAS têm a imagem
 * salva. As 8 que a Sureya mandou do próprio celular viraram a frase
 * "[foto/arquivo enviado pelo celular]" e o arquivo foi jogado fora — o
 * webhook passava `temMidia: boolean` para cá, e um booleano não tem bytes.
 *
 * São justamente as fotos de lavagem: o registro que a família paga para
 * receber, e a prova de que o serviço foi feito. Só 3 dos 7 serviços
 * executados têm foto, e não é porque a Nina não fotografou.
 */
/**
 * Guarda a imagem no balde FECHADO das conversas, igual à entrada. Devolve
 * `null` quando não consegue — e quem chama grava a mensagem mesmo assim.
 */
async function guardarMidiaDoEspelho(
  clienteId: string,
  midia: { base64: string; mimetype: string },
): Promise<string | null> {
  try {
    const bytes = Buffer.from(midia.base64, "base64");
    const ext = (midia.mimetype.split("/")[1] || "jpg").split(";")[0].replace(/[^a-z0-9]/gi, "");
    const caminho = `${env.orgId()}/clientes/${clienteId}/saida-${Date.now()}.${ext}`;
    const r = await subirArquivo(supabaseAdmin(), BUCKET_CONVERSAS, caminho, bytes, midia.mimetype);
    if (!r.ok) {
      await registrarErro("espelho: nao consegui guardar a foto que saiu", r.erro, { clienteId });
      return null;
    }
    return r.url;
  } catch (e: any) {
    await registrarErro("espelho: nao consegui guardar a foto que saiu", e?.message || String(e), { clienteId });
    return null;
  }
}

export async function registrarSaidaExterna(params: {
  telefone: string;
  texto: string;
  temMidia?: boolean;
  temAudio?: boolean;
  /** Os bytes, quando o webhook conseguiu baixá-los. */
  midia?: { base64: string; mimetype: string } | null;
}): Promise<ResultadoEspelho> {
  const texto = textoDaSaida(params.texto, params.temMidia, params.temAudio);
  if (!texto) return { tipo: "nada" };

  const db = supabaseAdmin();
  const org = env.orgId();
  const cliente = await acharCliente(params.telefone);

  // ---------------------------------------------------------------- família
  if (cliente) {
    const conv = await garantirConversa(cliente.id);

    // 1) é eco do que o próprio painel mandou?
    const desde = new Date(Date.now() - JANELA_ECO_MS).toISOString();
    const { data: recentes } = await db
      .from("mensagens")
      .select("texto")
      .eq("org_id", org)
      .eq("conversa_id", conv.id)
      .eq("direcao", "saida")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(10);
    const jaTem = ((recentes as any[]) || []).some(
      (m) => ((m.texto as string) || "").trim() === texto
    );
    if (jaTem) return { tipo: "eco" };

    // 2) grava. `pelo_celular` só existe depois da migration 0033 — se não
    //    existir, grava sem a coluna em vez de perder a mensagem.
    // GUARDA PRIMEIRO, GRAVA DEPOIS — a mesma ordem da entrada. Se o Storage
    // falhar, a mensagem ainda entra na conversa, só sem a imagem; perder a
    // linha inteira por causa do arquivo seria trocar um defeito por outro.
    const midiaUrl = params.midia
      ? await guardarMidiaDoEspelho(cliente.id, params.midia)
      : null;

    const base: any = {
      org_id: org,
      conversa_id: conv.id,
      cliente_id: cliente.id,
      direcao: "saida",
      autor: "humano",
      texto,
      processada: true,
      midia_url: midiaUrl,
    };
    const { error } = await db.from("mensagens").insert({ ...base, pelo_celular: true });
    if (error) await db.from("mensagens").insert(base);

    // 3) ela já respondeu — a IA não responde de novo
    await db
      .from("mensagens")
      .update({ processada: true })
      .eq("org_id", org)
      .eq("conversa_id", conv.id)
      .eq("direcao", "entrada")
      .eq("processada", false);

    return { tipo: "cliente", conversaId: conv.id };
  }

  // ------------------------------------------------------------------ lead
  // Só anexa a lead que já existe. Nunca cria: o número é pessoal dela.
  const { data: lead } = await db
    .from("leads")
    .select("id,mensagens")
    .eq("org_id", org)
    .eq("telefone", params.telefone)
    .maybeSingle();
  if (!lead) return { tipo: "nada" };

  const msgs: MsgLead[] = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
  const agora = Date.now();
  const jaTem = msgs.some(
    (m) =>
      m &&
      m.de === "nos" &&
      (m.texto || "").trim() === texto &&
      m.t &&
      agora - new Date(m.t).getTime() < JANELA_ECO_MS
  );
  if (jaTem) return { tipo: "eco" };

  msgs.push({ t: new Date().toISOString(), texto: texto.slice(0, 800), de: "nos", via: "celular" });
  await db
    .from("leads")
    .update({ mensagens: msgs.slice(-20) })
    .eq("id", (lead as any).id);

  return { tipo: "lead" };
}
