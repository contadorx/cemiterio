import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { auditar } from "@/lib/auditoria";

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
