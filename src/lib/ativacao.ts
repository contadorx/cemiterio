import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * RÉGUA DE ATIVAÇÃO — para quem é avulso/esporádico.
 * Em vez de cobrar, a Sureya CONVIDA: de tempos em tempos e nas datas em que
 * as famílias visitam (Finados, Dia das Mães, Dia dos Pais, Natal).
 * Tudo sai como rascunho: nada é enviado sem aprovação.
 */

function primeiroNome(nome: string): string {
  return (nome || "").trim().split(/\s+/)[0] || "";
}

// "a senhora" + "MARIA" => "MARIA"; o tratamento entra no corpo da mensagem
function saudacaoNome(nome: string): string {
  return primeiroNome(nome);
}

// Resolve a data do ano corrente para uma regra ('fixa' ou 'domingo').
function dataDoAno(regra: string, mes: number, dia: number | null, ordinal: number | null, ano: number): Date | null {
  if (regra === "fixa" && dia) return new Date(Date.UTC(ano, mes - 1, dia));
  if (regra === "domingo" && ordinal) {
    const d = new Date(Date.UTC(ano, mes - 1, 1));
    let achados = 0;
    while (d.getUTCMonth() === mes - 1) {
      if (d.getUTCDay() === 0) {
        achados++;
        if (achados === ordinal) return new Date(d);
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return null;
}

async function conversaDe(clienteId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { data: aberta } = await db
    .from("conversas").select("id")
    .eq("org_id", org).eq("cliente_id", clienteId).eq("aberta", true).maybeSingle();
  if (aberta) return (aberta as any).id;
  const { data: nova } = await db
    .from("conversas").insert({ org_id: org, cliente_id: clienteId, aberta: true })
    .select("id").single();
  return (nova as any)?.id || null;
}

async function criarConvite(clienteId: string, texto: string, motivo: string): Promise<boolean> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const ano = new Date().getFullYear();

  // trava: um convite por cliente/motivo/ano
  const { data: marcado } = await db
    .from("ativacoes_disparadas")
    .upsert({ org_id: org, cliente_id: clienteId, motivo, ano },
            { onConflict: "org_id,cliente_id,motivo,ano", ignoreDuplicates: true })
    .select("id");
  if (!marcado || marcado.length === 0) return false;   // já convidado neste ano

  const conversaId = await conversaDe(clienteId);
  if (!conversaId) return false;

  const { error } = await db.from("interacoes_ia").insert({
    org_id: org, cliente_id: clienteId, conversa_id: conversaId,
    assunto: "outro", rascunho: texto, acao_humana: null,
  });
  if (error) return false;

  await db.from("clientes").update({ ultima_ativacao_em: new Date().toISOString() }).eq("id", clienteId);
  return true;
}

// ----------------------------------------------------------------------------
// 1) Convite por DATA COMEMORATIVA — vale para TODAS as famílias, não só avulsos.
// ----------------------------------------------------------------------------
export async function convitesDeData(): Promise<number> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const hoje = new Date();
  const ano = hoje.getUTCFullYear();

  const { data: datas } = await db
    .from("datas_comemorativas")
    .select("nome,regra,mes,dia,ordinal_domingo,antecedencia_dias,mensagem")
    .eq("org_id", org).eq("ativa", true);

  const devidas = (datas || []).filter((d: any) => {
    const alvo = dataDoAno(d.regra, d.mes, d.dia, d.ordinal_domingo, ano);
    if (!alvo) return false;
    const faltam = Math.floor((alvo.getTime() - hoje.getTime()) / 86400000);
    return faltam <= (d.antecedencia_dias || 10) && faltam >= 0;
  });
  if (!devidas.length) return 0;

  const { data: clientes } = await db
    .from("clientes")
    .select("id,nome,tratamento,anonimizado_em,tumulos(identificacao)")
    .eq("org_id", org).is("anonimizado_em", null);

  let n = 0;
  for (const d of devidas as any[]) {
    for (const c of (clientes || []) as any[]) {
      const familia = c.tumulos?.identificacao || "sua família";
      const texto = String(d.mensagem || "")
        .replace(/\{tratamento_nome\}/g, saudacaoNome(c.nome))
        .replace(/\{nome\}/g, saudacaoNome(c.nome))
        .replace(/\{familia\}/g, familia.replace(/^Família\s+/i, ""));
      if (await criarConvite(c.id, texto, d.nome)) n++;
    }
  }
  return n;
}

// ----------------------------------------------------------------------------
// 2) Convite PERIÓDICO — só para quem tem ativação ligada (avulsos/esporádicos).
// ----------------------------------------------------------------------------
export async function convitesPeriodicos(): Promise<number> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: clientes } = await db
    .from("clientes")
    .select("id,nome,tratamento,ativacao_meses,ultima_ativacao_em,anonimizado_em,tumulos(identificacao)")
    .eq("org_id", org).eq("ativacao_ativa", true).is("anonimizado_em", null);

  let n = 0;
  for (const c of (clientes || []) as any[]) {
    const meses = Number(c.ativacao_meses) || 6;
    const ultima = c.ultima_ativacao_em ? new Date(c.ultima_ativacao_em).getTime() : 0;
    if (ultima && Date.now() - ultima < meses * 30 * 86400000) continue;

    // última limpeza feita, para dar contexto ao convite
    const { data: ult } = await db
      .from("servicos").select("data_executada")
      .eq("org_id", org).eq("cliente_id", c.id).eq("status", "executado")
      .order("data_executada", { ascending: false }).limit(1).maybeSingle();

    const familia = (c.tumulos?.identificacao || "").replace(/^Família\s+/i, "");
    const trat = String(c.tratamento || "").includes("senhor") && !String(c.tratamento).includes("senhora")
      ? "o senhor" : "a senhora";
    const desde = (ult as any)?.data_executada
      ? `A última vez que estivemos lá foi em ${new Date((ult as any).data_executada).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}. `
      : "";

    const texto =
      `Olá, ${saudacaoNome(c.nome)}, tudo bem? 🌿 Aqui é a Sureya. ${desde}` +
      `Passei para saber se ${trat} gostaria que a gente desse uma cuidada no jazigo da família ${familia}. ` +
      `Se quiser, já deixo agendado e mando a foto de como ficou. É só me dizer.`;

    // motivo com o ciclo, para permitir mais de um convite por ano quando a cadência é curta
    const ciclo = Math.floor(new Date().getUTCMonth() / Math.max(1, meses));
    if (await criarConvite(c.id, texto, `periodica-${ciclo}`)) n++;
  }
  return n;
}
