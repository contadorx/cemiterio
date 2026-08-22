/* O ENCAMINHADOR PARA O NEXT.
 *
 * Dez testes precisam falar com o site de verdade e não com `public/`: desde
 * que o site virou Next.js, `/precos`, `/pt/casos/...` e as páginas de caso de
 * uso não existem como arquivo em lugar nenhum — elas são renderizadas.
 *
 * Cada um deles sobe um servidorzinho numa porta própria (8921, 8877, …) porque
 * é a porta que já estava escrita no teste e porque o Playwright roda dois de
 * cada vez. Este arquivo é o que esses servidorzinhos são hoje: um repasse
 * literal para o Next que `rodar.sh` e `rapido.sh site` já sobem na 8802.
 *
 * Ele não decide nada. Se decidisse — servir `app.html` do disco aqui, por
 * exemplo — o teste passaria a afirmar coisas sobre um arquivo que o navegador
 * de ninguém recebe.
 */
import http from 'http';

export const ALVO = process.env.WALKSTAMP_SITE || 'http://localhost:8802';

const alvo = new URL(ALVO);

/** Um servidor que repassa tudo para o Next, verbatim. */
export function criarProxy(){
  return http.createServer((req, res) => {
    const corpo = [];
    req.on('data', d => corpo.push(d));
    req.on('end', () => {
      const cabecalhos = { ...req.headers };
      /* O Host tem que ser o do Next, senão o `middleware.ts` e a resolução de
         idioma decidem com base numa porta que não é a dele. */
      cabecalhos.host = alvo.host;
      delete cabecalhos['accept-encoding'];   // sem compressão: o repasse é cru
      const p = http.request({
        hostname: alvo.hostname,
        port: alvo.port || 80,
        path: req.url,
        method: req.method,
        headers: cabecalhos
      }, r2 => {
        res.writeHead(r2.statusCode || 502, r2.headers);
        r2.pipe(res);
      });
      p.on('error', e => {
        /* Um 502 com o motivo dentro. Um erro mudo aqui chega ao teste como
           "a página não tinha o elemento", que manda procurar no lugar errado. */
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('proxy: o Next em ' + ALVO + ' não respondeu — ' + e.message);
      });
      if (corpo.length) p.write(Buffer.concat(corpo));
      p.end();
    });
  });
}

/** Cai cedo, e explicando, quando o Next não está no ar.
 *
 *  Sem isto o teste segue e falha vinte asserções adiante com "elemento não
 *  encontrado" — o relatório aponta para o produto quando o problema é que
 *  ninguém subiu o servidor. */
export async function exigirNext(){
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(ALVO + '/precos', { redirect: 'manual' });
      if (r.status < 500) return;
    } catch (e) { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.error('O site Next não respondeu em ' + ALVO + '.\n' +
                '  Suba-o antes:  npx next build && npx next start -p 8802\n' +
                '  (rodar.sh e rapido.sh site já fazem isso.)');
  process.exit(1);
}
