import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { diaOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A AGENDA DO PERIODO, DO JEITO QUE ELA E LIDA.
 *
 * O QUE FALTAVA AQUI
 * ---------------------------------------------------------------------------
 * A rota devolvia jazigo, quadra, contato e valor. Na tela isso virava
 * "Q Quadra 1 · Perrela · Maria · R$ 40" — e quem le a agenda para montar o
 * dia precisa saber de que FAMILIA e a lavagem e em que RUA ela fica, que sao
 * exatamente as duas coisas que nao vinham.
 *
 * A familia importa porque desde a 0091 ela e a entidade: o contato pode nao
 * existir, ou ser outro no ano que vem. Uma agenda que so mostra o contato
 * mostra o que muda e esconde o que fica.
 *
 * A rua importa porque a ordem do dia sai dela (0047). Sem a rua na tela, a
 * sequencia parece arbitraria: nao da para ver que 1º, 2º e 3º sao a mesma
 * caminhada.
 *
 * `atrasoDias` compara `data_plano` (a data teorica, congelada) com o dia em
 * que a lavagem esta marcada. E o unico numero que denuncia a lavagem que foi
 * empurrada — e que, sem ele, so aparece quando a familia reclama.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const q = req.nextUrl.searchParams;
  const inicio = q.get("inicio") || diaOperacao();
  // quantos dias mostrar: 1, 3, 7, 14, 30… ou um período com data final própria
  const dias = Math.max(1, Math.min(180, Number(q.get("dias")) || 14));
  const fim = q.get("fim") || new Date(new Date(inicio + "T00:00:00").getTime() + (dias - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await db
    .from("servicos")
    .select(
      "id,data_prevista,data_plano,ordem_dia,status,valor,estornado_em,motivo_estorno," +
      "fixado_em,executora_id,tumulo_id,origem,data_desejada," +
      "tumulos(identificacao,falecido_nome,quadras(codigo),ruas(nome),familias(nome))," +
      "clientes(nome)",
    )
    .gte("data_prevista", inicio)
    .lte("data_prevista", fim)
    // cancelada some da agenda, MENOS quando foi estorno: aí precisa aparecer
    // com a marca, para o erro e a correção ficarem visíveis
    .or("status.neq.cancelado,estornado_em.not.is.null")
    .order("data_prevista", { ascending: true })
    .order("ordem_dia", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const diaDe = (iso: string) => new Date(iso + "T12:00:00Z").getTime();

  // ---------------------------------------------------------------------
  // QUANDO ESTE JAZIGO FOI LAVADO PELA ÚLTIMA VEZ (0093)
  //
  // É a pergunta que decide se uma lavagem marcada ainda faz sentido. Sem
  // ela, a agenda diz "lavar o Perrela na terça" e não diz que o Perrela foi
  // lavado na sexta — e quem monta o dia não tem como pular nada com
  // segurança.
  //
  // A view já desconta as estornadas e já diz se a lavagem passou pelo botão
  // "Começar" do aplicativo de campo.
  // ---------------------------------------------------------------------
  const idsJazigo = [...new Set((data || []).map((s: any) => s.tumulo_id).filter(Boolean))];
  const { data: lavagens } = idsJazigo.length
    ? await db
        .from("sureya_ultima_lavagem_jazigo")
        .select("tumulo_id,dia,executora,no_campo")
        .in("tumulo_id", idsJazigo)
    : { data: [] as any[] };
  const ultimaDe = new Map(((lavagens as any[]) || []).map((l) => [l.tumulo_id, l]));

  // ---------------------------------------------------------------------
  // E QUANDO É A PRÓXIMA (0125)
  //
  // A linha já dizia há quantos dias o jazigo não é lavado. Faltava o outro
  // lado: quando vem a seguinte. Com os dois na frente, a decisão de PULAR ou
  // EXCLUIR deixa de ser um chute —
  //
  //   "não lavo há 40 dias e a próxima é só em setembro"  -> não pule
  //   "lavei anteontem e tem outra na quinta"             -> pode pular
  //
  // Uma consulta em lote para todos os jazigos da janela, e não uma por linha:
  // com quarenta paradas por dia, uma por linha seriam quarenta idas ao banco
  // para desenhar um pedaço de texto.
  // ---------------------------------------------------------------------
  const { data: futuras } = idsJazigo.length
    ? await db
        .from("servicos")
        // Sem filtro de org: esta rota usa a sessão do painel, e a RLS já
        // limita tudo à organização de quem está logado — como as consultas
        // acima. Filtrar aqui e não ali seriam duas opiniões sobre o mesmo.
        .select("tumulo_id,data_prevista")
        .in("tumulo_id", idsJazigo)
        .in("status", ["pendente", "agendado"])
        .gt("data_prevista", inicio)
        .order("data_prevista", { ascending: true })
    : { data: [] as any[] };

  /** jazigo -> todas as datas futuras, em ordem. */
  const futurasDe = new Map<string, string[]>();
  for (const f of ((futuras as any[]) || [])) {
    const arr = futurasDe.get(f.tumulo_id) || [];
    arr.push(f.data_prevista);
    futurasDe.set(f.tumulo_id, arr);
  }
  /** A primeira DEPOIS deste dia — e não a primeira da lista, que pode ser esta mesma. */
  const proximaDepoisDe = (tumuloId: string | null, dia: string) => {
    if (!tumuloId) return null;
    return (futurasDe.get(tumuloId) || []).find((x) => x > dia) || null;
  };

  const porDia: Record<string, any[]> = {};
  for (const s of data || []) {
    const d = (s as any).data_prevista;
    const plano = (s as any).data_plano as string | null;
    porDia[d] = porDia[d] || [];
    porDia[d].push({
      id: (s as any).id,
      status: (s as any).status,
      tumuloId: (s as any).tumulo_id || null,
      jazigo: (s as any).tumulos?.identificacao || "",
      // O código da quadra JÁ VEM "Quadra 1". A tela escrevia `Q{quadra}` e
      // saía "QQuadra 1" — o prefixo mora aqui, não lá, para não haver duas
      // opiniões sobre como uma quadra se chama.
      quadra: (s as any).tumulos?.quadras?.codigo || null,
      rua: (s as any).tumulos?.ruas?.nome || null,
      familia: (s as any).tumulos?.familias?.nome || null,
      falecido: (s as any).tumulos?.falecido_nome || null,
      contato: (s as any).clientes?.nome || null,
      // QUEM LIMPA — quase sempre nulo, e isso é o normal desde que o alocador
      // parou de nomear. A tela precisa do id para poder marcar em lote.
      executoraId: (s as any).executora_id || null,
      valor: (s as any).valor,
      // DE ONDE VEIO ESTA LINHA (0128). Na agenda convivem as duas coisas: a
      // lavagem que o contrato devia e a que alguém pediu. Só que na tela elas
      // eram idênticas — e a decisão de pular ou remarcar não é a mesma nas
      // duas. Adiar uma lavagem de contrato encurta o intervalo; adiar um
      // pedido é furar uma data combinada com a família.
      origem: ((s as any).origem || "nao_definido") as string,
      dataPedida: (s as any).data_desejada || null,
      dataPlano: plano,
      // dias entre a data teórica do plano e o dia em que a lavagem caiu
      atrasoDias: plano && plano < d
        ? Math.round((diaDe(d) - diaDe(plano)) / 86_400_000)
        : 0,
      // A última lavagem DESTE jazigo — nula quando nunca foi lavado.
      ultimaLavagem: (() => {
        const u = ultimaDe.get((s as any).tumulo_id);
        if (!u) return null;
        return {
          dia: u.dia,
          executora: u.executora || null,
          noCampo: !!u.no_campo,
          // dias entre a última lavagem e o dia em que esta está marcada
          diasAte: Math.round((diaDe(d) - diaDe(u.dia)) / 86_400_000),
        };
      })(),
      // A PRÓXIMA DESTE JAZIGO, depois desta. Nula quando esta é a última que
      // existe — e isso também é uma informação: pular a última é ficar sem.
      proximaLavagem: (() => {
        const prox = proximaDepoisDe((s as any).tumulo_id || null, d);
        if (!prox) return null;
        return { dia: prox, emDias: Math.round((diaDe(prox) - diaDe(d)) / 86_400_000) };
      })(),
      estornadoEm: (s as any).estornado_em || null,
      motivoEstorno: (s as any).motivo_estorno || null,
      // marcado à mão: o alocador automático não mexe nele (0041)
      fixado: !!(s as any).fixado_em,
    });
  }

  // A EQUIPE VAI JUNTO, para a tela poder oferecer "quem limpa" sem uma segunda
  // ida ao servidor — e só quem está ATIVO: oferecer alguém que saiu da equipe
  // é criar uma rota que ninguém vai ver.
  // A RLS já limita `membros` à organização da sessão — o filtro aqui é só de
  // situação.
  const { data: equipe } = await db
    .from("membros").select("user_id,nome,papel,ativo")
    .eq("ativo", true).order("nome");

  // A capacidade do dia serve para a tela dizer "13 de 20" em vez de "13" —
  // treze lavagens num dia é tranquilo ou é o limite? Sem o denominador não
  // dá para saber, e é essa a pergunta de quem monta a semana.
  const { data: cfg } = await db
    .from("orgs").select("limpezas_por_dia,dias_semana").limit(1).maybeSingle();

  return NextResponse.json({
    ok: true, inicio, fim, dias: porDia,
    capacidadeDia: Number((cfg as any)?.limpezas_por_dia) || 20,
    diasTrabalhados: (cfg as any)?.dias_semana || [1, 2, 3, 4, 5, 6],
    equipe: ((equipe as any[]) || []).map((m) => ({
      id: m.user_id, nome: m.nome || "sem nome", papel: m.papel,
    })),
  });
}
