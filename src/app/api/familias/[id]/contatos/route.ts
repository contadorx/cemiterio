import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OS CONTATOS DE UMA FAMÍLIA — e quem, entre eles, acerta a conta.
 *
 * "Tem família que o contato financeiro muda ano após ano." A troca não é um
 * campo: é um FATO com data, e o log (`familia_responsavel_log`, 0091) guarda a
 * história. Um campo sozinho só sabe o presente, e a pergunta que aparece é
 * sempre sobre o passado — "para quem foi a cobrança de março?".
 *
 * A troca em si não acontece aqui: acontece em `sureya_definir_responsavel`,
 * porque três coisas têm de mudar juntas ou nenhuma — o ponteiro da família, o
 * booleano dos contatos (que meio sistema ainda lê) e os jazigos.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const [{ data: fam }, { data: contatos }, { data: hist }, { data: jaz }] = await Promise.all([
    auth.db.from("familias")
      .select("id,nome,responsavel_id,regime,contratado,conferida_em")
      .eq("id", params.id).maybeSingle(),
    auth.db.from("clientes")
      .select("id,nome,telefone,responsavel_financeiro,recebe_fotos,created_at," +
              "parentesco,tratamento,observacoes,consentimento_em")
      .eq("familia_id", params.id).order("created_at"),
    auth.db.from("familia_responsavel_log")
      .select("id,cliente_id,desde,motivo")
      .eq("familia_id", params.id).order("desde", { ascending: false }).limit(20),
    // Os jazigos vão junto porque a conferência cobra três coisas sobre eles
    // (existir, ter quadra e identificação, ter valor) e a pessoa que está
    // corrigindo precisa ver o que falta sem trocar de tela.
    auth.db.from("tumulos")
      .select("id,identificacao,codigo,valor_lavagem,quadra_id,quadras(codigo),ruas(nome)")
      .eq("familia_id", params.id).order("codigo"),
  ]);

  if (!fam) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  const nomePorId = new Map<string, string>(
    ((contatos || []) as any[]).map((c) => [c.id, c.nome]),
  );

  return NextResponse.json({
    ok: true,
    familia: {
      id: (fam as any).id, nome: (fam as any).nome,
      responsavelId: (fam as any).responsavel_id,
      regime: (fam as any).regime || "nao_definido",
      contratado: !!(fam as any).contratado,
      conferidaEm: (fam as any).conferida_em || null,
    },
    contatos: (contatos || []).map((c: any) => ({
      id: c.id, nome: c.nome, telefone: c.telefone,
      paga: !!c.responsavel_financeiro, recebeFotos: !!c.recebe_fotos,
      parentesco: c.parentesco || null,
      tratamento: c.tratamento || null,
      observacoes: c.observacoes || null,
      // A conferência pergunta por isto, e é aqui que se conserta.
      consentimentoEm: c.consentimento_em || null,
    })),
    jazigos: ((jaz as any[]) || []).map((t: any) => ({
      id: t.id, identificacao: t.identificacao, codigo: t.codigo || null,
      quadra: t.quadras?.codigo || null, rua: t.ruas?.nome || null,
      valor: t.valor_lavagem ?? null,
      completo: !!t.quadra_id && !!String(t.identificacao || "").trim(),
    })),
    // `cliente_id` nulo numa linha do histórico quer dizer "a família ficou SEM
    // contato". É um estado legítimo e a tela precisa mostrá-lo por extenso, e
    // não como um espaço em branco.
    historico: (hist || []).map((h: any) => ({
      id: h.id,
      quem: h.cliente_id ? (nomePorId.get(h.cliente_id) || "contato removido") : null,
      desde: h.desde,
      motivo: h.motivo || null,
    })),
  });
}

// POST { acao: "novo", nome, telefone } | { acao: "quem_paga", clienteId|null, motivo? }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const acao = String(b?.acao || "");

  if (acao === "novo") {
    const nome = String(b?.nome || "").trim().slice(0, 120);
    const tel = normalizarTelefone(String(b?.telefone || ""));
    if (!nome || !tel) {
      return NextResponse.json(
        { ok: false, erro: "faltou", mensagem: "O contato precisa de nome e telefone." },
        { status: 400 },
      );
    }
    const { error } = await auth.db.from("clientes").insert({
      org_id: org, nome, telefone: tel, familia_id: params.id,
    });
    if (error) {
      return NextResponse.json({
        ok: false,
        erro: error.message,
        mensagem: /duplicate|unique/i.test(error.message)
          ? "Esse telefone já está em outra ficha. Abra a ficha de lá e mova o contato para esta família."
          : error.message,
      }, { status: 400 });
    }
    // Se a família estava sem ninguém, o gatilho `trg_primeiro_contato_assume`
    // já fez esta pessoa assumir a conta — não é preciso pedir aqui.
    return NextResponse.json({ ok: true });
  }

  if (acao === "quem_paga") {
    // `null` é escolha VÁLIDA: "esta família volta a não ter com quem falar".
    // Por isso o teste é `=== null`, e não um `|| ""` que transformaria a
    // escolha deliberada num campo vazio por engano.
    const clienteId = b?.clienteId === null || b?.clienteId === ""
      ? null
      : String(b.clienteId);
    const motivo = String(b?.motivo || "").trim().slice(0, 300) || null;

    const { error } = await auth.db.rpc("sureya_definir_responsavel", {
      p_familia: params.id, p_cliente: clienteId, p_motivo: motivo,
    });
    if (error) {
      const naoEDaFamilia = /contato_nao_e_desta_familia/.test(error.message);
      return NextResponse.json({
        ok: false,
        erro: error.message,
        mensagem: naoEDaFamilia
          ? "Esse contato não é desta família."
          : "Não consegui trocar quem paga: " + error.message,
      }, { status: naoEDaFamilia ? 400 : 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}

/**
 * EDITAR UMA PESSOA — PATCH { contatoId, nome?, telefone?, parentesco?, tratamento?,
 *                             observacoes?, consentimento? }
 *
 * Só os campos de IDENTIDADE da pessoa. Quem responde pelo dinheiro NÃO se
 * troca por aqui: isso é `sureya_definir_responsavel`, porque três coisas têm
 * de mudar juntas (o ponteiro da família, o booleano dos contatos e os jazigos)
 * ou nenhuma.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const contatoId = String(b?.contatoId || "").trim();
  if (!contatoId) {
    return NextResponse.json({ ok: false, erro: "sem_contato" }, { status: 400 });
  }

  // A pessoa tem de ser DESTA família. Sem esta conferência, um id de outra
  // família passaria pela RLS (a organização é a mesma) e seria editado daqui.
  const { data: atual } = await auth.db
    .from("clientes").select("id,nome,familia_id,telefone")
    .eq("id", contatoId).maybeSingle();
  if (!atual || (atual as any).familia_id !== params.id) {
    return NextResponse.json(
      { ok: false, erro: "nao_e_desta_familia",
        mensagem: "Esta pessoa não está nesta família." },
      { status: 404 },
    );
  }

  const campos: Record<string, any> = {};
  if (typeof b?.nome === "string" && b.nome.trim()) campos.nome = b.nome.trim();
  if (typeof b?.parentesco === "string") campos.parentesco = b.parentesco.trim() || null;
  if (typeof b?.tratamento === "string") campos.tratamento = b.tratamento.trim() || null;
  if (typeof b?.observacoes === "string") campos.observacoes = b.observacoes.trim() || null;

  // O CONSENTIMENTO é uma data, não um texto: marcar registra AGORA, desmarcar
  // apaga. É o que a conferência cobra, e é onde se conserta.
  if (b?.consentimento === true) campos.consentimento_em = new Date().toISOString();
  if (b?.consentimento === false) campos.consentimento_em = null;

  if (typeof b?.telefone === "string") {
    const t = b.telefone.trim();
    if (!t) {
      return NextResponse.json(
        { ok: false, erro: "telefone_vazio",
          mensagem: "O telefone não pode ficar em branco. Se a pessoa não tem telefone, remova-a da família." },
        { status: 400 },
      );
    }
    const norm = normalizarTelefone(t);
    if (!norm) {
      return NextResponse.json(
        { ok: false, erro: "telefone_invalido",
          mensagem: "Telefone inválido. Use DDD + número, como 11 94013-1413." },
        { status: 400 },
      );
    }
    campos.telefone = norm;
  }

  // QUEM ACERTA A CONTA — e podem ser VÁRIOS.
  //
  // A família pode ter mais de uma pessoa que paga: o casal que divide, a filha
  // que assume quando o pai viaja.
  //
  // O que impedia vários NÃO era a tela — era o banco. Havia um índice ÚNICO
  // parcial `(familia_id) where responsavel_financeiro`, e o segundo clique
  // voltava como violação de chave, um erro que não fala do que a Sureya
  // tentou fazer. A 0102 derrubou o teto e manteve o PISO: uma família com
  // gente nunca fica sem ninguém que acerte a conta.
  //
  // `familias.responsavel_id` continua sendo UM: é o TITULAR, o que aparece no
  // cabeçalho, o que recebe a cobrança e o que tem histórico com data (0091).
  // São duas perguntas diferentes: "quem responde" e "quem pode pagar".
  if (typeof b?.acertaConta === "boolean") {
    campos.responsavel_financeiro = b.acertaConta;
  }

  if (!Object.keys(campos).length) {
    return NextResponse.json(
      { ok: false, erro: "nada_para_mudar",
        mensagem: "Nada mudou — não havia o que salvar." },
      { status: 400 });
  }

  const { error } = await auth.db.from("clientes").update(campos).eq("id", contatoId);

  // SEM TITULAR, O PRIMEIRO MARCADO ASSUME.
  //
  // Marcar alguém como "acerta a conta" numa família que não tem titular e
  // deixá-la sem titular seria dar a ela uma pessoa que paga e ninguém para
  // quem cobrar — o pior dos dois mundos. A troca passa por
  // `sureya_definir_responsavel` (0091), que mexe no ponteiro, no espelho e
  // nos jazigos de uma vez.
  if (!error && campos.responsavel_financeiro === true) {
    const { data: fam } = await auth.db
      .from("familias").select("responsavel_id").eq("id", params.id).maybeSingle();
    if (!(fam as any)?.responsavel_id) {
      await auth.db.rpc("sureya_definir_responsavel", {
        p_familia: params.id, p_cliente: contatoId,
        p_motivo: "primeiro contato financeiro marcado na ficha",
      }).then(() => {}, () => {});
    }
  }
  if (error) {
    // Telefone é único por organização: duas pessoas com o mesmo número
    // fariam a resposta do WhatsApp cair na ficha errada.
    if (String(error.message).includes("duplicate") || String(error.code) === "23505") {
      return NextResponse.json(
        { ok: false, erro: "telefone_repetido",
          mensagem: "Já existe outra pessoa com este telefone. Duas fichas com o mesmo número fazem a resposta cair na errada." },
        { status: 409 },
      );
    }
    // O PISO DA 0102: tirar a marca do ÚLTIMO que acerta a conta.
    //
    // Quem recusa é o gatilho `trg_guarda_quem_acerta_a_conta`, e não a tela:
    // a regra vale para qualquer caminho que escreva na tabela. Aqui ela só
    // vira uma frase que diz o que fazer — o código cru não ajuda ninguém.
    if (String(error.message).includes("familia_ficaria_sem_quem_acerta_a_conta")) {
      return NextResponse.json(
        { ok: false, erro: "familia_ficaria_sem_quem_acerta_a_conta",
          mensagem: "Esta é a única pessoa que acerta a conta da família. Marque outra antes de tirar esta — sem ninguém marcado, a cobrança não sabe com quem falar." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * TIRAR UMA PESSOA DA FAMÍLIA — DELETE ?contatoId=...
 *
 * ⚠ O QUE ISTO NÃO FAZ, e por quê
 *
 * NÃO chama `DELETE /api/clientes/[id]`. Aquela rota apaga a pessoa E os
 * jazigos dela (`tumulos.delete().eq("cliente_id", …)`). Isso nasceu quando
 * o jazigo pertencia a uma PESSOA; desde a 0091 ele pertence à FAMÍLIA, e
 * `tumulos.cliente_id` é só o contato derivado. Medido em 23/08: 245 túmulos
 * com `cliente_id` preenchido — apagar o responsável levaria os jazigos da
 * família junto, calado.
 *
 * Aqui a pessoa sai da família e o resto fica onde está.
 *
 * O RESPONSÁVEL NÃO SAI ASSIM. Enquanto ele for o responsável, tirá-lo
 * deixaria a família sem quem responde pelo dinheiro sem ninguém decidir isso
 * — e "família sem contato" é estado legítimo (0091), mas tem de ser uma
 * escolha, não um efeito colateral.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const contatoId = (req.nextUrl.searchParams.get("contatoId") || "").trim();
  if (!contatoId) {
    return NextResponse.json({ ok: false, erro: "sem_contato" }, { status: 400 });
  }

  const { data: fam } = await auth.db
    .from("familias").select("id,responsavel_id").eq("id", params.id).maybeSingle();
  const { data: pessoa } = await auth.db
    .from("clientes").select("id,nome,familia_id").eq("id", contatoId).maybeSingle();

  if (!pessoa || (pessoa as any).familia_id !== params.id) {
    return NextResponse.json(
      { ok: false, erro: "nao_e_desta_familia" }, { status: 404 });
  }

  if ((fam as any)?.responsavel_id === contatoId) {
    return NextResponse.json(
      { ok: false, erro: "e_o_responsavel",
        mensagem: `${(pessoa as any).nome} responde pelo dinheiro desta família. ` +
                  `Passe a responsabilidade para outra pessoa (ou deixe a família sem responsável) antes de removê-la.` },
      { status: 409 },
    );
  }

  // HISTÓRICO FINANCEIRO NÃO SE APAGA. A conta é da família (0073/0091), mas
  // um lançamento pode apontar para a pessoa — e apagá-la deixaria o extrato
  // com um débito de ninguém.
  const { count } = await auth.db
    .from("conta_corrente").select("id", { count: "exact", head: true })
    .eq("cliente_id", contatoId);
  const { count: cMov } = await auth.db
    .from("movimentos").select("id", { count: "exact", head: true })
    .eq("cliente_id", contatoId);

  if ((count || 0) + (cMov || 0) > 0) {
    // Solta da família em vez de apagar: o extrato continua inteiro e a pessoa
    // some da ficha, que é o que se queria.
    const { error } = await auth.db
      .from("clientes").update({ familia_id: null, responsavel_financeiro: false })
      .eq("id", contatoId);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true, soltou: true,
      mensagem: `${(pessoa as any).nome} saiu da família. Como há lançamentos no nome dela, ` +
                `a ficha foi mantida para o extrato continuar inteiro.`,
    });
  }

  const { error } = await auth.db.from("clientes").delete().eq("id", contatoId);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true, apagou: true,
    mensagem: `${(pessoa as any).nome} foi removida da família.`,
  });
}
