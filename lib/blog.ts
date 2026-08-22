/* O BLOG — leitura, gestão e o desenho do texto.
 *
 * ---- por que o corpo é markdown e não HTML ----
 *
 * O texto sai do banco e vira HTML numa página. Se o que estivesse guardado
 * fosse HTML, qualquer coisa escrita no editor viraria marcação executada — e o
 * editor é um formulário. Bastaria um `<script>` colado num post para ele rodar
 * na página de todo visitante, com o domínio do produto na barra.
 *
 * Então o corpo é markdown, e a conversão daqui faz UMA coisa antes de qualquer
 * outra: escapa tudo. Só depois aplica o subconjunto de marcas que a lista
 * abaixo permite. Não existe caminho pelo qual um `<` do texto original chegue
 * ao navegador como abertura de etiqueta — e é por isso que a ordem importa
 * mais que a lista.
 */
import 'server-only';
import { rpc } from '@/lib/supabase/servico';

export type Lang = 'pt' | 'en' | 'es' | 'de' | 'fr';

export type Figura = { caminho: string; url: string; alt: string };

export type Resumo = {
  chave: string; slug: string; titulo: string; resumo: string;
  autor: string | null; tags: string[]; publicado_em: string;
  /** a figura que vai na lista e na prévia de quem compartilha */
  capa: string | null;
};
export type Post = Resumo & {
  corpo: string; atualizado_em: string;
  /** os idiomas em que este post existe, e o endereço dele em cada um — é daqui
   *  que sai o `hreflang`. Anunciar uma versão alemã que não existe manda o
   *  buscador para um 404 do próprio site. */
  idiomas: Record<string, string>;
};
export type Versao = { slug: string; titulo: string; resumo: string; corpo: string };
export type PostAdmin = {
  chave: string; autor: string | null; tags: string[]; capa: string | null;
  publicado_em: string | null; criado_em: string; atualizado_em: string;
  versoes: Partial<Record<Lang, Versao>>;
  figuras: Figura[];
};

/* ---- AS DUAS LEITURAS PÚBLICAS DO BLOG ----

   Elas são as únicas deste projeto que podem ser guardadas em cache: o post é
   igual para todo mundo, e um rastreador que passa cem vezes por dia não tem
   por que abrir cem consultas ao banco. Os cinco minutos são o mesmo prazo do
   `revalidate` das páginas — dois números diferentes aqui produziriam uma
   página fresca sobre dados velhos, que é o pior dos dois mundos.

   Publicar pelo painel revalida os endereços explicitamente, então no caminho
   normal ninguém espera os cinco minutos. */
const CACHE_BLOG = 300;

export const lista = (lang: Lang) =>
  rpc<Resumo[]>('walkstamp_blog_lista', { p_lang: lang }, CACHE_BLOG);
export const post = (lang: Lang, slug: string) =>
  rpc<Post | Record<string, never>>('walkstamp_blog_post',
    { p_lang: lang, p_slug: slug }, CACHE_BLOG);
export const todos = () => rpc<PostAdmin[]>('walkstamp_blog_todos', {});
export const salvar = (chave: string, autor: string, tags: string[], versoes: unknown) =>
  rpc<{ ok?: boolean; erro?: string }>('walkstamp_blog_salvar',
    { p_chave: chave, p_autor: autor, p_tags: tags, p_versoes: versoes });
export const publicar = (chave: string, pub: boolean) =>
  rpc<{ ok?: boolean; erro?: string; idiomas?: string[] }>('walkstamp_blog_publicar',
    { p_chave: chave, p_publicar: pub });
export const apagar = (chave: string) =>
  rpc<{ ok?: boolean }>('walkstamp_blog_apagar', { p_chave: chave });
export const figuraAdd = (chave: string, caminho: string, url: string, alt: string) =>
  rpc<{ ok?: boolean; erro?: string }>('walkstamp_blog_figura_add',
    { p_chave: chave, p_caminho: caminho, p_url: url, p_alt: alt });
export const figuraDel = (chave: string, caminho: string) =>
  rpc<{ ok?: boolean; erro?: string }>('walkstamp_blog_figura_del',
    { p_chave: chave, p_caminho: caminho });
export const definirCapa = (chave: string, url: string) =>
  rpc<{ ok?: boolean }>('walkstamp_blog_capa', { p_chave: chave, p_url: url });

/* ------------------------------------------------------- markdown → html */

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Só http(s) e endereços do próprio site. `javascript:` num link é a mesma
 *  execução que o escape acima evitou — fechar uma porta e deixar a outra
 *  aberta não fecha nada. */
const linkSeguro = (u: string) => (/^(https?:\/\/|\/|mailto:|#)/i.test(u.trim()) ? u.trim() : '#');

/** As marcas de dentro da linha, aplicadas ao texto JÁ escapado. */
function linha(txt: string): string {
  let s = esc(txt);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_, alt, u) => `<img src="${linkSeguro(u)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt2, u) => {
    const href = linkSeguro(u);
    const fora = /^https?:\/\//i.test(href);
    return `<a href="${href}"${fora ? ' target="_blank" rel="noopener noreferrer"' : ''}>${txt2}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
  return s;
}

/** O corpo inteiro. Blocos separados por linha em branco. */
export function paraHtml(md: string): string {
  const blocos = String(md || '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const saida: string[] = [];
  for (const bruto of blocos) {
    const b = bruto.trim();
    if (!b) continue;

    const h = b.match(/^(#{2,4})\s+(.*)$/s);
    if (h && !h[2].includes('\n')) {
      const n = h[1].length;   // `#` sozinho não: o `h1` da página é o título do post
      saida.push(`<h${n}>${linha(h[2])}</h${n}>`);
      continue;
    }
    if (/^```/.test(b)) {
      const dentro = b.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
      saida.push(`<pre><code>${esc(dentro.replace(/\n$/, ''))}</code></pre>`);
      continue;
    }
    if (/^>\s?/.test(b)) {
      saida.push(`<blockquote><p>${linha(b.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' '))}</p></blockquote>`);
      continue;
    }
    if (/^([-*]|\d+\.)\s/.test(b)) {
      const ord = /^\d+\.\s/.test(b);
      const itens = b.split('\n')
        .filter((l) => l.trim())
        .map((l) => `<li>${linha(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`).join('');
      saida.push(ord ? `<ol>${itens}</ol>` : `<ul>${itens}</ul>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(b)) { saida.push('<hr>'); continue; }
    /* Quebra simples dentro do parágrafo vira `<br>`: quem escreve num campo de
       texto usa Enter para separar linha, e transformar isso em espaço faz o
       texto sair diferente do que a pessoa viu ao escrever. */
    saida.push(`<p>${linha(b).split('\n').join('<br>')}</p>`);
  }
  return saida.join('\n');
}

/** Quantos minutos de leitura. 200 palavras por minuto é a medida usual. */
export const minutos = (md: string) =>
  Math.max(1, Math.round(String(md || '').trim().split(/\s+/).filter(Boolean).length / 200));

/** Um título vira um endereço. Acento sai, espaço vira hífen, o resto cai. */
export const paraSlug = (s: string) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/* ---- OS LINKS CONTEXTUAIS DO CORPO DO ARTIGO ----
 *
 * Um artigo do blog linkava duas coisas: o próprio blog e o rodapé. Nenhuma das
 * duas transfere autoridade para as páginas que vendem — as de caso de uso —, e
 * é justamente isso que um link dentro do texto faz: ele diz ao buscador, e a
 * quem lê, que aquele artigo é sobre AQUILO.
 *
 * ---- as quatro travas, e por que cada uma existe ----
 *
 * Ligar termos automaticamente é fácil de fazer e fácil de estragar. Um texto
 * salpicado de links repetidos lê pior, e um excesso de âncoras iguais
 * apontando para a mesma página é padrão de manipulação — o oposto do que se
 * quer. Então:
 *
 *   1. UMA VEZ POR DESTINO. A primeira ocorrência vira link; as outras ficam
 *      como texto. Cinco links para a mesma página num artigo não valem mais
 *      que um, e valem menos.
 *   2. SÓ FORA DE `<a>`, `<code>` e `<pre>`. Um link dentro de um link é HTML
 *      inválido, e um termo dentro de um bloco de código é código.
 *   3. SÓ EM TEXTO, nunca dentro de etiqueta. Casar `alt="ata de reunião"`
 *      quebraria o atributo e, com ele, a imagem.
 *   4. TERMO MAIS LONGO PRIMEIRO. Sem isso, "teste" dentro de "evidência de
 *      teste" venceria e o link apontaria para o lugar errado.
 *
 * E o mais importante: o texto NÃO é reescrito. O que entra é uma âncora em
 * volta das palavras que o autor já tinha escrito. Se o termo não estiver lá,
 * nada acontece — não há link inventado por conveniência.
 */
import rotas from '@/src/rotas.json';

/* Os destinos: as cinco páginas de caso, mais as duas que respondem a uma
   busca própria. O RÓTULO é o título da página no dicionário do site — a mesma
   palavra que a página usa como `h1`, e não uma lista de sinônimos escrita
   aqui, que envelheceria sozinha. */
import i18nSite from '@/src/i18n-site.json';

const ALVOS: Array<{ pagina: string; chave: string }> = [
  { pagina: 'casoEv', chave: 'casoEvT' },
  { pagina: 'casoIn', chave: 'casoInT' },
  { pagina: 'casoAta', chave: 'casoAtaT' },
  { pagina: 'casoUx', chave: 'casoUxT' },
  { pagina: 'casoIa', chave: 'casoIaT' },
];

/* ---- O ÍNDICE TEM QUE SOBREVIVER À NORMALIZAÇÃO ----

   `texto.normalize('NFD').replace(marcas,'')` parece a forma óbvia de comparar
   sem acento, e ela produz uma string de OUTRO TAMANHO: "é" vira "e" e o texto
   encolhe um caractere por acento. O índice achado na versão sem acento passa a
   apontar para o lugar errado no texto original — e a âncora sairia cortando
   palavra no meio, num idioma com acento a cada duas linhas.

   Esta versão anda caractere a caractere e só troca quando a troca cabe em UM
   caractere. Quando não cabe (ligadura, caixa que muda o tamanho), o original
   fica. O resultado tem, por construção, o mesmo comprimento da entrada — e a
   verificação logo abaixo transforma essa promessa numa trava. */
const MARCAS = /[\u0300-\u036f]/g;

function planificar(texto: string): string {
  let plano = '';
  for (let k = 0; k < texto.length; k++) {
    const c = texto[k];
    const semMarca = c.normalize('NFD').replace(MARCAS, '');
    const baixo = (semMarca.length === 1 ? semMarca : c).toLowerCase();
    plano += baixo.length === 1 ? baixo : c;
  }
  return plano;
}

const semAcento = (s: string) => s.normalize('NFD').replace(MARCAS, '').toLowerCase();

const escapaRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function ligarTermos(html: string, lang: Lang): string {
  const dic = (i18nSite as Record<string, Record<string, string>>)[lang]
           || (i18nSite as Record<string, Record<string, string>>).pt || {};
  const slugs = (rotas as { slugs: Record<string, Record<string, string>> }).slugs;
  const prefixo = lang === 'pt' ? '' : '/' + lang;

  const termos = ALVOS
    .map((a) => ({
      termo: String(dic[a.chave] || '').trim(),
      href: `${prefixo}/${slugs[a.pagina]?.[lang] || ''}`,
    }))
    .filter((a) => a.termo.length > 3 && !a.href.endsWith('/'))
    /* Do mais longo para o mais curto: "evidência de teste" tem que ser
       tentado antes de qualquer termo que caiba dentro dele. */
    .sort((a, b) => b.termo.length - a.termo.length);

  const feitos = new Set<string>();

  /* A varredura anda pelo HTML separando ETIQUETA de TEXTO, e mantém a conta de
     quantos `<a>`, `<code>` e `<pre>` estão abertos. Só o texto com as três
     contas zeradas é candidato. Uma expressão regular sozinha não sabe disso —
     ela veria o documento como uma linha de caracteres. */
  const partes = html.split(/(<[^>]+>)/);
  let emA = 0, emCode = 0;
  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i];
    if (parte.startsWith('<')) {
      const m = parte.match(/^<\s*(\/?)\s*(a|code|pre)\b/i);
      if (m) {
        const fecha = m[1] === '/';
        const alvo = m[2].toLowerCase();
        if (alvo === 'a') emA += fecha ? -1 : 1;
        else emCode += fecha ? -1 : 1;
        if (emA < 0) emA = 0;
        if (emCode < 0) emCode = 0;
      }
      continue;
    }
    if (emA > 0 || emCode > 0 || !parte.trim()) continue;

    let texto = parte;
    for (const { termo, href } of termos) {
      if (feitos.has(href)) continue;
      /* A busca é sem acento e sem caixa — quem escreve "evidencia de teste"
         está falando da mesma coisa —, mas o que fica na tela é EXATAMENTE o
         que o autor escreveu: a âncora envolve o trecho original. */
      const alvo = semAcento(termo);
      const plano = planificar(texto);
      /* A promessa do `planificar`, virada trava. Se um dia ela deixar de
         valer, é melhor não ligar nada do que ligar no lugar errado. */
      if (plano.length !== texto.length) break;
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapaRe(alvo)})(?![\\p{L}\\p{N}])`, 'iu');
      const achou = plano.match(re);
      if (!achou || achou.index === undefined) continue;
      const inicio = achou.index + achou[1].length;
      const fim = inicio + achou[2].length;
      texto = texto.slice(0, inicio) +
              `<a href="${href}">` + texto.slice(inicio, fim) + '</a>' +
              texto.slice(fim);
      feitos.add(href);
    }
    partes[i] = texto;
  }
  return partes.join('');
}
