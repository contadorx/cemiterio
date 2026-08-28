import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { gerarEsteiraDeExtras, preverCompras } from "@/lib/extras";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O SÁBADO DAS FLORES — a esteira e a compra, numa resposta só.
 *
 * A tela faz três perguntas ao mesmo tempo e elas não se separam bem:
 *   · o que eu entrego no próximo sábado?      (a rota)
 *   · o que eu compro para ele?                (o papel da floricultura)
 *   · quanto sobra disso?                      (se o serviço novo paga)
 *
 * Uma chamada só, porque duas chamadas dariam duas fotos do mesmo instante e
 * já se viu neste sistema o que acontece quando duas telas contam o mesmo fato
 * de dois jeitos.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const hoje = diaOperacao();
  const de = req.nextUrl.searchParams.get("de") || hoje;
  // O mês inteiro por padrão: era o segundo pedido do Leandro — ver os quatro
  // sábados para negociar volume com o fornecedor.
  const ate = req.nextUrl.searchParams.get("ate")
    || new Date(new Date(de + "T12:00:00").getFullYear(),
                new Date(de + "T12:00:00").getMonth() + 1, 0)
         .toISOString().slice(0, 10);

  // GERAR NA LEITURA, e não só no cron.
  //
  // Abrir a tela de sábado de manhã e não ver o sábado porque o cron ainda não
  // rodou seria o pior momento possível para descobrir isso. A geração é
  // convergente, então chamá-la aqui não cria nada duas vezes.
  let esteira = null;
  try {
    esteira = await gerarEsteiraDeExtras(ate);
  } catch {
    // A previsão continua valendo com o que já existe: não ver a esteira nova
    // é ruim, não ver nenhuma é pior.
  }

  const { data: entregas, error } = await db
    .from("entregas_extras")
    .select("id,nome,unidade,quantidade,preco_unit,custo_unit,data_prevista,status," +
            "entregue_em,foto_url,observacao,ordem_dia,assinatura_id," +
            "tumulos(identificacao,codigo,rua,ruas(nome),quadras(codigo))," +
            "familias(nome)")
    .eq("org_id", org)
    .gte("data_prevista", de)
    .lte("data_prevista", ate)
    .order("data_prevista")
    .order("ordem_dia", { nullsFirst: false });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  let compras = null;
  try { compras = await preverCompras(de, ate); } catch { /* idem */ }

  const lista = ((entregas as any[]) || []).map((e) => ({
    id: e.id,
    nome: e.nome,
    unidade: e.unidade,
    quantidade: Number(e.quantidade) || 0,
    preco: Number(e.preco_unit) || 0,
    custo: Number(e.custo_unit) || 0,
    data: e.data_prevista,
    status: e.status,
    entregueEm: e.entregue_em,
    foto: e.foto_url,
    observacao: e.observacao,
    familia: e.familias?.nome || null,
    jazigo: e.tumulos?.identificacao || e.tumulos?.codigo || null,
    // Quadra e rua na linha: quem faz a rota precisa saber PARA ONDE ir, e
    // esta foi a mesma lição da agenda (0088).
    local: [e.tumulos?.quadras?.codigo, e.tumulos?.ruas?.nome || e.tumulos?.rua]
      .filter(Boolean).join(" · ") || null,
    avulsa: !e.assinatura_id,
  }));

  return NextResponse.json({ ok: true, de, ate, entregas: lista, compras, esteira });
}
