import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import type { DadosComprovante, Midia } from "./comprovante";
import { subirArquivo, BUCKET_COMPROVANTES } from "./storage";
import { diaOperacao } from "./vencimento";

// Sobe a imagem do comprovante no Storage (best-effort). Se falhar, segue sem URL:
// o registro do pagamento é mais importante que a imagem.
async function subirImagem(clienteId: string, midia: Midia): Promise<string | null> {
  try {
    const db = supabaseAdmin();
    const ext = midia.mimetype === "application/pdf" ? "pdf" : midia.mimetype.split("/")[1] || "jpg";
    const path = `${env.orgId()}/${clienteId}/${Date.now()}.${ext}`;
    const bytes = Buffer.from(midia.base64, "base64");

    const enviado = await subirArquivo(
      db, BUCKET_COMPROVANTES, path, bytes, midia.mimetype, { upsert: false },
    );
    if (!enviado.ok) {
      console.error("[conciliacao] upload falhou:", enviado.erro);
      return null;
    }
    return enviado.url;
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

  // POR QUE ESTA ESCRITA CONTINUA EM `movimentos`
  //
  // A decisao de 22/08 fez de `conta_corrente` a fonte da verdade, e todas as
  // LEITURAS ja migraram. As escritas nao migraram ainda — e nao precisam
  // migrar de uma vez, porque o gatilho `trg_espelha_movimento_na_conta`
  // (0071) leva cada linha daqui para o razao da familia, com `movimento_id`
  // preenchido, sem duplicar. O `status_conc: "a_conferir"` viaja junto: o
  // comprovante NAO vira saldo antes de alguem conferir, nos dois razoes.
  //
  // Migrar a escrita e o passo do congelamento de `movimentos`, e so pode
  // acontecer depois que nenhuma outra porta escrever la — hoje sao esta e as
  // funcoes SQL. Enquanto isso, o gatilho e o que mantem os dois iguais.
  //
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
      data: dados.data || diaOperacao(),
    });
    if (e2) console.error("[conciliacao] movimento pendente falhou:", e2.message);
  }

  return { comprovanteId };
}
