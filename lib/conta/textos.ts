/* Os textos da área do cliente.
 *
 * Importação estática, não leitura de disco: este módulo é usado por Server
 * Actions e pelo layout, e um `fs.readFileSync` aqui arrastaria o Node inteiro
 * para lugares onde ele não cabe (o middleware roda no Edge).
 *
 * A trava está no `conferir()` lá embaixo, chamada uma vez quando o módulo
 * carrega: se faltar uma chave em inglês ou espanhol, o build quebra. Sem isso,
 * a falta vira `undefined` na tela de um cliente — em silêncio, e só no idioma
 * que ninguém testou.
 */
import bruto from '@/src/i18n-conta.json';

export type Lang = 'pt' | 'en' | 'es' | 'de' | 'fr';
export type Textos = Record<string, string>;

const dicionarios = bruto as unknown as Record<string, Textos>;

export const IDIOMAS_CONTA: Lang[] = ['pt', 'en', 'es', 'de', 'fr'];

/** O endereço da área do cliente em cada idioma. Traduzido, como as outras
 *  páginas do site: quem lê em espanhol não deveria ter que reconhecer a
 *  palavra "conta" para achar a própria fatura. */
export const CAMINHO: Record<Lang, string> = {
  pt: '/conta',
  en: '/en/account',
  es: '/es/cuenta',
  de: '/de/konto',
  fr: '/fr/compte',
};

export const HTML_LANG: Record<Lang, string> = { pt: 'pt-BR', en: 'en', es: 'es', de: 'de', fr: 'fr' };

export const ehLang = (v: string): v is Lang => IDIOMAS_CONTA.includes(v as Lang);

export function textos(lang: Lang): Textos {
  return dicionarios[lang];
}

/** Troca `{chave}` pelo valor. Uma chave sem valor fica visível de propósito —
 *  é melhor ver `{quantos}` na tela e consertar do que ver uma frase quebrada
 *  e não saber por quê. */
export function preencher(molde: string, vals: Record<string, string | number>): string {
  let s = molde;
  for (const [k, v] of Object.entries(vals)) s = s.split('{' + k + '}').join(String(v));
  return s;
}

function conferir() {
  const base = Object.keys(dicionarios.pt);
  for (const L of IDIOMAS_CONTA) {
    if (L === 'pt') continue;
    const faltando = base.filter((k) => !(k in dicionarios[L]));
    const sobrando = Object.keys(dicionarios[L]).filter((k) => !base.includes(k));
    if (faltando.length || sobrando.length) {
      throw new Error(
        `i18n-conta.json fora de sincronia em "${L}"` +
        (faltando.length ? ` — faltam: ${faltando.join(', ')}` : '') +
        (sobrando.length ? ` — sobram: ${sobrando.join(', ')}` : ''),
      );
    }
  }
}
conferir();
