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

// POST { quadraCodigo, identificacao, rua?, falecidoNome?, observacoes?,
//        cemiterioId?, clienteId?, confirmarExistente?, forcarNovo? }
//
// Cria um jazigo (tumulo), garantindo o cemiterio e a quadra.
//
// O QUE MUDOU E POR QUE (a fusao de jazigos)
// ---------------------------------------------------------------------------
// Antes, achar um jazigo com a mesma identificacao na quadra era motivo para
// DEVOLVER aquele calado, com um jaExistia:true que a tela mostrava numa linha
// pequena. A captura seguia e gravava foto e GPS em cima de um tumulo que podia
// nao ser o da frente do operador — e como o formulario nao tinha rua/carreira,
// "12 da rua 1" e "12 da rua 3" eram, para o sistema, o mesmo jazigo. Ficava um
// registro com a descricao de um e a foto do outro.
//
// Agora achar um igual NAO decide nada: devolve 409 confirmar_existente com a
// foto e o nome do que ja esta la, e quem esta no cemiterio olhando a lapide
// decide. Duas saidas, as duas explicitas:
//   confirmarExistente -> e o mesmo tumulo mesmo: usa o registro antigo
//   forcarNovo         -> e outro tumulo: cria um registro novo, com numero que
//                         nao colida (o servidor sugere um)
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

  // PARE E PERGUNTE. Achar o mesmo numero na quadra e o momento exato em que
  // dois tumulos viravam um; a decisao e de quem esta olhando a lapide, nao do
  // servidor. So passa daqui com uma escolha explicita da tela.
  if (existente && !b?.confirmarExistente && !b?.forcarNovo) {
    const { data: ficha } = await db
      .from("tumulos")
      .select("id,identificacao,falecido_nome,observacoes,foto_referencia_url,foto_enquadramento_url,lat,created_at,clientes(nome)")
      .eq("id", existente.id)
      .maybeSingle();
    const f = (ficha || existente) as any;
    return NextResponse.json({
      ok: false,
      erro: "confirmar_existente",
      mensagem: `Ja existe o jazigo ${identificacao} na quadra ${quadraCodigo}. E este mesmo ou e outro tumulo?`,
      existente: {
        id: f.id,
        identificacao: f.identificacao,
        falecido: f.falecido_nome || null,
        observacoes: f.observacoes || null,
        fotoLapide: f.foto_referencia_url || null,
        fotoLonge: f.foto_enquadramento_url || null,
        temGps: f.lat != null,
        familia: f.clientes?.nome || null,
        criadoEm: f.created_at || null,
      },
      // numero livre para o caso de ser outro tumulo
      sugestao: sugerirNumero(identificacao, (achados || []) as any[], String(b?.rua || "").trim()),
    }, { status: 409 });
  }

  // "e outro tumulo": o numero enviado tem de estar livre. Deixar dois com o
  // mesmo numero seria repetir a armadilha um degrau adiante.
  if (existente && b?.forcarNovo) {
    return NextResponse.json({
      ok: false,
      erro: "identificacao_em_uso",
      mensagem: `O numero ${identificacao} ja esta em uso nesta quadra. Use um que separe os dois — a rua ajuda.`,
      sugestao: sugerirNumero(identificacao, (achados || []) as any[], String(b?.rua || "").trim()),
    }, { status: 409 });
  }

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
    // Confirmado que e o mesmo: o que o operador acabou de digitar completa o
    // registro antigo, mas NUNCA sobrescreve o que ja estava escrito. Era essa
    // metade que faltava — a foto era atualizada e a descricao ficava velha.
    const completar: Record<string, any> = {};
    const { data: atual } = await db
      .from("tumulos").select("falecido_nome,observacoes").eq("id", existente.id).maybeSingle();
    const a = (atual || {}) as any;
    if (b?.falecidoNome?.trim() && !a.falecido_nome) completar.falecido_nome = b.falecidoNome.trim();
    if (b?.observacoes?.trim() && !a.observacoes) completar.observacoes = b.observacoes.trim();
    if (Object.keys(completar).length) {
      await db.from("tumulos").update(completar).eq("id", existente.id);
    }

    return NextResponse.json({ ok: true, tumuloId: (existente as any).id, quadraId, jaExistia: true });
  }

  const linha: Record<string, any> = {
      org_id: org,
      quadra_id: quadraId,
      cliente_id: b?.clienteId || null,
      identificacao,
      falecido_nome: b?.falecidoNome?.trim() || null,
      observacoes: b?.observacoes?.trim() || null,
    };
  if (String(b?.rua || "").trim()) linha.rua = String(b.rua).trim();

  let { data: tum, error } = await db.from("tumulos").insert(linha).select("id").single();
  if (error && /rua/i.test(error.message || "")) {
    // banco sem a coluna rua (0017 nao rodada): grava o resto e segue
    delete linha.rua;
    const r2 = await db.from("tumulos").insert(linha).select("id").single();
    tum = r2.data; error = r2.error;
  }
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, tumuloId: (tum as any).id, quadraId });
}

/**
 * Um numero livre na quadra, para quando o operador diz "e outro tumulo".
 * Com a rua preenchida vira "12-R3", que e o que o cemiterio fala; sem ela,
 * "12-B", "12-C"... O sufixo nao e enfeite: e o que impede o proximo cadastro
 * de cair de novo em cima do jazigo errado.
 */
function sugerirNumero(base: string, usados: any[], rua: string): string {
  const tomados = new Set(
    (usados || []).map((t) => String(t.identificacao || "").trim().toLowerCase()),
  );
  const tenta = (v: string) => (tomados.has(v.trim().toLowerCase()) ? null : v);
  if (rua) {
    const comRua = tenta(`${base}-R${rua}`);
    if (comRua) return comRua;
  }
  for (const letra of "BCDEFGHIJ".split("")) {
    const v = tenta(`${base}-${letra}`);
    if (v) return v;
  }
  return `${base}-2`;
}
