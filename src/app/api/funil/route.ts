import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O FUNIL DO DINHEIRO NUMA COMPETÊNCIA.
 *
 *   a identificar  →  dinheiro no banco sem dono
 *   a conciliar    →  comprovante informado e não conferido
 *   em aberto      →  famílias devendo, na foto do FIM do mês
 *   pronto p/ fechar → o mês acabou e não há pendência
 *   fechado        →  é um fato gravado, com data e autor
 *
 * As contas moram no banco (`sureya_funil`, migration 0075) e não aqui. É a
 * mesma razão de `calcularSaldo`: regra de dinheiro em dois lugares vira dois
 * números diferentes, e quem descobre é a família.
 */
function primeiroDiaDoMes(v: string | null): string {
  const hoje = new Date();
  const base = v && /^\d{4}-\d{2}/.test(v)
    ? v.slice(0, 7)
    : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  return `${base}-01`;
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const competencia = primeiroDiaDoMes(req.nextUrl.searchParams.get("competencia"));

  const [funil, pendencias] = await Promise.all([
    auth.db.rpc("sureya_funil", { p_competencia: competencia }),
    auth.db.rpc("sureya_pendencias_da_competencia", { p_competencia: competencia }),
  ]);

  // ERRO NÃO PODE VIRAR FUNIL VAZIO.
  // Funil vazio se lê como "está tudo resolvido" — exatamente a leitura errada
  // para uma falha. Mesma regra de `calcularSaldo`.
  if (funil.error)      return NextResponse.json({ ok: false, erro: funil.error.message }, { status: 500 });
  if (pendencias.error) return NextResponse.json({ ok: false, erro: pendencias.error.message }, { status: 500 });

  const etapas = (funil.data || []) as any[];
  const pend = (pendencias.data || []) as any[];

  return NextResponse.json({
    ok: true,
    competencia,
    etapas,
    pendencias: pend,
    podeFechar: etapas.find((e) => e.etapa === "pronto para fechar")?.quantidade === 1,
    fechado: (etapas.find((e) => e.etapa === "fechado")?.quantidade || 0) > 0,
  });
}

/** POST { competencia, observacao?, forcar? } — fecha. PUT reabre. */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));

  const { data, error } = await auth.db.rpc("sureya_fechar_competencia", {
    p_competencia: primeiroDiaDoMes(b?.competencia || null),
    p_observacao: b?.observacao || null,
    p_forcar: b?.forcar === true,
  });

  if (error) {
    // A RECUSA É INFORMAÇÃO, NÃO ERRO DE SISTEMA. O motivo vem na mensagem da
    // função (`ha_pendencias: Limpezas executadas...`) e chega inteiro à tela,
    // porque "não foi possível fechar" manda a pessoa procurar em vez de
    // resolver.
    const esperado = /ha_pendencias|ja_fechada|competencia_em_andamento/.test(error.message);
    return NextResponse.json(
      { ok: false, erro: error.message, recusa: esperado },
      { status: esperado ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, competenciaId: data });
}

export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));

  if (!String(b?.motivo || "").trim()) {
    return NextResponse.json({ ok: false, erro: "motivo_obrigatorio" }, { status: 400 });
  }

  const { data, error } = await auth.db.rpc("sureya_reabrir_competencia", {
    p_competencia: primeiroDiaDoMes(b?.competencia || null),
    p_motivo: b.motivo,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reaberta: data === true });
}
