import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { redigir } from "./redator";

/**
 * PEDIDO DE AVALIAÇÃO POR WHATSAPP
 *
 * Antes a avaliação só existia se você clicasse em "Pedir avaliação" na agenda.
 * Agora, periodicamente, o sistema prepara o pedido para famílias que tiveram
 * limpeza recente e ainda não avaliaram — com o texto escrito pela IA olhando o
 * histórico. Sai como RASCUNHO: nada vai sozinho.
 */
export async function pedidosDeAvaliacao(opcoes?: {
  minimoDiasEntrePedidos?: number;   // não pede de novo antes disso
  janelaDias?: number;               // olha limpezas dos últimos N dias
  maximo?: number;                   // teto por rodada
}): Promise<number> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const janela = opcoes?.janelaDias ?? 20;
  const intervalo = opcoes?.minimoDiasEntrePedidos ?? 120;
  const maximo = opcoes?.maximo ?? 5;

  const desde = new Date(Date.now() - janela * 86400000).toISOString();

  // limpezas recentes já entregues à família
  const { data: servicos } = await db
    .from("servicos")
    .select("id,cliente_id,data_executada,tumulos(identificacao)")
    .eq("org_id", org)
    .eq("status", "executado")
    .eq("notificado_cliente", true)
    .gte("data_executada", desde)
    .order("data_executada", { ascending: false })
    .limit(60);

  let feitos = 0;
  const jaVistos = new Set<string>();

  for (const s of (servicos || []) as any[]) {
    if (feitos >= maximo) break;
    if (!s.cliente_id || jaVistos.has(s.cliente_id)) continue;
    jaVistos.add(s.cliente_id);

    // já existe avaliação para este serviço?
    const { data: temAval } = await db
      .from("avaliacoes").select("id").eq("servico_id", s.id).maybeSingle();
    if (temAval) continue;

    // pediu para esta família há pouco tempo?
    const corte = new Date(Date.now() - intervalo * 86400000).toISOString();
    const { data: recente } = await db
      .from("avaliacoes").select("id")
      .eq("org_id", org).eq("cliente_id", s.cliente_id)
      .gte("created_at", corte).limit(1).maybeSingle();
    if (recente) continue;

    // a família está devendo? não é hora de pedir avaliação
    const { data: movs } = await db
      .from("movimentos").select("tipo,valor,status_conc").eq("cliente_id", s.cliente_id);
    const saldo = (movs || []).reduce((acc: number, m: any) => {
      if (m.status_conc !== "confirmado") return acc;
      return acc + (m.tipo === "credito" ? Number(m.valor) : -Number(m.valor));
    }, 0);
    if (saldo < -0.005) continue;

    // emite o token e monta o link
    const { data: token } = await db.rpc("sureya_emitir_avaliacao", { p_servico: s.id });
    if (!token) continue;

    const cliente = await db
      .from("clientes").select("id,nome,ativo_ia").eq("id", s.cliente_id).maybeSingle();
    if (!(cliente.data as any)?.ativo_ia) continue;

    let texto = await redigir({
      clienteId: s.cliente_id, proposito: "avaliacao",
      dados: { jazigo: s.tumulos?.identificacao, dataLimpeza: s.data_executada },
    });
    if (!texto) {
      const primeiro = String((cliente.data as any).nome || "").split(/\s+/)[0];
      texto = `Olá, ${primeiro}, tudo bem? 🌿 Passei para saber se a última limpeza ficou do jeito ` +
              `que a família gosta. Se quiser deixar um recadinho, é rapidinho por aqui.`;
    }
    texto += `\n\n{LINK_AVALIACAO:${token}}`;

    // conversa da família
    let conversaId: string | null = null;
    const { data: aberta } = await db
      .from("conversas").select("id").eq("org_id", org).eq("cliente_id", s.cliente_id)
      .eq("aberta", true).maybeSingle();
    if (aberta) conversaId = (aberta as any).id;
    else {
      const { data: nova } = await db
        .from("conversas").insert({ org_id: org, cliente_id: s.cliente_id, aberta: true })
        .select("id").single();
      conversaId = (nova as any)?.id || null;
    }
    if (!conversaId) continue;

    const { error } = await db.from("interacoes_ia").insert({
      org_id: org, cliente_id: s.cliente_id, conversa_id: conversaId,
      assunto: "outro", rascunho: texto, acao_humana: null,
    });
    if (!error) feitos++;
  }

  return feitos;
}
