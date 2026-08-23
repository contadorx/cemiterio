import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { normalizarMMDD } from "@/lib/memoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { identificacao?, rua?, numero?, quadra_id?, cliente_id?, observacoes?,
//         falecido_nome?, data_falecimento? ('MM-DD' ou 'AAAA-MM-DD'), data_nascimento?,
//         limparFoto?: 'lapide'|'longe'|'ambas', limparGps?: boolean }
/**
 * A FICHA DO JAZIGO.
 *
 * Não existia: `/painel/jazigos` era uma lista e acabava ali. Tudo o que o
 * sistema sabe de um túmulo estava espalhado — a urgência numa view, o roteiro
 * na agenda, o histórico nos serviços, as pendências em lugar nenhum.
 *
 * A ficha é onde isso aterrissa. E o bloco de PENDÊNCIAS é o que a torna
 * ferramenta em vez de relatório: é ali que "sem posição na rua" deixa de ser
 * uma estatística e vira uma coisa que alguém resolve.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const [{ data: t }, { data: urg }, { data: servs }] = await Promise.all([
    db.from("tumulos")
      .select("id,identificacao,numero,falecido_nome,rua,rua_id,ordem_na_rua,observacoes,"
            + "contratado,periodicidade,valor_lavagem,lat,lng,gps_precisao,"
            + "foto_referencia_url,foto_enquadramento_url,ultima_lavagem_informada,"
            + "cliente_id,familia_id,quadras(codigo),familias(nome,contratado,inicio_cobranca),"
            + "clientes(nome,telefone)")
      .eq("id", params.id).maybeSingle(),
    db.from("sureya_urgencia_jazigos")
      .select("idade_dias,urgencia,situacao,ultima_lavagem,origem_da_idade,vence_em,intervalo_dias")
      .eq("tumulo_id", params.id).maybeSingle(),
    db.from("servicos")
      .select("id,status,data_prevista,data_executada,ordem_dia,valor,foto_antes_url,foto_depois_url")
      .eq("tumulo_id", params.id)
      .order("data_prevista", { ascending: false })
      .limit(30),
  ]);

  if (!t) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  const tt = t as any;
  const historico = ((servs || []) as any[]).filter((s) => s.data_executada);
  const agendado = ((servs || []) as any[])
    .find((s) => !s.data_executada && s.status !== "cancelado") || null;

  // AS PENDÊNCIAS SÃO O PONTO DA FICHA.
  // Cada uma é uma coisa que alguém faz, não um aviso para conviver com ele.
  const pendencias: { o_que: string; porque: string }[] = [];
  if (!tt.rua_id) {
    pendencias.push({ o_que: "sem rua",
      porque: "fica fora do roteiro do dia — a pessoa de campo só descobre andando" });
  }
  if (tt.ordem_na_rua == null) {
    pendencias.push({ o_que: "sem posição dentro da rua",
      porque: "vai para o fim da própria rua em ordem qualquer, e é isso que faz a caminhada dar voltas" });
  }
  if (!tt.foto_referencia_url && !tt.foto_enquadramento_url) {
    pendencias.push({ o_que: "sem foto",
      porque: "quem chega no lugar não tem como confirmar que é este túmulo" });
  }
  if (tt.lat == null || tt.lng == null) {
    pendencias.push({ o_que: "sem localização",
      porque: "não dá para traçar o caminho até ele" });
  }
  if (tt.contratado && !tt.periodicidade) {
    pendencias.push({ o_que: "contratado sem periodicidade",
      porque: "sem intervalo não há urgência: ele nunca entra na fila por vencimento" });
  }
  if (tt.contratado && !(Number(tt.valor_lavagem) > 0)) {
    pendencias.push({ o_que: "sem valor de limpeza",
      porque: "a conclusão da lavagem não sabe quanto cobrar" });
  }
  if (!tt.cliente_id) {
    pendencias.push({ o_que: "sem família",
      porque: "cadastrado no campo e ainda não ligado a ninguém — não gera cobrança" });
  }

  return NextResponse.json({
    ok: true,
    jazigo: {
      id: tt.id,
      identificacao: tt.identificacao,
      numero: tt.numero,
      falecido: tt.falecido_nome,
      quadra: tt.quadras?.codigo || null,
      rua: tt.rua,
      ordemNaRua: tt.ordem_na_rua,
      observacoes: tt.observacoes,
      contratado: !!tt.contratado,
      periodicidade: tt.periodicidade,
      valorLavagem: tt.valor_lavagem,
      fotoReferencia: tt.foto_referencia_url,
      fotoEnquadramento: tt.foto_enquadramento_url,
      temGps: tt.lat != null && tt.lng != null,
      ultimaLavagemInformada: tt.ultima_lavagem_informada,
      familia: tt.familias?.nome || null,
      familiaId: tt.familia_id,
      responsavel: tt.clientes?.nome || null,
      telefone: tt.clientes?.telefone || null,
    },
    urgencia: urg || null,
    agendado,
    historico,
    pendencias,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  for (const c of ["identificacao", "rua", "quadra_id", "numero", "observacoes"]) {
    // === "" e não `||`: "0" é um número de jazigo válido e não pode virar null
    if (body[c] !== undefined) patch[c] = body[c] === "" || body[c] === null ? null : body[c];
  }
  // MUDOU DE RUA: o vínculo tem de mudar junto com o texto.
  //
  // `rua` é texto legível; `rua_id` é o que o roteiro usa para ordenar o dia.
  // Gravar só o texto deixaria o túmulo apontando para a rua antiga — ele
  // apareceria escrito "Rua 5" e continuaria sendo percorrido na Rua 2.
  if (body.rua !== undefined && body.rua) {
    const quadraAlvo = body.quadra_id || (
      await db.from("tumulos").select("quadra_id").eq("id", params.id).maybeSingle()
    ).data?.quadra_id;

    if (quadraAlvo) {
      const { data: r } = await db
        .from("ruas").select("id")
        .eq("quadra_id", quadraAlvo).eq("nome", body.rua).maybeSingle();

      if (!r) {
        const { data: disp } = await db
          .from("ruas").select("nome").eq("quadra_id", quadraAlvo).order("ordem");
        return NextResponse.json({
          ok: false,
          erro: "rua_nao_existe",
          mensagem: `A rua "${body.rua}" não existe nesta quadra.`,
          ruas: (disp || []).map((x: any) => x.nome),
        }, { status: 400 });
      }
      patch.rua_id = (r as any).id;
      // A posição vira nula: o túmulo entrou numa rua nova e não tem lugar
      // definido nela. Vai para o fim até a Sureya arrastar — melhor do que
      // herdar uma posição que pertencia a outra rua.
      patch.ordem_na_rua = null;
    }
  }

  // O QUE É DO TÚMULO: o trabalho. O contrato é da família.
  //
  // `valor_lavagem`, `valor_base`, `freq_pagamento` e `inicio_cobranca` ainda
  // existem como colunas — são o histórico de quando o plano morava aqui —,
  // mas o PATCH NÃO os aceita mais.
  //
  // Se aceitasse, a duplicação voltaria pela porta dos fundos: alguém gravaria
  // um valor no túmulo, nada seria cobrado (a cobrança lê a família) e o
  // número ficaria na tela mentindo. Melhor recusar em silêncio que guardar
  // um dado que ninguém lê.
  if (body.periodicidade !== undefined) {
    patch.periodicidade = body.periodicidade || null;
    // Mudou o ritmo: o ponteiro da agenda volta para hoje. Sem isso, trocar de
    // mensal para semanal não teria efeito até o ponteiro antigo vencer — a
    // Sureya faria a troca e não veria diferença por semanas.
    patch.proximo_servico = new Date().toISOString().slice(0, 10);
  }
  if (body.contratado !== undefined) patch.contratado = !!body.contratado;

  // vincular/desvincular o jazigo a uma família
  if (body.familia_id !== undefined) patch.familia_id = body.familia_id || null;

  // A FAMÍLIA ACOMPANHA A PESSOA.
  //
  // A tela Jazigos troca a família escolhendo o cliente, e mandava só
  // `cliente_id`. O túmulo ficava com `familia_id` nulo — e como a conta
  // corrente e a tela do mês penduram na FAMÍLIA, ele sumia de novo. É o mesmo
  // erro que já corrigi no vínculo pela ficha, chegando por outra porta.
  //
  // Derivar aqui fecha as duas portas de uma vez: qualquer caminho que mude o
  // dono acerta a família junto.
  if (body.cliente_id !== undefined) {
    patch.cliente_id = body.cliente_id || null;
    if (body.cliente_id && body.familia_id === undefined) {
      const { data: pessoa } = await db
        .from("clientes").select("familia_id").eq("id", body.cliente_id).maybeSingle();
      patch.familia_id = (pessoa as any)?.familia_id ?? null;
    } else if (!body.cliente_id && body.familia_id === undefined) {
      // desvinculou a pessoa: o túmulo volta a ser órfão de verdade, e não
      // meio-órfão com família de um dono que já saiu.
      patch.familia_id = null;
    }
  }
  if (body.falecido_nome !== undefined) patch.falecido_nome = body.falecido_nome || null;

  if (body.data_falecimento !== undefined || body.data_nascimento !== undefined) {
    const datas: { tipo: string; data: string }[] = [];
    for (const [campo, tipo] of [["data_falecimento", "falecimento"], ["data_nascimento", "nascimento"]]) {
      if (!body[campo]) continue;
      const d = normalizarMMDD(body[campo]);
      if (!d) {
        return NextResponse.json(
          { ok: false, erro: `data de ${tipo} não entendida — use MM-DD (ex.: 07-23)` },
          { status: 400 },
        );
      }
      datas.push({ tipo, data: d });
    }
    patch.datas_gatilho = datas;
  }

  // Apagar a foto que entrou no jazigo errado. A imagem em si fica no storage
  // (barato e reversivel); o que sai e o vinculo — que e o que engana quem olha.
  const limparFoto = body.limparFoto; // "lapide" | "longe" | "ambas"
  if (limparFoto === "lapide" || limparFoto === "ambas") patch.foto_referencia_url = null;
  if (limparFoto === "longe" || limparFoto === "ambas") patch.foto_enquadramento_url = null;

  // Apagar a posicao. Um ponto errado no mapa e pior que ponto nenhum: o ponto
  // errado leva a ajudante ate o tumulo do vizinho com cara de certeza.
  if (body.limparGps) {
    patch.lat = null;
    patch.lng = null;
    patch.gps_precisao = null;
    patch.gps_amostras = 0;
    patch.gps_atualizado_em = null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }

  // Numero repetido na mesma quadra foi o que fundiu dois tumulos numa linha so.
  // Nao vou deixar a tela de correcao recriar o problema que ela veio consertar.
  if (patch.identificacao !== undefined || patch.quadra_id !== undefined) {
    const { data: atual } = await db
      .from("tumulos").select("id,quadra_id,identificacao").eq("id", params.id).maybeSingle();
    const quadra = patch.quadra_id ?? (atual as any)?.quadra_id;
    const ident = String(patch.identificacao ?? (atual as any)?.identificacao ?? "").trim().toLowerCase();
    if (quadra && ident) {
      const { data: vizinhos } = await db
        .from("tumulos").select("id,identificacao").eq("quadra_id", quadra).limit(300);
      const bate = ((vizinhos as any[]) || []).find(
        (t) => t.id !== params.id && String(t.identificacao || "").trim().toLowerCase() === ident,
      );
      if (bate) {
        return NextResponse.json(
          { ok: false, erro: "identificacao_em_uso",
            mensagem: `Ja existe outro jazigo com o numero ${patch.identificacao ?? ident} nesta quadra. Dois com o mesmo numero e exatamente o que embaralhou foto e descricao — use um numero que separe os dois (ex.: "12-A" e "12-B").` },
          { status: 409 },
        );
      }
    }
  }

  const { error } = await db.from("tumulos").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // as leituras individuais mantem a media viva; limpar o GPS sem elas nao limpa
  if (body.limparGps) await db.from("gps_leituras").delete().eq("tumulo_id", params.id);

  return NextResponse.json({ ok: true });
}


// DELETE — remove o jazigo. Bloqueia se já houver limpeza executada,
// para não apagar o histórico que a família vê no portal.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { count } = await db
    .from("servicos").select("id", { count: "exact", head: true })
    .eq("tumulo_id", params.id).eq("status", "executado");
  if ((count || 0) > 0) {
    return NextResponse.json(
      { ok: false, erro: "tem_historico",
        mensagem: `Este jazigo já tem ${count} limpeza(s) registrada(s). Em vez de excluir, desative o plano — o histórico e as fotos da família são preservados.` },
      { status: 400 }
    );
  }

  await db.from("servicos").delete().eq("tumulo_id", params.id);
  await db.from("planos").delete().eq("tumulo_id", params.id);
  await db.from("gps_leituras").delete().eq("tumulo_id", params.id);
  const { error } = await db.from("tumulos").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
