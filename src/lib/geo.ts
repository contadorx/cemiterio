/**
 * GEO — conta de bolso para "onde eu estou" x "onde é o jazigo".
 *
 * Distâncias aqui são de dezenas de metros dentro de um cemitério, não de
 * navegação intercontinental: o plano local (equirretangular) erra menos que o
 * próprio GPS do celular e não custa trigonometria esférica. Os mesmos fatores
 * de src/lib/planta.ts, de propósito — se a planta do painel e a seta do campo
 * usarem constantes diferentes, os dois mostram distâncias diferentes para o
 * mesmo par de pontos e ninguém entende qual está certa.
 */

export const M_POR_GRAU_LAT = 110540;
export const M_POR_GRAU_LNG = 111320;

/** Distância em metros entre dois pontos próximos. */
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const mLng = M_POR_GRAU_LNG * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lat2 - lat1) * M_POR_GRAU_LAT, (lng2 - lng1) * mLng);
}

/**
 * Rumo em graus (0 = norte, 90 = leste) do ponto 1 para o ponto 2.
 * É o ângulo ABSOLUTO no terreno; para virar seta na tela é preciso descontar
 * para onde o celular está apontado (ver `anguloDaSeta`).
 */
export function rumoGraus(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const mLng = M_POR_GRAU_LNG * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const leste = (lng2 - lng1) * mLng;
  const norte = (lat2 - lat1) * M_POR_GRAU_LAT;
  const g = (Math.atan2(leste, norte) * 180) / Math.PI;
  return (g + 360) % 360;
}

/**
 * A seta na tela = rumo do destino MENOS a direção para onde o aparelho aponta.
 * Sem bússola (`bussola` nulo) a seta vira referência de norte: o texto tem de
 * dizer isso, senão a pessoa segue uma seta que aponta para o lado errado com
 * toda a confiança do mundo.
 */
export function anguloDaSeta(rumo: number, bussola: number | null): number {
  return ((rumo - (bussola ?? 0)) + 360) % 360;
}

const CARDEAIS = ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"];

/** "nordeste", "sul"… a partir do rumo em graus. */
export function cardeal(graus: number): string {
  const i = Math.round(((graus % 360) + 360) % 360 / 45) % 8;
  return CARDEAIS[i];
}

/** Relógio: "à sua frente", "à direita"… a partir do ângulo já relativo. */
export function relogio(anguloRelativo: number): string {
  const a = ((anguloRelativo % 360) + 360) % 360;
  if (a < 25 || a >= 335) return "à sua frente";
  if (a < 70) return "à frente, à direita";
  if (a < 110) return "à sua direita";
  if (a < 160) return "atrás, à direita";
  if (a < 200) return "atrás de você";
  if (a < 250) return "atrás, à esquerda";
  if (a < 290) return "à sua esquerda";
  return "à frente, à esquerda";
}

/** Metros em texto curto de campo: sem casas decimais inúteis, sem "1000 m". */
export function distanciaBr(m: number): string {
  if (m >= 999.5) return `${(m / 1000).toFixed(m < 10000 ? 2 : 1).replace(".", ",")} km`;
  if (m >= 20) return `${Math.round(m)} m`;
  return `${Math.round(m)} m`;
}

/**
 * A FAIXA DE CONFIANÇA — o número que evita a promessa falsa.
 *
 * "12 m" parece preciso. Se a leitura do celular tem ±15 m e a posição gravada
 * do jazigo ±8 m, esses 12 m podem ser 0 ou 35. Mandar alguém procurar uma
 * lápide exata com esse número é pior que não mandar nada: ela desconfia da
 * lápide certa. Então a incerteza aparece junto e a decisão de "chegou" usa a
 * soma, não a distância crua.
 */
export function incerteza(precisaoMinha: number | null, precisaoAlvo: number | null): number {
  const a = precisaoMinha != null && isFinite(precisaoMinha) ? precisaoMinha : 20;
  const b = precisaoAlvo != null && isFinite(precisaoAlvo) ? precisaoAlvo : 10;
  return Math.hypot(a, b);
}
