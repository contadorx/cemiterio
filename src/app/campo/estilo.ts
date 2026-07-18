/**
 * ESTILO DO APP DE CAMPO
 *
 * Quem usa isto está de pé no cemitério, sol na tela, mão molhada ou suja,
 * às vezes com luva. Não é um app de escritório. As decisões abaixo saem daí:
 *
 *  · TEXTO GRANDE — corpo em 17px, nunca abaixo de 15px. Ler sob sol forte
 *    com a tela suja é diferente de ler sentado.
 *  · CONTRASTE ALTO — cinza secundário é #475569, não #94a3b8. Cinza claro
 *    some no sol.
 *  · ALVO DE TOQUE DE 56px — o mínimo recomendado é 44, mas 44 é para dedo
 *    limpo e seco. Aqui o dedo pode estar com luva ou molhado.
 *  · ESPAÇO ENTRE BOTÕES — 12px no mínimo, para não errar o toque.
 *  · UM VERBO POR BOTÃO — "Começar", "Finalizar", "Não deu". Sem ícone sozinho:
 *    ícone acompanha palavra, nunca substitui.
 */

export const C = {
  navy: "#12284b",
  teal: "#0f766e",
  tealClaro: "#f0fdfa",
  creme: "#f7f3e9",
  linha: "#e7e0cf",
  texto: "#0f172a",
  textoSuave: "#475569",   // legível no sol (não usar #94a3b8)
  alerta: "#92400e",
  alertaFundo: "#fffbeb",
  perigo: "#b91c1c",
  perigoFundo: "#fef2f2",
  branco: "#ffffff",
} as const;

/** Alvos de toque. Nada abaixo de 56px em ação principal. */
export const TOQUE = { minimo: 56, confortavel: 64 } as const;

export const T: Record<string, React.CSSProperties> = {
  // --------------------------------------------------------------- estrutura
  pagina: {
    maxWidth: 560, margin: "0 auto", padding: 16, paddingBottom: 80,
    background: C.creme, minHeight: "100vh",
    fontSize: 17, color: C.texto, lineHeight: 1.5,
  },
  cartao: {
    background: C.branco, borderRadius: 16, padding: 18,
    marginBottom: 14, border: `1px solid ${C.linha}`,
  },

  // ------------------------------------------------------------------- texto
  titulo: { fontSize: 24, fontWeight: 700, color: C.navy, lineHeight: 1.25 },
  subtitulo: { fontSize: 19, fontWeight: 700, color: C.navy },
  corpo: { fontSize: 17, color: C.texto },
  apoio: { fontSize: 15, color: C.textoSuave },
  etiqueta: {
    fontSize: 13, color: C.textoSuave, textTransform: "uppercase",
    letterSpacing: 0.6, fontWeight: 600,
  },

  // ------------------------------------------------------------------ botões
  botao: {
    width: "100%", minHeight: TOQUE.confortavel, padding: "18px 20px",
    background: C.teal, color: C.branco, border: "none", borderRadius: 14,
    fontSize: 18, fontWeight: 700, cursor: "pointer", lineHeight: 1.2,
  },
  botaoSec: {
    minHeight: TOQUE.minimo, padding: "16px 20px",
    background: C.branco, color: C.navy, border: `2px solid ${C.linha}`,
    borderRadius: 14, fontSize: 17, fontWeight: 600, cursor: "pointer",
  },
  botaoEscuro: {
    width: "100%", minHeight: TOQUE.confortavel, padding: "18px 20px",
    background: C.navy, color: C.branco, border: "none", borderRadius: 14,
    fontSize: 18, fontWeight: 700, cursor: "pointer",
  },
  botaoFoto: {
    width: "100%", minHeight: 72, padding: "18px 20px",
    background: C.branco, color: C.navy, border: `2px dashed #cbd5e1`,
    borderRadius: 14, fontSize: 17, fontWeight: 600, cursor: "pointer",
  },
  botaoFotoOk: {
    borderStyle: "solid", borderColor: C.teal, color: C.teal, background: C.tealClaro,
  },

  // ------------------------------------------------------------------ campos
  campo: {
    width: "100%", padding: 16, fontSize: 18, borderRadius: 12,
    border: `2px solid ${C.linha}`, boxSizing: "border-box",
    fontFamily: "inherit", color: C.texto, background: C.branco,
    minHeight: TOQUE.minimo,
  },
  campoTexto: {
    width: "100%", padding: 16, fontSize: 18, borderRadius: 12,
    border: `2px solid ${C.linha}`, boxSizing: "border-box",
    fontFamily: "inherit", color: C.texto, background: C.branco,
    minHeight: 120, resize: "vertical", lineHeight: 1.5,
  },

  // ------------------------------------------------------------------ avisos
  aviso: {
    fontSize: 16, color: C.alerta, background: C.alertaFundo,
    padding: "12px 14px", borderRadius: 10, marginTop: 10, lineHeight: 1.4,
  },
  avisoUrgente: { color: C.perigo, background: C.perigoFundo },

  // ------------------------------------------------------------------ modais
  fundo: {
    position: "fixed", inset: 0, background: "rgba(15,23,42,.72)",
    display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60,
  },
  folha: {
    background: C.branco, width: "100%", maxWidth: 560,
    borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: 28,
    maxHeight: "94vh", overflowY: "auto",
  },
  folhaTopo: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: 10,
  },
  fechar: {
    background: "none", border: "none", fontSize: 30, cursor: "pointer",
    color: C.textoSuave, minWidth: TOQUE.minimo, minHeight: TOQUE.minimo,
    lineHeight: 1,
  },
};

/** Espaço entre ações, para não errar o toque. */
export const GAP = 12;
