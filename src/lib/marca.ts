/**
 * Identidade da marca, num lugar só.
 * "Sureya" continua sendo o nome interno do sistema (código, envs, tabelas).
 * O que a FAMÍLIA vê é a marca: Zelo & Memória.
 */
export const MARCA = {
  nome: "Zelo & Memória",
  assinatura: "Por Dona Nadir · Desde 1990",
  desde: 1990,
  cemiterio: "Cemitério da Saudade — Vila Vitória, Mauá",
  site: "zeloememoria.com.br",
  // paleta do logo (escudo azul + ramo de oliveira dourado)
  cores: {
    navy: "#12284b",
    gold: "#c6a15b",
    cream: "#f7f3e9",
    linha: "#e7e0cf",
    suave: "#6b7280",
  },
} as const;

/** Selo curto para cabeçalhos: "🕊 Zelo & Memória" */
export const SELO = `🕊 ${MARCA.nome}`;
