import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { diaOperacao, somaDias } from "./vencimento";

// Dias de cada ciclo. qtd_por_passagem subdivide o ciclo:
// mensal + 2/passagem => passa a cada ~15 dias (2x/mês). mensal + 1 => 30 dias.
export const DIAS_CICLO: Record<string, number> = {
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
// Jornada configurada: quais dias a equipe trabalha e quais datas estão bloqueadas.
interface Jornada {
  dias: number[];          // 0=dom ... 6=sáb
  bloqueadas: Set<string>; // feriados / dias sem campo
}

async function carregarJornada(): Promise<Jornada> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const { data: o } = await db.from("orgs").select("dias_semana").eq("id", org).maybeSingle();
  const { data: bl } = await db
    .from("dias_sem_campo").select("data").eq("org_id", org).gte("data", isoHoje());
  const dias = Array.isArray((o as any)?.dias_semana) && (o as any).dias_semana.length
    ? ((o as any).dias_semana as number[])
    : [1, 2, 3, 4, 5, 6];
  return { dias, bloqueadas: new Set((bl || []).map((x: any) => x.data)) };
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

  const { data: planos } = await db
    .from("planos")
    .select("id,cliente_id,tumulo_id,cadencia,qtd_por_passagem,lavagens_por_ciclo,valor_vigente,proximo_servico")
    .eq("org_id", org)
    .eq("ativo", true)
    .in("cadencia", Object.keys(DIAS_CICLO));

  let criados = 0;
  let jaExistiam = 0;
  let noHorizonte = 0;
  let foraDoHorizonte = 0;
  let proximaData: string | null = null;

  for (const p of planos || []) {
    const cicloDias = DIAS_CICLO[(p as any).cadencia];
    const qtd = Math.max(1, Number((p as any).lavagens_por_ciclo ?? (p as any).qtd_por_passagem) || 1);
    const passo = Math.max(1, Math.round(cicloDias / qtd));

    let prox: string = (p as any).proximo_servico || isoHoje();
    let guarda = 0; // trava anti-loop

    if (prox > limite) {
      foraDoHorizonte++;
      if (!proximaData || prox < proximaData) proximaData = prox;
      continue;
    }
    noHorizonte++;

    const comColuna = await temDataPlano(db);
    const existentes = await servicosDoPlano(db, org, (p as any).id, comColuna);
    const tolerancia = toleranciaDoPasso(passo);

    while (prox <= limite && guarda < 60) {
      guarda++;

      // evita duplicar: ja existe servico aberto desse plano nesta data teorica?
      if (jaTemServico(existentes, prox, tolerancia, ["pendente", "agendado"])) {
        jaExistiam++;
      } else {
        const linha: any = {
          org_id: org,
          tumulo_id: (p as any).tumulo_id,
          plano_id: (p as any).id,
          cliente_id: (p as any).cliente_id,
          data_prevista: prox,
          status: "pendente",
          valor: (p as any).valor_vigente,
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
        } else {
          // o indice unico da 0032 barrou: ja existia mesmo
          jaExistiam++;
        }
      }
      prox = addDias(prox, passo);
    }

    await db.from("planos").update({ proximo_servico: prox }).eq("id", (p as any).id);
  }

  return {
    criados,
    planosAtivos: (planos || []).length,
    planosNoHorizonte: noHorizonte,
    foraDoHorizonte,
    jaExistiam,
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
  data_prevista: string | null;
  data_desejada?: string | null;   // a data que a família pediu (0037) — nunca reescrita
  prioridade?: number;
  tumulo: { identificacao: string; lat: number | null; lng: number | null; quadra_ordem: number };
}

// vizinho-mais-próximo guloso dentro de uma quadra (coords ausentes vão ao fim)
function ordenarPorProximidade(itens: ServicoPend[]): ServicoPend[] {
  const comCoord = itens.filter((i) => i.tumulo.lat != null && i.tumulo.lng != null);
  const semCoord = itens
    .filter((i) => i.tumulo.lat == null || i.tumulo.lng == null)
    .sort((a, b) => a.tumulo.identificacao.localeCompare(b.tumulo.identificacao));

  if (comCoord.length <= 1) return [...comCoord, ...semCoord];

  const restante = [...comCoord];
  const rota: ServicoPend[] = [restante.shift()!];
  while (restante.length) {
    const atual = rota[rota.length - 1].tumulo;
    let melhor = 0;
    let melhorD = Infinity;
    restante.forEach((cand, i) => {
      const dx = (cand.tumulo.lat! - atual.lat!) ;
      const dy = (cand.tumulo.lng! - atual.lng!);
      const d = dx * dx + dy * dy; // euclidiano ao quadrado basta p/ ordenar
      if (d < melhorD) { melhorD = d; melhor = i; }
    });
    rota.push(restante.splice(melhor, 1)[0]);
  }
  return [...rota, ...semCoord];
}

export async function alocarAgenda(): Promise<{ agendados: number; dias: number }> {
  const db = supabaseAdmin();
  const org = env.orgId();

  // capacidade/dia padrão da org
  const { data: orgRow } = await db
    .from("orgs")
    .select("limpezas_por_dia")
    .eq("id", org)
    .maybeSingle();
  const capacidadePadrao = Number((orgRow as any)?.limpezas_por_dia) || 20;

  // D5: ajudantes ativas (papel campo). Cada uma pode ter capacidade própria.
  const { data: campo } = await db
    .from("membros")
    .select("user_id,nome,limpezas_por_dia,ativo")
    .eq("org_id", org)
    .eq("papel", "campo");

  const equipe = (campo || [])
    .filter((m: any) => m.ativo !== false)
    .map((m: any) => ({
      userId: m.user_id as string,
      capacidade: Number(m.limpezas_por_dia) || capacidadePadrao,
    }));

  // sem ajudante cadastrada: opera como antes (um turno único, sem executora)
  const turnos =
    equipe.length > 0 ? equipe : [{ userId: null as string | null, capacidade: capacidadePadrao }];
  const capacidadeDia = turnos.reduce((s, t) => s + t.capacidade, 0);

  // pendentes não alocados ou a realocar
  // (data_desejada é da migration 0037; se ela ainda não rodou, o select falha
  //  e caímos no select antigo — a agenda continua funcionando como antes)
  const r1 = await db
    .from("servicos")
    .select("id,data_prevista,data_desejada,prioridade,tumulos(identificacao,lat,lng,quadras(ordem))")
    .eq("org_id", org)
    .eq("status", "pendente");

  let temDesejada = true;
  let pend: any[] | null = r1.data as any;
  if (!pend) {
    temDesejada = false;
    const r2 = await db
      .from("servicos")
      .select("id,data_prevista,prioridade,tumulos(identificacao,lat,lng,quadras(ordem))")
      .eq("org_id", org)
      .eq("status", "pendente");
    pend = r2.data as any;
  }

  const itens: ServicoPend[] = (pend || []).map((s: any) => ({
    id: s.id,
    data_prevista: s.data_prevista,
    data_desejada: s.data_desejada ?? null,
    prioridade: s.prioridade || 0,
    tumulo: {
      identificacao: s.tumulos?.identificacao || "",
      lat: s.tumulos?.lat ?? null,
      lng: s.tumulos?.lng ?? null,
      quadra_ordem: s.tumulos?.quadras?.ordem ?? 9999,
    },
  }));

  if (!itens.length) return { agendados: 0, dias: 0 };

  const jornada = await carregarJornada();
  const primeiroDia = proximoDiaUtil(isoHoje(), jornada);

  // --------------------------------------------------------------------------
  // MONTAGEM DOS DIAS
  //
  // Antes isto era uma fatia burra: ordenava tudo e cortava de N em N. A data
  // que a família pediu não tinha voz nenhuma — o serviço caía onde a fila
  // deixasse, inclusive DEPOIS do dia combinado.
  //
  // Agora são duas passadas:
  //   1ª — quem tem DATA DESEJADA escolhe o dia: tenta o dia exato; se estiver
  //        cheio, ANDA PARA TRÁS (antecipa) até achar vaga; nunca passa da data.
  //        Se não couber nem antes, é marcado como estourado e vai para o dia
  //        mais cedo com vaga — visível e vermelho, em vez de atrasado calado.
  //   2ª — todo o resto preenche as vagas que sobraram, do dia mais próximo em
  //        diante, na ordem de sempre (prioridade, vencimento, quadra).
  // --------------------------------------------------------------------------
  const slots = new Map<string, ServicoPend[]>();
  const estourados = new Set<string>();

  function vagas(d: string): number {
    return capacidadeDia - (slots.get(d)?.length || 0);
  }
  function por(d: string, it: ServicoPend) {
    const arr = slots.get(d) || [];
    arr.push(it);
    slots.set(d, arr);
  }
  function diaUtilAnterior(d: string): string {
    let x = addDias(d, -1);
    let guarda = 0;
    while (proximoDiaUtil(x, jornada) !== x && guarda < 40) {
      x = addDias(x, -1);
      guarda++;
    }
    return x;
  }
  // primeiro dia útil com vaga, a partir de `de`
  function primeiraVagaDe(de: string): string {
    let d = proximoDiaUtil(de, jornada);
    let guarda = 0;
    while (vagas(d) <= 0 && guarda < 400) {
      d = proximoDiaUtil(addDias(d, 1), jornada);
      guarda++;
    }
    return d;
  }

  const ordemPadrao = (a: ServicoPend, b: ServicoPend) => {
    const pa = a.prioridade || 0;
    const pb = b.prioridade || 0;
    if (pa !== pb) return pb - pa;
    const da = a.data_prevista || "9999-99-99";
    const db_ = b.data_prevista || "9999-99-99";
    if (da !== db_) return da < db_ ? -1 : 1;
    return a.tumulo.quadra_ordem - b.tumulo.quadra_ordem;
  };

  // 1ª passada — data pedida manda. Quem pediu para mais cedo escolhe primeiro.
  const comData = itens
    .filter((i) => !!i.data_desejada)
    .sort((a, b) => {
      const da = a.data_desejada!;
      const db_ = b.data_desejada!;
      if (da !== db_) return da < db_ ? -1 : 1;
      return ordemPadrao(a, b);
    });

  for (const it of comData) {
    // data já vencida (ou hoje) vira "o quanto antes"
    const alvoBruto = it.data_desejada! < primeiroDia ? primeiroDia : it.data_desejada!;
    const alvo = proximoDiaUtil(alvoBruto, jornada);

    if (vagas(alvo) > 0) { por(alvo, it); continue; }

    // dia cheio: anda para trás, nunca para frente
    let d = diaUtilAnterior(alvo);
    let achou: string | null = null;
    let guarda = 0;
    while (d >= primeiroDia && guarda < 400) {
      if (vagas(d) > 0) { achou = d; break; }
      d = diaUtilAnterior(d);
      guarda++;
    }

    if (achou) { por(achou, it); continue; }

    // não coube até a data pedida — o mais cedo possível, e marcado
    estourados.add(it.id);
    por(primeiraVagaDe(primeiroDia), it);
  }

  // 2ª passada — o resto ocupa o que sobrou
  const semData = itens.filter((i) => !i.data_desejada).sort(ordemPadrao);
  let cursor = primeiroDia;
  for (const it of semData) {
    cursor = primeiraVagaDe(cursor);
    por(cursor, it);
  }

  let dias = 0;
  let agendados = 0;

  for (const dia of [...slots.keys()].sort()) {
    const doDia = slots.get(dia)!;
    if (!doDia.length) continue;
    dias++;

    // dentro do dia: agrupa por quadra e ordena por proximidade
    const porQuadra = new Map<number, ServicoPend[]>();
    for (const it of doDia) {
      const arr = porQuadra.get(it.tumulo.quadra_ordem) || [];
      arr.push(it);
      porQuadra.set(it.tumulo.quadra_ordem, arr);
    }
    const quadrasOrdenadas = [...porQuadra.keys()].sort((a, b) => a - b);

    // sequência do dia já otimizada por quadra/proximidade
    const sequencia: ServicoPend[] = [];
    for (const q of quadrasOrdenadas) sequencia.push(...ordenarPorProximidade(porQuadra.get(q)!));

    // reparte a sequência entre as ajudantes, em blocos contíguos
    // (blocos contíguos preservam a proximidade: cada uma pega quadras vizinhas)
    let pos = 0;
    for (const turno of turnos) {
      const bloco = sequencia.slice(pos, pos + turno.capacidade);
      pos += turno.capacidade;
      let ordem = 1;
      for (const it of bloco) {
        const campos: Record<string, any> = {
          data_prevista: dia,
          ordem_dia: ordem,
          status: "agendado",
          executora_id: turno.userId,
        };
        // só escreve o aviso se a coluna existe (0037)
        if (temDesejada) campos.desejada_estourada = estourados.has(it.id);
        await db.from("servicos").update(campos).eq("id", it.id).eq("org_id", org);
        ordem++;
        agendados++;
      }
    }
  }

  return { agendados, dias };
}

// ============================================================================
// CALENDÁRIO DE UM MÊS ESPECÍFICO
// Gera o que os planos devem NAQUELE mês, sem tocar no que já existe.
// Também permite incluir os AVULSOS que só contratam para uma data — o caso do
// Finados, em que a família paga apenas por aquela ida.
// ============================================================================
export interface CalendarioMes {
  mes: string;
  criados: number;
  jaExistiam: number;
  avulsosIncluidos: number;
  planosNoMes: number;
  agendados: number;
  dias: number;
}

export async function gerarCalendarioMes(
  mes: string,                       // "2026-11"
  opcoes?: { incluirAvulsos?: boolean; dataAvulsos?: string; distribuir?: boolean }
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
  let avulsosIncluidos = 0;

  for (const p of (planos || []) as any[]) {
    const ehAvulso = !DIAS_CICLO[p.cadencia];

    // avulso só entra se pedirem explicitamente (ex.: campanha de Finados)
    if (ehAvulso) {
      if (!opcoes?.incluirAvulsos) continue;
      const data = opcoes?.dataAvulsos || fim;
      if (data < ini || data > fim) continue;

      const comColunaA = await temDataPlano(db);
      const existentesA = await servicosDoPlano(db, org, p.id, comColunaA);
      if (jaTemServico(existentesA, data, 0, ["pendente", "agendado", "executado"])) {
        jaExistiam++; continue;
      }

      const linhaA: any = {
        org_id: org, tumulo_id: p.tumulo_id, plano_id: p.id, cliente_id: p.cliente_id,
        data_prevista: data, status: "pendente", valor: p.valor_vigente, prioridade: 5,
      };
      if (comColunaA) linhaA.data_plano = data;

      const { error } = await db.from("servicos").insert(linhaA);
      if (!error) { criados++; avulsosIncluidos++; } else jaExistiam++;
      continue;
    }

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

  return { mes, criados, jaExistiam, avulsosIncluidos, planosNoMes, ...aloc };
}
