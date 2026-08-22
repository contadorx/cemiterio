import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tumulos/orfaos — a fila do "vincular em lote".
 *
 * O que a equipe captura no campo entra SEM família (cliente_id null). O
 * /api/tumulos já devolvia esses órfãos, mas só id/identificação/rua/quadra —
 * sem foto e sem GPS não dá para reconhecer o jazigo na mesa, e reconhecer é
 * justamente o trabalho de quem vincula. Aqui vem tudo o que a captura gravou.
 *
 * Devolve também a lista de famílias (nome, telefone e as quadras onde ela já
 * tem jazigo) para a tela poder SUGERIR: quem já cuida de um túmulo na quadra L
 * é o primeiro palpite para outro túmulo da quadra L.
 */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { data: linhas, error } = await db
    .from("tumulos")
    .select(
      "id,identificacao,rua,numero,falecido_nome,observacoes,lat,lng,gps_precisao,gps_atualizado_em,foto_enquadramento_url,foto_referencia_url,created_at,quadra_id,quadras(id,codigo,cemiterio_id,cemiterios(nome))",
    )
    .is("cliente_id", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const orfaos = (linhas || []).map((t: any) => ({
    id: t.id,
    identificacao: t.identificacao,
    rua: t.rua || null,
    numero: t.numero || null,
    falecido: t.falecido_nome || null,
    observacoes: t.observacoes || null,
    quadraId: t.quadra_id || null,
    quadra: t.quadras?.codigo || null,
    cemiterio: t.quadras?.cemiterios?.nome || null,
    lat: t.lat ?? null,
    lng: t.lng ?? null,
    gpsPrecisao: t.gps_precisao ?? null,
    gpsEm: t.gps_atualizado_em || null,
    fotoEnquadramento: t.foto_enquadramento_url || null,
    fotoReferencia: t.foto_referencia_url || null,
    criadoEm: t.created_at || null,
  }));

  // famílias + as quadras onde cada uma já tem jazigo (para a sugestão)
  const { data: fams } = await db
    .from("clientes")
    .select("id,nome,telefone")
    .order("nome")
    .limit(2000);

  const { data: donos } = await db
    .from("tumulos")
    .select("cliente_id,quadra_id")
    .not("cliente_id", "is", null)
    .limit(5000);

  const porFamilia = new Map<string, Set<string>>();
  for (const t of (donos || []) as any[]) {
    if (!t.cliente_id || !t.quadra_id) continue;
    let s = porFamilia.get(t.cliente_id);
    if (!s) { s = new Set(); porFamilia.set(t.cliente_id, s); }
    s.add(t.quadra_id);
  }

  const familias = (fams || []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    telefone: c.telefone || null,
    quadras: Array.from(porFamilia.get(c.id) || []),
  }));

  return NextResponse.json({ ok: true, orfaos, familias });
}
