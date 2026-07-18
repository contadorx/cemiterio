import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> dados agregados da tela de configurações (avaliações, indicações, erros, privacidade)
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);

  const [{ data: aval }, { data: indic }, { data: erros }, { data: orgRow }, { data: audit }] = await Promise.all([
    db.from("avaliacoes").select("nota,comentario,respondida_em,created_at").not("respondida_em", "is", null).order("respondida_em", { ascending: false }).limit(50),
    db.from("indicacoes").select("id,indicado_nome,indicado_tel,status,created_at,clientes!indicacoes_indicador_id_fkey(nome)").order("created_at", { ascending: false }).limit(50),
    db.from("erros_log").select("contexto,mensagem,created_at").order("created_at", { ascending: false }).limit(30),
    db.from("orgs").select("aviso_privacidade").eq("id", org).maybeSingle(),
    db.from("auditoria").select("acao,alvo_tipo,detalhe,created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  const notas = (aval || []).map((a: any) => a.nota).filter(Boolean);
  const media = notas.length ? notas.reduce((s: number, n: number) => s + n, 0) / notas.length : null;

  return NextResponse.json({
    ok: true,
    avaliacoes: aval || [],
    mediaAvaliacoes: media,
    indicacoes: indic || [],
    erros: erros || [],
    avisoPrivacidade: (orgRow as any)?.aviso_privacidade || "",
    auditoria: audit || [],
  });
}

// PUT { avisoPrivacidade }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const body = await req.json().catch(() => ({}));
  await auth.db.from("orgs").update({ aviso_privacidade: body?.avisoPrivacidade ?? null }).eq("id", org);
  return NextResponse.json({ ok: true });
}
