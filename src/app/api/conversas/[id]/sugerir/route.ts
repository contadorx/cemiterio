import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { exigirAdmin } from "@/lib/roles";
import { env } from "@/lib/env";
import { registrarErro } from "@/lib/monitor";
import {
  acharCliente, montarContexto, carregarDadosCasa, carregarConfigIa, historicoConversa,
} from "@/lib/context";
import { montarSystemPrompt } from "@/lib/persona";
import { escolherModelo, registrarChamada } from "@/lib/modelo-ia";
import { podeChamarIa } from "@/lib/custo-ia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A IA COMO ASSISTENTE — ela escreve, quem manda é a pessoa.
 *
 * O QUE ISTO É, E O QUE NÃO É
 * ---------------------------------------------------------------------------
 * Não é o robô de volta. O robô antigo respondia sozinho, e foi desligado por
 * um bom motivo (D-12): conversa automática com família idosa e enlutada quebra
 * exatamente o que faz o cliente ficar.
 *
 * Isto é o contrário: a IA lê TODO o histórico do contato — as mensagens, os
 * jazigos, o saldo, a régua de cobrança, o que já foi combinado — e escreve uma
 * PROPOSTA no campo de texto. A Sureya lê, corrige, apaga se não prestar, e é
 * ela quem toca em enviar.
 *
 * Nada aqui grava mensagem, nada aqui chama o WhatsApp. A rota devolve texto.
 * Essa é a diferença inteira, e ela é de desenho, não de configuração.
 *
 * POR QUE VALE A PENA MESMO ASSIM
 * ---------------------------------------------------------------------------
 * O trabalho não é escrever: é lembrar. Quem responde precisa saber que esta
 * família tem dois jazigos, que a última limpeza foi há seis dias, que ela está
 * R$ 80 adiantada e que a régua dela é "suave". Isso está em cinco telas. A
 * proposta chega com tudo isso já considerado, e a pessoa gasta o minuto dela
 * corrigindo o tom em vez de abrindo abas.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  if (!env.anthropicKey()) {
    return NextResponse.json(
      { ok: false, erro: "sem_chave", mensagem: "A IA não está configurada nesta instalação." },
      { status: 503 },
    );
  }

  const b = await req.json().catch(() => ({}));
  // O QUE A PESSOA QUER DIZER, em duas palavras dela mesma. Opcional: sem isto
  // a IA responde à última mensagem da família, que é o caso comum. Com isto
  // ("explicar que só vou dia 12", "recusar com jeito"), ela escreve o que a
  // Sureya já decidiu — que é bem diferente de a IA decidir.
  const intencao = String(b?.intencao || "").trim().slice(0, 500);

  // A conversa vem pela sessão (RLS), o resto pelo admin: `montarContexto` e
  // `historicoConversa` já são escritos sobre o cliente de serviço.
  const { data: conv, error } = await auth.db
    .from("conversas")
    .select("id,cliente_id,clientes(telefone)")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!conv) return NextResponse.json({ ok: false, erro: "conversa_nao_encontrada" }, { status: 404 });

  const telefone = (conv as any).clientes?.telefone || "";
  if (!telefone) {
    return NextResponse.json(
      { ok: false, erro: "sem_contato", mensagem: "Esta conversa não tem um contato com telefone." },
      { status: 409 },
    );
  }

  const cliente = await acharCliente(telefone);
  if (!cliente) {
    return NextResponse.json(
      { ok: false, erro: "contato_nao_encontrado", mensagem: "Não achei o cadastro deste contato." },
      { status: 404 },
    );
  }

  const [ctx, casa, cfg, historico] = await Promise.all([
    montarContexto(cliente),
    carregarDadosCasa(),
    carregarConfigIa(),
    // TODO o histórico que couber, e não as últimas três: a pergunta de hoje
    // quase sempre é a continuação de uma combinação de semanas atrás, e uma
    // resposta que ignora isso obriga a família a se repetir.
    historicoConversa(params.id, 60),
  ]);

  const sistema =
    montarSystemPrompt({ ...ctx, chavePix: casa.chavePix }, cfg) +
    "\n\n== COMO VOCÊ ESTÁ SENDO USADA AGORA ==\n" +
    "Você NÃO está falando com a família. Você está escrevendo uma proposta de " +
    "resposta para a pessoa da casa ler, corrigir e enviar — ou apagar.\n" +
    "Escreva só o texto da mensagem, pronto para enviar, sem saudação de e-mail, " +
    "sem 'segue sugestão', sem aspas em volta e sem explicar suas escolhas.\n" +
    "Se faltar informação para responder com segurança (um valor, uma data, uma " +
    "decisão que é da casa), NÃO invente: escreva a mensagem até onde dá e deixe " +
    "entre colchetes o que falta, assim: [confirmar a data com a Sureya].\n" +
    (intencao
      ? `\nA pessoa da casa já decidiu o que quer dizer, e é isto: "${intencao}". ` +
        "Escreva ISSO, no tom da casa. Não proponha outra coisa."
      : "\nResponda à última mensagem da família.");

  // ==========================================================================
  // ESTA PORTA NÃO TINHA TETO (0157)
  // ==========================================================================
  //
  // `registrarChamada` era chamada aqui embaixo — a chamada ENTRAVA na conta —
  // mas `podeChamarIa` não era consultada em lugar nenhum desta rota. Era uma
  // porta para o modelo sem fechadura: o teto do dia podia estar estourado dez
  // vezes que ela continuava gastando.
  //
  // Medido em 03/09: 1.926 chamadas com propósito "atendimento" no dia, e
  // apenas 14 consultas ao teto no dia inteiro.
  const cota = await podeChamarIa();
  if (!cota.pode) {
    return NextResponse.json(
      { ok: false, erro: "teto_do_dia",
        mensagem: `A IA está pausada por hoje: ${cota.motivo}. `
                + "Escreva à mão, ou suba o teto em Configurações." },
      { status: 429 });
  }

  const escolha = await escolherModelo({
    proposito: "atendimento",
    // A escolha do modelo é a mesma do atendimento, e de propósito: quem lê a
    // proposta é a mesma pessoa, e o custo sai do mesmo lugar.
    assunto: "outro",
  });

  try {
    const anthropic = new Anthropic({ apiKey: env.anthropicKey() });
    const r = await anthropic.messages.create({
      model: escolha.modelo,
      max_tokens: 700,
      system: sistema,
      messages: historico.length
        ? historico
        : [{ role: "user", content: "(sem mensagens ainda — escreva uma primeira mensagem cordial)" }],
    });

    const texto = r.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n")
      .trim();

    // O custo é registrado como qualquer outra chamada: uma proposta que
    // ninguém envia custou dinheiro do mesmo jeito, e esconder isso do
    // relatório faria a conta do mês não fechar.
    await registrarChamada({
      escolha,
      usage: r.usage,
      clienteId: cliente.id,
      proposito: "atendimento",
      assunto: "outro",
    }).catch(() => {});

    if (!texto) {
      return NextResponse.json(
        { ok: false, erro: "sem_texto", mensagem: "A IA não devolveu nada. Tente de novo." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      texto,
      modelo: escolha.modelo,
      // Quantas mensagens ela realmente leu — para a tela poder dizer "leu as
      // 23 mensagens desta conversa" em vez de pedir fé.
      mensagensLidas: historico.length,
    });
  } catch (e: any) {
    // Falha da IA não pode virar tela quebrada: quem está respondendo continua
    // com o campo de texto e escreve à mão, que é como sempre funcionou.
    await registrarErro("sugerir_resposta", e);
    return NextResponse.json(
      { ok: false, erro: "ia_falhou", mensagem: "A IA não respondeu agora. Escreva à mão — ou tente de novo." },
      { status: 502 },
    );
  }
}
