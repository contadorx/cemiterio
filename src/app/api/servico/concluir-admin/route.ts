import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { subirFotoServico, notificarFamilia } from "@/lib/servico";
import { consumirMaterial } from "@/lib/consumo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Conclusão pelo ADMIN — para quando a Nina mandou a foto por WhatsApp, ou
 * quando o próprio dono foi ao cemitério, ou quando o registro falhou no campo.
 *
 * Aceita a duração informada à mão (não há cronômetro aqui) e respeita o
 * momento de cobrança do plano: no "contra_foto", é a entrega que libera o débito.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const servicoId = String(b?.servicoId || "");
  if (!servicoId) return NextResponse.json({ ok: false, erro: "servico_obrigatorio" }, { status: 400 });
  if (!b?.fotoDepoisBase64) {
    return NextResponse.json({ ok: false, erro: "foto_obrigatoria" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: serv } = await db
    .from("servicos")
    .select("id,status,cliente_id,tumulo_id,valor,plano_id,planos(momento_cobranca)")
    .eq("org_id", org).eq("id", servicoId).maybeSingle();
  if (!serv) return NextResponse.json({ ok: false, erro: "servico_nao_encontrado" }, { status: 404 });
  if ((serv as any).status === "executado") {
    return NextResponse.json({ ok: false, erro: "ja_concluido" }, { status: 400 });
  }

  // fotos
  const urlDepois = await subirFotoServico(servicoId, b.fotoDepoisBase64, b.mimetype || "image/jpeg", "depois");
  if (!urlDepois) return NextResponse.json({ ok: false, erro: "falha_ao_subir_foto" }, { status: 500 });
  let urlAntes: string | null = null;
  if (b?.fotoAntesBase64) {
    urlAntes = await subirFotoServico(servicoId, b.fotoAntesBase64, b.mimetype || "image/jpeg", "antes");
  }

  const duracao = b?.duracaoMinutos ? Math.max(1, Number(b.duracaoMinutos)) : null;
  const momento = (serv as any).planos?.momento_cobranca || "depois";
  const agora = new Date().toISOString();

  const { error } = await db.from("servicos").update({
    status: "executado",
    data_executada: agora,
    foto_depois_url: urlDepois,
    ...(urlAntes ? { foto_antes_url: urlAntes } : {}),
    ...(duracao ? { duracao_ajustada: duracao, motivo_ajuste: b?.motivoAjuste || "informado pelo painel" } : {}),
    // no "contra_foto", a entrega é o que libera a cobrança
    ...(momento === "contra_foto" ? { cobranca_liberada_em: agora } : {}),
  }).eq("id", servicoId).eq("org_id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // débito (idempotente): quem paga antes já pagou, não debita de novo
  let debitou = false;
  if (momento !== "antes") {
    const { data: jaTem } = await db
      .from("movimentos").select("id").eq("servico_id", servicoId).eq("tipo", "debito").maybeSingle();
    if (!jaTem) {
      await db.from("movimentos").insert({
        org_id: org, cliente_id: (serv as any).cliente_id, tipo: "debito",
        valor: (serv as any).valor, origem: "servico", servico_id: servicoId,
        status_conc: "confirmado", descricao: "Limpeza executada",
        data: agora.slice(0, 10),
      });
      debitou = true;
    }
  }

  const material = await consumirMaterial(servicoId).catch(() => ({ total: 0, itens: [] }));
  const notificado = b?.notificar === false ? false : await notificarFamilia(servicoId, urlDepois);

  return NextResponse.json({
    ok: true, urlDepois, duracao, debitou, momento, notificado, material,
  });
}
