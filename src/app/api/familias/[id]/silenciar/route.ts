import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "NÃO ENVIAR MAIS DISSO PARA ESTA FAMÍLIA."
 *
 * POR QUE UM SILÊNCIO POR TIPO, E NÃO UM DESCARTE DE CADA VEZ
 * ---------------------------------------------------------------------------
 * Descartar resolve a mensagem de hoje. Mas há famílias que não querem receber
 * cobrança pelo WhatsApp, e famílias em luto para quem uma mensagem
 * comemorativa é uma ofensa — e nesses casos descartar item a item é lembrar,
 * todo mês, de uma decisão que já foi tomada. Basta esquecer uma vez.
 *
 * O silêncio vale na PORTA: o gatilho de `fila_liberacao` (0094) devolve NULL
 * no insert, e a mensagem não chega nem a existir. Não é um filtro de tela — é
 * a mensagem não ser preparada.
 *
 * A FOTO NÃO PASSA POR AQUI. Ela tem chave própria desde a 0085, de TRÊS
 * estados (ligada, desligada, "segue a casa"), e é a única em que a organização
 * inteira pode ser desligada de uma vez. Absorvê-la neste array de dois estados
 * perderia o estado do meio, que é o padrão de quase todas as famílias.
 */
const TIPOS = ["cobranca", "lembrete", "agradecimento", "comemorativa", "servico"];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const tipo = String(b?.tipo || "").trim();
  const silenciar = b?.silenciar !== false;

  if (!TIPOS.includes(tipo)) {
    return NextResponse.json(
      {
        ok: false,
        erro: "tipo_invalido",
        mensagem: tipo === "foto"
          ? "A foto tem chave própria, em Config › Fotos e na ficha da família."
          : `Tipo desconhecido. Vale um de: ${TIPOS.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  // Lê antes de escrever porque o array é o estado inteiro: um update cego
  // apagaria os outros tipos que a família já tinha silenciado.
  const { data: fam, error: eLer } = await auth.db
    .from("familias").select("id,nome,silenciar").eq("id", params.id).maybeSingle();
  if (eLer) return NextResponse.json({ ok: false, erro: eLer.message }, { status: 500 });
  if (!fam) return NextResponse.json({ ok: false, erro: "familia_nao_encontrada" }, { status: 404 });

  const atual: string[] = Array.isArray((fam as any).silenciar) ? (fam as any).silenciar : [];
  const novo = silenciar
    ? [...new Set([...atual, tipo])]
    : atual.filter((t) => t !== tipo);

  const { error } = await auth.db
    .from("familias").update({ silenciar: novo }).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    familia: (fam as any).nome,
    silenciar: novo,
    // O que já está na fila NÃO é apagado: são mensagens que alguém já viu, e
    // sumir com elas na tela seria decidir por quem está olhando. O silêncio
    // vale da próxima em diante — e a tela diz isso.
    mensagem: silenciar
      ? `${(fam as any).nome} não recebe mais mensagem deste tipo. O que já está na fila continua lá, para você decidir.`
      : `${(fam as any).nome} volta a receber mensagem deste tipo.`,
  });
}
