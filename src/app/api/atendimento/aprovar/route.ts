import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { enviarWhatsapp } from "@/lib/evolution";
import { anotarCompromisso } from "@/lib/atendimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corpo: { interacaoId, acao: 'aprovou'|'editou'|'descartou', textoFinal? }
// - aprovou  -> envia o rascunho como está
// - editou   -> envia o textoFinal (rascunho corrigido)
// - descartou-> não envia nada
// Em todos os casos o score do contato é atualizado pela RPC (respeita RLS: humano logado).
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const interacaoId: string = body?.interacaoId;
  const acao: string = body?.acao;
  const textoFinal: string | undefined = body?.textoFinal;

  if (!interacaoId || !["aprovou", "editou", "descartou"].includes(acao)) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  // Carrega a interação (RLS garante que é da org do usuário).
  const { data: inter } = await db
    .from("interacoes_ia")
    .select("id,org_id,cliente_id,conversa_id,rascunho,prometeu_voltar,promessa_sobre")
    .eq("id", interacaoId)
    .maybeSingle();
  if (!inter) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  // ==========================================================================
  // VAI O QUE ESTÁ NA TELA — NUNCA O QUE ESTÁ NO BANCO
  // ==========================================================================
  //
  // O QUE ACONTECEU EM 29/08, COM A JOSEFINA
  //
  //   09:10  a IA rascunha uma resposta sobre luto ("Sinto muito pela sua mãe")
  //   12:35  a família volta e pergunta OUTRA coisa: "Qual valor", "quando vc
  //          poderia vir"
  //   16:59  o rascunho das 9h é enviado, palavra por palavra
  //
  // Ele tinha reescrito o texto na caixa e clicado em "Aprovar e enviar". Este
  // ramo ignorava a caixa e mandava `inter.rascunho` — o texto de OITO HORAS
  // antes, respondendo um assunto que já tinha passado. `texto_final` ficou
  // null: a edição não chegou nem a ser gravada.
  //
  // Dois botões que dizem "enviar", com uma caixa editável entre eles, e só um
  // deles olhando para a caixa. A tela agora tem UMA caixa e UM envio — mas a
  // trava fica aqui também, porque tela conserta o caminho de hoje e a rota
  // conserta todos os outros.
  //
  // A REGRA: se veio texto, é ele que vai. `acao` continua descrevendo o que a
  // pessoa fez (para o score saber se a IA acertou), e passa a ser DEDUZIDA do
  // texto em vez de acreditada — quem manda um texto diferente do rascunho
  // editou, tenha clicado no botão que tiver.
  const veio = (textoFinal ?? "").trim();
  const rascunhoOriginal = String((inter as any).rascunho || "").trim();
  const textoParaEnviar = veio || rascunhoOriginal;
  const acaoReal = acao === "descartou"
    ? "descartou"
    : veio && veio !== rascunhoOriginal ? "editou" : "aprovou";

  if (acaoReal !== "descartou") {
    if (!textoParaEnviar)
      return NextResponse.json({ ok: false, erro: "texto_vazio" }, { status: 400 });

    // telefone do cliente
    const { data: cli } = await db
      .from("clientes")
      .select("telefone")
      .eq("id", (inter as any).cliente_id)
      .single();

    await enviarWhatsapp((cli as any).telefone, textoParaEnviar);

    // registra a saída na conversa
    await db.from("mensagens").insert({
      org_id: (inter as any).org_id,
      conversa_id: (inter as any).conversa_id,
      cliente_id: (inter as any).cliente_id,
      direcao: "saida",
      autor: "humano",
      texto: textoParaEnviar,
    });

    // ======================================================================
    // A PROMESSA VIRA COMPROMISSO — só agora, porque só agora ela existe
    // ======================================================================
    //
    // Medido em 29/08: 11 das 25 respostas a famílias prometiam voltar, e
    // nenhuma deixava registro. A família esperava um retorno que ninguém
    // sabia que devia.
    //
    // NASCE NO ENVIO, NÃO NO RASCUNHO. Rascunho descartado não prometeu nada a
    // ninguém — anotar na hora de rascunhar encheria a lista de dívidas que a
    // família nunca ouviu.
    await anotarCompromisso({
      org: (inter as any).org_id,
      clienteId: (inter as any).cliente_id,
      conversaId: (inter as any).conversa_id || null,
      saida: {
        prometeu_voltar: !!(inter as any).prometeu_voltar,
        promessa_sobre: (inter as any).promessa_sobre || "",
      },
      texto: textoParaEnviar,
    });
  }

  // Move o score e fecha a interação.
  const { data: novoScore, error } = await db.rpc("sureya_registrar_acao_ia", {
    p_interacao: interacaoId,
    p_acao: acaoReal,
    p_texto_final: acaoReal === "editou" ? textoParaEnviar : null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, enviado: acaoReal !== "descartou", score: novoScore });
}
