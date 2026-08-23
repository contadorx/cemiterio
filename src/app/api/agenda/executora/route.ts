import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QUEM LIMPA — definido em lote, na agenda, e sempre opcional.
 *
 * O alocador não nomeia mais ninguém (ver `alocarAgenda`): a limpeza nasce sem
 * dono e aparece para toda a equipe. Isso é o certo para quem trabalha com
 * gente não fixa — mas há dias em que a Sureya JÁ SABE quem vai, e marcar um
 * por um numa rota de vinte é trabalho que ninguém faz.
 *
 * `executoraId: null` é escolha válida e não um campo vazio: é "volta a ficar
 * em aberto", que é o estado normal.
 *
 * O QUE ESTA ROTA NÃO FAZ
 * Não mexe em serviço já executado. Ali `executora_id` não é mais um plano — é
 * o registro de quem lavou, e é dele que sai a remuneração. Reescrever isso
 * pelo calendário pagaria uma pessoa pelo trabalho de outra.
 */

// POST { ids: string[], executoraId: string | null }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b?.ids) ? b.ids.map((x: any) => String(x)).filter(Boolean) : [];
  // `undefined` seria "não mandou nada"; `null` é "deixar em aberto". A
  // diferença importa, e é por isso que o teste é explícito.
  const executoraId = b?.executoraId === null || b?.executoraId === ""
    ? null
    : String(b?.executoraId || "");

  if (!ids.length) {
    return NextResponse.json({ ok: false, erro: "nada_marcado" }, { status: 400 });
  }
  if (ids.length > 300) {
    return NextResponse.json({ ok: false, erro: "max_300" }, { status: 400 });
  }

  // A pessoa tem de ser da equipe, ATIVA e de campo ou admin. Sem esta guarda,
  // um id colado no lugar errado marcaria a rota no nome de alguém que não
  // trabalha mais aqui — e o serviço sumiria da lista de todo mundo.
  if (executoraId) {
    const { data: m } = await auth.db
      .from("membros").select("user_id,ativo,papel")
      .eq("org_id", org).eq("user_id", executoraId).maybeSingle();
    if (!m || !(m as any).ativo) {
      return NextResponse.json(
        { ok: false, erro: "pessoa_invalida",
          mensagem: "Essa pessoa não está na equipe ativa." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await auth.db
    .from("servicos")
    .update({ executora_id: executoraId })
    .eq("org_id", org)
    .in("id", ids)
    // Executado fica fora: ali o campo é o registro de quem lavou.
    .in("status", ["pendente", "agendado"])
    .select("id");

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const mexidos = (data || []).length;
  return NextResponse.json({
    ok: true,
    mexidos,
    // Dizer quantos NÃO mudaram evita o silêncio de marcar vinte e alterar
    // dezoito sem ninguém saber quais dois ficaram de fora.
    ignorados: ids.length - mexidos,
    emAberto: executoraId === null,
  });
}
