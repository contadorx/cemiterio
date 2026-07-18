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
function proximoDiaUtil(iso: string): string {
  let d = iso;
  while (ehDomingo(d)) d = addDias(d, 1);
  return d;
}

// ----------------------------------------------------------------------------
// GERADOR: transforma planos recorrentes vencidos em serviços "pendente".
// Avança o proximo_servico de cada plano. Avulso/por_data não entram.
// ----------------------------------------------------------------------------
export async function gerarServicosDevidos(horizonteDias = 30): Promise<{ criados: number }> {
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

  for (const p of planos || []) {
    const cicloDias = DIAS_CICLO[(p as any).cadencia];
    const qtd = Math.max(1, Number((p as any).qtd_por_passagem) || 1);
    const passo = Math.max(1, Math.round(cicloDias / qtd));

    let prox: string = (p as any).proximo_servico || isoHoje();
    let guarda = 0; // trava anti-loop

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

  return { criados };
}

// ----------------------------------------------------------------------------
// ALOCADOR: distribui os serviços pendentes em dias respeitando a capacidade,
// agrupando por quadra e ordenando por proximidade dentro da quadra.
// ----------------------------------------------------------------------------
interface ServicoPend {
  id: string;
  data_prevista: string | null;
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

  // capacidade/dia
  const { data: orgRow } = await db
    .from("orgs")
    .select("limpezas_por_dia")
    .eq("id", org)
    .single();
  const capacidade = Number((orgRow as any)?.limpezas_por_dia) || 20;

  // pendentes não alocados ou a realocar
  const { data: pend } = await db
    .from("servicos")
    .select("id,data_prevista,tumulos(identificacao,lat,lng,quadras(ordem))")
    .eq("org_id", org)
    .eq("status", "pendente");

  const itens: ServicoPend[] = (pend || []).map((s: any) => ({
    id: s.id,
    data_prevista: s.data_prevista,
    tumulo: {
      identificacao: s.tumulos?.identificacao || "",
      lat: s.tumulos?.lat ?? null,
      lng: s.tumulos?.lng ?? null,
      quadra_ordem: s.tumulos?.quadras?.ordem ?? 9999,
    },
  }));

  if (!itens.length) return { agendados: 0, dias: 0 };

  // prioridade: vencimento mais antigo primeiro, depois quadra
  itens.sort((a, b) => {
    const da = a.data_prevista || "9999-99-99";
    const db_ = b.data_prevista || "9999-99-99";
    if (da !== db_) return da < db_ ? -1 : 1;
    return a.tumulo.quadra_ordem - b.tumulo.quadra_ordem;
  });

  // empacota em dias de capacidade fixa, começando hoje (pula domingo)
  let dia = proximoDiaUtil(isoHoje());
  let dias = 0;
  let agendados = 0;

  for (let i = 0; i < itens.length; i += capacidade) {
    const doDia = itens.slice(i, i + capacidade);
    dias++;

    // dentro do dia: agrupa por quadra e ordena por proximidade
    const porQuadra = new Map<number, ServicoPend[]>();
    for (const it of doDia) {
      const arr = porQuadra.get(it.tumulo.quadra_ordem) || [];
      arr.push(it);
      porQuadra.set(it.tumulo.quadra_ordem, arr);
    }
    const quadrasOrdenadas = [...porQuadra.keys()].sort((a, b) => a - b);

    let ordem = 1;
    for (const q of quadrasOrdenadas) {
      const rota = ordenarPorProximidade(porQuadra.get(q)!);
      for (const it of rota) {
        await db
          .from("servicos")
          .update({ data_prevista: dia, ordem_dia: ordem, status: "agendado" })
          .eq("id", it.id)
          .eq("org_id", org);
        ordem++;
        agendados++;
      }
    }
    dia = proximoDiaUtil(addDias(dia, 1));
  }

  return { agendados, dias };
}
