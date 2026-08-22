import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
/* O diagnóstico tem que ser CLICÁVEL de verdade — com clique do Playwright, sem
   `force` e sem `el.click()` por dentro. Foi assim que o defeito escapou: os
   dois testes que precisavam do botão contornaram o clique bloqueado em vez de
   reclamar dele, e o que chegou de produção foi "o aplicativo não habilitou o
   diagnóstico". O cartão 2 colapsa quando não há vídeo, e tudo que mora dentro
   da dobra é recortado por overflow:hidden — inclusive as ferramentas de quem
   está com problema. */

const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  if (u === '/sw.js') { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(fs.readFileSync(ROOT+'/sw.js')) }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8903, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const alcancavel = async (pg, id) => {
  // o probe usa elementFromPoint, que só enxerga o que está na janela
  await pg.locator('#' + id).scrollIntoViewIfNeeded();
  await pg.waitForTimeout(120);
  return pg.evaluate(sel => {
  const b = document.getElementById(sel);
  if (!b || b.disabled) return { ok: false, motivo: 'ausente ou desabilitado' };
  const r = b.getBoundingClientRect();
  if (!r.width || !r.height) return { ok: false, motivo: 'sem área' };
  const topo = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  const desc = e => !e ? '(nada)' : e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '');
    return { ok: topo === b || b.contains(topo), motivo: 'tapado por ' + desc(topo) };
  }, id);
};

async function pagina(){
  const ctx = await br.newContext({ viewport: { width: 1000, height: 900 } });
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.addInitScript(() => {
    function tela(){
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const g = c.getContext('2d'); let i = 0;
      setInterval(() => { i++; g.fillStyle = ['#123','#eee','#567','#fa0'][i%4]; g.fillRect(0,0,320,180); }, 700);
      return c.captureStream(12);
    }
    navigator.mediaDevices.getDisplayMedia = async () => tela();
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
  });
  await pg.goto('http://localhost:8903/app.html?lang=pt');
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(500);
  return { pg, ctx, erros };
}

console.log('[A] cartão 2 travado (sem vídeo no passo 1) — o estado da queixa');
const { pg, ctx, erros } = await pagina();
{
  /* O CARTÃO 2 DEIXOU DE NASCER FECHADO. Fechado, ele era uma faixa cinza que
     não dizia o que fazia — e a pergunta que gerava era literal: "isto só serve
     para vídeo enviado?". Não serve. Quem fechou no lugar dele foi a GAVETA dos
     ajustes, que é onde estavam os dezesseis controles, e é ela que agora
     esconde o "apagar o modelo de voz" — a queixa que deu origem a este
     arquivo. O caminho é o mesmo, o botão que o abre é outro. */
  ok('o cartão nasce aberto',
     !(await pg.evaluate(() => document.getElementById('cardTr').classList.contains('fechado'))));
  ok('mas os ajustes dele nascem guardados',
     !(await pg.evaluate(() => document.getElementById('ajustesCx').classList.contains('aberta'))));
  const d = await alcancavel(pg, 'avisar');   // o diagnóstico virou o anexo do recado, no rodapé
  ok('Diagnóstico alcançável', d.ok, d.motivo);

  /* "Apagar o modelo de voz baixado" mudou de lugar e a regra mudou junto —
     de propósito, e vale registrar por quê, porque este arquivo existe por
     causa de uma queixa de produção.

     Ele ficava solto no fim do passo 2, sem contexto: quem lia "apagar o modelo
     guardado" não tinha como saber que aquilo eram 400 MB de modelo de VOZ e
     não o modelo de DOCUMENTO. Agora mora ao lado do seletor de voz, que é a
     única coisa da tela que o explica — e o seletor de voz mora no cartão 2.

     A promessa que este teste protege não é "zero clique": é que ninguém fique
     preso. Então o que se cobra agora é o CAMINHO — o cabeçalho do cartão 2 tem
     que ser um controle de verdade, anunciado como botão e alcançável pelo
     teclado, e um clique nele tem que revelar o botão. Um cabeçalho que só
     "funciona no clique" sem se anunciar seria um truque, e truque é o mesmo
     que fold. */
  const cab = await pg.evaluate(() => {
    const h = document.querySelector('#cardTr h2');
    if (!h) return null;
    return { papel: h.getAttribute('role'), foco: h.getAttribute('tabindex'),
             cursor: getComputedStyle(h).cursor };
  });
  ok('o cabeçalho do cartão 2 se anuncia como botão',
     !!cab && cab.papel === 'button' && cab.foco === '0' && cab.cursor === 'pointer',
     JSON.stringify(cab));
  /* E a gaveta também: um botão de verdade, que diz o próprio estado. Um
     esconderijo que só "funciona no clique" sem se anunciar é um truque, e
     truque é o mesmo que estar tapado. */
  const gav = await pg.evaluate(() => {
    const b = document.getElementById('ajustesBtn');
    return b && { tag: b.tagName, aberto: b.getAttribute('aria-expanded'),
                  controla: b.getAttribute('aria-controls') };
  });
  ok('e o botão dos ajustes também se anuncia',
     !!gav && gav.tag === 'BUTTON' && gav.aberto === 'false' && gav.controla === 'ajustesCx',
     JSON.stringify(gav));
  const tapadoAntes = await alcancavel(pg, 'limparModelo');
  ok('com a gaveta fechada ele está mesmo escondido (é o que o botão resolve)',
     !tapadoAntes.ok, tapadoAntes.motivo);
  await pg.locator('#ajustesBtn').click();
  await pg.waitForTimeout(400);
  const l = await alcancavel(pg, 'limparModelo');
  ok('e um clique em "ajustes" o torna alcançável', l.ok, l.motivo);
  /* O cartão fica aberto daqui para a frente: é o estado em que a pessoa que
     veio apagar o modelo está quando aperta o botão, e é ele que o bloco [B]
     precisa exercitar. */

  // clique de verdade, sem force: é isto que reproduz a queixa
  /* O botão Diagnóstico saiu da tela na revisão de UX: ele virou o ANEXO de um
     recado, no rodapé. O caminho de uma pessoa com problema agora é este —
     abrir "avisar um problema" e ver o relatório antes de mandar. */
  await pg.locator('#avisar').click();
  await pg.waitForFunction(() => {
    const el = document.getElementById('fbDiagOut');
    return el && el.textContent && el.textContent.length > 40;
  }, null, { timeout: 25000 });
  await pg.waitForFunction(() => /fim ---/.test(document.getElementById('fbDiagOut').textContent),
                           null, { timeout: 90000 });
  ok('o relatório saiu', /diagnóstico/.test(await pg.locator('#fbDiagOut').textContent()));
  /* Ele nasce recolhido atrás de "ver o que vai junto" — e isso é o desenho,
     não um esconderijo: quem tem um problema quer contar o problema, não ler
     uma lista de capacidades do navegador. O que o teste cobra é que ela esteja
     a UM clique, com rótulo, antes de qualquer coisa ser enviada. */
  const resumo = pg.locator('#fbModal details summary');
  ok('o relatório fica atrás de um rótulo que diz o que é',
     /ver o que vai junto/.test(await resumo.textContent()), await resumo.textContent());
  await resumo.click();
  await pg.waitForTimeout(300);
  ok('e um clique o mostra', await pg.locator('#fbDiagOut').isVisible());
  await pg.locator('#fbFechar').click();
  await pg.waitForTimeout(250);
}

console.log('\n[B] apagar o modelo responde onde dá para ver');
{
  /* Apagar 400 MB sem dizer nada é indistinguível de não ter apagado — e quem
     aperta este botão está justamente na dúvida se o modelo ainda está lá. */
  await pg.evaluate(async () => {
    const c = await caches.open('transformers-cache');
    await c.put('https://huggingface.co/x/config.json', new Response('{}'));
  });
  await pg.locator('#limparModelo').click({ timeout: 8000 });
  await pg.waitForFunction(() => /Apaguei|guardado/.test(document.getElementById('diagStatus').textContent),
                           null, { timeout: 15000 });
  ok('a resposta está fora da dobra', /Apaguei 1 arquivo/.test(await pg.locator('#diagStatus').textContent()));
  ok('e é visível', await pg.locator('#diagStatus').isVisible());
}

console.log('\n[C] durante e depois de uma gravação');
{
  await pg.locator('#recTr').evaluate(el => { if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change')); } });
  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  await pg.waitForTimeout(3000);
  let d = await alcancavel(pg, 'avisar');
  ok('alcançável durante a gravação', d.ok, d.motivo);

  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null, null, { timeout: 40000 });
  await pg.waitForTimeout(600);
  d = await alcancavel(pg, 'avisar');
  ok('alcançável depois de parar', d.ok, d.motivo);
  /* O botão Diagnóstico saiu da tela na revisão de UX: ele virou o ANEXO de um
     recado, no rodapé. O caminho de uma pessoa com problema agora é este —
     abrir "avisar um problema" e ver o relatório antes de mandar. */
  await pg.locator('#avisar').click();
  await pg.waitForFunction(() => {
    const el = document.getElementById('fbDiagOut');
    return el && el.textContent && el.textContent.length > 40;
  }, null, { timeout: 25000 });
  await pg.waitForFunction(() => /última gravação de tela/.test(document.getElementById('fbDiagOut').textContent),
                           null, { timeout: 90000 });
  ok('o relatório traz a última gravação', true);
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await ctx.close();
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nDiagnóstico alcançável: tudo passou.');
process.exit(falhas ? 1 : 0);
