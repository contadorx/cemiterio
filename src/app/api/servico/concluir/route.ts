import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { subirFotoServico, notificarFamilia } from "@/lib/servico";
import { consumirMaterial } from "@/lib/consumo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { servicoId, fotoDepoisBase64, mimetype, fotoAntesBase64?, lat?, lng? }
// A foto do DEPOIS fecha o serviço, DEBITA o razão do cliente (A1) e vai pra família.
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

  const urlDepois = await subirFotoServico(servicoId, fotoDepois, mimetype, "depois");
  const urlAntes = fotoAntes ? await subirFotoServico(servicoId, fotoAntes, mimetype, "antes") : null;
  if (!urlDepois) {
    return NextResponse.json({ ok: false, erro: "falha_upload_foto" }, { status: 500 });
  }

  // tempo gasto: do "iniciar" até agora. Sem início registrado fica nulo,
  // e o painel mostra "não medido" em vez de inventar um número.
  const { data: antes } = await db
    .from("servicos").select("iniciado_em").eq("id", servicoId).maybeSingle();
  const inicio = (antes as any)?.iniciado_em ? new Date((antes as any).iniciado_em).getTime() : null;
  const duracao = inicio ? Math.max(1, Math.round((Date.now() - inicio) / 60000)) : null;

  // marca executado (idempotente: só transiciona se ainda não executado)
  const { data: serv, error } = await db
    .from("servicos")
    .update({
      status: "executado",
      data_executada: new Date().toISOString(),
      duracao_minutos: duracao,
      foto_depois_url: urlDepois,
      foto_antes_url: urlAntes,
      executora_id: auth.userId,
    })
    .eq("id", servicoId)
    .neq("status", "executado")
    .select("org_id,tumulo_id,cliente_id,valor,plano_id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!serv) {
    // já estava executado antes — não duplica débito nem notificação

  return NextResponse.json({ ok: true, jaExecutado: true });
  }

  const orgId = (serv as any).org_id as string;
  const clienteId = (serv as any).cliente_id as string | null;

  // ----- A1: débito no razão (idempotente por servico_id) -----
  if (clienteId) {
    let valor = Number((serv as any).valor) || 0;
    if (!valor && (serv as any).plano_id) {
      const { data: plano } = await db
        .from("planos")
        .select("valor_vigente")
        .eq("id", (serv as any).plano_id)
        .maybeSingle();
      valor = Number((plano as any)?.valor_vigente) || 0;
    }
    if (!valor) {
      const { data: org } = await db
        .from("orgs")
        .select("valor_referencia_limpeza")
        .eq("id", orgId)
        .maybeSingle();
      valor = Number((org as any)?.valor_referencia_limpeza) || 40;
    }

    const { data: jaDebitado } = await db
      .from("movimentos")
      .select("id")
      .eq("servico_id", servicoId)
      .eq("tipo", "debito")
      .maybeSingle();

    if (!jaDebitado) {
      const { error: eDeb } = await db.from("movimentos").insert({
        org_id: orgId,
        cliente_id: clienteId,
        tipo: "debito",
        valor,
        origem: "servico",
        servico_id: servicoId,
        status_conc: "confirmado",
        descricao: "Limpeza executada",
        data: new Date().toISOString().slice(0, 10),
      });
      if (eDeb) console.error("[concluir] débito falhou:", eDeb.message);
    }
  }

  // GPS do túmulo na primeira conclusão
  if (lat != null && lng != null && (serv as any)?.tumulo_id) {
    // a leitura da Nina ENTRA NA MÉDIA; a posição oficial vem do cadastro.
    // Se o jazigo ainda não tem posição, a primeira leitura dela vira o ponto inicial.
    await db.rpc("sureya_registrar_gps", {
      p_tumulo: (serv as any).tumulo_id,
      p_lat: lat, p_lng: lng,
      p_precisao: body?.precisao != null ? Number(body.precisao) : 15,
      p_origem: "conclusao",
    }).then(() => null, () => null);
  }

  const notificado = await notificarFamilia(servicoId, urlDepois);

  // baixa o estoque pelo consumo estimado e guarda o custo desta limpeza
  const material = await consumirMaterial(servicoId).catch(() => ({ total: 0, itens: [] }));

  return NextResponse.json({ ok: true, duracao, material, notificado });
}
