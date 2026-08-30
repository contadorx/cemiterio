import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { lerDataDeMemoria, PRECISOES } from "@/lib/memoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QUEM DESCANSA NUM JAZIGO — e as duas datas de cada um.
 *
 * ⚠ POR QUE ESTA ROTA EXISTE, se `/api/tumulos/[id]` já aceitava datas
 *
 * Aceitava, mas para outro lugar e em outro formato. Havia DUAS memórias:
 *
 *   tumulos.datas_gatilho   jsonb `[{tipo, data}]`, data em **MM-DD** — sem
 *                           ano, do TÚMULO, uma lista solta.
 *   falecidos.data_*        `date` de verdade, com ano e com PRECISÃO, da
 *                           PESSOA (0095).
 *
 * O ano não é detalhe: sem ele não dá para escrever "completam-se 7 anos",
 * não existe o marco de 1 ano, e — o que mais importa — não dá para saber se
 * o luto é recente. A zona de silêncio (< 90 dias bloqueia tudo, < 6 meses
 * bloqueia oferta) é uma conta com a data real. Em MM-DD ela é impossível.
 *
 * E um túmulo guarda VÁRIAS pessoas. Uma lista por túmulo não sabe de quem é
 * cada data, então não sabe agrupar — e agrupamento é requisito, não
 * otimização: três datas do mesmo túmulo no mesmo mês são UMA mensagem.
 *
 * Medido em 23/08 antes de escolher: `datas_gatilho` preenchido em ZERO
 * túmulos, `falecidos` com data em ZERO pessoas. Nenhum dado a migrar — a
 * hora mais barata que existe para ficar com uma verdade só.
 */

/** GET ?tumuloId=… — quem está neste jazigo, na ordem em que se lê a lápide. */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  // ==========================================================================
  // A FILA DA BANCADA (?fila=1)
  // ==========================================================================
  //
  // Medido em 28/08: 266 jazigos, 62 com alguém cadastrado, ZERO com mais de
  // uma pessoa, e 62 de 62 sem nenhuma data. Os 62 nomes vieram do campo de
  // texto antigo — Nakandakari, Ogasawara, "Família grave" — que é o que está
  // escrito na LÁPIDE, não quem está enterrado.
  //
  // A ORDEM DA FILA É A ORDEM DO TRABALHO, e não a ordem do banco:
  //
  //   1º  jazigo com foto da lápide e NINGUÉM cadastrado — dá para transcrever
  //       agora, e é a maior pilha (204).
  //   2º  jazigo com gente mas SEM NENHUMA DATA — é o caso dos 62: o nome está
  //       lá, falta o que o motor de memória precisa.
  //   3º  o resto.
  //
  // Jazigo SEM foto vai para o fim de cada grupo, não para fora: dá para
  // preencher pelo que a família contou. Sumir com ele esconderia trabalho.
  if (req.nextUrl.searchParams.get("fila")) {
    // O CEMITÉRIO ESTREITA A FILA (0150).
    //
    // A bancada é trabalho de uma pessoa sentada com as fotos de UM cemitério.
    // Sem este filtro, a fila do Santa Lídia vem misturada com os 266 do
    // Saudade — e a contagem que a tela mostra ("204 para transcrever") passa a
    // falar de um trabalho que não é o que está na frente dela.
    const cemFila = req.nextUrl.searchParams.get("cemiterio") || "";

    let q = auth.db
      .from("tumulos")
      .select("id,identificacao,codigo,rua,foto_referencia_url,cemiterio_id,"
            + "quadras(codigo),familias(nome),falecidos(id,data_nascimento,data_falecimento)")
      .order("codigo", { ascending: true })
      .limit(1000);
    if (cemFila) q = q.eq("cemiterio_id", cemFila);
    const { data, error } = await q;

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    const jazigos = ((data || []) as any[]).map((t) => {
      const gente = (t.falecidos || []) as any[];
      const comData = gente.filter((f) => f.data_nascimento || f.data_falecimento).length;
      return {
        id: t.id,
        identificacao: t.identificacao || null,
        codigo: t.codigo || null,
        quadra: t.quadras?.codigo || null,
        rua: t.rua || null,
        familia: t.familias?.nome || null,
        fotoLapide: t.foto_referencia_url || null,
        pessoas: gente.length,
        comData,
      };
    });

    const grupo = (j: any) => (j.pessoas === 0 ? 0 : j.comData === 0 ? 1 : 2);
    const fila = jazigos
      .filter((j) => grupo(j) < 2)
      .sort((a, b) =>
        grupo(a) - grupo(b) ||
        // Com foto primeiro: é o que dá para transcrever sem ligar para ninguém.
        (a.fotoLapide ? 0 : 1) - (b.fotoLapide ? 0 : 1) ||
        String(a.codigo || a.identificacao || "").localeCompare(String(b.codigo || b.identificacao || "")));

    return NextResponse.json({
      ok: true,
      fila,
      resumo: {
        jazigos: jazigos.length,
        semNinguem: jazigos.filter((j) => j.pessoas === 0).length,
        semData: jazigos.filter((j) => j.pessoas > 0 && j.comData === 0).length,
        prontos: jazigos.filter((j) => j.pessoas > 0 && j.comData > 0).length,
        semFoto: fila.filter((j) => !j.fotoLapide).length,
      },
      // A LISTA DE CEMITERIOS, para a tela montar o seletor sem uma segunda
      // chamada. Vem sempre, mesmo com um so — quem decide se mostra o filtro
      // e a tela, e ela precisa saber quantos existem para decidir.
      cemiterios: (((await auth.db.from("cemiterios")
        .select("id,nome").order("ordem")).data as any[]) || [])
        .map((c) => ({ id: c.id, nome: c.nome })),
    });
  }

  const tumuloId = req.nextUrl.searchParams.get("tumuloId");
  if (!tumuloId) {
    return NextResponse.json({ ok: false, erro: "informe_o_tumulo" }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("falecidos")
    .select("id,nome,apelido_familiar,data_nascimento,data_falecimento,"
          + "precisao_nascimento,precisao_falecimento,principal,ordem,observacoes")
    .eq("tumulo_id", tumuloId)
    .order("principal", { ascending: false })
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, falecidos: data || [] });
}

/**
 * Monta os campos de data a partir do corpo, ou devolve a frase do erro.
 *
 * As duas datas andam sempre em par com a PRECISÃO, e por isso são lidas
 * juntas: uma data sem precisão declarada seria tratada como dia exato, e
 * "faleceu em algum momento de 1998" viraria um lembrete no dia 1º de janeiro.
 */
function camposDeData(b: any): { campos: Record<string, any> } | { erro: string } {
  const campos: Record<string, any> = {};

  for (const [campo, rotulo] of [
    ["nascimento", "nascimento"],
    ["falecimento", "falecimento"],
  ] as const) {
    const bruto = b?.[`data_${campo}`];
    const precisao = b?.[`precisao_${campo}`];

    if (bruto !== undefined) {
      const lida = lerDataDeMemoria(bruto);
      if (lida === null) {
        return { erro: `Não entendi a data de ${rotulo}. Use dia/mês/ano, como 23/07/1998.` };
      }
      campos[`data_${campo}`] = lida;              // "" vira null lá dentro
      // Apagar a data apaga a precisão junto: precisão de uma data que não
      // existe é lixo que sobrevive à correção.
      if (lida === null || lida === "") campos[`precisao_${campo}`] = "desconhecida";
    }

    if (precisao !== undefined) {
      if (!PRECISOES.includes(precisao)) {
        return { erro: `Precisão de ${rotulo} inválida.` };
      }
      campos[`precisao_${campo}`] = precisao;
    }
  }

  return { campos };
}

/** POST { tumuloId, nome, … } — acrescenta uma pessoa ao jazigo. */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const nome = String(b?.nome || "").trim();
  const tumuloId = String(b?.tumuloId || "").trim();

  if (!tumuloId) return NextResponse.json({ ok: false, erro: "informe_o_tumulo" }, { status: 400 });
  if (!nome) {
    return NextResponse.json(
      { ok: false, erro: "nome_vazio", mensagem: "O nome é o mínimo — sem ele a mensagem não tem de quem falar." },
      { status: 400 });
  }

  // O jazigo tem de ser desta organização. A RLS já barraria a escrita, mas o
  // erro chegaria como "violação de policy": não diz nada a quem está olhando.
  const { data: t } = await auth.db
    .from("tumulos").select("id,org_id").eq("id", tumuloId).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, erro: "jazigo_nao_encontrado" }, { status: 404 });

  const d = camposDeData(b);
  if ("erro" in d) return NextResponse.json({ ok: false, erro: "data_invalida", mensagem: d.erro }, { status: 400 });

  // O PRIMEIRO É O PRINCIPAL. `tumulos.falecido_nome` é espelho do principal
  // desde a 0095, e 21 arquivos leem esse espelho — um jazigo cuja primeira
  // pessoa não fosse principal ficaria sem nome em todos eles.
  const { count } = await auth.db
    .from("falecidos").select("id", { count: "exact", head: true }).eq("tumulo_id", tumuloId);

  const { data: novo, error } = await auth.db.from("falecidos").insert({
    org_id: (t as any).org_id,
    tumulo_id: tumuloId,
    nome,
    apelido_familiar: String(b?.apelido_familiar || "").trim() || null,
    observacoes: String(b?.observacoes || "").trim() || null,
    principal: (count || 0) === 0,
    ordem: count || 0,
    ...d.campos,
  }).select("id").maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (novo as any)?.id });
}

/** PATCH { id, … } — corrige o que se descobriu depois. */
export async function PATCH(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const id = String(b?.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, erro: "informe_a_pessoa" }, { status: 400 });

  const campos: Record<string, any> = {};
  if (b?.nome !== undefined) {
    const nome = String(b.nome || "").trim();
    if (!nome) {
      return NextResponse.json(
        { ok: false, erro: "nome_vazio", mensagem: "O nome não pode ficar em branco." },
        { status: 400 });
    }
    campos.nome = nome;
  }
  if (b?.apelido_familiar !== undefined) campos.apelido_familiar = String(b.apelido_familiar || "").trim() || null;
  if (b?.observacoes !== undefined) campos.observacoes = String(b.observacoes || "").trim() || null;

  const d = camposDeData(b);
  if ("erro" in d) return NextResponse.json({ ok: false, erro: "data_invalida", mensagem: d.erro }, { status: 400 });
  Object.assign(campos, d.campos);

  if (!Object.keys(campos).length && b?.principal === undefined) {
    return NextResponse.json(
      { ok: false, erro: "nada_para_mudar", mensagem: "Nada mudou — não havia o que salvar." },
      { status: 400 });
  }

  if (Object.keys(campos).length) {
    campos.updated_at = new Date().toISOString();
    const { error } = await auth.db.from("falecidos").update(campos).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  // TROCAR O PRINCIPAL É UMA TROCA, NÃO UMA MARCAÇÃO.
  // Dois principais no mesmo jazigo fariam o espelho `falecido_nome` depender
  // de qual linha o gatilho visse por último — o nome do jazigo mudaria
  // sozinho, sem ninguém ter mexido.
  if (b?.principal === true) {
    const { data: quem } = await auth.db
      .from("falecidos").select("tumulo_id").eq("id", id).maybeSingle();
    if (quem) {
      await auth.db.from("falecidos")
        .update({ principal: false }).eq("tumulo_id", (quem as any).tumulo_id).neq("id", id);
      await auth.db.from("falecidos").update({ principal: true }).eq("id", id);
    }
  }

  return NextResponse.json({ ok: true });
}

/** DELETE ?id=… — tirar alguém que entrou por engano. */
export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "informe_a_pessoa" }, { status: 400 });

  const { data: quem } = await auth.db
    .from("falecidos").select("id,tumulo_id,principal").eq("id", id).maybeSingle();
  if (!quem) return NextResponse.json({ ok: true });  // já não está lá

  const { error } = await auth.db.from("falecidos").delete().eq("id", id);
  if (error) {
    // A policy restritiva de DELETE é só do admin (0095): o campo cadastra,
    // mas não apaga. Sem esta frase o erro chega como código de policy.
    return NextResponse.json(
      { ok: false, erro: "sem_permissao_para_apagar",
        mensagem: "Só o administrador pode tirar uma pessoa do jazigo." },
      { status: 403 });
  }

  // O JAZIGO NÃO PODE FICAR SEM PRINCIPAL. Se saiu quem era, o próximo da fila
  // assume — senão o espelho `falecido_nome` esvazia e o jazigo perde o nome
  // em todas as telas que o leem.
  if ((quem as any).principal) {
    const { data: proximo } = await auth.db
      .from("falecidos").select("id")
      .eq("tumulo_id", (quem as any).tumulo_id)
      .order("ordem", { ascending: true }).order("created_at", { ascending: true })
      .limit(1).maybeSingle();
    if (proximo) {
      await auth.db.from("falecidos").update({ principal: true }).eq("id", (proximo as any).id);
    }
  }

  return NextResponse.json({ ok: true });
}
