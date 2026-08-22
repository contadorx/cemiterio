/* O PDF do Anexo de Tratamento de Dados Pessoais.
 *
 * POR QUE ELE NÃO SAI DO `build.py`. Renderizar PDF precisa de um navegador, e
 * o `build.py` tem que rodar numa máquina sem nada instalado — é ele que monta
 * o produto. Tentei fazer o build estampar um `public/dpa.html` para este
 * arquivo só imprimir, e o próprio build barrou: existe uma trava que proíbe
 * `.html` solto em `public/`, porque um arquivo estático ali TAPA a rota que o
 * Next serve. A trava está certa; quem estava errado era eu.
 *
 * Então a identidade é lida onde ela já mora depois do build: `src/marca.json`
 * — o mesmo arquivo que o `lib/site.ts` consulta para estampar as páginas.
 * Continua havendo uma fonte só de razão social, CNPJ e canal do encarregado.
 *
 * POR QUE NÃO É reportlab NEM UM .docx. O documento tem que dizer exatamente o
 * que a política publicada diz, e a forma de garantir isso é `terceiros.mjs`
 * comparar os dois. Reescrevê-lo numa segunda ferramenta acrescentaria uma
 * terceira versão do mesmo texto — e a que diverge é sempre a que vai assinada.
 *
 *   python3 build.py && node testes/gerar-dpa.mjs   -> public/dpa-walkstamp.pdf
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const FONTE = path.join(RAIZ, 'src', 'site', 'dpa.pt.html');
const SAIDA = path.join(RAIZ, 'public', 'dpa-walkstamp.pdf');

if (!fs.existsSync(FONTE)) {
  console.error('Falta src/site/dpa.pt.html.');
  process.exit(1);
}
const marca = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'marca.json'), 'utf8'));

let html = fs.readFileSync(FONTE, 'utf8');
/* A VERSÃO É ESCRITA NO DOCUMENTO, e não é a data de hoje: um documento
   jurídico cuja versão muda a cada build não tem versão. */
const versao = (html.match(/<!--\s*versao:\s*([0-9-]+)\s*-->/) || [, 'sem versao'])[1];
const valores = {
  marca: marca.marca, empresa: marca.empresa, cnpj: marca.cnpj, contato: marca.contato,
  siteDom: String(marca.site).split('//').pop(), dataDpa: versao,
  encarregado: marca.encarregado,
};
for (const [k, v] of Object.entries(valores)) html = html.split('{{' + k + '}}').join(v);

/* Token sem valor vira texto literal no papel — `{{cnpj}}` impresso num anexo
   contratual é o tipo de erro que ninguém revisa porque ninguém relê o que já
   assinou uma vez. */
const sobrando = [...new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];
if (sobrando.length) {
  console.error('Token sem valor em dpa.pt.html: ' + sobrando.join(', '));
  process.exit(1);
}

const tmp = path.join(RAIZ, 'node_modules', '.cache-dpa.html');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, html, 'utf8');

const br = await chromium.launch({
  executablePath: CHROME_WS,
});
const pg = await (await br.newContext()).newPage();
await pg.goto('file://' + tmp, { waitUntil: 'load' });

/* `printBackground` liga porque o cabeçalho das tabelas e a caixa de destaque
   são fundo — sem ele, a tabela de suboperadores sai sem a linha de título
   distinguível, que é justamente a linha que o avaliador procura. */
await pg.pdf({
  path: SAIDA,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '16mm', left: '16mm', right: '16mm' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font:8pt sans-serif;color:#8a8a8a;padding:0 16mm;' +
    'display:flex;justify-content:space-between">' +
    '<span>Anexo de Tratamento de Dados Pessoais</span>' +
    '<span>página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
});

await br.close();
fs.unlinkSync(tmp);

const kb = (fs.statSync(SAIDA).size / 1024).toFixed(0);
console.log(`public/dpa-walkstamp.pdf  ${kb} KB  (versão ${versao})`);
