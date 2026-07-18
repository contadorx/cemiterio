// Fila offline do app de campo. Guarda conclusões que não conseguiram subir
// (sem sinal) em localStorage e sincroniza quando a rede volta.
// Client-side only.

export interface ConclusaoPendente {
  id: string; // uuid local
  servicoId: string;
  fotoDepoisBase64: string;
  fotoAntesBase64?: string;
  mimetype: string;
  lat?: number;
  lng?: number;
  criadoEm: number;
}

const CHAVE = "sureya_fila_conclusoes";

export function lerFila(): ConclusaoPendente[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || "[]");
  } catch {
    return [];
  }
}

function salvarFila(f: ConclusaoPendente[]) {
  localStorage.setItem(CHAVE, JSON.stringify(f));
}

export function enfileirar(c: Omit<ConclusaoPendente, "id" | "criadoEm">): ConclusaoPendente {
  const item: ConclusaoPendente = {
    ...c,
    id: (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    criadoEm: Date.now(),
  };
  const f = lerFila();
  f.push(item);
  salvarFila(f);
  return item;
}

function remover(id: string) {
  salvarFila(lerFila().filter((x) => x.id !== id));
}

// Tenta enviar UMA conclusão. Retorna true se subiu (ou se o serviço já estava feito).
async function enviarUma(c: ConclusaoPendente): Promise<boolean> {
  try {
    const r = await fetch("/api/servico/concluir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        servicoId: c.servicoId,
        fotoDepoisBase64: c.fotoDepoisBase64,
        fotoAntesBase64: c.fotoAntesBase64,
        mimetype: c.mimetype,
        lat: c.lat,
        lng: c.lng,
      }),
    });
    const j = await r.json().catch(() => null);
    return !!j?.ok;
  } catch {
    return false; // sem rede
  }
}

// Sincroniza a fila inteira. Retorna quantas subiram.
export async function sincronizar(): Promise<{ enviadas: number; restantes: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { enviadas: 0, restantes: lerFila().length };
  }
  let enviadas = 0;
  for (const c of lerFila()) {
    const ok = await enviarUma(c);
    if (ok) {
      remover(c.id);
      enviadas++;
    }
  }
  return { enviadas, restantes: lerFila().length };
}

// Envia direto; se falhar (sem rede), enfileira e devolve "offline".
export async function concluirOuEnfileirar(
  c: Omit<ConclusaoPendente, "id" | "criadoEm">
): Promise<"online" | "offline"> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    const ok = await enviarUma({ ...c, id: "tmp", criadoEm: Date.now() });
    if (ok) return "online";
  }
  enfileirar(c);
  return "offline";
}
