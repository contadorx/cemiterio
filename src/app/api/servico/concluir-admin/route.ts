import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { subirFotoServico, notificarFamilia } from "@/lib/servico";
import { consumirMaterial } from "@/lib/consumo";
import { carimbarRemuneracao, ehAvulso } from "@/lib/remuneracao";
import { diaOperacao } from "@/lib/vencimento";

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
    .select("id,status,cliente_id,tumulo_id,valor,plano_id,executora_id,planos(momento_cobranca,cadencia)")
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
    // MESMA TRAVA DO CAMPO: só transiciona quem ainda não está executado.
    // Sem isto, a rota lia o status numa consulta e atualizava noutra — duas
    // submissões simultâneas (duplo clique, aba repetida) passavam as duas e
    // a família levava dois débitos pela mesma limpeza.
  }).eq("id", servicoId).eq("org_id", org).neq("status", "executado");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // débito (idempotente): quem paga antes já pagou, não debita de novo
  //
  // O valor vinha cru de servicos.valor. Um AVULSO pode nascer sem valor (a
  // ficha deixa em branco de propósito, quando você ainda não decidiu quanto
  // cobrar) — e aí o débito entrava vazio: limpeza feita, nada a receber, e
  // ninguém avisado. Agora cai na mesma cascata que o app de campo já usava:
  // valor do serviço → valor do plano → valor de referência da casa.
  let debitou = false;
  let valorDebitado: number | null = null;
  if (momento !== "antes") {
    let valor = Number((serv as any).valor) || 0;
    if (!valor && (serv as any).plano_id) {
      const { data: plano } = await db
        .from("planos").select("valor_vigente").eq("id", (serv as any).plano_id).maybeSingle();
      valor = Number((plano as any)?.valor_vigente) || 0;
    }
    if (!valor) {
      const { data: o } = await db
        .from("orgs").select("valor_referencia_limpeza").eq("id", org).maybeSingle();
      valor = Number((o as any)?.valor_referencia_limpeza) || 40;
    }

    const { data: jaTem } = await db
      .from("movimentos").select("id").eq("servico_id", servicoId).eq("tipo", "debito").maybeSingle();
    if (!jaTem) {
      await db.from("movimentos").insert({
        org_id: org, cliente_id: (serv as any).cliente_id, tipo: "debito",
        valor, origem: "servico", servico_id: servicoId,
        status_conc: "confirmado", descricao: "Limpeza executada",
        // dia de Sao Paulo, igual ao campo (com UTC, conclusao depois das
        // 21h caia no dia — e no mes — seguinte)
        data: diaOperacao(),
      });
      debitou = true;
      valorDebitado = valor;
      // congela no serviço o que foi cobrado, para a ficha e o relatório
      if (!Number((serv as any).valor)) {
        await db.from("servicos").update({ valor }).eq("id", servicoId).eq("org_id", org);
      }
    }
  }

  // remuneracao da executora deste servico (0031). Concluido pelo painel, a
  // executora e quem estava na escala — nao quem clicou. Se ninguem estiver
  // marcado, o painel pode informar b.executoraId.
  const quem = b?.executoraId || (serv as any).executora_id || null;
  if (quem) {
    if (!(serv as any).executora_id) {
      await db.from("servicos").update({ executora_id: quem }).eq("id", servicoId);
    }
    // receita = o valor REALMENTE cobrado (cascata resolvida), nao o que
    // estava gravado antes — que e nulo justamente nos avulsos. Com regra por
    // percentual, o carimbo saia R$ 0,00 sem erro nenhum.
    await carimbarRemuneracao(db, {
      servicoId, orgId: org, executoraId: quem,
      receita: valorDebitado ?? (Number((serv as any).valor) || 0),
      avulso: ehAvulso(serv as any),
    });
  }

  const material = await consumirMaterial(servicoId).catch(() => ({ total: 0, itens: [] }));
  const aviso = b?.notificar === false
    ? { enviado: false, motivo: "desmarcado" as const }
    : await notificarFamilia(servicoId, urlDepois);
  const notificado = aviso.enviado;

  return NextResponse.json({
    ok: true, urlDepois, duracao, debitou, valorDebitado, momento, notificado, material, motivoEnvio: aviso.motivo,
  });
}
