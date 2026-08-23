import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const id = params.id;

  const CAMPOS_PESSOA =
    "id,nome,apelido,foto_url,telefone,familia_id,responsavel_financeiro,parentesco," +
    "recebe_fotos,modo,score,ativo_ia,instrucoes_ia,perfil_ia,observacoes,consentimento_em," +
    "codigo_indicacao,tratamento,regua_cobranca,dias_entre_cobrancas,max_lembretes," +
    "orientacao_cobranca,cobranca_nivel,ativacao_ativa,ativacao_meses,ultima_ativacao_em," +
    "cobranca_antecipada,envio_automatico";

  // ==========================================================================
  // O `id` PODE SER DE UMA FAMÍLIA OU DE UMA PESSOA.
  //
  // Esta ficha nasceu quando família era o apelido de um contato: o endereço
  // era o da PESSOA e tudo pendurava nela. Desde a 0091 a família é a
  // entidade, e chegou a hora de o endereço poder ser o dela — a conferência
  // é por família, e mandar quem confere procurar "qual pessoa abre esta
  // família" é justamente a confusão que se está tentando desfazer.
  //
  // Tenta cliente primeiro (é o caminho antigo, e o que mais chega em links
  // guardados). Não achando, tenta família — e aí a ficha abre pelo
  // responsável, ou sem pessoa nenhuma, que é estado legítimo desde a 0091.
  // ==========================================================================
  let { data: cliente } = await db
    .from("clientes").select(CAMPOS_PESSOA).eq("id", id).maybeSingle();

  let familiaId: string | null = (cliente as any)?.familia_id ?? null;

  if (!cliente) {
    const { data: fam } = await db
      .from("familias").select("id,responsavel_id").eq("id", id).maybeSingle();
    if (!fam) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });
    familiaId = (fam as any).id;
    if ((fam as any).responsavel_id) {
      const { data: resp } = await db
        .from("clientes").select(CAMPOS_PESSOA).eq("id", (fam as any).responsavel_id).maybeSingle();
      cliente = resp as any;
    }
  }

  // ==========================================================================
  // TUDO QUE É DA FAMÍLIA VEM PELA FAMÍLIA.
  //
  // ⚠ O DEFEITO QUE ESTAVA AQUI
  //
  // O extrato já era por família (D-01). Mas os JAZIGOS e os PLANOS continuavam
  // vindo por `cliente_id` — a ficha mostrava o dinheiro da família e as pedras
  // da pessoa. Desde a 0091 `tumulos.cliente_id` é o contato DERIVADO da
  // família: um jazigo de família sem responsável tem esse campo nulo, e não
  // aparecia em ficha nenhuma. Eram 6 jazigos assim em 23/08.
  //
  // E o efeito pior era mudo: trocar quem responde pela família fazia os
  // jazigos "mudarem de dono" na tela, porque o campo derivado é reescrito
  // junto. A ficha dizia coisas diferentes antes e depois de uma troca que não
  // mexeu em jazigo nenhum.
  //
  // O grão de tudo aqui é a FAMÍLIA. `cliente_id` sobrou para as mensagens,
  // que são de uma pessoa mesmo — quem escreveu foi ela.
  // ==========================================================================
  const chaveFam = familiaId || "00000000-0000-0000-0000-000000000000";

  const [{ data: tumulos }, { data: mov }, { data: msgs },
         { data: familia }, { data: pessoas }, { data: checklist }] = await Promise.all([
    db.from("tumulos").select("id,identificacao,numero,falecido_nome,qr_token,rua,rua_id,codigo,ordem_na_rua,periodicidade,contratado,quadra_id,valor_lavagem,valor_mensal,valor_base,inicio_cobranca,proxima_cobranca,inicio_agendamento,meses_entre_cobrancas,lat,lng,gps_precisao,gps_amostras,foto_referencia_url,familia_id,cliente_id,ruas(nome),quadras(codigo)").eq("familia_id", chaveFam),
    db.from("conta_corrente").select("id,tipo,valor,status_conc,data,descricao,origem,competencia,canal,conferido_em,servico_id")
      .eq("familia_id", chaveFam)
      .order("data", { ascending: false }),
    db.from("mensagens").select("autor,texto,created_at").eq("cliente_id", id).order("created_at", { ascending: false }).limit(15),
    db.from("familias").select("id,nome,responsavel_id,regime,contratado,conferida_em,enviar_fotos,silenciar,"
                             + "freq_pagamento,modo_cobranca,lembretes_memoria,lembretes_pausados_ate")
      .eq("id", chaveFam).maybeSingle(),
    // TODAS AS PESSOAS DA FAMÍLIA, e não só a que abriu a ficha. Era isso que
    // fazia a tela "confundir a família com o contato": ela mostrava uma
    // pessoa e chamava aquilo de família.
    db.from("clientes").select("id,nome,telefone,responsavel_financeiro,parentesco,tratamento,consentimento_em")
      .eq("familia_id", chaveFam).order("created_at"),
    familiaId
      ? db.rpc("sureya_conferencia_cadastro", { p_familia: familiaId })
      : Promise.resolve({ data: [] } as any),
  ]);

  // OS PLANOS VÊM PELOS DOIS CAMINHOS, e a razão é chata: o plano pendura no
  // CLIENTE (herança de quando a família era o apelido de um contato) e aponta
  // para um jazigo — mas nada obriga `tumulo_id` a estar preenchido.
  //
  // Buscar só pelo jazigo faria um plano sem jazigo sumir da ficha, calado.
  // Buscar só pelo cliente perderia o plano de uma família cujo responsável
  // mudou. Os dois, e depois tira a repetição.
  const idsPessoas = ((pessoas as any[]) || []).map((c) => c.id);
  const idsJazigos = ((tumulos as any[]) || []).map((t) => t.id);
  const SEL_PLANO =
    "id,tumulo_id,cliente_id,cadencia,qtd_por_passagem,lavagens_por_ciclo," +
    "valor_vigente,valor_mensal,data_valor_vigente,ativo,pago_ate," +
    "proxima_cobranca,proximo_servico,migrado_em,momento_cobranca";

  const [{ data: pA }, { data: pB }] = await Promise.all([
    idsPessoas.length
      ? db.from("planos").select(SEL_PLANO).in("cliente_id", idsPessoas)
      : Promise.resolve({ data: [] } as any),
    idsJazigos.length
      ? db.from("planos").select(SEL_PLANO).in("tumulo_id", idsJazigos)
      : Promise.resolve({ data: [] } as any),
  ]);
  const porId = new Map<string, any>();
  for (const p of [...((pA as any[]) || []), ...((pB as any[]) || [])]) porId.set(p.id, p);
  const planos = [...porId.values()];

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
    // A FAMÍLIA é o assunto desta ficha. `cliente` continua existindo porque
    // meia tela ainda fala com uma pessoa (WhatsApp, régua de cobrança,
    // instruções da IA) — mas o título, os jazigos e o dinheiro são dela.
    familia: familia || null,
    pessoas: pessoas || [],
    // O checklist da conferência vem junto para o botão "conferido" poder
    // existir AQUI, que é onde se corrige. Ir até a conferência para dar um ok
    // no que se acabou de arrumar é uma viagem que ninguém faz.
    conferencia: (checklist as any[]) || [],
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
