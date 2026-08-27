import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { auditar } from "@/lib/auditoria";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LAVAGEM FEITA QUE NÃO DEIXOU MARCA — ver, e consertar com um toque.
 *
 * O QUE FALTA EM CADA UMA
 *
 *   preço      `servicos.valor`. É o preço CONGELADO da lavagem — o histórico
 *              da família mostra "limpeza" sem número nenhum.
 *   material   `custo_estimado`. O sabão saiu do balde e não saiu do estoque.
 *   pagamento  `valor_executora`. O trabalho foi feito e ninguém sabe quanto
 *              a Nina ganhou por ele.
 *   foto       linha em `fila_liberacao`. Só conta quando a foto EXISTE.
 *
 * QUEM CONSERTA É A PRÓPRIA TRANSAÇÃO DA CONCLUSÃO.
 *
 * `sureya_concluir_lavagem` (0066) foi escrita para ser chamada duas vezes: ao
 * ver um serviço já `executado` ela não refaz a transição — ela CONFERE os
 * efeitos e devolve, em `reparos`, o que estava faltando e ela carimbou agora.
 * Chamar de novo é o conserto. Escrever aqui um segundo cálculo de valor e de
 * remuneração seria a quinta implementação da mesma regra, e é exatamente
 * assim que dois números sobre o mesmo fato começam iguais e terminam
 * discordando (0092, 0105, 0106, 0115).
 *
 * A FOTO ANTIGA NÃO ENTRA NA FILA POR CONSERTO.
 *
 * `p_foto_depois` vai NULO de propósito, mesmo quando a lavagem tem foto. Com
 * a foto, a transação criaria a linha na fila — e uma foto de 3 de agosto
 * aparecendo na fila hoje é uma decisão da Sureya, não efeito colateral de um
 * botão de manutenção. Nada sai sozinho de qualquer jeito (a fila espera o
 * toque dela), mas botão de consertar número não mexe no que vai ser dito à
 * família. Ela manda a foto antiga pela tela de sempre, se quiser.
 *
 * Passar nulo não apaga nada: o `coalesce(p_foto_depois, foto_depois_url)` da
 * transação só roda no ramo de quem AINDA NÃO estava executado.
 *
 * GET  lista. Não escreve.
 * POST conserta. Sem palavra de confirmação: aqui nada se perde — a operação
 *      só preenche o que estava vazio, e repetir não muda o resultado.
 */

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const [lista, resumo] = await Promise.all([
    db.rpc("sureya_lavagens_incompletas", { p_org: org }),
    db.rpc("sureya_lavagens_incompletas_resumo", { p_org: org }),
  ]);

  if (lista.error) {
    return NextResponse.json({ ok: false, erro: lista.error.message }, { status: 500 });
  }

  const r = (Array.isArray(resumo.data) ? resumo.data[0] : resumo.data) || null;

  return NextResponse.json({
    ok: true,
    lavagens: lista.data || [],
    // NÃO SOUBE ≠ ESTÁ TUDO CERTO. Resumo que falhou vem nulo, e a tela diz
    // que não conseguiu ler — não diz que está em dia.
    resumo: resumo.error ? null : r,
  });
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));

  // Um id conserta uma; sem id, conserta todas as que a lista apontar.
  const um = String(b?.servicoId || "").trim();

  const { data: lista, error: eLista } =
    await db.rpc("sureya_lavagens_incompletas", { p_org: org });
  if (eLista) {
    return NextResponse.json({ ok: false, erro: eLista.message }, { status: 500 });
  }

  const alvo = (lista || []).filter((l: any) => !um || l.servico_id === um);
  if (um && !alvo.length) {
    return NextResponse.json(
      { ok: false, erro: "nao_esta_na_lista",
        mensagem: "Esta limpeza não está incompleta — nada a consertar." },
      { status: 400 });
  }

  const consertadas: { servicoId: string; reparos: string[] }[] = [];
  const falharam: { servicoId: string; erro: string }[] = [];

  for (const l of alvo) {
    const { data, error } = await db.rpc("sureya_concluir_lavagem", {
      p_servico: l.servico_id,
      p_foto_depois: null,      // ver o comentário grande acima
    });
    if (error) {
      falharam.push({ servicoId: l.servico_id, erro: error.message });
      continue;
    }
    const linha = (Array.isArray(data) ? data[0] : data) || {};
    consertadas.push({ servicoId: l.servico_id, reparos: (linha as any)?.reparos || [] });
  }

  // O QUE SOBROU DEPOIS DO CONSERTO.
  //
  // Relido do banco, não deduzido do laço: a transação pode ter deixado algo em
  // aberto de propósito — sem regra de remuneração cadastrada ela não carimba
  // pagamento nenhum, e dizer "consertei 2" sem dizer que 2 continuam na lista
  // seria anunciar um resultado que não aconteceu.
  const { data: sobrou } = await db.rpc("sureya_lavagens_incompletas", { p_org: org });

  await auditar(db, org, auth.userId || null, "lavagens_incompletas_reparadas",
    { tipo: "servicos" },
    {
      pedidas: alvo.length,
      consertadas: consertadas.length,
      falharam: falharam.length,
      ainda_incompletas: (sobrou || []).length,
      ids: consertadas.map((c) => c.servicoId),
    });

  return NextResponse.json({
    ok: true,
    consertadas,
    falharam,
    aindaIncompletas: (sobrou || []).length,
  });
}
