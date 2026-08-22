import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { normalizarTelefone } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A FAMÍLIA COMO ENTIDADE — a porta que não existia.
 *
 * Até a migration 0091 não havia como criar uma família: ela nascia por gatilho
 * a partir de um CONTATO (`sureya_familia_para_cliente`), batizada com o
 * sobrenome dele. E contato exige telefone — `clientes.telefone` é NOT NULL.
 *
 * Resultado prático: **não havia caminho para cadastrar a família de quem não
 * se tem telefone**, e 81 dos 204 jazigos capturados no campo ficaram parados
 * esperando um número que talvez nunca apareça.
 *
 * Aqui a família nasce só com o nome. Contato é opcional, e pode chegar depois
 * — inclusive nunca.
 */

// GET ?q=  — busca por nome, para as telas de vínculo.
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  let consulta = auth.db
    .from("familias")
    .select("id,nome,contratado,responsavel_id,clientes!familias_responsavel_id_fkey(nome,telefone)")
    .eq("org_id", org)
    .order("nome")
    .limit(q ? 30 : 2000);

  if (q) consulta = consulta.ilike("nome", `%${q}%`);

  const { data, error } = await consulta;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    familias: (data || []).map((f: any) => ({
      id: f.id,
      nome: f.nome,
      contratado: !!f.contratado,
      // `null` aqui é informação, não falta dela: quer dizer "a família existe
      // e ainda não se sabe com quem falar". A tela precisa poder dizer isso.
      responsavel: f.clientes?.nome || null,
      telefone: f.clientes?.telefone || null,
    })),
  });
}

// POST { nome, contato?: { nome, telefone } }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const nome = String(b?.nome || "").trim().slice(0, 160);
  if (!nome) {
    return NextResponse.json(
      { ok: false, erro: "sem_nome", mensagem: "Diga o nome da família." },
      { status: 400 },
    );
  }

  // Nome repetido é AVISO, não erro. "Família Silva" pode existir duas vezes no
  // mesmo cemitério, e recusar obrigaria a inventar "Família Silva 2" — pior
  // para quem procura depois.
  const { data: iguais } = await auth.db
    .from("familias").select("id,nome").eq("org_id", org).ilike("nome", nome).limit(3);

  const { data: criada, error } = await auth.db
    .from("familias").insert({ org_id: org, nome }).select("id,nome").maybeSingle();
  if (error || !criada) {
    return NextResponse.json({ ok: false, erro: error?.message || "nao_criou" }, { status: 500 });
  }

  const familiaId = (criada as any).id as string;

  // O CONTATO É OPCIONAL — é o ponto inteiro desta rota. Quando vem, o gatilho
  // `trg_primeiro_contato_assume` (0091) o torna o contato financeiro sozinho.
  let contatoId: string | null = null;
  let avisoContato: string | null = null;
  if (b?.contato?.nome || b?.contato?.telefone) {
    const cNome = String(b.contato?.nome || "").trim().slice(0, 120);
    const cTel = normalizarTelefone(String(b.contato?.telefone || ""));
    if (!cNome || !cTel) {
      avisoContato = "A família foi criada. O contato não — falta nome ou telefone.";
    } else {
      const { data: c, error: eC } = await auth.db
        .from("clientes")
        .insert({ org_id: org, nome: cNome, telefone: cTel, familia_id: familiaId })
        .select("id").maybeSingle();
      // A FAMÍLIA JÁ ESTÁ GRAVADA e não é desfeita por causa do contato: um
      // telefone repetido não pode custar o cadastro que ela acabou de fazer.
      if (eC) {
        avisoContato = /duplicate|unique/i.test(eC.message)
          ? "A família foi criada. Esse telefone já está em outra ficha — vincule o contato por lá."
          : `A família foi criada. O contato falhou: ${eC.message}`;
      } else {
        contatoId = (c as any)?.id || null;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    familiaId,
    nome,
    contatoId,
    avisoContato,
    // A tela avisa; não bloqueia.
    homonimas: (iguais || []).filter((f: any) => f.id !== familiaId).map((f: any) => f.nome),
  });
}
