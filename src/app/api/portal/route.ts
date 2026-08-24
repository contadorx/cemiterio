import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { registrarErro } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint público (sem login). Usa a chave anon + RPCs SECURITY DEFINER,
// que só expõem dados não-sensíveis do túmulo pelo token.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") || "";
  if (token.length < 16) {
    return NextResponse.json({ ok: false, erro: "token_invalido" }, { status: 400 });
  }

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: cab, error: e1 }, { data: hist, error: e2 }, { data: irmaos }] = await Promise.all([
    db.rpc("sureya_portal_cabecalho", { p_token: token }),
    db.rpc("sureya_portal_historico", { p_token: token }),
    db.rpc("sureya_portal_irmaos", { p_token: token }),
  ]);

  // FALHA NÃO É AUSÊNCIA. Esta linha juntava os dois `error` com o resultado
  // vazio e devolvia 404 "nao_encontrado" para os três casos — e foi assim que
  // o portal ficou quebrado sem ninguém saber POR QUE (0118).
  //
  // O que acontecia de verdade: `anon` não tinha permissão de executar as
  // funções, o banco respondia "permission denied", e a família lia "este link
  // não existe" sobre um link que existe.
  //
  // Agora o erro do banco é 500 e vai para o log; 404 fica reservado para o
  // que ele sempre deveria ter significado: este token não corresponde a
  // jazigo nenhum.
  if (e1 || e2) {
    await registrarErro("portal: consulta recusada pelo banco", (e1 || e2)?.message, {
      token: token.slice(0, 6) + "…",
    });
    return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 500 });
  }

  if (!cab || (Array.isArray(cab) && cab.length === 0)) {
    return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });
  }

  const cabecalho = Array.isArray(cab) ? cab[0] : cab;
  return NextResponse.json({ ok: true, cabecalho, historico: hist || [], irmaos: irmaos || [] });
}
