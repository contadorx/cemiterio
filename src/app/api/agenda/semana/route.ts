import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A AGENDA DO PERIODO, DO JEITO QUE ELA E LIDA.
 *
 * O QUE FALTAVA AQUI
 * ---------------------------------------------------------------------------
 * A rota devolvia jazigo, quadra, contato e valor. Na tela isso virava
 * "Q Quadra 1 · Perrela · Maria · R$ 40" — e quem le a agenda para montar o
 * dia precisa saber de que FAMILIA e a lavagem e em que RUA ela fica, que sao
 * exatamente as duas coisas que nao vinham.
 *
 * A familia importa porque desde a 0091 ela e a entidade: o contato pode nao
 * existir, ou ser outro no ano que vem. Uma agenda que so mostra o contato
 * mostra o que muda e esconde o que fica.
 *
 * A rua importa porque a ordem do dia sai dela (0047). Sem a rua na tela, a
 * sequencia parece arbitraria: nao da para ver que 1º, 2º e 3º sao a mesma
 * caminhada.
 *
 * `atrasoDias` compara `data_plano` (a data teorica, congelada) com o dia em
 * que a lavagem esta marcada. E o unico numero que denuncia a lavagem que foi
 * empurrada — e que, sem ele, so aparece quando a familia reclama.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const q = req.nextUrl.searchParams;
  const inicio = q.get("inicio") || diaOperacao();
  // quantos dias mostrar: 1, 3, 7, 14, 30… ou um período com data final própria
  const dias = Math.max(1, Math.min(180, Number(q.get("dias")) || 14));
  const fim = q.get("fim") || new Date(new Date(inicio + "T00:00:00").getTime() + (dias - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await db
    .from("servicos")
    .select(
      "id,data_prevista,data_plano,ordem_dia,status,valor,estornado_em,motivo_estorno," +
      "fixado_em,executora_id,tumulo_id," +
      "tumulos(identificacao,falecido_nome,quadras(codigo),ruas(nome),familias(nome))," +
      "clientes(nome)",
    )
    .gte("data_prevista", inicio)
    .lte("data_prevista", fim)
    // cancelada some da agenda, MENOS quando foi estorno: aí precisa aparecer
    // com a marca, para o erro e a correção ficarem visíveis
    .or("status.neq.cancelado,estornado_em.not.is.null")
    .order("data_prevista", { ascending: true })
    .order("ordem_dia", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const diaDe = (iso: string) => new Date(iso + "T12:00:00Z").getTime();

  const porDia: Record<string, any[]> = {};
  for (const s of data || []) {
    const d = (s as any).data_prevista;
    const plano = (s as any).data_plano as string | null;
    porDia[d] = porDia[d] || [];
    porDia[d].push({
      id: (s as any).id,
      status: (s as any).status,
      tumuloId: (s as any).tumulo_id || null,
      jazigo: (s as any).tumulos?.identificacao || "",
      // O código da quadra JÁ VEM "Quadra 1". A tela escrevia `Q{quadra}` e
      // saía "QQuadra 1" — o prefixo mora aqui, não lá, para não haver duas
      // opiniões sobre como uma quadra se chama.
      quadra: (s as any).tumulos?.quadras?.codigo || null,
      rua: (s as any).tumulos?.ruas?.nome || null,
      familia: (s as any).tumulos?.familias?.nome || null,
      falecido: (s as any).tumulos?.falecido_nome || null,
      contato: (s as any).clientes?.nome || null,
      // QUEM LIMPA — quase sempre nulo, e isso é o normal desde que o alocador
      // parou de nomear. A tela precisa do id para poder marcar em lote.
      executoraId: (s as any).executora_id || null,
      valor: (s as any).valor,
      dataPlano: plano,
      // dias entre a data teórica do plano e o dia em que a lavagem caiu
      atrasoDias: plano && plano < d
        ? Math.round((diaDe(d) - diaDe(plano)) / 86_400_000)
        : 0,
      estornadoEm: (s as any).estornado_em || null,
      motivoEstorno: (s as any).motivo_estorno || null,
      // marcado à mão: o alocador automático não mexe nele (0041)
      fixado: !!(s as any).fixado_em,
    });
  }

  // A EQUIPE VAI JUNTO, para a tela poder oferecer "quem limpa" sem uma segunda
  // ida ao servidor — e só quem está ATIVO: oferecer alguém que saiu da equipe
  // é criar uma rota que ninguém vai ver.
  // A RLS já limita `membros` à organização da sessão — o filtro aqui é só de
  // situação.
  const { data: equipe } = await db
    .from("membros").select("user_id,nome,papel,ativo")
    .eq("ativo", true).order("nome");

  // A capacidade do dia serve para a tela dizer "13 de 20" em vez de "13" —
  // treze lavagens num dia é tranquilo ou é o limite? Sem o denominador não
  // dá para saber, e é essa a pergunta de quem monta a semana.
  const { data: cfg } = await db
    .from("orgs").select("limpezas_por_dia,dias_semana").limit(1).maybeSingle();

  return NextResponse.json({
    ok: true, inicio, fim, dias: porDia,
    capacidadeDia: Number((cfg as any)?.limpezas_por_dia) || 20,
    diasTrabalhados: (cfg as any)?.dias_semana || [1, 2, 3, 4, 5, 6],
    equipe: ((equipe as any[]) || []).map((m) => ({
      id: m.user_id, nome: m.nome || "sem nome", papel: m.papel,
    })),
  });
}
