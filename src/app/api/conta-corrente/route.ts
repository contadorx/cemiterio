import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinar } from "@/lib/storage";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { diaOperacao } from "@/lib/vencimento";
import { calcularSaldo } from "@/lib/saldo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A CONTA CORRENTE DA FAMÍLIA.
 *
 * Lavagem lança débito. Pagamento lança crédito. O saldo diz se está em dia.
 *
 * Isto substitui o par "saldo calculado + lista de pagamentos recebidos", que
 * mostrava o que entrou mas não o que era devido — e por isso não respondia a
 * pergunta que a Sureya faz ao telefone: *esta lavagem de março já foi
 * cobrada?* Com o extrato, a resposta está na tela.
 *
 * Saldo positivo = a família deve. Negativo = crédito a favor dela.
 */

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const familiaId = req.nextUrl.searchParams.get("familiaId");
  if (!familiaId) {
    return NextResponse.json({ ok: false, erro: "familia_obrigatoria" }, { status: 400 });
  }

  const { data, error } = await db
    .from("conta_corrente")
    .select("id,tipo,origem,competencia,valor,descricao,data,comprovante_id," +
            "comprovantes(imagem_url),tumulos(codigo,ruas(nome),quadras(codigo))")
    .eq("familia_id", familiaId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // O LINK QUE ABRE, NO LUGAR DO ENDEREÇO CRU (0139). Assinado em lote antes
  // do `map`, porque `map` não espera promessa — um `await` lá dentro devolveria
  // Promise para a tela e o extrato mostraria [object Promise] no lugar do link.
  const adm = supabaseAdmin();
  const linksComp = new Map<string, string | null>();
  await Promise.all((data || []).map(async (l: any) => {
    if (l.comprovantes?.imagem_url) {
      linksComp.set(l.id, await assinar(adm, l.comprovantes.imagem_url));
    }
  }));

  const linhas = (data || []).map((l: any) => ({
    id: l.id,
    tipo: l.tipo,
    origem: l.origem,
    competencia: l.competencia,
    valor: Number(l.valor),
    descricao: l.descricao,
    data: l.data,
    temComprovante: !!l.comprovante_id,
    // A URL vai junto: sem ela a Sureya veria "tem comprovante" e não teria
    // como abrir — pior que não mostrar nada.
    comprovanteUrl: linksComp.get(l.id) ?? null,
    local: l.tumulos
      ? [l.tumulos.quadras?.codigo, l.tumulos.ruas?.nome].filter(Boolean).join(" · ")
      : null,
    codigo: l.tumulos?.codigo ?? null,
  }));

  // A CONTA MORA EM `lib/saldo.ts`, e nao aqui.
  //
  // A conferencia mostra o mesmo saldo, e recalcular la seria a segunda conta
  // sobre os mesmos fatos. Uma funcao, dois chamadores.
  const hoje = diaOperacao();
  const conta = calcularSaldo(linhas as any, hoje);

  return NextResponse.json({
    ok: true,
    saldo: conta.saldo,
    vencido: conta.vencido,
    aVencer: conta.aVencer,
    frase: conta.frase,
    emDia: conta.emDia,
    linhas: linhas.map((l) => ({ ...l, aVencer: l.tipo === "debito" && l.data > hoje })),
  });
}

/**
 * Lança na conta. Dois casos, ambos manuais:
 *   · pagamento — o crédito quando o Pix cai
 *   · avulso    — a limpeza fora do plano, o arranjo de flores, o bronze
 *
 * O débito por competência NÃO passa por aqui: ele nasce do fechamento do
 * ciclo (ver /api/financeiro/competencia), não de um clique.
 */
/**
 * O ERRO DO BANCO EM PORTUGUÊS DE GENTE.
 *
 * `sureya_registrar_pagamento` levanta exceção com o nome da função na frente —
 * bom para o log, ilegível na tela de quem está lançando um Pix.
 */
function mensagemDoErro(bruto: string): string {
  const t = String(bruto || "");
  if (t.includes("passam do valor recebido")) {
    return "Juros, multa e outros somam mais do que o valor recebido. "
         + "Confira: essas partes saem de dentro do que entrou, não se somam a ele.";
  }
  if (t.includes("informe o valor recebido")) {
    return "Informe o valor recebido — ou um desconto, se você perdoou sem receber nada.";
  }
  if (t.includes("nenhuma parte pode ser negativa")) {
    return "Nenhum dos valores pode ser negativo.";
  }
  if (t.includes("familia_nao_encontrada")) return "Família não encontrada.";
  if (t.includes("somente_admin")) return "Só quem administra pode lançar pagamento.";
  return "Não consegui lançar.";
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const familiaId = String(b?.familiaId || "");
  const acao = String(b?.acao || "");
  const valor = Number(String(b?.valor ?? "").replace(",", "."));

  if (!familiaId) {
    return NextResponse.json({ ok: false, erro: "familia_obrigatoria" }, { status: 400 });
  }
  if (!["pagamento", "avulso", "abertura"].includes(acao)) {
    return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
  }

  // Na ABERTURA o sinal importa e o zero é legítimo:
  //   positivo -> a família já deve esse valor
  //   negativo -> a família tem crédito (pagou adiantado)
  // Nos outros casos, valor tem de ser maior que zero.
  if (acao === "abertura") {
    if (!isFinite(valor)) {
      return NextResponse.json(
        { ok: false, erro: "valor_invalido", mensagem: "Informe o valor da situação atual." },
        { status: 400 }
      );
    }
  } else if (!isFinite(valor) || valor <= 0) {
    return NextResponse.json(
      { ok: false, erro: "valor_invalido", mensagem: "Informe um valor maior que zero." },
      { status: 400 }
    );
  }

  // A família tem de existir e ser visível sob RLS: sem isto, um id de outra
  // org lançaria dinheiro na conta errada.
  const { data: fam } = await db
    .from("familias").select("id").eq("id", familiaId).maybeSingle();
  if (!fam) {
    return NextResponse.json({ ok: false, erro: "familia_nao_encontrada" }, { status: 404 });
  }

  // O PAGAMENTO TEM PARTES (0123), e por isso sai por outra porta.
  //
  // Desconto, juros, multa e outros viram LINHAS SEPARADAS no razão — cada uma
  // com seu lado e sua origem, para o relatório saber distinguir "recebi 65" de
  // "recebi 60 e cobrei 5 de juros". Cinco escritas soltas aqui poderiam falhar
  // no meio e deixar a família com um crédito que nunca existiu; a função faz
  // as cinco na mesma transação, ou nenhuma.
  if (acao === "pagamento") {
    const parte = (x: any) => {
      const n = Number(String(x ?? "0").replace(",", "."));
      return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
    };
    const { data, error } = await db.rpc("sureya_registrar_pagamento", {
      p_familia:     familiaId,
      p_recebido:    Math.abs(Math.round(valor * 100) / 100),
      p_desconto:    parte(b?.desconto),
      p_juros:       parte(b?.juros),
      p_multa:       parte(b?.multa),
      p_outros:      parte(b?.outros),
      p_data:        b?.data || diaOperacao(),
      p_descricao:   String(b?.descricao || "").trim() || null,
      p_comprovante: b?.comprovanteId || null,
      p_tumulo:      b?.tumuloId || null,
    });
    if (error) {
      return NextResponse.json(
        { ok: false, erro: error.message, mensagem: mensagemDoErro(error.message) },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, ...(data as any) });
  }

  // Daqui para baixo só passam ABERTURA e AVULSO: o pagamento saiu acima, pela
  // função que escreve as partes de uma vez.
  const ehAbertura = acao === "abertura";

  // Na abertura, o sinal do número decide o lado do lançamento. O valor
  // gravado é sempre positivo — quem diz "deve" ou "tem a favor" é o `tipo`.
  const tipo = ehAbertura ? (valor >= 0 ? "debito" : "credito") : "debito";

  const rotuloPadrao = ehAbertura
    ? (valor >= 0 ? "Situação inicial · em aberto" : "Situação inicial · crédito a favor")
    : "Serviço avulso";

  const { error } = await db.from("conta_corrente").insert({
    org_id: org,
    familia_id: familiaId,
    tumulo_id: b?.tumuloId || null,
    tipo,
    origem: ehAbertura ? "abertura" : "avulso",
    competencia: null,          // nenhum destes pertence a um período
    valor: Math.abs(Math.round(valor * 100) / 100),
    descricao: String(b?.descricao || "").trim() || rotuloPadrao,
    comprovante_id: b?.comprovanteId || null,
    data: b?.data || diaOperacao(),
  });

  if (error) {
    // 23505 na abertura = já existe uma. Lançar a segunda dobraria a dívida
    // inicial de alguém, e pareceria um lançamento legítimo no extrato.
    if (error.code === "23505" && ehAbertura) {
      return NextResponse.json({
        ok: false,
        erro: "abertura_ja_existe",
        mensagem: "Esta família já tem a situação inicial lançada. Para corrigir, apague o lançamento antigo primeiro.",
      }, { status: 409 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * CORRIGIR UM LANÇAMENTO — data, valor ou descrição.
 *
 * Errar a data de um Pix é banal, e sem isto o único conserto seria mexer no
 * banco. Uma pessoa que não pode corrigir o próprio erro passa a evitar
 * registrar — e aí o extrato deixa de valer.
 *
 * O que NÃO se edita aqui: `tipo` e `origem`. Transformar um débito em crédito
 * mudaria o saldo sem deixar rastro do que aconteceu; para isso, apaga-se e
 * lança de novo.
 */
export async function PATCH(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "id_obrigatorio" }, { status: 400 });

  const patch: Record<string, any> = {};

  if (b?.data !== undefined) patch.data = b.data || null;
  if (b?.descricao !== undefined) patch.descricao = String(b.descricao || "").trim() || null;
  if (b?.valor !== undefined) {
    const v = Number(String(b.valor).replace(",", "."));
    if (!isFinite(v) || v <= 0) {
      return NextResponse.json(
        { ok: false, erro: "valor_invalido", mensagem: "Informe um valor maior que zero." },
        { status: 400 },
      );
    }
    patch.valor = Math.round(v * 100) / 100;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_mudar" }, { status: 400 });
  }

  // A competência é gerada pelo fechamento do mês e protegida por índice
  // único. Deixar editar valor de um débito de competência criaria divergência
  // entre o que o plano diz e o que a família deve.
  const { data: atual } = await db
    .from("conta_corrente").select("origem").eq("id", id).maybeSingle();

  if ((atual as any)?.origem === "competencia" && patch.valor !== undefined) {
    return NextResponse.json({
      ok: false,
      erro: "competencia_nao_edita_valor",
      mensagem: "O valor da mensalidade vem do plano do túmulo. Ajuste o plano na ficha, ou apague este lançamento e gere de novo.",
    }, { status: 400 });
  }

  const { error } = await db.from("conta_corrente").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Apaga um lançamento. O registro de lavagem não some: ele é histórico. */
export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id_obrigatorio" }, { status: 400 });

  const { error } = await auth.db.from("conta_corrente").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
