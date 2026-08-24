import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { calcularSaldosPorFamilia } from "./financeiro";

/**
 * O AVISO PARA TODO MUNDO — uma mensagem, muitas famílias.
 *
 * "eu queria mandar uma mensagem para todo mundo, como o aviso das moedas"
 *
 * O QUE ESTAVA ERRADO
 * ---------------------------------------------------------------------------
 * A campanha existia e escrevia em `interacoes_ia` — a lista solta de
 * rascunhos da IA. Essa lista foi APAGADA na 0094: a tela que a mostrava
 * (`VisaoRascunhos`, a aba "Fila antiga") não existe mais, e há guarda em
 * `checar-ficha.mjs` para ela não voltar. Foi por ela que 162 rascunhos se
 * acumularam sem ninguém ver.
 *
 * Ou seja: a campanha rodava, dizia "criei 338 rascunhos", e os 338 caíam num
 * lugar sem porta. Apareciam um a um dentro de cada conversa — e mandar um
 * aviso para todo mundo virava abrir 338 conversas.
 *
 * DUAS COISAS A MAIS, medidas em produção:
 *
 *   · era por CLIENTE (338), não por família (364). Uma casa com três
 *     contatos recebia três vezes o mesmo aviso.
 *   · o público "ativos" filtrava por `planos.ativo`, e `planos` tem UMA
 *     linha. O contrato mora no túmulo desde a 0100 — "ativos" selecionaria
 *     quase ninguém, em silêncio.
 *
 * O QUE VALE AGORA
 * ---------------------------------------------------------------------------
 * Uma mensagem por FAMÍLIA, para quem responde por ela, entrando na FILA DE
 * LIBERAÇÃO — onde já existe marcar em lote, enviar em lote e parar no meio.
 *
 * NADA SAI SOZINHO. A campanha enche a fila; quem manda é o comando.
 */

export type Publico = "todas" | "com_contrato" | "em_aberto" | "sem_servico_90d";

export const PUBLICOS: { id: Publico; rotulo: string; explica: string }[] = [
  { id: "todas", rotulo: "Todas as famílias",
    explica: "todas as que têm com quem falar" },
  { id: "com_contrato", rotulo: "Só quem tem contrato",
    explica: "famílias com jazigo contratado" },
  { id: "em_aberto", rotulo: "Só quem está devendo",
    explica: "com valor já vencido e não pago" },
  { id: "sem_servico_90d", rotulo: "Sem limpeza há 90 dias",
    explica: "para reaproximar quem sumiu" },
];

export interface Alvo {
  familiaId: string;
  clienteId: string;
  nome: string;
  familiaNome: string;
}

/**
 * QUEM RECEBE — uma linha por família.
 *
 * O destinatário é o titular; se ele não tiver telefone, qualquer contato da
 * família que tenha. Família sem nenhum número fica de fora e é CONTADA: desde
 * a 0116 um contato pode existir sem telefone, e enfileirar para ele seria uma
 * mensagem sem destino que só falha na hora do envio.
 */
async function selecionarFamilias(publico: Publico): Promise<{
  alvos: Alvo[]; semTelefone: number; silenciadas: number;
}> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: familias, error } = await db
    .from("familias")
    .select("id,nome,responsavel_id,contratado,silenciar")
    .eq("org_id", org);
  if (error) throw new Error(`campanha_indisponivel: ${error.message}`);

  const { data: contatos } = await db
    .from("clientes")
    .select("id,nome,familia_id,telefone,responsavel_financeiro,anonimizado_em")
    .eq("org_id", org)
    .is("anonimizado_em", null);

  const porFamilia = new Map<string, any[]>();
  for (const c of ((contatos as any[]) || [])) {
    if (!c.familia_id) continue;
    if (!String(c.telefone || "").trim()) continue;   // sem destino (0116)
    const lista = porFamilia.get(c.familia_id) || [];
    lista.push(c);
    porFamilia.set(c.familia_id, lista);
  }

  let base = ((familias as any[]) || []);

  if (publico === "com_contrato") {
    base = base.filter((f) => f.contratado);
  }

  if (publico === "em_aberto") {
    // VENCIDO, e não saldo (0114): quem tem competência lançada com o
    // vencimento lá na frente não está devendo nada.
    const saldos = await calcularSaldosPorFamilia(base.map((f) => f.id));
    base = base.filter((f) => (saldos.get(f.id)?.vencido ?? 0) < -0.005);
  }

  if (publico === "sem_servico_90d") {
    const corte = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const { data: recentes } = await db
      .from("servicos")
      .select("tumulo_id, tumulos(familia_id)")
      .eq("org_id", org).eq("status", "executado")
      .gte("data_executada", corte);
    const comServico = new Set(
      ((recentes as any[]) || []).map((s) => s.tumulos?.familia_id).filter(Boolean));
    base = base.filter((f) => !comServico.has(f.id));
  }

  const alvos: Alvo[] = [];
  let semTelefone = 0;
  let silenciadas = 0;

  for (const f of base) {
    // A FAMÍLIA QUE PEDIU SILÊNCIO. Respeitar isso na origem, e não na porta:
    // uma linha que a fila vai descartar depois só serve para poluir a
    // decisão de quem lê a fila.
    if (Array.isArray(f.silenciar) && f.silenciar.includes("lembrete")) {
      silenciadas++;
      continue;
    }

    const daFamilia = porFamilia.get(f.id) || [];
    if (!daFamilia.length) { semTelefone++; continue; }

    // O titular primeiro; depois quem acerta a conta; depois qualquer um.
    const escolhido =
      daFamilia.find((c) => c.id === f.responsavel_id)
      || daFamilia.find((c) => c.responsavel_financeiro)
      || daFamilia[0];

    alvos.push({
      familiaId: f.id,
      clienteId: escolhido.id,
      nome: escolhido.nome || f.nome,
      familiaNome: f.nome,
    });
  }

  return { alvos, semTelefone, silenciadas };
}

/** Só para a tela contar antes de disparar. Não escreve nada. */
export async function preverCampanha(publico: Publico) {
  const { alvos, semTelefone, silenciadas } = await selecionarFamilias(publico);
  return { familias: alvos.length, semTelefone, silenciadas };
}

export interface ResumoCampanha {
  criados: number;
  semTelefone: number;
  silenciadas: number;
  campanhaId: string | null;
}

/**
 * ENCHE A FILA DE LIBERAÇÃO. Não envia.
 *
 * Tipo `lembrete`, que é onde um aviso da casa cai no grupo "Demais" da tela
 * de liberação — junto com marcar em lote e o botão de parar no meio.
 *
 * O TEXTO É O MESMO PARA TODO MUNDO, de propósito. A versão anterior tinha uma
 * opção de a IA reescrever a mensagem família por família; um aviso que diz
 * coisas diferentes para cada um não é um aviso, e custava uma chamada ao
 * modelo por família — com 1,3% de aproveitamento medido em agosto.
 *
 * `{nome}` vira o primeiro nome de quem recebe. É a única variação.
 */
export async function executarCampanha(params: {
  nome: string;
  mensagem: string;
  publico: Publico;
}): Promise<ResumoCampanha> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { alvos, semTelefone, silenciadas } = await selecionarFamilias(params.publico);
  let criados = 0;

  for (const a of alvos) {
    const primeiroNome = (a.nome || "").trim().split(" ")[0] || "";
    const texto = params.mensagem.replace(/\{nome\}/g, primeiroNome);

    const { error } = await db.from("fila_liberacao").insert({
      org_id: org,
      familia_id: a.familiaId,
      cliente_id: a.clienteId,
      tipo: "lembrete",
      status: "aguardando",
      texto,
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

  return { criados, semTelefone, silenciadas, campanhaId: (camp as any)?.id || null };
}
