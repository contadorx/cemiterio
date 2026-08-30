import { NextRequest, NextResponse } from "next/server";
import { diasDaCasa, diasQueRendem } from "@/lib/jornada";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CEMITÉRIOS — cadastro, dias de atendimento e quem trabalha em cada um.
 *
 * Os dois mecanismos de multi-cemitério (0044) moram aqui, e os dois são
 * OPCIONAIS:
 *   · `dias_semana` no cemitério — "segunda e quarta no Saudade";
 *   · `cemiterio_id` no membro   — "a Nadir fica no Saudade".
 * Sem configurar nada, a equipe inteira atende tudo, todos os dias — que é o
 * comportamento de sempre.
 */

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);

  const { data: cems, error } = await db
    .from("cemiterios")
    .select("id,nome,endereco,ativo,ordem,dias_semana")
    .order("ordem")
    .order("nome");

  // migration 0044 não rodada: diz isso em vez de mostrar tela vazia
  if (error) {
    return NextResponse.json({
      ok: false,
      erro: "colunas_ausentes",
      dica: "rode migrations/0044_multi_cemiterio.sql no SQL Editor",
    });
  }

  const ids = (cems || []).map((c: any) => c.id);

  const [{ data: quadras }, { data: tumulos }, { data: equipe }, { data: orgRow }] = await Promise.all([
    db.from("quadras").select("id,cemiterio_id"),
    db.from("tumulos").select("id,cemiterio_id,cliente_id"),
    db.from("membros").select("user_id,nome,papel,ativo,cemiterio_id").eq("ativo", true),
    db.from("orgs").select("dias_semana,dias_trabalhados_semana").eq("id", org).maybeSingle(),
  ]);

  // A JORNADA DA CASA ENTRA NA CONTA.
  // Marcar "sábado e domingo" num cemitério não quer dizer nada sozinho: se a
  // casa só trabalha de segunda a sexta, a interseção é vazia e aquele lugar
  // nunca entra na agenda. A tela precisa do número para poder avisar.
  const jornadaCasa = diasDaCasa(orgRow);

  const lista = (cems || []).map((c: any) => {
    const meusTumulos = (tumulos || []).filter((t: any) => t.cemiterio_id === c.id);
    return {
      id: c.id,
      nome: c.nome,
      endereco: c.endereco || "",
      ativo: c.ativo !== false,
      ordem: c.ordem ?? 0,
      diasSemana: Array.isArray(c.dias_semana) && c.dias_semana.length ? c.dias_semana : null,
      diasQueRendem: diasQueRendem(jornadaCasa, c.dias_semana as number[] | null),
      quadras: (quadras || []).filter((q: any) => q.cemiterio_id === c.id).length,
      jazigos: meusTumulos.length,
      familias: new Set(meusTumulos.map((t: any) => t.cliente_id).filter(Boolean)).size,
      equipe: (equipe || [])
        .filter((m: any) => m.cemiterio_id === c.id)
        .map((m: any) => m.nome || "sem nome"),
    };
  });

  return NextResponse.json({
    ok: true,
    jornadaCasa,
    cemiterios: lista,
    dias: DIAS,
    // quem está em campo e ainda não foi amarrado a lugar nenhum
    equipeLivre: (equipe || [])
      .filter((m: any) => m.papel === "campo" && !m.cemiterio_id)
      .map((m: any) => ({ userId: m.user_id, nome: m.nome || "sem nome" })),
    equipeCampo: (equipe || [])
      .filter((m: any) => m.papel === "campo")
      .map((m: any) => ({ userId: m.user_id, nome: m.nome || "sem nome", cemiterioId: m.cemiterio_id || null })),
    // quantos jazigos ficaram sem cemitério (não deveria haver nenhum)
    semCemiterio: (tumulos || []).filter((t: any) => !t.cemiterio_id).length,
    orgId: org,
  });
}

// POST { nome, endereco? } — cadastra um cemitério novo
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);

  const b = await req.json().catch(() => ({}));
  const nome = String(b?.nome || "").trim();
  if (!nome) return NextResponse.json({ ok: false, erro: "nome_obrigatorio" }, { status: 400 });

  const { count } = await db.from("cemiterios").select("id", { count: "exact", head: true });

  const { data, error } = await db.from("cemiterios").insert({
    org_id: org,
    nome,
    endereco: String(b?.endereco || "").trim() || null,
    ordem: (count || 0) + 1,
  }).select("id").single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: (data as any).id });
}

// PATCH { id, nome?, endereco?, ativo?, ordem?, diasSemana? } — edita o cemitério
//        { membroId, cemiterioId } — amarra (ou solta) uma pessoa
export async function PATCH(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const b = await req.json().catch(() => ({}));

  // amarrar/soltar pessoa
  if (b?.membroId !== undefined) {
    const { error } = await db.from("membros")
      .update({ cemiterio_id: b?.cemiterioId || null })
      .eq("user_id", b.membroId);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!b?.id) return NextResponse.json({ ok: false, erro: "id_obrigatorio" }, { status: 400 });

  const patch: Record<string, any> = {};
  if (b.nome !== undefined) patch.nome = String(b.nome).trim();
  if (b.endereco !== undefined) patch.endereco = String(b.endereco).trim() || null;
  if (b.ativo !== undefined) patch.ativo = !!b.ativo;
  if (b.ordem !== undefined) patch.ordem = Number(b.ordem) || 0;
  if (b.diasSemana !== undefined) {
    // lista vazia = "todos os dias" (null), não "nenhum dia" — senão um clique
    // desmarcando tudo deixaria o cemitério sem nunca ser atendido, em silêncio
    const d = Array.isArray(b.diasSemana)
      ? b.diasSemana.map((x: any) => Number(x)).filter((x: number) => x >= 0 && x <= 6)
      : [];
    patch.dias_semana = d.length ? d : null;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, semMudanca: true });

  const { error } = await db.from("cemiterios").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
