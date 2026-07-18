import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

// Dias de cada ciclo. qtd_por_passagem subdivide o ciclo:
// mensal + 2/passagem => passa a cada ~15 dias (2x/mês). mensal + 1 => 30 dias.
export const DIAS_CICLO: Record<string, number> = {
  mensal: 30,
  bimestral: 60,
  trimestral: 90,
  semestral: 180,
  anual: 365,
};

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function ehDomingo(iso: string): boolean {
  return new Date(iso + "T00:00:00").getDay() === 0;
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
    .select("id,cliente_id,tumulo_id,cadencia,qtd_por_passagem,valor_vigente,proximo_servico")
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
    const qtd = Math.max(1, Number((p as any).qtd_por_passagem) || 1);
    const passo = Math.max(1, Math.round(cicloDias / qtd));

    let prox: string = (p as any).proximo_servico || isoHoje();
    let guarda = 0; // trava anti-loop

    if (prox > limite) {
      foraDoHorizonte++;
      if (!proximaData || prox < proximaData) proximaData = prox;
      continue;
    }
    noHorizonte++;

    while (prox <= limite && guarda < 60) {
      guarda++;

      // evita duplicar: já existe serviço aberto desse plano nessa data?
      const { data: existe } = await db
        .from("servicos")
        .select("id")
        .eq("org_id", org)
        .eq("plano_id", (p as any).id)
        .eq("data_prevista", prox)
        .in("status", ["pendente", "agendado"])
        .maybeSingle();

      if (existe) jaExistiam++;
      if (!existe) {
        const { error } = await db.from("servicos").insert({
          org_id: org,
          tumulo_id: (p as any).tumulo_id,
          plano_id: (p as any).id,
          cliente_id: (p as any).cliente_id,
          data_prevista: prox,
          status: "pendente",
          valor: (p as any).valor_vigente,
        });
        if (!error) criados++;
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
  const { data: pend } = await db
    .from("servicos")
    .select("id,data_prevista,prioridade,tumulos(identificacao,lat,lng,quadras(ordem))")
    .eq("org_id", org)
    .eq("status", "pendente");

  const itens: ServicoPend[] = (pend || []).map((s: any) => ({
    id: s.id,
    data_prevista: s.data_prevista,
    prioridade: s.prioridade || 0,
    tumulo: {
      identificacao: s.tumulos?.identificacao || "",
      lat: s.tumulos?.lat ?? null,
      lng: s.tumulos?.lng ?? null,
      quadra_ordem: s.tumulos?.quadras?.ordem ?? 9999,
    },
  }));

  if (!itens.length) return { agendados: 0, dias: 0 };

  // prioridade: o que já foi adiado vem primeiro; depois vencimento; depois quadra
  itens.sort((a, b) => {
    const pa = (a as any).prioridade || 0;
    const pb = (b as any).prioridade || 0;
    if (pa !== pb) return pb - pa;
    const da = a.data_prevista || "9999-99-99";
    const db_ = b.data_prevista || "9999-99-99";
    if (da !== db_) return da < db_ ? -1 : 1;
    return a.tumulo.quadra_ordem - b.tumulo.quadra_ordem;
  });

  // empacota em dias, começando hoje (pula domingo)
  const jornada = await carregarJornada();
  let dia = proximoDiaUtil(isoHoje(), jornada);
  let dias = 0;
  let agendados = 0;

  for (let i = 0; i < itens.length; i += capacidadeDia) {
    const doDia = itens.slice(i, i + capacidadeDia);
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
        await db
          .from("servicos")
          .update({
            data_prevista: dia,
            ordem_dia: ordem,
            status: "agendado",
            executora_id: turno.userId,
          })
          .eq("id", it.id)
          .eq("org_id", org);
        ordem++;
        agendados++;
      }
    }
    dia = proximoDiaUtil(addDias(dia, 1), jornada);
  }

  return { agendados, dias };
}
