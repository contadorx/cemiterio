// Fila offline do app de campo. Guarda o que não conseguiu subir (sem sinal) e
// sincroniza quando a rede volta. Client-side only.
//
// O QUE MUDOU E POR QUÊ
// ---------------------------------------------------------------------------
// 1. A fila cobria só a CONCLUSÃO. O "Começar" era um fetch cru: sem sinal, a
//    Nina levava um alerta e não conseguia iniciar nada — e como o botão de
//    finalizar só aparece depois de iniciar, ela não fechava jazigo nenhum.
//    A promessa da tela ("pode continuar — eu guardo e mando depois") era falsa
//    justamente no passo que vem primeiro.
// 2. As fotos iam em base64 dentro do localStorage. Uma foto preparada tem
//    ~300-400 KB; o limite típico do localStorage é 5 MB. Num dia de 15 jazigos
//    sem sinal, o `salvarFila` estourava, a exceção subia até o botão e o
//    trabalho SUMIA sem mensagem nenhuma. Agora o estouro é tratado, a pessoa é
//    avisada, e as fotos vão para o IndexedDB, que não tem esse teto.
// 3. (Build B) "GUARDADO" NÃO QUERIA DIZER "VAI SUBIR".
//    Qualquer resposta que não fosse `ok` virava item offline: sem sinal e
//    "o servidor recusou por regra" eram o mesmo desfecho. O cartão sumia da
//    lista, a faixa dizia "aguardando envio", e um item recusado ficava
//    tentando para sempre sem ninguém saber. A fila agora separa o que o tempo
//    resolve do que precisa de gente.
// 4. (Build B) DOIS TOQUES VIRAVAM DOIS REGISTROS. Cada tentativa criava um
//    uuid novo. O id passou a ser `servicoId:tipo` — a mesma lavagem escrita
//    duas vezes ocupa uma linha só, porque o IndexedDB sobrescreve pela chave.
// 5. (Build B) "Não deu para fazer" e o pedido de material eram `fetch` cru.
//    São justamente o que ela precisa fazer onde o sinal é pior: sem água, sem
//    material, jazigo não encontrado. Entraram na fila.

export type TipoPendente = "iniciar" | "concluir" | "nao_feito" | "pedido_material";

/**
 * OS ESTADOS QUE A PESSOA PRECISA DISTINGUIR.
 *
 *   guardado           está no aparelho, sobe quando a rede voltar
 *   precisa_de_ajuda   o servidor RECUSOU. Tentar de novo não resolve.
 *
 * "enviando" existe só durante a sincronização e não é gravado — item que
 * ficasse gravado como "enviando" depois de o app fechar no meio viraria uma
 * quarta categoria de mentira. "confirmado" também não se grava: confirmado é
 * ter saído da fila, e a tela mostra isso contando quantas subiram agora.
 */
export type EstadoPendente = "guardado" | "precisa_de_ajuda";

export interface Pendente {
  /** `servicoId:tipo`. Determinístico de propósito — ver o item 4 acima. */
  id: string;
  tipo: TipoPendente;
  servicoId: string;
  criadoEm: number;
  tentativas: number;
  estado: EstadoPendente;
  /** O que o servidor disse, quando a recusa é definitiva. */
  motivoFalha?: string;
  falhouEm?: number;
  /** Para a tela dizer QUAL jazigo está esperando, e não só quantos. */
  rotulo?: string;
  // conclusão
  fotoDepoisBase64?: string;
  fotoAntesBase64?: string;
  // início
  fotoBase64?: string;
  mimetype?: string;
  lat?: number;
  lng?: number;
  // não deu para fazer
  motivo?: string;
  // pedido de material
  itens?: { id?: string; nome: string; acabou: boolean }[];
  observacao?: string;
}

const BANCO = "sureya-campo";
const LOJA = "fila";
const CHAVE_LEGADA = "sureya_fila_conclusoes";

/** A chave que faz dois toques virarem um registro só. */
export function chaveDe(servicoId: string, tipo: TipoPendente): string {
  return `${servicoId || "avulso"}:${tipo}`;
}

/* ------------------------------------------------------------------ */
/* IndexedDB — sem biblioteca, só o necessário                         */
/* ------------------------------------------------------------------ */

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falhou) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: "id" });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falhou(req.error);
  });
}

async function comLoja<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir();
  return new Promise<T>((ok, falhou) => {
    const tx = db.transaction(LOJA, modo);
    const req = fn(tx.objectStore(LOJA));
    req.onsuccess = () => ok(req.result as T);
    req.onerror = () => falhou(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * DOIS REGISTROS DA MESMA LAVAGEM VIRAM UM (CP-08), sem banco no meio.
 *
 * Fica o MAIS ANTIGO: é o que tem a foto que ela tirou primeiro, tirada com o
 * jazigo do jeito que estava. A segunda tentativa é a mesma intenção repetida,
 * não uma correção.
 */
export function deduplicar(tudo: Pendente[]): { fila: Pendente[]; sobrando: string[] } {
  const porChave = new Map<string, Pendente>();
  const sobrando: string[] = [];
  for (const p of [...tudo].sort((a, b) => a.criadoEm - b.criadoEm)) {
    // Pedido de material não colapsa: dois pedidos no mesmo dia são dois
    // pedidos de verdade, ao contrário de dois toques na mesma lavagem.
    const k = p.tipo === "pedido_material" ? p.id : chaveDe(p.servicoId, p.tipo);
    if (porChave.has(k)) { sobrando.push(p.id); continue; }
    // Item gravado antes deste build não tem `estado`. Vazio não é zero: aqui
    // o vazio quer dizer "nunca foi recusado", que é `guardado`.
    porChave.set(k, { ...p, estado: p.estado || "guardado", tentativas: p.tentativas || 0 });
  }
  return {
    fila: [...porChave.values()].sort((a, b) => a.criadoEm - b.criadoEm),
    sobrando,
  };
}

/**
 * Lista tudo que está esperando, do mais antigo para o mais novo.
 *
 * A LIMPEZA DOS ITENS DA VERSÃO ANTIGA acontece aqui: até ontem cada tentativa
 * gravava um uuid diferente, então pode haver dois registros do mesmo
 * `servicoId:tipo` no aparelho de quem já usava o app. Fica o mais antigo — é
 * o que tem a foto que ela tirou primeiro.
 */
export async function lerFila(): Promise<Pendente[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const tudo = (await comLoja<Pendente[]>("readonly", (l) => l.getAll())) || [];
    const { fila, sobrando } = deduplicar(tudo);
    for (const id of sobrando) await remover(id);
    return fila;
  } catch {
    return [];
  }
}

/**
 * QUANTAS LAVAGENS ESPERAM — não quantos registros.
 *
 * Uma lavagem gera DOIS registros (`iniciar` e `concluir`). A faixa dizia
 * "4 registros esperando" para duas lavagens, e "registro" é unidade de
 * programador: ninguém no cemitério sabe quantos registros uma lavagem tem.
 */
export async function quantosPendentes(): Promise<number> {
  return (await resumoFila()).lavagens;
}

export interface ResumoFila {
  /** Serviços distintos com trabalho de lavagem esperando. */
  lavagens: number;
  /** Recados que não são lavagem: "não deu para fazer" e pedido de material. */
  recados: number;
  /** Quantos o servidor recusou de vez. Estes NÃO se resolvem esperando. */
  precisamDeAjuda: Pendente[];
  /** Um por serviço, para a tela poder dizer QUAL jazigo está esperando. */
  itens: Pendente[];
}

/** A contagem, sem banco — a mesma razão de `classificar` ser pura. */
export function contarFila(fila: Pendente[]): ResumoFila {
  const servicos = new Set(
    fila.filter((p) => p.tipo === "iniciar" || p.tipo === "concluir").map((p) => p.servicoId),
  );
  return {
    lavagens: servicos.size,
    recados: fila.filter((p) => p.tipo === "nao_feito" || p.tipo === "pedido_material").length,
    precisamDeAjuda: fila.filter((p) => p.estado === "precisa_de_ajuda"),
    itens: fila,
  };
}

export async function resumoFila(): Promise<ResumoFila> {
  return contarFila(await lerFila());
}

/** Os serviços que já estão resolvidos no aparelho, mesmo sem o servidor saber. */
export async function estadoLocalDosServicos(): Promise<{
  iniciados: Set<string>;
  concluidos: Set<string>;
  naoFeitos: Set<string>;
}> {
  const fila = await lerFila();
  return {
    iniciados: new Set(fila.filter((p) => p.tipo === "iniciar").map((p) => p.servicoId)),
    concluidos: new Set(fila.filter((p) => p.tipo === "concluir").map((p) => p.servicoId)),
    naoFeitos: new Set(fila.filter((p) => p.tipo === "nao_feito").map((p) => p.servicoId)),
  };
}

async function guardar(p: Pendente): Promise<boolean> {
  try {
    await comLoja("readwrite", (l) => l.put(p));
    return true;
  } catch (e) {
    // Sem espaço ou IndexedDB bloqueado (aba anônima em alguns aparelhos).
    // Devolve false para a tela AVISAR — o pior desfecho aqui é a Nina achar
    // que guardou e o trabalho ter sumido.
    console.error("[fila] não consegui guardar:", (e as any)?.message || e);
    return false;
  }
}

async function remover(id: string): Promise<void> {
  try {
    await comLoja("readwrite", (l) => l.delete(id));
  } catch { /* segue */ }
}

/** Tira da fila um item recusado, depois de a pessoa decidir o que fazer. */
export async function descartar(id: string): Promise<void> {
  await remover(id);
}

/* ------------------------------------------------------------------ */
/* Migração do que ficou na versão antiga (localStorage)               */
/* ------------------------------------------------------------------ */

/**
 * Se a Nina atualizar o app com trabalho ainda na fila velha, ele não pode se
 * perder. Roda uma vez, move para o IndexedDB e limpa a chave antiga.
 */
export async function migrarFilaAntiga(): Promise<number> {
  if (typeof localStorage === "undefined") return 0;
  let antigos: any[] = [];
  try {
    antigos = JSON.parse(localStorage.getItem(CHAVE_LEGADA) || "[]");
  } catch {
    return 0;
  }
  if (!antigos.length) return 0;

  let movidos = 0;
  for (const a of antigos) {
    const ok = await guardar({
      id: chaveDe(a.servicoId, "concluir"),
      tipo: "concluir",
      servicoId: a.servicoId,
      criadoEm: a.criadoEm || Date.now(),
      tentativas: 0,
      estado: "guardado",
      fotoDepoisBase64: a.fotoDepoisBase64,
      fotoAntesBase64: a.fotoAntesBase64,
      mimetype: a.mimetype,
      lat: a.lat,
      lng: a.lng,
    });
    if (ok) movidos++;
  }
  if (movidos === antigos.length) localStorage.removeItem(CHAVE_LEGADA);
  return movidos;
}

/* ------------------------------------------------------------------ */
/* Envio                                                               */
/* ------------------------------------------------------------------ */

const ROTA: Record<TipoPendente, string> = {
  iniciar: "/api/campo/iniciar",
  concluir: "/api/servico/concluir",
  nao_feito: "/api/campo/nao-feito",
  pedido_material: "/api/campo/pedido-material",
};

function corpoDe(p: Pendente): any {
  if (p.tipo === "iniciar") {
    return { servicoId: p.servicoId, fotoBase64: p.fotoBase64, mimetype: p.mimetype };
  }
  if (p.tipo === "concluir") {
    return {
      servicoId: p.servicoId,
      fotoDepoisBase64: p.fotoDepoisBase64,
      fotoAntesBase64: p.fotoAntesBase64,
      mimetype: p.mimetype,
      lat: p.lat,
      lng: p.lng,
    };
  }
  if (p.tipo === "nao_feito") return { servicoId: p.servicoId, motivo: p.motivo };
  return { itens: p.itens || [], observacao: p.observacao || "" };
}

/**
 * O QUE O TEMPO RESOLVE E O QUE PRECISA DE GENTE.
 *
 * Esta separação é o item CP-06 inteiro. Antes havia um `boolean`: subiu ou não
 * subiu. "Sem sinal no corredor" e "o servidor recusou porque o serviço é de
 * outra pessoa" davam no mesmo — e o segundo ia tentar para sempre, mostrando
 * "aguardando envio", enquanto o cartão já tinha sumido da lista dela.
 */
export type Resultado = "subiu" | "tente_depois" | "precisa_de_ajuda";

/**
 * A REGRA, SEM REDE NENHUMA — para dar para provar.
 *
 * Esta função é a CP-06 inteira, e é pura de propósito: recebe o que o servidor
 * respondeu e diz em qual dos três mundos aquilo cai. `enviarUm` só busca os
 * dois números e entrega para cá. Sem isso a regra só existiria dentro de um
 * `fetch`, e não haveria como testá-la sem inventar um servidor.
 */
export function classificar(status: number, corpo: any): { r: Resultado; motivo?: string } {
  // Servidor com problema, tempo esgotado ou pedido demais: tentar de novo é a
  // resposta certa. Nada disso é culpa do que ela fez.
  if (status >= 500 || status === 408 || status === 429) return { r: "tente_depois" };

  if (corpo?.ok) return { r: "subiu" };
  // "já concluído" também é sucesso: o item cumpriu o papel e não pode ficar
  // preso na fila para sempre.
  if (corpo?.erro === "ja_concluido" || corpo?.jaExecutado) return { r: "subiu" };

  // Chegou até o servidor e ele DECIDIU que não. Sessão vencida, serviço de
  // outra pessoa, serviço apagado, dado inválido: repetir dá o mesmo resultado.
  if (status === 401 || status === 403) {
    return { r: "precisa_de_ajuda", motivo: "Seu acesso venceu. Entre no app de novo." };
  }
  if (status === 404) {
    return { r: "precisa_de_ajuda", motivo: "Esta limpeza não existe mais no sistema." };
  }
  if (status >= 400 || corpo) {
    return { r: "precisa_de_ajuda", motivo: corpo?.mensagem || corpo?.erro || `O sistema recusou (${status}).` };
  }
  // 2xx com corpo ilegível: não dá para afirmar que houve decisão do outro
  // lado, então trata como passageira. Chutar "recusado" aqui pararia trabalho
  // bom por causa de um proxy que devolveu HTML.
  return { r: "tente_depois" };
}

async function enviarUm(p: Pendente): Promise<{ r: Resultado; motivo?: string }> {
  let resp: Response;
  try {
    resp = await fetch(ROTA[p.tipo], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpoDe(p)),
    });
  } catch {
    return { r: "tente_depois" };            // sem rede: o tempo resolve
  }
  const j = await resp.json().catch(() => null);
  return classificar(resp.status, j);
}

/**
 * Sincroniza a fila inteira, na ORDEM em que as coisas aconteceram — o
 * "iniciar" de um jazigo precisa subir antes do "concluir" dele, senão a
 * duração do serviço e a foto do antes se perdem.
 */
export async function sincronizar(): Promise<{ enviadas: number; restantes: number; precisamDeAjuda: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const r = await resumoFila();
    return { enviadas: 0, restantes: r.lavagens + r.recados, precisamDeAjuda: r.precisamDeAjuda.length };
  }
  let enviadas = 0;

  // O COMENTÁRIO DIZIA ISTO E O CÓDIGO NÃO FAZIA.
  //
  // "para de tentar os próximos DESTE serviço, para não subir uma conclusão
  // cujo início ainda não chegou" — mas o laço seguia direto. Um `iniciar`
  // preso mandava o `concluir` assim mesmo, e o serviço subia sem a foto do
  // antes e sem duração. Agora o serviço travado é anotado e pulado.
  const travados = new Set<string>();

  for (const p of await lerFila()) {
    if (p.estado === "precisa_de_ajuda") continue;    // esperar não resolve
    if (travados.has(p.servicoId)) continue;

    const { r, motivo } = await enviarUm(p);
    if (r === "subiu") {
      await remover(p.id);
      enviadas++;
    } else if (r === "precisa_de_ajuda") {
      travados.add(p.servicoId);
      await guardar({
        ...p,
        estado: "precisa_de_ajuda",
        motivoFalha: motivo,
        falhouEm: Date.now(),
        tentativas: (p.tentativas || 0) + 1,
      });
    } else {
      travados.add(p.servicoId);
      await guardar({ ...p, tentativas: (p.tentativas || 0) + 1 });
    }
  }
  const fim = await resumoFila();
  return {
    enviadas,
    restantes: fim.lavagens + fim.recados,
    precisamDeAjuda: fim.precisamDeAjuda.length,
  };
}

export type Desfecho = "online" | "offline" | "perdido" | "recusado";

/**
 * Tenta enviar; se não der, guarda para depois.
 *
 *   online     subiu agora
 *   offline    está guardado e sobe quando a rede voltar
 *   recusado   o servidor decidiu que não — esperar não resolve
 *   perdido    nem enviou nem conseguiu guardar; a tela PRECISA avisar
 */
async function enviarOuGuardar(
  p: Omit<Pendente, "criadoEm" | "tentativas" | "estado">,
): Promise<{ desfecho: Desfecho; motivo?: string }> {
  const item: Pendente = { ...p, criadoEm: Date.now(), tentativas: 0, estado: "guardado" };
  if (typeof navigator === "undefined" || navigator.onLine) {
    const { r, motivo } = await enviarUm(item);
    if (r === "subiu") return { desfecho: "online" };
    if (r === "precisa_de_ajuda") {
      // Guarda mesmo assim, marcado: sumir com o trabalho dela porque o
      // servidor recusou é como o item some sem ninguém ver. Fica na tela,
      // dizendo o que houve.
      await guardar({ ...item, estado: "precisa_de_ajuda", motivoFalha: motivo, falhouEm: Date.now() });
      return { desfecho: "recusado", motivo };
    }
  }
  return (await guardar(item)) ? { desfecho: "offline" } : { desfecho: "perdido" };
}

/** Começar a limpeza (com a foto do antes, quando houver). */
export async function iniciarOuEnfileirar(p: {
  servicoId: string;
  rotulo?: string;
  fotoBase64?: string;
  mimetype?: string;
}) {
  return enviarOuGuardar({ id: chaveDe(p.servicoId, "iniciar"), tipo: "iniciar", ...p });
}

/** Concluir a limpeza (a foto do depois é obrigatória). */
export async function concluirOuEnfileirar(p: {
  servicoId: string;
  rotulo?: string;
  fotoDepoisBase64: string;
  fotoAntesBase64?: string;
  mimetype: string;
  lat?: number;
  lng?: number;
}) {
  return enviarOuGuardar({ id: chaveDe(p.servicoId, "concluir"), tipo: "concluir", ...p });
}

/**
 * "NÃO DEU PARA FAZER" — agora também sem sinal (CP-04).
 *
 * A faixa amarela promete que dá para continuar sem internet, e isto era um
 * `fetch` cru: falhava com "Não consegui registrar agora. Tente de novo."
 * Chuva, água acabada, jazigo não encontrado — é o que mais acontece justamente
 * onde o sinal é pior, e era o que a fila não cobria.
 */
export async function naoFeitoOuEnfileirar(p: {
  servicoId: string;
  motivo: string;
  rotulo?: string;
}) {
  return enviarOuGuardar({ id: chaveDe(p.servicoId, "nao_feito"), tipo: "nao_feito", ...p });
}

/**
 * Pedido de material — também sem sinal.
 *
 * A chave leva a hora porque dois pedidos diferentes no mesmo dia são dois
 * pedidos de verdade, ao contrário de dois toques na mesma lavagem. O botão da
 * tela já se desabilita enquanto envia.
 */
export async function materialOuEnfileirar(p: {
  itens: { id?: string; nome: string; acabou: boolean }[];
  observacao?: string;
}) {
  return enviarOuGuardar({
    id: `pedido:${Date.now()}`,
    tipo: "pedido_material",
    servicoId: "",
    ...p,
  });
}
