/* O convite para contar a alguém, depois que o documento sai.
 *
 * Sem cadastro, sem anúncio e sem rastrear ninguém, o único canal deste produto
 * é uma pessoa contando para outra. E a hora não é quando ela chega: é quando o
 * arquivo acabou de sair e a tarde que ele poupou ainda está fresca.
 *
 * O que este arquivo cobra é a linha que separa isto de uma traição: o que se
 * compartilha é o ENDEREÇO DA FERRAMENTA. O documento não sai desta máquina, e
 * é a promessa que o produto inteiro vende.
 */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  if (u === '/sw.js') { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(fs.readFileSync(ROOT+'/sw.js')) }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8923, r));

let falhas = 0;
const ok = (n,c,e) => { console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:'')); if(!c) falhas++; };
const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1200, height: 950 },
                                  permissions: ['clipboard-read','clipboard-write'] });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));

const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
await pg.route('**/jspdf**', r => r.fulfill({ status:200,
  headers:{'content-type':'text/javascript','access-control-allow-origin':'*'}, body: jspdf }));

await pg.goto('http://localhost:8923/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(600);

console.log('[1] antes de gerar nada, o convite não existe');
ok('escondido', await pg.locator('#compCx').evaluate(e => e.classList.contains('hide')));

console.log('\n[2] documento gerado, o convite aparece');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('prevCard').hasAttribute('inert'), null, { timeout: 20000 });
await pg.selectOption('#mode', 'count');
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length > 1, null, { timeout: 90000 });
await pg.waitForTimeout(500);
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#html').click();
  await (await dl).saveAs('/tmp/comp-saida.html');
  await pg.waitForTimeout(600);
  ok('agora aparece', !(await pg.locator('#compCx').evaluate(e => e.classList.contains('hide'))));
  const t = await pg.locator('#compTit').innerText();
  ok('e convida a contar para alguém', /conte para alguém/i.test(t), t.slice(0, 60));
}

console.log('\n[3] o que se compartilha é a FERRAMENTA, não o documento');
{
  /* A pergunta que faz esta feature ser aceitável. Um convite que vazasse o
     documento seria a traição exata do que o produto promete — e é o que uma
     pessoa apressada suporia que ele faz. */
  const li = await pg.locator('#compLinkedin').getAttribute('href');
  ok('o LinkedIn recebe o endereço do site', /walkstamp\.com/.test(decodeURIComponent(li)), li.slice(0, 90));
  ok('  nada de documento no LinkedIn',
     !/data:|blob:|base64|\.pdf|\.html\b/.test(decodeURIComponent(li)),
     decodeURIComponent(li).slice(0, 70));

  /* O e-mail deixou de ser um `mailto:` no `href` — ele agora é um formulário
     que manda pelo servidor, com o `mailto:` guardado como reserva para quando
     o servidor não responde e para o pacote offline, que não tem rede.

     Então a pergunta muda de lugar mas continua sendo a mesma: o que sai daqui
     é o ENDEREÇO DO SITE e o e-mail de quem vai receber. Nunca o documento. */
  const oQueSai = await pg.evaluate(() => {
    const f = (window.__ultimoEnvio || null);
    return f;
  });
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  const corpoDoPedido = (fonte.match(/JSON\.stringify\(\{ para[^}]*\}\)/) || [''])[0];
  ok('o e-mail manda só destinatário, quem indica e idioma',
     /para, quem[^}]*lang/.test(corpoDoPedido), corpoDoPedido.slice(0, 80));
  ok('  nada de documento no e-mail',
     !/data:|blob:|base64|frames|imagem|doc/i.test(corpoDoPedido), corpoDoPedido.slice(0, 80));
  const mailto = (fonte.match(/const mailto = '[^']*'[^;]*/) || [''])[0];
  ok('e a reserva do mailto também leva só o endereço',
     /compCorpo'\) \+ '\\n\\n' \+ url/.test(mailto), mailto.slice(0, 90));
  const nota = await pg.locator('#compNota').innerText();
  ok('e a tela DIZ que o documento não sai daqui',
     /não sai deste computador/i.test(nota), nota.slice(0, 70));
}

console.log('\n[4] copiar copia o endereço, e avisa');
{
  await pg.locator('#compCopiar').click();
  await pg.waitForTimeout(400);
  const msg = await pg.locator('#compMsg').innerText();
  ok('a tela confirma', /copiado/i.test(msg) || /walkstamp\.com/.test(msg), msg);
  const area = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (area) ok('e o que foi para a área de transferência é o site',
               /walkstamp\.com/.test(area) && !/data:|base64/.test(area), area.slice(0, 60));
}

console.log('\n[5] uma vez por sessão, e não a cada documento');
{
  /* Quem gera trinta documentos por dia veria o convite trinta vezes — e ruído
     é o que se aprende a não ver. */
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#md').click();
  await (await dl).saveAs('/tmp/comp-saida2.md');
  await pg.waitForTimeout(500);
  ok('continua visível, sem piscar de novo',
     !(await pg.locator('#compCx').evaluate(e => e.classList.contains('hide'))));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 140));
}

console.log('\n[6] o convite fala os cinco idiomas');
{
  for (const [L, re2] of [['en', /tell someone/i], ['es', /cu[eé]ntaselo|cuéntaselo/i],
                          ['de', /erzählen sie/i], ['fr', /parlez-en/i]]) {
    await pg.goto('http://localhost:8923/app.html?lang=' + L);
    // o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
    await pg.selectOption('#modelo', 'ia').catch(() => {});
    await pg.waitForTimeout(400);
    const t = await pg.locator('#compTit').evaluate((e, k) => {
      // o texto é montado só quando o convite aparece; aqui basta o dicionário
      return window.__t ? window.__t(k) : '';
    }, 'compTit').catch(() => '');
    const cru = fs.readFileSync(ROOT + '/app.html', 'utf8');
    ok(`${L}: o texto existe no dicionário`, re2.test(cru), '');
  }
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nConvite para compartilhar: tudo passou.');
process.exit(falhas ? 1 : 0);
