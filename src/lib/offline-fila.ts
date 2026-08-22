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

export type TipoPendente = "iniciar" | "concluir";

export interface Pendente {
  id: string;               // uuid local
  tipo: TipoPendente;
  servicoId: string;
  criadoEm: number;
  tentativas: number;
  // conclusão
  fotoDepoisBase64?: string;
  fotoAntesBase64?: string;
  // início
  fotoBase64?: string;
  mimetype?: string;
  lat?: number;
  lng?: number;
}

const BANCO = "sureya-campo";
const LOJA = "fila";
const CHAVE_LEGADA = "sureya_fila_conclusoes";

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

/** Lista tudo que está esperando para subir, do mais antigo para o mais novo. */
export async function lerFila(): Promise<Pendente[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const tudo = await comLoja<Pendente[]>("readonly", (l) => l.getAll());
    return (tudo || []).sort((a, b) => a.criadoEm - b.criadoEm);
  } catch {
    return [];
  }
}

/** Quantos itens esperam — é o número que a faixa amarela do campo mostra. */
export async function quantosPendentes(): Promise<number> {
  return (await lerFila()).length;
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

function novoId(): string {
  return typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
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
      id: a.id || novoId(),
      tipo: "concluir",
      servicoId: a.servicoId,
      criadoEm: a.criadoEm || Date.now(),
      tentativas: 0,
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

/** Manda UM item. true = subiu (ou o servidor disse que já estava feito). */
async function enviarUm(p: Pendente): Promise<boolean> {
  const url = p.tipo === "iniciar" ? "/api/campo/iniciar" : "/api/servico/concluir";
  const corpo = p.tipo === "iniciar"
    ? { servicoId: p.servicoId, fotoBase64: p.fotoBase64, mimetype: p.mimetype }
    : {
        servicoId: p.servicoId,
        fotoDepoisBase64: p.fotoDepoisBase64,
        fotoAntesBase64: p.fotoAntesBase64,
        mimetype: p.mimetype,
        lat: p.lat,
        lng: p.lng,
      };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => null);
    if (j?.ok) return true;
    // "já concluído" / "já executado" também é sucesso: o item cumpriu o papel
    // e não pode ficar preso na fila para sempre.
    if (j?.erro === "ja_concluido" || j?.jaExecutado) return true;
    return false;
  } catch {
    return false; // sem rede
  }
}

/**
 * Sincroniza a fila inteira, na ORDEM em que as coisas aconteceram — o
 * "iniciar" de um jazigo precisa subir antes do "concluir" dele, senão a
 * duração do serviço e a foto do antes se perdem.
 */
export async function sincronizar(): Promise<{ enviadas: number; restantes: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { enviadas: 0, restantes: await quantosPendentes() };
  }
  let enviadas = 0;
  for (const p of await lerFila()) {
    const ok = await enviarUm(p);
    if (ok) {
      await remover(p.id);
      enviadas++;
    } else {
      // este falhou: para de tentar os próximos DESTE serviço, para não subir
      // uma conclusão cujo início ainda não chegou
      await guardar({ ...p, tentativas: (p.tentativas || 0) + 1 });
    }
  }
  return { enviadas, restantes: await quantosPendentes() };
}

export type Desfecho = "online" | "offline" | "perdido";

/**
 * Tenta enviar; se não der, guarda para depois.
 * "perdido" = nem enviou nem conseguiu guardar — a tela PRECISA avisar.
 */
async function enviarOuGuardar(p: Omit<Pendente, "id" | "criadoEm" | "tentativas">): Promise<Desfecho> {
  const item: Pendente = { ...p, id: novoId(), criadoEm: Date.now(), tentativas: 0 };
  if (typeof navigator === "undefined" || navigator.onLine) {
    if (await enviarUm(item)) return "online";
  }
  return (await guardar(item)) ? "offline" : "perdido";
}

/** Começar a limpeza (com a foto do antes, quando houver). */
export async function iniciarOuEnfileirar(p: {
  servicoId: string;
  fotoBase64?: string;
  mimetype?: string;
}): Promise<Desfecho> {
  return enviarOuGuardar({ tipo: "iniciar", ...p });
}

/** Concluir a limpeza (a foto do depois é obrigatória). */
export async function concluirOuEnfileirar(p: {
  servicoId: string;
  fotoDepoisBase64: string;
  fotoAntesBase64?: string;
  mimetype: string;
  lat?: number;
  lng?: number;
}): Promise<Desfecho> {
  return enviarOuGuardar({ tipo: "concluir", ...p });
}
