/* O site, em dados.
 *
 * Nada aqui é decidido aqui. A identidade vem de `src/marca.json` e o mapa de
 * endereços de `src/rotas.json` — os dois escritos pelo `build.py`, que continua
 * sendo o dono do nome da marca, do domínio e do slug de cada página. Este
 * arquivo só sabe ler e montar.
 *
 * O texto continua onde sempre esteve: `src/i18n-site.json` para as frases e
 * `src/site/bodies/<pagina>.<idioma>.html` para o corpo. A migração para o Next
 * não copiou uma linha de conteúdo — trocou apenas quem monta a casca em volta.
 */
import fs from 'node:fs';
import FIGURAS from '@/src/figuras.json';
import path from 'node:path';

/* Tudo o que se lê daqui mora em `src/`, e o caminho é montado com esse prefixo
   fixo de propósito: sem ele o empacotador não consegue saber o que precisa
   levar junto e acaba arrastando o projeto inteiro — inclusive a `public/`, que
   tem a ferramenta de 600 KB dentro — para dentro do código do servidor. */
const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), 'src', p), 'utf8');

/* CINCO, e não três.
 *
 * Esta união dizia `'pt' | 'en' | 'es'` desde a época em que o site falava três
 * idiomas. O site passou a falar cinco — o `rotas.json` lista os cinco, o
 * `build.py` gera as cinco páginas, o alemão e o francês estão no ar — e este
 * tipo continuou em três. Ele não quebrou nada porque todo mundo lia os idiomas
 * do `rotas.json` em tempo de execução; ele quebrou na primeira vez que alguém
 * escreveu uma tabela nova com as cinco chaves, e o compilador recusou `de`.
 *
 * A trava logo abaixo é o que impede o mesmo esquecimento de novo: se o
 * `rotas.json` ganhar um sexto idioma sem que esta linha ganhe também, o build
 * quebra aqui, e não numa página em alemão que ninguém abre. */
export type Lang = 'pt' | 'en' | 'es' | 'de' | 'fr';
export type Dicionario = Record<string, string>;

/* A identidade mora em `lib/marca.ts`, que não toca disco — ela é importada
   pelo middleware, que roda no Edge. Reexportada aqui para quem já a pedia
   deste módulo continuar pedindo do mesmo lugar. */
export { marca } from '@/lib/marca';
import { marca } from '@/lib/marca';

const rotas: {
  idiomas: Lang[];
  /* Quais idiomas têm vídeo do tour. Escrito pelo `build.py`, que olha o disco —
     ver o comentário no ponto de uso, mais abaixo. */
  demoLangs?: string[];
  caminhoConta: Record<Lang, string>;
  slugs: Record<string, Record<Lang, string>>;
  metas: Record<string, Record<Lang, { titulo: string; desc: string }>>;
  scripts: { detectarIdioma: string; lembrarIdioma: string };
} = JSON.parse(ler('rotas.json'));

export const SCRIPTS = rotas.scripts;

const dic: Record<Lang, Dicionario> = JSON.parse(ler('i18n-site.json'));

export const IDIOMAS = rotas.idiomas;
/* A trava: o `rotas.json` e o tipo `Lang` têm que dizer a mesma coisa. Um
   idioma novo no JSON e ausente aqui quebra o build agora, em vez de virar um
   `undefined` numa tabela meses depois. */
{
  const previstos: Lang[] = ['pt', 'en', 'es', 'de', 'fr'];
  const sobrando = IDIOMAS.filter((L) => !previstos.includes(L));
  const faltando = previstos.filter((L) => !IDIOMAS.includes(L));
  if (sobrando.length || faltando.length) {
    throw new Error(
      'lib/site.ts: o tipo Lang e o rotas.json divergem' +
      (sobrando.length ? ` — no JSON e não no tipo: ${sobrando.join(', ')}` : '') +
      (faltando.length ? ` — no tipo e não no JSON: ${faltando.join(', ')}` : ''),
    );
  }
}
export const SLUGS = rotas.slugs;
export const METAS = rotas.metas;
/** Os nomes das páginas internas — `precos`, `seguranca`, `casoEv`… */
export const PAGINAS = Object.keys(rotas.slugs);

/* O prefixo de cada idioma. Era uma tabela escrita à mão, e cada idioma novo
   exigia lembrar dela — que é a definição de lugar onde se esquece. Agora sai
   de `IDIOMAS`, que vem do `build.py`: o português é a raiz, o resto é a sigla. */
const PREFIXO: Record<Lang, string> =
  Object.fromEntries(IDIOMAS.map((l) => [l, l === 'pt' ? '' : '/' + l])) as Record<Lang, string>;

/** O endereço público de uma página, no idioma dela. `home` é `/`, `/en`, `/es`. */
export function endereco(pagina: string, lang: Lang): string {
  if (pagina === 'home') return PREFIXO[lang] || '/';
  return PREFIXO[lang] + '/' + SLUGS[pagina][lang];
}

/** Todos os endereços que um template pode citar, no idioma pedido. */
export function caminhos(lang: Lang): Dicionario {
  const c: Dicionario = {
    home: endereco('home', lang),
    root: '/',
    // o ?lang vai junto: quem escolheu o idioma do site escolheu o da ferramenta.
    // Sem ele, um navegador em inglês abria o app em inglês mesmo vindo da
    // página em português — e a pessoa achava que era defeito.
    app: '/app?lang=' + lang,
    // a área do cliente tem endereço traduzido como o resto do site: quem lê em
    // espanhol não deveria ter que reconhecer a palavra "conta" para achar a
    // própria fatura
    /* Vem do `rotas.json`, e não escrito aqui.
       
       Escrito aqui, esta tabela tinha TRÊS idiomas num site que fala cinco — e
       o link "Sua conta" do rodapé saía `undefined` em alemão e em francês.
       Ninguém viu: `undefined` num `href` não quebra a página, só não leva a
       lugar nenhum. É a mesma tabela que o `next.config.mjs` usa para montar a
       ponte de reescrita. */
    conta: rotas.caminhoConta[lang],
    /* `blog` é a mesma palavra nos cinco idiomas, então ele não entra na tabela
       de slugs traduzidos — ela existe para os casos em que a palavra muda. */
    blog: lang === 'pt' ? '/blog' : `/${lang}/blog`,
  };
  for (const pg of PAGINAS) c[pg] = endereco(pg, lang);
  return c;
}

/** Os valores fixos que toda página recebe. */
export function tokens(lang: Lang): Dicionario {
  return {
    ...dic[lang],
    ...caminhos(lang),
    site: marca.site,
    marca: marca.marca,
    marcaA: marca.marcaA,
    marcaB: marca.marcaB,
    ICONV: marca.iconV,
    supaUrl: marca.supaUrl,
    supaKey: marca.supaKey,
    empresa: marca.empresa,
    cnpj: marca.cnpj,
    contato: marca.contato,
    encarregado: marca.encarregado,
    lang,
  };
}

/** Troca `{{chave}}` pelo valor. É o mesmo contrato que o build.py usava. */
export function trocar(texto: string, t: Dicionario): string {
  let s = texto;
  for (const [k, v] of Object.entries(t)) s = s.split('{{' + k + '}}').join(v);
  return s;
}

/** O seletor de idioma: as três siglas, cada uma apontando para a MESMA página
 *  no outro idioma. O `?lang=` vai em todas — é o sinal explícito que a home
 *  registra para não mandar a pessoa de volta pelo idioma do sistema depois. */
function seletor(lang: Lang, pagina: string): string {
  const itens = IDIOMAS.map((L) => {
    const destino = endereco(pagina, L);
    const href = destino + (destino.includes('?') ? '&' : '?') + 'lang=' + L;
    const atual = L === lang ? ' style="color:var(--ink);font-weight:600"' : '';
    return `<a href="${href}"${atual}>${L.toUpperCase()}</a>`;
  });
  return '<span style="display:inline-flex;gap:9px;border-left:1px solid var(--line);' +
    'padding-left:12px">' + itens.join('') + '</span>';
}

/* ------------------------------------------------ a tabela de funcionalidades */

type Feature = { planos: string; breve?: boolean } & Record<string, unknown>;
type Grupo = { id: string; titulo: Record<Lang, string>; itens: Feature[] };

const features: { grupos: Grupo[] } = JSON.parse(ler('features.json'));

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** O selo do plano de um item: nada quando é do Free.
 *
 *  Esta é a decisão que faz a lista caber na cabeça. Das 87 linhas, 71 estão no
 *  gratuito — a tabela antiga desenhava 213 vistos para dizer isso, e o leitor
 *  tinha que varrer três colunas de ✓ e — para descobrir as dezesseis linhas
 *  que importam. Agora o padrão é o silêncio: quem não tem selo é gratuito, e o
 *  selo aparece só onde há algo a pagar. O parágrafo acima da lista diz a regra
 *  em uma frase, e quem lê com leitor de tela ouve "só no Personal" junto.
 */
function seloDoPlano(planos: string, t: Dicionario): string {
  if (planos.includes('f')) return '';
  const nome = planos.includes('p') ? 'Personal' : 'Team';
  const classe = planos.includes('p') ? 'pl p' : 'pl t';
  return ` <span class="${classe}"><span class="soLeitor">${escapar(t.tpSoNo)} </span>${nome}</span>`;
}

/** A lista completa do que existe, em grupos que se abrem e se fecham.
 *
 *  Ela é MONTADA e não escrita à mão porque são 87 linhas em três idiomas: à
 *  mão, seriam 261 chances de a versão em espanhol prometer uma coisa que a em
 *  português não promete. O dado mora em `src/features.json`, e a regra escrita
 *  lá no topo é a que importa — só entra o que existe.
 *
 *  Por que deixou de ser tabela: oitenta e sete linhas por quatro colunas é uma
 *  parede. Ninguém lê uma parede numa página de preço — rola até o fim e
 *  desiste no meio. Em grupos dobráveis, o que se vê primeiro são doze títulos
 *  com a contagem de cada um, e a pessoa abre o que é o problema dela. O
 *  conteúdo é o mesmo, e nada ficou escondido: os grupos nascem abertos.
 */
export function tabelaDePlanos(lang: Lang, t: Dicionario): string {
  const gratis = features.grupos.reduce(
    (n, g) => n + g.itens.filter((i) => i.planos.includes('f')).length, 0);
  const pagas = quantasFeatures - gratis;

  const blocos = features.grupos.map((g) => {
    const pagosNoGrupo = g.itens.filter((i) => !i.planos.includes('f')).length;
    const itens = g.itens.map((item) => {
      const rotulo = escapar(String(item[lang] ?? item.en ?? ''));
      const breve = item.breve ? ` <span class="soon">${escapar(t.tpBreve)}</span>` : '';
      return `<li>${rotulo}${breve}${seloDoPlano(item.planos, t)}</li>`;
    }).join('');
    /* A contagem no título é o que deixa a lista fechada ainda informativa:
       "O que sai (15)" já responde "vale a pena abrir?" antes do clique. */
    const conta = `<span class="cont">${g.itens.length}</span>`;
    /* Quando o grupo inteiro é do MESMO plano pago, o selo sobe para o título:
       "Quando é uma equipe · Team" responde de fora o que a pessoa iria abrir
       para descobrir. Ter que ser o mesmo plano não é detalhe: o grupo do
       roteiro tem seis linhas Personal e duas Team, e um "PERSONAL" no título
       diria que as duas de Team também são — uma promessa a menos vendida como
       a mais, que é o jeito de errar que custa caro. */
    const mesmoPlano = new Set(g.itens.map((i) => i.planos)).size === 1;
    const sinal = g.itens.length > 0 && pagosNoGrupo === g.itens.length && mesmoPlano
      ? seloDoPlano(g.itens[0].planos, t) : '';
    /* `?? g.titulo.en`: um idioma novo do site não pode DERRUBAR a página de
       preços enquanto a lista de funcionalidades não é traduzida. Cair no
       inglês é visivelmente incompleto; cair num build quebrado é pior. */
    return `<details class="grpF" open><summary><b>${escapar(g.titulo[lang] ?? g.titulo.en)}</b>${conta}${sinal}</summary>` +
      `<ul class="fts">${itens}</ul></details>`;
  }).join('');

  return `<p class="small muted tpRegra">${preencherTexto(t.tpResumo, [quantasFeatures, gratis, pagas])}</p>` +
    `<div class="listaF" aria-label="${escapar(t.tpLegenda)}">${blocos}</div>`;
}

/** `{0}`, `{1}`… trocados por números. Existe para o resumo acima da lista sair
 *  contado e não escrito à mão: um número redondo no texto envelhece na primeira
 *  vez que alguém mexe na lista e esquece do parágrafo. */
function preencherTexto(molde: string, vals: Array<string | number>): string {
  let s = escapar(molde || '');
  vals.forEach((v, i) => { s = s.split(`{${i}}`).join(`<b>${v}</b>`); });
  return s;
}

/** Quantas funcionalidades a lista declara. Sai no texto acima da tabela: um
 *  número contado é diferente de um número redondo escrito à mão, que envelhece
 *  na primeira vez que alguém mexe na lista e esquece do parágrafo. */
export const quantasFeatures = features.grupos.reduce((n, g) => n + g.itens.length, 0);

/** Tudo o que fica DENTRO do `<body>` de uma página: cabeçalho, corpo e rodapé.
 *
 *  O HTML sai dos mesmos `src/site/home.html` e `src/site/doc.html` que o
 *  gerador em Python usava, com os mesmos `{{tokens}}`. Isso é deliberado:
 *  retranscrever 45 páginas para JSX seria trocar um sistema que funciona por
 *  uma tarde de erros de digitação. O React aqui é a casca — `<html>`, `<head>`
 *  e as tags de script; o conteúdo continua sendo conteúdo.
 */
/* ---- OS DADOS ESTRUTURADOS DAS PÁGINAS FIXAS ----
 *
 * Eles não mudam ONDE a página aparece; mudam COMO ela aparece — é o único
 * item desta rodada que mexe na cara do resultado, e não só na posição.
 *
 * Três formatos, um por natureza de página:
 *
 *   `SoftwareApplication` na home — é o que a ferramenta É, e é o que permite
 *     ao resultado mostrar categoria e preço. `price: 0` não é marketing: a
 *     ferramenta no navegador é gratuita, e declarar isso onde o buscador lê é
 *     a mesma frase que a página já diz.
 *
 *   `FAQPage` na base de conhecimento — e ele é LIDO DO CORPO, pergunta por
 *     pergunta. Escrever as perguntas de novo aqui seria a segunda lista ao lado
 *     da lista de verdade, e a divergência seria invisível: a página diria uma
 *     coisa e o buscador leria outra. Pior que isso, marcação de FAQ que não
 *     corresponde ao texto visível é motivo de punição — e com razão.
 *
 *   `BreadcrumbList` nas demais — a trilha que faz o resultado mostrar o
 *     caminho em vez do endereço cru.
 *
 * `Organization` viaja em todas, como publicador: é o que amarra as páginas a
 * uma entidade só em vez de a um punhado de endereços soltos.
 */
function faqDoCorpo(corpo: string): Array<{ q: string; a: string }> {
  const limpo = (h: string) => h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();
  const fora: Array<{ q: string; a: string }> = [];
  const re = /<details\b[^>]*>([\s\S]*?)<\/details>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo))) {
    const dentro = m[1];
    const s2 = dentro.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
    if (!s2) continue;
    const q = limpo(s2[1]);
    const a = limpo(dentro.slice((s2.index || 0) + s2[0].length));
    /* Resposta curta demais não é resposta — e uma entrada de FAQ sem conteúdo
       é exatamente o tipo de marcação vazia que não deve existir. */
    if (q.length > 3 && a.length > 25) fora.push({ q, a });
  }
  return fora;
}

function dadosEstruturados(pagina: string, lang: Lang, t: Dicionario, corpo: string): string {
  const site = marca.site;
  const url = site + endereco(pagina, lang);
  const org = {
    '@type': 'Organization', name: marca.marca, url: site,
    logo: { '@type': 'ImageObject', url: `${site}/logo.svg` },
    legalName: marca.empresa, email: marca.contato,
  };
  const blocos: unknown[] = [];

  if (pagina === 'home') {
    blocos.push({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication',
      name: marca.marca, url: site, inLanguage: lang,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      description: String(t.docDesc || t.metaDesc || ''),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
      publisher: org,
    });
  } else {
    const faq = pagina === 'ajuda' ? faqDoCorpo(corpo) : [];
    if (faq.length) {
      blocos.push({
        '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
        mainEntity: faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
    }
    blocos.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: marca.marca, item: site + endereco('home', lang) },
        { '@type': 'ListItem', position: 2, name: String(t.docTitle || pagina).split(' — ')[0], item: url },
      ],
    });
  }
  blocos.push({ '@context': 'https://schema.org', ...org });

  return blocos.map((b) =>
    '<script type="application/ld+json">' +
    JSON.stringify(b).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') +
    '</script>').join('\n');
}

export function paginaHtml(pagina: string, lang: Lang): string {
  const t = tokens(lang);
  t.selfPath = endereco(pagina, lang);
  t.switcher = seletor(lang, pagina);
  // o link do comparativo vai montado aqui: um <a> dentro do JSON de tradução
  // quebraria no dia em que alguém trocasse o caminho da página
  t.duoCompLinked = (t.duoComp || '')
    .replace('{0}', `<a href="${t.comparativo}" style="color:var(--accent)">`)
    .replace('{1}', '</a>');
  // a tabela só é montada onde é usada; nas outras páginas o token vira vazio
  t.tabelaPlanos = pagina === 'precos' ? tabelaDePlanos(lang, t) : '';
  t.quantasFeatures = String(quantasFeatures);

  let bruto: string;
  if (pagina === 'home') {
    // o `{{redirect}}` mora no <head> do template e é o React que o escreve
    // agora; aqui ele some para não sobrar token.
    t.redirect = '';
    t.analytics = '';
    t.title = t.title || '';
    /* Onde o tour não existe, cai no inglês: um `<video>` apontando para um
       404 é uma caixa preta vazia no alto da home — pior do que um vídeo em
       outro idioma.

       A lista de quem TEM tour vem do `rotas.json`, montado pelo `build.py`
       olhando o disco. Escrita à mão aqui, ela ficou meses dizendo
       `['pt','en','es']` depois de o vídeo alemão existir — e ninguém viu,
       porque um vídeo em inglês numa página alemã não quebra nada, só
       decepciona. */
    const comTour: string[] = rotas.demoLangs ?? ['en'];
    t.demoLang = comTour.includes(lang) ? lang : 'en';
    t.figuraFluxo = ((FIGURAS as Record<string, string>).fluxo ?? '')
      .replace('__ALT__', String(t.fluxoAlt ?? ''))
      .replace('__LEG__', String(t.fluxoLeg ?? ''));
    /* A figura da dobra principal. Sem legenda: numa dobra a legenda compete
       com a subida do texto e com o botão. Só o rótulo de acessibilidade. */
    t.figuraDobra = ((FIGURAS as Record<string, string>).dobra ?? '')
      .replace('__ALT__', String(t.dobraAlt ?? ''));
    bruto = ler('site/home.html');
  } else {
    const m = METAS[pagina]?.[lang];
    if (!m) throw new Error(`página sem título: ${pagina}.${lang}`);
    t.docTitle = m.titulo;
    t.docDesc = m.desc;
    t.ptPath = endereco(pagina, 'pt');
    t.enPath = endereco(pagina, 'en');
    t.esPath = endereco(pagina, 'es');
    t.analytics = '';
    /* A figura do documento, nas cinco páginas de caso de uso. Quem desenha é o
       `build.py` — o mesmo lugar que desenha a marca no PDF —, e ela chega aqui
       como dado, pelo `figuras.json`. Duas cópias do mesmo desenho, uma em
       Python e outra em TypeScript, divergiriam na primeira mudança.
       Ela não tem uma palavra dentro: serve aos cinco idiomas sem tradução. */
    t.figura = ((FIGURAS as Record<string, string>)[pagina] ?? '')
      .replace('__ALT__', String(t.figAlt ?? ''))
      .replace('__LEG__', String(t.figLegenda ?? ''));
    t.body = trocar(ler(`site/bodies/${pagina}.${lang}.html`), t);
    bruto = ler('site/doc.html');
  }
  /* Depois do corpo, porque o FAQ é LIDO dele. Antes do `trocar`, porque é ele
     que troca o `{{jsonld}}` pelo bloco. */
  t.jsonld = dadosEstruturados(pagina, lang, t, String(t.body || ''));

  const inteiro = trocar(bruto, t);
  const sobrando = [...new Set([...inteiro.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
  if (sobrando.length) {
    // Em produção isto viraria `{{chave}}` na cara do visitante. Melhor derrubar
    // o build: é o mesmo aviso que o gerador antigo dava, com mais dentes.
    throw new Error(`chaves sem valor em ${pagina}.${lang}: ${sobrando.join(', ')}`);
  }

  const abre = inteiro.indexOf('>', inteiro.indexOf('<body')) + 1;
  const fecha = inteiro.lastIndexOf('</body>');
  if (abre <= 0 || fecha < 0) throw new Error(`sem <body> em ${pagina}`);
  return inteiro
    .slice(abre, fecha)
    // o support.js e o seletor de idioma já são responsabilidade do layout
    .replace(/<script src="\/?support\.js"><\/script>/, '')
    .trim();
}

/** Os hreflang de uma página. O `x-default` só na home, como no site antigo:
 *  ele diz para onde mandar quem não casa com nenhum idioma, e quem chega numa
 *  página interna chegou por link, não por sorteio. */
export function alternativas(pagina: string, comDefault = false): Record<string, string> {
  /* Sai de `IDIOMAS`, e não escrito à mão: era aqui que o alemão e o francês
     iam ficar de fora sem ninguém perceber — a página abre, o texto está certo,
     e só o buscador sabe que a versão existe. O português leva a região porque
     é `pt-BR` de verdade, e não `pt` genérico. */
  const alt: Record<string, string> = Object.fromEntries(
    IDIOMAS.map((l) => [l === 'pt' ? 'pt-BR' : l, marca.site + endereco(pagina, l)]),
  );
  if (comDefault) alt['x-default'] = marca.site + endereco(pagina, 'en');
  return alt;
}

/** De volta do endereço para o nome da página: `/en/security` → `seguranca`. */
export function porSlug(slug: string, lang: Lang): string | null {
  return PAGINAS.find((pg) => SLUGS[pg][lang] === slug) ?? null;
}
