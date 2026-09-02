import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { registrarErro } from "@/lib/monitor";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinarVarios } from "@/lib/storage";

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

  // ==========================================================================
  // O BALDE FECHOU (0154) — E ESTA É A PÁGINA DA PRÓPRIA FAMÍLIA
  // ==========================================================================
  //
  // As fotos vinham como endereço direto e abriam porque o balde `servicos`
  // era público: qualquer pessoa com o link via a lápide, para sempre, sem
  // passar por token nenhum. Agora o link expira em uma hora.
  //
  // ASSINA COM A CHAVE DE SERVIÇO, e isso é seguro porque a AUTORIZAÇÃO JÁ
  // ACONTECEU: as três RPCs acima só devolveram linha porque o token confere.
  // Assinar o que elas devolveram é assinar o que esta família já podia ver.
  const adm = supabaseAdmin();
  const historico = (hist || []) as any[];
  const links = await assinarVarios(adm, [
    (cabecalho as any)?.foto_referencia_url,
    ...historico.flatMap((h) => [h.foto_depois_url, h.foto_antes_url]),
  ]);

  // `null` no mapa é "não consegui abrir", e a tela precisa poder dizer isso
  // em vez de mostrar uma imagem quebrada — a mesma regra da 0139.
  const abrir = (u: string | null | undefined) => (u ? links.get(u) ?? null : null);

  return NextResponse.json({
    ok: true,
    cabecalho: cabecalho
      ? { ...(cabecalho as any),
          foto_referencia_url: abrir((cabecalho as any).foto_referencia_url) }
      : cabecalho,
    historico: historico.map((h) => ({
      ...h,
      foto_depois_url: abrir(h.foto_depois_url),
      foto_antes_url: abrir(h.foto_antes_url),
    })),
    irmaos: irmaos || [],
  });
}
