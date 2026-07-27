import type { SupabaseClient } from "@supabase/supabase-js";
import { valorDoCiclo, vencimentosIniciais, diaOperacao } from "./vencimento";

/**
 * ANEXAR UM JAZIGO A UMA FAMÍLIA — um lugar só.
 *
 * Esta conta acontecia em dois lugares (o cadastro de família nova, em
 * POST /api/clientes, e nada mais — a ficha da família não tinha como fazer).
 * Agora mora aqui, e as duas portas usam a mesma função.
 *
 * A REGRA QUE NÃO PODE MUDAR: nunca duplicar jazigo e nunca roubar jazigo de
 * outra família. Se a identificação já existe naquela quadra, ou o jazigo é
 * reaproveitado (quando está órfão ou já é desta família) ou a operação FALHA
 * com motivo. O que existia antes era pior que falhar: o cadastro devolvia
 * "ok" e a família nascia sem jazigo nenhum, sem uma palavra na tela.
 */

export type PedidoJazigo = {
  vincularTumuloId?: string | null;
  identificacao?: string | null;
  quadraCodigo?: string | null;
  rua?: string | null;
  numero?: string | null;
  falecidoNome?: string | null;
  cemiterioId?: string | null;
};

export type ResultadoJazigo =
  | { ok: true; tumuloId: string; reaproveitado: boolean }
  | { ok: false; erro: string; detalhe?: string };

function txt(v: any): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

/**
 * `%` e `_` sao curingas do ilike. Sem escapar, cadastrar "L_128" casava com
 * "L-128" da familia do lado — e o vinculo ia para o jazigo errado.
 *
 * `*` NAO e escapado de proposito: o PostgREST troca `*` por `%` no padrao sem
 * olhar escape, entao `\*` chegaria ao SQL como `%` literal e a busca deixaria
 * de encontrar o proprio jazigo — falso negativo aqui INSERE uma copia. Como a
 * igualdade final e decidida no JS logo abaixo, deixar o `*` virar curinga so
 * traz candidatos a mais, que o filtro descarta.
 */
function paraIlike(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1");
}

/**
 * Procura o jazigo por quadra + identificacao (igualdade sem diferenciar
 * maiusculas). Nao usa maybeSingle() de proposito: ele estoura quando ha
 * duplicata no banco, e o codigo antigo descartava esse erro e INSERIA uma
 * terceira copia — o contrario da regra.
 */
async function acharNaQuadra(db: SupabaseClient, quadraId: string, ident: string) {
  const { data, error } = await db
    .from("tumulos").select("id,cliente_id,identificacao")
    .eq("quadra_id", quadraId).ilike("identificacao", paraIlike(ident))
    .order("identificacao").limit(50);
  if (error) return { erro: error.message as string };
  // e o banco quem faz a busca, mas quem decide a igualdade e o JS: assim, se o
  // escape do ilike falhar em alguma versao, "L-128" nunca passa por "L_128".
  const alvo = ident.trim().toLowerCase();
  const linhas = (data || []).filter(
    (t: any) => String(t.identificacao || "").trim().toLowerCase() === alvo,
  );
  if (linhas.length > 1) return { erro: "identificacao_duplicada" };
  return { linha: (linhas[0] as any) || null };
}

export async function anexarJazigo(
  db: SupabaseClient,
  org: string,
  clienteId: string,
  jz: PedidoJazigo,
): Promise<ResultadoJazigo> {
  // --- CAMINHO 1: vincular um jazigo já cadastrado (capturado no campo) ---
  if (jz.vincularTumuloId) {
    const { data: alvo } = await db
      .from("tumulos").select("id,cliente_id").eq("id", jz.vincularTumuloId).maybeSingle();
    if (!alvo) return { ok: false, erro: "jazigo_nao_encontrado" };

    const dono = (alvo as any).cliente_id as string | null;
    if (dono && dono !== clienteId) {
      // não rouba. Devolve o nome da outra família para a tela poder explicar.
      const { data: outro } = await db
        .from("clientes").select("nome").eq("id", dono).maybeSingle();
      return { ok: false, erro: "jazigo_de_outra_familia", detalhe: (outro as any)?.nome || undefined };
    }

    const patch: Record<string, any> = { cliente_id: clienteId };
    if (txt(jz.rua)) patch.rua = txt(jz.rua);
    if (txt(jz.numero)) patch.numero = txt(jz.numero);
    if (txt(jz.falecidoNome)) patch.falecido_nome = txt(jz.falecidoNome);
    const { error } = await db.from("tumulos").update(patch).eq("id", jz.vincularTumuloId);
    if (error) return { ok: false, erro: error.message };
    return { ok: true, tumuloId: jz.vincularTumuloId, reaproveitado: dono === clienteId };
  }

  // --- CAMINHO 2: jazigo novo (garante cemitério e quadra) ---
  const ident = txt(jz.identificacao);
  if (!ident) return { ok: false, erro: "identificacao_obrigatoria" };

  let cemId = jz.cemiterioId || null;
  if (!cemId) {
    // order("nome") aqui e em TODO lugar que escolhe o cemiterio padrao: sem a
    // mesma ordem, duas portas escolhiam cemiterios diferentes e duplicavam a
    // quadra e o jazigo em orgs com mais de um cemiterio.
    const { data: cem } = await db.from("cemiterios").select("id").order("nome").limit(1).maybeSingle();
    if (cem) cemId = (cem as any).id;
    else {
      const { data: novo, error } = await db.from("cemiterios")
        .insert({ org_id: org, nome: "Cemitério" }).select("id").single();
      if (error) return { ok: false, erro: error.message };
      cemId = (novo as any).id;
    }
  }

  // "S/Q" (sem quadra) é o padrão de quem ainda não mapeou o cemitério: o jazigo
  // entra na carteira hoje e ganha quadra depois, na primeira passagem do campo.
  const codigo = txt(jz.quadraCodigo) || "S/Q";
  let { data: quad } = await db.from("quadras")
    .select("id").eq("cemiterio_id", cemId).eq("codigo", codigo).maybeSingle();
  if (!quad) {
    const { data: novaQ, error } = await db.from("quadras")
      .insert({ org_id: org, cemiterio_id: cemId, codigo }).select("id").single();
    if (error) return { ok: false, erro: error.message };
    quad = novaQ as any;
  }
  const quadraId = (quad as any).id;

  const rua = txt(jz.rua);
  const numero = txt(jz.numero);
  const falecido = txt(jz.falecidoNome);

  // mesma identificação na mesma quadra = o MESMO jazigo do mundo real
  const achado = await acharNaQuadra(db, quadraId, ident);
  if ((achado as any).erro) return { ok: false, erro: (achado as any).erro };
  const existente = (achado as any).linha;

  if (existente) {
    const dono = (existente as any).cliente_id as string | null;
    if (dono && dono !== clienteId) {
      const { data: outro } = await db
        .from("clientes").select("nome").eq("id", dono).maybeSingle();
      return { ok: false, erro: "jazigo_de_outra_familia", detalhe: (outro as any)?.nome || undefined };
    }
    const patch: Record<string, any> = { cliente_id: clienteId };
    if (rua) patch.rua = rua;
    if (numero) patch.numero = numero;
    if (falecido) patch.falecido_nome = falecido;
    const { error } = await db.from("tumulos").update(patch).eq("id", (existente as any).id);
    if (error) return { ok: false, erro: error.message };
    // `reaproveitado` quer dizer "nada de novo aconteceu aqui": so e verdade
    // quando o jazigo JA era desta familia. Se estava orfao (o caso normal de
    // quem capturou no campo), o vinculo e inedito e a tela deve comemorar.
    return { ok: true, tumuloId: (existente as any).id, reaproveitado: dono === clienteId };
  }

  const { data: tum, error } = await db.from("tumulos").insert({
    org_id: org, quadra_id: quadraId, cliente_id: clienteId,
    identificacao: ident, rua, numero, falecido_nome: falecido,
  }).select("id").single();
  if (error) return { ok: false, erro: error.message };
  return { ok: true, tumuloId: (tum as any).id, reaproveitado: false };
}

export type PedidoPlano = {
  cadencia?: string | null;
  lavagensPorCiclo?: number | null;
  qtdPorPassagem?: number | null;
  valorMensal?: number | null;
  valorVigente?: number | null;
  inicio?: string | null;
};

/**
 * Cria o plano do jazigo, se ainda não houver um.
 *
 * "avulso" (Só quando pedirem) não cria plano de propósito: não há periodicidade
 * a agendar nem vencimento a cobrar. Devolve `criado: false` sem erro — a tela
 * usa isso para não anunciar um plano que não existe.
 */
export async function criarPlanoSeFaltar(
  db: SupabaseClient,
  org: string,
  clienteId: string,
  tumuloId: string,
  pl: PedidoPlano,
): Promise<{ ok: true; criado: boolean } | { ok: false; erro: string }> {
  const cadencia = txt(pl.cadencia);
  if (!cadencia || cadencia === "avulso") return { ok: true, criado: false };

  const { data: jaTem } = await db.from("planos")
    .select("id").eq("tumulo_id", tumuloId).limit(1).maybeSingle();
  if (jaTem) return { ok: true, criado: false };

  const bruto = Number(pl.valorMensal ?? pl.valorVigente);
  // sem valor legível não inventa preço: quem chama valida antes (a tela recusa
  // texto ambíguo em numeroBR). O 40 histórico do cadastro virava honorário real.
  if (!isFinite(bruto) || bruto <= 0) return { ok: false, erro: "valor_mensal_invalido" };
  const valorMensal = Math.round(bruto * 100) / 100;

  const lav = Math.max(1, Math.min(12, Number(pl.lavagensPorCiclo ?? pl.qtdPorPassagem) || 1));
  const venc = vencimentosIniciais(cadencia, pl.inicio || undefined);

  const { error } = await db.from("planos").insert({
    org_id: org,
    cliente_id: clienteId,
    tumulo_id: tumuloId,
    cadencia,
    qtd_por_passagem: lav,
    lavagens_por_ciclo: lav,
    valor_mensal: valorMensal,
    valor_vigente: valorDoCiclo(cadencia, valorMensal),
    data_valor_vigente: diaOperacao(),
    ativo: true,
    proximo_servico: venc.proximo_servico,
    proxima_cobranca: venc.proxima_cobranca,
    pago_ate: venc.pago_ate,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, criado: true };
}

/** Mensagem em português para os erros acima — usada nas duas telas. */
export function explicarErroJazigo(erro: string, detalhe?: string): string {
  switch (erro) {
    case "jazigo_nao_encontrado":
      return "Esse jazigo não existe mais. Recarregue a página.";
    case "jazigo_de_outra_familia":
      return detalhe
        ? `Esse jazigo já é da família ${detalhe}. Se mudou de família, abra a ficha de lá e desvincule antes.`
        : "Esse jazigo já pertence a outra família. Desvincule de lá antes de trazer para cá.";
    case "identificacao_duplicada":
      return "Ha mais de um jazigo com essa identificacao nessa quadra (duplicata antiga no banco). Nao da para adivinhar qual e o certo: abra o Mapa nessa quadra, apague ou renomeie a copia, e tente de novo.";
    case "identificacao_obrigatoria":
      return "Falta a identificação do jazigo (lote/número).";
    case "valor_mensal_invalido":
      return "O valor mensal não foi entendido. Digite como 40 ou 40,50.";
    case "sem_org":
      return "Sessão sem organização. Saia e entre de novo.";
    default:
      return erro;
  }
}
