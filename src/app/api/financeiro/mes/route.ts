import { NextRequest, NextResponse } from "next/server";
import { ehDoPeriodo } from "@/lib/financeiro";
import { exigirAdmin } from "@/lib/roles";
import { calcularTemperatura } from "@/lib/reajuste";
import { diaOperacao, mesOperacao } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "COMO FOI O MÊS" — a resposta inteira numa chamada só.
 *
 * O QUE ISTO SUBSTITUI
 * ---------------------------------------------------------------------------
 * Responder essa pergunta custava ~9 telas e 15+ cliques, e o mês precisava ser
 * informado QUATRO vezes em quatro controles que não se conversavam (dois
 * `input month` e dois `select` de "últimos N meses"). Trocar o mês num não
 * trocava em nenhum outro.
 *
 * O CONSERTO QUE IMPORTA MAIS QUE O NÚMERO DE CLIQUES
 * ---------------------------------------------------------------------------
 * `api/financeiro/relatorio` lia TODOS os movimentos de TODOS os tempos para
 * montar "quem está em aberto" — sem nenhum filtro de data. Abrir julho em
 * agosto mostrava o saldo de HOJE com o rótulo de julho. Não existia foto do
 * passado: só um retrato do presente com nome de mês, o que torna a palavra
 * "fechamento" mentirosa.
 *
 * Aqui o saldo de cada família é calculado com os movimentos até o ÚLTIMO DIA
 * do mês pedido. Julho mostra como julho terminou — inclusive quem devia e
 * depois pagou. É isso que faz o mês ser uma foto, e não um espelho.
 *
 * A SEGUNDA MENTIRA DESFEITA
 * ---------------------------------------------------------------------------
 * Havia dois "resultados" que nunca se reconciliavam: o de `lancamentos` (o
 * caixa) e o de `movimentos` (a conta das famílias). A tela de Gestão admitia a
 * fratura e PEDIA para o dono digitar a diferença à mão.
 *
 * Aqui a receita tem UMA fonte só: `movimentos`, porque todo pagamento passa
 * por lá. Os lançamentos de entrada do caixa não são somados por cima — quem
 * lança o dinheiro das famílias no caixa (que é o certo, e o que a tela antiga
 * pedia) teria a receita CONTADA DUAS VEZES. As saídas, sim, vêm do caixa: elas
 * não existem em `movimentos`.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function faixa(mes: string) {
  const base = /^\d{4}-\d{2}$/.test(mes) ? mes : mesOperacao();
  const [a, m] = base.split("-").map(Number);
  const ini = `${base}-01`;
  // último dia do mês, sem passar pelo fuso da máquina
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { mes: base, ini, fim };
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { mes, ini, fim } = faixa(req.nextUrl.searchParams.get("mes") || "");
  const hoje = diaOperacao();
  const mesFechado = fim < hoje;

  const [
    { data: movsAte },        // TUDO até o fim do mês — é o que faz a foto
    { data: clientes },
    { data: servMes },
    { data: comprovantes },
  ] = await Promise.all([
    db.from("conta_corrente")
      .select("familia_id,tipo,valor,status_conc,data,origem,servico_id,descricao")
      .lte("data", fim)
      .order("data"),
    db.from("clientes")
      .select("id,nome,telefone,familia_id,responsavel_financeiro,cobranca_nivel,max_lembretes,envio_automatico,regua_cobranca,anonimizado_em"),
    db.from("servicos")
      .select("id,status,valor,data_executada,cliente_id,plano_id,foto_depois_url,planos(cadencia)")
      .gte("data_executada", ini)
      .lte("data_executada", `${fim}T23:59:59`),
    db.from("comprovantes").select("id,status").eq("status", "pendente"),
  ]);

  // ---- tabelas que existem em produção mas não têm migration no repositório:
  // se alguma faltar, a tela continua funcionando sem aquele pedaço
  const lancs = await db.from("lancamentos")
    .select("id,tipo,valor,data,descricao,categorias_financeiras(nome,grupo)")
    .gte("data", ini).lte("data", fim)
    .then((r) => (r.error ? null : r.data), () => null);

  const entradasSemDono = await db.from("entradas_banco")
    .select("id,valor,data,remetente")
    .is("identificada_em", null).lte("data", fim)
    .then((r) => (r.error ? null : r.data), () => null);

  // DOIS INDICES, PORQUE HA DOIS GRAOS NESTA TELA.
  //
  // O dinheiro e da FAMILIA (DECISOES.md D-01); o serviço continua tendo dono
  // pessoa. `porFamilia` aponta para o RESPONSAVEL FINANCEIRO: e o nome que a
  // cobranca usa, e sao os campos de regua dele que valem para a familia.
  const nomeDe = new Map((clientes || []).map((c: any) => [c.id, c]));
  const porFamilia = new Map<string, any>();
  for (const c of (clientes || []) as any[]) {
    if (c.familia_id && c.responsavel_financeiro) porFamilia.set(c.familia_id, c);
  }

  // =====================================================================
  // 1. O DINHEIRO DO MÊS
  // =====================================================================
  // Saldo de abertura entra no SALDO (a familia deve mesmo) mas nunca no
  // dinheiro DO MES: ele tem data de digitacao, nao de acontecimento. Ver
  // `ehDoPeriodo` em lib/financeiro. Era exatamente a mistura que a auditoria
  // aponta na home (CA-02).
  const doMes = (movsAte || []).filter((m: any) => m.data >= ini && ehDoPeriodo(m.origem));
  let entrou = 0, aConferir = 0, faturado = 0;
  for (const m of doMes as any[]) {
    const v = Number(m.valor) || 0;
    if (m.tipo === "credito" && m.status_conc === "confirmado") entrou += v;
    else if (m.tipo === "credito" && m.status_conc === "a_conferir") aConferir += v;
    else if (m.tipo === "debito") faturado += v;
  }

  const saidas = (lancs || []).filter((l: any) => l.tipo === "saida");
  const entradasLancadas = (lancs || []).filter((l: any) => l.tipo === "entrada");
  const custos = r2(saidas.reduce((s: number, l: any) => s + Number(l.valor), 0));
  const lancadoComoEntrada = r2(entradasLancadas.reduce((s: number, l: any) => s + Number(l.valor), 0));

  // custos agrupados, do maior para o menor — é assim que se olha despesa
  const porCategoria = new Map<string, number>();
  for (const l of saidas as any[]) {
    const nome = l.categorias_financeiras?.nome || "sem categoria";
    porCategoria.set(nome, (porCategoria.get(nome) || 0) + Number(l.valor));
  }

  // =====================================================================
  // 2. A FOTO: como cada família estava NO FIM DESTE MÊS
  //
  // `a_conferir` não entra no saldo (é dinheiro que ainda não foi confirmado),
  // e `rejeitado` sai fora — a mesma regra do lib/financeiro.
  // =====================================================================
  const saldoAte = new Map<string, number>();
  const ultimoCredito = new Map<string, string>();
  const ultimoDebito = new Map<string, string>();
  for (const m of (movsAte || []) as any[]) {
    if (m.status_conc === "rejeitado" || m.status_conc === "a_conferir") continue;
    const v = Number(m.valor) || 0;
    if (!m.familia_id) continue;
    saldoAte.set(m.familia_id, (saldoAte.get(m.familia_id) || 0) + (m.tipo === "credito" ? v : -v));
    if (m.tipo === "credito") ultimoCredito.set(m.familia_id, m.data);
    else ultimoDebito.set(m.familia_id, m.data);
  }

  const devendo: any[] = [];
  const adiantados: any[] = [];
  for (const [fid, saldo] of saldoAte) {
    // O titular e o responsavel financeiro da familia. `clienteId` continua
    // sendo id de PESSOA porque e o que o painel usa para abrir a ficha.
    const c: any = porFamilia.get(fid);
    if (!c || c.anonimizado_em) continue;
    if (saldo < -0.005) {
      const desde = ultimoCredito.get(fid) || null;
      devendo.push({
        clienteId: c.id,
        familiaId: fid,
        nome: c.nome,
        telefone: c.telefone,
        valor: r2(Math.abs(saldo)),
        ultimoPagamento: desde,
        diasSemPagar: desde
          ? Math.round((new Date(fim).getTime() - new Date(desde).getTime()) / 86400000)
          : null,
        // 0043/leva 1: quem está no teto da régua SEM dever nada foi excluído da
        // cobrança automática em silêncio. Aqui a coluna fica visível.
        cobrancaNivel: Number(c.cobranca_nivel) || 0,
        maxLembretes: Number(c.max_lembretes) || 3,
        reguaQueimada: (Number(c.cobranca_nivel) || 0) >= (Number(c.max_lembretes) || 3),
        envioDesligado: c.envio_automatico === false,
        naoCobrar: c.regua_cobranca === "nao_cobrar",
      });
    } else if (saldo > 0.005) {
      adiantados.push({ clienteId: c.id, familiaId: fid, nome: c.nome, valor: r2(saldo) });
    }
  }
  devendo.sort((a, b) => b.valor - a.valor);
  adiantados.sort((a, b) => b.valor - a.valor);

  // quem PAGOU no mês (crédito confirmado com data no mês)
  const pagouNoMes = new Map<string, number>();
  for (const m of doMes as any[]) {
    if (m.tipo !== "credito" || m.status_conc !== "confirmado") continue;
    if (!m.familia_id) continue;
    pagouNoMes.set(m.familia_id, (pagouNoMes.get(m.familia_id) || 0) + (Number(m.valor) || 0));
  }
  const pagaram = [...pagouNoMes.entries()]
    .map(([fid, v]) => ({
      clienteId: (porFamilia.get(fid) as any)?.id || null,
      familiaId: fid,
      nome: (porFamilia.get(fid) as any)?.nome || "—",
      valor: r2(v),
    }))
    .sort((a, b) => b.valor - a.valor);

  // =====================================================================
  // 3. O TRABALHO DO MÊS
  // =====================================================================
  const executados = (servMes || []).filter((s: any) => s.status === "executado");
  const avulsos = executados.filter(
    (s: any) => !s.plano_id || s.planos?.cadencia === "avulso" || s.planos?.cadencia === "por_data",
  );

  // =====================================================================
  // 4. O QUE FICOU PARA TRÁS — a parte que evita prejuízo
  // =====================================================================
  const comDebito = new Set(
    (movsAte || []).filter((m: any) => m.tipo === "debito" && m.servico_id).map((m: any) => m.servico_id),
  );
  const semCobranca = executados
    .filter((s: any) => s.cliente_id && !comDebito.has(s.id))
    .map((s: any) => ({
      id: s.id,
      data: s.data_executada,
      familia: (nomeDe.get(s.cliente_id) as any)?.nome || "—",
      valor: s.valor != null ? r2(s.valor) : null,
    }));

  const semFoto = executados
    .filter((s: any) => !s.foto_depois_url)
    .map((s: any) => ({
      id: s.id,
      data: s.data_executada,
      familia: (nomeDe.get(s.cliente_id) as any)?.nome || "—",
    }));

  // reajuste é decisão de preço, e é do mês tanto quanto o resto
  const candidatos = await calcularTemperatura(db).catch(() => []);

  const totalDevendo = r2(devendo.reduce((s, d) => s + d.valor, 0));

  return NextResponse.json({
    ok: true,
    mes,
    ini,
    fim,
    // um mês ainda em curso é uma parcial, e a tela precisa dizer isso
    fechado: mesFechado,

    dinheiro: {
      entrou: r2(entrou),
      aConferir: r2(aConferir),
      faturado: r2(faturado),
      custos,
      lancadoComoEntrada,
      // ------------------------------------------------------------------
      // O RESULTADO NÃO SOMA AS DUAS FONTES — SERIA CONTAR DUAS VEZES.
      //
      // `entrou` vem de `movimentos` (a conta das famílias) e é a fonte
      // confiável da receita: todo pagamento passa por lá. `lancamentos` de
      // entrada é o caixa, e o dono PODE lançar ali o mesmo dinheiro das
      // famílias — a tela de Gestão inclusive pedia isso ("lance a diferença
      // para o resultado ficar certo").
      //
      // Somar os dois dobraria a receita de quem faz o lançamento direitinho —
      // ou seja, puniria justamente quem é organizado. Então a receita aqui é
      // uma só: o que as famílias pagaram. Entrada de outra natureza lançada no
      // caixa (venda de material, aporte) fica FORA desta conta, e o campo
      // `lancadoComoEntrada` está exposto para a tela poder dizer isso.
      // ------------------------------------------------------------------
      resultado: r2(entrou - custos),
      porCategoria: [...porCategoria.entries()]
        .map(([nome, valor]) => ({ nome, valor: r2(valor) }))
        .sort((a, b) => b.valor - a.valor),
      // quanto do caixa NÃO se explica pelo dinheiro das famílias: se for
      // positivo, é entrada de outra natureza (e não entra no resultado acima)
      entradaForaDasFamilias: r2(Math.max(0, lancadoComoEntrada - entrou)),
      caixaIndisponivel: lancs === null,
    },

    trabalho: {
      limpezas: executados.length,
      avulsas: avulsos.length,
      familiasAtendidas: new Set(executados.map((s: any) => s.cliente_id).filter(Boolean)).size,
    },

    familias: {
      devendo,
      totalDevendo,
      adiantados,
      pagaram,
      quantosPagaram: pagaram.length,
    },

    pendencias: {
      semCobranca,
      semFoto,
      comprovantesAConferir: (comprovantes || []).length,
      entradasSemDono: entradasSemDono === null ? null : (entradasSemDono || []).length,
      valorSemDono: entradasSemDono === null
        ? null
        : r2((entradasSemDono || []).reduce((s: number, e: any) => s + Number(e.valor), 0)),
    },

    reajustes: (candidatos || []).slice(0, 10),
    reajustesTotal: (candidatos || []).length,
  });
}
