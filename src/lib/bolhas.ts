// Quebra uma resposta longa em 2-3 mensagens curtas, como uma pessoa escreveria
// no WhatsApp. Preserva parágrafos; nunca corta no meio de uma frase.
const MAX_BOLHAS = 3;
const TAMANHO_ALVO = 260; // caracteres por bolha (aprox.)

export function quebrarEmBolhas(texto: string): string[] {
  const limpo = (texto || "").trim();
  if (!limpo) return [];
  if (limpo.length <= TAMANHO_ALVO) return [limpo];

  // 1) tenta pelos parágrafos que a própria IA escreveu
  const paragrafos = limpo.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragrafos.length > 1 && paragrafos.length <= MAX_BOLHAS) return paragrafos;

  // 2) senão, agrupa frases até o tamanho alvo
  const frases = limpo.match(/[^.!?…]+[.!?…]*\s*/g) || [limpo];
  const bolhas: string[] = [];
  let atual = "";

  for (const f of frases) {
    if (atual && (atual + f).length > TAMANHO_ALVO && bolhas.length < MAX_BOLHAS - 1) {
      bolhas.push(atual.trim());
      atual = f;
    } else {
      atual += f;
    }
  }
  if (atual.trim()) bolhas.push(atual.trim());

  return bolhas.slice(0, MAX_BOLHAS);
}

// Pausa entre bolhas proporcional ao tamanho (simula digitação, sem exagero)
export function pausaMs(texto: string): number {
  return Math.min(3500, 700 + texto.length * 12);
}
