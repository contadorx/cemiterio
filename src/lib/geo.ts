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

/**
 * =====================================================================
 * A SETA QUE GIRAVA SOZINHA — e a distância que só acertava na chegada
 * =====================================================================
 *
 * Da primeira ida a campo com o app, em 22/08: "as setas ficam malucas" e "a
 * diferença em metros foi significativa, e somente quando cheguei ele ajustou".
 * As duas queixas têm causa diferente e conserto diferente.
 *
 * 1 · A SETA GIRAVA PELO CAMINHO LONGO
 *
 * O ângulo saía de `anguloDaSeta`, que devolve 0..360. A seta tem
 * `transition: transform .25s`. Quando o ângulo passava de 359° para 1° — o que
 * acontece a cada tremida perto do norte —, o navegador animava de 359 para 1
 * pelo caminho que ele conhece: para trás, quase uma volta inteira. Um passo de
 * dois graus virava um giro de 358 na tela.
 *
 * Não é ruído de GPS: é aritmética de CSS. `desenrolarAngulo` mantém um ângulo
 * CONTÍNUO (pode passar de 360, pode ficar negativo) cuja diferença para o
 * anterior nunca passa de 180°, então a animação sempre pega o lado curto.
 *
 * 2 · A DISTÂNCIA VINHA DE UM PONTO VELHO
 *
 * `watchPosition` estava com `maximumAge: 2000`, que autoriza o navegador a
 * devolver uma posição guardada. No Android a primeira coisa que chega é a
 * localização por rede — dezenas de metros fora — e ela ficava valendo até o
 * GNSS resolver. Daí "43 m" parado por dois minutos e o salto para "chegou".
 *
 * `mediaPonderada` junta as leituras recentes dando peso a quem tem precisão
 * melhor. O que ela NÃO faz é diminuir a margem declarada: erro de GPS é
 * correlacionado em segundos (mesmo satélite, mesma parede, mesmo desvio), e
 * anunciar ±3 m porque foram seis leituras seria prometer o que não se tem. A
 * margem continua sendo a da melhor leitura.
 */

export type Leitura = { lat: number; lng: number; prec: number; em: number };

/**
 * Ângulo contínuo: devolve o valor mais próximo de `anterior` que representa a
 * mesma direção que `alvo`. 359 -> 1 vira 359 -> 361, e o giro na tela é de 2°.
 */
export function desenrolarAngulo(anterior: number, alvo: number): number {
  if (!isFinite(anterior)) return alvo;
  let d = (alvo - anterior) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return anterior + d;
}

/**
 * As leituras que ainda valem: as dos últimos `janelaMs`, e nunca as muito
 * piores que a melhor da janela.
 *
 * O corte por qualidade é o que impede uma leitura de rede de ±80 m puxar a
 * média quando já existe uma de GNSS de ±6 m. Sem nenhuma leitura boa, ele não
 * corta nada — pior que uma posição ruim é não ter posição nenhuma.
 */
export function leiturasValidas(hist: Leitura[], agora: number, janelaMs = 15000): Leitura[] {
  const recentes = hist.filter((l) => agora - l.em <= janelaMs && isFinite(l.lat) && isFinite(l.lng));
  if (recentes.length <= 1) return recentes;
  const melhor = Math.min(...recentes.map((l) => l.prec));
  const teto = Math.max(melhor * 3, melhor + 10);
  const boas = recentes.filter((l) => l.prec <= teto);
  return boas.length ? boas : recentes;
}

/**
 * A posição usada na tela: média das leituras válidas ponderada por 1/prec².
 *
 * A margem devolvida é a da MELHOR leitura, não a da média — ver o comentário
 * grande acima. Prometer precisão que não existe é o erro que faz alguém
 * desconfiar da lápide certa.
 */
export function mediaPonderada(leituras: Leitura[]): { lat: number; lng: number; prec: number } | null {
  if (!leituras.length) return null;
  let sp = 0, slat = 0, slng = 0, melhor = Infinity;
  for (const l of leituras) {
    const p = 1 / Math.pow(Math.max(l.prec, 1), 2);
    sp += p; slat += l.lat * p; slng += l.lng * p;
    if (l.prec < melhor) melhor = l.prec;
  }
  if (!(sp > 0)) return null;
  return { lat: slat / sp, lng: slng / sp, prec: melhor };
}

/**
 * O deslocamento entre a leitura mais antiga e a mais nova da janela.
 *
 * Serve para responder "ela está andando?" sem depender de `coords.speed`, que
 * vem nulo em boa parte dos aparelhos. Andar é o que torna o rumo confiável:
 * parada, a direção calculada é a direção do próprio ruído.
 */
export function deslocamentoNaJanela(leituras: Leitura[]): number {
  if (leituras.length < 2) return 0;
  const ord = [...leituras].sort((a, b) => a.em - b.em);
  const a = ord[0], b = ord[ord.length - 1];
  return distanciaMetros(a.lat, a.lng, b.lat, b.lng);
}
