/**
 * PLANTA — matemática da planta do cemitério (pura, sem React).
 *
 * O GPS chega em graus (lat/lng). Desenhar grau direto distorce: em Santo André
 * um grau de longitude tem ~92 km e um de latitude ~110 km, então a quadra sai
 * achatada. Aqui projetamos para METROS num plano local (equirretangular em
 * torno do centro do conjunto) — a poucas centenas de metros o erro é
 * irrelevante e o desenho fica na proporção certa, o que permite régua de
 * escala e distância de rota em metros de verdade.
 *
 * Eixos do resultado: x cresce para LESTE, y cresce para o SUL — assim o y já
 * serve direto para SVG (que cresce para baixo) com o norte em cima.
 */

export type Geo = { lat: number; lng: number };
export type XY = { x: number; y: number };
export type Caixa = { x: number; y: number; w: number; h: number };

const M_POR_GRAU_LAT = 110540;
const M_POR_GRAU_LNG = 111320;

export function projetar<T extends Geo>(pontos: T[]): Array<T & XY> {
  if (!pontos.length) return [];
  const lat0 = pontos.reduce((s, p) => s + p.lat, 0) / pontos.length;
  const lng0 = pontos.reduce((s, p) => s + p.lng, 0) / pontos.length;
  const mLng = M_POR_GRAU_LNG * Math.cos((lat0 * Math.PI) / 180);
  return pontos.map((p) => ({
    ...p,
    x: (p.lng - lng0) * mLng,
    y: (lat0 - p.lat) * M_POR_GRAU_LAT,
  }));
}

/** Caixa que contém os pontos, com folga e um tamanho mínimo (metros). */
export function caixa(pts: XY[], folga = 8, minimo = 24): Caixa {
  if (!pts.length) return { x: -minimo / 2, y: -minimo / 2, w: minimo, h: minimo };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  let x0 = Math.min(...xs) - folga, x1 = Math.max(...xs) + folga;
  let y0 = Math.min(...ys) - folga, y1 = Math.max(...ys) + folga;
  if (x1 - x0 < minimo) { const c = (x0 + x1) / 2; x0 = c - minimo / 2; x1 = c + minimo / 2; }
  if (y1 - y0 < minimo) { const c = (y0 + y1) / 2; y0 = c - minimo / 2; y1 = c + minimo / 2; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Estica a caixa (sempre para fora, nunca cortando) até a proporção da tela. */
export function ajustarAspecto(c: Caixa, aspecto: number): Caixa {
  const atual = c.w / c.h;
  if (Math.abs(atual - aspecto) < 1e-6) return c;
  if (atual < aspecto) {
    const w = c.h * aspecto;
    return { x: c.x - (w - c.w) / 2, y: c.y, w, h: c.h };
  }
  const h = c.w / aspecto;
  return { x: c.x, y: c.y - (h - c.h) / 2, w: c.w, h };
}

export function distancia(a: XY, b: XY): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Separa o GPS absurdo antes de desenhar.
 *
 * Uma leitura errada (celular sem sinal devolvendo 0,0, ou o jazigo marcado
 * dentro do carro na estrada) fica a quilômetros do cemitério. Como a caixa do
 * desenho contém TODOS os pontos, um único ponto assim encolhe a quadra inteira
 * para um pixel.
 *
 * O critério é a MAIORIA, não a mediana. A mediana de lat e de lng, calculada
 * separadamente, cai NO MEIO quando os pontos estão em dois grupos: com dois
 * jazigos no cemitério e dois marcados a 6 km, o "centro" ficava a 3 km de todo
 * mundo, ninguém passava do raio, nada era acusado — e a planta saía com 6 km de
 * largura, cada grupo virando um pixel. Exatamente a falha que esta função
 * existe para impedir.
 *
 * COMO O GRUPO É FORMADO: por CONTÁGIO, não por distância a um âncora. Dois
 * pontos ficam no mesmo grupo se um encosta no outro dentro do raio, ou se há
 * uma corrente de pontos ligando os dois (componentes conexas, união-busca). O
 * maior grupo é desenhado; o resto volta em "fora" para a tela avisar em vez de
 * esconder.
 *
 * ORDEM DO ARRAY NÃO IMPORTA (e por que isto é uma promessa, não um detalhe):
 * a tela ordena por identificação, então qualquer dependência de ordem viraria
 * "renomear um jazigo mudou a planta". Contágio não tem âncora e não tem ordem.
 * A única coisa que quebrava a promessa era coordenada NÃO FINITA (NaN), que
 * contamina a mediana usada para a escala do grau — o `sort` de NaN devolve
 * resultado diferente conforme a posição no array. Por isso NaN/Infinity é
 * separado ANTES da eleição e sai direto como suspeito.
 *
 * POR QUE NÃO "O PONTO COM MAIS VIZINHOS": porque a resposta passava a depender
 * da ORDEM DO ARRAY. Contando vizinhos e elegendo um âncora, uma fileira de
 * leituras espaçadas alternava entre "desenha a maioria" e "não desenha nada"
 * só porque /api/localizacao ordena por identificação — renomear um jazigo
 * mudava a planta. Contágio não tem âncora e não tem ordem: o resultado é o
 * mesmo com os pontos em qualquer sequência.
 *
 * EMPATE NÃO É MAIORIA: com dois grupos do mesmo tamanho (dois jazigos aqui,
 * dois a 6 km) não há como saber qual é o certo; nenhum é desenhado e a tela
 * lista todos como suspeitos. Já 2+1+1, 3+2 ou 3+2+1 têm um grupo maior que
 * todos os outros e são desenhados normalmente.
 *
 * QUEM VOTA MUDA O RESULTADO — e isso e responsabilidade de quem chama. A
 * eleicao e da MAIORIA do conjunto que voce entrega: passar so os jazigos de
 * uma quadra (2 pontos, empate garantido) condena leituras que a votacao do
 * cemiterio inteiro aprovaria. Por isso a tela do mapa roda esta funcao UMA vez
 * por cemiterio, sobre todos os jazigos dele, e depois filtra o resultado pelo
 * escopo — nunca sobre a lista ja filtrada. Assim escolher uma quadra no menu
 * nao pode reclassificar um GPS.
 *
 * O QUE ISTO NAO GARANTE (a tela do mapa completa o servico): o raio limita o
 * salto entre VIZINHOS, nao o vao do conjunto. Dois pontos a 4,9 km um do outro
 * sao um grupo; e por contagio uma fileira de leituras espacadas pode formar um
 * grupo unico com quilometros de ponta a ponta. Isto e um filtro de leitura
 * ABSURDA (0,0, jazigo marcado na estrada), nao um controle de qualidade do GPS
 * — e a distancia real do conjunto e checada na tela, pelo aviso de "planta
 * larga demais" (src/app/painel/mapa), que mede o par mais afastado e mostra o
 * desenho de todo modo, em vez de sumir com o ponto.
 */
export function separarDistantes<T extends Geo>(
  pontos: T[],
  raioMetros = 5000,
): { dentro: T[]; fora: T[] } {
  // COORDENADA NÃO FINITA sai antes de tudo (ver o docblock): sem posição não
  // há como julgar distância, e ela envenenava a mediana. Hoje gpsValido() já
  // barra isto na tela do mapa, mas esta função é exportada e a garantia de
  // "o resultado não depende da ordem" tem de valer sozinha.
  const validos: T[] = [], invalidos: T[] = [];
  for (const p of pontos) {
    (isFinite(Number(p.lat)) && isFinite(Number(p.lng)) ? validos : invalidos).push(p);
  }

  // com 1 ponto não há como julgar: não existe maioria, então ele fica.
  if (validos.length < 2) return { dentro: [...validos], fora: [...invalidos] };

  // projeção local só para medir distância (metros), com o centro aproximado
  // pela mediana — aqui ela serve bem, porque só define a escala do grau.
  const latM = mediana(validos.map((p) => Number(p.lat)));
  const mLng = M_POR_GRAU_LNG * Math.cos((latM * Math.PI) / 180);
  const xy = validos.map((p) => ({ x: Number(p.lng) * mLng, y: Number(p.lat) * M_POR_GRAU_LAT }));

  // COMPONENTES CONEXAS por união-busca: mesmo grupo = encosta em alguém do
  // grupo dentro do raio. Não há âncora nem ordem: o resultado é idêntico com
  // os pontos embaralhados.
  const pai = xy.map((_, i) => i);
  const raiz = (i: number): number => {
    let r = i;
    while (pai[r] !== r) r = pai[r];
    while (pai[i] !== r) { const s = pai[i]; pai[i] = r; i = s; }
    return r;
  };
  for (let i = 0; i < xy.length; i++) {
    for (let j = i + 1; j < xy.length; j++) {
      if (Math.hypot(xy[i].x - xy[j].x, xy[i].y - xy[j].y) <= raioMetros) {
        const a = raiz(i), b = raiz(j);
        if (a !== b) pai[a] = b;
      }
    }
  }

  const tamanho = new Map<number, number>();
  const grupo = xy.map((_, i) => raiz(i));
  for (const g of grupo) tamanho.set(g, (tamanho.get(g) || 0) + 1);

  let maior = -1, maiorTam = 0, empatados = 0;
  for (const [g, n] of tamanho) {
    if (n > maiorTam) { maiorTam = n; maior = g; empatados = 1; }
    else if (n === maiorTam) empatados++;
  }

  // SEM MAIORIA, NINGUÉM É VERDADE — e são dois jeitos de não ter maioria, com a
  // mesma resposta: ou dois (ou mais) grupos do mesmo tamanho, ou ninguém tem
  // companhia (duas leituras a 12 km uma da outra: dois grupos de 1, que é o
  // caso do empate visto de perto). Nenhuma vale desenhar; a tela lista todas
  // como suspeitas, com a coordenada preservada.
  if (empatados > 1 || maiorTam < 2) return { dentro: [], fora: [...pontos] };

  const dentro: T[] = [], fora: T[] = [...invalidos];
  for (let i = 0; i < validos.length; i++) (grupo[i] === maior ? dentro : fora).push(validos[i]);
  return { dentro, fora };
}

/**
 * Rota a pé pelo vizinho mais próximo.
 *
 * Mesma HEURÍSTICA da alocação da agenda (src/lib/agenda.ts), mas não o mesmo
 * código: lá a distância é calculada em graus e dentro de uma quadra só, aqui
 * em metros e podendo atravessar o cemitério. Para ordenar paradas o resultado
 * é praticamente o mesmo; se um dia a ordem tiver de bater exatamente entre as
 * duas telas, isto aqui é que vira a fonte única.
 */
export function rotaVizinhoMaisProximo<T extends XY>(pts: T[], inicio?: T): T[] {
  if (pts.length <= 2) return [...pts];
  const restantes = [...pts];
  let atualIdx = inicio ? Math.max(0, restantes.indexOf(inicio)) : 0;
  const ordem: T[] = [restantes.splice(atualIdx, 1)[0]];
  while (restantes.length) {
    const ref = ordem[ordem.length - 1];
    let melhor = 0, melhorD = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distancia(ref, restantes[i]);
      if (d < melhorD) { melhorD = d; melhor = i; }
    }
    ordem.push(restantes.splice(melhor, 1)[0]);
  }
  return ordem;
}

export function comprimentoRota(pts: XY[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += distancia(pts[i - 1], pts[i]);
  return t;
}

/**
 * Comprimento "redondo" para a régua de escala, sempre CABENDO no limite.
 *
 * A lista fixa antiga mentia nos dois extremos: com limite de 0,3 m devolvia
 * 1 m (régua maior que o espaço que ela mede) e com limite de 3 km travava em
 * 1000 m. Aqui os passos são gerados (1 · 2 · 5 × potência de 10), então serve
 * de um jazigo até um cemitério inteiro.
 */
export function escalaBonita(limiteMetros: number): number {
  const limite = Math.max(Number(limiteMetros) || 0, 0.01);
  const exp = Math.floor(Math.log10(limite));
  let escolhido = Math.pow(10, exp);
  for (const m of [1, 2, 5]) {
    const v = m * Math.pow(10, exp);
    if (v <= limite) escolhido = v;
  }
  return Math.round(escolhido * 100) / 100;
}
