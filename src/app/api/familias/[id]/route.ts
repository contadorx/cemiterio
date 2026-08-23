import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { valorDaLimpeza } from "@/lib/valor-limpeza";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O CONTRATO DA FAMÍLIA.
 *
 * Valor, frequência de pagamento e início de cobrança moram aqui — a Sureya
 * combina UM valor com a família, mesmo que ela tenha dois túmulos. Isto já
 * esteve no túmulo, e lá gerava duas cobranças para quem tem duas pedras.
 *
 * A periodicidade da limpeza NÃO está aqui: ela é do túmulo, porque pode ser
 * diferente em cada um.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { data, error } = await auth.db
    .from("familias")
    .select("id,nome,observacoes,valor_mensal,valor_base,freq_pagamento,inicio_cobranca,contratado,modo_cobranca,enviar_fotos")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  // QUANTO VALE CADA LIMPEZA — calculado no servidor, e não na tela.
  //
  // A conta depende do ritmo de TODOS os túmulos da família, e a ficha só
  // conhece os do cliente aberto. Calcular lá daria um número diferente do que
  // o extrato lança — o pior tipo de divergência, porque parece certo.
  const porLimpeza = await valorDaLimpeza(params.id);

  return NextResponse.json({ ok: true, familia: { ...data, valor_por_limpeza: porLimpeza } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  if (b.nome !== undefined) patch.nome = String(b.nome || "").trim() || null;
  if (b.observacoes !== undefined) patch.observacoes = String(b.observacoes || "").trim() || null;
  if (b.contratado !== undefined) patch.contratado = !!b.contratado;

  // A CHAVE DE ENVIO DE FOTOS DESTA FAMÍLIA — três estados, não dois.
  //
  // `null` não é "desligado": é "segue a chave geral da casa". Tratar nulo
  // como falso faria toda família cadastrada antes da 0085 parar de receber
  // foto no dia em que alguém desligasse e religasse a geral. Por isso o
  // `!!b.enviar_fotos` que serviria para `contratado` NÃO serve aqui.
  if (b.enviar_fotos !== undefined) {
    patch.enviar_fotos =
      b.enviar_fotos === null || b.enviar_fotos === "" || b.enviar_fotos === "geral"
        ? null
        : b.enviar_fotos === true || b.enviar_fotos === "sim";
  }

  if (b.valor_mensal !== undefined) {
    const v = Number(String(b.valor_mensal).replace(",", "."));
    patch.valor_mensal = isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  }

  // O NOME DA FAMÍLIA.
  //
  // Não era editável em LUGAR NENHUM do sistema: nem esta rota o aceitava, nem
  // tela alguma a chamava. O cartão que dizia "Dados da família" na ficha edita
  // `clientes` — o CONTATO. Quem quisesse corrigir "Família Andre" para
  // "Família Nagae" não tinha por onde, e ao tentar mudava o nome da pessoa.
  //
  // Vazio é recusado: uma família sem nome some das listas, que ordenam e
  // procuram por ele.
  if (b.nome !== undefined) {
    const nome = String(b.nome || "").trim();
    if (!nome) {
      return NextResponse.json(
        { ok: false, erro: "nome_vazio",
          mensagem: "A família precisa de um nome — é por ele que ela aparece nas listas." },
        { status: 400 });
    }
    patch.nome = nome;
  }

  if (b.valor_base !== undefined) patch.valor_base = b.valor_base || "mes";
  if (b.modo_cobranca !== undefined) patch.modo_cobranca = b.modo_cobranca || "consumo";
  if (b.freq_pagamento !== undefined) patch.freq_pagamento = b.freq_pagamento || null;

  // Sempre o dia 1: competência é mês, não dia. Guardar "15/03" faria a
  // comparação com "2026-03-01" falhar em silêncio, e a família receberia (ou
  // deixaria de receber) cobrança sem motivo aparente.
  if (b.inicio_cobranca !== undefined) {
    const v = String(b.inicio_cobranca || "");
    patch.inicio_cobranca = /^\d{4}-\d{2}/.test(v) ? `${v.slice(0, 7)}-01` : null;
  }

  // LEMBRETES DE MEMÓRIA, POR FAMÍLIA.
  //
  // "Chave para ligar e desligar geral e por família." A geral fica em
  // /painel/memoria; esta é a da família, e é a que atende o pedido que chega
  // por telefone: "não me mandem mais nada sobre isso".
  //
  // `null` não é o mesmo que `false`: nulo é "segue a casa", falso é "esta
  // família pediu para não receber". Guardar o pedido como ausência de
  // preferência faria a próxima mudança da chave geral desfazer o pedido.
  // Os três estados chegam como a string da tela, igual a `enviar_fotos`.
  if (b.lembretes_memoria !== undefined) {
    patch.lembretes_memoria =
      b.lembretes_memoria === null || b.lembretes_memoria === "" || b.lembretes_memoria === "geral"
        ? null
        : b.lembretes_memoria === true || b.lembretes_memoria === "sim";
  }

  // PAUSA COM PRAZO. Serve para o luto que a casa conhece mas o cadastro
  // ainda não: a família enterrou alguém agora, e o silêncio vale por um
  // tempo, sem precisar desligar para sempre e lembrar de religar.
  if (b.lembretes_pausados_ate !== undefined) {
    const v = String(b.lembretes_pausados_ate || "");
    patch.lembretes_pausados_ate = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_mudar" }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await auth.db.from("familias").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * FUNDIR OU EXCLUIR A FAMÍLIA.
 *
 * As duas ações vivem juntas porque uma sem a outra é armadilha: fundir sem
 * excluir deixa cascas na lista; excluir sem fundir convida a apagar o que tem
 * jazigo pendurado.
 *
 * Medido em 23/08: 31 nomes repetidos, 97 famílias, e NENHUMA vazia — 97 com
 * contato, 48 com jazigo. Um "excluir" que respeita o dado recusaria todas.
 * Duplicata pede FUSÃO; a exclusão é para o que sobra depois.
 *
 * POST { acao: "fundir", destino }  — move tudo e apaga a origem
 * DELETE                            — só se a família estiver realmente vazia
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  if (b?.acao !== "fundir") {
    return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
  }
  const destino = String(b?.destino || "").trim();
  if (!destino) {
    return NextResponse.json(
      { ok: false, erro: "sem_destino", mensagem: "Escolha a família que fica." },
      { status: 400 });
  }

  const { data, error } = await auth.db.rpc("sureya_fundir_familias", {
    p_origem: params.id, p_destino: destino,
    p_motivo: String(b?.motivo || "") || null,
  });

  if (error) {
    const m = String(error.message || "");
    if (m.includes("origem_igual_ao_destino")) {
      return NextResponse.json(
        { ok: false, erro: "origem_igual_ao_destino",
          mensagem: "Escolha uma família diferente para receber." },
        { status: 400 });
    }
    if (m.includes("familia_nao_encontrada") || m.includes("organizacoes_diferentes")) {
      return NextResponse.json(
        { ok: false, erro: "familia_nao_encontrada",
          mensagem: "Não achei uma das duas famílias." },
        { status: 404 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  const r = (Array.isArray(data) ? data[0] : data) || {};
  return NextResponse.json({ ok: true, movido: r });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { error } = await auth.db.rpc("sureya_excluir_familia", { p_familia: params.id });

  if (error) {
    // A função recusa DIZENDO o que segura. Sem repassar o detalhe, a pessoa
    // tenta de novo pelo mesmo caminho em vez de ir fundir.
    if (String(error.message || "").includes("familia_nao_esta_vazia")) {
      const detalhe = String((error as any).details || "").trim();
      return NextResponse.json(
        { ok: false, erro: "familia_nao_esta_vazia",
          mensagem: `Esta família ainda tem ${detalhe || "coisas ligadas a ela"}. `
                  + `Se for duplicada, use "Fundir com outra" — assim nada se perde.` },
        { status: 409 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
