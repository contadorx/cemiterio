import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { auditar } from "@/lib/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A MESMA PESSOA CADASTRADA DUAS VEZES (0145).
 *
 * Medido em 29/08: 46 clientes sem o 55 no telefone, e o WhatsApp sempre manda
 * com. Nenhum era reconhecido, virava lead, e alguém cadastrava de novo — 11
 * pares nasceram assim.
 *
 * GET   os pares, com o que cada lado carrega.
 * POST  { fica, sai, ensaio? } funde. Com `ensaio`, só conta o que moveria.
 *
 * NÃO É BOTÃO DE LIMPAR. Fundir apaga um cadastro, e doze das vinte e nove
 * referências a `clientes` são ON DELETE CASCADE — entre elas conversas,
 * mensagens e comprovantes. Por isso a decisão é de uma pessoa, com o ensaio
 * na frente, e nunca automática.
 */

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data, error } = await auth.db.rpc("sureya_clientes_duplicados", { p_org: org });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // AGRUPADO POR NÚMERO, porque é o número que diz que são a mesma pessoa —
  // o nome não diz nada ("Katia" e "Kátia", "Marli" e "Neusa Marly").
  const porNumero = new Map<string, any[]>();
  for (const l of (data as any[]) || []) {
    const k = l.numero as string;
    if (!porNumero.has(k)) porNumero.set(k, []);
    porNumero.get(k)!.push(l);
  }

  const pares = [...porNumero.entries()].map(([numero, lados]) => ({
    numero,
    lados,
    // O PALPITE DE QUAL FICA: quem tem jazigo. É o cadastro que alguém fez de
    // propósito; o outro nasceu de uma conversão de lead. É só palpite — a
    // tela deixa trocar, e quem decide é quem conhece a família.
    sugerido: [...lados].sort((a, b) =>
      (b.jazigos - a.jazigos)
      || (new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()))[0]?.cliente_id || null,
  }));

  return NextResponse.json({ ok: true, pares, quantos: pares.length });
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const fica = String(b?.fica || "").trim();
  const sai = String(b?.sai || "").trim();
  const ensaio = !!b?.ensaio;
  if (!fica || !sai) {
    return NextResponse.json({ ok: false, erro: "faltam_os_dois" }, { status: 400 });
  }

  const { data, error } = await auth.db.rpc("sureya_fundir_clientes", {
    p_fica: fica, p_sai: sai, p_org: org, p_ensaio: ensaio,
  });
  if (error) {
    return NextResponse.json({
      ok: false, erro: error.message,
      mensagem: /quem_fica_sem_familia/.test(error.message)
        ? "A pessoa que fica precisa estar numa família."
        : /mesma_pessoa/.test(error.message)
        ? "Escolha duas pessoas diferentes."
        : error.message,
    }, { status: 400 });
  }

  // O ENSAIO NÃO MOVEU NADA, então não há o que auditar — e registrar uma
  // fusão que não aconteceu deixaria o histórico mentindo.
  if (!ensaio) {
    await auditar(auth.db, org, auth.userId || null, "fundiu_clientes",
      { tipo: "cliente", id: fica }, { saiu: sai });
  }

  return NextResponse.json({ ok: true, ensaio, movido: data || [] });
}
