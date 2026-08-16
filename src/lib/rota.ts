/**
 * ROTEIRO POR ENDEREÇO — substitui a ordenação por GPS.
 *
 * O QUE MUDOU E POR QUÊ
 * A versão anterior (agenda.ts / ordenarPorProximidade) montava a rota por
 * vizinho-mais-próximo em lat/lng. Dois defeitos que custavam caro no chão:
 *
 *   1. Túmulo sem coordenada ia para o fim da fila, solto, fora da rua.
 *   2. O GPS não conhece muro. Ele enxergava um túmulo do outro lado da
 *      divisa como "logo ali" e mandava a Nina bater na parede.
 *
 * Agora a ordem sai do endereço, que é como a Nina realmente anda:
 *
 *      QUADRA  ->  RUA (ordem de caminhada)  ->  POSIÇÃO NA RUA
 *
 * O GPS não some: ele é capturado no cadastro e serve para descobrir a
 * POSIÇÃO do túmulo dentro da rua (posicionarNaRua, abaixo). Como os
 * túmulos não têm número gravado na pedra, é ele que diz quem vem antes de
 * quem. Mas nunca mais participa da navegação do dia.
 */

export type TipoRua = "principal" | "rua" | "transversal";

export interface RuaRota {
  id: string;
  nome: string;
  tipo: TipoRua;
  ordem: number;          // sequência da caminhada, cadastrada uma vez
  quadraOrdem: number;
  quadraCodigo: string;
  sentidoIda: boolean;
}

export interface ParadaRota {
  servicoId: string;
  tumuloId: string;
  codigo: string | null;      // "Q1-R5-03" — a Nina nunca digita, é para conferência
  ordemNaRua: number | null;
  rua: RuaRota;
  familia: string | null;
  fotoReferencia: string | null;
}

/**
 * A ordem do dia.
 *
 * A SERPENTINA: ruas de ordem PAR são percorridas ao contrário. Sem isso a
 * Nina termina a rua no fundo e volta andando à toa até o começo da próxima.
 * Alternando, ela emenda uma na outra. É o ganho mais barato do roteiro.
 *
 * Quando `sentidoIda` da rua vem marcado como false, o terreno mandou: o
 * cadastro vence a serpentina.
 */
export function ordenarRota(paradas: ParadaRota[]): ParadaRota[] {
  const porRua = new Map<string, ParadaRota[]>();
  for (const p of paradas) {
    const arr = porRua.get(p.rua.id) || [];
    arr.push(p);
    porRua.set(p.rua.id, arr);
  }

  const ruas = [...porRua.keys()]
    .map((id) => porRua.get(id)![0].rua)
    .sort((a, b) =>
      a.quadraOrdem !== b.quadraOrdem
        ? a.quadraOrdem - b.quadraOrdem
        : a.ordem - b.ordem
    );

  const rota: ParadaRota[] = [];
  ruas.forEach((rua, i) => {
    const daRua = porRua.get(rua.id)!.sort((a, b) => {
      // sem posição definida, vai para o fim da PRÓPRIA rua — nunca para o
      // fim do dia, como acontecia antes.
      const oa = a.ordemNaRua ?? Number.MAX_SAFE_INTEGER;
      const ob = b.ordemNaRua ?? Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });

    const inverter = rua.sentidoIda === false || i % 2 === 1;
    rota.push(...(inverter ? daRua.reverse() : daRua));
  });

  return rota;
}

/**
 * O BRIEFING DA MANHÃ.
 *
 * A Nina está de pé no portão, celular numa mão. Ela precisa de uma frase:
 * para onde andar. Nada além disso — o detalhe de cada túmulo vive no card,
 * na hora de fazer, que é quando serve.
 */
export interface ResumoDoDia {
  quadras: string[];
  ruas: string[];
  total: number;
  porRua: { rua: string; quadra: string; quantos: number; observacao?: string }[];
}

export function resumirDia(rota: ParadaRota[]): ResumoDoDia {
  const porRua: ResumoDoDia["porRua"] = [];
  const quadras: string[] = [];
  const ruas: string[] = [];

  for (const p of rota) {
    const ultima = porRua[porRua.length - 1];
    if (ultima && ultima.rua === p.rua.nome && ultima.quadra === p.rua.quadraCodigo) {
      ultima.quantos += 1;
    } else {
      porRua.push({ rua: p.rua.nome, quadra: p.rua.quadraCodigo, quantos: 1 });
    }
    if (!quadras.includes(p.rua.quadraCodigo)) quadras.push(p.rua.quadraCodigo);
    if (!ruas.includes(p.rua.nome)) ruas.push(p.rua.nome);
  }

  return { quadras, ruas, total: rota.length, porRua };
}

/** "Hoje: Quadra 1 — Ruas 3, 4 e 5" — a frase que ela lê no portão. */
export function fraseDoDia(resumo: ResumoDoDia): string {
  if (!resumo.total) return "Hoje não tem jazigo na lista.";

  const listar = (itens: string[]) =>
    itens.length === 1
      ? itens[0]
      : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

  const q = listar(resumo.quadras);
  const r = listar(resumo.ruas.map((n) => n.replace(/^Rua /, "")));
  const plural = resumo.ruas.length > 1 ? "Ruas" : "Rua";

  return `${q} — ${plural} ${r}`;
}

/**
 * A POSIÇÃO DO TÚMULO DENTRO DA RUA, a partir do GPS do cadastro.
 *
 * Os túmulos não têm número na pedra. Então, para saber quem vem antes de
 * quem, projetamos a coordenada de cada um sobre o EIXO da rua e ordenamos
 * por essa projeção.
 *
 * O eixo é descoberto pelos próprios túmulos já cadastrados: a direção em
 * que eles mais se espalham é a direção da rua. É grosseiro de propósito —
 * e suficiente, porque não queremos a distância, só a ORDEM.
 *
 * Sobre a precisão: GPS de celular em cemitério erra alguns metros. Se um
 * par sair trocado, a Sureya arrasta na lista e corrige. Uma vez, para
 * sempre. É muito mais barato que numerar 400 túmulos na mão.
 */
export interface PontoTumulo {
  tumuloId: string;
  lat: number | null;
  lng: number | null;
}

export const PASSO = 100;   // espaço deixado entre um túmulo e o seguinte

export function posicionarNaRua(pontos: PontoTumulo[]): { tumuloId: string; ordem: number }[] {
  const comGps = pontos.filter((p) => p.lat != null && p.lng != null);
  const semGps = pontos.filter((p) => p.lat == null || p.lng == null);

  if (comGps.length <= 1) {
    return [...comGps, ...semGps].map((p, i) => ({ tumuloId: p.tumuloId, ordem: (i + 1) * PASSO }));
  }

  // Espalhamento em cada eixo. O maior manda: é o comprimento da rua.
  const lats = comGps.map((p) => p.lat!);
  const lngs = comGps.map((p) => p.lng!);
  const amplitudeLat = Math.max(...lats) - Math.min(...lats);
  const amplitudeLng = Math.max(...lngs) - Math.min(...lngs);

  const ordenados = [...comGps].sort((a, b) =>
    amplitudeLat >= amplitudeLng ? a.lat! - b.lat! : a.lng! - b.lng!
  );

  // Sem GPS vão para o fim da rua, não para o fim do dia. A Sureya reposiciona.
  // Espaçados de PASSO em PASSO: é esse vão que permite encaixar um túmulo
  // novo no meio depois, sem tocar em nenhum vizinho.
  return [...ordenados, ...semGps].map((p, i) => ({ tumuloId: p.tumuloId, ordem: (i + 1) * PASSO }));
}

/**
 * ONDE ENCAIXAR UM TÚMULO NOVO — o caso que o cadastro incompleto exige.
 *
 * O cemitério nunca estará todo cadastrado de uma vez. Um túmulo novo vai
 * aparecer entre dois que já existem, e a regra é uma só:
 *
 *      NENHUM VIZINHO É RENUMERADO. NUNCA.
 *
 * O novo recebe o ponto médio entre o anterior e o seguinte. Como a coluna
 * é numérica com 4 casas, sempre cabe mais um no meio — entre 100 e 200 vai
 * 150; entre 100 e 150 vai 125; entre 100 e 125 vai 112,5. Na prática nunca
 * acaba: caberiam milhares de inserções no mesmo vão.
 *
 *   anterior = null  -> entrou antes de todo mundo (começo da rua)
 *   seguinte = null  -> entrou depois de todo mundo (fim da rua)
 */
export function posicaoParaEncaixar(
  ordemAnterior: number | null,
  ordemSeguinte: number | null
): number {
  if (ordemAnterior == null && ordemSeguinte == null) return PASSO;
  if (ordemAnterior == null) return ordemSeguinte! / 2;
  if (ordemSeguinte == null) return ordemAnterior + PASSO;
  return (ordemAnterior + ordemSeguinte) / 2;
}

/**
 * Onde o GPS diz que o túmulo novo entra, entre os que já existem na rua.
 * Devolve a posição pronta para gravar — o chamador não precisa saber de
 * vizinho nem de ponto médio.
 */
export function encaixarPeloGps(
  novo: PontoTumulo,
  jaNaRua: { tumuloId: string; ordem: number; lat: number | null; lng: number | null }[]
): number {
  const comGps = jaNaRua.filter((t) => t.lat != null && t.lng != null);
  if (novo.lat == null || novo.lng == null || comGps.length === 0) {
    const maior = jaNaRua.reduce((m, t) => Math.max(m, t.ordem), 0);
    return maior + PASSO;              // sem GPS: vai para o fim da rua
  }

  // mesmo critério de eixo do posicionarNaRua
  const lats = [...comGps.map((t) => t.lat!), novo.lat];
  const lngs = [...comGps.map((t) => t.lng!), novo.lng];
  const usaLat =
    Math.max(...lats) - Math.min(...lats) >= Math.max(...lngs) - Math.min(...lngs);
  const eixo = (t: { lat: number | null; lng: number | null }) => (usaLat ? t.lat! : t.lng!);

  const ordenados = [...comGps].sort((a, b) => a.ordem - b.ordem);
  const meu = usaLat ? novo.lat : novo.lng;

  let anterior: number | null = null;
  let seguinte: number | null = null;
  for (const t of ordenados) {
    if (eixo(t) <= meu) anterior = t.ordem;
    else { seguinte = t.ordem; break; }
  }
  return posicaoParaEncaixar(anterior, seguinte);
}

/**
 * O CÓDIGO DO TÚMULO: "Q1-R5-007". É o RG dele.
 *
 * ATENÇÃO — o número final é a ORDEM DE CADASTRO naquela rua, e NÃO a
 * posição física. Essa distinção é o que mantém o sistema íntegro:
 *
 *   · A posição muda quando um túmulo novo entra no meio da rua.
 *   · O código não pode mudar nunca, porque ele já foi para a ficha da
 *     família, para o histórico de lavagens e para as fotos.
 *
 * Buracos na numeração são normais e esperados. Se o Q1-R5-007 sair do
 * cadastro, o número 007 morre com ele e não é reaproveitado — é o que
 * impede que um registro antigo passe a apontar para outro túmulo.
 *
 * `seqCadastro` vem do contador da rua (ruas.seq_cadastro), que só cresce.
 * A Nina nunca digita nem procura por isso: ela reconhece pela foto.
 */
export function gerarCodigo(quadraCodigo: string, ruaNome: string, seqCadastro: number): string {
  const q = quadraCodigo.replace(/\D/g, "") || "0";
  const num = ruaNome.replace(/\D/g, "");
  const prefixo = /transversal/i.test(ruaNome) ? "T" : "R";
  const rua = num ? `${prefixo}${num}` : "PR";        // PR = Principal
  return `Q${q}-${rua}-${String(seqCadastro).padStart(3, "0")}`;
}
