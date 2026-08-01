import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { enviarMidiaComRetry } from "./envio";
import { disparosAtivos } from "./disparos";
import { MARCA } from "./marca";
import { subirArquivo, BUCKET_SERVICOS } from "./storage";

// Sobe uma foto do serviço no Storage (bucket 'servicos'). Retorna URL pública.
export async function subirFotoServico(
  servicoId: string,
  base64: string,
  mimetype: string,
  etapa: "antes" | "depois"
): Promise<string | null> {
  try {
    const db = supabaseAdmin();
    const ext = (mimetype.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `${env.orgId()}/${servicoId}/${etapa}-${Date.now()}.${ext}`;
    const bytes = Buffer.from(base64, "base64");
    const enviado = await subirArquivo(db, BUCKET_SERVICOS, path, bytes, mimetype);
    if (!enviado.ok) {
      console.error("[servico] upload foto falhou:", enviado.erro);
      return null;
    }
    return enviado.url;
  } catch (e) {
    console.error("[servico] upload exceção:", (e as any)?.message || e);
    return null;
  }
}

/**
 * Manda a foto do jazigo limpo pra família. É o entregável que prova o serviço.
 *
 * TRES freios, nesta ordem:
 *  1. `clientes.envio_automatico` — o interruptor por familia (revisao do cadastro);
 *  2. `orgs.disparos_ativos` — a chave mestra da casa;
 *  3. a fila de reenvio — se o WhatsApp falhar, a foto nao se perde.
 *
 * Devolve o motivo, para a tela poder dizer POR QUE nao saiu.
 */
export type ResultadoNotificacao = {
  enviado: boolean;
  motivo: "enviado" | "familia_desligada" | "disparos_desligados" | "sem_cliente" | "sem_telefone" | "falhou";
};

export async function notificarFamilia(
  servicoId: string,
  fotoDepoisUrl: string
): Promise<ResultadoNotificacao> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: serv } = await db
    .from("servicos")
    .select("cliente_id,tumulo_id,tumulos(identificacao,falecido_nome)")
    .eq("org_id", org)
    .eq("id", servicoId)
    .maybeSingle();
  if (!serv) return { enviado: false, motivo: "sem_cliente" };

  const clienteId = (serv as any).cliente_id;
  if (!clienteId) return { enviado: false, motivo: "sem_cliente" };

  const { data: cli } = await db
    .from("clientes")
    .select("nome,telefone,ativo_ia,tratamento,envio_automatico")
    .eq("org_id", org)
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return { enviado: false, motivo: "sem_cliente" };

  // FREIO 1 — familia em revisao: nada sai sozinho para ela.
  if ((cli as any).envio_automatico === false) {
    return { enviado: false, motivo: "familia_desligada" };
  }
  // FREIO 2 — chave mestra da casa desligada.
  if (!(await disparosAtivos())) {
    return { enviado: false, motivo: "disparos_desligados" };
  }
  if (!String((cli as any).telefone || "").trim()) {
    return { enviado: false, motivo: "sem_telefone" };
  }

  // Quantos jazigos esta família tem? Com mais de um, é OBRIGATÓRIO dizer qual,
  // senão a pessoa recebe fotos iguais sem saber a qual jazigo cada uma se refere.
  const { count: qtdJazigos } = await db
    .from("tumulos")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org)
    .eq("cliente_id", clienteId);

  const t = (serv as any).tumulos || {};
  // nome do jazigo: "Família BOSCARIOL" -> "BOSCARIOL"; se houver falecido, usa o falecido
  const identificacao = String(t.identificacao || "").replace(/^Família\s+/i, "").trim();
  const falecido = t.falecido_nome ? String(t.falecido_nome).trim() : "";
  const qual = falecido
    ? `de ${falecido}`
    : identificacao
    ? `da família ${identificacao}`
    : "da família";

  const primeiroNome = String((cli as any).nome || "").trim().split(/\s+/)[0] || "";
  const trat = String((cli as any).tratamento || "");
  const pronome = trat.includes("Dra") || trat.includes("senhora")
    ? "a senhora"
    : trat.includes("senhor")
    ? "o senhor"
    : "você";

  const caption = montarLegendaFoto({
    primeiroNome,
    qual,
    pronome,
    varios: (qtdJazigos || 0) > 1,
    semente: servicoId,
  });

  const saiu = await enviarMidiaComRetry((cli as any).telefone, fotoDepoisUrl, caption);
  await db
    .from("servicos")
    .update({ notificado_cliente: true })
    .eq("org_id", org)
    .eq("id", servicoId);
  return { enviado: saiu, motivo: saiu ? "enviado" : "falhou" };
}

/**
 * A legenda da foto.
 *
 * REGRA DE NEGOCIO (pedido do Leandro, 01/08): a foto e uma GENTILEZA, nao um
 * item do contrato. O texto NUNCA pode dar a entender que ela vai junto de toda
 * limpeza — senao a familia passa a cobrar a foto, e o dia em que ela nao vier
 * vira reclamacao. Por isso: nada de "sempre", "toda limpeza", "nossa rotina de
 * envio", e nenhuma promessa de proxima foto. O tom e "hoje deu para registrar".
 *
 * Tres variacoes, escolhidas pelo id do servico: o mesmo servico sempre gera o
 * mesmo texto (reenvio nao muda a mensagem), mas familias diferentes nao recebem
 * textos identicos — o que reforca que e um gesto, nao um automatismo.
 */
export function montarLegendaFoto(p: {
  primeiroNome: string;
  qual: string;
  pronome: string;
  varios: boolean;
  semente: string;
}): string {
  const ola = `Olá${p.primeiroNome ? `, ${p.primeiroNome}` : ""}, tudo bem?`;
  const corpos = [
    `Estive hoje no cemitério e, terminado o cuidado do jazigo ${p.qual}, deu para fazer este registro e mostrar para ${p.pronome}.`,
    `Passei hoje pelo jazigo ${p.qual} e sobrou um instante para tirar esta foto — quis que ${p.pronome} visse como ele ficou.`,
    `Acabei agora o cuidado do jazigo ${p.qual} e aproveitei o momento para guardar esta imagem para ${p.pronome}.`,
  ];
  let n = 0;
  for (const ch of String(p.semente || "")) n = (n + ch.charCodeAt(0)) % 997;
  const corpo = corpos[n % corpos.length];
  const desambigua = p.varios ? ` Esta é do jazigo ${p.qual}.` : "";
  return (
    `${ola} ${corpo}${desambigua} ` +
    `Seguimos zelando por tudo com o carinho e o respeito de sempre. ` +
    `Um abraço meu e da Dona Nadir!\n\n_${MARCA.nome} · ${MARCA.assinatura}_`
  );
}
