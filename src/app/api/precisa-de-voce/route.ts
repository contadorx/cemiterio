import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PRECISA DE VOCÊ — as filas do dia num lugar só.
 *
 * O QUE ESTAVA ERRADO
 *
 * A tela inicial mostra o mês: quem falta limpar, quem falta pagar. Tudo o
 * mais que espera decisão dela vive atrás de um item de menu — mensagem pronta
 * na fila, comprovante para conferir, família esperando resposta, contato do
 * site. Nenhum deles tem marcador no menu. Dá para encerrar o dia olhando uma
 * tela verde com quatro mensagens paradas na fila de liberação.
 *
 * A auditoria chamou isso de CA-01. Esta rota é o conserto.
 *
 * CADA NÚMERO VEM DA MESMA REGRA DA TELA PARA ONDE ELE APONTA.
 *
 * Isto não é zelo: é o defeito que este projeto mais repete. Duas contas sobre
 * os mesmos fatos começam iguais e terminam discordando — já aconteceu na
 * agenda (0092), no painel (0105) e na lista de famílias (0106). Aqui:
 *
 *   conversas       `sureya_contadores_conversas()`, a MESMA função que a aba
 *                   "Precisam de você" usa. Não é uma segunda contagem.
 *   liberação       `status='aguardando'` mais o filtro de adiada de /api/fila.
 *                   Contar as adiadas daria "4 esperando" com a lista vazia.
 *   comprovantes    `status='a_conferir'`, o que a tela do Financeiro lista.
 *   contatos        a mesma view `sureya_contatos_pendentes` de /api/contatos.
 *
 * O QUE É DE HOJE E O QUE É DE QUANDO DER
 *
 * As quatro filas acima têm relógio correndo: alguém do outro lado espera.
 * Cadastro incompleto — 122 famílias sem jazigo nenhum — é trabalho de verdade,
 * mas é trabalho de sempre. Número que não se mexe há meses vira moldura, e
 * moldura ninguém lê. Por isso ele vem separado, e a tela o trata como recado,
 * não como alarme.
 */
/** RPC que devolve uma linha só chega ora como objeto, ora como array de um. */
function linhaUnica(d: any): any {
  return (Array.isArray(d) ? d[0] : d) || null;
}

function contarSemJazigo(linhas: any[] | null | undefined): number | null {
  const l = linhas || [];
  if (!l.length) return 0;
  if (!l.some((f) => Array.isArray(f?.tumulos))) return null;
  return l.filter((f) => !(f.tumulos || []).length).length;
}

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const hoje = diaOperacao();

  const [conv, fila, comp, contatos, semJazigo, lavagens] = await Promise.all([
    db.rpc("sureya_contadores_conversas"),

    db.from("fila_liberacao").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("status", "aguardando")
      .or(`adiada_para.is.null,adiada_para.lte.${hoje}`),

    db.from("comprovantes").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("status", "a_conferir"),

    db.from("sureya_contatos_pendentes").select("id", { count: "exact", head: true })
      .eq("org_id", org),

    // MESMA REGRA DO SELO "sem jazigo" DA TELA INICIAL: família com zero
    // túmulos (`meus.length === 0` em /api/mes). Contar por outro caminho —
    // total de famílias menos as que aparecem em `tumulos`, por exemplo —
    // seria uma segunda conta sobre o mesmo fato, e é assim que os números
    // começam iguais e terminam discordando.
    db.from("familias").select("id,tumulos(id)").eq("org_id", org).limit(2000),

    // TRABALHO FEITO QUE NÃO DEIXOU MARCA (0137). Mesma função da tela de
    // manutenção — não é uma segunda contagem.
    db.rpc("sureya_lavagens_incompletas_resumo", { p_org: org }),
  ]);

  // UMA FILA QUE NÃO RESPONDEU NÃO VALE ZERO.
  //
  // É o mesmo "vazio não é zero" da tela, agora do lado do servidor: se a
  // consulta dos comprovantes falhar e eu devolver 0, a tela mostra "nada para
  // conferir" com um comprovante esperando. Fila que não respondeu vem `null`,
  // e a tela diz que não soube.
  const n = (r: any) => (r?.error ? null : (r?.count ?? 0));

  const contadores = linhaUnica(conv?.data);

  return NextResponse.json({
    ok: true,
    agora: {
      // "pendentes" é o número da aba "Precisam de você" de Conversas, inteiro:
      // rascunho da IA, escalada, caixa da equipe e família sem resposta.
      conversas: conv?.error ? null : (contadores?.pendentes ?? 0),
      liberacao: n(fila),
      comprovantes: n(comp),
      contatos: n(contatos),
    },
    quandoDer: {
      // A GUARDA CONTRA O ZERO SILENCIOSO NO OUTRO SENTIDO.
      //
      // `!(f.tumulos || []).length` conta como "sem jazigo" tanto a família que
      // realmente não tem um quanto a família cujo `tumulos` não veio na
      // resposta. Se o embed mudar de nome ou a permissão de leitura fechar,
      // todas as 363 apareceriam como cadastro pela metade — número errado com
      // cara de medição. Se NENHUMA linha trouxe a chave, eu não sei: `null`.
      semJazigo: semJazigo?.error ? null : contarSemJazigo(semJazigo?.data),

      // LAVAGEM FEITA PELA METADE — sem preço, sem material, sem o pagamento
      // da equipe. É trabalho já entregue, então não tem relógio correndo: fica
      // aqui embaixo, junto com o cadastro incompleto.
      //
      // `semRegraEquipe` é OUTRA coisa, e por isso vem separado: não é uma
      // lavagem defeituosa, é uma configuração que falta. Enquanto a casa não
      // tiver regra de pagamento nenhuma, nenhuma lavagem é acusada de
      // "pagamento não calculado" — não há com o que calcular.
      lavagens: lavagens?.error ? null : {
        incompletas: (linhaUnica(lavagens?.data) as any)?.quantas ?? 0,
        semPreco: (linhaUnica(lavagens?.data) as any)?.sem_preco ?? 0,
        semRegraEquipe: !!(linhaUnica(lavagens?.data) as any)?.sem_regra_equipe,
      },
    },
  });
}
