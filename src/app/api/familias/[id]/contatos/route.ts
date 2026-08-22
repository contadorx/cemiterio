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

  const [{ data: fam }, { data: contatos }, { data: hist }] = await Promise.all([
    auth.db.from("familias").select("id,nome,responsavel_id").eq("id", params.id).maybeSingle(),
    auth.db.from("clientes")
      .select("id,nome,telefone,responsavel_financeiro,recebe_fotos,created_at")
      .eq("familia_id", params.id).order("created_at"),
    auth.db.from("familia_responsavel_log")
      .select("id,cliente_id,desde,motivo")
      .eq("familia_id", params.id).order("desde", { ascending: false }).limit(20),
  ]);

  if (!fam) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  const nomePorId = new Map<string, string>(
    ((contatos || []) as any[]).map((c) => [c.id, c.nome]),
  );

  return NextResponse.json({
    ok: true,
    familia: { id: (fam as any).id, nome: (fam as any).nome, responsavelId: (fam as any).responsavel_id },
    contatos: (contatos || []).map((c: any) => ({
      id: c.id, nome: c.nome, telefone: c.telefone,
      paga: !!c.responsavel_financeiro, recebeFotos: !!c.recebe_fotos,
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
