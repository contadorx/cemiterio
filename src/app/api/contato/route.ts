import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { avisar } from "@/lib/push";
import { enviarTextoComRetry } from "@/lib/envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/contato — o formulário do site vira um lead no sistema.
 *
 * PÚBLICO, sem login. Por isso três cuidados:
 *
 * 1. usa a service role no servidor e filtra org_id explicitamente (env.orgId),
 *    igual ao webhook. A chave nunca chega ao navegador.
 * 2. só escreve na tabela `leads` e só as colunas do formulário. Não cria
 *    cliente, não cria plano, não toca em dinheiro. O pior que um engraçadinho
 *    consegue fazer é sujar a sua caixa de leads.
 * 3. campo-armadilha (`empresa`): navegador de gente não preenche, robô de spam
 *    preenche tudo. Se vier preenchido, a rota responde ok e joga fora — o robô
 *    não descobre que foi barrado e não volta com outra tática.
 *
 * Se o telefone já existe como lead, NÃO cria outro (a tabela tem unique por
 * org+telefone): acrescenta a mensagem na conversa que já estava lá. A pessoa
 * que preenche duas vezes não vira dois atendimentos.
 */

type Corpo = {
  nome?: string;
  telefone?: string;
  mensagem?: string;
  jazigo?: string;
  /** De qual cemitério a pessoa está falando — a primeira pergunta da conversa. */
  cemiterio?: string;
  /** Página, CTA e utm_*: campos invisíveis, custo zero para quem preenche. */
  utm?: Record<string, string>;
  empresa?: string; // armadilha
};

const so = (v: unknown) => String(v ?? "").trim();

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Corpo;

  // armadilha de robô: responde ok, não grava nada
  if (so(b.empresa)) return NextResponse.json({ ok: true });

  const nome = so(b.nome).slice(0, 120);
  const digitos = so(b.telefone).replace(/\D/g, "");
  const mensagem = so(b.mensagem).slice(0, 1000);
  const jazigo = so(b.jazigo).slice(0, 200);
  const cemiterio = so(b.cemiterio).slice(0, 80);

  // A ORIGEM ANÔNIMA, e só ela. Nada aqui identifica a pessoa: é de onde o
  // clique veio, para a casa saber onde há demanda sem aumentar o formulário.
  // Limitado a 12 chaves e 200 caracteres cada — o campo é público, e um POST
  // caprichoso não pode encher a tabela com um JSON de megabyte.
  const utm: Record<string, string> = {};
  if (b.utm && typeof b.utm === "object" && !Array.isArray(b.utm)) {
    for (const [k, v] of Object.entries(b.utm).slice(0, 12)) {
      const chave = so(k).slice(0, 40);
      const valor = so(v).slice(0, 200);
      if (chave && valor) utm[chave] = valor;
    }
  }

  if (!nome) {
    return NextResponse.json(
      { ok: false, erro: "sem_nome", mensagem: "Diga o seu nome." },
      { status: 400 },
    );
  }
  // 10 = fixo com DDD, 13 = 55 + celular. Fora disso é engano de digitação.
  if (digitos.length < 10 || digitos.length > 13) {
    return NextResponse.json(
      { ok: false, erro: "telefone_invalido", mensagem: "Confira o telefone com o DDD." },
      { status: 400 },
    );
  }
  const telefone = digitos.length <= 11 ? `55${digitos}` : digitos;

  let org: string;
  let db: ReturnType<typeof supabaseAdmin>;
  try {
    org = env.orgId();
    db = supabaseAdmin();
  } catch {
    // faltou variável de ambiente — não deixa a página quebrar na cara do visitante
    return NextResponse.json(
      { ok: false, erro: "config", mensagem: "Não consegui registrar agora. Chame no WhatsApp." },
      { status: 500 },
    );
  }

  const texto = [
    "[site]",
    jazigo ? `Jazigo/quem está lá: ${jazigo}` : "",
    mensagem,
  ].filter(Boolean).join(" · ");

  const agora = new Date().toISOString();
  const nova = { t: agora, texto };

  // já existe lead com esse telefone? acrescenta na conversa
  const { data: ja } = await db
    .from("leads")
    .select("id,mensagens,status")
    .eq("org_id", org)
    .eq("telefone", telefone)
    .maybeSingle();

  if (ja) {
    const antigas = Array.isArray((ja as any).mensagens) ? (ja as any).mensagens : [];
    const { error } = await db
      .from("leads")
      .update({
        mensagens: [...antigas, nova].slice(-20),
        status: (ja as any).status === "descartado" ? "novo" : (ja as any).status,
        // Quem escreve de novo pode ter dito de qual cemitério só na segunda
        // vez. Não apaga o que já havia: só preenche quando veio.
        ...(cemiterio ? { cemiterio_interesse: cemiterio } : {}),
      })
      .eq("id", (ja as any).id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, jaExistia: true });
  }

  const linha: Record<string, any> = {
    org_id: org,
    telefone,
    nome_wa: nome,
    mensagens: [nova],
    status: "novo",
    // SEM ISTO, todo contato do site ficava indistinguível dos 104 que vieram
    // do agente de IA — que gravam `origem = 'whatsapp'`. A fila não teria como
    // dizer o que veio do site.
    origem: "site",
  };

  const { data: criado, error } = await db.from("leads").insert(linha).select("id").single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // Colunas da 0061 e da 0090. O update vai separado do insert de propósito: se
  // um destes campos não existir no banco, o contato JÁ está gravado — o pior
  // caso é perder o cemitério, nunca a pessoa.
  await db
    .from("leads")
    .update({
      nome,
      contexto: jazigo || null,
      cemiterio_interesse: cemiterio || null,
      utm: Object.keys(utm).length ? utm : null,
    })
    .eq("id", (criado as any).id);

  // AVISA NA HORA (o buraco que fazia o funil inteiro não valer nada).
  //
  // O site promete "respondemos no mesmo dia". Antes desta parte, o lead era
  // gravado e NINGUÉM ficava sabendo: ele dormia até alguém abrir o painel por
  // acaso. Três avisos, do mais barato ao mais garantido:
  //   1. push no navegador de quem está no painel (se as chaves VAPID existirem);
  //   2. WhatsApp no seu celular, se SUREYA_AVISO_WHATSAPP estiver preenchida;
  //   3. a fila em /painel/contatos e o aviso no Início, que não dependem de
  //      configuração nenhuma.
  //
  // ⚠ O QUE ESTAVA ERRADO AQUI
  // Os dois primeiros avisos mandavam para a rota do CRM antigo, que o
  // middleware devolve como 404 desde que ele foi desligado — o aviso chegava
  // e o link não abria. E o item 3 falava de um card que saiu quando a tela
  // inicial virou "O mês". Os três caminhos estavam quebrados ao mesmo tempo,
  // e o texto aqui dizia que estavam de pé.
  //
  // Nada aqui pode derrubar a resposta ao visitante: tudo em try/catch.
  await avisarLeadNovo(nome, telefone, jazigo, mensagem, (criado as any).id);

  return NextResponse.json({ ok: true, leadId: (criado as any).id });
}

async function avisarLeadNovo(
  nome: string,
  telefone: string,
  jazigo: string,
  mensagem: string,
  leadId: string,
) {
  const resumo = [jazigo, mensagem].filter(Boolean).join(" · ").slice(0, 120);

  try {
    await avisar({
      titulo: `Lead novo do site: ${nome}`,
      corpo: resumo || telefone,
      url: `/painel/contatos`,
      tag: `lead-${leadId}`,
    });
  } catch (e) {
    console.error("[contato] push falhou:", (e as any)?.message || e);
  }

  const destino = env.avisoWhatsapp();
  if (!destino) return;
  try {
    await enviarTextoComRetry(
      destino,
      `🔔 *Lead novo pelo site*\n\n` +
        `*${nome}*\nWhatsApp: ${telefone}\n` +
        (jazigo ? `Jazigo: ${jazigo}\n` : "") +
        (mensagem ? `\n"${mensagem}"\n` : "") +
        `\nAbrir: https://${(process.env.NEXT_PUBLIC_SITE_URL || "zeloememoria.com.br").replace(/^https?:\/\//, "")}/painel/contatos`,
    );
  } catch (e) {
    console.error("[contato] aviso por WhatsApp falhou:", (e as any)?.message || e);
  }
}
