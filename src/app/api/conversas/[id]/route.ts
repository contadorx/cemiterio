import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinar } from "@/lib/storage";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const id = params.id;

  const { data: conv } = await db
    .from("conversas")
    .select("id,cliente_id,escalada_humano,resolvida,arquivada_em,clientes(nome,telefone,familia_id)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  // pelo_celular so existe depois da migration 0033. Sem o fallback, a conversa
  // inteira sumiria da tela ate a migration rodar.
  async function carregarMensagens() {
    const r = await db
      .from("mensagens")
      .select("autor,direcao,texto,transcrita,pelo_celular,midia_url,created_at")
      .eq("conversa_id", id)
      .order("created_at", { ascending: true });
    if (!r.error) return r.data;
    const r2 = await db
      .from("mensagens")
      .select("autor,direcao,texto,transcrita,midia_url,created_at")
      .eq("conversa_id", id)
      .order("created_at", { ascending: true });
    return r2.data;
  }

  const [msgsCruas, { data: rasc }] = await Promise.all([
    carregarMensagens(),
    db.from("interacoes_ia").select("id,rascunho,assunto,motivo_retencao,created_at").eq("conversa_id", id).is("acao_humana", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // O LINK QUE ABRE, NO LUGAR DO ENDEREÇO CRU (0139).
  //
  // `conversas` é um balde FECHADO — é o que a família mandou no privado, e
  // nunca saiu daqui para lugar nenhum. A imagem continua aparecendo na
  // conversa; o que muda é que o link morre em uma hora em vez de valer para
  // sempre para quem o tiver.
  const adm139 = supabaseAdmin();
  // "NÃO TEM IMAGEM" E "NÃO CONSEGUI ABRIR A IMAGEM" SÃO COISAS DIFERENTES.
  //
  // Sem `midia_falhou`, um link que não assinou vira `midia_url: null` — e a
  // tela, que só testa `m.midia_url &&`, simplesmente não desenha nada. A
  // mensagem apareceria como se a família nunca tivesse mandado foto nenhuma.
  // É o mesmo defeito que fez 39 imagens sumirem antes da 0134, agora pela
  // porta do link em vez da porta do upload.
  const msgs = await Promise.all(((msgsCruas || []) as any[]).map(async (m) => {
    if (!m.midia_url) return m;
    const link = await assinar(adm139, m.midia_url);
    return { ...m, midia_url: link, midia_falhou: !link };
  }));

  // abriu = leu (mas ainda não respondeu)
  await db.rpc("sureya_marcar_conversa", { p_conversa: id, p_acao: "lida" }).then(() => null, () => null);

  return NextResponse.json({
    ok: true,
    conversa: {
      id: (conv as any).id,
      clienteId: (conv as any).cliente_id,
      // A CONTA DA FAMÍLIA PRECISA DELE. Sem o familiaId a conversa não tem
      // como perguntar "de qual mês é este pagamento", e a resposta continua
      // a três telas de distância.
      familiaId: (conv as any).clientes?.familia_id || null,
      cliente: (conv as any).clientes?.nome || (conv as any).clientes?.telefone || "—",
      escalada: (conv as any).escalada_humano,
      // O ESTADO TEM DE CHEGAR NA TELA DA CONVERSA.
      //
      // "Resolver" e "Arquivar" existiam so na LISTA. Quem estava dentro da
      // conversa — que e onde se decide que o assunto acabou, porque e onde se
      // acabou de responder — tinha de voltar, achar a linha e agir de fora.
      // A tela nem sabia se aquela conversa ja estava resolvida.
      resolvida: !!(conv as any).resolvida,
      arquivada: !!(conv as any).arquivada_em,
    },
    mensagens: msgs || [],
    rascunho: rasc || null,
  });
}

// PATCH { escalada_humano } — assumir (true) ou devolver à IA (false)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  if (typeof body?.escalada_humano !== "boolean") {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  const { error } = await db
    .from("conversas")
    .update({ escalada_humano: body.escalada_humano })
    .eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
