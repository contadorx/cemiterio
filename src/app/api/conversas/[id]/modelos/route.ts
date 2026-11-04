import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { MODELOS, montarMensagem } from "@/lib/modelos-mensagem";
import { porCompetencia } from "@/lib/saldo";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OS MODELOS DE MENSAGEM DESTA CONVERSA — JÁ PREENCHIDOS.
 *
 * Devolve as frases prontas, com o tratamento da família, o valor em atraso e
 * os meses já escritos. NÃO CHAMA MODELO DE LINGUAGEM NENHUM: custo zero.
 *
 * É a resposta ao que 03/09 mostrou — a IA escrevia 170 cobranças para 152
 * irem para o lixo, quando o que a Sureya de fato manda é "Bom dia, obrigada
 * pelo envio! Deus abençoe", que é formulário e não redação.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { data: conv } = await db
    .from("conversas")
    .select("id,cliente_id,clientes(nome,tratamento,familia_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  const cli = ((conv as any).clientes || {}) as any;
  // O TRATAMENTO É DA FAMÍLIA, e o primeiro nome é o plano B. "Oi Maria das
  // Dores Ximenes" numa conversa sobre o jazigo do pai soa como cadastro.
  const tratamento = String(cli.tratamento || "").trim()
    || String(cli.nome || "").trim().split(/\s+/)[0]
    || "";

  // O que está ATRASADO entra nas frases de cobrança — e vem da MESMA conta do
  // cartão da conversa. Recalcular aqui seria a segunda verdade sobre dinheiro.
  let valor: number | null = null;
  let meses: string | null = null;
  if (cli.familia_id) {
    const { data: linhas } = await db
      .from("conta_corrente")
      .select("tipo,valor,data,competencia")
      .eq("familia_id", cli.familia_id)
      .limit(300);
    const mm = porCompetencia((linhas as any) || [], diaOperacao()).filter((m) => m.atrasado);
    if (mm.length) {
      valor = Math.round(mm.reduce((s, m) => s + m.falta, 0) * 100) / 100;
      meses = mm.map((m) => `${m.competencia.slice(5)}/${m.competencia.slice(0, 4)}`).join(" e ");
    }
  }

  const dados = { tratamento, valor, meses, jazigo: null, dia: null };

  return NextResponse.json({
    ok: true,
    // SEM TRATAMENTO A TELA NÃO OFERECE NADA, e diz por quê: `montarMensagem`
    // devolve null, e uma lista de botões que não fazem nada é pior que
    // nenhuma lista.
    tratamento: tratamento || null,
    temas: MODELOS.map((m) => ({
      chave: m.chave,
      tema: m.tema,
      quando: m.quando,
      versoes: m.versoes.map((_, i) => montarMensagem(m.chave, i, dados)).filter(Boolean),
    })).filter((t) => t.versoes.length > 0),
  });
}
