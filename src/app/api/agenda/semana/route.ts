import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?inicio=yyyy-mm-dd (default hoje) -> 14 dias de agenda p/ o dono gerir.
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
    .select("id,data_prevista,ordem_dia,status,valor,estornado_em,motivo_estorno,fixado_em,executora_id,tumulos(identificacao,falecido_nome,quadras(codigo)),clientes(nome)")
    .gte("data_prevista", inicio)
    .lte("data_prevista", fim)
    // cancelada some da agenda, MENOS quando foi estorno: aí precisa aparecer
    // com a marca, para o erro e a correção ficarem visíveis
    .or("status.neq.cancelado,estornado_em.not.is.null")
    .order("data_prevista", { ascending: true })
    .order("ordem_dia", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const porDia: Record<string, any[]> = {};
  for (const s of data || []) {
    const d = (s as any).data_prevista;
    porDia[d] = porDia[d] || [];
    porDia[d].push({
      id: (s as any).id,
      status: (s as any).status,
      tumulo: (s as any).tumulos?.identificacao || "",
      quadra: (s as any).tumulos?.quadras?.codigo || "—",
      falecido: (s as any).tumulos?.falecido_nome || null,
      cliente: (s as any).clientes?.nome || null,
      // QUEM LIMPA — quase sempre nulo, e isso é o normal desde que o alocador
      // parou de nomear. A tela precisa do id para poder marcar em lote.
      executoraId: (s as any).executora_id || null,
      valor: (s as any).valor,
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

  return NextResponse.json({
    ok: true, inicio, fim, dias: porDia,
    equipe: ((equipe as any[]) || []).map((m) => ({
      id: m.user_id, nome: m.nome || "sem nome", papel: m.papel,
    })),
  });
}
