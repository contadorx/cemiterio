import type { Config } from "tailwindcss";

/**
 * As cores NÃO ficam aqui: ficam em `app/tema.css`, como variáveis CSS.
 *
 * O motivo é prático — variável cascateia. O tema escuro, ou um contraste
 * maior para a Sureya ler no sol, viram um bloco de CSS, e não uma revisão de
 * cada tela. Aqui só damos nome a elas.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "rgb(var(--zm-fundo) / <alpha-value>)",
        card: "rgb(var(--zm-card) / <alpha-value>)",
        line: "rgb(var(--zm-linha) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--zm-ink) / <alpha-value>)",
          muted: "rgb(var(--zm-ink-muted) / <alpha-value>)",
          soft: "rgb(var(--zm-ink-soft) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--zm-brand) / <alpha-value>)",
          dark: "rgb(var(--zm-brand-dark) / <alpha-value>)",
          light: "rgb(var(--zm-brand-light) / <alpha-value>)",
        },
        ouro: "rgb(var(--zm-ouro) / <alpha-value>)",
        rail: {
          DEFAULT: "rgb(var(--zm-rail) / <alpha-value>)",
          hover: "rgb(var(--zm-rail-hover) / <alpha-value>)",
          muted: "rgb(var(--zm-rail-muted) / <alpha-value>)",
        },
        // "o que fica em cima de superfície forte": branco no claro, fundo do
        // cartão no escuro. Assim o par se resolve sozinho em qualquer tema.
        sobre: "rgb(var(--zm-sobre) / <alpha-value>)",
        positivo: "rgb(var(--zm-positivo) / <alpha-value>)",
        aviso: "rgb(var(--zm-aviso) / <alpha-value>)",
        perigo: "rgb(var(--zm-perigo) / <alpha-value>)",
      },
      borderRadius: { xl2: "14px" },
    },
  },
  plugins: [],
};
export default config;
