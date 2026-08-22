import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OS OUTROS TEXTOS POSSÍVEIS PARA UMA MENSAGEM DA FILA.
 *
 * A tela de liberação já deixava editar o texto à mão. O que faltava era o
 * caminho de um toque: "este texto não ficou bom, me dá outro". Sem isso, na
 * pressa, o que sai é o que veio — e foi assim que um bilhete de sistema
 * chegou a uma família em 22/08.
 *
 * Devolve TODOS os modelos ativos da casa já renderizados para ESTA mensagem —
 * com o nome de quem recebe e o código do jazigo no lugar. Renderizar aqui, e
 * não na tela, é o que garante que o texto pré-visualizado é exatamente o que
 * o banco produziria: uma segunda implementação em TypeScript divergiria no
 * primeiro caso de tratamento ("Sr. André" x "Sr.").
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: item } = await db
    .from("fila_liberacao")
    .select("id,tipo,cliente_id,tumulo_id,servico_id")
    .eq("org_id", org).eq("id", id).maybeSingle();
  if (!item) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  const [{ data: cli }, { data: tum }] = await Promise.all([
    (item as any).cliente_id
      ? db.from("clientes").select("nome").eq("id", (item as any).cliente_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    (item as any).tumulo_id
      ? db.from("tumulos").select("codigo").eq("id", (item as any).tumulo_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  // UMA chamada devolve todos os textos já renderizados (migration 0086).
  // Renderizar aqui, em TypeScript, daria uma segunda implementação de
  // `primeiroNome` — e ela divergiria no primeiro tratamento: "Sr. André" x
  // "Sr.". O texto que a Sureya lê na prévia tem de ser, byte a byte, o texto
  // que o banco produziu.
  const { data: textos, error } = await db.rpc("sureya_textos_do_tipo", {
    p_org: org,
    p_tipo: (item as any).tipo,
    p_nome: (cli as any)?.nome || null,
    p_jazigo: (tum as any)?.codigo || null,
  });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, textos: textos || [] });
}
