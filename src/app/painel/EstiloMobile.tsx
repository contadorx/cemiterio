"use client";

/**
 * PAINEL NO CELULAR
 *
 * O painel foi desenhado em tela larga, mas na prática a Sureya usa no celular
 * enquanto anda pelo cemitério. Em vez de reescrever centenas de estilos
 * embutidos, esta folha corrige por cima o que quebra em tela estreita.
 *
 * As regras usam !important de propósito: os estilos inline têm precedência
 * maior, e é justamente eles que precisam ser vencidos aqui.
 */
export default function EstiloMobile() {
  return (
    <style>{`
      /* ---------------------------------------------------------------
         Até 640px: um celular na mão, no sol, andando.
         --------------------------------------------------------------- */
      @media (max-width: 640px) {

        /* Campo estreito não existe no celular: tudo ocupa a linha inteira.
           É o que resolve as dezenas de width:130 / 150 / 210 espalhados. */
        input:not([type="checkbox"]):not([type="radio"]),
        select,
        textarea {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          font-size: 16px !important;   /* abaixo disso o iOS dá zoom sozinho */
          min-height: 50px !important;
          padding: 13px 14px !important;
          box-sizing: border-box !important;
        }
        textarea { min-height: 130px !important; }

        /* Data e hora ficam lado a lado: cabem e é mais rápido */
        input[type="date"], input[type="month"], input[type="time"] {
          width: calc(50% - 5px) !important;
          min-width: 150px !important;
        }

        /* Cada campo com seu rótulo ocupa a linha toda */
        label { display: block !important; }

        /* Botão de verdade: dá para acertar sem olhar */
        button, a[role="button"] {
          min-height: 52px !important;
          font-size: 16px !important;
        }
        /* Botões pequenos dentro de listas continuam pequenos, mas tocáveis */
        button[data-compacto], .compacto button {
          min-height: 44px !important;
          font-size: 14px !important;
        }

        /* Texto de apoio legível: 12-13px some no sol */
        body { font-size: 16px; }

        /* Cartões com respiro e sem aperto */
        main, section { overflow-x: hidden; }

        /* Barras de filtro: rolam de lado em vez de espremer tudo */
        [data-filtros] {
          display: flex !important;
          flex-wrap: nowrap !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 6px;
          gap: 8px !important;
        }
        [data-filtros] > * { flex: 0 0 auto !important; }
        [data-filtros] input, [data-filtros] select {
          width: auto !important;
          min-width: 160px !important;
        }

        /* Tabelas rolam em vez de estourar a tela */
        table { display: block; overflow-x: auto; white-space: nowrap; }
      }

      /* ---------------------------------------------------------------
         Até 420px: celular pequeno. Nada mais de duas colunas.
         --------------------------------------------------------------- */
      @media (max-width: 420px) {
        input[type="date"], input[type="month"], input[type="time"] {
          width: 100% !important;
        }
        h1 { font-size: 20px !important; }
      }

      /* ---------------------------------------------------------------
         Toque: sem o atraso de 300ms e sem realce cinza ao tocar
         --------------------------------------------------------------- */
      button, a, select, input, textarea {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }

      /* Foco visível — importante para quem toca com o dedo grosso e erra */
      button:focus-visible, a:focus-visible,
      input:focus-visible, select:focus-visible, textarea:focus-visible {
        outline: 3px solid #0f766e;
        outline-offset: 2px;
      }

      /* Campo em foco fica evidente */
      input:focus, select:focus, textarea:focus {
        border-color: #0f766e !important;
      }

      /* Rolagem suave e sem "salto" ao abrir teclado */
      html { scroll-behavior: smooth; }

      /* A barra fixa de salvar não pode cobrir o último campo nem
         encostar na barra de gestos do Android */
      [data-barra-salvar] {
        padding-bottom: calc(14px + env(safe-area-inset-bottom)) !important;
      }
      [data-com-barra] { padding-bottom: 96px !important; }

      /* No celular a barra de salvar empilha: botão largo é botão fácil */
      @media (max-width: 640px) {
        [data-barra-salvar] { flex-direction: column !important; align-items: stretch !important; }
        [data-barra-salvar] button { width: 100% !important; margin-left: 0 !important; }
      }

      /* Modais: no celular sobem de baixo e ocupam quase tudo */
      @media (max-width: 640px) {
        [data-folha] {
          border-radius: 20px 20px 0 0 !important;
          max-height: 94vh !important;
          padding-bottom: calc(20px + env(safe-area-inset-bottom)) !important;
        }
      }
    `}</style>
  );
}
