import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, exigirLogado } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { explicarErroJazigo } from "@/lib/jazigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> cemitérios e suas quadras, para o seletor da captura no campo.
// (exigirLogado: a ajudante de campo também pode capturar jazigo.)
export async function GET() {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { data: cems } = await db
    .from("cemiterios")
    .select("id,nome")
    .order("nome");
  const { data: quads } = await db
    .from("quadras")
    .select("id,codigo,cemiterio_id,ordem")
    .order("ordem");

  const cemiterios = (cems || []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    quadras: (quads || []).filter((q: any) => q.cemiterio_id === c.id)
      .map((q: any) => ({ id: q.id, codigo: q.codigo })),
  }));

  // jazigos ainda SEM família (ex.: capturados no campo) — para vincular no cadastro
  const { data: orfaos } = await db
    .from("tumulos")
    .select("id,identificacao,rua,quadras(codigo)")
    .is("cliente_id", null)
    .order("identificacao")
    .limit(300);
  const semDono = (orfaos || []).map((t: any) => ({
    id: t.id,
    identificacao: t.identificacao,
    rua: t.rua || null,
    quadra: t.quadras?.codigo || null,
  }));

  return NextResponse.json({ ok: true, cemiterios, semDono });
}

// POST { quadraCodigo, identificacao, falecidoNome?, observacoes?, cemiterioId?, clienteId? }
// Cria um jazigo (túmulo), garantindo o cemitério e a quadra. Se já existe um
// jazigo com a mesma identificação na mesma quadra, devolve ele (para a captura
// poder anexar GPS/fotos sem duplicar).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));

  // Capturar jazigo no campo: exigirLogado (a ajudante faz isso).
  // Mas VINCULAR o jazigo a uma familia e ato de admin — em /api/tumulos/[id]
  // sempre foi. Sem esta separacao, um login de campo poderia mandar clienteId
  // e mudar o dono de jazigos pela API.
  const auth = b?.clienteId ? await exigirAdmin() : await exigirLogado();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  // a familia precisa existir e ser visivel sob RLS (nao aceita id de outra org)
  if (b?.clienteId) {
    const { data: cli } = await db.from("clientes").select("id").eq("id", b.clienteId).maybeSingle();
    if (!cli) return NextResponse.json({ ok: false, erro: "familia_nao_encontrada" }, { status: 404 });
  }

  const identificacao = String(b?.identificacao || "").trim();
  const quadraCodigo = String(b?.quadraCodigo || "").trim();
  if (!identificacao) return NextResponse.json({ ok: false, erro: "identificacao_obrigatoria" }, { status: 400 });
  if (!quadraCodigo) return NextResponse.json({ ok: false, erro: "quadra_obrigatoria" }, { status: 400 });

  // cemitério: o informado, senão o primeiro; cria um padrão se não houver nenhum
  let cemId = b?.cemiterioId || null;
  if (!cemId) {
    const { data: cem } = await db.from("cemiterios").select("id").order("nome").limit(1).maybeSingle();
    if (cem) cemId = (cem as any).id;
    else {
      const { data: novo, error } = await db.from("cemiterios")
        .insert({ org_id: org, nome: "Cemitério" }).select("id").single();
      if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
      cemId = (novo as any).id;
    }
  }

  // quadra por código (cria se ainda não existe)
  let { data: quad } = await db
    .from("quadras")
    .select("id")
    .eq("cemiterio_id", cemId)
    .eq("codigo", quadraCodigo)
    .maybeSingle();
  if (!quad) {
    const { data: novaQ, error } = await db.from("quadras")
      .insert({ org_id: org, cemiterio_id: cemId, codigo: quadraCodigo })
      .select("id").single();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    quad = novaQ as any;
  }
  const quadraId = (quad as any).id;

  // já existe esse jazigo nessa quadra? devolve ele (evita duplicar)
  // sem maybeSingle(): ele estoura se houver duplicata no banco, e o erro
  // descartado fazia o codigo seguir e INSERIR uma terceira copia.
  const { data: achados } = await db
    .from("tumulos")
    .select("id,cliente_id,identificacao")
    .eq("quadra_id", quadraId)
    .ilike("identificacao", identificacao.replace(/([\\%_])/g, "\\$1"))
    .order("identificacao").limit(50);
  // igualdade decidida no JS (o ilike so estreita a busca): "L-128" nunca casa
  // com "L_128", nem que o escape falhe.
  const alvo = identificacao.toLowerCase();
  const iguais = (achados || []).filter(
    (t: any) => String(t.identificacao || "").trim().toLowerCase() === alvo,
  );
  if (iguais.length > 1) {
    return NextResponse.json({
      ok: false, erro: "identificacao_duplicada",
      mensagem: explicarErroJazigo("identificacao_duplicada"),
    }, { status: 409 });
  }
  const existente = iguais[0] as any;
  if (existente) {
    // Quem chamou informando a familia esperava o jazigo VINCULADO. Antes esta
    // saida devolvia "ok" e nao ligava nada — o jazigo continuava orfao e a tela
    // dizia que tinha dado certo. Vincula se estiver sem dono; se for de outra
    // familia, nao rouba: avisa.
    const dono = (existente as any).cliente_id as string | null;
    if (b?.clienteId && !dono) {
      // le o erro do update: se a RLS recusar, responder ok:true diria que o
      // jazigo foi vinculado quando ele continua orfao.
      const { error: eLig } = await db
        .from("tumulos").update({ cliente_id: b.clienteId }).eq("id", (existente as any).id);
      if (eLig) {
        return NextResponse.json(
          { ok: false, erro: eLig.message, mensagem: "Nao consegui ligar esse jazigo a familia. Tente de novo." },
          { status: 400 },
        );
      }
    } else if (b?.clienteId && dono !== b.clienteId) {
      return NextResponse.json(
        { ok: false, erro: "jazigo_de_outra_familia", tumuloId: (existente as any).id,
          mensagem: explicarErroJazigo("jazigo_de_outra_familia") },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, tumuloId: (existente as any).id, quadraId, jaExistia: true });
  }

  const { data: tum, error } = await db
    .from("tumulos")
    .insert({
      org_id: org,
      quadra_id: quadraId,
      cliente_id: b?.clienteId || null,
      identificacao,
      falecido_nome: b?.falecidoNome?.trim() || null,
      observacoes: b?.observacoes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, tumuloId: (tum as any).id, quadraId });
}
