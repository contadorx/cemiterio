import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O RELATÓRIO POR TRÁS DO NÚMERO (0120).
 *
 * `?bloco=nao_atendidos&mes=2026-08` → as linhas que somam aquele cartão.
 *
 * A mesma função do banco que conta o cartão devolve a lista — de propósito.
 * Uma consulta própria aqui faria a lista e o cartão contarem o mesmo fato de
 * dois jeitos, e é assim que se ensina a não confiar em nenhum dos dois.
 */
const BLOCOS = new Set([
  "lavagens", "nao_atendidos", "sem_foto", "sem_entrega",
  "mensagens", "ia_descartadas", "sem_resposta", "flores", "devedores",
]);

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const bloco = req.nextUrl.searchParams.get("bloco") || "";
  // A lista vale AQUI e no banco. Aqui para dar uma frase em vez de um erro
  // de plpgsql; lá porque a guarda tem de valer para todo caminho, e não só
  // para o que passa por esta rota.
  if (!BLOCOS.has(bloco)) {
    return NextResponse.json(
      { ok: false, erro: "bloco_desconhecido",
        mensagem: "Não conheço esse relatório." },
      { status: 400 });
  }

  const mes = req.nextUrl.searchParams.get("mes");
  const dia = /^\d{4}-\d{2}$/.test(mes || "") ? `${mes}-01` : null;

  const { data, error } = await auth.db.rpc("sureya_painel_detalhe", {
    p_bloco: bloco, p_mes: dia, p_org: null,
  });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, bloco, linhas: data || [] });
}
