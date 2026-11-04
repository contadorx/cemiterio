import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { normalizarNomeBanco, palpitarDono,
         type ComprovanteParaCasar, type LicaoBanco, type NomeDoCadastro } from "@/lib/triangulacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * A TRIANGULAÇÃO — DE QUEM É CADA PIX DO EXTRATO.
 *
 * O GET não grava nada: devolve, para cada entrada sem dono, UM palpite com o
 * motivo escrito em português e a força de onde ele veio (comprovante, lição
 * aprendida, nome do cadastro). Entrada que nenhuma fonte alcança volta sem
 * palpite — e isso é resposta, não falha.
 *
 * O POST grava, e só depois que uma pessoa leu. Com `ensaio: true` ele mostra
 * a que meses o dinheiro vai antes de ir. "Você sugere, eu confirmo, sempre."
 *
 * NENHUMA MENSAGEM SAI DAQUI. Conciliar não avisa ninguém; avisar é a fila de
 * conversas, no comando de uma pessoa.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const meses = Math.max(1, Math.min(24, Number(req.nextUrl.searchParams.get("meses")) || 3));
  const desde = new Date();
  desde.setMonth(desde.getMonth() - meses);
  const desdeIso = desde.toISOString().slice(0, 10);

  // As quatro consultas são independentes: uma espera da outra só gastaria
  // tempo de quem está olhando a tela.
  const [rEnt, rComp, rLic, rCli, rFam] = await Promise.all([
    auth.db.from("entradas_banco")
      .select("id, valor, data, remetente, documento, historico")
      .is("identificada_em", null)
      .gte("data", desdeIso)
      .order("data", { ascending: true })
      .limit(500),
    // Comprovantes que JÁ TÊM DONO são a fonte mais forte: a conversa que
    // mandou a imagem está ligada ao cliente, e o cliente à família.
    auth.db.from("comprovantes")
      .select("id, cliente_id, valor_extraido, data_extraida, status, clientes(nome, familia_id, familias(nome))")
      .not("cliente_id", "is", null)
      .neq("status", "rejeitado")
      .gte("data_extraida", desdeIso)
      .limit(2000),
    auth.db.from("apelidos_banco")
      .select("nome_banco, nome_cru, familia_id, cliente_id, acertos, familias(nome)")
      .limit(5000),
    auth.db.from("clientes")
      .select("id, nome, familia_id, responsavel_financeiro, familias(nome)")
      .is("anonimizado_em", null)
      .limit(3000),
    auth.db.from("familias").select("id, nome, responsavel_id").limit(3000),
  ]);

  const entradas = rEnt.data || [];
  const familias = rFam.data || [];
  const clientes = rCli.data || [];

  // ---- de uma FAMÍLIA para uma PESSOA -------------------------------------
  //
  // Uma lição pode apontar só para a família ("este nome é dos Tonelloti"),
  // mas creditar precisa de uma pessoa, porque é dela que o razão deduz a
  // família. Escolho o responsável, depois quem está marcado como responsável
  // financeiro, depois o primeiro — e a tela mostra qual foi.
  const porFamilia = new Map<string, any[]>();
  for (const c of clientes) {
    if (!c.familia_id) continue;
    const l = porFamilia.get(c.familia_id) || [];
    l.push(c);
    porFamilia.set(c.familia_id, l);
  }
  const respDaFamilia = new Map<string, string>();
  for (const f of familias) if (f.responsavel_id) respDaFamilia.set(f.id, f.responsavel_id);

  function pessoaDaFamilia(familiaId: string | null): any | null {
    if (!familiaId) return null;
    const lista = porFamilia.get(familiaId) || [];
    if (!lista.length) return null;
    const resp = respDaFamilia.get(familiaId);
    return lista.find((c: any) => c.id === resp)
        || lista.find((c: any) => c.responsavel_financeiro)
        || lista[0];
  }

  // ---- as três fontes, no formato que a triangulação pede -----------------
  const comprovantes: ComprovanteParaCasar[] = (rComp.data || []).map((c: any) => ({
    id: c.id,
    clienteId: c.cliente_id,
    familiaId: c.clientes?.familia_id ?? null,
    familia: c.clientes?.familias?.nome ?? c.clientes?.nome ?? null,
    valor: c.valor_extraido == null ? null : Number(c.valor_extraido),
    data: c.data_extraida ? String(c.data_extraida).slice(0, 10) : null,
  }));

  const licoes: LicaoBanco[] = (rLic.data || []).map((l: any) => ({
    nomeBanco: l.nome_banco,
    familiaId: l.familia_id,
    clienteId: l.cliente_id,
    familia: l.familias?.nome ?? null,
  }));

  // O CADASTRO ENTRA DUAS VEZES: pelo nome da família e pelo nome de cada
  // pessoa. Quem paga às vezes é o filho, e o sobrenome da família não
  // aparece no extrato.
  const cadastro: NomeDoCadastro[] = [
    ...familias.map((f: any) => ({
      nome: normalizarNomeBanco(f.nome || ""),
      familiaId: f.id, clienteId: null, familia: f.nome,
    })),
    ...clientes.map((c: any) => ({
      nome: normalizarNomeBanco(c.nome || ""),
      familiaId: c.familia_id, clienteId: c.id,
      familia: c.familias?.nome ?? c.nome,
    })),
  ].filter((x) => x.nome.length >= 8);

  // ---- um palpite por entrada --------------------------------------------
  const fontes = { comprovantes, licoes, cadastro };
  const lista = entradas.map((e: any) => {
    const entrada = {
      id: e.id, valor: Number(e.valor),
      data: String(e.data).slice(0, 10),
      remetente: e.remetente,
    };
    const p = palpitarDono(entrada, fontes);
    const pessoa = p ? (p.clienteId ? clientes.find((c: any) => c.id === p.clienteId) : null)
                      || pessoaDaFamilia(p.familiaId) : null;
    return {
      ...entrada,
      documento: e.documento ?? null,
      historico: e.historico ?? null,
      nomeNormalizado: normalizarNomeBanco(e.remetente || ""),
      palpite: p && pessoa
        ? { ...p, clienteId: pessoa.id, cliente: pessoa.nome,
            familia: pessoa.familias?.nome ?? pessoa.nome }
        : null,
      // FAMÍLIA SEM NENHUMA PESSOA CADASTRADA é um palpite que não dá para
      // confirmar. Dizer isso é melhor que mostrar um botão que falha.
      semPessoa: !!(p && !pessoa),
    };
  });

  const comPalpite = lista.filter((x) => x.palpite);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    ok: true,
    entradas: lista,
    licoesGuardadas: licoes.length,
    resumo: {
      semDono: lista.length,
      comPalpite: comPalpite.length,
      semPalpite: lista.length - comPalpite.length,
      porComprovante: comPalpite.filter((x) => x.palpite!.forca === "comprovante").length,
      porLicao: comPalpite.filter((x) => x.palpite!.forca === "licao").length,
      porNome: comPalpite.filter((x) => x.palpite!.forca === "nome").length,
      valorSemDono: r2(lista.reduce((s, x) => s + x.valor, 0)),
      valorComPalpite: r2(comPalpite.reduce((s, x) => s + x.valor, 0)),
    },
  });
}

/**
 * CONFIRMAR — ou ensaiar antes.
 *
 * body: {
 *   entradaId, clienteId,
 *   debitos?: uuid[],     // a que meses este dinheiro se refere
 *   servicoId?: uuid,     // flores, avulso
 *   ensaio?: boolean,     // calcula e devolve sem gravar
 *   aprender?: boolean,   // guarda de quem é este nome do extrato
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const entradaId = String(b?.entradaId || "");
  const clienteId = String(b?.clienteId || "");
  if (!entradaId || !clienteId) {
    return NextResponse.json({ ok: false, erro: "entrada_e_cliente_obrigatorios" }, { status: 400 });
  }
  const debitos = Array.isArray(b?.debitos) && b.debitos.length ? b.debitos.map(String) : null;
  const ensaio = b?.ensaio === true;

  const { data, error } = await auth.db.rpc("sureya_identificar_entrada_meses", {
    p_entrada: entradaId,
    p_cliente: clienteId,
    p_debitos: debitos,
    p_servico: b?.servicoId || null,
    p_ensaio: ensaio,
  });
  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 400 });
  }

  const linhas = (data || []) as any[];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sobra = linhas.find((x) => !x.debito_id);

  // A LIÇÃO SÓ É GUARDADA NO QUE GRAVA, E SÓ SE A PESSOA PEDIU.
  //
  // Aprender no ensaio ensinaria uma coisa que não aconteceu. E aprender
  // sozinho faria o sistema estudar os próprios palpites: o nome do cadastro,
  // que é a fonte mais fraca, viraria lição confirmada sem ninguém olhar.
  let aprendeu: any = null;
  if (!ensaio && b?.aprender === true && b?.nomeCru) {
    const nome = normalizarNomeBanco(String(b.nomeCru));
    if (nome.length >= 3) {
      const { data: ap, error: e2 } = await auth.db.rpc("sureya_aprender_apelido_banco", {
        p_nome: nome,
        p_nome_cru: String(b.nomeCru),
        p_familia: b?.familiaId || null,
        p_cliente: clienteId,
      });
      // Falhar em aprender NÃO desfaz o crédito: o dinheiro já está no lugar
      // certo. A tela diz que a lição não foi guardada e segue.
      aprendeu = e2 ? { ok: false, erro: e2.message } : { ok: true, ...(Array.isArray(ap) ? ap[0] : ap) };
    }
  }

  return NextResponse.json({
    ok: true,
    ensaio,
    gravado: !ensaio,
    meses: linhas.filter((x) => x.debito_id).map((x) => ({
      debitoId: x.debito_id, descricao: x.descricao,
      competencia: x.competencia, jazigo: x.jazigo,
      valor: r2(Number(x.valor)), quitou: x.quitou,
    })),
    sobra: sobra ? r2(Number(sobra.valor)) : 0,
    quitados: linhas.filter((x) => x.debito_id && x.quitou).length,
    aprendeu,
  });
}
