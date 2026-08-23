import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { calcularSaldo } from "./financeiro";

// Tudo aqui gera mensagem PREPARADA (copiloto): nada sai sozinho. Quem manda é
// a Sureya, tocando em "enviar" na tela de liberação.

/**
 * A FAMÍLIA DE UM CONTATO.
 *
 * Precisa estar aqui porque a fila decide por família: é a família que silencia
 * um tipo de mensagem (0094) e é por família que se conta a última ação. Sem
 * ela, uma família que pediu para não receber cobrança receberia assim mesmo.
 *
 * `limit(1)` e não `maybeSingle()`: nada impede duas famílias com o mesmo
 * responsável, e `maybeSingle()` devolve ERRO com duas linhas — que este código
 * leria como "não tem família" e seguiria enfileirando sem a proteção.
 */
async function familiaDe(clienteId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("familias")
    .select("id")
    .eq("org_id", env.orgId())
    .eq("responsavel_id", clienteId)
    .limit(1);
  return ((data as any[]) || [])[0]?.id ?? null;
}

/**
 * ENFILEIRAR — a porta única (0094).
 *
 * ⚠ O QUE MUDOU, e por quê
 *
 * Isto escrevia em `interacoes_ia`, que era uma SEGUNDA fila, com uma segunda
 * tela: a aba "Rascunhos da IA", dentro de outro endereço. Duas filas para o
 * mesmo ato — decidir se uma mensagem sai — davam duas telas para olhar todo
 * dia, e a segunda ninguém olhava.
 *
 * Pior que o esquecimento: as proteções da `fila_liberacao` não valiam ali. A
 * chave de "não enviar para esta família" (0085), a contagem de tentativas e o
 * destravamento do que morreu no meio do envio (0077) existiam numa fila e não
 * na outra. Uma mensagem comemorativa podia sair para uma família em luto sem
 * passar por nenhuma das duas.
 *
 * Agora tudo entra pela mesma porta e pelo mesmo gatilho.
 *
 * DEVOLVE FALSO QUANDO A PORTA BARRA. O gatilho `BEFORE INSERT` devolve NULL
 * para o que a família silenciou: o insert termina sem erro e sem linha. Ler só
 * `error` diria que enfileirou, e o contador da rotina anunciaria mensagens que
 * não existem.
 *
 * NÃO CRIA MAIS CONVERSA. A versão antiga abria uma `conversa` só para pendurar
 * o rascunho — foi assim que nasceram as 162 conversas das quais 15 têm
 * mensagem (D-12). Mensagem preparada não é conversa; conversa começa quando
 * alguém fala.
 */
async function enfileirar(
  clienteId: string,
  tipo: "cobranca" | "lembrete" | "comemorativa" | "servico",
  texto: string
): Promise<boolean> {
  const db = supabaseAdmin();

  // SEM TELEFONE NÃO HÁ PARA ONDE MANDAR (0116).
  //
  // Desde que um contato pode existir sem número, a fila passou a poder
  // receber mensagem sem destino — que só falharia na hora do envio, no meio
  // de um lote, e em silêncio. Não entra.
  //
  // Isto não esconde a família: quem não tem telefone continua aparecendo na
  // ficha e na conferência, que é onde se conserta.
  const { data: quem } = await db
    .from("clientes").select("telefone").eq("id", clienteId).maybeSingle();
  if (!String((quem as any)?.telefone || "").trim()) return false;

  const { data, error } = await db
    .from("fila_liberacao")
    .insert({
      org_id: env.orgId(),
      cliente_id: clienteId,
      familia_id: await familiaDe(clienteId),
      tipo,
      texto,
      status: "aguardando",
    })
    .select("id");
  if (error) return false;
  return (((data as any[]) || []).length) > 0;
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
    .select("cliente_id,valor_vigente,qtd_por_passagem,cadencia,clientes(nome,aviso_saldo_em,cobranca_nivel,envio_automatico)")
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
    if (cli.envio_automatico === false) continue;   // familia em revisao: nada automatico
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

    if (await enfileirar(clienteId, "lembrete", texto)) {
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

  const { data: candidatos } = await db
    .from("clientes")
    .select("id,nome,familia_id,tratamento,cobranca_em,cobranca_nivel,regua_cobranca,dias_entre_cobrancas,max_lembretes,orientacao_cobranca,anonimizado_em")
    .eq("org_id", org)
    .eq("envio_automatico", true)                    // familia em revisao fica de fora
    // UMA COBRANCA POR FAMILIA, PARA QUEM RESPONDE POR ELA.
    //
    // Desde 22/08 o saldo e da FAMILIA ("e a familia, mas sempre tem um
    // responsavel financeiro"). Sem este filtro, `calcularSaldo` devolve o
    // mesmo valor negativo para TODAS as pessoas da casa, e a familia recebe
    // uma cobranca por pessoa pela mesma divida — o pai, a filha, o neto.
    //
    // Foi um teste que pegou isto: ao acrescentar uma segunda pessoa na
    // familia do LINEU, o publico "em aberto" passou a devolver as duas.
    .eq("responsavel_financeiro", true)
    .is("anonimizado_em", null);

  // ⚠ O FILTRO ACIMA DEIXOU DE BASTAR NA 0102.
  //
  // Ate ela, um indice UNICO garantia UM `responsavel_financeiro` por familia,
  // e filtrar por ele ja devolvia uma pessoa por casa. A 0102 derrubou esse
  // teto de proposito — "permita um ou mais contatos financeiros" — e com ele
  // caiu a garantia da qual esta funcao dependia sem dizer.
  //
  // Medido em 23/08: 341 pagadores, ZERO familias com mais de um. O defeito
  // nao aparece hoje; ele aparece no dia em que a Sureya marcar o segundo
  // filho como quem acerta a conta, e a familia receber duas cobrancas pela
  // mesma divida. Arma carregada, nao recurso funcionando.
  //
  // A cobranca vai para o TITULAR (`familias.responsavel_id`), que e quem
  // responde pela casa; se a familia nao tiver titular, vai para o primeiro
  // pagador — melhor um do que nenhum, e nunca dois.
  const familiaIds = [...new Set(((candidatos || []) as any[])
    .map((c) => c.familia_id).filter(Boolean))];
  const { data: fams } = familiaIds.length
    ? await db.from("familias").select("id,responsavel_id").in("id", familiaIds)
    : { data: [] as any[] };
  const titularDa = new Map<string, string | null>(
    ((fams || []) as any[]).map((f) => [f.id, f.responsavel_id]));

  const umPorFamilia = new Map<string, any>();
  for (const c of (candidatos || []) as any[]) {
    // Sem familia a pessoa e ela mesma: cobrar por `id` nao duplica ninguem.
    const chave = c.familia_id || `solto:${c.id}`;
    const jaEscolhido = umPorFamilia.get(chave);
    const ehTitular = c.familia_id && titularDa.get(c.familia_id) === c.id;
    if (!jaEscolhido || ehTitular) umPorFamilia.set(chave, c);
  }
  const clientes = [...umPorFamilia.values()];

  let n = 0;
  for (const c of clientes || []) {
    const regua = (c as any).regua_cobranca || "padrao";
    if (regua === "nao_cobrar") continue;               // respeita a régua da família

    // "contra_foto": só cobra o que já foi entregue. Cobrar antes da foto é
    // quebrar o combinado — a foto é a prova do serviço.
    const { data: pendenteEntrega } = await db
      .from("servicos")
      .select("id,planos!inner(momento_cobranca)")
      .eq("org_id", org)
      .eq("cliente_id", (c as any).id)
      .eq("planos.momento_cobranca", "contra_foto")
      .neq("status", "executado")
      .limit(1);
    const temEntregaPendente = (pendenteEntrega || []).length > 0;

    const nivel = Number((c as any).cobranca_nivel) || 0;
    // 'suave' manda um único lembrete; as outras seguem o máximo configurado
    const maxLembretes = regua === "suave" ? 1 : Number((c as any).max_lembretes) || 3;
    if (nivel >= maxLembretes) continue;

    const espera = Number((c as any).dias_entre_cobrancas) || (regua === "firme" ? 5 : 7);
    if (!diasAtras((c as any).cobranca_em, espera)) continue;

    const s = await calcularSaldo((c as any).id);

    // "contra_foto": se ainda há lavagem por entregar, não é hora de cobrar —
    // a foto é a prova do serviço, e cobrar antes quebra o combinado.
    // O QUE JA VENCEU (0114). Cobrar competencia que ainda nao venceu e
    // cobrar antes da hora — e a Anninha combinou pagar em dezembro.
    if (temEntregaPendente && s.vencido >= -0.005) continue;
    if (s.vencido >= -0.005) continue;

    const valor = Math.abs(s.vencido).toFixed(2);
    const nome = (c as any).nome;

    // família com mais de um jazigo: o valor é do conjunto, precisa ficar claro
    const { count: nJaz } = await db
      .from("tumulos").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("cliente_id", (c as any).id);
    const doConjunto = (nJaz || 0) > 1 ? ` (referente aos ${nJaz} jazigos)` : "";
    const trat = ((c as any).tratamento || "").trim();
    const voce = trat.includes("senhora") || trat.includes("Dra") ? "a senhora" : trat.includes("senhor") ? "o senhor" : "você";
    const vc = voce === "você" ? "você" : voce;

    const suaves = [
      `Olá, ${nome}! Tudo bem? 🌿 Passando só para atualizar a nossa ficha: consta um valor de R$ ${valor} da manutenção${doConjunto}. Quando for possível, é o Pix de sempre. Sem pressa nenhuma. Muito obrigada pela confiança!`,
    ];
    const padrao = [
      `Olá, ${nome}! Tudo bem? 🌿 Passando só para atualizar a nossa ficha de controles: consta um valor de R$ ${valor} da manutenção${doConjunto}. Quando ${vc} puder, é o Pix de sempre. Muito obrigada pela confiança!`,
      `Oi, ${nome}, tudo bem? Ainda consta em aberto o valor de R$ ${valor}${doConjunto}. Se ${vc} já tiver feito o Pix, pode me mandar o comprovante por aqui? Assim deixo tudo certinho na ficha da família.`,
      `Olá, ${nome}. Sobre o valor de R$ ${valor} que segue em aberto: se ficar melhor combinar uma data, é só me dizer que eu anoto aqui. Seguimos cuidando de tudo com o mesmo carinho. 🙏`,
    ];
    const firmes = [
      `Olá, ${nome}! Tudo bem? Consta em aberto o valor de R$ ${valor} da manutenção${doConjunto}. Pode acertar pelo Pix de sempre? Fico no aguardo do comprovante para dar baixa na ficha.`,
      `Oi, ${nome}. Ainda não localizei o pagamento de R$ ${valor}. Pode me confirmar se já foi feito? Se preferir combinar uma data, me diga qual.`,
      `Olá, ${nome}. Preciso acertar com ${vc} o valor de R$ ${valor}, que segue pendente. Pode me dizer como prefere resolver? Obrigada.`,
    ];
    const textos = regua === "suave" ? suaves : regua === "firme" ? firmes : padrao;
    const texto = textos[Math.min(nivel, textos.length - 1)];

    if (await enfileirar((c as any).id, "cobranca", texto)) {
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
//
// ⚠ APOSENTADO NA 0103. Não é mais chamado pelo cron. Ver `rotinaDeMemoria`
//   em `lib/memoria.ts`.
//
// HAVIA DOIS MOTORES DE DATA, e este era o que rodava.
//
//   este (2024)                       o da 0096
//   ─────────────────────────────     ─────────────────────────────────────
//   lê tumulos.datas_gatilho          lê falecidos (0095)
//   MM-DD, sem ano                    date de verdade, com ano e precisão
//   uma lista por TÚMULO              uma linha por PESSOA
//   sempre 7 dias antes               10 · 20 (marco) · 3 (nascimento) · 15
//   textos dentro do TypeScript       biblioteca no banco, editável
//   NENHUMA supressão                 as quatro obrigatórias
//
// A última linha é a que decide. A especificação diz, sobre os limites de
// luto e frequência: "são obrigatórios, não configuráveis para cima". Este
// motor não os tem — ele mandaria a mensagem de aniversário para quem
// enterrou alguém há três semanas, e mandaria quantas fossem.
//
// Ele nunca fez isso porque `datas_gatilho` está vazio nos 270 túmulos
// (medido em 23/08). Não é um recurso funcionando: é uma arma carregada
// esperando alguém preencher o campo. A hora de descarregá-la é agora, antes
// da primeira data ser digitada.
//
// A função fica no arquivo, sem chamador, porque `gatilhos_disparados` ainda
// guarda o histórico dela e apagá-la junto perderia o registro do que já
// saiu. Não a ligue de volta: ligue o motor da 0096.
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

      if (await enfileirar((t as any).cliente_id, "comemorativa", texto)) n++;
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
      if (await enfileirar(clienteId, "comemorativa", texto)) n++;
    }
  }

  return n;
}
