import { env } from "./env";

// Transcreve um áudio (base64) em pt-BR.
// Usa Groq (whisper-large-v3) se GROQ_API_KEY existir; senão OpenAI (whisper-1);
// sem nenhuma chave, retorna null (o chamador escala pra humano).
export async function transcreverAudio(
  base64: string,
  mimetype: string
): Promise<string | null> {
  const groq = env.GROQ_API_KEY;
  const openai = env.OPENAI_API_KEY;
  if (!groq && !openai) return null;

  const url = groq
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const chave = groq || openai;
  const modelo = groq ? "whisper-large-v3" : "whisper-1";

  try {
    const bytes = Buffer.from(base64, "base64");
    const ext = mimetype.includes("ogg")
      ? "ogg"
      : mimetype.includes("mp4") || mimetype.includes("m4a")
      ? "m4a"
      : mimetype.includes("mpeg") || mimetype.includes("mp3")
      ? "mp3"
      : "ogg"; // WhatsApp costuma mandar audio/ogg; codecs=opus

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mimetype || "audio/ogg" }), `audio.${ext}`);
    form.append("model", modelo);
    form.append("language", "pt");

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}` },
      body: form,
    });
    if (!res.ok) {
      console.error("[transcricao] falhou:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j: any = await res.json();
    const texto = (j?.text || "").trim();
    return texto || null;
  } catch (e) {
    console.error("[transcricao] exceção:", (e as any)?.message || e);
    return null;
  }
}
