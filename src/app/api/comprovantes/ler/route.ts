import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { extrairComprovante, decidirLeitura } from "@/lib/comprovante";
import { podeChamarIa } from "@/lib/custo-ia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * LER O COMPROVANTE — a análise que só existia pelo WhatsApp.
 *
 * O QUE FOI PEDIDO
 *   "que volte a analise do comprovante pelo whats, esse comprovante por
 *    exemplo é da familia da josiane e ela mandou por whats"
 *
 * O QUE ESTAVA ACONTECENDO
 *
 * A leitura por IA nunca saiu do código: `atendimento.ts` chama
 * `extrairComprovante` para qualquer imagem que chega de um número conhecido.
 * O problema é que ela tinha UMA PORTA SÓ, e essa porta ficou fechada dezenove
 * dias (04/08 a 22/08, medido em `eventos_webhook`). Comprovante que a família
 * mandou nesse período não foi lido por ninguém.
 *
 * E quando a Sureya anexava a foto à mão pela ficha, `/anexar` guardava a
 * imagem e mais nada: valor e data ela digitava, olhando o print. A leitura
 * automática — a parte que economiza o trabalho — não valia para o caminho
 * manual.
 *
 * Agora a mesma função lê pelas duas portas. Esta rota é a porta da mão.
 *
 * ELA NÃO GRAVA NADA. Só lê e devolve o que leu, para a tela preencher os
 * campos e a Sureya CONFERIR antes de lançar. Comprovante lido por robô não é
 * dinheiro até uma pessoa olhar — a mesma regra que `a_conferir` já aplicava no
 * caminho do WhatsApp.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const base64 = String(b?.imagemBase64 || "");
  if (!base64) {
    return NextResponse.json({ ok: false, erro: "imagem_obrigatoria" }, { status: 400 });
  }

  // O MESMO TETO DIÁRIO DO ATENDIMENTO. Sem isto, um dedo preso no botão de
  // anexar sairia mais caro que um mês inteiro de conversas.
  const custo = await podeChamarIa();
  if (!custo.pode) {
    return NextResponse.json({
      ok: true,
      leu: false,
      motivo: "teto_ia",
      mensagem: `O teto de IA do dia foi atingido (${custo.usadas}/${custo.teto}). Digite o valor e a data à mão — o comprovante é anexado do mesmo jeito.`,
    });
  }

  const limpo = base64.replace(/^data:[^;]+;base64,/, "");
  const mimetype = String(b?.mimetype || "image/jpeg");

  try {
    const dados = await extrairComprovante({ base64: limpo, mimetype });

    // A MESMA REGRA DO CAMINHO DO WHATSAPP, e não uma segunda cópia dela:
    // `decidirLeitura` mora em `comprovante.ts` e serve as duas portas.
    const leitura = decidirLeitura(dados);

    return NextResponse.json({
      ok: true,
      leu: leitura.confiavel,
      ehComprovante: dados.eh_comprovante,
      confianca: dados.confianca,
      valor: leitura.valor,
      data: leitura.data,
      idTransacao: leitura.idTransacao,
      mensagem: leitura.mensagem,
    });
  } catch (e: any) {
    // A LEITURA FALHAR NÃO PODE IMPEDIR O LANÇAMENTO. Se a IA está fora do ar,
    // a Sureya digita — o dinheiro entrou na conta dela do mesmo jeito.
    return NextResponse.json({
      ok: true,
      leu: false,
      motivo: "falha",
      mensagem: "Não consegui ler a imagem agora. Digite o valor e a data à mão.",
      detalhe: String(e?.message || e),
    });
  }
}
