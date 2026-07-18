import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import type { DadosComprovante, Midia } from "./comprovante";

// Sobe a imagem do comprovante no Storage (best-effort). Se falhar, segue sem URL:
// o registro do pagamento é mais importante que a imagem.
async function subirImagem(clienteId: string, midia: Midia): Promise<string | null> {
  try {
    const db = supabaseAdmin();
    const ext = midia.mimetype === "application/pdf" ? "pdf" : midia.mimetype.split("/")[1] || "jpg";
    const path = `${env.orgId()}/${clienteId}/${Date.now()}.${ext}`;
    const bytes = Buffer.from(midia.base64, "base64");

    const { error } = await db.storage
      .from("comprovantes")
      .upload(path, bytes, { contentType: midia.mimetype, upsert: false });
    if (error) {
      console.error("[conciliacao] upload falhou:", error.message);
      return null;
    }
    const { data } = db.storage.from("comprovantes").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error("[conciliacao] upload exceção:", (e as any)?.message || e);
    return null;
  }
}

// Registra o comprovante (a_conferir) + um movimento de crédito pendente ligado a ele.
// Uma pessoa confirma depois no painel (RPC sureya_conciliar_comprovante).
export async function registrarComprovante(
  clienteId: string,
  midia: Midia,
  dados: DadosComprovante
): Promise<{ comprovanteId: string }> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const imagemUrl = await subirImagem(clienteId, midia);

  const { data: comp, error: e1 } = await db
    .from("comprovantes")
    .insert({
      org_id: org,
      cliente_id: clienteId,
      imagem_url: imagemUrl,
      valor_extraido: dados.valor,
      data_extraida: dados.data,
      id_transacao: dados.id_transacao,
      status: "a_conferir",
    })
    .select("id")
    .single();
  if (e1) throw new Error(`comprovante: ${e1.message}`);

  const comprovanteId = (comp as any).id as string;

  // Só cria a pendência de crédito se tem valor lido.
  if (dados.valor && dados.valor > 0) {
    const { error: e2 } = await db.from("movimentos").insert({
      org_id: org,
      cliente_id: clienteId,
      tipo: "credito",
      valor: dados.valor,
      origem: "pix_comprovante",
      comprovante_id: comprovanteId,
      status_conc: "a_conferir",
      descricao: "Comprovante de Pix (aguardando conferência)",
      data: dados.data || new Date().toISOString().slice(0, 10),
    });
    if (e2) console.error("[conciliacao] movimento pendente falhou:", e2.message);
  }

  return { comprovanteId };
}
