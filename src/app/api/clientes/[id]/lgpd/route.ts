import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { auditar } from "@/lib/auditoria";
import { orgAtual } from "@/lib/org";
import { apagarArquivos } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { acao:'anonimizar' | 'indicacao' | 'consentimento', via? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  if (acao === "anonimizar") {
    // O ARQUIVO SAI ANTES DO REGISTRO.
    //
    // `storage.objects` é uma tabela, e dá para apagar linha dela — mas isso
    // remove só o registro. O arquivo continua no balde e continua abrindo pela
    // URL pública (DECISOES.md D-03). Quem apaga de verdade é a API de Storage,
    // que mora aqui.
    //
    // A ordem é deliberada: se o Storage falhar, a pessoa **não** é marcada
    // como anonimizada. Devolver "não consegui remover as fotos, tente de novo"
    // é melhor que registrar uma remoção que não aconteceu inteira — e um
    // comprovante de remoção sobre arquivo que ficou é pior que não ter
    // removido.
    const { data: arquivos, error: eArq } = await db
      .rpc("sureya_arquivos_do_cliente", { p_cliente: params.id });

    if (eArq) {
      return NextResponse.json(
        { ok: false, erro: `nao consegui listar os arquivos: ${eArq.message}` },
        { status: 500 },
      );
    }

    const urls = ((arquivos || []) as any[]).map((a) => a.url).filter(Boolean);
    const { removidos, falharam } = await apagarArquivos(db, urls);

    if (falharam.length) {
      return NextResponse.json({
        ok: false,
        erro: `Removi ${removidos} de ${urls.length} arquivos. ${falharam.length} não saíram, `
            + `então NÃO marquei a pessoa como removida — os dados continuam como estavam. `
            + `Tente de novo; se insistir, é preciso apagar esses arquivos à mão no Storage.`,
        arquivosRestantes: falharam.slice(0, 20),
      }, { status: 502 });
    }

    const { data: sobrou, error } =
      await db.rpc("sureya_anonimizar_cliente", { p_cliente: params.id });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    // ======================================================================
    // A REMOÇÃO SE PROVA (0140)
    // ======================================================================
    //
    // A função devolve onde o nome e o telefone da pessoa ainda aparecem no
    // banco inteiro. Isto não é zelo: o caminho existia desde a 0010 e NUNCA
    // tinha rodado, e quando eu o exercitei em produção (num bloco desfeito)
    // ele deixava seis coisas para trás — inclusive um `update` nos leads que
    // casava zero linhas por um erro de ordem, invisível na leitura.
    //
    // O TELEFONE É INEQUÍVOCO: se aparece, sobrou dado dela, e isso é falha.
    // O nome não — "Kátia" também é o começo de "Kátia C. Lima", que é outra
    // pessoa e não pediu nada. Misturar os dois faria o aviso gritar sempre, e
    // aviso que sempre grita ensina a ignorar aviso.
    const linhas = ((sobrou || []) as any[]);
    const porTelefone = linhas.filter((l) => l.pelo_telefone);
    const mencoes = linhas.filter((l) => !l.pelo_telefone);

    const org = await orgAtual(db);
    if (org) {
      await auditar(db, org, auth.userId, "anonimizou_cliente",
        { tipo: "cliente", id: params.id },
        {
          // O QUE SOBROU FICA NO REGISTRO, não só na tela que alguém fechou.
          // É o que permite responder, meses depois, "a remoção foi completa?"
          completa: porTelefone.length === 0,
          sobrou_por_telefone: porTelefone.map((l) => `${l.onde}:${l.quantos}`),
          mencoes_ao_nome: mencoes.map((l) => `${l.onde}:${l.quantos}`),
        });
    }

    return NextResponse.json({
      ok: true,
      completa: porTelefone.length === 0,
      sobrouPorTelefone: porTelefone,
      mencoesAoNome: mencoes,
    });
  }

  if (acao === "consentimento") {
    const { error } = await db.rpc("sureya_registrar_consentimento", {
      p_cliente: params.id,
      p_via: body?.via || "cadastro",
    });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (acao === "indicacao") {
    const { data, error } = await db.rpc("sureya_gerar_codigo_indicacao", { p_cliente: params.id });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, codigo: data });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}

// GET -> exporta os dados do cliente (LGPD: direito de acesso/portabilidade)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  // A EXPORTACAO TEM DE TRAZER OS DOIS RAZOES.
  //
  // Desde a decisao de 22/08 (DECISOES.md D-01) a vida financeira da pessoa
  // esta em `conta_corrente`, no grao da familia — e ha familia cuja divida
  // inteira so existe la. Exportar apenas `movimentos` devolveria um arquivo
  // vazio no campo financeiro para quem tem lancamento, o que faz o direito de
  // acesso falhar exatamente onde ele mais importa.
  //
  // O razao da familia vai identificado como tal: e um extrato COMPARTILHADO
  // entre os membros, nao um registro individual, e quem le o arquivo precisa
  // saber disso.
  const { data: cli } = await db
    .from("clientes").select("familia_id").eq("id", params.id).maybeSingle();
  const familiaId = (cli as any)?.familia_id as string | null;

  // AS FOTOS SÃO DADO PESSOAL, E SÃO O PRODUTO.
  //
  // A exportação levava cadastro, jazigos, serviços, os dois razões e as
  // mensagens — e não as fotos. Numa operação em que o que a família recebe é
  // uma foto do túmulo do pai, exportar tudo menos a foto é entregar o direito
  // de acesso pela metade.
  //
  // Vai a mesma lista que a REMOÇÃO usa (`sureya_arquivos_do_cliente`), de
  // propósito: se as duas divergirem, existe arquivo que se exporta e não se
  // apaga, ou o contrário — e qualquer um dos dois é pior que não ter nenhum.
  const { data: arquivos } = await db
    .rpc("sureya_arquivos_do_cliente", { p_cliente: params.id });

  const [{ data: cliente }, { data: tumulos }, { data: servicos }, { data: movimentos }, { data: contaCorrente }, { data: mensagens }] =
    await Promise.all([
      db.from("clientes").select("nome,telefone,consentimento_em,codigo_indicacao,created_at").eq("id", params.id).maybeSingle(),
      db.from("tumulos").select("identificacao,falecido_nome").eq("cliente_id", params.id),
      db.from("servicos").select("data_prevista,data_executada,status").eq("cliente_id", params.id),
      db.from("movimentos").select("tipo,valor,data,descricao").eq("cliente_id", params.id),
      familiaId
        ? db.from("conta_corrente").select("tipo,valor,data,descricao,origem,status_conc").eq("familia_id", familiaId)
        : Promise.resolve({ data: [] } as any),
      db.from("mensagens").select("direcao,autor,texto,created_at").eq("cliente_id", params.id).order("created_at"),
    ]);

  return NextResponse.json({
    ok: true,
    export: {
      cliente,
      tumulos,
      servicos,
      contaCorrenteDaFamilia: contaCorrente || [],
      movimentosLegado: movimentos,
      mensagens,
      // Cada arquivo com a origem ("depois da limpeza", "comprovante de
      // pagamento"). São links públicos e permanentes — ver DECISOES.md D-03 e
      // POLITICA_DADOS.md §3.
      arquivos: (arquivos || []) as any[],
      geradoEm: new Date().toISOString(),
    },
  });
}
