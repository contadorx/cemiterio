import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { clima?, observacoes? } -> fecha o dia; o que não foi feito volta pro backlog
// com prioridade elevada (não some, e é retomado antes dos outros).
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const body = await req.json().catch(() => ({}));

  // QUEM FECHA O DIA DE QUEM (0042).
  //
  // A ajudante fecha o DELA e ponto. Quando quem chama é o dono, ele precisa
  // dizer de quem: antes o admin mandava executora = null e a função entendia
  // "todo mundo" — encerrava o dia da ajudante que ainda estava no cemitério,
  // devolvendo a lista dela ao backlog no meio da tarde.
  const ehCampo = auth.papel === "campo";
  const executoraId = ehCampo ? auth.userId : (body?.executoraId || null);
  // só o dono pode pedir "o dia de todo mundo", e só pedindo de propósito
  const todos = !ehCampo && body?.todos === true;

  if (!ehCampo && !executoraId && !todos) {
    return NextResponse.json({
      ok: false,
      erro: "executora_obrigatoria",
      mensagem:
        "Diga de quem é o dia que você quer encerrar. Sem isso eu encerraria só " +
        "as limpezas sem responsável — e, se você quer mesmo fechar o dia de " +
        "toda a equipe, marque a opção (quem ainda estiver no cemitério perde a lista).",
    }, { status: 400 });
  }

  const { data, error } = await auth.db.rpc("sureya_fechar_dia", {
    p_executora: executoraId,
    // o dia que se fecha e o dia de Sao Paulo: com toISOString(), quem
    // encerrasse depois das 21h fechava o dia seguinte
    p_data: diaOperacao(),
    p_clima: body?.clima || null,
    p_observacoes: body?.observacoes || null,
    p_todos: todos,
  });

  if (error) {
    // 0042 ainda não rodou: a função antiga não conhece p_todos. Tenta de novo
    // sem o parâmetro para o campo não ficar sem "Encerrar dia".
    if (/p_todos|does not exist|argument/i.test(error.message) && !todos) {
      const r2 = await auth.db.rpc("sureya_fechar_dia", {
        p_executora: executoraId,
        p_data: diaOperacao(),
        p_clima: body?.clima || null,
        p_observacoes: body?.observacoes || null,
      });
      if (!r2.error) {
        const x = Array.isArray(r2.data) ? r2.data[0] : r2.data;
        return NextResponse.json({
          ok: true, devolvidos: x?.devolvidos ?? 0, feitos: x?.feitos ?? 0,
          aviso: "rode a migration 0042 para o motivo do 'não deu' parar de ser sobrescrito",
        });
      }
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  const r = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, devolvidos: r?.devolvidos ?? 0, feitos: r?.feitos ?? 0 });
}
