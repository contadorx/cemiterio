import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { auditar } from "@/lib/auditoria";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O AVISO DE PRIVACIDADE, EM VERSÕES (0138).
 *
 * O QUE HAVIA
 *
 * Um campo de texto livre em `orgs.aviso_privacidade` — único, editável, sem
 * versão. Medido em 27/08: **zero caracteres**. Nunca houve texto. E 62
 * contatos marcados como tendo autorizado o contato, 59 deles vindos de uma
 * importação de planilha em 18/07.
 *
 * O sistema afirmava que 62 pessoas concordaram, e não havia com o quê.
 *
 * E se alguém escrevesse um texto ali e o mudasse depois, as 62 passariam a
 * "ter aceitado" o texto novo sem nunca o terem visto. Campo que muda em
 * silêncio não é termo — é rascunho.
 *
 * O QUE MUDA
 *
 * O texto passa a ter versão. Publicada, uma versão não se edita mais: mudar
 * o texto cria a próxima. É isso que faz dela uma versão — a trava está no
 * banco (`tg_termo_publicado_nao_muda`), não aqui, porque uma trava que mora
 * só na rota vale enquanto ninguém escrever a segunda rota.
 *
 * GET  as versões, qual está valendo, e quantas pessoas aceitaram cada uma.
 * POST { titulo, texto, publicar? }  cria a próxima versão.
 * PUT  { id, titulo?, texto?, publicar? }  mexe num RASCUNHO, ou publica ele.
 */

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const [versoes, vigente, porVersao] = await Promise.all([
    db.from("termos_privacidade")
      .select("id,versao,titulo,texto,publicado_em,criado_em")
      .eq("org_id", org).order("versao", { ascending: false }),
    db.rpc("sureya_termo_vigente", { p_org: org }),
    db.rpc("sureya_consentimentos_por_versao", { p_org: org }),
  ]);

  if (versoes.error) {
    return NextResponse.json({ ok: false, erro: versoes.error.message }, { status: 500 });
  }

  const v = (Array.isArray(vigente.data) ? vigente.data[0] : vigente.data) || null;

  return NextResponse.json({
    ok: true,
    versoes: versoes.data || [],
    // NÃO SOUBE ≠ NÃO EXISTE. Consulta que falhou vem nula, e a tela diz que
    // não conseguiu ler — em vez de anunciar "nenhum termo publicado" e fazer
    // alguém publicar o segundo por cima do primeiro.
    vigente: vigente.error ? null : (v?.id ? v : undefined),
    porVersao: porVersao.error ? null : (porVersao.data || []),
  });
}

/** O próximo número da fila. Nunca reaproveita: versão 3 apagada não volta. */
async function proximaVersao(db: any, org: string): Promise<number> {
  const { data } = await db.from("termos_privacidade")
    .select("versao").eq("org_id", org)
    .order("versao", { ascending: false }).limit(1).maybeSingle();
  return Number((data as any)?.versao || 0) + 1;
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const titulo = String(b?.titulo || "").trim();
  const texto = String(b?.texto || "").trim();

  // TEXTO EM BRANCO NÃO VIRA VERSÃO. Publicar um termo vazio é pior que não
  // ter termo: passa a existir um documento ao qual as pessoas "aceitaram",
  // e ele não diz nada.
  if (!texto) {
    return NextResponse.json(
      { ok: false, erro: "sem_texto", mensagem: "Escreva o aviso antes de salvar." },
      { status: 400 });
  }
  if (!titulo) {
    return NextResponse.json(
      { ok: false, erro: "sem_titulo", mensagem: "Dê um título ao aviso." },
      { status: 400 });
  }

  const versao = await proximaVersao(db, org);
  const publicar = b?.publicar === true;
  const agora = new Date().toISOString();

  const { data, error } = await db.from("termos_privacidade").insert({
    org_id: org,
    versao,
    titulo,
    texto,
    criado_por: auth.userId || null,
    ...(publicar ? { publicado_em: agora, publicado_por: auth.userId || null } : {}),
  }).select("id,versao,publicado_em").maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });

  // Quem publicou qual texto e quando é a pergunta que se faz depois, e é
  // exatamente a que não se podia responder até aqui.
  await auditar(db, org, auth.userId || null,
    publicar ? "publicou_termo_privacidade" : "criou_rascunho_termo_privacidade",
    { tipo: "termo", id: (data as any)?.id },
    { versao, titulo, tamanho: texto.length });

  return NextResponse.json({ ok: true, termo: data });
}

export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const id = String(b?.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const { data: atual } = await db.from("termos_privacidade")
    .select("id,versao,publicado_em").eq("id", id).eq("org_id", org).maybeSingle();
  if (!atual) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  // A TRAVA DE VERDADE MORA NO BANCO. Esta aqui existe para a tela dar uma
  // frase em português em vez do erro cru do gatilho — não é ela que protege.
  if ((atual as any).publicado_em && (b?.texto !== undefined || b?.titulo !== undefined)) {
    return NextResponse.json(
      { ok: false, erro: "termo_publicado_nao_muda",
        mensagem: "Esta versão já foi publicada e não muda mais. Publique uma versão nova." },
      { status: 400 });
  }

  const campos: Record<string, any> = {};
  if (typeof b?.titulo === "string") campos.titulo = b.titulo.trim();
  if (typeof b?.texto === "string") campos.texto = b.texto.trim();
  if (b?.publicar === true && !(atual as any).publicado_em) {
    campos.publicado_em = new Date().toISOString();
    campos.publicado_por = auth.userId || null;
  }
  if (!Object.keys(campos).length) {
    return NextResponse.json({ ok: false, erro: "nada_a_mudar" }, { status: 400 });
  }

  const { error } = await db.from("termos_privacidade").update(campos).eq("id", id).eq("org_id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });

  if (campos.publicado_em) {
    await auditar(db, org, auth.userId || null, "publicou_termo_privacidade",
      { tipo: "termo", id }, { versao: (atual as any).versao });
  }

  return NextResponse.json({ ok: true });
}
