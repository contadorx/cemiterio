import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { calcularSaldo } from "./financeiro";

export type Publico = "todos" | "ativos" | "em_aberto" | "sem_servico_90d";

// Seleciona os clientes de um público-alvo.
async function selecionarClientes(publico: Publico): Promise<{ id: string; nome: string }[]> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: clientes } = await db
    .from("clientes")
    .select("id,nome,anonimizado_em")
    .eq("org_id", org)
    .is("anonimizado_em", null);

  const base = (clientes || []).map((c: any) => ({ id: c.id, nome: c.nome }));
  if (publico === "todos") return base;

  if (publico === "ativos") {
    const { data: planos } = await db
      .from("planos")
      .select("cliente_id")
      .eq("org_id", org)
      .eq("ativo", true);
    const ids = new Set((planos || []).map((p: any) => p.cliente_id));
    return base.filter((c) => ids.has(c.id));
  }

  if (publico === "em_aberto") {
    const out: { id: string; nome: string }[] = [];
    for (const c of base) {
      const s = await calcularSaldo(c.id);
      if (s.saldo < -0.005) out.push(c);
    }
    return out;
  }

  // sem_servico_90d
  const corte = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: recentes } = await db
    .from("servicos")
    .select("cliente_id")
    .eq("org_id", org)
    .eq("status", "executado")
    .gte("data_executada", corte);
  const comServico = new Set((recentes || []).map((s: any) => s.cliente_id));
  return base.filter((c) => !comServico.has(c.id));
}

async function conversaDe(clienteId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { data: aberta } = await db
    .from("conversas")
    .select("id")
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
  return (nova as any)?.id || null;
}

// Cria a campanha e gera UM RASCUNHO por cliente (nunca envia sozinho).
// {nome} na mensagem é trocado pelo primeiro nome do cliente.
export async function executarCampanha(params: {
  nome: string;
  mensagem: string;
  publico: Publico;
}): Promise<{ criados: number; campanhaId: string | null }> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const alvos = await selecionarClientes(params.publico);
  let criados = 0;

  for (const c of alvos) {
    const conversaId = await conversaDe(c.id);
    if (!conversaId) continue;
    const primeiroNome = (c.nome || "").split(" ")[0] || "";
    const texto = params.mensagem.replace(/\{nome\}/g, primeiroNome);

    const { error } = await db.from("interacoes_ia").insert({
      org_id: org,
      cliente_id: c.id,
      conversa_id: conversaId,
      assunto: "outro",
      rascunho: texto,
      acao_humana: null,
    });
    if (!error) criados++;
  }

  const { data: camp } = await db
    .from("campanhas")
    .insert({
      org_id: org,
      nome: params.nome,
      mensagem: params.mensagem,
      publico: params.publico,
      criados,
      executada_em: new Date().toISOString(),
    })
    .select("id")
    .single();

  return { criados, campanhaId: (camp as any)?.id || null };
}
