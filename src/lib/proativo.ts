import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { calcularSaldo } from "./financeiro";

// Tudo aqui gera RASCUNHO (copiloto): mensagens proativas nunca saem sozinhas.

async function conversaDe(clienteId: string): Promise<{ id: string } | null> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { data: aberta } = await db
    .from("conversas")
    .select("id")
    .eq("org_id", org)
    .eq("cliente_id", clienteId)
    .eq("aberta", true)
    .maybeSingle();
  if (aberta) return { id: (aberta as any).id };
  const { data: nova, error } = await db
    .from("conversas")
    .insert({ org_id: org, cliente_id: clienteId, aberta: true })
    .select("id")
    .single();
  if (error) return null;
  return { id: (nova as any).id };
}

async function criarRascunho(
  clienteId: string,
  assunto: "cobranca" | "outro",
  texto: string
): Promise<boolean> {
  const conv = await conversaDe(clienteId);
  if (!conv) return false;
  const db = supabaseAdmin();
  const { error } = await db.from("interacoes_ia").insert({
    org_id: env.orgId(),
    cliente_id: clienteId,
    conversa_id: conv.id,
    assunto,
    rascunho: texto,
    acao_humana: null,
  });
  return !error;
}

function diasAtras(iso: string | null, dias: number): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() >= dias * 86_400_000;
}

// ----------------------------------------------------------------------------
// C2 — Aviso de saldo baixo: a próxima passagem se aproxima e o crédito não cobre.
// ----------------------------------------------------------------------------
export async function avisosSaldoBaixo(): Promise<number> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: planos } = await db
    .from("planos")
    .select("cliente_id,valor_vigente,qtd_por_passagem,cadencia,clientes(nome,aviso_saldo_em,cobranca_nivel)")
    .eq("org_id", org)
    .eq("ativo", true)
    .neq("cadencia", "avulso");

  const vistos = new Set<string>();
  let n = 0;

  for (const p of planos || []) {
    const clienteId = (p as any).cliente_id as string;
    if (vistos.has(clienteId)) continue;
    vistos.add(clienteId);

    const cli = (p as any).clientes;
    if (!cli) continue;
    if ((cli.cobranca_nivel || 0) > 0) continue; // já está na régua de cobrança
    if (!diasAtras(cli.aviso_saldo_em, 15)) continue;

    const custo =
      (Number((p as any).valor_vigente) || 0) * Math.max(1, Number((p as any).qtd_por_passagem) || 1);
    if (custo <= 0) continue;

    const s = await calcularSaldo(clienteId);
    if (s.saldo < -0.005) continue; // negativo é caso de cobrança, não de aviso
    if (s.saldo >= custo) continue; // coberto

    const texto =
      `Olá, ${cli.nome}! Tudo bem? 🌿 A próxima limpeza está se aproximando — o valor é R$ ${custo.toFixed(
        2
      )}. Quando quiser, pode garantir pelo Pix de sempre que a gente já deixa tudo certinho por aqui. Qualquer coisa, estou à disposição.`;

    if (await criarRascunho(clienteId, "cobranca", texto)) {
      await db.from("clientes").update({ aviso_saldo_em: new Date().toISOString() }).eq("id", clienteId);
      n++;
    }
  }
  return n;
}

// ----------------------------------------------------------------------------
// C3 — Cobrança gentil: saldo negativo, tom que sobe devagar, máx. 3 lembretes.
// ----------------------------------------------------------------------------
export async function cobrancaGentil(): Promise<number> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: clientes } = await db
    .from("clientes")
    .select("id,nome,tratamento,cobranca_em,cobranca_nivel,regua_cobranca,dias_entre_cobrancas,max_lembretes,orientacao_cobranca,anonimizado_em")
    .eq("org_id", org)
    .is("anonimizado_em", null);

  let n = 0;
  for (const c of clientes || []) {
    const regua = (c as any).regua_cobranca || "padrao";
    if (regua === "nao_cobrar") continue;               // respeita a régua da família

    const nivel = Number((c as any).cobranca_nivel) || 0;
    // 'suave' manda um único lembrete; as outras seguem o máximo configurado
    const maxLembretes = regua === "suave" ? 1 : Number((c as any).max_lembretes) || 3;
    if (nivel >= maxLembretes) continue;

    const espera = Number((c as any).dias_entre_cobrancas) || (regua === "firme" ? 5 : 7);
    if (!diasAtras((c as any).cobranca_em, espera)) continue;

    const s = await calcularSaldo((c as any).id);
    if (s.saldo >= -0.005) continue;

    const valor = Math.abs(s.saldo).toFixed(2);
    const nome = (c as any).nome;
    const trat = ((c as any).tratamento || "").trim();
    const voce = trat.includes("senhora") || trat.includes("Dra") ? "a senhora" : trat.includes("senhor") ? "o senhor" : "você";
    const vc = voce === "você" ? "você" : voce;

    const suaves = [
      `Olá, ${nome}! Tudo bem? 🌿 Passando só para atualizar a nossa ficha: consta um valor de R$ ${valor} da manutenção. Quando for possível, é o Pix de sempre. Sem pressa nenhuma. Muito obrigada pela confiança!`,
    ];
    const padrao = [
      `Olá, ${nome}! Tudo bem? 🌿 Passando só para atualizar a nossa ficha de controles: consta um valor de R$ ${valor} da manutenção. Quando ${vc} puder, é o Pix de sempre. Muito obrigada pela confiança!`,
      `Oi, ${nome}, tudo bem? Ainda consta em aberto o valor de R$ ${valor}. Se ${vc} já tiver feito o Pix, pode me mandar o comprovante por aqui? Assim deixo tudo certinho na ficha da família.`,
      `Olá, ${nome}. Sobre o valor de R$ ${valor} que segue em aberto: se ficar melhor combinar uma data, é só me dizer que eu anoto aqui. Seguimos cuidando de tudo com o mesmo carinho. 🙏`,
    ];
    const firmes = [
      `Olá, ${nome}! Tudo bem? Consta em aberto o valor de R$ ${valor} da manutenção. Pode acertar pelo Pix de sempre? Fico no aguardo do comprovante para dar baixa na ficha.`,
      `Oi, ${nome}. Ainda não localizei o pagamento de R$ ${valor}. Pode me confirmar se já foi feito? Se preferir combinar uma data, me diga qual.`,
      `Olá, ${nome}. Preciso acertar com ${vc} o valor de R$ ${valor}, que segue pendente. Pode me dizer como prefere resolver? Obrigada.`,
    ];
    const textos = regua === "suave" ? suaves : regua === "firme" ? firmes : padrao;
    const texto = textos[Math.min(nivel, textos.length - 1)];

    if (await criarRascunho((c as any).id, "cobranca", texto)) {
      await db
        .from("clientes")
        .update({ cobranca_nivel: nivel + 1, cobranca_em: new Date().toISOString() })
        .eq("id", (c as any).id);
      n++;
    }
  }
  return n;
}

// ----------------------------------------------------------------------------
// E1 — Gatilhos de data: Finados e aniversários (7 dias antes), 1x por ano.
// ----------------------------------------------------------------------------
export async function gatilhosDeData(): Promise<number> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const alvo = new Date(Date.now() + 7 * 86_400_000);
  const mmdd = `${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(alvo.getDate()).padStart(2, "0")}`;
  const ano = alvo.getFullYear();

  let n = 0;

  async function jaDisparado(tumuloId: string, tipo: string): Promise<boolean> {
    const { data } = await db
      .from("gatilhos_disparados")
      .upsert(
        { org_id: org, tumulo_id: tumuloId, tipo, ano },
        { onConflict: "org_id,tumulo_id,tipo,ano", ignoreDuplicates: true }
      )
      .select("id");
    return !data || data.length === 0; // nada inserido = já tinha
  }

  // aniversários por túmulo
  const { data: tumulos } = await db
    .from("tumulos")
    .select("id,cliente_id,falecido_nome,datas_gatilho,clientes(nome)")
    .eq("org_id", org)
    .not("cliente_id", "is", null);

  for (const t of tumulos || []) {
    const datas = Array.isArray((t as any).datas_gatilho) ? (t as any).datas_gatilho : [];
    for (const d of datas) {
      const dataMMDD = String(d?.data || "").slice(-5); // aceita 'MM-DD' ou 'AAAA-MM-DD'
      if (dataMMDD !== mmdd) continue;
      const tipo = d?.tipo || "falecimento";
      if (await jaDisparado((t as any).id, tipo)) continue;

      const nome = (t as any).clientes?.nome || "";
      const falecido = (t as any).falecido_nome;
      const quem = falecido ? ` de ${falecido}` : "";
      const texto =
        tipo === "nascimento"
          ? `Olá, ${nome}. Na próxima semana é o aniversário${quem} — uma data de memória e carinho. Se quiser, podemos fazer uma limpeza especial e deixar flores no túmulo para o dia. Me avisa que eu organizo tudo. 🌷`
          : `Olá, ${nome}. Sei que a próxima semana traz uma data delicada${quem ? `, a memória${quem}` : ""}. Se desejar, preparo uma limpeza especial para que o túmulo esteja bem cuidado no dia. Estou à disposição, com carinho. 🌿`;

      if (await criarRascunho((t as any).cliente_id, "outro", texto)) n++;
    }
  }

  // Finados (02/11) — um por cliente
  if (mmdd === "11-02") {
    const porCliente = new Map<string, { tumuloId: string; nome: string }>();
    for (const t of tumulos || []) {
      const cid = (t as any).cliente_id as string;
      if (!porCliente.has(cid)) {
        porCliente.set(cid, { tumuloId: (t as any).id, nome: (t as any).clientes?.nome || "" });
      }
    }
    for (const [clienteId, info] of porCliente) {
      if (await jaDisparado(info.tumuloId, "finados")) continue;
      const texto = `Olá, ${info.nome}. O Dia de Finados está chegando, e sabemos o quanto essa data é importante. Se quiser, garantimos uma limpeza caprichada antes do dia 2, para que esteja tudo bem cuidado na sua visita. É só me avisar. 🌿`;
      if (await criarRascunho(clienteId, "outro", texto)) n++;
    }
  }

  return n;
}
