/* Tradução: o tradutor embutido do navegador (falsificado aqui, porque o
   Chromium do teste não traz o modelo) e a rota do Whisper para inglês. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html=fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}
  // o service worker precisa chegar como JavaScript; servi-lo como HTML faz o
  // navegador recusar o registro — e é exatamente o erro que apareceria em
  // produção se a hospedagem errasse o tipo do arquivo
  if(q.url.split('?')[0]==='/sw.js'){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':'text/html'});r.end(html);});
await new Promise(r=>srv.listen(8915,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};

console.log('\n[1] sem o tradutor embutido, a linha some e explica a alternativa');
{
  // o Chromium do teste já traz a superfície da API; aqui ela é removida para
  // simular Firefox/Safari/celular, que é o caso que a linha precisa cobrir
  const ctx0=await br.newContext();
  await ctx0.addInitScript(() => { try { delete window.Translator; } catch(e) { window.Translator = undefined; } });
  const pg=await ctx0.newPage();
  await pg.goto('http://localhost:8915/app.html?lang=pt');
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  /* O texto mora na revisão, e a revisão só abre com material — como no uso
     real, onde ninguém cola uma transcrição sem ter gravado nada. */
  await pg.setInputFiles('#file','/tmp/amostra.webm');
  await pg.waitForTimeout(2400);
  await pg.fill('#tr','WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nAbri a transacao e informei o fornecedor');
  await pg.dispatchEvent('#tr','input');
  await pg.waitForTimeout(300);
  ok('a linha de tradução fica escondida', await pg.locator('#tradRow').isHidden());
  ok('e o texto explica que a tradução fica para depois', /tradução fica para depois|traduzir onde quiser/.test(await pg.locator('#tradMsg').textContent()), (await pg.locator('#tradMsg').textContent()).slice(0,70));
  ok('não há mais escolha de idioma ANTES de transcrever', await pg.locator('#trEn').count()===0);
  await pg.close(); await ctx0.close();
}

console.log('\n[2] com o tradutor embutido');
{
  const ctx=await br.newContext();
  // um tradutor de mentira com a mesma forma da API do Chrome
  await ctx.addInitScript(() => {
    window.Translator = {
      async availability({sourceLanguage, targetLanguage}) {
        return (sourceLanguage === 'pt' && targetLanguage === 'de') ? 'unavailable' : 'downloadable';
      },
      async create({sourceLanguage, targetLanguage, monitor}) {
        if (monitor) {
          const alvo = new EventTarget();
          monitor(alvo);
          alvo.dispatchEvent(Object.assign(new Event('downloadprogress'), {loaded: 0.5}));
        }
        return {
          translate: async txt => `[${targetLanguage}] ` + txt,
          destroy(){}
        };
      }
    };
  });
  const pg=await ctx.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  await pg.goto('http://localhost:8915/app.html?lang=pt');
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.setInputFiles('#file','/tmp/amostra.webm');
  await pg.waitForTimeout(2400);
  await pg.fill('#tr','WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nAbri a transacao\n\n00:00:03.100 --> 00:00:06.000\nSalvei sem centro de custo');
  await pg.dispatchEvent('#tr','input');
  await pg.waitForTimeout(300);
  ok('a linha de tradução aparece', await pg.locator('#tradRow').isVisible());

  await pg.selectOption('#mode','count'); await pg.fill('#count','2');
  await pg.click('#extract');
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
  await pg.locator('#thumbs input.nota').first().fill('Espera: o sistema recusa');
  await pg.waitForTimeout(200);

  await pg.selectOption('#tradPara','en');
  await pg.click('#trad');
  await pg.waitForFunction(()=>/traduzidos|não consegui|Não há/.test(document.getElementById('tradMsg').textContent), null, {timeout:20000});
  const msg = await pg.locator('#tradMsg').textContent();
  ok('a mensagem conta o resultado', /3 trechos traduzidos para EN/.test(msg), msg.slice(0,60));
  const tr = await pg.locator('#tr').inputValue();
  ok('as falas foram traduzidas', /\[en\] Abri a transacao/.test(tr), tr.split('\n')[3]);
  ok('os tempos foram preservados', tr.includes('00:00:03.100'));
  ok('a anotação também foi traduzida',
     /^\[en\] Espera/.test(await pg.locator('#thumbs input.nota').first().inputValue()));

  console.log('\n[3] par indisponível é dito, não engolido');
  await pg.selectOption('#tradPara','de');
  await pg.click('#trad');
  await pg.waitForTimeout(600);
  ok('avisa que o par não existe', /par pt → de/.test(await pg.locator('#tradMsg').textContent()),
     await pg.locator('#tradMsg').textContent());

  console.log('\n[4] mesmo idioma não faz nada');
  await pg.selectOption('#lang','en');
  await pg.selectOption('#tradPara','en');
  await pg.click('#trad');
  await pg.waitForTimeout(400);
  ok('avisa que origem e destino são iguais', /o mesmo/.test(await pg.locator('#tradMsg').textContent()));

  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,200));
  await pg.close(); await ctx.close();
}

await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nTradução: tudo passou.');
process.exit(falhas?1:0);
