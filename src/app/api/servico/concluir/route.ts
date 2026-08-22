import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { subirFotoServico, notificarFamilia } from "@/lib/servico";
import { registrarErro } from "@/lib/monitor";
import { rascunhoDaLavagem } from "@/lib/mensagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CONCLUIR A LAVAGEM — Build 2.
 *
 * Esta rota fazia OITO coisas em sequência: subia foto, atualizava `servicos`,
 * inseria no extrato, montava o rascunho da fila, lançava o débito, congelava o
 * valor, carimbava a remuneração e baixava o material. Seis desses passos
 * ficavam dentro de `try/catch` mudos, "para não derrubar o campo" — decisão
 * correta na intenção e desastrosa no efeito: se a conexão caísse no meio, a
 * lavagem ficava executada e NÃO cobrada, e a segunda tentativa devolvia
 * `jaExecutado: true` sem reparar nada.
 *
 * E o `update` filtrava só por id e status. Nunca comparava `executora_id` com
 * quem estava chamando — apenas sobrescrevia. Qualquer conta de campo concluía
 * o serviço de qualquer outra, levando junto a remuneração.
 *
 * Agora tudo isso é UMA chamada: `sureya_concluir_lavagem` (migration 0066).
 * Uma função PL/pgSQL é uma transação — ou todos os efeitos entram, ou nenhum.
 * A autorização por executora acontece dentro do banco, onde a pessoa de campo
 * não alcança nem chamando o PostgREST direto.
 *
 * A função é CONVERGENTE: chamá-la de novo num serviço já executado não devolve
 * "já foi" — ela confere cada efeito e cria o que estiver faltando. É isso que
 * torna uma falha parcial antiga reparável: basta o campo tocar de novo.
 *
 * O que continua FORA da transação, de propósito:
 *   · o upload das fotos — Storage não participa de transação de banco;
 *   · o GPS e o aviso à família — efeitos externos, que não podem prender a
 *     transação nem desfazer a lavagem se falharem.
 */

// POST { servicoId, fotoDepoisBase64, mimetype, fotoAntesBase64?, lat?, lng?, precisao? }
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const servicoId: string = body?.servicoId;
  const fotoDepois: string = body?.fotoDepoisBase64;
  const mimetype: string = body?.mimetype || "image/jpeg";
  const fotoAntes: string | undefined = body?.fotoAntesBase64;
  const lat = body?.lat != null ? Number(body.lat) : null;
  const lng = body?.lng != null ? Number(body.lng) : null;

  if (!servicoId || !fotoDepois) {
    return NextResponse.json({ ok: false, erro: "foto_depois_obrigatoria" }, { status: 400 });
  }

  // ---------------------------------------------------------------- upload
  // Antes da transação, como a auditoria pede. Se o upload falhar, nada foi
  // gravado e a Nina pode tentar de novo sem efeito colateral nenhum.
  const urlDepois = await subirFotoServico(servicoId, fotoDepois, mimetype, "depois");
  const urlAntes = fotoAntes ? await subirFotoServico(servicoId, fotoAntes, mimetype, "antes") : null;
  if (!urlDepois) {
    return NextResponse.json({ ok: false, erro: "falha_upload_foto" }, { status: 500 });
  }

  // ---------------------------------------------------------------- duração
  // Do "iniciar" até agora. Sem início registrado fica nulo, e o painel mostra
  // "não medido" em vez de inventar um número.
  const { data: antes } = await db
    .from("servicos").select("iniciado_em,tumulo_id").eq("id", servicoId).maybeSingle();
  const inicio = (antes as any)?.iniciado_em ? new Date((antes as any).iniciado_em).getTime() : null;
  const duracao = inicio ? Math.max(1, Math.round((Date.now() - inicio) / 60000)) : null;

  // ------------------------------------------------------- texto da mensagem
  // A composição fica aqui, em TypeScript, porque é texto para uma pessoa ler —
  // não regra de negócio. A transação recebe o texto pronto.
  //
  // Para quem vai: quem recebe as fotos de carinho, não necessariamente quem
  // paga. É o filho que acerta a conta, mas às vezes é a neta que acompanha.
  let texto: string | null = null;
  let destinatario: string | null = null;
  try {
    const tumuloId = (antes as any)?.tumulo_id as string | null;
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
    // Sem texto, a transação usa uma frase padrão e a mensagem ainda entra na
    // fila. A Sureya edita antes de enviar de qualquer forma — nada sai sem ela.
  }

  // ------------------------------------------------------------- a transação
  const { data, error } = await db.rpc("sureya_concluir_lavagem", {
    p_servico: servicoId,
    p_foto_depois: urlDepois,
    p_foto_antes: urlAntes,
    p_duracao_min: duracao,
    p_texto_mensagem: texto,
    p_destinatario: destinatario,
  });

  if (error) {
    // 42501 = insufficient_privilege. A função levanta assim quando a pessoa
    // de campo tenta concluir serviço de outra executora — e o PostgREST
    // devolve 403, que é o que a tela precisa distinguir de "deu erro".
    const negado =
      error.code === "42501" ||
      /servico_de_outra_executora|sem_permissao|sem_org/.test(error.message || "");
    if (!negado) {
      await registrarErro("servico/concluir: transação recusada", error.message, { servicoId });
    }
    return NextResponse.json(
      { ok: false, erro: error.message },
      { status: negado ? 403 : 500 }
    );
  }

  const r = (Array.isArray(data) ? data[0] : data) as any;

  // ------------------------------------------------------- efeitos externos
  // Fora da transação: não podem prendê-la nem desfazer a lavagem se falharem.
  if (lat != null && lng != null && (antes as any)?.tumulo_id) {
    // A leitura da Nina ENTRA NA MÉDIA; a posição oficial vem do cadastro.
    await db.rpc("sureya_registrar_gps", {
      p_tumulo: (antes as any).tumulo_id,
      p_lat: lat, p_lng: lng,
      p_precisao: body?.precisao != null ? Number(body.precisao) : 15,
      p_origem: "conclusao",
    }).then(() => null, () => null);
  }

  const aviso = await notificarFamilia(servicoId, urlDepois);

  return NextResponse.json({
    ok: true,
    jaExecutado: !!r?.ja_estava_executado,
    duracao,
    valor: Number(r?.valor) || 0,
    material: { total: Number(r?.custo_material) || 0, itens: [] },
    remuneracao: r?.remuneracao ?? null,
    notificado: aviso.enviado,
    motivoEnvio: aviso.motivo,
    // O que a transação precisou criar nesta chamada. Numa conclusão normal
    // vem vazio; numa REPARAÇÃO vem dizendo o que estava faltando.
    reparos: (r?.reparos as string[]) || [],
  });
}
