import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OS DEGRAUS DA RÉGUA DE COBRANÇA (0110).
 *
 * Cada degrau é uma linha: quantos dias do vencimento, e o que se diz. `dias`
 * NEGATIVO é antes (o aviso prévio), POSITIVO é depois (a cobrança de quem
 * atrasou). Um eixo só, com o zero no vencimento.
 *
 * ⚠ Nada aqui envia. A régua escreve na FILA DE LIBERAÇÃO, e a fila só sai por
 * comando de quem lê.
 */
const REGUAS = ["suave", "padrao", "firme", "nao_cobrar"];

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const regua = req.nextUrl.searchParams.get("regua") || "padrao";
  if (!REGUAS.includes(regua)) {
    return NextResponse.json({ ok: false, erro: "regua_invalida" }, { status: 400 });
  }

  const [{ data: degraus }, { data: o }] = await Promise.all([
    auth.db.from("regua_degraus").select("id,dias,texto,ativo,repetir_a_cada")
      .eq("org_id", org).eq("regua", regua).order("dias"),
    auth.db.from("orgs").select("dia_vencimento").eq("id", org).maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true, regua,
    degraus: degraus || [],
    diaVencimento: Number((o as any)?.dia_vencimento) || 10,
  });
}

/** POST { regua, dias, texto } — acrescenta um degrau. */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const regua = String(b?.regua || "padrao");
  const dias = Math.round(Number(b?.dias));
  const texto = String(b?.texto || "").trim();

  if (!REGUAS.includes(regua)) {
    return NextResponse.json({ ok: false, erro: "regua_invalida" }, { status: 400 });
  }
  if (!Number.isFinite(dias) || dias < -365 || dias > 365) {
    return NextResponse.json(
      { ok: false, erro: "dias_invalidos",
        mensagem: "Diga quantos dias do vencimento: negativo antes, positivo depois." },
      { status: 400 });
  }
  if (texto.length < 10) {
    return NextResponse.json(
      { ok: false, erro: "texto_curto",
        mensagem: "Escreva a mensagem que sai neste degrau." },
      { status: 400 });
  }

  const { error } = await auth.db.from("regua_degraus")
    .insert({ org_id: org, regua, dias, texto });

  if (error) {
    // Um degrau por dia: dois textos para "3 dias depois" fariam a família
    // receber duas cobranças na mesma manhã.
    if (String(error.message).includes("regua_degraus_unico")) {
      return NextResponse.json(
        { ok: false, erro: "degrau_repetido",
          mensagem: `Já existe um degrau para ${dias} dias nesta régua. Edite o que está lá.` },
        { status: 409 });
    }
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** PUT { id, texto?, ativo?, diaVencimento? } */
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));

  // O dia de vencimento é da CASA, não do degrau: é dele que a régua conta.
  if (b?.diaVencimento !== undefined) {
    const dia = Math.round(Number(b.diaVencimento));
    if (!Number.isFinite(dia) || dia < 1 || dia > 28) {
      return NextResponse.json(
        { ok: false, erro: "dia_invalido",
          mensagem: "O vencimento vai do dia 1 ao 28 — o dia 30 não existe em fevereiro." },
        { status: 400 });
    }
    const { error } = await auth.db.from("orgs").update({ dia_vencimento: dia }).eq("id", org);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const id = String(b?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const patch: Record<string, any> = { atualizado_em: new Date().toISOString() };
  if (b?.texto !== undefined) {
    const t = String(b.texto).trim();
    if (t.length < 10) {
      return NextResponse.json(
        { ok: false, erro: "texto_curto", mensagem: "A mensagem ficou curta demais." },
        { status: 400 });
    }
    patch.texto = t;
  }
  // Desligar tira do ar SEM apagar o que foi escrito: ajustar a régua não pode
  // custar reescrever o texto do zero.
  if (b?.ativo !== undefined) patch.ativo = !!b.ativo;

  // DE QUANTO EM QUANTO TEMPO O DEGRAU VOLTA (0130).
  //
  // Vazio ou zero = não repete, que é o comportamento de sempre. O piso de 7
  // dias está no banco (`regua_degraus_repetir_sensato`) e também aqui, para a
  // recusa virar frase em vez de erro cru do Postgres — quem digita "3"
  // achando que são meses precisa descobrir na tela, não pela família.
  if (b?.repetirACada !== undefined) {
    const v = b.repetirACada === null || b.repetirACada === "" ? null : Math.round(Number(b.repetirACada));
    if (v !== null && (!Number.isFinite(v) || v < 7 || v > 365)) {
      return NextResponse.json(
        { ok: false, erro: "repeticao_invalida",
          mensagem: "Repetir de quantos em quantos dias? De 7 a 365 — ou deixe vazio para não repetir." },
        { status: 400 });
    }
    patch.repetir_a_cada = v;
  }

  const { error } = await auth.db.from("regua_degraus")
    .update(patch).eq("id", id).eq("org_id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE ?id=… */
export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  const { error } = await auth.db.from("regua_degraus")
    .delete().eq("id", id).eq("org_id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
