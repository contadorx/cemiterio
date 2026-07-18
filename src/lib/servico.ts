import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { enviarWhatsappMidia } from "./evolution";
import { MARCA } from "./marca";

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
    const { error } = await db.storage
      .from("servicos")
      .upload(path, bytes, { contentType: mimetype, upsert: true });
    if (error) {
      console.error("[servico] upload foto falhou:", error.message);
      return null;
    }
    return db.storage.from("servicos").getPublicUrl(path).data?.publicUrl || null;
  } catch (e) {
    console.error("[servico] upload exceção:", (e as any)?.message || e);
    return null;
  }
}

// Manda a foto do túmulo limpo pra família. É o entregável que prova o serviço.
export async function notificarFamilia(servicoId: string, fotoDepoisUrl: string): Promise<boolean> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: serv } = await db
    .from("servicos")
    .select("cliente_id,tumulo_id,tumulos(identificacao,falecido_nome)")
    .eq("org_id", org)
    .eq("id", servicoId)
    .maybeSingle();
  if (!serv) return false;

  const clienteId = (serv as any).cliente_id;
  if (!clienteId) return false;

  const { data: cli } = await db
    .from("clientes")
    .select("nome,telefone,ativo_ia,tratamento")
    .eq("org_id", org)
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return false;

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
    : "";

  const primeiroNome = String((cli as any).nome || "").trim().split(/\s+/)[0] || "";
  const trat = String((cli as any).tratamento || "");
  const comVoce = trat.includes("Dra")
    ? "com a senhora"
    : trat.includes("senhora")
    ? "com a senhora"
    : trat.includes("senhor")
    ? "com o senhor"
    : "com você";

  // Voz da casa (mesma das mensagens que a Sureya já usa).
  const caption =
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}, tudo bem? ` +
    `Aproveitei nossa rotina de cuidados de hoje no cemitério para registrar como o jazigo ` +
    `${qual || "da família"} está limpo e bem cuidado, e fiz questão de compartilhar ${comVoce}. ` +
    ((qtdJazigos || 0) > 1 && qual ? `Esta foto é do jazigo ${qual}. ` : "") +
    `Seguimos por aqui zelando por tudo com o carinho e o respeito de sempre. ` +
    `Um abraço meu e da Dona Nadir!\n\n_${MARCA.nome} · ${MARCA.assinatura}_`;

  try {
    await enviarWhatsappMidia((cli as any).telefone, fotoDepoisUrl, caption);
    await db
      .from("servicos")
      .update({ notificado_cliente: true })
      .eq("org_id", org)
      .eq("id", servicoId);
    return true;
  } catch (e) {
    console.error("[servico] notificar família falhou:", (e as any)?.message || e);
    return false;
  }
}
