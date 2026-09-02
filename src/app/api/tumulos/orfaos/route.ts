import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinarVarios } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tumulos/orfaos — a fila do "vincular em lote".
 *
 * O que a equipe captura no campo entra SEM família (familia_id null — e NÃO
 * cliente_id, que desde a 0091 é só o contato derivado da família). O
 * /api/tumulos já devolvia esses órfãos, mas só id/identificação/rua/quadra —
 * sem foto e sem GPS não dá para reconhecer o jazigo na mesa, e reconhecer é
 * justamente o trabalho de quem vincula. Aqui vem tudo o que a captura gravou.
 *
 * Devolve também a lista de famílias (nome, telefone e as quadras onde ela já
 * tem jazigo) para a tela poder SUGERIR: quem já cuida de um túmulo na quadra L
 * é o primeiro palpite para outro túmulo da quadra L.
 *
 * ⚠ MUDOU NA 0091. Esta lista vinha de `clientes` e se chamava "famílias" — o
 * que era verdade enquanto a família era o apelido de um contato. Agora vem de
 * `familias`, e **inclui as que ainda não têm contato nenhum**: são justamente
 * elas que resolvem os jazigos capturados de quem não se tem telefone.
 *
 * E o órfão passou a ser quem não tem FAMÍLIA, não quem não tem dono.
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
    .is("familia_id", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // O balde `servicos` fechou (0154): o endereço guardado não abre mais
  // sozinho. Um lote só, porque `map` não espera promessa.
  const links154 = await assinarVarios(supabaseAdmin(),
    (linhas || []).flatMap((t: any) => [t.foto_referencia_url, t.foto_enquadramento_url]));
  const abrir154 = (u: any) => (u ? links154.get(u) ?? null : null);

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
    fotoEnquadramento: abrir154(t.foto_enquadramento_url),
    fotoReferencia: abrir154(t.foto_referencia_url),
    criadoEm: t.created_at || null,
  }));

  // AS FAMÍLIAS DE VERDADE (0091), inclusive as que ainda não têm contato.
  // O telefone vem do contato financeiro quando existe, e é nulo quando não —
  // que é a informação de que a tela precisa para não prometer um WhatsApp
  // que não existe.
  const { data: fams } = await db
    .from("familias")
    .select("id,nome,responsavel_id,clientes!familias_responsavel_id_fkey(telefone)")
    .order("nome")
    .limit(2000);

  const { data: donos } = await db
    .from("tumulos")
    .select("familia_id,quadra_id")
    .not("familia_id", "is", null)
    .limit(5000);

  const porFamilia = new Map<string, Set<string>>();
  for (const t of (donos || []) as any[]) {
    if (!t.familia_id || !t.quadra_id) continue;
    let s = porFamilia.get(t.familia_id);
    if (!s) { s = new Set(); porFamilia.set(t.familia_id, s); }
    s.add(t.quadra_id);
  }

  const familias = (fams || []).map((f: any) => ({
    id: f.id,
    nome: f.nome,
    telefone: f.clientes?.telefone || null,
    semContato: !f.responsavel_id,
    quadras: Array.from(porFamilia.get(f.id) || []),
  }));

  return NextResponse.json({ ok: true, orfaos, familias });
}
