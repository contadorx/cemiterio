import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const id = params.id;

  const { data: cliente } = await db
    .from("clientes")
    .select("id,nome,telefone,modo,score,ativo_ia,instrucoes_ia,perfil_ia,observacoes,consentimento_em,codigo_indicacao,tratamento,regua_cobranca,dias_entre_cobrancas,max_lembretes,orientacao_cobranca,cobranca_nivel,ativacao_ativa,ativacao_meses,ultima_ativacao_em,cobranca_antecipada")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  const [{ data: tumulos }, { data: planos }, { data: mov }, { data: msgs }] = await Promise.all([
    db.from("tumulos").select("id,identificacao,falecido_nome,datas_gatilho,qr_token,rua,quadra_id,lat,lng,gps_precisao,gps_amostras,foto_referencia_url,foto_enquadramento_url,quadras(codigo)").eq("cliente_id", id),
    db.from("planos").select("id,tumulo_id,cadencia,qtd_por_passagem,valor_vigente,valor_mensal,data_valor_vigente,ativo,pago_ate,proxima_cobranca,proximo_servico,migrado_em").eq("cliente_id", id),
    db.from("movimentos").select("id,tipo,valor,status_conc,data,descricao").eq("cliente_id", id).order("data", { ascending: false }),
    db.from("mensagens").select("autor,texto,created_at").eq("cliente_id", id).order("created_at", { ascending: false }).limit(15),
  ]);

  let saldo = 0;
  let aConferir = 0;
  const pagamentos: any[] = [];
  for (const m of mov || []) {
    const st = (m as any).status_conc;
    const v = Number((m as any).valor) || 0;
    if (st === "rejeitado") continue;
    if (st === "a_conferir") { if ((m as any).tipo === "credito") aConferir += v; continue; }
    saldo += (m as any).tipo === "credito" ? v : -v;
    if ((m as any).tipo === "credito") pagamentos.push({ id: (m as any).id, valor: v, data: (m as any).data });
  }

  return NextResponse.json({
    ok: true,
    cliente,
    tumulos: tumulos || [],
    planos: planos || [],
    saldo,
    aConferir,
    pagamentos,
    mensagens: (msgs || []).reverse(),
  });
}

// PATCH { nome?, telefone?, modo?, ativo_ia?, instrucoes_ia?, observacoes? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const camposRegua = [
    "tratamento", "regua_cobranca", "dias_entre_cobrancas", "max_lembretes",
    "orientacao_cobranca", "ativacao_ativa", "ativacao_meses", "cobranca_antecipada",
  ] as const;
  const patch: Record<string, any> = {};
  for (const campo of ["nome", "telefone", "modo", "ativo_ia", "instrucoes_ia", "observacoes", ...camposRegua]) {
    if (body[campo] !== undefined) patch[campo] = body[campo];
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }

  const { error } = await db.from("clientes").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
