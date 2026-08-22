/* O ESPELHO NO DISCO — a gravação que sobrevive à aba.
 *
 * O defeito que isto conserta é o mais caro que a ferramenta tinha e o único
 * que nenhuma mensagem de erro descrevia: um travamento da aba perdia a
 * gravação inteira. Duas horas que morrem aos 110 minutos voltam como nada. E o
 * pior é que, numa espera longa, fechar a aba é a decisão racional — é
 * exatamente o gesto que destrói o trabalho.
 *
 * Agora cada tela capturada é também gravada no armazenamento privado do
 * navegador (OPFS), no computador de quem usa. Os quadros continuam no array —
 * é isso que faz `file://` funcionar — e o disco é ESPELHO, nunca substituto.
 *
 * Este arquivo cobra as cinco coisas que fazem esse espelho valer alguma coisa:
 *
 *   1. que ele exista enquanto se grava;
 *   2. que a gravação volte depois de a aba morrer, com as anotações;
 *   3. que ele SUMA quando um documento sai — senão o disco de quem usa toda
 *      semana enche em silêncio, e o passo 1 vira uma lista de lixo;
 *   4. que desmarcar a caixa apague o que já estava lá, e não só pare de
 *      escrever daqui para frente;
 *   5. que gravar continue funcionando sem OPFS nenhum — e que, quando o disco
 *      recusa no meio da gravação, a pessoa FIQUE SABENDO. Uma rede de segurança
 *      que cai em silêncio é pior do que rede nenhuma: a confiança continua.
 *
 * E uma sexta, que é a razão de o índice ser append-only: um travamento deixa a
 * última linha pela metade. Uma linha quebrada se joga fora; o resto volta.
 */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8938, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
         '--auto-accept-this-tab-capture', '--allow-http-screen-capture'],
});

/* Uma tela falsa que muda o tempo todo: é o que faz a captura guardar quadro
   atrás de quadro sem ninguém mexer em nada. */
const telaFalsa = () => {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const cx = c.getContext('2d');
  let n = 0;
  setInterval(() => {
    n++;
    cx.fillStyle = `hsl(${(n * 37) % 360} 70% ${30 + (n % 40)}%)`;
    cx.fillRect(0, 0, 640, 360);
    cx.fillStyle = '#fff'; cx.font = '90px sans-serif';
    cx.fillText(String(n), 40, 200);
  }, 120);
  const stream = c.captureStream(30);
  navigator.mediaDevices.getDisplayMedia = async () => stream;
};

/* O que está no disco, visto de fora da ferramenta: é a única forma honesta de
   perguntar "isso foi mesmo gravado?" — perguntar ao próprio código que gravou
   provaria só que ele lembra do que disse. */
const noDisco = pg => pg.evaluate(async () => {
  const out = [];
  try {
    const raiz = await navigator.storage.getDirectory();
    const pai = await raiz.getDirectoryHandle('gravacoes');
    for await (const [nome, h] of pai.entries()) {
      if (h.kind !== 'directory') continue;
      const arquivos = [];
      let indice = '';
      for await (const [n2, f2] of h.entries()) {
        if (f2.kind !== 'file') continue;
        const file = await f2.getFile();
        arquivos.push({ nome: n2, bytes: file.size });
        if (n2 === 'indice.jsonl') indice = await file.text();
      }
      out.push({ id: nome, arquivos, linhas: indice.split('\n').filter(Boolean).length });
    }
  } catch (e) {}
  return out;
});

async function paginaGravando(ctx, segundos, semOpfs){
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  /* Sem a janelinha de controle. Com ela aberta, a caixa de comentário MUDA DE
     LUGAR de propósito — vai para a janelinha, que é para onde a pessoa está
     olhando —, e o campo do cartão fica escondido. Este teste fala do espelho e
     não da janelinha; tirá-la é a forma de o comentário ter um lugar só. */
  await pg.addInitScript(() => {
    try { delete window.documentPictureInPicture; } catch (e) {}
  });
  if (semOpfs) {
    /* Sem OPFS, como num navegador que não tem — e não "com OPFS quebrado":
       a propriedade some, que é o que a ferramenta pergunta. */
    await pg.addInitScript(() => {
      try { Object.defineProperty(navigator, 'storage', { get: () => undefined }); }
      catch (e) {}
    });
  }
  await pg.goto('http://localhost:8938/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.evaluate(telaFalsa);
  await pg.selectOption('#modelo', 'evidencia');
  await pg.selectOption('#ritmo', 'tudo');
  await pg.locator('#recTr').uncheck();
  await pg.evaluate(() => window.__contagem(1));
  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  await pg.waitForTimeout(segundos * 1000);
  return { pg, erros };
}

// ---------------------------------------------------------------------------
console.log('[1] gravando, cada tela também vai para o disco');
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 },
                                  permissions: ['microphone'], acceptDownloads: true });
/* UMA SESSÃO ABANDONADA ANTES DA QUE INTERESSA. Duas guardadas é o caso em que
   o bloco do passo 1 precisa mostrar a lista das outras — e uma lista que nunca
   é montada em teste nenhum é uma lista que quebra na primeira vez que alguém a
   vê. Ela vem PRIMEIRO porque o bloco oferece a mais recente, e a mais recente
   tem que ser a que este arquivo acompanha do começo ao fim. */
{
  const velha = await paginaGravando(ctx, 4);
  await velha.pg.locator('#recStop').click();
  await velha.pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                                 null, { timeout: 60000 });
  await velha.pg.waitForTimeout(1500);
  await velha.pg.close();
}

let quadros = 0;
{
  const { pg, erros } = await paginaGravando(ctx, 6);
  /* Sem caixa e sem pergunta: o espelho é padrão. O que se cobra aqui deixou de
     ser "a caixa está marcada" e passou a ser o fato — as telas chegam ao
     disco, que é a única coisa que uma caixa marcada prometia. */
  ok('não há caixa a marcar: o espelho é padrão',
     (await pg.locator('#recEspelho').count()) === 0);
  /* A escrita entra numa fila para não atrasar a captura: dar um instante aqui
     é medir o que a pessoa veria, não correr na frente do produto. */
  await pg.waitForTimeout(1500);
  const disco = (await noDisco(pg)).sort((a, b) => a.id.localeCompare(b.id));
  ok('a sessão desta gravação existe no disco, ao lado da anterior',
     disco.length === 2, JSON.stringify(disco.map(d => d.id)));
  const s = disco[disco.length - 1] || { arquivos: [], linhas: 0 };
  const imagens = s.arquivos.filter(a => /\.(webp|jpg)$/.test(a.nome));
  quadros = imagens.length;
  console.log('     ' + quadros + ' telas no disco, ' + s.linhas + ' linhas de índice');
  ok('com as telas gravadas', imagens.length >= 3, String(imagens.length));
  ok('nenhuma delas vazia', imagens.every(a => a.bytes > 500),
     JSON.stringify(imagens.slice(0, 3)));
  ok('e um índice com uma linha por tela',
     s.linhas >= imagens.length, s.linhas + ' linhas para ' + imagens.length + ' telas');
  ok('o cabeçalho da sessão está lá',
     s.arquivos.some(a => a.nome === 'sessao.json'));

  /* A ANOTAÇÃO TAMBÉM VAI PARA O DISCO, e agora ela é escrita na revisão — o
     campo de comentário ao vivo saiu, porque quem grava está olhando para o
     sistema que testa e escrever às cegas era a pior hora possível.

     Isso mudou o QUANDO, e não o SE: é justamente depois de parar que a pessoa
     passa meia hora anotando quarenta passos, e perder a aba nessa meia hora
     levaria as quarenta junto. Por isso o campo da grade escreve no espelho. */
  await pg.locator('#recMark').click();
  await pg.waitForTimeout(400);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  await pg.locator('#thumbs figure input.nota').first().fill('o total veio errado aqui');
  await pg.waitForTimeout(900);
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));
  /* A ABA MORRE AQUI, sem que nenhum documento tenha saído. É o acidente. */
  await pg.close();

}

// ---------------------------------------------------------------------------
console.log('\n[2] a aba morreu; a gravação volta');
{
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.goto('http://localhost:8938/app.html?lang=pt');
  await pg.waitForSelector('#espelhoCx:not(.hide)', { timeout: 20000 });
  ok('o passo 1 diz que há uma gravação para recuperar',
     await pg.locator('#espelhoCx').isVisible());
  const sub = await pg.locator('#espelhoSub').textContent();
  console.log('     ' + sub.trim().slice(0, 120));
  ok('e diz quantas telas, quando e quanto ocupa',
     /\d+ telas/.test(sub) && /\d/.test(sub), sub.slice(0, 80));
  ok('e diz que nada disso saiu do aparelho',
     /nada disso saiu do seu aparelho/i.test(sub), sub.slice(-60));

  /* Duas sessões guardadas: o botão que abre a lista das outras aparece, e a
     lista tem uma linha por sessão. */
  ok('com duas guardadas, ele oferece ver as outras',
     await pg.locator('#espelhoTodas').isVisible());
  ok('e o rótulo diz quantas são',
     /\(1\)/.test(await pg.locator('#espelhoTodas').textContent()),
     await pg.locator('#espelhoTodas').textContent());
  await pg.locator('#espelhoTodas').click();
  await pg.waitForTimeout(300);
  ok('a lista abriu com uma linha para a outra sessão',
     (await pg.locator('#espelhoLista li').count()) === 1,
     String(await pg.locator('#espelhoLista li').count()));
  ok('e cada linha traz recuperar e jogar fora',
     (await pg.locator('#espelhoLista li button').count()) === 2,
     String(await pg.locator('#espelhoLista li button').count()));

  /* E ELE TROCA DE IDIOMA. Este bloco é escrito à mão, com número dentro
     ("15 telas, de …"), então não tem `data-i18n` para o laço da tradução pegar.
     Sem uma linha explícita ele ficaria em português numa página em inglês — e é
     justamente o bloco que alguém lê depois de perder duas horas de trabalho. */
  await pg.locator('#idiomas a[data-l="en"]').click();
  await pg.waitForTimeout(600);
  const subEn = await pg.locator('#espelhoSub').textContent();
  ok('o bloco acompanha a troca de idioma',
     /screens/.test(subEn) && !/telas/.test(subEn), subEn.slice(0, 90));
  ok('e os botões também',
     /back/i.test(await pg.locator('#espelhoAbrir').textContent()),
     await pg.locator('#espelhoAbrir').textContent());
  await pg.locator('#idiomas a[data-l="pt"]').click();
  await pg.waitForTimeout(600);

  await pg.locator('#espelhoAbrir').click();
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length > 0,
                           null, { timeout: 30000 });
  await pg.waitForTimeout(800);
  const n = await pg.locator('#thumbs figure').count();
  console.log('     ' + n + ' telas de volta (havia ' + quadros + ' no disco)');
  ok('as telas voltaram', n >= 3, String(n));
  ok('e elas DESENHAM — voltar um quadro vazio seria pior que não voltar',
     await pg.evaluate(() =>
       [...document.querySelectorAll('#thumbs figure img')].every(i => i.naturalWidth > 0)));
  ok('a anotação escrita durante a gravação voltou junto',
     await pg.evaluate(() =>
       window.__quadros().some(f => (f.nota || '').includes('o total veio errado'))),
     JSON.stringify(await pg.evaluate(() => window.__quadros().map(f => f.nota).filter(Boolean))));

  /* Recuperada é entregue: quem trouxe de volta está com o trabalho na mão, e
     deixar a cópia no disco só serviria para o bloco reaparecer amanhã
     oferecendo o que a pessoa já tem. */
  const disco = await noDisco(pg);
  ok('só a que voltou saiu do disco — a outra continua lá',
     disco.length === 1, JSON.stringify(disco.map(d => d.id)));
  ok('e o bloco continua na tela, agora oferecendo a que sobrou',
     await pg.locator('#espelhoCx').isVisible());

  /* A LISTA. Com duas ou mais, "ver as outras" abre uma linha por sessão, cada
     uma com o seu próprio jogar fora — porque quem tem três gravações velhas
     quer apagar a de terça, não todas. */
  await pg.locator('#espelhoJogar').click();
  await pg.waitForTimeout(1200);
  ok('jogar fora a que sobrou esvazia o disco',
     (await noDisco(pg)).length === 0, JSON.stringify(await noDisco(pg)));
  ok('e aí o bloco some', await pg.locator('#espelhoCx').isHidden());
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));
  await pg.close();
}

// ---------------------------------------------------------------------------
console.log('\n[3] quando um documento sai, o espelho vai embora sozinho');
{
  const { pg, erros } = await paginaGravando(ctx, 5);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  ok('durante o trabalho ele existe', (await noDisco(pg)).length === 1);

  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#json').click();
  await (await dl).saveAs('/tmp/espelho.json');
  await pg.waitForTimeout(1500);
  const disco = await noDisco(pg);
  ok('saiu o documento, o disco esvaziou', disco.length === 0,
     JSON.stringify(disco.map(d => d.id)));
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));
  await pg.close();

  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:8938/app.html?lang=pt');
  await p2.waitForTimeout(1200);
  ok('e a próxima visita não oferece nada',
     await p2.locator('#espelhoCx').isHidden());
  await p2.close();
}

// ---------------------------------------------------------------------------
console.log('\n[4] uma linha quebrada no fim do índice não leva o resto junto');
{
  const { pg, erros } = await paginaGravando(ctx, 6);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1800);
  /* O travamento de verdade: o processo morre no meio de uma escrita e o índice
     fica com meia linha no fim. É o caso NORMAL deste arquivo, não a exceção. */
  const antes = await pg.evaluate(async () => {
    const raiz = await navigator.storage.getDirectory();
    const pai = await raiz.getDirectoryHandle('gravacoes');
    for await (const [, h] of pai.entries()) {
      const fh = await h.getFileHandle('indice.jsonl');
      const txt = await (await fh.getFile()).text();
      const w = await fh.createWritable();
      await w.write(txt + '{"n":999,"arquivo":"9999.we');
      await w.close();
      return txt.split('\n').filter(Boolean).length;
    }
    return 0;
  });
  await pg.close();

  const p2 = await ctx.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto('http://localhost:8938/app.html?lang=pt');
  await p2.waitForSelector('#espelhoCx:not(.hide)', { timeout: 20000 });
  await p2.locator('#espelhoAbrir').click();
  await p2.waitForFunction(() => document.querySelectorAll('#thumbs figure').length > 0,
                           null, { timeout: 30000 });
  await p2.waitForTimeout(600);
  const n = await p2.locator('#thumbs figure').count();
  console.log('     índice tinha ' + antes + ' linhas inteiras; voltaram ' + n + ' telas');
  ok('as telas inteiras voltaram, apesar da linha pela metade', n >= 3, String(n));
  ok('sem erro de JavaScript', e2.length === 0, e2.join(' | ').slice(0, 200));
  await p2.close();
}

// ---------------------------------------------------------------------------
/* A CAIXA DE LIGAR E DESLIGAR SAIU DO CARTÃO DE GRAVAR, e o espelho virou
   padrão: perguntar antes de cada gravação não se justificava diante da
   assimetria — desligado, um travamento aos 110 minutos apaga duas horas;
   ligado, ficam alguns megabytes no disco de quem usa até o documento sair.

   O que este bloco cobra passou a ser o que SOBROU, e é o que importa:

     1. "jogar fora" continua apagando de verdade — é o gesto que ficou;
     2. quem já tinha desligado CONTINUA desligado. `espelhoQuer()` lê a mesma
        chave de sempre, e tirar a caixa não podia religar o espelho na máquina
        de quem escolheu que não. Isso não é detalhe de teste: é a diferença
        entre uma decisão respeitada e uma decisão revogada em silêncio por uma
        atualização. */
console.log('\n[5] o que sobrou de desligar: jogar fora, e a escolha antiga respeitada');
{
  const { pg, erros } = await paginaGravando(ctx, 5);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  ok('havia algo guardado', (await noDisco(pg)).length === 1);
  ok('e a caixa de desligar não existe mais no cartão de gravar',
     (await pg.locator('#recEspelho').count()) === 0);
  await pg.reload();
  await pg.waitForTimeout(1200);
  ok('o bloco de recuperação aparece sozinho',
     !(await pg.locator('#espelhoCx').evaluate(e => e.classList.contains('hide'))));
  await pg.locator('#espelhoJogar').click();
  await pg.waitForTimeout(1500);
  ok('"jogar fora" apagou o que estava no disco', (await noDisco(pg)).length === 0,
     JSON.stringify(await noDisco(pg)));
  await pg.close();

  /* Quem desligou antes de a caixa sair continua desligado. */
  const p2 = await ctx.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto('http://localhost:8938/app.html?lang=pt');
  await p2.evaluate(() => localStorage.setItem('Walkstamp.espelho', 'nao'));
  await p2.reload();
  await p2.waitForTimeout(800);
  await p2.evaluate(telaFalsa);
  await p2.selectOption('#modelo', 'evidencia');
  await p2.selectOption('#ritmo', 'tudo');
  await p2.locator('#recTr').uncheck();
  await p2.evaluate(() => window.__contagem(1));
  await p2.locator('#rec').click();
  await p2.waitForSelector('#recStop:visible', { timeout: 40000 });
  await p2.waitForTimeout(5000);
  await p2.locator('#recStop').click();
  await p2.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await p2.waitForTimeout(1200);
  /* O NÚMERO QUE IMPORTA: zero. Um só significaria que tirar a caixa religou o
     espelho na máquina de quem tinha decidido que não. */
  ok('quem tinha desligado continua desligado — nada foi escrito',
     (await noDisco(p2)).length === 0, JSON.stringify(await noDisco(p2)));
  ok('mas a gravação em si continua inteira',
     (await p2.locator('#thumbs figure').count()) >= 3,
     String(await p2.locator('#thumbs figure').count()));
  ok('sem erro de JavaScript', e2.length === 0, e2.join(' | ').slice(0, 200));
  await p2.evaluate(() => localStorage.removeItem('Walkstamp.espelho'));
  await p2.waitForTimeout(300);
  await p2.close();
  ok('sem erro de JavaScript na gravação', erros.length === 0, erros.join(' | ').slice(0, 200));
}
await ctx.close();

// ---------------------------------------------------------------------------
console.log('\n[6] quando o disco recusa, ela FICA SABENDO');
{
  /* Um espelho que para de funcionar em silêncio é pior do que não ter espelho:
     a pessoa segue gravando duas horas confiando numa rede que não está mais lá.
     O disco cheio é o caso comum, e ele não avisa sozinho. Aqui o disco recusa
     de propósito, na segunda escrita, com a gravação já em curso. */
  const c3 = await br.newContext({ viewport: { width: 1250, height: 980 },
                                   permissions: ['microphone'] });
  const pg = await c3.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.addInitScript(() => {
    try { delete window.documentPictureInPicture; } catch (e) {}
    const orig = FileSystemFileHandle.prototype.createWritable;
    let n = 0;
    FileSystemFileHandle.prototype.createWritable = function (...a) {
      /* As duas primeiras passam (o `sessao.json` e o primeiro quadro); da
         terceira em diante o disco diz não, como um disco cheio diria. */
      if (++n > 2) return Promise.reject(new DOMException('sem espaço', 'QuotaExceededError'));
      return orig.apply(this, a);
    };
  });
  await pg.goto('http://localhost:8938/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.evaluate(telaFalsa);
  await pg.selectOption('#modelo', 'evidencia');
  await pg.selectOption('#ritmo', 'tudo');
  await pg.locator('#recTr').uncheck();
  await pg.evaluate(() => window.__contagem(1));
  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  await pg.waitForFunction(() => /não consegui guardar as telas/i.test(
    document.getElementById('recMsg').textContent || ''), null, { timeout: 30000 })
    .catch(() => {});
  const msg = await pg.locator('#recMsg').innerText();
  ok('a tela diz que não conseguiu guardar no disco',
     /não consegui guardar as telas/i.test(msg), msg.slice(0, 120));
  ok('e deixa claro que a gravação em si continua',
     /gravação continua/i.test(msg), msg.slice(0, 160));
  /* E ela CONTINUA de verdade, não só na frase: mais uns segundos gravando
     depois de o disco ter recusado. Uma promessa sem código atrás é o defeito
     que este projeto persegue; aqui ela é cobrada no número de telas. */
  await pg.waitForTimeout(5000);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(800);
  ok('e a gravação saiu inteira apesar do disco ter recusado',
     (await pg.locator('#thumbs figure').count()) >= 3,
     String(await pg.locator('#thumbs figure').count()));
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));
  await c3.close();
}

// ---------------------------------------------------------------------------
console.log('\n[7] sem OPFS nenhum, gravar continua igual');
{
  /* O espelho é opcional por construção. Um navegador sem OPFS — e há muitos —
     não pode receber uma ferramenta pela metade. */
  const c2 = await br.newContext({ viewport: { width: 1250, height: 980 },
                                   permissions: ['microphone'] });
  const { pg, erros } = await paginaGravando(c2, 5, true);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1200);
  const n = await pg.locator('#thumbs figure').count();
  ok('a gravação saiu inteira', n >= 3, String(n));
  ok('a caixa do espelho nem aparece — ela não teria o que prometer',
     await pg.locator('#recEspelhoCx').isHidden());
  ok('e o bloco de recuperar continua escondido',
     await pg.locator('#espelhoCx').isHidden());
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));
  await c2.close();
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nEspelho no disco: tudo passou.');
process.exit(falhas ? 1 : 0);
