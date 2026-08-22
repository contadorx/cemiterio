import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { subirFotoServico, notificarFamilia } from "@/lib/servico";
import { registrarErro } from "@/lib/monitor";
import { rascunhoDaLavagem } from "@/lib/mensagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Conclusão pelo PAINEL — para quando a Nina mandou a foto por WhatsApp, ou
 * quando a própria dona foi ao cemitério, ou quando o registro falhou no campo.
 *
 * Build 2, lote 2: passa a usar a MESMA transação do campo
 * (`sureya_concluir_lavagem`, migration 0066).
 *
 * A auditoria pede que as duas portas se comportem igual, e elas não se
 * comportavam. Esta rota tinha a própria cópia dos oito passos — e a cópia
 * divergia em coisas que ninguém notava:
 *
 *   · **não criava o rascunho da mensagem**. Lavagem concluída pelo painel
 *     nunca aparecia na fila de liberação: a família simplesmente não recebia
 *     a foto. Pela porta do campo, aparecia.
 *   · não registrava a lavagem no extrato da família;
 *   · débito, remuneração e consumo eram outra implementação da mesma regra,
 *     com as mesmas falhas silenciosas em `try/catch`.
 *
 * Agora as duas portas chamam a mesma função, então divergir de novo exigiria
 * mudar a função — que é onde a regra deve morar.
 *
 * O QUE O PAINEL INFORMA E O CAMPO NÃO
 * ---------------------------------------------------------------------------
 * Duração digitada à mão e quem executou. Os dois são gravados ANTES da
 * chamada, e não como parâmetro novo da função.
 *
 * Isso é deliberado: acrescentar parâmetro com DEFAULT criaria uma segunda
 * assinatura de `sureya_concluir_lavagem`, e uma chamada com os 6 argumentos
 * antigos passaria a casar com as duas — `function is not unique`. Foi
 * exatamente o que aconteceu com `sureya_fechar_dia`, que existia em duas
 * versões e obrigou a rota do campo a ter um fallback que nunca funcionou.
 *
 * Gravar antes é seguro: são fatos sobre um serviço que ainda NÃO foi
 * concluído. Se a transação falhar, nada foi concluído e os dois campos ficam
 * inertes.
 */

// POST { servicoId, fotoDepoisBase64, fotoAntesBase64?, mimetype?,
//        duracaoMinutos?, motivoAjuste?, executoraId?, notificar? }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({}));
  const servicoId = String(b?.servicoId || "");
  if (!servicoId) {
    return NextResponse.json({ ok: false, erro: "servico_obrigatorio" }, { status: 400 });
  }
  if (!b?.fotoDepoisBase64) {
    return NextResponse.json({ ok: false, erro: "foto_obrigatoria" }, { status: 400 });
  }

  // ---------------------------------------------------------------- upload
  const urlDepois = await subirFotoServico(servicoId, b.fotoDepoisBase64, b.mimetype || "image/jpeg", "depois");
  if (!urlDepois) {
    return NextResponse.json({ ok: false, erro: "falha_ao_subir_foto" }, { status: 500 });
  }
  const urlAntes = b?.fotoAntesBase64
    ? await subirFotoServico(servicoId, b.fotoAntesBase64, b.mimetype || "image/jpeg", "antes")
    : null;

  // -------------------------------------------- o que só o painel informa
  const patch: Record<string, unknown> = {};
  const duracao = b?.duracaoMinutos ? Math.max(1, Number(b.duracaoMinutos)) : null;
  if (duracao) {
    patch.duracao_ajustada = duracao;
    patch.motivo_ajuste = b?.motivoAjuste || "informado pelo painel";
  }
  // Quem executou é quem estava na escala — não quem clicou no painel. Sem
  // isto, a transação carimbaria a remuneração no nome de quem administra.
  if (b?.executoraId) patch.executora_id = b.executoraId;

  if (Object.keys(patch).length) {
    const { error: ePatch } = await db
      .from("servicos").update(patch).eq("id", servicoId).neq("status", "executado");
    if (ePatch) {
      return NextResponse.json({ ok: false, erro: ePatch.message }, { status: 500 });
    }
  }

  // ------------------------------------------------------- texto da mensagem
  // Mesma composição da porta do campo, para as duas gerarem o mesmo rascunho.
  let texto: string | null = null;
  let destinatario: string | null = null;
  try {
    const { data: s } = await db
      .from("servicos").select("tumulo_id").eq("id", servicoId).maybeSingle();
    const tumuloId = (s as any)?.tumulo_id as string | null;
    if (tumuloId) {
      const { data: tum } = await db
        .from("tumulos").select("familia_id,foto_antes_url").eq("id", tumuloId).maybeSingle();
      const familiaId = (tum as any)?.familia_id as string | null;
      if (familiaId) {
        const { data: pessoas } = await db
          .from("clientes")
          .select("id,nome,recebe_fotos,responsavel_financeiro")
          .eq("familia_id", familiaId);
        const lista = (pessoas || []) as any[];
        const destino =
          lista.find((p) => p.recebe_fotos) ||
          lista.find((p) => p.responsavel_financeiro) ||
          lista[0];
        if (destino) {
          destinatario = destino.id;
          texto = rascunhoDaLavagem({
            familiaId,
            clienteId: destino.id,
            tumuloId,
            servicoId,
            nome: destino.nome || "",
            fotoAntes: (tum as any)?.foto_antes_url || urlAntes || null,
            fotoDepois: urlDepois,
          }).texto;
        }
      }
    }
  } catch {
    // Sem texto, a transação usa a frase padrão. Nada sai sem aprovação.
  }

  // ------------------------------------------------------------- a transação
  const { data, error } = await db.rpc("sureya_concluir_lavagem", {
    p_servico: servicoId,
    p_foto_depois: urlDepois,
    p_foto_antes: urlAntes,
    p_duracao_min: null,          // no painel a duração é a ajustada, gravada acima
    p_texto_mensagem: texto,
    p_destinatario: destinatario,
  });

  if (error) {
    const negado = error.code === "42501" || /sem_permissao|sem_org/.test(error.message || "");
    if (!negado) {
      await registrarErro("servico/concluir-admin: transação recusada", error.message, { servicoId });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: negado ? 403 : 500 });
  }

  const r = (Array.isArray(data) ? data[0] : data) as any;

  const aviso = b?.notificar === false
    ? { enviado: false, motivo: "desmarcado" as const }
    : await notificarFamilia(servicoId, urlDepois);

  return NextResponse.json({
    ok: true,
    urlDepois,
    duracao,
    jaExecutado: !!r?.ja_estava_executado,
    debitou: !!r?.debito_criado,
    valorDebitado: Number(r?.valor) || null,
    remuneracao: r?.remuneracao ?? null,
    material: { total: Number(r?.custo_material) || 0, itens: [] },
    notificado: aviso.enviado,
    motivoEnvio: aviso.motivo,
    reparos: (r?.reparos as string[]) || [],
  });
}
