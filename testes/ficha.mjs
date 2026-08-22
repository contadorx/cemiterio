import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { criarProxy, exigirNext } from './proxy.mjs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
await exigirNext();
const ROOT=`${RAIZ_WS}/public`;
const tipos={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
/* O site virou Next.js: as páginas não existem mais como arquivo em public/.
   O servidorzinho estático daqui virou um encaminhador para o Next — mesma
   porta, mesmas URLs no teste, e quem responde é o produto de verdade. */
const srv = criarProxy();
await new Promise(r=>srv.listen(8961,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
const ctx=await br.newContext({viewport:{width:1200,height:900}});
const pg=await ctx.newPage(); const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.goto('http://localhost:8961/?lang=pt'); await pg.waitForTimeout(700);

console.log('[1] a aba existe e abre');
ok('a aba está na borda', await pg.locator('#fichaAba').isVisible());
ok('a caixa começa fechada', await pg.locator('#fichaCx').isHidden());
await pg.locator('#fichaAba').click(); await pg.waitForTimeout(300);
ok('abriu', await pg.locator('#fichaCx').isVisible());
ok('com onze notas, de 0 a 10', (await pg.locator('.fichaNota').count()) === 11);
ok('e a pergunta traz a marca', /Walkstamp/.test(await pg.locator('#fichaPasso1').textContent()),
   (await pg.locator('#fichaPasso1').textContent()).slice(0,60));

console.log('\n[2] nota baixa: escuta, não pede divulgação');
await pg.locator('.fichaNota[data-n="4"]').click(); await pg.waitForTimeout(300);
ok('vai para a caixa de texto', await pg.locator('#fichaPasso2').isVisible());
ok('e NÃO pede compartilhamento', await pg.locator('#fichaPasso3').isHidden());
ok('já marcado como problema', await pg.locator('.fichaTipo[data-t="problema"]').evaluate(e=>e.classList.contains('on')));

console.log('\n[3] nota alta: pede o compartilhamento');
{
  const pg2 = await (await br.newContext({viewport:{width:1200,height:900}})).newPage();
  await pg2.goto('http://localhost:8961/?lang=pt'); await pg2.waitForTimeout(600);
  await pg2.locator('#fichaAba').click(); await pg2.waitForTimeout(250);
  await pg2.locator('.fichaNota[data-n="9"]').click(); await pg2.waitForTimeout(300);
  ok('agradece e oferece o LinkedIn', await pg2.locator('#fichaPasso3').isVisible());
  const href = await pg2.locator('#fichaLinkedin').getAttribute('href');
  console.log('     ' + href);
  ok('o link é o compartilhador do LinkedIn', /linkedin\.com\/sharing\/share-offsite/.test(href), href);
  ok('com o endereço do site dentro', /localhost%3A8961|walkstamp/i.test(href));
  ok('e a caixa de texto não aparece junto', await pg2.locator('#fichaPasso2').isHidden());
  await pg2.close();
}
console.log('\n[4] a nota 7 já conta como quem indica');
{
  const pg3 = await (await br.newContext({viewport:{width:1200,height:900}})).newPage();
  await pg3.goto('http://localhost:8961/?lang=pt'); await pg3.waitForTimeout(600);
  await pg3.locator('#fichaAba').click(); await pg3.waitForTimeout(250);
  await pg3.locator('.fichaNota[data-n="7"]').click(); await pg3.waitForTimeout(300);
  ok('7 recebe o pedido', await pg3.locator('#fichaPasso3').isVisible());
  /* Fechar é pelo X: com a caixa aberta, a aba fica atrás do fundo escuro — e
     isso está certo, é o que um diálogo modal faz. */
  await pg3.locator('#fichaFechar').click(); await pg3.waitForTimeout(250);
  await pg3.locator('#fichaAba').click(); await pg3.waitForTimeout(400);
  ok('e reabrir não pergunta a nota de novo', await pg3.locator('#fichaPasso1').isHidden());
  await pg3.close();
}
console.log('\n[5] o recado vai para o servidor, não para o mailto');
{
  const pg5 = await (await br.newContext({viewport:{width:1200,height:900}})).newPage();
  const enviados = [];
  await pg5.route('**/rest/v1/rpc/walkstamp_recado', r => {
    enviados.push(JSON.parse(r.request().postData() || '{}'));
    r.fulfill({ status:200, contentType:'application/json', body:'"ok"' });
  });
  await pg5.goto('http://localhost:8961/?lang=pt'); await pg5.waitForTimeout(600);
  await pg5.locator('#fichaAba').click(); await pg5.waitForTimeout(250);
  await pg5.locator('.fichaNota[data-n="3"]').click(); await pg5.waitForTimeout(300);
  await pg5.fill('#fichaTexto','o botão de gerar não aparece no meu Firefox');
  await pg5.fill('#fichaEmail','fulano@empresa.com');
  await pg5.locator('#fichaEnviar').click(); await pg5.waitForTimeout(700);
  ok('o recado foi por HTTP, não abrindo programa de e-mail', enviados.length === 1,
     String(enviados.length));
  const e = enviados[0] || {};
  console.log('     ' + JSON.stringify(e).slice(0,150));
  ok('com o texto', /Firefox/.test(e.p_texto || ''));
  ok('com o tipo certo — nota baixa é problema', e.p_tipo === 'problema', e.p_tipo);
  ok('com a nota do NPS junto', e.p_nota === 3, String(e.p_nota));
  ok('e o e-mail de quem escreveu', e.p_email === 'fulano@empresa.com', e.p_email);
  ok('a tela confirma o recebimento', /Recebido/.test(await pg5.locator('#fichaMsg').textContent()),
     await pg5.locator('#fichaMsg').textContent());
  ok('e a caixa esvazia, para não mandar duas vezes',
     (await pg5.locator('#fichaTexto').inputValue()) === '');
  await pg5.close();
}

console.log('\n[6] o chamado tem número, e dá para consultar');
{
  const pg6 = await (await br.newContext({viewport:{width:1200,height:900}})).newPage();
  await pg6.route('**/rest/v1/rpc/walkstamp_recado', r =>
    r.fulfill({ status:200, contentType:'application/json', body:'"WS-0042"' }));
  await pg6.route('**/rest/v1/rpc/walkstamp_chamado_ver', r => {
    const c = JSON.parse(r.request().postData() || '{}');
    /* O e-mail é a fechadura: número certo com e-mail errado não abre. */
    if (c.p_email !== 'fulano@empresa.com')
      return r.fulfill({ status:200, contentType:'application/json', body:'{"erro":"nao_achei"}' });
    r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
      numero:'WS-0042', tipo:'problema', status:'respondido',
      texto:'o PDF sai sem a capa', resposta:'corrigido na versão de hoje' }) });
  });
  await pg6.goto('http://localhost:8961/?lang=pt'); await pg6.waitForTimeout(600);
  await pg6.locator('#fichaAba').click(); await pg6.waitForTimeout(250);
  await pg6.locator('.fichaNota[data-n="4"]').click(); await pg6.waitForTimeout(300);
  await pg6.fill('#fichaTexto','o PDF sai sem a capa');
  await pg6.fill('#fichaEmail','fulano@empresa.com');
  await pg6.locator('#fichaEnviar').click(); await pg6.waitForTimeout(700);
  const msg = await pg6.locator('#fichaMsg').textContent();
  console.log('     ' + msg);
  ok('a tela devolve o número do chamado', /WS-0042/.test(msg), msg);
  ok('e não avisa de falta de e-mail, porque houve e-mail', !/Sem e-mail/.test(msg));

  await pg6.locator('#fichaTrocar').click(); await pg6.waitForTimeout(300);
  ok('dá para trocar para a consulta', await pg6.locator('#fichaConsulta').isVisible());
  await pg6.fill('#fichaNum','WS-0042');
  await pg6.fill('#fichaNumEmail','outro@empresa.com');
  await pg6.locator('#fichaVer').click(); await pg6.waitForTimeout(700);
  ok('número certo com e-mail errado NÃO abre',
     /Não achei/.test(await pg6.locator('#fichaVerMsg').textContent()),
     await pg6.locator('#fichaVerMsg').textContent());
  await pg6.fill('#fichaNumEmail','fulano@empresa.com');
  await pg6.locator('#fichaVer').click(); await pg6.waitForTimeout(700);
  const out = await pg6.locator('#fichaVerOut').textContent();
  console.log('     ' + out.replace(/\s+/g,' ').slice(0,110));
  ok('com o e-mail certo, mostra o chamado', /WS-0042/.test(out));
  ok('com o status por extenso', /respondido/.test(out), out.slice(0,40));
  ok('e a resposta', /corrigido na versão de hoje/.test(out));
  await pg6.close();
}

console.log('\n[7] a ficha está nas três línguas');
for (const [u, marca] of [['/en/','Give feedback'],['/es/','Dar tu opinión']]) {
  const p4 = await (await br.newContext({viewport:{width:1100,height:800}})).newPage();
  const r = await p4.goto('http://localhost:8961'+u);
  await p4.waitForTimeout(400);
  ok(u+': a aba está traduzida', (await p4.locator('#fichaAba').textContent()) === marca,
     await p4.locator('#fichaAba').textContent());
  await p4.close();
}
console.log('\n[tempo] o prazo de resposta é medido, nunca prometido');
{
  /* A regra do produto: NUNCA um SLA. O que aparece é a média real das últimas
     vinte respostas, e só quando há histórico suficiente para a palavra "média"
     significar alguma coisa. Um "respondo em 24h" numa operação de uma pessoa
     fabrica a decepção para o dia em que não for cumprido. */
  const casos = [
    { nome: 'com histórico, mostra o número real',
      resposta: { horas: 6, quantos: 14 }, espera: /6h.*14 respostas/s },
    { nome: 'respondendo rápido, não escreve "0h"',
      resposta: { horas: 0, quantos: 9 },  espera: /menos de uma hora/ },
  ];
  for (const c of casos) {
    const p5 = await (await br.newContext({viewport:{width:1200,height:900}})).newPage();
    await p5.route('**/rpc/walkstamp_chamado_resposta', r => r.fulfill({
      status: 200, headers: { 'content-type': 'application/json',
                              'access-control-allow-origin': '*' },
      body: JSON.stringify(c.resposta) }));
    await p5.goto('http://localhost:8961/?lang=pt'); await p5.waitForTimeout(500);
    await p5.locator('#fichaAba').click(); await p5.waitForTimeout(600);
    const t = await p5.locator('#fichaTempo').textContent();
    ok(c.nome, c.espera.test(t || ''), (t || '(vazio)').slice(0, 90));
    ok(c.nome + ' — e diz que é o número real, não um prazo',
       /não é um prazo prometido|não um prazo prometido/.test(t || ''));
    await p5.context().close();
  }

  const calados = [
    { nome: 'sem histórico, cala a boca', rota: r => r.fulfill({ status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({ horas: 2, quantos: 1 }) }) },
    { nome: 'rede caída, cala a boca — prometer prazo por engano é pior',
      rota: r => r.abort() },
  ];
  for (const c of calados) {
    const p6 = await (await br.newContext({viewport:{width:1200,height:900}})).newPage();
    await p6.route('**/rpc/walkstamp_chamado_resposta', c.rota);
    await p6.goto('http://localhost:8961/?lang=pt'); await p6.waitForTimeout(500);
    await p6.locator('#fichaAba').click(); await p6.waitForTimeout(700);
    ok(c.nome, await p6.locator('#fichaTempo').isHidden(),
       await p6.locator('#fichaTempo').textContent());
    await p6.context().close();
  }

  console.log('\n[tempo] e nos outros dois idiomas');
  for (const [rota, esperado] of [['/en/', /8h.*11 replies/s], ['/es/', /8h.*11 respuestas/s]]) {
    const p7 = await (await br.newContext({viewport:{width:1200,height:900}})).newPage();
    await p7.route('**/rpc/walkstamp_chamado_resposta', r => r.fulfill({ status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ horas: 8, quantos: 11 }) }));
    await p7.goto('http://localhost:8961' + rota); await p7.waitForTimeout(500);
    await p7.locator('#fichaAba').click(); await p7.waitForTimeout(600);
    const t = await p7.locator('#fichaTempo').textContent();
    ok(rota + ': traduzido', esperado.test(t || ''), (t || '(vazio)').slice(0, 90));
    await p7.context().close();
  }
}

ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,150));
await br.close(); srv.close();
console.log(falhas?'\n'+falhas+' falha(s)':'\nFicha e NPS: tudo passou.');
process.exit(falhas?1:0);
