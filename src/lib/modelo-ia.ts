import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * ESCOLHA DO MODELO — economia sem abrir mão do que importa.
 *
 * A lógica não é "quanto mais contexto, menor o modelo". É outra:
 * o que decide é o CUSTO DE ERRAR e o quanto a situação é previsível.
 *
 *  · luto, reclamação, cancelamento → sempre o melhor modelo. Errar aqui machuca
 *    uma família enlutada, e nenhuma economia paga isso.
 *  · cobrança → modelo bom. Errar o tom custa a relação e o dinheiro.
 *  · rotina (agendamento, dúvida simples, confirmação de foto) → modelo econômico,
 *    ainda mais quando o contato já tem score alto: a IA já provou que acerta ali.
 *  · tarefas internas (destilar perfil, classificar) → sempre econômico. Ninguém lê.
 *
 * O score entra como AVAL: contato com histórico de acertos em assunto rotineiro
 * pode ir de econômico. Contato novo começa no padrão até se provar.
 */

export type Proposito =
  | "atendimento" | "destilacao" | "redator" | "campo" | "comprovante" | "classificacao";

export interface EscolhaModelo {
  modelo: string;
  apelido: string;
  precoEntrada: number;   // R$ por milhão
  precoSaida: number;
  motivo: string;
}

const SENSIVEIS = ["luto", "reclamacao", "cancelamento"];
const ROTINEIROS = ["agendamento", "duvida", "outro"];

export async function escolherModelo(p: {
  proposito: Proposito;
  assunto?: string | null;
  score?: number | null;
}): Promise<EscolhaModelo> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("modelos_ia")
    .select("apelido,modelo,preco_entrada,preco_saida")
    .eq("org_id", env.orgId())
    .eq("ativo", true);

  const porApelido = new Map<string, any>();
  for (const m of (data || []) as any[]) porApelido.set(m.apelido, m);

  const escolher = (apelido: string, motivo: string): EscolhaModelo => {
    const m = porApelido.get(apelido) || porApelido.get("padrao");
    return {
      modelo: m?.modelo || env.ANTHROPIC_MODEL,
      apelido: m?.apelido || "padrao",
      precoEntrada: Number(m?.preco_entrada) || 0,
      precoSaida: Number(m?.preco_saida) || 0,
      motivo,
    };
  };

  const assunto = (p.assunto || "").toLowerCase();
  const score = Number(p.score ?? 0);

  // tarefas internas: ninguém lê o texto, só o resultado
  if (p.proposito === "destilacao" || p.proposito === "classificacao") {
    return escolher("economico", "tarefa interna");
  }
  // leitura de comprovante é visão + extração: o econômico dá conta
  if (p.proposito === "comprovante") {
    return escolher("economico", "leitura de comprovante");
  }
  // assunto sensível: nunca economizar
  if (SENSIVEIS.includes(assunto)) {
    return escolher("delicado", `assunto sensível (${assunto})`);
  }
  // cobrança: o tom decide se a família paga ou se afasta
  if (assunto === "cobranca") {
    return escolher("padrao", "cobrança exige cuidado no tom");
  }
  // rotina com contato já provado: pode ir de econômico
  if (ROTINEIROS.includes(assunto) && score >= 70) {
    return escolher("economico", `rotina com score ${Math.round(score)}`);
  }
  // o redator escreve mensagens que a família vai ler; sem histórico, vai de padrão
  return escolher("padrao", "padrão");
}

/** Custo em R$ de uma chamada, a partir dos tokens que a API devolveu. */
export function custoDaChamada(e: EscolhaModelo, tokensEntrada: number, tokensSaida: number): number {
  const c = (tokensEntrada / 1e6) * e.precoEntrada + (tokensSaida / 1e6) * e.precoSaida;
  return Math.round(c * 10000) / 10000;
}

/** Registra a chamada com o custo REAL (não estimado). */
export async function registrarChamada(args: {
  proposito: Proposito;
  escolha: EscolhaModelo;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  assunto?: string | null;
  clienteId?: string | null;
}): Promise<number> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const entrada = Number(args.usage?.input_tokens) || 0;
  const saida = Number(args.usage?.output_tokens) || 0;
  const custo = custoDaChamada(args.escolha, entrada, saida);

  await db.from("chamadas_ia").insert({
    org_id: org,
    proposito: args.proposito,
    assunto: args.assunto || null,
    modelo: args.escolha.modelo,
    apelido: args.escolha.apelido,
    tokens_entrada: entrada,
    tokens_saida: saida,
    custo,
    cliente_id: args.clienteId || null,
  });

  // consolida no acumulado do dia
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: atual } = await db
    .from("uso_ia").select("id,chamadas,tokens_entrada,tokens_saida,custo_real")
    .eq("org_id", org).eq("dia", hoje).maybeSingle();

  if (atual) {
    await db.from("uso_ia").update({
      chamadas: Number((atual as any).chamadas) + 1,
      tokens_entrada: Number((atual as any).tokens_entrada) + entrada,
      tokens_saida: Number((atual as any).tokens_saida) + saida,
      custo_real: Number((atual as any).custo_real) + custo,
    }).eq("id", (atual as any).id);
  } else {
    await db.from("uso_ia").insert({
      org_id: org, dia: hoje, chamadas: 1,
      tokens_entrada: entrada, tokens_saida: saida, custo_real: custo,
    });
  }
  return custo;
}
