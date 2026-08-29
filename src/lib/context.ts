import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { calcularSaldo, saldoTexto } from "./financeiro";
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

const CAMPOS_CLIENTE =
  "id,nome,telefone,ativo_ia,modo,score,perfil_ia,instrucoes_ia,tratamento,regua_cobranca,orientacao_cobranca,familia_id";

// Acha o cliente pelo telefone dentro da org. É a allowlist:
// telefone que não bater aqui = sem cliente = IA fica muda.
//
// Duas portas, nesta ordem:
//   1) clientes.telefone      — o número principal da família;
//   2) telefones_cliente      — os outros aparelhos da mesma família (marido,
//      filho, comercial). É assim que o "vincular lead a cliente existente"
//      não vira lead de novo na mensagem seguinte.
// Se a tabela ainda não existe (migration 0033 não rodada), a segunda porta
// simplesmente não encontra nada — nada quebra.
export async function acharCliente(telefone: string): Promise<ClienteRow | null> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data } = await db
    .from("clientes")
    .select(CAMPOS_CLIENTE)
    .eq("org_id", org)
    .eq("telefone", telefone)
    .maybeSingle();
  if (data) return data as ClienteRow;

  const { data: extra, error: erroExtra } = await db
    .from("telefones_cliente")
    .select("cliente_id")
    .eq("org_id", org)
    .eq("telefone", telefone)
    .limit(1);
  if (erroExtra) return null;               // tabela ausente = modo antigo
  const clienteId = ((extra as any[]) || [])[0]?.cliente_id as string | undefined;
  if (!clienteId) return null;

  const { data: cli } = await db
    .from("clientes")
    .select(CAMPOS_CLIENTE)
    .eq("org_id", org)
    .eq("id", clienteId)
    .maybeSingle();
  return (cli as ClienteRow) || null;
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

// Saldo definitivo = Σ créditos CONFIRMADOS − Σ débitos (via lib/financeiro).
async function calcularSaldoTexto(clienteId: string): Promise<string> {
  return saldoTexto(await calcularSaldo(clienteId));
}

export async function montarContexto(cliente: ClienteRow): Promise<ContextoCliente> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const dadosCasa = await carregarDadosCasa();
  const familiaId = (cliente as any).familia_id as string | null;

  const [saldoTexto, proximo, ultimo, tumulos, catalogo, pedidos, comprovantes] = await Promise.all([
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
      .select("identificacao,falecido_nome,rua,quadras(codigo)")
      .eq("org_id", org)
      .eq("cliente_id", cliente.id),

    // ------------------------------------------------------------------
    // O QUE O BANCO JÁ SABIA E NÃO CHEGAVA ATÉ ELA (29/08)
    //
    // Medido: 11 das 25 respostas a famílias prometiam "deixa eu conferir e já
    // te falo". Uma delas era sobre o valor de dois vasos — e "Troca de vaso:
    // R$ 60,00" estava cadastrado. Ela prometia voltar por um dado que a casa
    // tinha, porque o dado não vinha para cá.
    // ------------------------------------------------------------------
    db.from("servicos_extras")
      .select("nome,preco,unidade")
      .eq("org_id", org).eq("ativo", true)
      .order("ordem", { ascending: true }).limit(40),

    // Pedido que ela já fez e ainda não teve resposta. Sem isto, a mensagem
    // seguinte é tratada como assunto novo e a família repete o que já disse.
    familiaId || cliente.id
      ? db.from("pedidos_conversa")
          .select("resumo,ocasiao,prazo")
          .eq("org_id", org).eq("cliente_id", cliente.id)
          .in("status", ["aberto", "pendente"])
          .order("criado_em", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as any[] } as any),

    // Comprovante recebido e ainda não conferido. Sem isto, ela pode pedir de
    // novo o que a família já mandou.
    db.from("comprovantes")
      .select("valor_extraido,data_extraida")
      .eq("org_id", org).eq("cliente_id", cliente.id)
      .eq("status", "a_conferir")
      .order("created_at", { ascending: false }).limit(5),
  ]);

  return {
    nome: cliente.nome,
    saldoTexto,
    proximoServico: formatarData((proximo.data as any)?.data_prevista),
    ultimoServico: formatarData((ultimo.data as any)?.data_executada),
    perfilIa: cliente.perfil_ia,
    instrucoesIa: cliente.instrucoes_ia,
    chavePix: dadosCasa.chavePix,
    tratamento: (cliente as any).tratamento || null,
    reguaCobranca: (cliente as any).regua_cobranca || "padrao",
    orientacaoCobranca: (cliente as any).orientacao_cobranca || null,
    varosJazigos: (tumulos.data || []).length > 1,

    // LISTA QUE NÃO VEIO NÃO É LISTA VAZIA — mas aqui o efeito de errar é
    // brando e o de não ter é conhecido: sem catálogo ela volta a prometer
    // conferir, que é o comportamento de antes. `|| []` mantém o prompt válido.
    catalogo: ((catalogo as any).data || []).map((e: any) => ({
      nome: e.nome, preco: Number(e.preco) || 0, unidade: e.unidade || null,
    })).filter((e: any) => e.preco > 0),
    pedidosAbertos: ((pedidos as any).data || []).map((p: any) => ({
      resumo: p.resumo, ocasiao: p.ocasiao || null, prazo: formatarData(p.prazo),
    })),
    comprovantesPendentes: ((comprovantes as any).data || []).map((c: any) => ({
      valor: c.valor_extraido === null ? null : Number(c.valor_extraido),
      data: formatarData(c.data_extraida),
    })),
    tumulos: (tumulos.data || []).map((t: any) => ({
      identificacao: t.identificacao,
      falecido: t.falecido_nome,
      quadra: [t.quadras?.codigo, t.rua].filter(Boolean).join(" · ") || null,
    })),
  };
}

// Conhecimento-base global do agente (treino do dono).
// Dados da casa que a IA precisa citar (Pix, marca). Sem o Pix, ela NÃO inventa.
export async function carregarDadosCasa(): Promise<{ chavePix: string | null; marca: string; assinatura: string }> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("orgs")
    .select("nome,marca_nome,marca_assinatura,chave_pix")
    .eq("id", env.orgId())
    .maybeSingle();
  return {
    chavePix: (data as any)?.chave_pix || null,
    marca: (data as any)?.marca_nome || (data as any)?.nome || "Zelo & Memória",
    assinatura: (data as any)?.marca_assinatura || "Por Dona Nadir · Desde 1990",
  };
}

export async function carregarConfigIa(): Promise<{ conhecimento: string | null; tom: string | null }> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("config_ia")
    .select("conhecimento_base,tom")
    .eq("org_id", env.orgId())
    .maybeSingle();
  return {
    conhecimento: (data as any)?.conhecimento_base || null,
    tom: (data as any)?.tom || null,
  };
}

// Últimas N mensagens da conversa aberta, no formato do Anthropic.
/**
 * Histórico da conversa COM NOÇÃO DE TEMPO.
 *
 * Sem isso a IA lê "vou pagar semana que vem" e não sabe se foi ontem ou em
 * março — e responde como se a conversa tivesse acabado de acontecer. Marcar a
 * passagem do tempo é o que transforma mensagens soltas em conversa contínua.
 */
function quandoFoi(iso: string): string | null {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias >= 365) return `há mais de um ano`;
  if (dias >= 60) return `há ${Math.floor(dias / 30)} meses`;
  if (dias >= 30) return `há um mês`;
  if (dias >= 7) return `há ${Math.floor(dias / 7)} semanas`;
  if (dias >= 2) return `há ${dias} dias`;
  if (dias === 1) return `ontem`;
  return null;   // hoje: não precisa marcar
}

export async function historicoConversa(
  conversaId: string,
  limite = 30
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("mensagens")
    .select("autor,texto,created_at,transcrita")
    .eq("org_id", env.orgId())
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(limite);

  const rows = (data || []).reverse();
  const saida: { role: "user" | "assistant"; content: string }[] = [];
  let ultimoDia = "";

  for (const m of rows as any[]) {
    const dia = String(m.created_at || "").slice(0, 10);
    let texto = m.texto || "";

    // marca a passagem de tempo quando muda o dia
    if (dia && dia !== ultimoDia) {
      const marca = quandoFoi(m.created_at);
      if (marca) texto = `[${marca}] ${texto}`;
      ultimoDia = dia;
    }
    if (m.transcrita) texto = `${texto}  (isto veio por áudio)`;

    saida.push({
      role: m.autor === "cliente" ? "user" : "assistant",
      content: texto,
    });
  }
  return saida;
}
