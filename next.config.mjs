/* O roteamento público.
 *
 * A regra que manda em tudo: **o endereço publicado não muda**. A home
 * portuguesa é `/`, não `/pt`; a página de preços é `/precos`, não
 * `/pt/precos`. Cada um desses endereços está num canonical já indexado, num
 * sitemap já enviado e em links que outras pessoas já publicaram — trocar
 * qualquer um deles é jogar fora tráfego que custou meses.
 *
 * Por dentro, o Next precisa do idioma como segmento (`app/[lang]/…`) para o
 * `<html lang>` sair certo. A ponte entre as duas coisas são os `rewrites` daqui,
 * e é só isso que eles fazem.
 */
import fs from 'node:fs';

const rotas = JSON.parse(fs.readFileSync('./src/rotas.json', 'utf8'));
const { idiomas, slugs } = rotas;
/* Sai de `idiomas`, e não escrito à mão: uma tabela de prefixos que precisa ser
   lembrada a cada idioma novo é uma tabela que vai ser esquecida — e o sintoma
   é um `undefined/aide.html` no build, que não aponta para a causa. */
const PREFIXO = Object.fromEntries(idiomas.map((L) => [L, L === 'pt' ? '' : '/' + L]));
const paginas = Object.keys(slugs);

/* A área do cliente tem endereço traduzido como o resto do site: quem lê em
   espanhol não deveria ter que reconhecer a palavra "conta" para achar a
   própria fatura. Por dentro ela mora em `/conta/<idioma>`. */
const CONTA = rotas.caminhoConta;
/* AS SUB-ROTAS DO PAINEL, traduzidas como o resto.

   Cada uma precisa de ponte `beforeFiles`, e não `afterFiles`: `/conta/faturas`
   casa com a rota dinâmica `/conta/[lang]` — com `lang` valendo a palavra
   "faturas" — e uma reescrita `afterFiles` só é consultada quando NENHUMA rota
   casou. O resultado seria 404 numa tela que existe. O roteiro já tinha
   aprendido isso sozinho; agora a regra vale para as quatro.

   Uma tabela só. Duas tabelas para a mesma coisa é exatamente como o alemão
   ficou sem `hreflang` e depois vendo o tour em inglês. */
const SUB = rotas.subConta;
/* O roteiro continua tendo nome próprio porque outros arquivos o citam. */
const ROTEIRO = Object.fromEntries(
  Object.keys(CONTA).map((L) => [L, `${CONTA[L]}/${SUB.roteiro[L]}`]));
/* O site fala cinco idiomas; a área do cliente ainda fala três. Os laços da
   conta andam por ESTA lista, e não por `idiomas` — senão cada idioma novo do
   site pede uma rota de conta que não existe, e o build quebra com um
   "`source` is missing" que não diz nada sobre a causa. */
const IDIOMAS_CONTA = Object.keys(CONTA);

/** O endereço público de cada página, no idioma dela. */
const publico = (pg, L) => (pg === 'home' ? PREFIXO[L] || '/' : PREFIXO[L] + '/' + slugs[pg][L]);
/** E onde ela mora dentro do `app/`. */
const interno = (pg, L) => (pg === 'home' ? `/${L}` : `/${L}/${slugs[pg][L]}`);

/* ---- O TETO DA FIGURA DO BLOG, DITO ONDE O NEXT LÊ ----

   O DEFEITO, relatado de produção: subir a figura de um post devolvia "This
   page couldn't load — a server error occurred". Sem mensagem, sem pista, e
   dependendo do arquivo: figuras pequenas subiam.

   A causa são DOIS TETOS que não se falavam. O produto permite 8 MB
   (`TETO_FIGURA`, em `lib/supabase/figura.ts`), o formulário aceita 8 MB e a
   ação tem até a frase pronta para recusar acima disso. Só que uma Server
   Action do Next tem teto PRÓPRIO, e o padrão dele é 1 MB — conferido na fonte
   da versão instalada, `app-render/action-handler.js`: sem `bodySizeLimit`, o
   valor é `1024 * 1024`, e passar dele lança um 413 ANTES de a ação rodar.

   Quer dizer: toda figura entre 1 MB e 8 MB morria no framework, e a recusa
   educada que o produto escreveu ("a figura passou de 8 MB, exporte menor")
   nunca chegava a ser possível de ver. O erro genérico do Next era tudo o que
   sobrava.

   O número aqui é o do produto mais uma folga: o corpo multipart carrega
   também `lang`, `chave` e `alt`, e o teto vale para o corpo inteiro, não só
   para o arquivo. `testes/figura.mjs` compara os dois números a cada rodada —
   dois tetos em dois arquivos voltam a divergir na primeira distração, e a
   régua é mais barata que descobrir de novo por relato. */
const config = {
  experimental: {
    serverActions: { bodySizeLimit: '9mb' },
  },
  // Os cabeçalhos vinham do vercel.json. Vieram para cá porque agora valem
  // também em desenvolvimento e nos testes — um cabeçalho que só existe em
  // produção é um cabeçalho que ninguém testa.
  async headers() {
    return [{
      source: '/:caminho*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        // `credentialless` é o que deixa a ferramenta usar SharedArrayBuffer
        // (a transcrição em WebAssembly) sem barrar imagem de outra origem.
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
      ],
    }];
  },

  async redirects() {
    const r = [];
    // `/pt` e `/pt/qualquer-coisa` existem por dentro; se alguém chegar neles
    // por fora, vai para o endereço de verdade. Duas URLs para a mesma página é
    // o buscador dividindo a força dela entre as duas.
    r.push({ source: '/pt', destination: '/', permanent: true });
    r.push({ source: '/pt/blog', destination: '/blog', permanent: true });
    r.push({ source: '/pt/blog/tag/:tag', destination: '/blog/tag/:tag', permanent: true });
    r.push({ source: '/pt/blog/autor/:autor', destination: '/blog/autor/:autor', permanent: true });
    r.push({ source: '/pt/blog/:slug', destination: '/blog/:slug', permanent: true });
    for (const pg of paginas) {
      r.push({ source: `/pt/${slugs[pg].pt}`, destination: publico(pg, 'pt'), permanent: true });
    }
    // O site antigo era servido com `cleanUrls`, que aceitava `/precos.html` e
    // mandava para `/precos`. Continua aceitando: há links por aí com o `.html`.
    r.push({ source: '/index.html', destination: '/', permanent: true });
    for (const L of idiomas) {
      for (const pg of paginas) {
        r.push({ source: `${publico(pg, L)}.html`, destination: publico(pg, L), permanent: true });
      }
    }
    for (const L of IDIOMAS_CONTA) {
      // e o endereço interno da conta também não é para ser visitado por fora
      r.push({ source: `/conta/${L}`, destination: CONTA[L], permanent: true });
      r.push({ source: `/conta/${L}/roteiro`, destination: ROTEIRO[L], permanent: true });
    }
    return r;
  },

  async rewrites() {
    const depois = [];
    for (const pg of ['home', ...paginas]) {
      // en e es já vêm com o idioma no endereço; só o português precisa da ponte
      if (publico(pg, 'pt') !== interno(pg, 'pt')) {
        depois.push({ source: publico(pg, 'pt'), destination: interno(pg, 'pt') });
      }
    }
    for (const L of IDIOMAS_CONTA) depois.push({ source: CONTA[L], destination: `/conta/${L}` });
    /* O blog. `blog` é a mesma palavra nos cinco idiomas, então ele NÃO entra
       na tabela de slugs traduzidos — mas o português continua precisando da
       ponte, porque o endereço público é `/blog` e por dentro ele mora em
       `/pt/blog`. O `:slug` cobre o post. */
    depois.push({ source: '/blog', destination: '/pt/blog' });
    /* Etiqueta e autor ANTES do `:slug`: eles têm dois segmentos, e `:slug` só
       casa com um — sem estas duas linhas, `/blog/tag/evidencia` não casa com
       nada e responde 404. Uma página que existe por dentro e não tem ponte é
       uma página que não existe. */
    depois.push({ source: '/blog/tag/:tag', destination: '/pt/blog/tag/:tag' });
    depois.push({ source: '/blog/autor/:autor', destination: '/pt/blog/autor/:autor' });
    depois.push({ source: '/blog/:slug', destination: '/pt/blog/:slug' });

    // A ferramenta é um arquivo estático em `public/app.html` e continua sendo.
    // O `/app` sem extensão é o endereço que o site inteiro cita há meses.
    depois.push({ source: '/app', destination: '/app.html' });

    /* A tela do roteiro precisa da ponte ANTES dos arquivos, e não depois.
       `/conta/roteiro` casa com a rota dinâmica `/conta/[lang]` — com `lang`
       valendo a palavra "roteiro" — e uma reescrita `afterFiles` só é
       consultada quando NENHUMA rota casou. O resultado seria um 404 numa tela
       que existe. `/conta/planilha` não precisa disto: é rota estática de
       verdade, e estática ganha da dinâmica sem ponte nenhuma. */
    const antes = [];
    for (const [nome, trad] of Object.entries(SUB)) {
      for (const L of IDIOMAS_CONTA) {
        antes.push({ source: `${CONTA[L]}/${trad[L]}`, destination: `/conta/${L}/${nome}` });
      }
    }
    /* As abas do back-office são um nível mais fundo — `/conta/negocio/contas`
       — e caem na MESMA armadilha: `/conta/negocio` já é uma reescrita, e sem
       ponte própria a aba vira 404. A lista sai do `rotas.json`, e não escrita
       aqui: uma aba na faixa e ausente nesta ponte é um clique que quebra. */
    for (const aba of rotas.abasNegocio) {
      for (const L of IDIOMAS_CONTA) {
        antes.push({ source: `${CONTA[L]}/${SUB.negocio[L]}/${aba}`,
                     destination: `/conta/${L}/negocio/${aba}` });
      }
    }

    return { beforeFiles: antes, afterFiles: depois };
  },
};

export default config;
