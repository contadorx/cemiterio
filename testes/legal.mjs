/* Os documentos legais: identificação da empresa, direitos do titular e as
   afirmações que deixaram de ser verdade quando a medição entrou. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { criarProxy, exigirNext } from './proxy.mjs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
await exigirNext();
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png'};
/* O site virou Next.js: as páginas não existem mais como arquivo em public/.
   O servidorzinho estático daqui virou um encaminhador para o Next — mesma
   porta, mesmas URLs no teste, e quem responde é o produto de verdade. */
const srv = criarProxy();
await new Promise(r=>srv.listen(8893,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};

const EMPRESA='Produtize Produtos e Serviços Inteligentes Ltda.';
const CNPJ='48.417.292/0001-99';
const MAIL='privacidade@walkstamp.com';

const paginas = {
 '/privacidade.html':    {tem:['Quem é responsável','Bases legais','Onde os dados ficam','Seus direitos','ANPD','São Paulo','art. 33','Marco Civil'], nao:['não há informação\nsua para acessar','Como não coletamos dados, não há informação']},
 '/en/privacidade.html': {tem:['Who is responsible','Legal bases','Where the data lives','Your rights','ANPD','São Paulo','art. 33','Internet Civil Framework'], nao:['there is no information of yours to access','Since we collect no data']},
 '/es/privacidade.html': {tem:['Quién es responsable','Bases legales','Dónde están los datos','Tus derechos','ANPD','São Paulo','art. 33','Marco Civil'], nao:['no hay información tuya que acceder','Como no recogemos datos']},
 '/termos.html':         {tem:['Quem oferece o serviço','Privacidade','lista de aviso','não há nada à venda','Lei aplicável','Contato'], nao:[]},
 '/en/termos.html':      {tem:['Who provides the service','Privacy','notification list','nothing is for sale','Governing law','Contact'], nao:[]},
 '/es/termos.html':      {tem:['Quién ofrece el servicio','Privacidad','lista de aviso','no hay nada a la venta','Ley aplicable','Contacto'], nao:[]},
};

for (const [rota, {tem, nao}] of Object.entries(paginas)) {
  console.log('\n' + rota);
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  await pg.goto('http://localhost:8893'+rota);
  const txt=await pg.locator('body').innerText();
  ok('razão social', txt.includes(EMPRESA));
  ok('CNPJ', txt.includes(CNPJ));
  ok('e-mail de contato é clicável',
     (await pg.locator(`a[href="mailto:${MAIL}"]`).count()) > 0,
     (await pg.locator(`a[href^="mailto:"]`).count()) + ' links mailto');
  for (const t of tem) ok(`traz "${t}"`, txt.includes(t));
  for (const n of nao) ok(`não afirma mais: "${n.slice(0,40)}"`, !txt.includes(n));
  // numeração dos termos sem buraco nem repetição
  if (rota.includes('termos')) {
    const ns=[...txt.matchAll(/^(\d+)\.\s/gm)].map(m=>+m[1]);
    ok('artigos numerados de 1 a N sem falha',
       ns.length>0 && ns.every((v,i)=>v===i+1), ns.join(','));
  }
  /* A tabela de bases legais tem que renderizar como tabela — e tem que falar
     do que o cliente PAGANTE confia à gente. Ela listava só a lista de aviso,
     os marcos, as visitas e os registros de acesso: tudo, menos a conta. Contar
     linhas trancava um número; o que interessa é que cada linha tenha as quatro
     colunas preenchidas e que as duas que faltavam estejam lá. */
  if (rota.includes('privacidade')) {
    /* CADA TABELA PELO SEU `id`.
       Esta conferência mirava em `table.legal` — que era uma tabela só quando
       foi escrita. Quando a política ganhou a tabela de PAPÉIS (3 colunas) e a
       de SUBOPERADORES (5), o seletor passou a somar as três e a acusar 11
       linhas "sem as quatro colunas" numa página correta. Uma régua que mira
       numa classe compartilhada mede o que aparecer ali depois. */
    const linhas = await pg.locator('table#basesLegais tr').count();
    ok('a tabela de bases legais renderiza como tabela', linhas >= 5, linhas + ' linhas');
    const vazias = await pg.locator('table#basesLegais tr').evaluateAll((trs) =>
      trs.slice(1).filter((tr) => [...tr.querySelectorAll('td')].length !== 4
        || [...tr.querySelectorAll('td')].some((td) => !td.textContent.trim())).length);
    ok('e cada linha diz dado, finalidade, base legal e prazo', vazias === 0, String(vazias));

    /* AS DUAS TABELAS NOVAS — por ora só em português.
       A separação de papéis e a tabela de suboperadores entraram primeiro em
       `privacidade.pt.html`, para serem revisadas antes de virarem cinco
       traduções de um texto jurídico. Quando en/es/de/fr receberem as duas
       seções, ESTA CONDIÇÃO SAI e a cobrança passa a valer nas três rotas.
       Quem não deixa isso ser esquecido é `testes/terceiros.mjs`, que já falha
       hoje, por idioma, dizendo qual tabela falta.

       O que cada uma tem que afirmar:
       A de papéis é a que decide uma avaliação de fornecedor: dizer-se
       "controladora" dos dados que o cliente confia à conta paga é o erro que
       reprova sozinho, porque quem decide finalidade e meios ali é o cliente. */
    if (rota === '/privacidade.html') {
    const papeis = (await pg.locator('table#papeis').textContent().catch(() => '')) || '';
    ok('a política separa os dois papéis', /operadora/i.test(papeis) && /controladora/i.test(papeis),
       papeis ? 'tem a tabela' : 'falta table#papeis');
    ok('e a conta paga está do lado de OPERADORA',
       /operadora[\s\S]{0,120}cliente/i.test(papeis.replace(/\s+/g, ' ')),
       papeis.replace(/\s+/g, ' ').slice(0, 100));

    const subs = await pg.locator('table#suboperadores tr').evaluateAll((trs) =>
      trs.slice(1).filter((tr) => [...tr.querySelectorAll('td')].length !== 5
        || [...tr.querySelectorAll('td')].some((td) => !td.textContent.trim())).length);
    ok('e a tabela de suboperadores diz nome, função, dado, país e salvaguarda',
       subs === 0, String(subs));
    }

    const col1 = await pg.locator('table#basesLegais tr td:first-child').allTextContents();
    ok('a conta paga está na tabela de prazos',
       col1.some((c) => /conta paga|paid-account|cuenta de pago/i.test(c)), col1.join(' | ').slice(0, 120));
    ok('e a fatura também, que é a que NÃO é apagada em 90 dias',
       col1.some((c) => /fatura|invoice|factura/i.test(c)), col1.join(' | ').slice(0, 120));
  }
  ok('sem token do build sobrando', !/\{\{|\}\}/.test(txt));
  await ctx.close();
}

// o rodapé continua levando às duas páginas, nos três idiomas
console.log('\nnavegação');
for (const [rota, alvo] of [['/', '/privacidade'], ['/en', '/en/privacidade'], ['/es', '/es/privacidade']]) {
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  await pg.goto('http://localhost:8893'+rota+'?lang=pt');
  ok(`${rota}: link para a política no rodapé`,
     (await pg.locator(`footer a[href="${alvo}"]`).count()) === 1);
  await ctx.close();
}

await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nDocumentos legais: tudo passou.');
process.exit(falhas?1:0);
