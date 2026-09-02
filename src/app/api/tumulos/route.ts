import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, exigirLogado } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { explicarErroJazigo, resolverCemiterio } from "@/lib/jazigo";
import { encaixarPeloGps, gerarCodigo } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assinarVarios } from "@/lib/storage";

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
  //
  // ⚠ O DEFEITO QUE ESTAVA AQUI, e como ele aparecia
  //
  // A pergunta era `.is("cliente_id", null)`. Desde a 0091 `cliente_id` é o
  // CONTATO, derivado da família — e ele é nulo justamente nas famílias que
  // ainda não têm com quem falar, que são a razão de a 0091 existir.
  //
  // Resultado: um jazigo vinculado a uma família SEM contato continuava nesta
  // lista para sempre. Salvava, recarregava, continuava lá. Medido em produção
  // em 23/08: SEIS jazigos nesse estado, todos na Quadra 4 — entre eles o
  // "Américo damo" (Q4-T6-010), ligado à família DAMO 2. O cadastro estava
  // certo; a pergunta é que estava errada.
  //
  // Agora vem da view `sureya_jazigos_sem_familia` (0091), que já fazia a
  // pergunta certa e não era usada por ninguém. A definição de "sem família"
  // passa a existir uma vez só.
  //
  // A FOTO VAI JUNTO.
  //
  // São dezenas de jazigos capturados no campo, quase todos sem nome na pedra.
  // Distinguir "Quadra 1 · Rua 2" de outro "Quadra 1 · Rua 2" por texto é
  // impossível — a foto é o que a Sureya realmente reconhece. A view não a
  // carrega, então ela vem numa segunda busca, pelos ids.
  const { data: orfaos } = await db
    .from("sureya_jazigos_sem_familia")
    .select("id,identificacao,codigo,rua,quadra,falecido_nome")
    .order("codigo")
    .limit(500);

  const idsOrfaos = ((orfaos as any[]) || []).map((t) => t.id);
  const { data: fotos } = idsOrfaos.length
    ? await db.from("tumulos").select("id,foto_referencia_url").in("id", idsOrfaos)
    : { data: [] as any[] };
  const fotoDe = new Map(
    ((fotos as any[]) || []).map((t) => [t.id, t.foto_referencia_url || null]),
  );

  // O balde `servicos` fechou (0154): o endereço guardado não abre mais
  // sozinho. Um lote só, porque `map` não espera promessa.
  const links154 = await assinarVarios(supabaseAdmin(), [...fotoDe.values()]);
  const abrir154 = (u: any) => (u ? links154.get(u) ?? null : null);

  const semDono = ((orfaos as any[]) || []).map((t: any) => ({
    id: t.id,
    identificacao: t.identificacao,
    codigo: t.codigo || null,
    rua: t.rua || null,
    quadra: t.quadra || null,
    falecido: t.falecido_nome || null,
    foto: abrir154(fotoDe.get(t.id)),
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
  // A IDENTIFICAÇÃO É OPCIONAL.
  //
  // Nasceu obrigatória supondo que o túmulo tivesse número gravado. Não tem —
  // e um campo obrigatório sem resposta verdadeira produz resposta falsa: no
  // primeiro cadastro apareceram "A", "A2", "A3"… só para conseguir salvar.
  //
  // Quem identifica o túmulo é o `codigo` (Q1-R5-007) e a foto de referência.
  // Este campo passa a ser o que está ESCRITO NA PEDRA — o sobrenome, quase
  // sempre —, que é útil para a Nina confirmar o lugar, mas não indispensável.
  if (!quadraCodigo) return NextResponse.json({ ok: false, erro: "quadra_obrigatoria" }, { status: 400 });

  // cemitério: o informado; com mais de um cadastrado e nenhum informado, RECUSA
  // em vez de escolher o primeiro em ordem alfabética (0044)
  const rc = await resolverCemiterio(db, org, b?.cemiterioId);
  if (!rc.ok) {
    return NextResponse.json({
      ok: false, erro: rc.erro,
      mensagem: explicarErroJazigo(rc.erro, (rc as any).detalhe),
    }, { status: 400 });
  }
  const cemId = rc.cemiterioId;

  // QUADRA: escolhida da lista, NUNCA criada por texto livre.
  //
  // Antes esta rota criava a quadra quando o código não existia. Parecia
  // gentil e foi o que produziu treze quadras para um cemitério de quatro:
  // "QD 1", "Q1", "Qd 1", "Q01" e "Quadra 1" eram o mesmo lugar do mundo real
  // em cinco registros diferentes — e o roteiro do dia se perdia no meio.
  //
  // Agora a quadra tem de existir. Se não existe, a resposta diz quais são.
  const { data: quad } = await db
    .from("quadras")
    .select("id")
    .eq("cemiterio_id", cemId)
    .eq("codigo", quadraCodigo)
    .maybeSingle();

  if (!quad) {
    const { data: disponiveis } = await db
      .from("quadras").select("codigo").eq("cemiterio_id", cemId).order("ordem");
    return NextResponse.json({
      ok: false,
      erro: "quadra_nao_existe",
      mensagem: "Escolha a quadra na lista. Digitar cria quadra repetida.",
      quadras: (disponiveis || []).map((q: any) => q.codigo),
    }, { status: 400 });
  }
  const quadraId = (quad as any).id;

  // RUA: também da lista, e obrigatória — é dela que sai a ordem do dia.
  // Sem rua, o túmulo fica fora do roteiro e a Nina só descobre andando.
  const ruaNome = String(b?.rua || "").trim();
  if (!ruaNome) {
    const { data: ruasDisp } = await db
      .from("ruas").select("nome").eq("quadra_id", quadraId).order("ordem");
    return NextResponse.json({
      ok: false,
      erro: "rua_obrigatoria",
      mensagem: "Escolha a rua. É ela que coloca o jazigo na ordem da caminhada.",
      ruas: (ruasDisp || []).map((r: any) => r.nome),
    }, { status: 400 });
  }

  const { data: ruaRow } = await db
    .from("ruas").select("id,nome,seq_cadastro")
    .eq("quadra_id", quadraId).eq("nome", ruaNome).maybeSingle();

  if (!ruaRow) {
    const { data: ruasDisp } = await db
      .from("ruas").select("nome").eq("quadra_id", quadraId).order("ordem");
    return NextResponse.json({
      ok: false,
      erro: "rua_nao_existe",
      mensagem: `A rua "${ruaNome}" não existe nesta quadra.`,
      ruas: (ruasDisp || []).map((r: any) => r.nome),
    }, { status: 400 });
  }
  const ruaId = (ruaRow as any).id;

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
      .select("id,identificacao,falecido_nome,observacoes,foto_referencia_url,foto_enquadramento_url,lat,created_at,familias(nome),clientes(nome)")
      .eq("id", existente.id)
      .maybeSingle();
    const f = (ficha || existente) as any;
    // Este cartão mostra a lápide para a pessoa decidir "é este mesmo ou é
    // outro?". Sem a foto ela não decide — então o link precisa abrir (0154).
    const lk = await assinarVarios(supabaseAdmin(), [f.foto_referencia_url, f.foto_enquadramento_url]);
    return NextResponse.json({
      ok: false,
      erro: "confirmar_existente",
      mensagem: `Ja existe o jazigo ${identificacao} na quadra ${quadraCodigo}. E este mesmo ou e outro tumulo?`,
      existente: {
        id: f.id,
        identificacao: f.identificacao,
        falecido: f.falecido_nome || null,
        observacoes: f.observacoes || null,
        fotoLapide: f.foto_referencia_url ? lk.get(f.foto_referencia_url) ?? null : null,
        fotoLonge: f.foto_enquadramento_url ? lk.get(f.foto_enquadramento_url) ?? null : null,
        temGps: f.lat != null,
        // A FAMÍLIA, não o contato. O contato fica de reserva para o cadastro
        // antigo que ainda não tem família — mas quem está olhando a lápide
        // decide por "de quem é este jazigo", e isso é a família.
        familia: f.familias?.nome || f.clientes?.nome || null,
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
      // 0044: o cemitério fica no próprio túmulo (o gatilho do banco também
      // preenche, mas gravar aqui evita depender dele)
      cemiterio_id: cemId,
      cliente_id: b?.clienteId || null,
      identificacao,
      falecido_nome: b?.falecidoNome?.trim() || null,
      observacoes: b?.observacoes?.trim() || null,
    };
  linha.rua = ruaNome;          // texto, mantido para leitura humana
  linha.rua_id = ruaId;         // o vínculo que vale para o roteiro

  // POSIÇÃO NA RUA — os túmulos não têm número gravado na pedra, então quem
  // diz quem vem antes de quem é o GPS capturado agora, no cadastro.
  //
  // O novo entra ENTRE os vizinhos certos e recebe o ponto médio entre eles.
  // NENHUM VIZINHO É RENUMERADO: o código de um túmulo já foi para a ficha da
  // família e para as fotos, e mudar isso apontaria o histórico para a pedra
  // errada.
  let seqUsada = 0;
  {
    const { data: naRua } = await db
      .from("tumulos").select("id,ordem_na_rua,lat,lng")
      .eq("rua_id", ruaId).order("ordem_na_rua");

    const vizinhos = (naRua || []).filter((t: any) => t.ordem_na_rua != null);
    const lat = b?.lat ?? null;
    const lng = b?.lng ?? null;

    linha.ordem_na_rua = encaixarPeloGps(
      { tumuloId: "novo", lat, lng },
      vizinhos.map((t: any) => ({
        tumuloId: t.id, ordem: Number(t.ordem_na_rua), lat: t.lat, lng: t.lng,
      })),
    );

    // CÓDIGO — "Q1-R5-007". O número é a ordem de CADASTRO na rua, nunca a
    // posição física: a posição muda quando entra um túmulo no meio, o código
    // não pode mudar nunca. Buracos na numeração são normais e esperados.
    seqUsada = Number((ruaRow as any).seq_cadastro || 0) + 1;
    linha.codigo = gerarCodigo(quadraCodigo, ruaNome, seqUsada);
    // O CONTADOR SÓ ANDA DEPOIS QUE O JAZIGO ENTRA (abaixo).
    //
    // Ele andava aqui, antes do insert. Toda tentativa que falhava queimava um
    // número: em 30/08 a "RUA 1 Q3" do Santa Lídia estava com `seq_cadastro`
    // em 3 e NENHUM túmulo — três tentativas barradas pela chave duplicada,
    // três números perdidos.
    //
    // Buraco na numeração por túmulo excluído é normal e esperado (o código já
    // foi para a ficha e para as fotos, e não se renumera). Buraco por erro é
    // outra coisa: não houve pedra nenhuma naquele número.
  }

  let { data: tum, error } = await db.from("tumulos").insert(linha).select("id").single();
  if (error && /cemiterio_id/i.test(error.message || "")) {
    // banco sem a coluna (0044 nao rodada): grava o resto e segue
    delete linha.cemiterio_id;
    const r0 = await db.from("tumulos").insert(linha).select("id").single();
    tum = r0.data; error = r0.error;
  }
  if (error && /rua/i.test(error.message || "")) {
    // banco sem a coluna rua (0017 nao rodada): grava o resto e segue
    delete linha.rua;
    const r2 = await db.from("tumulos").insert(linha).select("id").single();
    tum = r2.data; error = r2.error;
  }
  if (error) {
    // A MENSAGEM DO POSTGRES NÃO SE MOSTRA CRUA A QUEM ESTÁ NO CEMITÉRIO.
    //
    // Em 30/08 a tela mostrou "duplicate key value violates unique constraint
    // idx_tumulos_codigo_unico" para quem estava de pé no Santa Lídia, de
    // celular na mão. Não dá para agir sobre isso.
    const cru = error.message || "";
    return NextResponse.json({
      ok: false, erro: cru,
      mensagem: /idx_tumulos_codigo_unico|duplicate key/i.test(cru)
        ? `Já existe um jazigo com o código ${linha.codigo} neste cemitério. `
          + "Confira se ele não foi cadastrado agora há pouco."
        : "Não consegui criar o jazigo. " + cru,
    }, { status: 500 });
  }

  // O CONTADOR DA RUA ANDA AGORA, com o jazigo já dentro.
  await db.from("ruas").update({ seq_cadastro: seqUsada }).eq("id", ruaId);

  return NextResponse.json({ ok: true, tumuloId: (tum as any).id, quadraId,
                             codigo: linha.codigo });
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
