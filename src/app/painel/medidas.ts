/**
 * AS MEDIDAS DOS CONTROLES, NUM LUGAR SÓ.
 *
 * O QUE EU ACHEI AO OLHAR A CA-11
 *
 * A auditoria descreveu o problema como estética: "telas novas usam Tailwind e
 * componentes de `pecas.tsx`; telas extensas usam objetos inline de `ui.tsx` (…)
 * controles, espaçamentos e botões variam". Fui comparar os dois para unificar,
 * e o que estava variando não era só aparência.
 *
 * `ui.tsx` — o sistema ANTIGO — escreve a regra e a cumpre:
 *
 *     // ── Botões tamanho padrão (altura de toque confortável no celular, >= 48px)
 *     botao: { … minHeight: 48 }
 *
 * `pecas.tsx` — o sistema NOVO — não tem `min-height` nenhum. `py-2.5` com
 * texto de 15px dá cerca de 44px, e nada segura esse número: mudar o tamanho da
 * fonte encolhe o botão junto.
 *
 * Ou seja: o vocabulário novo perdeu, sem que ninguém notasse, uma regra que o
 * antigo tinha escrita com o motivo ao lado. E ele é usado justamente nas telas
 * mais novas — a Liberação, onde ela decide o que vai para as famílias, e o
 * cadastro em quatro passos.
 *
 * 44 contra 48 parece pouco. Não é pouco no celular, no meio da tarde, com
 * pressa — é a diferença entre acertar e tocar no botão de cima. E os dois
 * sistemas conviverem com números diferentes garante que a diferença volte na
 * próxima peça que alguém escrever.
 *
 * Então a unificação começa por aqui: os números moram neste arquivo, os dois
 * sistemas importam daqui, e uma guarda em `testes/checar-ficha.mjs` reprova
 * quem cravar um número na mão.
 */

/** Alvo de toque confortável no celular. Não é enfeite: é acerto de dedo. */
export const ALVO = 48;

/** Alvo mínimo para controles em linhas densas (listas de ação). */
export const ALVO_MINI = 40;

/** Campos de formulário: menores que botão, mas ainda acertáveis. */
export const ALVO_CAMPO = 44;

/** Cantos. 14 no cartão, 8 no controle — a mesma escala dos dois sistemas. */
export const RAIO_CARTAO = 14;
export const RAIO_CONTROLE = 8;

/** Respiro interno do cartão, e o espaço entre um cartão e o seguinte. */
export const PAD_CARTAO = 16;
export const GAP_CARTAO = 12;

/**
 * Corpo de texto dos controles. 15px em vez de 16 é escolha antiga e
 * consciente; o zoom automático do iOS mira 16 no INPUT, e é por isso que o
 * campo tem regra própria na folha móvel.
 */
export const TEXTO_CONTROLE = 15;
