import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

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

/** Frase escrita para ser dita ao telefone, sem tradução. Nada de "inadimplente". */
function frasear(saldo: number): string {
  const dinheiro = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (Math.abs(saldo) < 0.005) return "Em dia";
  if (saldo < 0) return `Pago adiantado · ${dinheiro(-saldo)} a favor`;
  return `Em aberto · ${dinheiro(saldo)}`;
}

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
    comprovanteUrl: l.comprovantes?.imagem_url ?? null,
    local: l.tumulos
      ? [l.tumulos.quadras?.codigo, l.tumulos.ruas?.nome].filter(Boolean).join(" · ")
      : null,
    codigo: l.tumulos?.codigo ?? null,
  }));

  // Soma no servidor: o saldo é a resposta que a Sureya lê antes de ligar
  // para a família, e não pode depender de a lista ter sido paginada.
  //
  // Os registros de LAVAGEM ficam de fora da conta. Eles existem no extrato
  // só para acompanhar o que foi feito — quem gera a dívida é a competência.
  // Somá-los cobraria a família duas vezes pelo mesmo serviço.
  const saldo = linhas
    .filter((l) => l.origem !== "lavagem")
    .reduce((s, l) => s + (l.tipo === "debito" ? l.valor : -l.valor), 0);
  const arredondado = Math.round(saldo * 100) / 100;

  return NextResponse.json({
    ok: true,
    saldo: arredondado,
    frase: frasear(arredondado),
    emDia: arredondado <= 0.005,
    linhas,
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

  const ehPagamento = acao === "pagamento";
  const ehAbertura = acao === "abertura";

  // Na abertura, o sinal do número decide o lado do lançamento. O valor
  // gravado é sempre positivo — quem diz "deve" ou "tem a favor" é o `tipo`.
  const tipo = ehAbertura
    ? (valor >= 0 ? "debito" : "credito")
    : (ehPagamento ? "credito" : "debito");

  const rotuloPadrao = ehAbertura
    ? (valor >= 0 ? "Situação inicial · em aberto" : "Situação inicial · crédito a favor")
    : ehPagamento ? "Pagamento recebido" : "Serviço avulso";

  const { error } = await db.from("conta_corrente").insert({
    org_id: org,
    familia_id: familiaId,
    tumulo_id: b?.tumuloId || null,
    tipo,
    origem: ehAbertura ? "abertura" : ehPagamento ? "pagamento" : "avulso",
    competencia: null,          // nenhum destes pertence a um período
    valor: Math.abs(Math.round(valor * 100) / 100),
    descricao: String(b?.descricao || "").trim() || rotuloPadrao,
    comprovante_id: b?.comprovanteId || null,
    data: b?.data || new Date().toISOString().slice(0, 10),
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
