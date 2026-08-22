import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { exigirAdmin } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET ?origem=&quadra=&rua=&busca=&incluirTeste=
// Lista as plaquetas dos jazigos que já têm portal ativo.
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const q = req.nextUrl.searchParams;

  const origem = (q.get("origem") || "").replace(/\/$/, "");
  if (!origem) return NextResponse.json({ ok: false, erro: "origem_obrigatoria" }, { status: 400 });

  let sel = db
    .from("tumulos")
    .select("id,identificacao,falecido_nome,qr_token,rua,quadra_id,quadras(codigo),clientes(nome)")
    .not("qr_token", "is", null)
    .order("identificacao")
    .limit(300);
  if (q.get("quadra")) sel = sel.eq("quadra_id", q.get("quadra"));
  if (q.get("rua")) sel = sel.eq("rua", q.get("rua"));

  const { data: tumulos } = await sel;
  const busca = (q.get("busca") || "").trim().toLowerCase();
  const incluirTeste = q.get("incluirTeste") === "1";

  const filtrados = (tumulos || []).filter((t: any) => {
    const nomeCli = String(t.clientes?.nome || "");
    if (!incluirTeste && nomeCli.startsWith("[TESTE]")) return false;
    if (!busca) return true;
    return (
      String(t.identificacao || "").toLowerCase().includes(busca) ||
      nomeCli.toLowerCase().includes(busca) ||
      String(t.falecido_nome || "").toLowerCase().includes(busca)
    );
  });

  const plaquetas = [];
  for (const t of filtrados as any[]) {
    const url = `${origem}/t/${t.qr_token}`;
    const qr = await QRCode.toDataURL(url, { margin: 2, width: 400, errorCorrectionLevel: "Q" });
    plaquetas.push({
      id: t.id, identificacao: t.identificacao, falecido: t.falecido_nome,
      quadra: t.quadras?.codigo || "—", rua: t.rua || "", cliente: t.clientes?.nome || "", url, qr,
    });
  }

  // quantos jazigos ainda NÃO têm portal (para o botão de gerar em lote)
  const { count: semPortal } = await db
    .from("tumulos").select("id", { count: "exact", head: true }).is("qr_token", null);

  return NextResponse.json({ ok: true, plaquetas, semPortal: semPortal || 0 });
}

// POST { escopo: 'todos' | 'quadra', quadraId? } — gera portal para quem ainda não tem
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const adm = supabaseAdmin();
  const org = env.orgId();

  let sel = adm.from("tumulos").select("id,clientes(nome)").eq("org_id", org).is("qr_token", null);
  if (b?.escopo === "quadra" && b?.quadraId) sel = sel.eq("quadra_id", b.quadraId);

  const { data: alvos } = await sel;
  // nunca gera portal para dados de teste
  const reais = (alvos || []).filter((t: any) => !String(t.clientes?.nome || "").startsWith("[TESTE]"));

  let gerados = 0;
  for (const t of reais as any[]) {
    const { error } = await auth.db.rpc("sureya_emitir_token_portal", { p_tumulo: t.id });
    if (!error) gerados++;
  }
  return NextResponse.json({ ok: true, gerados });
}
