/**
 * TILES — quais quadrados de imagem de satélite cobrem a janela da planta.
 *
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * A planta desenhava pontos sobre fundo branco. Ponto sobre nada não localiza
 * ninguém: falta o portão, a alameda, o telhado da capela — as referências que
 * a pessoa realmente usa. Aqui entra a imagem aérea ATRÁS do desenho.
 *
 * O DESENCONTRO DE PROJEÇÃO (e por que ele não estraga nada)
 * ---------------------------------------------------------------------------
 * A planta é equirretangular local (metros planos, ver planta.ts); as imagens
 * do mundo são Web Mercator. São projeções diferentes — sobrepor as duas em
 * escala de país deformaria tudo. Em escala de cemitério, não: cada quadrado é
 * posicionado pelos SEUS PRÓPRIOS cantos, convertidos um a um para metros. O
 * erro que sobra é o da curvatura DENTRO de um quadrado de ~100 m, na casa dos
 * centímetros — menos que a precisão do GPS que marcou os jazigos.
 *
 * Cantos de quadrados vizinhos são o MESMO ponto e são convertidos pela mesma
 * conta, então as bordas encaixam exatamente; não há costura.
 *
 * PROVEDOR
 * ---------------------------------------------------------------------------
 * O padrão é o serviço público de imagem do ArcGIS (Esri World Imagery), sem
 * chave, com a atribuição exigida na tela. É serviço de TERCEIRO: pode mudar
 * regra de uso, pode ficar fora do ar, pode não ter imagem recente do cemitério.
 * Por isso a URL é configurável por NEXT_PUBLIC_MAPA_TILES e a planta continua
 * funcionando inteira sem imagem nenhuma.
 */

import { paraGeo, paraMetros, type Caixa, type Geo } from "./planta";

export const TILES_PADRAO =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ATRIBUICAO_PADRAO =
  "Imagem: Esri, Maxar, Earthstar Geographics e a comunidade de usuários do GIS";

export function urlTiles(): string {
  const v = process.env.NEXT_PUBLIC_MAPA_TILES;
  return v && v.includes("{z}") ? v : TILES_PADRAO;
}

export type Tile = { chave: string; url: string; x: number; y: number; w: number; h: number };

const Z_MIN = 12;
/**
 * 19 é o teto de imagem aérea da maioria dos acervos no Brasil. Pedir 21 não
 * aproxima nada: devolve 404 ou um borrão, e a tela fica pior que com o zoom
 * menor esticado — que pelo menos mostra o traçado do cemitério.
 */
const Z_MAX = 19;
const MAX_TILES = 64;

function tileX(lng: number, z: number) { return ((lng + 180) / 360) * Math.pow(2, z); }
function tileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}
function lngDoTile(x: number, z: number) { return (x / Math.pow(2, z)) * 360 - 180; }
function latDoTile(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * O zoom certo é aquele em que 1 pixel da imagem ≈ 1 pixel da tela: mais que
 * isso é banda jogada fora, menos que isso é borrão. `upx` (metros por pixel de
 * tela) é o que a planta já calcula para manter ponto e fonte do mesmo tamanho.
 */
export function zoomPara(upx: number, lat: number): number {
  const resZ0 = (156543.03392 * Math.cos((lat * Math.PI) / 180));
  const z = Math.log2(resZ0 / Math.max(upx, 0.01));
  return Math.max(Z_MIN, Math.min(Z_MAX, Math.round(z)));
}

/**
 * Os quadrados que cobrem a janela `vb` (em metros, no mesmo centro da planta),
 * já posicionados em metros e prontos para virar <image> no SVG.
 *
 * Devolve [] quando a janela não tem centro geográfico válido — planta sem
 * nenhum ponto, por exemplo. Fundo branco é resposta melhor que imagem do
 * oceano em 0,0.
 */
export function tilesPara(centro: Geo, vb: Caixa, upx: number): Tile[] {
  if (!isFinite(centro.lat) || !isFinite(centro.lng)) return [];
  if (Math.abs(centro.lat) < 0.0001 && Math.abs(centro.lng) < 0.0001) return [];

  const modelo = urlTiles();
  const no = paraGeo(centro, { x: vb.x, y: vb.y });                     // noroeste
  const se = paraGeo(centro, { x: vb.x + vb.w, y: vb.y + vb.h });       // sudeste

  let z = zoomPara(upx, centro.lat);

  // orçamento de quadrados: em vez de cortar a cobertura (buraco na tela),
  // afasta um nível — imagem menos nítida cobrindo tudo é melhor que nítida pela
  // metade, e cada nível a menos divide o número de quadrados por 4.
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  for (;;) {
    x0 = Math.floor(tileX(no.lng, z));
    x1 = Math.floor(tileX(se.lng, z));
    y0 = Math.floor(tileY(no.lat, z));
    y1 = Math.floor(tileY(se.lat, z));
    const qtd = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (qtd <= MAX_TILES || z <= Z_MIN) break;
    z--;
  }

  const max = Math.pow(2, z);
  const lista: Tile[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= max) continue;
      const xx = ((x % max) + max) % max;   // volta o mundo, sem pedir tile negativo
      const a = paraMetros(centro, { lat: latDoTile(y, z), lng: lngDoTile(x, z) });
      const b = paraMetros(centro, { lat: latDoTile(y + 1, z), lng: lngDoTile(x + 1, z) });
      // meio pixel de sobra em cada lado: sem isso o arredondamento do navegador
      // deixa fio de fundo aparecendo entre um quadrado e o outro
      const folgaX = (b.x - a.x) * 0.002;
      const folgaY = (b.y - a.y) * 0.002;
      lista.push({
        chave: `${z}/${xx}/${y}`,
        url: modelo.replace("{z}", String(z)).replace("{x}", String(xx)).replace("{y}", String(y)),
        x: a.x - folgaX,
        y: a.y - folgaY,
        w: b.x - a.x + folgaX * 2,
        h: b.y - a.y + folgaY * 2,
      });
    }
  }
  return lista;
}
