"use client";

/**
 * O MAPA PONTO A PONTO — a alternativa à seta.
 *
 * POR QUE ELE EXISTE
 * ---------------------------------------------------------------------------
 * Primeira ida a campo com o app, 22/08: "a navegação no campo foi bem ruim, as
 * setas ficam malucas, talvez um mapa de ponto a ponto seja melhor".
 *
 * A seta ficou, e ficou consertada (ver `desenrolarAngulo` em lib/geo.ts — ela
 * girava pelo caminho longo ao cruzar o norte, e isso era um defeito de CSS,
 * não ruído de GPS). Mas a seta tem um limite que nenhum conserto tira: ela
 * depende de saber para onde o APARELHO está apontado. Sem bússola calibrada, e
 * parada, essa informação simplesmente não existe.
 *
 * O mapa não depende disso. Norte para cima, imagem aérea atrás, os dois pontos
 * e a linha entre eles: a pessoa se orienta pelo telhado, pela alameda, pela
 * Principal — as referências que ela já usa quando não tem celular na mão.
 *
 * O QUE É DESENHADO, E O QUE NÃO É
 * ---------------------------------------------------------------------------
 * A linha é RETA. Não é o caminho: não conheço os muros nem onde há passagem
 * entre uma quadra e outra, e desenhar uma curva inventada seria pior que a
 * reta honesta — mandaria contornar por onde não se passa.
 *
 * O círculo em volta do ponto azul é a margem de erro de verdade. Com ±9 m ele
 * cobre uns cinco jazigos, e é isso mesmo que a pessoa precisa ver: o GPS
 * entrega o corredor, a lápide quem confere é ela.
 *
 * SEM IMAGEM AÉREA a tela continua servindo — os pontos, a linha e a escala
 * ficam sobre fundo claro. Melhor que nada e melhor que uma tela em branco
 * esperando um servidor de terceiro responder.
 */

import { useMemo, useState } from "react";
import { centroDe, paraMetros, caixa, ajustarAspecto, escalaBonita, type Geo } from "@/lib/planta";
import { tilesPara, urlTiles, ATRIBUICAO_PADRAO } from "@/lib/tiles";
import { distanciaBr } from "@/lib/geo";

export default function MapaAteOJazigo({ alvo, eu, margem, altura = 260 }: {
  alvo: Geo;
  eu: Geo | null;
  /** Raio de incerteza em metros — o círculo em volta do ponto azul. */
  margem: number;
  altura?: number;
}) {
  const [semImagem, setSemImagem] = useState(false);

  const cena = useMemo(() => {
    const pontos: Geo[] = eu ? [alvo, eu] : [alvo];
    const centro = centroDe(pontos);
    const xy = pontos.map((p) => paraMetros(centro, p));

    // A folga acompanha a incerteza: com ±30 m não adianta enquadrar 8 m de
    // folga e deixar metade do círculo fora da tela.
    const folga = Math.max(12, margem * 1.2);
    const vb = ajustarAspecto(caixa(xy, folga, 40), 1.6);

    const pAlvo = paraMetros(centro, alvo);
    const pEu = eu ? paraMetros(centro, eu) : null;
    return { centro, vb, pAlvo, pEu };
  }, [alvo, eu, margem]);

  const { centro, vb, pAlvo, pEu } = cena;

  // metros por pixel de tela: é o que decide o zoom da imagem aérea e a
  // espessura dos traços, para o desenho não engrossar quando a janela aperta.
  const larguraPx = 560;
  const upx = vb.w / larguraPx;
  const traco = upx * 1.6;

  const tiles = useMemo(
    () => (semImagem ? [] : tilesPara(centro, vb, upx)),
    [centro, vb, upx, semImagem],
  );

  const escala = escalaBonita(vb.w / 3);
  const dist = pEu ? Math.hypot(pAlvo.x - pEu.x, pAlvo.y - pEu.y) : null;

  return (
    <div>
      <svg
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ width: "100%", height: altura, display: "block", borderRadius: 12,
                 border: "1px solid #e7e0cf", background: "#f7f3e9" }}
        role="img"
        aria-label={
          pEu
            ? `Mapa: o jazigo está a ${distanciaBr(dist || 0)} de você, com margem de ${Math.round(margem)} metros.`
            : "Mapa com a posição do jazigo. Sua posição ainda não foi lida."
        }
      >
        {tiles.map((t) => (
          <image
            key={t.chave}
            href={t.url}
            x={t.x} y={t.y} width={t.w} height={t.h}
            preserveAspectRatio="none"
            // Um servidor de imagem de terceiro pode cair, mudar de regra ou
            // simplesmente não ter foto deste pedaço. Quando a primeira falha,
            // o desenho segue sem imagem em vez de ficar meio pintado.
            onError={() => setSemImagem(true)}
          />
        ))}

        {/* A LINHA RETA. Tracejada de propósito: linha cheia parece caminho
            percorrível, e este traço não conhece muro. */}
        {pEu && (
          <line
            x1={pEu.x} y1={pEu.y} x2={pAlvo.x} y2={pAlvo.y}
            stroke="#0f766e" strokeWidth={traco} strokeDasharray={`${traco * 3} ${traco * 2}`}
            strokeLinecap="round" opacity={0.95}
          />
        )}

        {/* EU — o círculo é a margem de erro, no tamanho real em metros. */}
        {pEu && (
          <>
            <circle cx={pEu.x} cy={pEu.y} r={Math.max(margem, 2)}
                    fill="#2563eb" fillOpacity={0.16} stroke="#2563eb"
                    strokeOpacity={0.5} strokeWidth={traco * 0.6} />
            <circle cx={pEu.x} cy={pEu.y} r={traco * 2.6} fill="#2563eb"
                    stroke="#fff" strokeWidth={traco} />
          </>
        )}

        {/* O JAZIGO */}
        <circle cx={pAlvo.x} cy={pAlvo.y} r={traco * 3.4} fill="#b91c1c"
                stroke="#fff" strokeWidth={traco * 1.2} />
        <circle cx={pAlvo.x} cy={pAlvo.y} r={traco * 7} fill="none"
                stroke="#b91c1c" strokeWidth={traco * 0.8} opacity={0.75} />

        {/* ESCALA — sem ela não dá para saber se a tela mostra 20 m ou 200 m,
            e a distância na tela vira decoração. */}
        <g transform={`translate(${vb.x + vb.w * 0.05}, ${vb.y + vb.h * 0.92})`}>
          <line x1={0} y1={0} x2={escala} y2={0} stroke="#0f172a" strokeWidth={traco} />
          <line x1={0} y1={-traco * 2} x2={0} y2={traco * 2} stroke="#0f172a" strokeWidth={traco} />
          <line x1={escala} y1={-traco * 2} x2={escala} y2={traco * 2} stroke="#0f172a" strokeWidth={traco} />
          <text x={escala / 2} y={-traco * 3} textAnchor="middle"
                fontSize={upx * 13} fill="#0f172a" style={{ paintOrder: "stroke" }}
                stroke="#fff" strokeWidth={upx * 3}>
            {escala} m
          </text>
        </g>
      </svg>

      <p style={{ fontSize: 13, color: "#475569", margin: "6px 2px 0", lineHeight: 1.4 }}>
        Norte para cima. A linha é reta — <b>não é o caminho</b>: use as alamedas.
        {" "}O círculo azul é o tamanho real da incerteza do GPS.
        {semImagem && <> A imagem aérea não carregou; o desenho continua valendo.</>}
      </p>
      {!semImagem && !!tiles.length && urlTiles().includes("arcgisonline") && (
        <p style={{ fontSize: 11, color: "#94a3b8", margin: "3px 2px 0" }}>{ATRIBUICAO_PADRAO}</p>
      )}
    </div>
  );
}
