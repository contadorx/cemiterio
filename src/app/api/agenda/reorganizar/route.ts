import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { alocarAgenda } from "@/lib/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * A SAUDE DA AGENDA — e por que ela mentia.
 *
 * O GET contava aqui, em TypeScript, com regra propria: dia fora da jornada OU
 * data no passado. O POST chamava `sureya_reorganizar_agenda`, que so mexia em
 * `data_prevista <> proximo_dia_util(data_prevista)`.
 *
 * As duas lavagens paradas em 17/08/2026 estavam numa SEGUNDA — dia de
 * trabalho. O contador as via (estavam no passado); a funcao nao (o dia era
 * valido). Resultado medido em producao: o aviso "2 lavagens fora do lugar"
 * ficava na tela para sempre e o botao "Reorganizar" nao movia nada. Nao era
 * um bug intermitente, era aritmetica: as duas respostas nunca podiam bater.
 *
 * Agora ha UMA regra, no banco (0092), e as duas pontas leem dela. O GET nao
 * decide mais nada — so pergunta.
 */

// GET — o que está fora do lugar, discriminado (só olha, não mexe)
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { data, error } = await auth.db.rpc("sureya_agenda_fora_do_lugar", {
    p_dias_a_frente: 120,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const r = (Array.isArray(data) ? data[0] : data) || {};
  return NextResponse.json({
    ok: true,
    foraDaJornada: Number(r.total) || 0,
    // A discriminação existe porque as três causas pedem leituras diferentes:
    // "atrasada" é trabalho que não foi feito, "repetida" é erro de
    // distribuição, "dia que não se trabalha" é a jornada que mudou.
    diaNaoUtil: Number(r.dia_nao_util) || 0,
    atrasadas: Number(r.atrasadas) || 0,
    repetidas: Number(r.repetidas) || 0,
    primeiraData: r.primeira_data || null,
  });
}

// POST { diasAFrente } — devolve o que está fora do lugar para a fila e redistribui
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  const dias = Math.max(7, Math.min(365, Number(b?.diasAFrente) || 120));

  const { data, error } = await auth.db.rpc("sureya_reorganizar_agenda", {
    p_dias_a_frente: dias,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const r = (Array.isArray(data) ? data[0] : data) || {};
  // A função só devolve as lavagens para `pendente` com a data teórica delas.
  // Quem escolhe o dia é o alocador, que é quem conhece capacidade, jornada,
  // rua e a regra de uma lavagem por jazigo por dia.
  const aloc = await alocarAgenda();

  return NextResponse.json({
    ok: true,
    movidos: r.movidos || 0,
    paraHoje: r.para_hoje || 0,
    diasLiberados: r.dias_liberados || 0,
    porDiaRuim: r.por_dia_ruim || 0,
    porAtraso: r.por_atraso || 0,
    porRepeticao: r.por_repeticao || 0,
    ...aloc,
  });
}
