import { supabaseAdmin } from "./supabase-admin";
import { diasDaCasa, diasQueRendem } from "./jornada";
import { env } from "./env";
import { diaOperacao, somaDias } from "./vencimento";
import { registrarErro } from "./monitor";

// Dias de cada ciclo. qtd_por_passagem subdivide o ciclo:
// mensal + 2/passagem => passa a cada ~15 dias (2x/mês). mensal + 1 => 30 dias.
export const DIAS_CICLO: Record<string, number> = {
  // Semanal e quinzenal faltavam: um plano semanal era simplesmente ignorado
  // pela geração de agenda, e a Nina nunca recebia o serviço.
  semanal: 7,
  quinzenal: 15,
  mensal: 30,
  bimestral: 60,
  trimestral: 90,
  semestral: 180,
  anual: 365,
};

// Hoje e a soma de dias vêm da MESMA fonte da régua de vencimento
// (src/lib/vencimento.ts). Antes eram `toISOString()` do relógio da máquina:
// das 21h à meia-noite de Brasília o gerador achava que já era amanhã e gravava
// `proximo_servico` um dia à frente do que Gestão e Mapa mostravam.
function isoHoje(): string {
  return diaOperacao();
}
function addDias(iso: string, dias: number): string {
  return somaDias(iso, dias);
}
function ehDomingo(iso: string): boolean {
  return new Date(iso + "T12:00:00Z").getUTCDay() === 0;
}
/** Um cemitério com pendências e nenhum dia possível — ver `semDia` no alocador. */
export interface SemDia { cemiterioId: string | null; nome: string; pendentes: number }

// Jornada configurada: quais dias a equipe trabalha e quais datas estão bloqueadas.
interface Jornada {
  dias: number[];          // 0=dom ... 6=sáb
  bloqueadas: Set<string>; // feriados / dias sem campo
}

async function carregarJornada(): Promise<Jornada> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { data: o } = await db
    .from("orgs").select("dias_semana,dias_trabalhados_semana").eq("id", org).maybeSingle();
  const { data: bl } = await db
    .from("dias_sem_campo").select("data").eq("org_id", org).gte("data", isoHoje());
  return { dias: diasDaCasa(o), bloqueadas: new Set((bl || []).map((x: any) => x.data)) };
}

function diaDaSemana(iso: string): number {
  return new Date(iso + "T12:00:00Z").getUTCDay();
}

// Avança até cair num dia em que a equipe trabalha e que não esteja bloqueado.
function proximoDiaUtil(iso: string, j?: Jornada): string {
  const dias = j?.dias ?? [1, 2, 3, 4, 5, 6];
  const bloq = j?.bloqueadas ?? new Set<string>();
  let d = iso;
  let guarda = 0;
  while ((!dias.includes(diaDaSemana(d)) || bloq.has(d)) && guarda < 40) {
    d = addDias(d, 1);
    guarda++;
  }
  return d;
}

// ----------------------------------------------------------------------------
// ANTI-DUPLICATA (migration 0032)
//
// O gerador perguntava "ja existe servico deste plano na data X?" olhando
// data_prevista. So que o ALOCADOR reescreve data_prevista com o dia da rota
// logo depois. Na rodada seguinte o gerador nao reconhecia mais o servico que
// ele mesmo criou e inseria outro. Apertar o botao 3x = 3 copias.
//
// Agora existem duas datas: data_plano (a teorica, congelada, chave de
// unicidade) e data_prevista (o dia da rota, do alocador). A checagem passa a
// ser em memoria, uma consulta por plano — o .maybeSingle() de antes tambem
// piorava tudo: com 2+ linhas ele da erro e devolve null, lido como "nao
// existe", inserindo mais uma.
// ----------------------------------------------------------------------------
interface ServicoExistente {
  id: string;
  data_plano: string | null;
  data_prevista: string | null;
  status: string;
}

function difDias(a: string, b: string): number {
  const ms = new Date(a + "T12:00:00Z").getTime() - new Date(b + "T12:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

// A coluna so existe depois da 0032. Enquanto ela nao rodar o codigo opera no
// modo antigo (por data_prevista) em vez de quebrar a geracao inteira.
let colunaDataPlano: boolean | null = null;
async function temDataPlano(db: any): Promise<boolean> {
  if (colunaDataPlano !== null) return colunaDataPlano;
  const { error } = await db.from("servicos").select("data_plano").limit(1);
  colunaDataPlano = !error;
  return colunaDataPlano;
}

/**
 * Os serviços deste TÚMULO — para não criar limpeza repetida na mesma data.
 *
 * Antes a checagem era por `plano_id`. Com o plano morando no túmulo, o
 * `plano_id` nasce nulo, e filtrar por ele traria zero resultados: a geração
 * criaria a mesma limpeza de novo a cada rodada.
 */
async function servicosDoTumulo(
  db: any, org: string, tumuloId: string, comColuna: boolean
): Promise<ServicoExistente[]> {
  const campos = comColuna ? "id,data_plano,data_prevista,status" : "id,data_prevista,status";
  const { data } = await db
    .from("servicos")
    .select(campos)
    .eq("org_id", org)
    .eq("tumulo_id", tumuloId)
    .in("status", ["pendente", "agendado", "executado"]);
  return ((data as any[]) || []).map((x) => ({
    id: x.id,
    data_plano: (x.data_plano as string) ?? null,
    data_prevista: (x.data_prevista as string) ?? null,
    status: x.status as string,
  }));
}

async function servicosDoPlano(
  db: any, org: string, planoId: string, comColuna: boolean
): Promise<ServicoExistente[]> {
  const campos = comColuna ? "id,data_plano,data_prevista,status" : "id,data_prevista,status";
  const { data } = await db
    .from("servicos")
    .select(campos)
    .eq("org_id", org)
    .eq("plano_id", planoId)
    .in("status", ["pendente", "agendado", "executado"]);
  return ((data as any[]) || []).map((x) => ({
    id: x.id,
    data_plano: (x.data_plano as string) ?? null,
    data_prevista: (x.data_prevista as string) ?? null,
    status: x.status as string,
  }));
}

/**
 * Este plano ja tem servico para esta data teorica?
 *
 * `tolerancia` cobre o legado: em servico antigo (sem data_plano) a unica data
 * que sobrou e a da rota, que o alocador mexeu alguns dias. Dois servicos do
 * mesmo plano colados assim sao copia, nao ida nova — a tolerancia e sempre
 * menor que meio passo do ciclo, entao nunca engole uma passagem legitima.
 */
function jaTemServico(
  lista: ServicoExistente[], alvo: string, tolerancia: number, statusValidos: string[]
): boolean {
  for (const s of lista) {
    if (!statusValidos.includes(s.status)) continue;
    if (s.data_plano && s.data_plano === alvo) return true;
    if (!s.data_plano && s.data_prevista === alvo) return true;
    const ref = s.data_plano || s.data_prevista;
    if (ref && tolerancia > 0 && Math.abs(difDias(ref, alvo)) <= tolerancia) return true;
  }
  return false;
}

/** meia janela do passo do ciclo, no maximo 14 dias */
function toleranciaDoPasso(passo: number): number {
  return Math.max(0, Math.min(14, Math.floor((passo - 1) / 2)));
}

// ----------------------------------------------------------------------------
// GERADOR: transforma planos recorrentes vencidos em serviços "pendente".
// Avança o proximo_servico de cada plano. Avulso/por_data não entram.
// ----------------------------------------------------------------------------
export interface DiagnosticoGeracao {
  criados: number;
  planosAtivos: number;      // planos recorrentes ativos
  planosNoHorizonte: number; // com data dentro da janela
  foraDoHorizonte: number;   // a próxima ida é depois da janela
  jaExistiam: number;        // a data já tinha serviço aberto
  falhas: number;            // erros inesperados: o plano NÃO avançou o ponteiro
  proximaData: string | null;// quando volta a ter algo para gerar
  horizonteDias: number;
}

/**
 * Cria os serviços que os planos devem no período. NÃO define o dia da rota —
 * isso é do alocador. Idempotente: rodar de novo não duplica.
 */
export async function gerarServicosDevidos(horizonteDias = 30): Promise<DiagnosticoGeracao> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const limite = addDias(isoHoje(), horizonteDias);

  // O PLANO MORA NO TÚMULO.
  //
  // Isto lia `planos`, enquanto a ficha e a cobrança gravavam em `tumulos`. A
  // Sureya configurava "limpa toda semana", o valor entrava na conta corrente
  // — e a Nina nunca recebia o serviço, porque a agenda procurava numa tabela
  // onde não havia nada.
  //
  // Agora as duas metades do sistema leem a mesma fonte.
  const { data: planos, error: erroContratos } = await db
    .from("tumulos")
    .select("id,cliente_id,familia_id,periodicidade,proximo_servico")
    .eq("org_id", org)
    .eq("contratado", true)
    .in("periodicidade", Object.keys(DIAS_CICLO));

  // ESTE ERRO NAO PODE SER ENGOLIDO.
  //
  // O `error` desta consulta era descartado. Quando ela falhava — coluna que
  // nao existe, RLS, timeout — `planos` vinha nulo, o laco nao rodava nenhuma
  // vez e a funcao devolvia `criados: 0` com cara de "nao havia nada a fazer".
  // O cron diario seguia verde, a tela dizia "0 planos ativos" e NENHUMA
  // familia era agendada, todos os dias, sem um unico sinal em lugar nenhum.
  //
  // Agora a falha aparece no diagnostico (`falhas > 0`) e vai para o log de
  // erros, em vez de virar um zero tranquilo.
  if (erroContratos) {
    await registrarErro("agenda: nao consegui ler os contratos dos jazigos", erroContratos.message, {
      horizonteDias,
    });
    return {
      criados: 0, planosAtivos: 0, planosNoHorizonte: 0, foraDoHorizonte: 0,
      jaExistiam: 0, falhas: 1, proximaData: null, horizonteDias,
    };
  }

  // OS JAZIGOS PARADOS A PEDIDO DA FAMÍLIA (0119).
  //
  // Uma consulta só, e não uma por jazigo: são 266 jazigos e o gerador roda
  // todo dia. `pausas_tumulo` com `fim` nulo é a única fonte de "está parado"
  // — não há booleano espelhado em `tumulos` para desencontrar.
  //
  // Falha aqui NÃO vira lista vazia: gerar limpeza para quem pediu para parar
  // é pior do que não gerar nada, então o erro sobe.
  const { data: pausas, error: erroPausas } = await db
    .from("pausas_tumulo")
    .select("tumulo_id")
    .eq("org_id", org)
    .is("fim", null);

  if (erroPausas) {
    await registrarErro("agenda: nao consegui ler as paradas", erroPausas.message, {});
    return {
      criados: 0, planosAtivos: 0, planosNoHorizonte: 0, foraDoHorizonte: 0,
      jaExistiam: 0, falhas: 1, proximaData: null, horizonteDias,
    };
  }
  const parados = new Set(((pausas as any[]) || []).map((p) => p.tumulo_id));

  let criados = 0;
  let jaExistiam = 0;
  let falhasTotais = 0;
  let noHorizonte = 0;
  let foraDoHorizonte = 0;
  let proximaData: string | null = null;

  for (const p of planos || []) {
    // Parado a pedido da família: não se gera limpeza (0119). O combinado
    // continua inteiro — valor, ritmo, datas —, só não acontece.
    if (parados.has((p as any).id)) continue;

    // A periodicidade JÁ é o intervalo entre limpezas — não há mais "quantas
    // por ciclo" para dividir. "Semanal" é a cada 7 dias, e ponto.
    const passo = DIAS_CICLO[(p as any).periodicidade];

    // Nunca antes de hoje: gerar agenda retroativa encheria a lista da Nina
    // com dias que já passaram.
    let prox: string = (p as any).proximo_servico || isoHoje();
    let guarda = 0;      // trava anti-loop
    let falhou = false;  // erro inesperado neste plano: nao avanca o ponteiro

    if (prox > limite) {
      foraDoHorizonte++;
      if (!proximaData || prox < proximaData) proximaData = prox;
      continue;
    }
    noHorizonte++;

    const comColuna = await temDataPlano(db);
    const existentes = await servicosDoTumulo(db, org, (p as any).id, comColuna);
    const tolerancia = toleranciaDoPasso(passo);

    while (prox <= limite && guarda < 60) {
      guarda++;

      // evita duplicar: ja existe servico aberto desse plano nesta data teorica?
      if (jaTemServico(existentes, prox, tolerancia, ["pendente", "agendado"])) {
        jaExistiam++;
      } else {
        const linha: any = {
          org_id: org,
          tumulo_id: (p as any).id,
          plano_id: null,          // o plano é o próprio túmulo agora
          // POR QUE ESTA LAVAGEM EXISTE (0128). O default da coluna já é
          // "contrato"; está escrito aqui assim mesmo porque foi exatamente um
          // campo deixado implícito — o `plano_id: null` da linha de cima — que
          // fez 258 lavagens de contrato serem chamadas de avulsas.
          origem: "contrato",
          cliente_id: (p as any).cliente_id,
          data_prevista: prox,
          status: "pendente",
          // O SERVIÇO NÃO CARREGA VALOR.
          //
          // O dinheiro vem da competência da família, não da limpeza. Gravar
          // um valor aqui criaria um segundo número para a mesma coisa — e
          // seria ele que apareceria nos relatórios, divergindo do que a
          // família realmente deve.
          valor: null,
        };
        if (comColuna) linha.data_plano = prox;

        const { error } = await db.from("servicos").insert(linha);
        if (!error) {
          criados++;
          // entra na lista para as proximas voltas do laco enxergarem
          existentes.push({
            id: "novo", data_plano: comColuna ? prox : null,
            data_prevista: prox, status: "pendente",
          });
        } else if (String(error.code) === "23505" || /duplicat|unique/i.test(error.message || "")) {
          // o indice unico da 0032 barrou: ja existia mesmo
          jaExistiam++;
        } else {
          // QUALQUER OUTRO ERRO NAO PODE PASSAR POR "ja existia".
          // Coluna nula, RLS, timeout do pool: tudo caia aqui, era contado como
          // "ja existia" (uma mentira tranquilizadora na tela) e o ponteiro do
          // plano avancava mesmo assim — a familia PULAVA uma limpeza, para
          // sempre, sem sinal em lugar nenhum.
          falhou = true;
          falhasTotais++;
          await registrarErro("agenda: nao consegui criar a limpeza", error.message, {
            tumuloId: (p as any).id, data: prox,
          });
          break; // para este plano aqui: o ponteiro nao anda por cima do buraco
        }
      }
      prox = addDias(prox, passo);
    }

    // O PONTEIRO SO ANDA SE NAO HOUVE FALHA NESTE PLANO. Antes ele era gravado
    // sempre — inclusive quando o insert falhou e quando nada foi criado.
    if (!falhou) {
      await db.from("tumulos").update({ proximo_servico: prox }).eq("id", (p as any).id);
    }
  }

  return {
    criados,
    planosAtivos: (planos || []).length,
    planosNoHorizonte: noHorizonte,
    foraDoHorizonte,
    jaExistiam,
    falhas: falhasTotais,
    proximaData,
    horizonteDias,
  };
}

// ----------------------------------------------------------------------------
// ALOCADOR: distribui os serviços pendentes em dias respeitando a capacidade,
// agrupando por quadra e ordenando por proximidade dentro da quadra.
// ----------------------------------------------------------------------------
interface ServicoPend {
  id: string;
  /**
   * O JAZIGO — precisa estar aqui por causa de UMA regra: uma lavagem por
   * jazigo por dia. Sem o id, o alocador nao tem como saber que as quatro
   * linhas que ele esta empilhando no dia 24 sao do MESMO tumulo.
   */
  tumulo_id: string | null;
  data_prevista: string | null;
  /**
   * A DATA TEÓRICA DO PLANO — congelada no momento em que o serviço nasceu.
   *
   * É diferente de `data_prevista`, que o alocador REESCREVE a cada passada.
   * Sem ela, numa segunda rodada o alocador não teria como saber quando aquela
   * lavagem era devida: ele leria a data que ele mesmo escreveu.
   */
  data_plano?: string | null;
  data_desejada?: string | null;   // a data que a família pediu (0037) — nunca reescrita
  prioridade?: number;
  cemiterio_id?: string | null;    // 0044 — a rota do dia é por cemitério
  tumulo: {
    identificacao: string;
    lat: number | null;
    lng: number | null;
    quadra_ordem: number;
    // ENDEREÇO (0047) — é daqui que sai a ordem do dia agora.
    rua_ordem: number | null;      // sequência de caminhada da rua
    rua_id: string | null;
    ordem_na_rua: number | null;   // posição dentro da rua, derivada do GPS do cadastro
    // Ruas que são o MESMO caminho no chão, partido entre quadras (a Rua 7 é
    // divisa: um lado é da Quadra 1, o outro da 3). Compartilham esta chave e
    // viram uma parada só.
    rua_chave: string | null;
  };
}

/**
 * ORDEM DO DIA POR ENDEREÇO (0047) — substitui o vizinho-mais-próximo por GPS.
 *
 * O QUE HAVIA AQUI E POR QUE SAIU
 * A versão anterior montava a rota por proximidade em lat/lng. Dois defeitos
 * que custavam caro no chão do cemitério:
 *
 *   1. Túmulo sem coordenada ia para o FIM da fila, solto, fora de qualquer
 *      rua — e a Nina descobria isso andando.
 *   2. O GPS não conhece muro. Enxergava um túmulo do outro lado da divisa
 *      como "logo ali" e mandava ela bater na parede.
 *
 * Agora a ordem é a que ela realmente caminha:
 *
 *      RUA (ordem cadastrada)  ->  POSIÇÃO NA RUA
 *
 * A SERPENTINA: ruas de posição par na sequência do dia são percorridas ao
 * contrário. Sem isso ela termina a rua no fundo e volta andando à toa até o
 * começo da próxima. Alternando, uma emenda na outra.
 *
 * O GPS não sumiu: ele é capturado no cadastro e alimenta `ordem_na_rua`
 * (lib/rota.ts). Só não participa mais da navegação do dia.
 */
function ordenarPorEndereco(itens: ServicoPend[]): ServicoPend[] {
  // A CHAVE DA PARADA.
  //
  // Normalmente é a rua dentro da quadra. Mas quando a rua tem `chave_fisica`
  // ela é o MESMO caminho no chão partido entre duas quadras — a Rua 7 é a
  // divisa, com um lado pertencendo à Quadra 1 e o outro à Quadra 3. Nesse
  // caso os dois pedaços viram UMA parada só, e a Nina percorre a rua uma vez
  // limpando os dois lados, que é como ela já faz na prática.
  const chaveDe = (it: ServicoPend) =>
    it.tumulo.rua_chave || it.tumulo.rua_id || "";

  const porRua = new Map<string, ServicoPend[]>();
  const semRua: ServicoPend[] = [];

  for (const it of itens) {
    const k = chaveDe(it);
    if (!k) { semRua.push(it); continue; }
    const arr = porRua.get(k) || [];
    arr.push(it);
    porRua.set(k, arr);
  }

  // Onde cada parada entra na caminhada: a posição da metade que vem primeiro.
  // A Rua 7 compartilhada é alcançada ao terminar as ruas da Quadra 1, então é
  // a ordem dessa metade que manda — e não a da metade da Quadra 3.
  const posicao = (grupo: ServicoPend[]) =>
    grupo.reduce(
      (menor, it) => {
        const q = it.tumulo.quadra_ordem ?? 9999;
        const r = it.tumulo.rua_ordem ?? 9999;
        return q < menor.q || (q === menor.q && r < menor.r) ? { q, r } : menor;
      },
      { q: 9999, r: 9999 },
    );

  const paradas = [...porRua.keys()]
    .map((k) => ({ k, pos: posicao(porRua.get(k)!) }))
    .sort((a, b) => a.pos.q - b.pos.q || a.pos.r - b.pos.r);

  const rota: ServicoPend[] = [];
  paradas.forEach(({ k }, i) => {
    const daRua = porRua.get(k)!.sort((a, b) => {
      // Sem posição definida, vai para o fim da PRÓPRIA rua — nunca para o
      // fim do dia, como acontecia quando a ordem saía do GPS.
      const oa = a.tumulo.ordem_na_rua ?? Number.MAX_SAFE_INTEGER;
      const ob = b.tumulo.ordem_na_rua ?? Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });

    // SERPENTINA: ruas alternadas são percorridas ao contrário. Sem isso ela
    // termina a rua no fundo e volta andando à toa até o começo da próxima.
    rota.push(...(i % 2 === 1 ? daRua.reverse() : daRua));
  });

  // Túmulo ainda sem rua fecha o dia, em ordem alfabética. É um aviso visível
  // de cadastro incompleto, não um item perdido no meio da lista.
  semRua.sort((a, b) => a.tumulo.identificacao.localeCompare(b.tumulo.identificacao));
  return [...rota, ...semRua];
}

export async function alocarAgenda(
  opts?: { aPartirDe?: string },
): Promise<{ agendados: number; dias: number; semDia: SemDia[] }> {
  const db = supabaseAdmin();
  const org = env.orgId();

  // capacidade/dia padrão da org
  const { data: orgRow } = await db
    .from("orgs")
    .select("limpezas_por_dia")
    .eq("id", org)
    .maybeSingle();
  const capacidadePadrao = Number((orgRow as any)?.limpezas_por_dia) || 20;

  /**
   * A RÉGUA DE PRIORIDADE (0136).
   *
   * `servicos.prioridade` continua existindo e continua valendo — é o número
   * que o "não deu para fazer" escreve. O que muda é que ele deixou de ser o
   * ÚNICO: agora soma com os critérios da régua, que a Sureya ajusta em
   * Configurações.
   *
   * Somar em vez de substituir é deliberado. A coluna guarda história (quantas
   * vezes aquele jazigo já foi adiado); a régua responde ao mundo de hoje
   * (memória chegando, nunca lavado, atrasado). Trocar uma pela outra perderia
   * metade da verdade.
   *
   * UMA CONSULTA SÓ, e não uma por serviço: o alocador roda sobre 266 jazigos
   * e é chamado pelo cron diário.
   *
   * FALHA AQUI NÃO PARA A GERAÇÃO. Sem a régua a agenda ainda é melhor que
   * agenda nenhuma — cai para a prioridade da coluna, que é o comportamento de
   * antes da 0136, e o erro vai para o log em vez de virar um zero tranquilo.
   */
  const pontosDaRegua = new Map<string, number>();
  {
    const { data: pr, error: ePr } = await db.rpc("sureya_prioridade_calculada", { p_org: org });
    if (ePr) {
      await registrarErro("agenda: nao consegui ler a regua de prioridade", ePr.message, {});
    } else {
      for (const linha of (pr as any[]) || []) {
        pontosDaRegua.set(linha.servico_id, Number(linha.pontos) || 0);
      }
    }
  }

  // ==========================================================================
  // MULTI-CEMITÉRIO (0044)
  //
  // Antes, esta função tratava o mundo como um cemitério só: agrupava por
  // `quadras.ordem`, que é um inteiro GLOBAL. Com dois locais, duas quadras com
  // a mesma ordem viravam um bloco só e a sequência do dia podia ser A → B → A,
  // atravessando a cidade no meio da manhã — porque o custo de deslocamento
  // ENTRE cemitérios é zero para o alocador (a proximidade só é calculada
  // dentro da quadra).
  //
  // Agora a alocação roda POR CEMITÉRIO, e existem dois mecanismos, ambos
  // OPCIONAIS e independentes:
  //   · `cemiterios.dias_semana` — em que dias a equipe vai naquele lugar;
  //   · `membros.cemiterio_id`   — pessoa amarrada a um lugar.
  // Sem nada configurado (as duas colunas nulas), o resultado é IDÊNTICO ao de
  // antes: um pote só, todo mundo atendendo tudo, todos os dias.
  // ==========================================================================
  const { data: cemsRaw } = await db
    .from("cemiterios")
    .select("id,nome,ativo,ordem,dias_semana")
    .eq("org_id", org)
    .order("ordem")
    .order("nome");

  // sem a migration 0044 as colunas não existem e o select devolve null:
  // cai no modo antigo (um pote só), que continua correto.
  const cemiterios = (cemsRaw || [])
    .filter((c: any) => c.ativo !== false)
    .map((c: any) => ({
      id: c.id as string,
      nome: (c.nome as string) || "cemitério",
      dias: Array.isArray(c.dias_semana) && c.dias_semana.length ? (c.dias_semana as number[]) : null,
    }));

  // ---- equipe (com o vínculo de cemitério, se existir) ----------------------
  let campo: any[] | null = null;
  const rEq = await db
    .from("membros")
    .select("user_id,nome,limpezas_por_dia,ativo,cemiterio_id")
    .eq("org_id", org)
    .eq("papel", "campo");
  campo = rEq.data as any;
  if (!campo) {
    const rEq2 = await db
      .from("membros")
      .select("user_id,nome,limpezas_por_dia,ativo")
      .eq("org_id", org)
      .eq("papel", "campo");
    campo = rEq2.data as any;
  }

  const equipe = (campo || [])
    .filter((m: any) => m.ativo !== false)
    .map((m: any) => ({
      userId: m.user_id as string | null,
      capacidade: Number(m.limpezas_por_dia) || capacidadePadrao,
      cemiterioId: (m.cemiterio_id as string | null) ?? null,
    }));

  // sem ajudante cadastrada: opera como antes (um turno único, sem executora)
  const turnos = equipe.length > 0
    ? equipe
    : [{ userId: null as string | null, capacidade: capacidadePadrao, cemiterioId: null as string | null }];

  // ---- pendentes (com o cemitério, quando a coluna existir) -----------------
  const SEL_NOVO =
    "id,tumulo_id,data_prevista,data_plano,data_desejada,prioridade,cemiterio_id," +
    "tumulos(identificacao,lat,lng,cemiterio_id,rua_id,ordem_na_rua,ruas(ordem,chave_fisica),quadras(ordem,cemiterio_id))";
  const SEL_SEM_FIXADO =
    "id,tumulo_id,data_prevista,data_desejada,prioridade," +
    "tumulos(identificacao,lat,lng,rua_id,ordem_na_rua,ruas(ordem,chave_fisica),quadras(ordem,cemiterio_id))";
  const SEL_ANTIGO =
    "id,tumulo_id,data_prevista,prioridade,tumulos(identificacao,lat,lng,rua_id,ordem_na_rua,ruas(ordem,chave_fisica),quadras(ordem))";

  // O que foi decidido por uma PESSOA não entra aqui (0041): remarcação manual
  // fica onde está, em vez de ser desfeita pelo alocador na madrugada seguinte.
  let temDesejada = true;
  let temCemiterio = true;
  const r1 = await db
    .from("servicos").select(SEL_NOVO)
    .eq("org_id", org).eq("status", "pendente").is("fixado_em", null);
  let pend: any[] | null = r1.data as any;

  if (!pend) {
    temCemiterio = false;
    const r2 = await db
      .from("servicos").select(SEL_SEM_FIXADO)
      .eq("org_id", org).eq("status", "pendente").is("fixado_em", null);
    pend = r2.data as any;
  }
  if (!pend) {
    const r3 = await db
      .from("servicos").select(SEL_SEM_FIXADO)
      .eq("org_id", org).eq("status", "pendente");
    pend = r3.data as any;
  }
  if (!pend) {
    temDesejada = false;
    const r4 = await db
      .from("servicos").select(SEL_ANTIGO)
      .eq("org_id", org).eq("status", "pendente");
    pend = r4.data as any;
  }

  const itens: ServicoPend[] = (pend || []).map((s: any) => ({
    id: s.id,
    tumulo_id: s.tumulo_id ?? null,
    data_prevista: s.data_prevista,
    data_plano: s.data_plano ?? null,
    data_desejada: s.data_desejada ?? null,
    prioridade: s.prioridade || 0,
    // o cemitério vem da coluna nova; sem ela, da quadra do túmulo
    cemiterio_id: s.cemiterio_id ?? s.tumulos?.cemiterio_id ?? s.tumulos?.quadras?.cemiterio_id ?? null,
    tumulo: {
      identificacao: s.tumulos?.identificacao || "",
      lat: s.tumulos?.lat ?? null,
      lng: s.tumulos?.lng ?? null,
      quadra_ordem: s.tumulos?.quadras?.ordem ?? 9999,
      rua_ordem: s.tumulos?.ruas?.ordem ?? null,
      rua_id: s.tumulos?.rua_id ?? null,
      rua_chave: s.tumulos?.ruas?.chave_fisica ?? null,
      ordem_na_rua: s.tumulos?.ordem_na_rua ?? null,
    },
  }));

  if (!itens.length) return { agendados: 0, dias: 0, semDia: [] };

  const jornada = await carregarJornada();
  // O PISO DA DISTRIBUIÇÃO.
  //
  // Normalmente é hoje. Quando o roteiro é REFEITO por inteiro, é amanhã: "o
  // roteiro deve ser os próximos", e hoje não se mexe — a Nina já abriu a
  // lista no celular e a rota não pode mudar debaixo dela.
  const piso = opts?.aPartirDe && opts.aPartirDe > isoHoje() ? opts.aPartirDe : isoHoje();
  const primeiroDia = proximoDiaUtil(piso, jornada);

  // ==========================================================================
  // O QUE JA ESTA NO DIA E NAO VAI SER REMEXIDO
  //
  // O alocador so reescreve o que esta `pendente` e solto. Mas o que ele NAO
  // reescreve continua ocupando o dia: a lavagem ja `agendado` e a que alguem
  // fixou a mao (0041). Ele nao enxergava nada disso — contava a capacidade do
  // dia como se estivesse vazio.
  //
  // Dois estragos, os dois vistos em producao:
  //
  //   · CAPACIDADE INFLADA. Um dia com 20 lugares e 12 lavagens ja agendadas
  //     recebia mais 20, e a rota nascia impossivel de cumprir.
  //   · JAZIGO REPETIDO. Depois de "reorganizar", tres lavagens do Perrela
  //     voltavam para `pendente` e o alocador as punha de novo no dia 24 —
  //     onde a quarta, que ficou `agendado`, ja estava.
  //
  // A lista e montada por diferenca: tudo que esta pendente/agendado no
  // horizonte e NAO esta em `itens` e ocupacao. Assim nao ha uma segunda copia
  // da regra de "o que o alocador remexe" para sair do lugar depois.
  // ==========================================================================
  const { data: ocupRaw } = await db
    .from("servicos")
    .select("id,tumulo_id,data_prevista")
    .eq("org_id", org)
    .in("status", ["pendente", "agendado"])
    .gte("data_prevista", primeiroDia);

  const aAlocar = new Set(itens.map((i) => i.id));
  /** dia -> quantas lavagens ja estao presas naquele dia */
  const cargaExistente = new Map<string, number>();
  /** dia -> jazigos que ja tem lavagem naquele dia */
  const jazigoNoDia = new Map<string, Set<string>>();

  const marcarJazigo = (d: string, tumuloId: string | null) => {
    if (!tumuloId) return;
    const set = jazigoNoDia.get(d) || new Set<string>();
    set.add(tumuloId);
    jazigoNoDia.set(d, set);
  };

  for (const o of ((ocupRaw as any[]) || [])) {
    if (aAlocar.has(o.id)) continue;
    const d = o.data_prevista as string | null;
    if (!d) continue;
    cargaExistente.set(d, (cargaExistente.get(d) || 0) + 1);
    marcarJazigo(d, o.tumulo_id ?? null);
  }

  // ---- os grupos a alocar, um por cemitério --------------------------------
  // Sem multi-cemitério configurado, isto vira UM grupo com tudo dentro — e o
  // caminho é o mesmo de sempre.
  type Grupo = { cemiterioId: string | null; nome: string; dias: number[] | null; itens: ServicoPend[] };
  const grupos: Grupo[] = [];
  if (cemiterios.length > 1 && temCemiterio) {
    for (const c of cemiterios) {
      const meus = itens.filter((i) => i.cemiterio_id === c.id);
      if (meus.length) grupos.push({ cemiterioId: c.id, nome: c.nome, dias: c.dias, itens: meus });
    }
    // órfãos (sem cemitério identificado) entram num grupo próprio, sem
    // restrição de dia — melhor agendar do que sumir da agenda
    const semCem = itens.filter((i) => !i.cemiterio_id || !cemiterios.some((c) => c.id === i.cemiterio_id));
    if (semCem.length) grupos.push({ cemiterioId: null, nome: "sem cemitério", dias: null, itens: semCem });
  } else {
    grupos.push({ cemiterioId: null, nome: "todos", dias: null, itens });
  }

  // ---- capacidade CONSUMIDA, compartilhada entre os grupos -----------------
  // Uma ajudante sem vínculo atende qualquer cemitério, mas o dia dela é UM só:
  // sem este contador, dois cemitérios abertos no mesmo dia dobrariam a
  // capacidade dela no papel — e a rota nasceria impossível de cumprir.
  const usado = new Map<string, number>(); // `${dia}|${userId}` -> quantos já recebeu
  const chave = (d: string, u: string | null) => `${d}|${u ?? "-"}`;
  const restaDoTurno = (d: string, t: typeof turnos[number]) =>
    Math.max(0, t.capacidade - (usado.get(chave(d, t.userId)) || 0));

  let dias = 0;
  let agendados = 0;
  const diasComAlgo = new Set<string>();
  /**
   * CEMITERIOS QUE NAO TEM UM DIA SEQUER.
   *
   * A interseçao entre a jornada da casa e os dias do cemiterio pode ser
   * VAZIA — Santa Lidia so no fim de semana, casa so de segunda a sexta. Antes
   * o laço abaixo simplesmente nao achava dia, nao agendava nada e devolvia o
   * mesmo "0 agendados" de quando nao ha o que fazer. As duas situaçoes sao
   * opostas: numa nao ha trabalho, na outra ha trabalho que nunca vai sair.
   * Vazio nao e zero — entao o cemiterio sai daqui NOMEADO.
   */
  const semDia: SemDia[] = [];

  for (const grupo of grupos) {
    // quem pode trabalhar NESTE cemitério: quem está amarrado a ele + quem não
    // está amarrado a lugar nenhum
    const turnosDoGrupo = turnos.filter(
      (t) => !t.cemiterioId || !grupo.cemiterioId || t.cemiterioId === grupo.cemiterioId,
    );
    if (!turnosDoGrupo.length) continue;

    // o dia serve para este cemitério? (jornada da casa ∩ dias do cemitério)
    const diasUteis = diasQueRendem(jornada.dias, grupo.dias);
    if (!diasUteis.length) {
      semDia.push({ cemiterioId: grupo.cemiterioId, nome: grupo.nome, pendentes: grupo.itens.length });
      continue;
    }
    const diaServe = (d: string) =>
      proximoDiaUtil(d, jornada) === d && diasUteis.includes(diaDaSemana(d));

    const proximoDiaDoGrupo = (d: string) => {
      let x = proximoDiaUtil(d, jornada);
      let guarda = 0;
      while (!diaServe(x) && guarda < 400) { x = proximoDiaUtil(addDias(x, 1), jornada); guarda++; }
      return x;
    };
    const diaAnteriorDoGrupo = (d: string) => {
      let x = addDias(d, -1);
      let guarda = 0;
      while (!diaServe(x) && guarda < 400) { x = addDias(x, -1); guarda++; }
      return x;
    };

    const slots = new Map<string, ServicoPend[]>();
    const estourados = new Set<string>();

    const vagas = (d: string) => {
      if (!diaServe(d)) return 0;
      const jaNoSlot = slots.get(d)?.length || 0;
      // o que ja estava preso naquele dia antes desta rodada
      const jaNoBanco = cargaExistente.get(d) || 0;
      const total = turnosDoGrupo.reduce((s, t) => s + restaDoTurno(d, t), 0);
      return total - jaNoSlot - jaNoBanco;
    };

    /**
     * UMA LAVAGEM POR JAZIGO POR DIA.
     *
     * Nao e uma preferencia de rota: e o que o servico e. Lavar o mesmo tumulo
     * duas vezes na mesma manha nao entrega nada na segunda vez, e a familia e
     * cobrada pelas duas.
     *
     * O que se via em producao (23/08/2026): o jazigo Perrela com QUATRO
     * lavagens no dia 24, com datas de plano 01/08, 09/08, 17/08 e 25/08. Tres
     * estavam atrasadas; `devidoEm` respondeu "hoje" para as tres — o que esta
     * certo, atraso nao se recupera andando para tras — e sem esta regra o dia
     * aceitou as quatro. No campo, a mesma lapide aparecia quatro vezes
     * seguidas na lista.
     *
     * A lavagem que nao cabe nao some: anda para o proximo dia com vaga, que e
     * o mesmo tratamento do dia cheio.
     */
    const jazigoLivre = (d: string, it: ServicoPend) =>
      !it.tumulo_id || !jazigoNoDia.get(d)?.has(it.tumulo_id);

    const cabe = (d: string, it: ServicoPend) => vagas(d) > 0 && jazigoLivre(d, it);

    const por = (d: string, it: ServicoPend) => {
      const arr = slots.get(d) || [];
      arr.push(it);
      slots.set(d, arr);
      marcarJazigo(d, it.tumulo_id);
    };
    const primeiraVagaDe = (de: string, it: ServicoPend) => {
      let d = proximoDiaDoGrupo(de);
      let guarda = 0;
      while (!cabe(d, it) && guarda < 400) { d = proximoDiaDoGrupo(addDias(d, 1)); guarda++; }
      return d;
    };

    const ordemPadrao = (a: ServicoPend, b: ServicoPend) => {
      // A coluna (história) MAIS a régua (o mundo de hoje). Ver o comentário
      // em `pontosDaRegua`, acima.
      const pa = (a.prioridade || 0) + (pontosDaRegua.get(a.id) || 0);
      const pb = (b.prioridade || 0) + (pontosDaRegua.get(b.id) || 0);
      if (pa !== pb) return pb - pa;
      const da = a.data_prevista || "9999-99-99";
      const db_ = b.data_prevista || "9999-99-99";
      if (da !== db_) return da < db_ ? -1 : 1;
      return a.tumulo.quadra_ordem - b.tumulo.quadra_ordem;
    };

    // 1ª passada — data pedida manda. Quem pediu para mais cedo escolhe primeiro.
    const comData = grupo.itens
      .filter((i) => !!i.data_desejada)
      .sort((a, b) => {
        const da = a.data_desejada!;
        const db_ = b.data_desejada!;
        if (da !== db_) return da < db_ ? -1 : 1;
        return ordemPadrao(a, b);
      });

    for (const it of comData) {
      const alvoBruto = it.data_desejada! < primeiroDia ? primeiroDia : it.data_desejada!;
      const alvo = proximoDiaDoGrupo(alvoBruto);

      if (cabe(alvo, it)) { por(alvo, it); continue; }

      // dia cheio: anda para trás, nunca para frente
      let d = diaAnteriorDoGrupo(alvo);
      let achou: string | null = null;
      let guarda = 0;
      while (d >= primeiroDia && guarda < 400) {
        if (cabe(d, it)) { achou = d; break; }
        d = diaAnteriorDoGrupo(d);
        guarda++;
      }
      if (achou) { por(achou, it); continue; }

      estourados.add(it.id);
      por(primeiraVagaDe(primeiroDia, it), it);
    }

    // ------------------------------------------------------------------
    // 2ª passada — o resto ocupa o que sobrou, A PARTIR DO DIA EM QUE É DEVIDO
    //
    // ⚠ O QUE ESTAVA ERRADO AQUI, e como apareceu
    //
    // Isto empacotava TUDO a partir do primeiro dia com vaga: `cursor` começava
    // em `primeiroDia` e só andava quando o dia enchia. Com capacidade de 20 por
    // dia e poucos serviços, o horizonte inteiro caía no mesmo dia.
    //
    // Medido em produção em 23/08: os 8 serviços pendentes eram TRÊS do jazigo
    // "Souza" e CINCO do "Nagae" — as visitas semanais e quinzenais geradas para
    // 17/08, 24/08, 31/08, 07/09 e 14/09 —, todas com `data_prevista = 18/08`.
    // A lavagem devida em setembro estava marcada para agosto.
    //
    // O efeito no chão: o app de campo mostrava o mesmo jazigo cinco vezes
    // seguidas. A ordenação por endereço estava certa e não tinha o que ordenar
    // — parecia que a roteirização não funcionava, e o que não funcionava era a
    // data.
    //
    // Antecipar por semanas não é otimizar: é lavar (e cobrar) fora do
    // combinado. A data do plano passa a ser o dia MAIS CEDO possível; atrasar
    // quando o dia está cheio continua valendo, adiantar não.
    //
    // `data_plano` e não `data_prevista`: o alocador REESCREVE `data_prevista` a
    // cada passada, então numa segunda rodada ele leria a data que ele mesmo
    // escreveu. `data_plano` é a teórica, congelada no nascimento do serviço.
    // Sem a coluna (banco antigo), cai em `data_prevista` — que na primeira
    // passada ainda é a data do plano.
    // ------------------------------------------------------------------
    const devidoEm = (i: ServicoPend) => {
      const d = i.data_plano || i.data_prevista || primeiroDia;
      // Serviço atrasado é devido HOJE, não no passado: puxá-lo para trás não
      // recupera o tempo, só o esconde num dia que já passou.
      return d < primeiroDia ? primeiroDia : d;
    };

    const semData = grupo.itens
      .filter((i) => !i.data_desejada)
      .sort((a, b) => {
        const da = devidoEm(a);
        const db_ = devidoEm(b);
        if (da !== db_) return da < db_ ? -1 : 1;
        return ordemPadrao(a, b);
      });

    for (const it of semData) {
      por(primeiraVagaDe(devidoEm(it), it), it);
    }

    // ---- grava ------------------------------------------------------------
    for (const dia of [...slots.keys()].sort()) {
      const doDia = slots.get(dia)!;
      if (!doDia.length) continue;
      diasComAlgo.add(dia);

      // Dentro do dia, a ordem sai do endereço. Como cada grupo é UM cemitério,
      // a ordem da quadra volta a significar "a sequência em que se anda por
      // aquele cemitério".
      //
      // A divisão por quadra NÃO acontece mais aqui, e sim dentro de
      // `ordenarPorEndereco`. O motivo é a Rua 7: ela é a divisa, com um lado
      // na Quadra 1 e o outro na Quadra 3. Partindo por quadra antes de
      // ordenar, ela virava duas paradas e a Nina andava a mesma rua duas
      // vezes no mesmo dia.
      const sequencia: ServicoPend[] = ordenarPorEndereco(doDia);

      // ==================================================================
      // O ALOCADOR NÃO NOMEIA NINGUÉM.
      //
      // Ele escrevia `executora_id: turno.userId` — toda limpeza nascia com o
      // nome de alguém colado nela. Isso pressupõe equipe fixa, e não é o caso:
      // "limpeza é limpeza", e quem lava pode ser gente que não está na escala.
      //
      // Agora o campo `executora_id` NÃO É TOCADO aqui. Consequências, todas
      // desejadas:
      //
      //   · serviço sem dono aparece para toda a equipe — `/api/agenda/dia` já
      //     devolve `executora_id is null` para quem estiver logado;
      //   · QUEM COMEÇA, ASSUME: `sureya_iniciar_lavagem` (0068) faz
      //     `executora_id = coalesce(executora_id, quem_chamou)`. Duas pessoas
      //     no mesmo dia não fazem o mesmo jazigo duas vezes, e a remuneração
      //     vai para quem realmente lavou;
      //   · quem foi definido À MÃO na agenda continua definido — o alocador
      //     não desfaz decisão de gente, do mesmo jeito que já respeita
      //     `fixado_em`.
      //
      // A capacidade da equipe continua valendo: os turnos ainda dizem quantas
      // limpezas cabem no dia. O que sai é só o nome no papel.
      // ==================================================================
      let pos = 0;
      // A ordem do dia agora é do DIA, não de cada pessoa: é a sequência em que
      // se anda pelo cemitério. Por pessoa, duas listas começavam em "1" e a
      // ordem deixava de ser um roteiro.
      let ordem = 1;
      for (const turno of turnosDoGrupo) {
        const cabe = restaDoTurno(dia, turno);
        if (cabe <= 0) continue;
        const bloco = sequencia.slice(pos, pos + cabe);
        if (!bloco.length) continue;
        pos += bloco.length;
        usado.set(chave(dia, turno.userId), (usado.get(chave(dia, turno.userId)) || 0) + bloco.length);

        for (const it of bloco) {
          const campos: Record<string, any> = {
            data_prevista: dia,
            ordem_dia: ordem,
            status: "agendado",
          };
          if (temDesejada) campos.desejada_estourada = estourados.has(it.id);
          if (temCemiterio && it.cemiterio_id) campos.cemiterio_id = it.cemiterio_id;
          await db.from("servicos").update(campos).eq("id", it.id).eq("org_id", org);
          ordem++;
          agendados++;
        }
      }
    }
  }

  dias = diasComAlgo.size;
  return { agendados, dias, semDia };
}

/**
 * REFAZER O ROTEIRO DOS PRÓXIMOS DIAS.
 *
 * O QUE ISTO RESOLVE
 *
 * `alocarAgenda` só enxerga o que está `pendente` e solto. No instante em que
 * ela aloca, a lavagem vira `agendado` e some do radar — para sempre. Por isso
 * contrato novo é encaixado nas frestas dos dias com vaga, e o roteiro que já
 * existia nunca é repensado. Excluir um túmulo deixa o buraco aberto; puxar
 * uma lavagem não junta as outras.
 *
 * Enquanto eram poucos contratos, encaixar bastava. Com todos os túmulos
 * virando contrato nesta semana, deixa de bastar.
 *
 * O QUE ELA MEXE — e o que não mexe
 *
 *   solta e redistribui   agendado, de amanhã em diante, não fixado, não
 *                         iniciado e sem foto
 *   não toca              hoje, o passado, o que foi remarcado à mão, o que
 *                         já começou e o que já tem foto
 *
 * A escolha do dia continua sendo do alocador — é ele que conhece capacidade,
 * jornada, rua e a regra de uma lavagem por jazigo por dia. Aqui só se abre a
 * mão para ele poder distribuir de novo.
 */
export async function refazerRoteiro(
  aPartirDe?: string,
): Promise<{ soltos: number; agendados: number; dias: number; de: string; semDia: SemDia[] }> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const de = aPartirDe && aPartirDe > isoHoje() ? aPartirDe : addDias(isoHoje(), 1);

  const { data: soltos, error } = await db.rpc("sureya_soltar_roteiro", {
    p_de: de, p_org: org,
  });
  if (error) throw new Error(`soltar o roteiro: ${error.message}`);

  const aloc = await alocarAgenda({ aPartirDe: de });

  // O MARCO DO "REFEITO". A tela compara este instante com o nascimento das
  // lavagens futuras para dizer quantas entraram depois — e só então oferecer
  // o botão. Sem o marco, "o roteiro está velho" seria palpite.
  await db.from("orgs")
    .update({ roteiro_refeito_em: new Date().toISOString() })
    .eq("id", org);

  return { soltos: Number(soltos) || 0, de, ...aloc };
}

// ============================================================================
// CALENDÁRIO DE UM MÊS ESPECÍFICO
// Gera o que os planos devem NAQUELE mês, sem tocar no que já existe.
//
// NÃO GERA AVULSO (0128). Havia aqui um ramo que criava, de uma vez, uma
// lavagem para todo plano de cadência não recorrente — o caso do Finados. Era
// a única máquina do sistema que fabricava avulso sem ninguém pedir, e a regra
// é a oposta: avulso é o que a família solicita. Cada família que pede ganha o
// seu pedido, com a data e o preço dela.
// ============================================================================
export interface CalendarioMes {
  mes: string;
  criados: number;
  jaExistiam: number;
  planosNoMes: number;
  agendados: number;
  dias: number;
}

export async function gerarCalendarioMes(
  mes: string,                       // "2026-11"
  opcoes?: { distribuir?: boolean }
): Promise<CalendarioMes> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const ini = `${mes}-01`;
  const d = new Date(ini + "T00:00:00Z");
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

  const { data: planos } = await db
    .from("planos")
    .select("id,cliente_id,tumulo_id,cadencia,qtd_por_passagem,lavagens_por_ciclo,valor_vigente,proximo_servico")
    .eq("org_id", org)
    .eq("ativo", true);

  let criados = 0;
  let jaExistiam = 0;
  let planosNoMes = 0;

  for (const p of (planos || []) as any[]) {
    // PLANO SEM CICLO NÃO GERA NADA AQUI (0128).
    //
    // Cadência "avulso" ou "por_data" quer dizer que a família contrata uma ida
    // por vez. Isso é PEDIDO, e pedido tem dono, data e preço próprios — nasce
    // pela ficha da família ou pelo aviso da conversa, uma linha de cada vez.
    // Criar em lote, para todo mundo, era fabricar avulso sem ninguém pedir.
    if (!DIAS_CICLO[p.cadencia]) continue;

    // recorrentes: percorre o ciclo até cobrir o mês pedido
    const cicloDias = DIAS_CICLO[p.cadencia];
    const qtd = Math.max(1, Number(p.lavagens_por_ciclo ?? p.qtd_por_passagem) || 1);
    const passo = Math.max(1, Math.round(cicloDias / qtd));

    let prox: string = p.proximo_servico || isoHoje();
    let guarda = 0;
    while (prox < ini && guarda < 400) { prox = addDias(prox, passo); guarda++; }

    const comColuna = await temDataPlano(db);
    const existentes = await servicosDoPlano(db, org, p.id, comColuna);
    const tolerancia = toleranciaDoPasso(passo);

    let entrouNoMes = false;
    while (prox >= ini && prox <= fim && guarda < 400) {
      guarda++;
      entrouNoMes = true;

      if (jaTemServico(existentes, prox, tolerancia, ["pendente", "agendado", "executado"])) {
        jaExistiam++;
      } else {
        const linha: any = {
          org_id: org, tumulo_id: p.tumulo_id, plano_id: p.id, cliente_id: p.cliente_id,
          data_prevista: prox, status: "pendente", valor: p.valor_vigente,
        };
        if (comColuna) linha.data_plano = prox;

        const { error } = await db.from("servicos").insert(linha);
        if (!error) {
          criados++;
          existentes.push({
            id: "novo", data_plano: comColuna ? prox : null,
            data_prevista: prox, status: "pendente",
          });
        } else {
          jaExistiam++;
        }
      }
      prox = addDias(prox, passo);
    }
    if (entrouNoMes) planosNoMes++;
  }

  const aloc = opcoes?.distribuir === false
    ? { agendados: 0, dias: 0 }
    : await alocarAgenda();

  return { mes, criados, jaExistiam, planosNoMes, ...aloc };
}
