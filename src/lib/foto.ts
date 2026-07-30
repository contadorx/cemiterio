/**
 * Preparo de foto no aparelho, ANTES de subir.
 *
 * Por que isto existe: a foto de um celular moderno tem de 4 a 12 MB. O sistema
 * manda a imagem dentro de um JSON em base64, e base64 engorda o arquivo em ~33%.
 * O servidor (Vercel) recusa corpo de requisicao acima de ~4,5 MB — entao a foto
 * simplesmente "nao subia", sem explicacao nenhuma na tela.
 *
 * Aqui a imagem e redesenhada num canvas com o lado maior limitado e reencodada
 * em JPEG. Uma lapide fica perfeitamente legivel em 1600 px, e o arquivo cai de
 * 8 MB para 200-400 KB. Sobe rapido ate no 3G do cemiterio, que e o lugar onde
 * isto vai rodar de verdade.
 */

export type FotoPronta = {
  b64: string;      // sem o prefixo data:
  mt: string;       // mimetype final
  previa: string;   // data URL, para mostrar na tela
  kb: number;       // tamanho final, para diagnostico
};

const LADO_MAX = 1600;
const QUALIDADE = 0.82;
// Teto proposital abaixo do limite real do servidor: sobra margem para o resto
// do JSON e para o overhead do transporte.
const TETO_BYTES = 3_000_000;

function lerComoDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, falhou) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result || ""));
    fr.onerror = () => falhou(new Error("nao consegui ler o arquivo da foto"));
    fr.readAsDataURL(b);
  });
}

function empacotar(dataUrl: string, mt: string): FotoPronta {
  const b64 = dataUrl.split(",")[1] || "";
  return { b64, mt, previa: dataUrl, kb: Math.round((b64.length * 3) / 4 / 1024) };
}

/** Decodifica respeitando a orientacao do EXIF (foto de celular em pe). */
async function decodificar(arq: File): Promise<{ w: number; h: number; fonte: CanvasImageSource }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bm = await createImageBitmap(arq, { imageOrientation: "from-image" } as any);
      return { w: bm.width, h: bm.height, fonte: bm };
    } catch {
      /* cai no caminho do <img> */
    }
  }
  const url = URL.createObjectURL(arq);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falhou) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falhou(new Error("formato de imagem nao reconhecido"));
      i.src = url;
    });
    return { w: img.naturalWidth, h: img.naturalHeight, fonte: img };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function paraBlob(c: HTMLCanvasElement, q: number): Promise<Blob | null> {
  return new Promise((ok) => c.toBlob((b) => ok(b), "image/jpeg", q));
}

/**
 * Recebe o arquivo cru do <input type="file"> e devolve a foto pronta para subir.
 * Se o navegador nao souber redesenhar a imagem, manda o arquivo original —
 * mas so se ele couber; grande demais, avisa com texto que da para agir.
 */
export async function prepararFoto(arq: File, ladoMax = LADO_MAX): Promise<FotoPronta> {
  try {
    const { w, h, fonte } = await decodificar(arq);
    if (!w || !h) throw new Error("imagem vazia");

    let escala = Math.min(1, ladoMax / Math.max(w, h));
    let q = QUALIDADE;

    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * escala));
      c.height = Math.max(1, Math.round(h * escala));
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas indisponivel");
      ctx.drawImage(fonte, 0, 0, c.width, c.height);

      const blob = await paraBlob(c, q);
      if (!blob) throw new Error("nao consegui reencodar");
      if (blob.size <= TETO_BYTES) return empacotar(await lerComoDataUrl(blob), "image/jpeg");

      // Ainda pesada (foto panoramica gigante): aperta e tenta de novo.
      escala *= 0.75;
      q = Math.max(0.6, q - 0.07);
    }
    throw new Error("a foto continuou pesada demais depois de reduzir");
  } catch (e: any) {
    // Caminho de seguranca: alguns aparelhos entregam HEIC que o canvas nao abre.
    if (arq.size > TETO_BYTES) {
      throw new Error(
        "Nao consegui reduzir esta foto neste aparelho e ela e grande demais para subir. " +
        "Tire a foto pela camera do proprio sistema ou baixe a resolucao da camera do celular."
      );
    }
    return empacotar(await lerComoDataUrl(arq), arq.type || "image/jpeg");
  }
}

/** Texto curto e util a partir de um erro de rede/servidor. */
export function motivoFalha(e: any): string {
  const m = String(e?.message || e || "").trim();
  if (!m) return "falha de conexao";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "sem sinal — tente de novo perto de um lugar com internet";
  if (/413|too large|payload/i.test(m)) return "a foto ficou pesada demais para o servidor";
  return m;
}
