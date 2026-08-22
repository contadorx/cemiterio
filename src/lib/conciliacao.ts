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

  // A ULTIMA PORTA DE DINHEIRO A SAIR DO RAZAO ANTIGO.
  //
  // Ate a 0073, esta escrita ia para `movimentos` e chegava ao razao da familia
  // pelo gatilho de espelho. Agora vai direto, pela mesma porta que as treze
  // funcoes SQL usam (`sureya_lancar`) — e com isso NADA mais escreve em
  // `movimentos`, que e a condicao para congela-lo.
  //
  // O `a_conferir` e o ponto inteiro desta funcao: comprovante que a familia
  // manda no WhatsApp NAO e dinheiro ate alguem bater com o extrato. Ele entra
  // no razao marcado, aparece como "a conferir" na ficha, e so vira saldo
  // quando `sureya_conciliar_comprovante` aprovar.
  //
  // Só cria a pendência de crédito se tem valor lido.
  if (dados.valor && dados.valor > 0) {
    const { error: e2 } = await db.rpc("sureya_lancar", {
      p_cliente: clienteId,
      p_tipo: "credito",
      p_valor: dados.valor,
      p_origem: "pagamento",
      p_descricao: "Comprovante de Pix (aguardando conferência)",
      p_data: dados.data || diaOperacao(),
      p_status: "a_conferir",
      p_comprovante: comprovanteId,
    });
    // NAO derruba o comprovante se o lancamento falhar: a imagem ja esta
    // guardada e a conferencia manual continua possivel. Mas o erro tem de
    // aparecer no log — foi um `catch` mudo como este que escondeu, por meses,
    // o extrato da familia nunca funcionando.
    if (e2) console.error("[conciliacao] lancamento pendente falhou:", e2.message);
  }

  return { comprovanteId };
}
