import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { auditar } from "@/lib/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A CHAVE GERAL DE ENVIO DE FOTOS (migration 0085).
 *
 * Não confundir com `/api/config/disparos`: aquela é a chave MESTRA, de
 * emergência, que corta todo envio automático de todo mundo. Esta é de
 * política — "as fotos do serviço viram mensagem para a família" — e admite
 * exceção por família, que sobrepõe (`familias.enviar_fotos`).
 *
 * Desligada, a limpeza continua acontecendo inteira: débito, extrato,
 * remuneração, material, e as fotos gravadas no serviço. O que não acontece é
 * a mensagem nascer. A Sureya continua vendo as fotos no painel — foi ela quem
 * pediu para poder conferir o trabalho de campo sem que a família receba.
 */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data } = await auth.db
    .from("orgs").select("enviar_fotos_familia,dias_entre_fotos").eq("id", org).maybeSingle();

  // Quantas famílias abriram exceção — o número que explica por que a chave
  // geral pode estar ligada e uma família mesmo assim não receber.
  const [{ count: desligadas }, { count: ligadas }] = await Promise.all([
    auth.db.from("familias").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("enviar_fotos", false),
    auth.db.from("familias").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("enviar_fotos", true),
  ]);

  return NextResponse.json({
    ok: true,
    ativo: (data as any)?.enviar_fotos_familia !== false,
    diasEntreFotos: Number((data as any)?.dias_entre_fotos ?? 30) || 0,
    excecoes: { desligadas: desligadas || 0, ligadas: ligadas || 0 },
  });
}

// PUT { ativo?: boolean, diasEntreFotos?: number }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  if (body?.ativo !== undefined) patch.enviar_fotos_familia = !!body.ativo;

  // O LIMIAR DE AVISO. Só pinta a linha de atenção na fila — não bloqueia envio
  // e não envia nada. Zero desliga. Um número que não dá para entender vira
  // recusa, e não um valor de conveniência: um limiar errado faz ela descartar
  // fotos que deveriam sair.
  if (body?.diasEntreFotos !== undefined) {
    const n = Number(String(body.diasEntreFotos).replace(",", "."));
    if (!isFinite(n) || n < 0 || n > 3650) {
      return NextResponse.json({ ok: false, erro: "dias_invalidos" }, { status: 400 });
    }
    patch.dias_entre_fotos = Math.round(n);
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_mudar" }, { status: 400 });
  }

  const { error } = await auth.db.from("orgs").update(patch).eq("id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  if (patch.enviar_fotos_familia !== undefined) {
    await auditar(auth.db, org, auth.userId,
      patch.enviar_fotos_familia ? "envio_fotos_ligado" : "envio_fotos_desligado",
      { tipo: "org", id: org }, { ativo: patch.enviar_fotos_familia });
  }

  return NextResponse.json({ ok: true });
}
