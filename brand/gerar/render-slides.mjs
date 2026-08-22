import { chromium } from 'playwright';
const br = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const pg = await br.newPage({viewport:{width:960,height:540}, deviceScaleFactor:2});
for (const L of ['pt','en','es'])
  for (let i=1;i<=5;i++) {
    await pg.goto(`file:///tmp/slides/${L}-${i}.html`);
    await pg.waitForTimeout(160);
    await pg.screenshot({path:`/tmp/slides/${L}-${i}.png`});
  }
console.log('15 slides renderizados');
await br.close();
