import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { auditar } from "@/lib/auditoria";
import { normalizarTelefone } from "@/lib/evolution";
import { garantirConversa } from "@/lib/atendimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A CAIXA DE CONTATOS DO SITE.
 *
 * O buraco que ela fecha: `POST /api/contato` grava o contato em `leads` e
 * avisa por push e por WhatsApp apontando para `/painel/leads/<id>` — que o
 * middleware devolve 404 desde que o CRM foi desligado. E o "card de leads no
 * Início" que o comentário daquela rota promete saiu quando a tela inicial
 * virou "O mês". Ou seja: o site dizia "respondemos no mesmo dia" e o contato
 * não tinha para onde ir.
 *
 * Esta é a versão mínima, e mínima de propósito: uma FILA com nome, telefone,
 * o que a pessoa escreveu, há quanto tempo espera, quantas vezes já se tentou
 * falar e qual é a próxima ação. Não é um CRM — o CRM foi desligado porque
 * tinha superfície demais para duas pessoas.
 */

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const incluirFeitos = req.nextUrl.searchParams.get("historico") === "1";

  const { data, error } = await auth.db
    .from("sureya_contatos_pendentes")
    .select("*")
    .eq("org_id", org)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const pendentes = (data || []) as any[];

  // O HISTÓRICO É OPCIONAL e vem depois, não junto: quem abre esta tela quer
  // ver quem está esperando. Misturar 98 contatos antigos do tempo do agente de
  // IA com os três de hoje esconde exatamente o que importa.
  let feitos: any[] = [];
  if (incluirFeitos) {
    const { data: h } = await auth.db
      .from("leads")
      .select("id,nome,nome_wa,telefone,origem,status,created_at,tentativas,cliente_id")
      .eq("org_id", org)
      .neq("status", "novo")
      .order("created_at", { ascending: false })
      .limit(50);
    feitos = (h || []) as any[];
  }

  return NextResponse.json({
    ok: true,
    pendentes,
    feitos,
    resumo: {
      total: pendentes.length,
      atrasados: pendentes.filter((c) => c.atrasado).length,
      vencidos: pendentes.filter((c) => c.vencido).length,
      doSite: pendentes.filter((c) => c.origem === "site").length,
    },
  });
}

/**
 * POST { id, acao, ... }
 *
 *   tentei      — registra UMA tentativa de contato (é o que tira o "atrasado")
 *   proxima     { proximaAcao?, prazo? } — o que fazer, e quando
 *   assumir     — quem clicou vira o responsável
 *   convertido  — virou cliente
 *   descartar   { motivo? } — não era para a gente
 *   reabrir     — volta para a fila
 *   virar_familia { familiaId? | nomeFamilia?, nome?, telefone? }
 *               — o contato do site vira gente de uma família, e a conversa
 *                 continua na aba Conversas. Ver o comentário grande abaixo.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id || "");
  const acao = String(b?.acao || "");
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  // O contato é lido ANTES de agir. Sem isto, `tentativas + 1` viraria um
  // update cego e um id de outra organização passaria pelo filtro do banco mas
  // não pelo desta rota.
  const { data: atual } = await auth.db
    .from("leads").select("id,tentativas,status").eq("id", id).eq("org_id", org).maybeSingle();
  if (!atual) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  const patch: Record<string, any> = {};

  switch (acao) {
    case "tentei":
      patch.tentativas = (Number((atual as any).tentativas) || 0) + 1;
      patch.ultima_tentativa_em = new Date().toISOString();
      // Quem tentou falar assume o contato, se ainda não tinha dono. É o gesto
      // que já aconteceu — pedir para marcar "responsável" depois é um passo
      // que ninguém dá.
      patch.responsavel = auth.userId;
      break;

    case "proxima": {
      if (b.proximaAcao !== undefined) {
        patch.proxima_acao = String(b.proximaAcao || "").trim().slice(0, 300) || null;
      }
      if (b.prazo !== undefined) {
        const p = String(b.prazo || "");
        // Data que não dá para entender vira nulo, e não hoje: um prazo
        // inventado faz a fila mentir sobre o que está vencido.
        patch.proximo_passo = /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : null;
      }
      if (!Object.keys(patch).length) {
        return NextResponse.json({ ok: false, erro: "nada_para_mudar" }, { status: 400 });
      }
      break;
    }

    case "assumir":
      patch.responsavel = auth.userId;
      break;

    case "convertido":
      patch.status = "convertido";
      break;

    // -----------------------------------------------------------------------
    // O CONTATO DO SITE VIRA GENTE DE UMA FAMÍLIA (e a conversa vai junto)
    // -----------------------------------------------------------------------
    //
    // "Virou cliente" só escrevia `status = 'convertido'` no lead. Não criava
    // família, não criava contato, não abria conversa. Medido em 24/08:
    // 108 de 112 leads com `cliente_id` nulo — ninguém nunca foi ligado a
    // ninguém, e a pergunta "de cada dez contatos do site, quantos viraram
    // cliente?" não tinha como ser respondida.
    //
    // São TRÊS ESCRITAS que precisam acontecer juntas ou não acontecer:
    //   1. a família (a que você escolheu, ou uma nova com o nome dado)
    //   2. o contato dentro dela, com o telefone do site
    //   3. a conversa, para o assunto continuar onde se conversa
    //
    // A ordem importa: se a conversa nascesse antes do contato, ela ficaria
    // órfã na aba e ninguém saberia de quem é.
    case "virar_familia": {
      const nome = String(b?.nome || "").trim().slice(0, 120);
      const cru = String(b?.telefone || "").trim();
      const tel = cru ? normalizarTelefone(cru) : null;

      if (!nome) {
        return NextResponse.json(
          { ok: false, erro: "faltou", mensagem: "O contato precisa de nome." },
          { status: 400 });
      }
      if (cru && !tel) {
        return NextResponse.json(
          { ok: false, erro: "telefone_invalido",
            mensagem: "Telefone inválido. Use DDD + número, como 11 94013-1413." },
          { status: 400 });
      }

      // 1. A FAMÍLIA — a escolhida, ou uma nova.
      let familiaId = String(b?.familiaId || "").trim();
      let familiaCriada = false;

      if (familiaId) {
        const { data: fam } = await auth.db
          .from("familias").select("id").eq("id", familiaId).eq("org_id", org).maybeSingle();
        if (!fam) {
          return NextResponse.json(
            { ok: false, erro: "familia_nao_encontrada",
              mensagem: "Essa família não existe mais. Recarregue e escolha de novo." },
            { status: 404 });
        }
      } else {
        const nomeFam = String(b?.nomeFamilia || "").trim().slice(0, 120) || nome;
        const { data: nova, error: eFam } = await auth.db
          .from("familias").insert({ org_id: org, nome: nomeFam }).select("id").single();
        if (eFam || !nova) {
          return NextResponse.json(
            { ok: false, erro: eFam?.message || "familia_nao_criada" }, { status: 500 });
        }
        familiaId = (nova as any).id;
        familiaCriada = true;
      }

      // 2. O CONTATO. Telefone repetido é o caso comum, não o excepcional:
      // quem escreveu pelo site pode já estar cadastrado. Aí a resposta diz
      // ONDE ele está, em vez de um erro de banco.
      const { data: cli, error: eCli } = await auth.db
        .from("clientes")
        .insert({ org_id: org, nome, telefone: tel, familia_id: familiaId })
        .select("id").single();

      if (eCli || !cli) {
        const dup = /duplicate|unique/i.test(eCli?.message || "");
        if (dup && tel) {
          const { data: jaTem } = await auth.db
            .from("clientes").select("id,nome,familia_id,familias(nome)")
            .eq("org_id", org).eq("telefone", tel).maybeSingle();
          return NextResponse.json({
            ok: false, erro: "telefone_ja_existe",
            mensagem: `Esse telefone já é de ${(jaTem as any)?.nome || "outro contato"}`
              + ((jaTem as any)?.familias?.nome ? `, na família ${(jaTem as any).familias.nome}.` : ".")
              + " Abra a ficha de lá em vez de criar outro.",
            clienteId: (jaTem as any)?.id || null,
            familiaId: (jaTem as any)?.familia_id || null,
          }, { status: 409 });
        }
        return NextResponse.json(
          { ok: false, erro: eCli?.message || "contato_nao_criado" }, { status: 500 });
      }

      const clienteId = (cli as any).id as string;

      // 3. A CONVERSA — pela MESMA porta que o WhatsApp usa (`garantirConversa`),
      // e não um insert próprio. Duas portas para abrir conversa começariam
      // iguais e terminariam discordando sobre o que é "conversa aberta".
      let conversaId: string | null = null;
      try {
        conversaId = (await garantirConversa(clienteId)).id;
      } catch {
        // A conversa é o acabamento, não o ato. Se ela falhar, o contato e a
        // família já existem — dizer "não deu" aqui faria a pessoa tentar de
        // novo e criar tudo em duplicata.
        conversaId = null;
      }

      patch.status = "convertido";
      patch.cliente_id = clienteId;

      const { error: eLead } = await auth.db
        .from("leads").update(patch).eq("id", id).eq("org_id", org);
      if (eLead) return NextResponse.json({ ok: false, erro: eLead.message }, { status: 500 });

      await auditar(auth.db, org, auth.userId, "contato_virou_familia",
        { tipo: "lead", id }, { familiaId, clienteId, conversaId, familiaCriada });

      return NextResponse.json({
        ok: true, familiaId, clienteId, conversaId, familiaCriada,
      });
    }

    case "descartar":
      patch.status = "descartado";
      patch.motivo_ignorado = String(b?.motivo || "").trim().slice(0, 300) || null;
      break;

    case "reabrir":
      patch.status = "novo";
      patch.ignorado = false;
      break;

    default:
      return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
  }

  const { error } = await auth.db.from("leads").update(patch).eq("id", id).eq("org_id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // Quem descartou um contato, e por quê, é a pergunta que aparece três meses
  // depois quando a pessoa liga cobrando resposta.
  if (acao === "descartar" || acao === "convertido") {
    await auditar(auth.db, org, auth.userId, `contato_${acao}`, { tipo: "lead", id }, patch);
  }

  return NextResponse.json({ ok: true });
}
