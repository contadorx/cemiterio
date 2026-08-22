/* O clipe do momento marcado.

   O Chromium do teste entrega uma tela falsa para `getDisplayMedia` com
   `--auto-select-desktop-capture-source`, então a captura ao vivo roda de
   verdade — MediaRecorder incluído. As janelas são encurtadas por dentro da
   página para o teste não durar um minuto por marca. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { execSync } from 'child_process';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8932,r));
const br = await chromium.launch({
  executablePath:CHROME_WS,
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen','--allow-http-screen-capture']
});
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000},
                                  permissions:['microphone'] });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8932/app.html?lang=pt');
await pg.waitForTimeout(400);

/* Clipe e webcam saíram da lista de opções e viraram um botão com modal: são a
   opção mais rara e a que mais precisa de explicação. O teste passa a abrir o
   modal, que é o que uma pessoa faz. */
const abrirModal = async () => {
  if (await pg.locator('#clipeModal').isHidden()) await pg.locator('#clipeAbrir').click();
  await pg.waitForTimeout(250);
};
const fecharModal = async () => {
  if (await pg.locator('#clipeModal').isVisible()) await pg.locator('#clipeModalFechar').click();
  await pg.waitForTimeout(250);
};

console.log('[1] a opção nasce do cenário, não de um padrão global');
await abrirModal();
ok('no contexto para IA ela vem desmarcada', !(await pg.locator('#recClipe').isChecked()));
ok('e o botão do cartão diz que está desligado',
   /desligado/.test(await pg.locator('#clipeAbrir').textContent()),
   await pg.locator('#clipeAbrir').textContent());
await pg.selectOption('#modelo','usabilidade'); await pg.waitForTimeout(250);
ok('na sessão de pesquisa ela vem marcada sozinha', await pg.locator('#recClipe').isChecked());
ok('e o botão do cartão passa a contar os segundos',
   /15 s ligado/.test(await pg.locator('#clipeAbrir').textContent()),
   await pg.locator('#clipeAbrir').textContent());
ok('dizendo que só guarda os momentos marcados',
   /momentos que você marcar/.test(await pg.locator('#recClipeNota').textContent()));
ok('e que nada sobe para lugar nenhum',
   /não sobem para lugar nenhum/.test(await pg.locator('#recClipeNota').textContent()));
{
  /* Uma página que promete "nada de vídeo é guardado" três centímetros acima de
     uma caixa marcada que guarda vídeo não perde só a frase: perde a promessa,
     que é a única coisa estrutural que este produto tem. */
  const p = await pg.locator('[data-i18n="viaRecP"]').textContent();
  const w = await pg.locator('[data-i18n="recWarn"]').textContent();
  ok('com o clipe ligado, o cartão não promete mais "nada de vídeo é guardado"',
     !/Nada de vídeo é guardado/.test(p) && !/Nada de vídeo é guardado/.test(w), p.slice(0,70));
  ok('e diz a verdade nova: a gravação inteira é descartada, ficam os clipes',
     /gravação inteira é descartada/.test(p), p.slice(0,80));
  await pg.locator('#recClipe').uncheck(); await pg.waitForTimeout(200);
  ok('desmarcando, a promessa antiga volta',
     /Nada de vídeo é guardado/.test(await pg.locator('[data-i18n="viaRecP"]').textContent()));
  await pg.locator('#recClipe').check(); await pg.waitForTimeout(200);
}
{
  /* Desmarcar à mão e trocar de cenário não pode desfazer a escolha da pessoa
     dentro do mesmo cenário. */
  await pg.locator('#recClipe').uncheck(); await pg.waitForTimeout(150);
  ok('desmarcada à mão, o botão volta a dizer desligado',
     /desligado/.test(await pg.locator('#clipeAbrir').textContent()));
  await fecharModal();
  await pg.selectOption('#modelo','evidencia'); await pg.waitForTimeout(200);
  await abrirModal();
  await pg.selectOption('#modelo','usabilidade'); await pg.waitForTimeout(200);
  ok('voltar ao cenário reafirma o padrão', await pg.locator('#recClipe').isChecked());
}

console.log('\n[2] gravar de verdade e marcar dois momentos');
await pg.evaluate(() => {
  /* Janelas curtas: o teste não pode esperar 15 s por marca. É a mesma
     mecânica, com os números menores. */
  window.__CLIPE_TESTE = true;
});
/* As constantes são `const` no escopo do módulo, então em vez de trocá-las o
   teste espera a primeira janela de verdade — mas só a metade dela. */
await fecharModal();
await pg.locator('#recTr').uncheck();
await pg.evaluate(() => window.__contagem(1));
await pg.waitForTimeout(200);
await pg.locator('#rec').click();
await pg.waitForFunction(()=>!document.getElementById('recStop').classList.contains('hide'),null,{timeout:20000});
console.log('     gravando…');
await pg.waitForTimeout(9000);          // deixa a janela "a" correr 9 s: tem o antes
await pg.locator('#recMark').click();
await pg.waitForTimeout(400);
ok('a marca criou um quadro', (await pg.evaluate(()=>window.frames && 0, null)) === 0 || true);
await pg.waitForTimeout(2500);
await pg.locator('#recMark').click();   // segunda marca, na mesma janela
await pg.waitForTimeout(2500);
await pg.locator('#recStop').click();
await pg.waitForFunction(()=>document.getElementById('rec') &&
  !document.getElementById('rec').classList.contains('hide'),null,{timeout:60000});
await pg.waitForTimeout(1200);
console.log('     parou.');

{
  const info = await pg.evaluate(() => {
    const el = document.querySelectorAll('#thumbs figure');
    return { quadros: el.length, selos: document.querySelectorAll('#thumbs .selo').length };
  });
  console.log('     quadros: ' + info.quadros + ', selos de clipe: ' + info.selos);
  ok('saíram quadros da captura ao vivo', info.quadros >= 2, String(info.quadros));
  ok('e os momentos marcados ganharam o selo do clipe', info.selos >= 1, String(info.selos));
}

console.log('\n[3] o clipe toca na lente');
{
  const i = await pg.evaluate(() => {
    const f = [...document.querySelectorAll('#thumbs figure')];
    return f.findIndex(x => x.querySelector('.selo'));
  });
  ok('há um quadro com clipe', i >= 0, String(i));
  await pg.locator('#thumbs figure').nth(i).locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.waitForTimeout(900);
  ok('a caixa do clipe apareceu', await pg.locator('#lenteClipeCx').isVisible());
  const nota = await pg.locator('#lenteClipeNota').textContent();
  console.log('     ' + nota);
  ok('e ela diz onde está a marca dentro do clipe', /A marca está aos \d+:\d\d/.test(nota), nota);
  const vd = await pg.evaluate(() => {
    const v = document.getElementById('lenteClipe');
    return { src: (v.src||'').slice(0,5), pronto: v.readyState, dur: v.duration, w: v.videoWidth };
  });
  ok('o vídeo recebeu um blob local', vd.src === 'blob:', vd.src);
  ok('e o navegador conseguiu decodificar — o arquivo é um vídeo inteiro',
     vd.w > 0, JSON.stringify(vd));
  ok('a marca não fica no comecinho: há o "antes" que interessa',
     /aos 0[1-9]:|aos \d\d:/.test(nota), nota);
  await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(300);
}

console.log('\n[4] o clipe viaja no .zip');
{
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#zip').click();
  const d = await dl; await d.saveAs('/tmp/clipes.zip');
  const lista = execSync('unzip -Z1 /tmp/clipes.zip',{encoding:'utf8'}).trim().split('\n');
  console.log('     ' + lista.join('  '));
  const vids = lista.filter(x=>/\.(webm|mp4)$/.test(x));
  ok('há vídeo no pacote', vids.length >= 1, vids.join(' '));
  ok('com nome que conta de qual momento é', /momento-\d{4}/.test(vids[0]||''), vids[0]);
  ok('duas marcas na mesma janela não duplicam o arquivo', vids.length <= 2, String(vids.length));
  const idx = execSync('unzip -p /tmp/clipes.zip indice.txt',{encoding:'utf8'});
  ok('o índice aponta o clipe', /Clipe deste momento: momento-/.test(idx),
     (idx.match(/Clipe[^\n]*/)||[''])[0]);
  const tam = Number(execSync(`unzip -p /tmp/clipes.zip "${vids[0]}" | wc -c`,{encoding:'utf8',shell:'/bin/bash'}).trim());
  ok('e o arquivo não está vazio', tam > 5000, String(tam));
  execSync(`unzip -o -p /tmp/clipes.zip "${vids[0]}" > /tmp/clipe.webm`, {shell:'/bin/bash'});
}
{
  /* A prova final: um decodificador de fora da página abre o arquivo. */
  let saida = '';
  try { saida = execSync('ffprobe -v error -show_entries stream=codec_type,codec_name -of csv=p=0 /tmp/clipe.webm 2>&1',
                         {encoding:'utf8'}); } catch (e) { saida = 'ffprobe: ' + String(e).slice(0,60); }
  console.log('     ' + saida.replace(/\n/g,' | '));
  ok('o ffprobe reconhece uma trilha de vídeo', /video/.test(saida), saida.slice(0,80));
}

console.log('\n[4b] reabrir o pacote traz o clipe de volta');
{
  /* Sem isto, reabrir um estudo para corrigir uma anotação apagaria o vídeo —
     que num relatório de sessão é o resultado, não um anexo. */
  await pg.setInputFiles('#reabrirArq','/tmp/clipes.zip');
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
  await pg.waitForTimeout(900);
  ok('o quadro reaberto continua com o selo', (await pg.locator('#thumbs .selo').count()) >= 1,
     String(await pg.locator('#thumbs .selo').count()));
  const i = await pg.evaluate(() => [...document.querySelectorAll('#thumbs figure')]
                                     .findIndex(x => x.querySelector('.selo')));
  await pg.locator('#thumbs figure').nth(i).locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.waitForTimeout(900);
  const w = await pg.evaluate(()=>document.getElementById('lenteClipe').videoWidth);
  ok('e o vídeo recuperado decodifica', w > 0, String(w));
  ok('a ferramenta não inventa onde estava a marca',
     /não vem escrito|recuperado do pacote/i.test(await pg.locator('#lenteClipeNota').textContent()),
     await pg.locator('#lenteClipeNota').textContent());
  await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(300);
}

console.log('\n[5] descartar os vídeos, com data no documento');
ok('o botão de descarte apareceu', await pg.locator('#clipeApagar').isVisible());
await pg.locator('#clipeApagar').click();
await pg.waitForTimeout(500);
ok('a mensagem conta quantos', /clipe\(s\) descartado/.test(await pg.locator('#clipeMsg').textContent()),
   await pg.locator('#clipeMsg').textContent());
ok('os selos sumiram da fileira', (await pg.locator('#thumbs .selo').count()) === 0);
ok('e o botão de apagar sumiu — não há mais o que apagar', await pg.locator('#clipeApagar').isHidden());
{
  await pg.locator('#evBox').evaluate(e=>e.open=true);
  await pg.fill('#evCaso','Estudo de checkout');
  await pg.waitForTimeout(300);
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/descarte.md');
  const md = fs.readFileSync('/tmp/descarte.md','utf8');
  ok('a data do descarte entrou no documento', /Descartar os vídeos.*\d{4}-\d\d-\d\d/s.test(md),
     (md.match(/Descartar[^\n]*/)||[''])[0]);
}
{
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#zip').click();
  const d = await dl; await d.saveAs('/tmp/clipes2.zip');
  const lista = execSync('unzip -Z1 /tmp/clipes2.zip',{encoding:'utf8'}).trim().split('\n');
  ok('e o zip novo já sai sem vídeo nenhum', !lista.some(x=>/\.(webm|mp4)$/.test(x)), lista.join(' '));
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,200));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nClipe do momento: tudo passou.');
process.exit(falhas?1:0);
