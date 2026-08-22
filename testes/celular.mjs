/* O QUE A FERRAMENTA DIZ NUM CELULAR.
 *
 * Nenhum navegador de celular ou tablet tem `getDisplayMedia` — nem Chrome nem
 * Safari, e no iOS isso é estrutural, porque todos rodam WebKit. O caniuse
 * lista Safari iOS, Chrome Android, Firefox Android e Samsung Internet todos
 * como "não suportado".
 *
 * Até aqui o produto lidava com isso SUMINDO: o cartão "Gravar a tela agora"
 * desaparecia e nada tomava o lugar dele. A mensagem existia — "use Chrome ou
 * Edge no computador" — mas só disparava no clique de um botão que, justamente
 * ali, não estava mais na tela. Quem abria no telefone via um passo 1 pela
 * metade e não tinha como saber se o produto não fazia ou se o aparelho não
 * deixava. E o caminho que FUNCIONA no telefone — o gravador de tela do próprio
 * aparelho, que grava tela e microfone juntos — não era sugerido em canto
 * nenhum.
 *
 * Este teste prova as duas metades: que a explicação aparece onde o cartão
 * sumiu, e que ela NÃO aparece onde a gravação funciona. A segunda importa
 * tanto quanto a primeira — um aviso de "não dá" num computador que dá é pior
 * do que aviso nenhum.
 */
import { chromium, devices } from 'playwright';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const APP = `file://${RAIZ_WS}/public/app.html`;
const IDIOMAS = ['pt', 'en', 'es', 'de', 'fr'];

const br = await chromium.launch({ executablePath: CHROME_WS });

/** Um celular de verdade: sem captura de tela e sem placa de vídeo. */
async function celular(perfil, lang) {
  const ctx = await br.newContext({ ...devices[perfil] });
  const pg = await ctx.newPage();
  await pg.addInitScript(() => {
    try { delete MediaDevices.prototype.getDisplayMedia; } catch {}
    try { Object.defineProperty(navigator, 'gpu', { get: () => undefined }); } catch {}
  });
  await pg.goto(`${APP}?lang=${lang}`, { waitUntil: 'load' });
  await pg.waitForTimeout(900);
  return { ctx, pg };
}

const visivel = (pg, id) => pg.evaluate((i) => {
  const e = document.getElementById(i);
  return !!e && !e.classList.contains('hide');
}, id);

console.log('[1] no celular, o lugar do cartão não fica vazio');
{
  for (const perfil of ['iPhone 13', 'Pixel 5']) {
    const { ctx, pg } = await celular(perfil, 'pt');
    ok(`${perfil}: o cartão de gravar sumiu`, !(await visivel(pg, 'viaRec')));
    ok(`${perfil}: e a explicação tomou o lugar`, await visivel(pg, 'viaSemTela'));
    ok(`${perfil}: o caminho do arquivo continua de pé`,
       await pg.locator('#drop').isVisible());
    const t = await pg.locator('#viaSemTela').innerText();
    ok(`${perfil}: ela diz que NENHUM navegador de celular grava`,
       /nenhum permite/i.test(t), t.slice(0, 120));
    ok(`${perfil}: e aponta o gravador do próprio aparelho`,
       /Central de Controle/.test(t) && /atalhos r[áa]pidos/i.test(t));
    ok(`${perfil}: e para onde levar o arquivo depois`, /Usar um arquivo/.test(t));
    ok(`${perfil}: avisa que a transcrição vai devagar`, /devagar/.test(t));
    await ctx.close();
  }
}

console.log('\n[2] o texto existe nos cinco idiomas — nenhum cai em português por engano');
{
  /* A pergunta que este bloco faz de verdade: alguém acrescentou a chave em
     português e esqueceu dos outros quatro? A resposta é o texto SER DIFERENTE
     do português em cada um. Conferir só que "não está vazio" deixaria passar
     exatamente o esquecimento que se quer pegar. */
  const porIdioma = {};
  for (const L of IDIOMAS) {
    const { ctx, pg } = await celular('Pixel 5', L);
    porIdioma[L] = (await pg.locator('#viaSemTela').innerText()).trim();
    ok(`${L}: a explicação aparece e tem texto`, porIdioma[L].length > 120,
       String(porIdioma[L].length));
    await ctx.close();
  }
  for (const L of IDIOMAS.filter((x) => x !== 'pt')) {
    ok(`${L}: está traduzido, não é o português repetido`,
       porIdioma[L] !== porIdioma.pt, porIdioma[L].slice(0, 70));
  }
  ok('en cita o Control Centre do iPhone', /Control Centre|Control Center/.test(porIdioma.en));
  ok('de cita o Kontrollzentrum', /Kontrollzentrum/.test(porIdioma.de));
  ok('fr cita o Centre de contrôle', /Centre de contr/.test(porIdioma.fr));
  ok('es cita o Centro de Control', /Centro de Control/.test(porIdioma.es));
}

console.log('\n[3] onde a gravação FUNCIONA, o aviso não aparece');
{
  /* Um "não dá neste aparelho" num computador que dá é pior do que aviso
     nenhum: manda a pessoa embora do caminho que ela veio usar. */
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  await pg.goto(APP, { waitUntil: 'load' });
  await pg.waitForTimeout(900);
  ok('no computador o cartão de gravar está lá', await visivel(pg, 'viaRec'));
  ok('e a explicação de celular fica escondida', !(await visivel(pg, 'viaSemTela')));
  const t = await pg.locator('body').innerText();
  ok('nada de "Central de Controle" na tela do computador', !/Central de Controle/.test(t));
  await ctx.close();
}

console.log('\n[4] o cartão mora onde o de gravar moraria — não num aviso solto no topo');
{
  const { ctx, pg } = await celular('iPhone 13', 'pt');
  const dentro = await pg.evaluate(() => {
    const e = document.getElementById('viaSemTela');
    return { paiCaminhos: !!e.closest('.caminhos'),
             primeiro: e.parentElement.firstElementChild === e,
             temVia: e.classList.contains('via') };
  });
  ok('está dentro de .caminhos', dentro.paiCaminhos);
  ok('é o primeiro dos caminhos', dentro.primeiro);
  ok('e usa a mesma casca de cartão dos outros', dentro.temVia);
  /* Sem borda de destaque: destacar o caminho que não existe é apontar para a
     parede. O `#viaRec` tem `border:2px solid var(--accent)`; este não. */
  const borda = await pg.evaluate(() =>
    getComputedStyle(document.getElementById('viaSemTela')).borderTopWidth);
  ok('sem a borda grossa de destaque', borda !== '2px', borda);
  await ctx.close();
}

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
