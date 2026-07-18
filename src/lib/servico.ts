import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { enviarWhatsappMidia } from "./evolution";

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
    .select("cliente_id,tumulos(falecido_nome)")
    .eq("org_id", org)
    .eq("id", servicoId)
    .maybeSingle();
  if (!serv) return false;

  const clienteId = (serv as any).cliente_id;
  if (!clienteId) return false;

  const { data: cli } = await db
    .from("clientes")
    .select("telefone,ativo_ia")
    .eq("org_id", org)
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return false;

  const falecido = (serv as any).tumulos?.falecido_nome;
  const caption =
    `Olá! A limpeza do túmulo${falecido ? ` de ${falecido}` : ""} foi realizada hoje. ` +
    `Segue a foto do serviço concluído. Qualquer coisa, estamos à disposição. 🌿`;

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
