import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
const html = fs.readFileSync('/root/walkstamp/public/app.html','utf8');
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8994,r));
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await br.newContext({viewport:{width:1100,height:900}});
const pg=await ctx.newPage();
await pg.addInitScript(()=>{
  function tela(){const c=document.createElement('canvas');c.width=1280;c.height=720;const g=c.getContext('2d');let i=0;
    setInterval(()=>{i++;g.fillStyle=['#123','#eee','#567','#fa0','#0af'][i%5];g.fillRect(0,0,1280,720)},700);return c.captureStream(12)}
  navigator.mediaDevices.getDisplayMedia=async()=>tela();
  navigator.mediaDevices.getUserMedia=async()=>{throw new Error('sem mic')};
});
await pg.goto('http://localhost:8994/app.html?lang=pt');
await pg.selectOption('#modelo','ia');
await pg.locator('#recTr').uncheck();
await pg.evaluate(()=>window.__contagem(1));
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible',{timeout:40000});
await pg.waitForTimeout(3000);
const jn = ctx.pages().find(p=>p!==pg);
if (jn) {
  await jn.locator('#marcar').click();
  await jn.waitForTimeout(500);
  await jn.screenshot({ path:'/tmp/pip-marcou.png' });
  await jn.waitForTimeout(2800);
  await jn.locator('#maisTela').click();
  await jn.waitForTimeout(500);
  await jn.screenshot({ path:'/tmp/pip-tela.png' });
}
await pg.locator('#recStop').click().catch(()=>{});
await br.close(); srv.close();
console.log('feito');
