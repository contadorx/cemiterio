import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { somaDias } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * PUXAR O DIA INTEIRO — para frente ou para trás.
 *
 * O PEDIDO
 *   "quero algo que permite antecipar individual ou puxar um dia para frente
 *    ou para traz"
 *
 * Remarcar já resolvia o caso individual. O que faltava era o dia como
 * unidade: choveu, e as quinze limpezas de terça passam para quarta. Fazer
 * isso quinze vezes, uma a uma, com a data digitada em cada linha, é o
 * trabalho que esta rota existe para tirar.
 *
 * ELA NÃO TEM MOVIMENTAÇÃO PRÓPRIA.
 *
 * Cada limpeza sai daqui pela MESMA porta do remarcar de uma linha só —
 * `sureya_remarcar_servico` —, e ganha o mesmo `fixado_em`. Escrever um
 * segundo movedor aqui daria duas regras para o mesmo ato, e elas começariam
 * iguais e terminariam discordando: é o defeito que este projeto mais repete
 * (0092, 0105, 0106, 0115).
 *
 * REPLANEJAR VEM DESLIGADO, ao contrário do remarcar de uma linha.
 *
 * Mover UMA lavagem costuma querer dizer "e as próximas deste jazigo andam
 * junto, mantendo o intervalo". Mover um DIA quer dizer "hoje choveu" — e
 * arrastar o ciclo inteiro de quinze jazigos por causa de uma chuva mudaria
 * meses de agenda sem ninguém pedir.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({}));
  const de = String(b?.de || "").slice(0, 10);
  const passo = Number(b?.dias);
  const paraPedido = String(b?.para || "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(de)) {
    return NextResponse.json({ ok: false, erro: "dia_invalido" }, { status: 400 });
  }
  const para = paraPedido || (isFinite(passo) && passo !== 0 ? somaDias(de, passo) : "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(para)) {
    return NextResponse.json({ ok: false, erro: "destino_invalido" }, { status: 400 });
  }
  if (para === de) {
    return NextResponse.json({ ok: false, erro: "mesmo_dia" }, { status: 400 });
  }

  // O QUE JÁ FOI FEITO NÃO ANDA. Uma lavagem executada tem foto, data e às
  // vezes cobrança lançada — mover a data dela seria reescrever um fato.
  const { data: doDia, error } = await db
    .from("servicos")
    .select("id,status,tumulo_id,tumulos(identificacao)")
    .eq("data_prevista", de)
    .in("status", ["pendente", "agendado"])
    .order("ordem_dia", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const { count: jaExecutadas } = await db
    .from("servicos").select("id", { count: "exact", head: true })
    .eq("data_prevista", de).eq("status", "executado");

  if (!doDia?.length) {
    return NextResponse.json({
      ok: false, erro: "dia_vazio",
      mensagem: jaExecutadas
        ? `Neste dia só há limpeza já feita (${jaExecutadas}) — e o que foi feito não muda de data.`
        : "Não há limpeza para mover neste dia.",
    }, { status: 400 });
  }

  // UMA A UMA, PELA PORTA DE SEMPRE. Sequencial e não em paralelo: são poucas
  // dezenas, e `sureya_remarcar_servico` mexe na fila do jazigo — disparar
  // quinze ao mesmo tempo é pedir para duas decidirem a mesma ordem.
  const movidos: string[] = [];
  const falhas: { jazigo: string; erro: string }[] = [];
  for (const s of doDia as any[]) {
    const { error: e } = await db.rpc("sureya_remarcar_servico", {
      p_servico: s.id,
      p_nova_data: para,
      p_replanejar: b?.replanejar === true,
      p_motivo: String(b?.motivo || "").trim() || `dia ${de} movido para ${para}`,
    });
    if (e) {
      falhas.push({ jazigo: s.tumulos?.identificacao || "sem identificação", erro: e.message });
      continue;
    }
    movidos.push(s.id);
  }

  // MOVIDO À MÃO = DECISÃO DE PESSOA, E ELA MANDA (a mesma marca da 0041).
  // Sem isto, o alocador devolveria tudo para o dia de origem na próxima
  // geração — de madrugada, em silêncio, desfazendo o trabalho dela.
  if (movidos.length) {
    await db.from("servicos")
      .update({ fixado_em: new Date().toISOString() })
      .in("id", movidos);
  }

  // O DESTINO PODE NÃO SER DIA DE TRABALHO, e pode ficar cheio. Nenhum dos
  // dois é motivo para recusar — ela sabe o que está fazendo —, mas os dois
  // são motivo para DIZER. Uma agenda que estoura em silêncio vira uma sexta
  // com trinta paradas que ninguém percebeu.
  const [{ data: cfg }, { count: noDestino }] = await Promise.all([
    db.from("orgs").select("limpezas_por_dia,dias_semana").limit(1).maybeSingle(),
    db.from("servicos").select("id", { count: "exact", head: true })
      .eq("data_prevista", para).in("status", ["pendente", "agendado", "executado"]),
  ]);
  const diasSemana: number[] = (cfg as any)?.dias_semana || [1, 2, 3, 4, 5, 6];
  const capacidade = Number((cfg as any)?.limpezas_por_dia) || 0;
  // Meio-dia UTC para o dia da semana não escorregar por fuso.
  const diaSemana = new Date(para + "T12:00:00Z").getUTCDay();

  return NextResponse.json({
    ok: true,
    de, para,
    movidos: movidos.length,
    falhas,
    naoMovidasPorJaFeitas: Number(jaExecutadas) || 0,
    diaDeTrabalho: diasSemana.includes(diaSemana),
    noDestino: Number(noDestino) || 0,
    capacidade,
    estourou: capacidade > 0 && Number(noDestino) > capacidade,
  });
}
