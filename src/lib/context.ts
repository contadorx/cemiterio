import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import type { ContextoCliente } from "./persona";

export interface ClienteRow {
  id: string;
  nome: string;
  telefone: string;
  ativo_ia: boolean;
  modo: "copiloto" | "automatico";
  score: number;
  perfil_ia: string | null;
  instrucoes_ia: string | null;
}

// Acha o cliente pelo telefone dentro da org. É a allowlist:
// telefone que não bater aqui = sem cliente = IA fica muda.
export async function acharCliente(telefone: string): Promise<ClienteRow | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("clientes")
    .select("id,nome,telefone,ativo_ia,modo,score,perfil_ia,instrucoes_ia")
    .eq("org_id", env.orgId())
    .eq("telefone", telefone)
    .maybeSingle();
  return (data as ClienteRow) || null;
}

function formatarData(d?: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-BR");
}

function formatarReal(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Saldo = Σ créditos confirmados − Σ débitos. >0 adiantado, <0 em aberto.
async function calcularSaldoTexto(clienteId: string): Promise<string> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("movimentos")
    .select("tipo,valor,status_conc")
    .eq("org_id", env.orgId())
    .eq("cliente_id", clienteId);

  let saldo = 0;
  for (const m of data || []) {
    if ((m as any).status_conc === "rejeitado") continue;
    const v = Number((m as any).valor) || 0;
    saldo += (m as any).tipo === "credito" ? v : -v;
  }
  if (Math.abs(saldo) < 0.005) return "em dia";
  return saldo > 0
    ? `adiantado ${formatarReal(saldo)}`
    : `em aberto ${formatarReal(Math.abs(saldo))}`;
}

export async function montarContexto(cliente: ClienteRow): Promise<ContextoCliente> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const [saldoTexto, proximo, ultimo, tumulos] = await Promise.all([
    calcularSaldoTexto(cliente.id),
    db
      .from("servicos")
      .select("data_prevista")
      .eq("org_id", org)
      .eq("cliente_id", cliente.id)
      .in("status", ["pendente", "agendado"])
      .order("data_prevista", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("servicos")
      .select("data_executada")
      .eq("org_id", org)
      .eq("cliente_id", cliente.id)
      .eq("status", "executado")
      .order("data_executada", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("tumulos")
      .select("identificacao,falecido_nome,quadras(codigo)")
      .eq("org_id", org)
      .eq("cliente_id", cliente.id),
  ]);

  return {
    nome: cliente.nome,
    saldoTexto,
    proximoServico: formatarData((proximo.data as any)?.data_prevista),
    ultimoServico: formatarData((ultimo.data as any)?.data_executada),
    perfilIa: cliente.perfil_ia,
    instrucoesIa: cliente.instrucoes_ia,
    tumulos: (tumulos.data || []).map((t: any) => ({
      identificacao: t.identificacao,
      falecido: t.falecido_nome,
      quadra: t.quadras?.codigo || null,
    })),
  };
}

// Últimas N mensagens da conversa aberta, no formato do Anthropic.
export async function historicoConversa(
  conversaId: string,
  limite = 12
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("mensagens")
    .select("autor,texto")
    .eq("org_id", env.orgId())
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(limite);

  const rows = (data || []).reverse();
  return rows.map((m: any) => ({
    role: m.autor === "cliente" ? "user" : "assistant",
    content: m.texto || "",
  }));
}
