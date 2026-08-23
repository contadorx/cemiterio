import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O RELATÓRIO DE EVENTOS — por competência, com o canal ao lado.
 *
 * POR QUE ELE EXISTE, E POR QUE NÃO É O EXPORT DA CONTABILIDADE
 * ---------------------------------------------------------------------------
 * Já havia `/api/financeiro/export`: um CSV do mês, para o contador. Ele
 * agrupa por `data` e não conhece nem `competencia` nem `canal` — e faz
 * sentido assim, porque quem recebe aquele arquivo quer o extrato do período.
 *
 * Este aqui responde outra pergunta, que é a da CONFERÊNCIA: "o que aconteceu
 * na competência de agosto, por onde entrou cada registro, e o que eu já
 * conferi?". São três colunas que o outro não tem e que aqui são o assunto.
 *
 * O CANAL É O ASSUNTO porque o registro pode entrar por três portas — a
 * esteira da competência, o aplicativo de campo e o painel — e a conferência é
 * exatamente descobrir o que entrou por uma e não pela outra. Foi assim que se
 * viu que DUAS de três lavagens registradas fora do campo nunca viraram
 * dinheiro.
 *
 * FORMATOS: json (a tela), csv (qualquer coisa) e xls (Excel).
 */

const CANAIS = ["automatico", "campo", "manual_adm", "importacao"];

function escaparXml(v: any): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * SpreadsheetML 2003 — um .xls que o Excel abre como planilha DE VERDADE.
 *
 * Sem biblioteca: num projeto que cuida do tamanho da superfície, uma
 * dependência de planilha para um export só não se paga. As duas alternativas
 * sem lib eram esta e a tabela HTML servida como Excel — a segunda abre com um
 * aviso de "formato não corresponde à extensão" toda vez, e número vira texto,
 * que é justamente o que quebra a conferência.
 *
 * Aqui o número vai como Number e a data como String no formato brasileiro: a
 * data como DateTime exigiria o fuso no XML e abriria a porta para o Excel
 * mostrar o dia anterior.
 */
function planilhaXml(colunas: string[], linhas: any[][]): string {
  const celula = (v: any) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
    }
    return `<Cell><Data ss:Type="String">${escaparXml(v)}</Data></Cell>`;
  };
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="cab"><Font ss:Bold="1"/></Style>
 </Styles>
 <Worksheet ss:Name="Eventos">
  <Table>
   <Row>${colunas.map((c) => `<Cell ss:StyleID="cab"><Data ss:Type="String">${escaparXml(c)}</Data></Cell>`).join("")}</Row>
   ${linhas.map((l) => `<Row>${l.map(celula).join("")}</Row>`).join("\n   ")}
  </Table>
 </Worksheet>
</Workbook>`;
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const q = req.nextUrl.searchParams;
  const competencia = (q.get("competencia") || "").trim();   // yyyy-mm
  const familiaId = (q.get("familiaId") || "").trim();
  const canal = (q.get("canal") || "").trim();
  const origem = (q.get("origem") || "").trim();
  const conferido = (q.get("conferido") || "").trim();       // "sim" | "nao"
  const formato = (q.get("formato") || "json").trim();

  let sel = auth.db
    .from("sureya_eventos_da_familia")
    .select("id,familia_id,familia,responsavel,competencia,data,tipo,origem,canal," +
            "valor,valor_com_sinal,descricao,jazigo,quadra,servico_id,data_executada," +
            "conferido_em,nota_conferencia,e_estorno")
    .order("competencia", { ascending: false })
    .order("data", { ascending: true })
    .limit(5000);

  if (competencia) sel = sel.eq("competencia", `${competencia}-01`);
  if (familiaId) sel = sel.eq("familia_id", familiaId);
  if (canal && CANAIS.includes(canal)) sel = sel.eq("canal", canal);
  if (origem) sel = sel.eq("origem", origem);
  if (conferido === "sim") sel = sel.not("conferido_em", "is", null);
  if (conferido === "nao") sel = sel.is("conferido_em", null);

  const { data, error } = await sel;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const eventos = (data as any[]) || [];

  // ---------------------------------------------------------------- ARQUIVOS
  if (formato === "csv" || formato === "xls") {
    const COLUNAS = [
      "competencia", "data", "familia", "responsavel", "jazigo", "quadra",
      "tipo", "origem", "canal", "valor", "descricao", "conferido", "nota",
    ];
    const dia = (d: string | null) =>
      d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "";
    const comp = (d: string | null) =>
      d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "";

    const linhas = eventos.map((e) => [
      comp(e.competencia), dia(e.data), e.familia || "", e.responsavel || "",
      e.jazigo || "", e.quadra || "", e.tipo || "", e.origem || "", e.canal || "",
      // O SINAL VAI NO NÚMERO. Uma planilha com "40,00" em duas linhas, uma
      // débito e outra crédito, soma 80 quando devia somar zero — e quem
      // confere não tem como ver isso batendo o olho.
      Number(e.valor_com_sinal) || 0,
      e.descricao || "", e.conferido_em ? "sim" : "nao", e.nota_conferencia || "",
    ]);

    const nome = `eventos${competencia ? `-${competencia}` : ""}`;

    if (formato === "xls") {
      return new NextResponse(planilhaXml(COLUNAS, linhas), {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nome}.xls"`,
        },
      });
    }

    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Ponto e vírgula e vírgula decimal: é o que o Excel em português abre
    // sem passar pelo assistente de importação.
    const csv = [
      COLUNAS.join(";"),
      ...linhas.map((l) => l.map((v) =>
        typeof v === "number" ? String(v).replace(".", ",") : esc(v)).join(";")),
    ].join("\n");

    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}.csv"`,
      },
    });
  }

  // ------------------------------------------------------------------- JSON
  const [{ data: resumo }, { data: semCobranca }] = await Promise.all([
    auth.db.from("sureya_resumo_por_competencia")
      .select("competencia,eventos,conferidos,debitos,creditos,resultado,familias," +
              "do_campo,do_painel,automaticos,importados,sem_canal")
      .order("competencia", { ascending: false }).limit(36),
    // A LAVAGEM QUE NÃO VIROU DINHEIRO vai junto do relatório, e não numa tela
    // à parte: quem confere o mês é quem tem como decidir o valor, e é agora
    // que ela está olhando.
    auth.db.from("sureya_lavagens_sem_cobranca")
      .select("servico_id,familia_id,familia,jazigo,quadra,dia,competencia,canal,valor_sugerido")
      .order("dia", { ascending: true }).limit(200),
  ]);

  return NextResponse.json({
    ok: true,
    eventos,
    competencias: (resumo as any[]) || [],
    semCobranca: (semCobranca as any[]) || [],
    filtro: { competencia, familiaId, canal, origem, conferido },
  });
}

/**
 * POST — duas coisas que se faz olhando o relatório.
 *
 *   { lancamentoId, ok, nota? }   → o ok por evento
 *   { servicoId, valor }          → lançar a lavagem que não virou dinheiro
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));

  // ------------------------------------------- LANÇAR A LAVAGEM ESQUECIDA
  //
  // Passa pela MESMA porta do resto do dinheiro (`sureya_lancar`, 0073). Não
  // há atalho: um insert direto em `conta_corrente` aqui seria a segunda
  // implementação de dinheiro no sistema, e a primeira já custou caro.
  //
  // O valor vem da tela, não daqui: qual é o certo — o do jazigo, o do plano,
  // uma cortesia? — é decisão de quem está conferindo. A tela sugere o do
  // jazigo e a pessoa confirma ou troca.
  if (b?.servicoId) {
    const valor = Number(b?.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json(
        { ok: false, erro: "valor_invalido",
          mensagem: "Informe o valor da lavagem." }, { status: 400 });
    }

    const { data: sv } = await auth.db
      .from("servicos")
      .select("id,tumulo_id,cliente_id,data_executada,status,estornado_em,tumulos(familia_id,identificacao)")
      .eq("id", b.servicoId).maybeSingle();

    if (!sv || (sv as any).status !== "executado" || (sv as any).estornado_em) {
      return NextResponse.json(
        { ok: false, erro: "servico_invalido",
          mensagem: "Esta lavagem não está executada (ou foi estornada)." }, { status: 409 });
    }

    // Conferir de novo ANTES de lançar: entre a tela carregar e o clique,
    // alguém pode ter lançado. Sem isto, dois cliques cobram duas vezes.
    const { count } = await auth.db
      .from("conta_corrente").select("id", { count: "exact", head: true })
      .eq("servico_id", b.servicoId);
    if ((count || 0) > 0) {
      return NextResponse.json(
        { ok: false, erro: "ja_lancado",
          mensagem: "Esta lavagem já tem lançamento. Recarregue a tela." }, { status: 409 });
    }

    const executada = String((sv as any).data_executada || "").slice(0, 10);
    const { error: eL } = await auth.db.rpc("sureya_lancar", {
      p_cliente: (sv as any).cliente_id,
      p_tipo: "debito",
      p_valor: valor,
      p_origem: "lavagem",
      p_descricao: `Lavagem de ${(sv as any).tumulos?.identificacao || "jazigo"} — lançada na conferência`,
      p_data: executada || null,
      p_status: null,
      p_servico: b.servicoId,
      p_comprovante: null,
      p_tumulo: (sv as any).tumulo_id,
      // A COMPETÊNCIA É A DA LAVAGEM, não a de hoje. Lançar em agosto uma
      // limpeza de agosto conferida em setembro é o que mantém o mês fechado
      // fechado.
      p_competencia: executada ? executada.slice(0, 7) + "-01" : null,
      p_sem_comprovante: true,
      p_estorna: null,
    });
    if (eL) return NextResponse.json({ ok: false, erro: eL.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      mensagem: `Lançado R$ ${valor.toFixed(2)} na competência de ${executada.slice(0, 7)}.`,
    });
  }

  const lancamentoId = String(b?.lancamentoId || "").trim();
  if (!lancamentoId) {
    return NextResponse.json({ ok: false, erro: "sem_lancamento" }, { status: 400 });
  }

  const { data, error } = await auth.db.rpc("sureya_conferir_evento", {
    p_lancamento: lancamentoId,
    p_ok: b?.ok !== false,
    p_nota: b?.nota || null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  const r = (Array.isArray(data) ? data[0] : data) || {};
  return NextResponse.json({ ok: !!r.ok, mensagem: r.mensagem || null });
}
