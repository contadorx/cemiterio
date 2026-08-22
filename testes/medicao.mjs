/* Medição, lista de aviso e a manchete nova.
   O que este teste protege, em ordem de gravidade se quebrar:
     1. o build offline continuar mudo;
     2. Do Not Track ser respeitado;
     3. nenhum dado do vídeo escapar junto com os marcos;
     4. o formulário de e-mail funcionar e falhar de forma legível. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { criarProxy, exigirNext } from './proxy.mjs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
await exigirNext();

const ROOT = `${RAIZ_WS}/public`;
const T = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml',
  '.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.webm':'video/webm','.vtt':'text/vtt'};
/* O site virou Next.js: as páginas não existem mais como arquivo em public/.
   O servidorzinho estático daqui virou um encaminhador para o Next — mesma
   porta, mesmas URLs no teste, e quem responde é o produto de verdade. */
const srv = criarProxy();
await new Promise(r => srv.listen(8877, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/** Página com o Supabase e o Vercel interceptados; devolve o que foi enviado. */
async function pagina(url, opts = {}) {
  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  const eventos = [], listas = [], vercel = [];
  const erros = []; pg.on('pageerror', e => erros.push(e.message));

  if (opts.dnt) await pg.addInitScript(() => {
    Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' });
  });
  if (opts.gpc) await pg.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
  });

  await pg.route('**/rpc/walkstamp_evento', r => {
    eventos.push(JSON.parse(r.request().postData() || '{}'));
    r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'null' });
  });
  await pg.route('**/rpc/walkstamp_interesse', r => {
    listas.push(JSON.parse(r.request().postData() || '{}'));
    r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*',
      'content-type': 'application/json' }, body: JSON.stringify(opts.resposta ?? 'ok') });
  });
  await pg.route('**/_vercel/insights/**', r => { vercel.push(r.request().url()); r.fulfill({ status: 200, body: '' }); });
  // o modelo de transcrição nunca é baixado nestes testes
  await pg.route('**/@huggingface/transformers**', r => r.fulfill({ status: 200,
    headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' },
    body: 'export const env={backends:{onnx:{wasm:{}}}};export async function pipeline(){return async()=>({chunks:[]})}' }));

  await pg.goto(url);
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar cobra a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(500);
  return { pg, ctx, eventos, listas, vercel, erros };
}

console.log('\n[M1] os três marcos, e só eles');
{
  const { pg, ctx, eventos, vercel, erros } = await pagina('http://localhost:8877/app.html?lang=pt');
  ok('marca que a ferramenta foi aberta', eventos.some(e => e.p_nome === 'abriu_ferramenta'),
     JSON.stringify(eventos[0]));
  ok('e o snippet do Vercel carrega junto', vercel.length > 0, vercel[0]);

  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  await pg.waitForFunction(() => !document.getElementById('auto').disabled, null, { timeout: 20000 });
  await pg.waitForTimeout(400);
  const carregou = eventos.find(e => e.p_nome === 'carregou_video');
  ok('marca o vídeo aberto, com a origem', !!carregou && carregou.p_origem === 'arquivo',
     JSON.stringify(carregou));

  /* Uma saída baixada. Era a legenda solta, que não dependia de jsPDF nem de
     quadros — e os três botões de legenda saíram da tela. O substituto é o
     .json: também não precisa do jsPDF, e é a saída mais barata que sobrou.
     Precisa de quadros, então extraímos dois antes. */
  await pg.fill('#tr', 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nfala de teste\n');
  await pg.dispatchEvent('#tr', 'input');
  await pg.selectOption('#mode', 'count'); await pg.fill('#count', '2');
  await pg.locator('#extract').click();
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 2,
                           null, { timeout: 40000 });
  await pg.locator('#json').click();
  await pg.waitForTimeout(600);
  const baixou = eventos.find(e => e.p_nome === 'baixou_saida');
  ok('marca a saída baixada, com o formato', !!baixou && baixou.p_formato === 'json',
     JSON.stringify(baixou));

  const chaves = [...new Set(eventos.flatMap(e => Object.keys(e)))].sort();
  ok('nenhum campo além do combinado', JSON.stringify(chaves) ===
     JSON.stringify(['p_formato','p_idioma','p_nome','p_origem']), chaves.join(','));
  const bruto = JSON.stringify(eventos);
  ok('nada do vídeo vai junto (nome, tamanho, duração)',
     !/amostra|webm|\.mp4|size|dura/i.test(bruto), bruto.slice(0, 160));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 160));
  await ctx.close();
}

console.log('\n[M2] Do Not Track e Global Privacy Control calam a medição');
for (const [k, rot] of [['dnt','Do Not Track'], ['gpc','Global Privacy Control']]) {
  const { pg, ctx, eventos } = await pagina('http://localhost:8877/app.html?lang=pt', { [k]: true });
  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  await pg.waitForFunction(() => !document.getElementById('auto').disabled, null, { timeout: 20000 });
  await pg.waitForTimeout(500);
  ok(`${rot}: nenhum marco enviado`, eventos.length === 0, eventos.length + ' enviados');
  await ctx.close();
}

console.log('\n[M3] o arquivo offline é mudo');
{
  const off = fs.readFileSync(`${RAIZ_WS}/offline/walkstamp-offline.html`, 'utf8');
  ok('sem endereço do Supabase no arquivo', !/supabase/i.test(off));
  ok('sem snippet do Vercel no arquivo', !/_vercel\/insights/.test(off));

  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  const externos = [];
  pg.on('request', r => { if (!r.url().startsWith('file:')) externos.push(r.url()); });
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.goto(`file://${RAIZ_WS}/offline/walkstamp-offline.html`);
  await pg.waitForTimeout(900);
  ok('abrindo o arquivo, nenhum pedido sai da máquina', externos.length === 0, externos.join(' | ').slice(0,160));
  ok('e ele funciona: a interface montou', await pg.locator('#drop').isVisible());
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 160));
  await ctx.close();
}

console.log('\n[M4] a lista de aviso');
{
  const { pg, ctx, listas, erros } = await pagina('http://localhost:8877/precos.html?lang=pt');
  ok('o formulário existe', await pg.locator('#listaForm').isVisible());

  await pg.fill('#listaEmail', 'nao-e-email');
  await pg.click('#listaBtn'); await pg.waitForTimeout(250);
  ok('endereço torto nem chega a ser enviado', listas.length === 0);
  ok('e o motivo aparece na tela', /não parece/.test(await pg.locator('#listaMsg').textContent()),
     await pg.locator('#listaMsg').textContent());

  await pg.fill('#listaEmail', ' Leandro@Exemplo.com ');
  await pg.click('#listaBtn');
  await pg.waitForFunction(() => document.getElementById('listaForm').style.display === 'none',
                           null, { timeout: 5000 });
  ok('endereço bom é enviado', listas.length === 1 && listas[0].p_email === 'Leandro@Exemplo.com',
     JSON.stringify(listas[0]));
  ok('com o idioma da página', listas[0] && listas[0].p_idioma === 'pt');
  ok('o formulário some e a confirmação aparece',
     /Aviso você quando sair/.test(await pg.locator('#listaMsg').textContent()));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 160));
  await ctx.close();
}

console.log('\n[M5] quando o banco recusa, e quando a rede cai');
{
  const { pg, ctx } = await pagina('http://localhost:8877/precos.html?lang=pt', { resposta: 'invalido' });
  await pg.fill('#listaEmail', 'a@b.co');
  await pg.click('#listaBtn'); await pg.waitForTimeout(400);
  ok('resposta "invalido" vira recado, não silêncio',
     /não parece/.test(await pg.locator('#listaMsg').textContent()));
  ok('e o botão volta a funcionar', !(await pg.locator('#listaBtn').isDisabled()));
  await ctx.close();
}
{
  const ctx = await br.newContext(); const pg = await ctx.newPage();
  await pg.route('**/rpc/walkstamp_interesse', r => r.abort());
  await pg.route('**/_vercel/insights/**', r => r.fulfill({ status: 200, body: '' }));
  await pg.goto('http://localhost:8877/precos.html?lang=pt');
  await pg.fill('#listaEmail', 'a@b.co');
  await pg.click('#listaBtn'); await pg.waitForTimeout(600);
  ok('rede caída vira recado, não trava', /Tente de novo/.test(await pg.locator('#listaMsg').textContent()),
     await pg.locator('#listaMsg').textContent());
  ok('e o botão volta a funcionar', !(await pg.locator('#listaBtn').isDisabled()));
  await ctx.close();
}

console.log('\n[M6] a manchete nova, nos três idiomas');
{
  const esperado = {
    '/':   ['Você percorre a tela', 'carimba cada passo', '3.600', 'Evidência de teste', 'Contexto para IA'],
    '/en': ['You walk the screen', 'stamps every step', '3,600', 'Test evidence', 'Context for AI'],
    '/es': ['Tú recorres la pantalla', 'sella cada paso', '3.600', 'Evidencia de prueba', 'Contexto para IA'],
  };
  for (const [rota, termos] of Object.entries(esperado)) {
    const ctx = await br.newContext(); const pg = await ctx.newPage();
    await pg.route('**/_vercel/insights/**', r => r.fulfill({ status: 200, body: '' }));
    await pg.goto('http://localhost:8877' + rota + '?lang=' + (rota === '/' ? 'pt' : rota.slice(1)));
    const txt = await pg.locator('body').innerText();
    /* innerText devolve as etiquetas já em caixa alta (text-transform no CSS),
       então a comparação ignora caixa. */
    const baixo = txt.toLowerCase();
    for (const termo of termos) ok(`${rota}: "${termo}"`, baixo.includes(termo.toLowerCase()));
    ok(`${rota}: a frase que expira saiu da manchete`,
       !/não assistem vídeo|do not watch video|no ven vídeo/.test(await pg.locator('h1, .lead').first().innerText()));
    await ctx.close();
  }
}

console.log('\n[M7] a política de privacidade conta o que passou a existir');
{
  for (const [rota, termos] of Object.entries({
    '/privacidade.html':    ['O que é medido', 'Do Not Track', 'Supabase', 'lista de aviso'],
    '/en/privacidade.html': ['What is measured', 'Do Not Track', 'Supabase', 'notification list'],
    '/es/privacidade.html': ['Qué se mide', 'Do Not Track', 'Supabase', 'lista de aviso'],
  })) {
    const ctx = await br.newContext(); const pg = await ctx.newPage();
    await pg.route('**/_vercel/insights/**', r => r.fulfill({ status: 200, body: '' }));
    await pg.goto('http://localhost:8877' + rota);
    const txt = await pg.locator('body').innerText();
    for (const t of termos) ok(`${rota}: "${t}"`, txt.includes(t));
    ok(`${rota}: não afirma mais que não há análise de audiência`,
       !/análise de audiência|audience analytics|analítica de audiencia/.test(txt));
    await ctx.close();
  }
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nMedição: tudo passou.');
process.exit(falhas ? 1 : 0);
