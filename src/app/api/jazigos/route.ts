import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jazigos — a lista inteira, para a tela de correção em lote.
 *
 * POR QUE ESTA ROTA EXISTE
 * -----------------------------------------------------------------------------
 * Até aqui só dava para ver um jazigo de cada vez, e sempre por dentro da ficha
 * de uma família. Quem cadastra no campo precisa do contrário: a lista toda de
 * uma vez, com a FOTO ao lado da DESCRIÇÃO, para bater o olho e ver o que não
 * combina. É assim que se acha um jazigo fundido — a foto de uma lápide ao lado
 * do nome de outra pessoa.
 *
 * Ela também marca quem é suspeito, com o motivo escrito. O sistema não tem como
 * saber sozinho que dois túmulos viraram um; tem como saber que aquela linha tem
 * o cheiro disso.
 *
 * Só admin: aqui se vê o cemitério inteiro e se corrige de quem é cada jazigo.
 */

const BASE =
  "id,identificacao,quadra_id,cliente_id,familia_id,falecido_nome,observacoes,lat,lng,foto_referencia_url,created_at,updated_at";
// colunas que nasceram depois (0013/0017/0026) — se faltarem, a tela funciona sem
const EXTRAS = ",rua,numero,gps_precisao,gps_amostras,gps_atualizado_em,foto_enquadramento_url,ultima_lavagem_informada";

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const sp = req.nextUrl.searchParams;
  const busca = (sp.get("q") || "").trim().toLowerCase();
  const quadraId = sp.get("quadra") || "";
  const ruaFiltro = sp.get("rua") || "";
  const filtro = sp.get("filtro") || "todos";
  const limite = Math.min(Number(sp.get("limite") || 800), 2000);

  const montar = (cols: string) => {
    let s = db
      .from("tumulos")
      .select(`${cols},quadras(id,codigo,cemiterio_id,cemiterios(nome)),clientes(id,nome),familias(id,nome)`)
      .order("created_at", { ascending: false })
      .limit(limite);
    if (quadraId) s = s.eq("quadra_id", quadraId);
    // FILTRO POR RUA.
    //
    // Quadra sozinha não estreita o bastante: a Quadra 1 tem dezenas de
    // jazigos espalhados por dez ruas. Quem vai corrigir o cadastro trabalha
    // por rua, que é como a Nina anda.
    if (ruaFiltro) s = s.eq("rua", ruaFiltro);
    return s;
  };

  let completo = true;
  let { data, error } = await montar(BASE + EXTRAS);
  if (error) {
    completo = false;
    const r2 = await montar(BASE);
    data = r2.data;
    error = r2.error;
  }
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const linhas = (data as any[]) || [];

  // ---------------------------------------------------------------------
  // A ÚLTIMA LAVAGEM DE CADA JAZIGO (0093)
  //
  // "Quando este jazigo foi lavado pela última vez?" não tinha resposta em
  // tela nenhuma. `tumulos.ultima_lavagem_informada` é outra coisa: é o que a
  // FAMÍLIA disse no cadastro, não o que a equipe fez.
  //
  // Vem da view, que já desconta as estornadas — uma lavagem anulada não pode
  // continuar contando como a última — e já diz se passou pelo botão
  // "Começar" do aplicativo de campo.
  //
  // Uma busca só, pelos ids da página: por jazigo seriam 800 idas ao banco
  // para montar uma lista.
  // ---------------------------------------------------------------------
  const ids = linhas.map((t) => t.id);
  const { data: lavagens } = ids.length
    ? await db
        .from("sureya_ultima_lavagem_jazigo")
        .select("tumulo_id,dia,executora,no_campo,foto_depois_url,duracao_minutos")
        .in("tumulo_id", ids)
    : { data: [] as any[] };
  const ultimaDe = new Map(((lavagens as any[]) || []).map((l) => [l.tumulo_id, l]));

  // Quantas vezes cada identificação aparece — número repetido é o gatilho da
  // fusão. A chave inclui o CEMITÉRIO (0044): contar sobre a lista inteira
  // acusava "o número 45 aparece 3x" quando eram 3 cemitérios diferentes, e
  // mandava procurar duplicata onde não havia nenhuma.
  const chaveRep = (t: any) =>
    `${t.quadras?.cemiterios?.nome || t.quadras?.cemiterio_id || "-"}|` +
    String(t.identificacao || "").trim().toLowerCase();

  const vezes = new Map<string, number>();
  for (const t of linhas) {
    const k = chaveRep(t);
    vezes.set(k, (vezes.get(k) || 0) + 1);
  }

  const jazigos = linhas.map((t) => {
    const criado = t.created_at ? new Date(t.created_at).getTime() : 0;
    const gpsEm = t.gps_atualizado_em ? new Date(t.gps_atualizado_em).getTime() : 0;
    const minutosDepois = criado && gpsEm ? Math.round((gpsEm - criado) / 60000) : null;

    const temFoto = !!(t.foto_referencia_url || t.foto_enquadramento_url);
    const motivos: string[] = [];

    if (minutosDepois !== null && minutosDepois > 2) {
      motivos.push(`GPS gravado ${minutosDepois} min depois do cadastro`);
    }
    if ((t.gps_amostras || 0) > 1) {
      motivos.push(`${t.gps_amostras} leituras de GPS na mesma linha`);
    }
    if (temFoto && !t.falecido_nome) motivos.push("tem foto, não tem nome do falecido");
    if (!temFoto && t.falecido_nome) motivos.push("tem nome, não tem foto");
    // 0044: a contagem é POR CEMITÉRIO. Sobre o resultado inteiro, "o número 45
    // aparece 3x" era falso quando eram 3 cemitérios diferentes — e mandava
    // procurar duplicata onde não havia.
    const rep = vezes.get(chaveRep(t)) || 0;
    if (rep > 1) {
      motivos.push(
        `o número ${t.identificacao} aparece ${rep}x` +
        (t.quadras?.cemiterios?.nome ? ` em ${t.quadras.cemiterios.nome}` : " neste cemitério"),
      );
    }

    return {
      id: t.id,
      identificacao: t.identificacao,
      rua: t.rua ?? null,
      numero: t.numero ?? null,
      quadraId: t.quadra_id,
      quadra: t.quadras?.codigo || null,
      cemiterio: t.quadras?.cemiterios?.nome || null,
      clienteId: t.cliente_id,
      cliente: t.clientes?.nome || null,
      // A FAMÍLIA é o vínculo desde a 0091; o contato é derivado dela. A tela
      // precisa dos dois: o nome da família para escolher, e o do contato para
      // dizer com quem se fala — que pode não haver ninguém.
      familiaId: t.familia_id,
      familia: t.familias?.nome || null,
      falecido: t.falecido_nome || null,
      observacoes: t.observacoes || null,
      lat: t.lat ?? null,
      lng: t.lng ?? null,
      gpsPrecisao: t.gps_precisao ?? null,
      gpsAmostras: t.gps_amostras ?? 0,
      gpsEm: t.gps_atualizado_em ?? null,
      fotoLapide: t.foto_referencia_url || null,
      fotoLonge: t.foto_enquadramento_url || null,
      criadoEm: t.created_at,
      alteradoEm: t.updated_at,
      // a última lavagem DE VERDADE — nula quando o jazigo nunca foi lavado
      ultimaLavagem: (() => {
        const u = ultimaDe.get(t.id);
        if (!u) return null;
        return {
          dia: u.dia,
          executora: u.executora || null,
          noCampo: !!u.no_campo,
          foto: u.foto_depois_url || null,
          minutos: u.duracao_minutos ?? null,
        };
      })(),
      // o que a FAMÍLIA informou no cadastro — outra coisa, e por isso outro
      // campo: serve para o primeiro ciclo, quando ainda não lavamos nenhuma vez
      lavagemInformada: t.ultima_lavagem_informada ?? null,
      suspeito: motivos.length > 0,
      motivos,
    };
  });

  const filtrados = jazigos.filter((j) => {
    if (filtro === "suspeitos" && !j.suspeito) return false;
    // "SEM DONO" É SEM FAMÍLIA, e não sem contato.
    //
    // Era `j.clienteId`. Desde a 0091 o contato é derivado da família e é nulo
    // nas famílias que ainda não têm com quem falar — então um jazigo já
    // vinculado continuava caindo neste filtro por mais vezes que fosse salvo.
    // Seis jazigos assim em produção em 23/08, todos na Quadra 4.
    if (filtro === "semdono" && j.familiaId) return false;
    if (filtro === "semfoto" && (j.fotoLapide || j.fotoLonge)) return false;
    if (filtro === "semgps" && j.lat !== null) return false;
    if (!busca) return true;
    const alvo = [j.identificacao, j.rua, j.numero, j.falecido, j.cliente, j.familia, j.quadra]
      .filter(Boolean).join(" ").toLowerCase();
    return alvo.includes(busca);
  });

  // listas de apoio da tela: para onde mover um jazigo e para quem atribuir
  const [{ data: quads }, { data: cems }, { data: cli }] = await Promise.all([
    db.from("quadras").select("id,codigo,cemiterio_id").order("ordem"),
    db.from("cemiterios").select("id,nome").order("nome"),
    // AS FAMÍLIAS, e não os contatos. Vinha de `clientes` porque a família era
    // o apelido de um contato; desde a 0091 ela é a entidade, e a lista PRECISA
    // incluir as que ainda não têm com quem falar — são elas que resolvem os
    // jazigos capturados de quem não se tem telefone.
    db.from("familias")
      .select("id,nome,responsavel_id,clientes!familias_responsavel_id_fkey(nome)")
      .order("nome").limit(2000),
  ]);

  return NextResponse.json({
    ok: true,
    completo, // false = faltam colunas (rua/numero/gps) no banco
    total: jazigos.length,
    suspeitos: jazigos.filter((j) => j.suspeito).length,
    jazigos: filtrados,
    quadras: ((quads as any[]) || []).map((q) => ({
      id: q.id,
      codigo: q.codigo,
      cemiterio: ((cems as any[]) || []).find((c) => c.id === q.cemiterio_id)?.nome || null,
    })),
    // O nome continua `clientes` na resposta para não quebrar chamada antiga,
    // mas o conteúdo agora é de FAMÍLIAS. Cada uma diz se tem contato: a tela
    // marca as que não têm, em vez de deixar a Sureya descobrir na cobrança.
    clientes: ((cli as any[]) || []).map((c) => ({
      id: c.id,
      nome: c.nome,
      contato: c.clientes?.nome || null,
      semContato: !c.responsavel_id,
    })),
    // As ruas que EXISTEM nos jazigos carregados. Listar as 39 do cadastro
    // ofereceria filtros que não achariam nada — quem escolhe uma opção espera
    // que ela traga resultado.
    ruas: [...new Set(jazigos.map((j: any) => j.rua).filter(Boolean))].sort(),
  });
}
