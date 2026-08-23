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
    .select("id,nome,apelido,foto_url,telefone,familia_id,responsavel_financeiro,parentesco,recebe_fotos,modo,score,ativo_ia,instrucoes_ia,perfil_ia,observacoes,consentimento_em,codigo_indicacao,tratamento,regua_cobranca,dias_entre_cobrancas,max_lembretes,orientacao_cobranca,cobranca_nivel,ativacao_ativa,ativacao_meses,ultima_ativacao_em,cobranca_antecipada,envio_automatico")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  // O EXTRATO E DA FAMILIA (DECISOES.md D-01).
  //
  // Antes esta ficha listava `movimentos` da PESSOA. O resultado pratico: a
  // ficha da Anninha mostrava extrato vazio e saldo zero enquanto a familia
  // dela devia R$ 240,00 — o lancamento estava no razao novo, que a ficha nao
  // lia. Agora as duas pessoas da mesma familia veem o MESMO extrato, que e o
  // que a operacao ja dizia em voz alta ("a familia esta devendo").
  const familiaId = (cliente as any).familia_id as string | null;

  const [{ data: tumulos }, { data: planos }, { data: mov }, { data: msgs }] = await Promise.all([
    db.from("tumulos").select("id,identificacao,numero,falecido_nome,qr_token,rua,rua_id,codigo,ordem_na_rua,periodicidade,contratado,quadra_id,lat,lng,gps_precisao,gps_amostras,foto_referencia_url,familia_id,ruas(nome),quadras(codigo)").eq("cliente_id", id),
    db.from("planos").select("id,tumulo_id,cadencia,qtd_por_passagem,lavagens_por_ciclo,valor_vigente,valor_mensal,data_valor_vigente,ativo,pago_ate,proxima_cobranca,proximo_servico,migrado_em,momento_cobranca").eq("cliente_id", id),
    db.from("conta_corrente").select("id,tipo,valor,status_conc,data,descricao,origem")
      .eq("familia_id", familiaId || "00000000-0000-0000-0000-000000000000")
      .order("data", { ascending: false }),
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
    saldo: Math.round(saldo * 100) / 100,
    aConferir: Math.round(aConferir * 100) / 100,
    extrato: mov || [],
    // Pessoa sem familia: extrato vazio por AUSENCIA DE DADO, nao por estar em
    // dia. Quem desenha a tela precisa poder dizer isso em vez de mostrar
    // "R$ 0,00 · em dia" sobre alguem de quem nao se sabe nada.
    semFamilia: !familiaId,
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
    "apelido", "envio_automatico",
  ] as const;
  const patch: Record<string, any> = {};
  for (const campo of ["nome", "telefone", "modo", "ativo_ia", "instrucoes_ia", "observacoes", ...camposRegua]) {
    if (body[campo] !== undefined) patch[campo] = body[campo];
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }

  // guarda o que mudou em nome e telefone — são os campos que se perdem de vista
  if (patch.nome !== undefined || patch.telefone !== undefined) {
    const { data: antes } = await db
      .from("clientes").select("org_id,nome,telefone").eq("id", params.id).maybeSingle();
    if (antes) {
      const mudancas: any[] = [];
      for (const campo of ["nome", "telefone"] as const) {
        if (patch[campo] !== undefined && patch[campo] !== (antes as any)[campo]) {
          mudancas.push({
            org_id: (antes as any).org_id, cliente_id: params.id, campo,
            de: (antes as any)[campo], para: patch[campo], user_id: auth.userId,
          });
        }
      }
      if (mudancas.length) await db.from("historico_cliente").insert(mudancas);
    }
  }

  const { error } = await db.from("clientes").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}


// DELETE — remove o cliente e tudo que depende dele.
// Só permite se NÃO houver movimento financeiro; nesse caso, oriente a anonimizar
// (LGPD), que preserva o histórico contábil.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  // A TRAVA TEM DE OLHAR OS DOIS RAZOES.
  //
  // Ela contava so `movimentos`. Depois da decisao de 22/08, uma familia pode
  // ter a divida inteira em `conta_corrente` e nenhuma linha em `movimentos` —
  // e foi o caso da Anninha, com R$ 240,00. Essa familia passava pela trava e
  // era excluida, levando o historico junto. Enquanto os dois razoes existirem,
  // qualquer linha em qualquer um deles impede a exclusao.
  const { data: cli } = await db
    .from("clientes").select("familia_id").eq("id", params.id).maybeSingle();
  const fid = (cli as any)?.familia_id as string | null;

  const [{ count }, { count: countCc }] = await Promise.all([
    db.from("movimentos").select("id", { count: "exact", head: true }).eq("cliente_id", params.id),
    fid
      ? db.from("conta_corrente").select("id", { count: "exact", head: true }).eq("familia_id", fid)
      : Promise.resolve({ count: 0 } as any),
  ]);
  if ((count || 0) + (countCc || 0) > 0) {
    return NextResponse.json(
      { ok: false, erro: "tem_movimento_financeiro",
        mensagem: "Esta família já tem lançamentos no financeiro. Excluir apagaria o histórico. Use 'Remover dados' (LGPD), que preserva a contabilidade." },
      { status: 400 }
    );
  }

  await db.from("mensagens").delete().eq("cliente_id", params.id);
  await db.from("interacoes_ia").delete().eq("cliente_id", params.id);
  await db.from("conversas").delete().eq("cliente_id", params.id);
  await db.from("servicos").delete().eq("cliente_id", params.id);
  await db.from("planos").delete().eq("cliente_id", params.id);

  // ⚠ O JAZIGO NÃO É DA PESSOA — E APAGÁ-LO AQUI ERA UMA BOMBA
  //
  // Havia um `tumulos.delete().eq("cliente_id", params.id)` nesta lista. Ele
  // nasceu quando o jazigo pertencia a uma PESSOA. Desde a 0091 o jazigo
  // pertence à FAMÍLIA, e `tumulos.cliente_id` é só o contato derivado dela.
  //
  // Medido em produção em 23/08: 245 túmulos com `cliente_id` preenchido.
  // Excluir o responsável apagaria os jazigos da família junto — o cadastro
  // do campo, o GPS, a foto da lápide, a ordem na rua —, sem erro e sem aviso.
  // Hoje cada família tem uma pessoa só, então isso nunca aconteceu; bastava
  // cadastrar o segundo contato para virar perda de dado real.
  //
  // Agora o jazigo é SOLTO da pessoa e continua com a família. Se a família
  // inteira estiver sendo removida, quem cuida disso é a rota da família.
  await db.from("tumulos").update({ cliente_id: null }).eq("cliente_id", params.id);

  const { error } = await db.from("clientes").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
