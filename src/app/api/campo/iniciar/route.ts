import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { subirFotoServico } from "@/lib/servico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * COMEÇAR A LAVAGEM — Build 2, lote 2.
 *
 * Esta rota usava `supabaseAdmin()` — a chave de service role, que **ignora RLS
 * por completo**. Nenhuma policy alcançava o que ela fazia. E o que ela fazia
 * era:
 *
 *     const patch = { executora_id: auth.userId };
 *     await adm.from("servicos").update(patch).eq("id", b.servicoId)
 *
 * Sem comparar `executora_id` com quem estava chamando — apenas sobrescrevendo.
 * Era a metade do P0 nº 3 que continuava aberta depois da 0066 e da 0067:
 * bastava chamar esta rota com o UUID de outra pessoa para tomar o serviço
 * dela, junto com a foto do antes, o cronômetro e a remuneração da conclusão.
 *
 * Agora a decisão mora em `sureya_iniciar_lavagem` (migration 0068) e a chamada
 * vai com a SESSÃO da pessoa, não com a chave mestra. Admin começa qualquer
 * serviço; campo só o que é dela — ou um ainda sem dono, que ela reserva ao
 * começar.
 *
 * A função também é idempotente: tocar duas vezes em "começar" não reinicia o
 * cronômetro nem troca a executora.
 */

// POST { servicoId, fotoBase64?, mimetype? }
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({}));
  if (!b?.servicoId) {
    return NextResponse.json({ ok: false, erro: "servico_obrigatorio" }, { status: 400 });
  }

  // O upload fica antes e fora da transação: Storage não participa de
  // transação de banco. Se falhar, nada foi gravado e ela tenta de novo.
  let fotoUrl: string | null = null;
  if (b?.fotoBase64) {
    fotoUrl = await subirFotoServico(b.servicoId, b.fotoBase64, b.mimetype || "image/jpeg", "antes");
  }

  const { data, error } = await db.rpc("sureya_iniciar_lavagem", {
    p_servico: b.servicoId,
    p_foto_antes: fotoUrl,
  });

  if (error) {
    // 42501 = insufficient_privilege: é o serviço de outra pessoa, ou a conta
    // não é de campo nem de admin. A tela precisa distinguir isso de "deu erro".
    const negado =
      error.code === "42501" ||
      /servico_de_outra_executora|sem_permissao|sem_org|servico_nao_encontrado/.test(error.message || "");
    const jaConcluido = /ja_concluido/.test(error.message || "");
    return NextResponse.json(
      { ok: false, erro: error.message },
      { status: jaConcluido ? 400 : negado ? 403 : 500 }
    );
  }

  const r = (Array.isArray(data) ? data[0] : data) as any;

  return NextResponse.json({
    ok: true,
    iniciadoEm: r?.iniciado_em ?? null,
    fotoAntes: r?.foto_antes ?? null,
    // true = já estava começado; a tela não precisa reabrir a câmera.
    jaIniciado: !!r?.ja_iniciado,
    // true = o serviço não tinha dono e passou a ser desta pessoa.
    reservado: !!r?.reservado,
  });
}
