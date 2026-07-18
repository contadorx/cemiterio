import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { registrarErro } from "./monitor";

let _cli: Anthropic | null = null;
function anthropic() {
  if (!_cli) _cli = new Anthropic({ apiKey: env.anthropicKey() });
  return _cli;
}

const MSGS_PARA_REDESTILAR = 25; // a cada N mensagens novas, atualiza o perfil
const MAX_POR_RODADA = 5;        // limite por execução do cron (custo previsível)

const SYSTEM =
  "Você recebe o histórico de conversa de um cliente de um serviço de limpeza de túmulos e destila " +
  "um PERFIL curto para orientar futuros atendimentos. Escreva em tópicos curtos, 3ª pessoa: como a " +
  "pessoa gosta de ser tratada, fatos-chave (túmulo, falecido, datas que pesam), hábitos de pagamento, " +
  "combinados. Não invente nada que não esteja no histórico. Máximo ~8 linhas. Retorne só o perfil.";

// B4: mantém o perfil_ia fresco sem o dono precisar colar histórico na mão.
export async function destilarPerfisPendentes(): Promise<{ atualizados: number }> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: clientes } = await db
    .from("clientes")
    .select("id,nome,perfil_ia_msgs,anonimizado_em")
    .eq("org_id", org)
    .is("anonimizado_em", null);

  let atualizados = 0;

  for (const c of clientes || []) {
    if (atualizados >= MAX_POR_RODADA) break;

    const { count } = await db
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org)
      .eq("cliente_id", (c as any).id);

    const total = count || 0;
    const base = Number((c as any).perfil_ia_msgs) || 0;
    if (total - base < MSGS_PARA_REDESTILAR) continue;

    const { data: msgs } = await db
      .from("mensagens")
      .select("autor,texto,created_at")
      .eq("org_id", org)
      .eq("cliente_id", (c as any).id)
      .order("created_at", { ascending: false })
      .limit(120);

    const historico = (msgs || [])
      .reverse()
      .map((m: any) => `${m.autor === "cliente" ? "Cliente" : "Sureya"}: ${m.texto}`)
      .join("\n")
      .slice(0, 12000);
    if (historico.length < 200) continue;

    try {
      const resp = await anthropic().messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: "user", content: historico }],
      });
      const perfil = resp.content
        .filter((b) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n")
        .trim();
      if (!perfil) continue;

      await db
        .from("clientes")
        .update({ perfil_ia: perfil, perfil_ia_em: new Date().toISOString(), perfil_ia_msgs: total })
        .eq("id", (c as any).id);
      atualizados++;
    } catch (e) {
      await registrarErro("destilacao", e, { clienteId: (c as any).id });
    }
  }

  return { atualizados };
}
