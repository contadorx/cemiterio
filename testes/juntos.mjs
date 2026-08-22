/* Passos 2 e 3 viraram um só, opcional, com três botões — e o texto da fala
   desceu para a revisão. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8917, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const ctx = await br.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 950 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8917/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(400);

console.log('[1] são três cartões, numerados 1 a 3');
{
  /* ERAM QUATRO, e o quarto era o prompt para IA.
     O build 2 o tirou da numeração — a numeração dizia que entregar o vídeo a
     uma máquina é um quarto da tarefa, e para a maioria não é tarefa nenhuma —
     e atualizou `conclusao.mjs`, que passou a cobrar "sobraram três passos" e
     "nenhum deles é o 4". Este arquivo ficou cobrando o contrário.
     Duas réguas afirmando o oposto sobre o mesmo fato é pior do que uma régua
     desatualizada: a suíte passa a guardar duas verdades, e uma delas reprova
     em toda execução até alguém aprender a ignorá-la. O cartão do prompt
     continua na página — ele perdeu o número, não o lugar. */
  const nums = await pg.locator('.card .step').allTextContents();
  ok('a numeração é 1,2,3', JSON.stringify(nums) === JSON.stringify(['1','2','3']), nums.join(','));
  ok('e o cartão do prompt continua existindo, sem número',
     (await pg.locator('#promptBox').count()) === 1);
  ok('o cartão dos frames não existe mais sozinho', (await pg.locator('#cardFrames').count()) === 0);
  /* O rótulo "opcional" saiu, e o número junto. Este cartão carrega `#auto`,
     `#extract` e os ajustes de extração — chamá-lo de passo OPCIONAL era a
     numeração dizendo que o botão que faz a ferramenta funcionar é dispensável.
     Ele passou a ser a segunda metade da ENTRADA, sem número próprio. */
  ok('o cartão da fala NÃO é mais uma etapa numerada',
     (await pg.locator('#cardTr h2 .step').count()) === 0 &&
     !/opcional/i.test(await pg.locator('#cardTr h2').textContent()),
     await pg.locator('#cardTr h2').textContent());
  /* Ele deixou de se chamar "Transcrição e frames": os frames não moram mais
     aqui como decisão — eles saem sozinhos. O que sobra neste cartão é a fala. */
  ok('e ele fala da FALA, não mais dos frames',
     !/frame/i.test(await pg.locator('#cardTr h2').textContent()),
     await pg.locator('#cardTr h2').textContent());
  ok('a etapa 2 é conferir', /Conferir/.test(await pg.locator('#prevCard h2').textContent()));
  /* E a etapa 3 existe, separada. Gerar era o quarto bloco de "Revisão" — a
     acao que a pessoa veio fazer, escondida como sub-item de outra coisa. */
  ok('e a etapa 3 é baixar', /Baixar/.test(await pg.locator('#cardBaixar h2').textContent()));
}

console.log('\n[2] o passo 2 tem DOIS botões, a ação antes dos ajustes');
{
  /* Eram três: "Ambos", "Só transcrever", "Só frames". O "Ambos" morreu de causa
     natural quando as telas passaram a sair sozinhas — ele existia porque elas
     dependiam de um clique. Três botões obrigavam a pessoa a modelar o produto
     cruzado de duas coisas independentes antes de apertar qualquer uma. */
  ok('o terceiro botão não existe mais', (await pg.locator('#ambos').count()) === 0);
  for (const [id, o_que] of [['auto','transcrever a fala'], ['extract','as telas']])
    ok('existe o botão de ' + o_que, (await pg.locator('#' + id).count()) === 1);
  ok('a fala é o botão cheio, não um fantasma',
     !(await pg.locator('#auto').getAttribute('class') || '').includes('ghost'));
  ok('os dois nascem desabilitados (não há vídeo)',
     (await pg.locator('#auto').isDisabled()) && (await pg.locator('#extract').isDisabled()));
  /* A AÇÃO VEM ANTES DOS AJUSTES. Ela ficava depois de dezesseis controles de
     afinação — todo mundo atravessava uma parede para apertar um botão. */
  ok('a ação vem antes do bloco de ajustes',
     await pg.evaluate(() => {
       const a = document.querySelector('#cardTr .acoes');
       const j = document.querySelector('#cardTr .ajustesTit');
       return !!a && !!j &&
              (a.compareDocumentPosition(j) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
     }));
  /* Ajustes de voz e de frames no mesmo cartão: era esse o pedido. */
  for (const id of ['model','lang','gpu','mode','maxf','tIni','tFim','quality'])
    ok('o ajuste #' + id + ' está no passo 2',
       await pg.locator('#cardTr #' + id).count() === 1);
  ok('a escolha de traduzir ANTES sumiu', (await pg.locator('#trEn').count()) === 0);
}

console.log('\n[3] o texto da fala e a tradução moram na revisão');
{
  ok('a caixa de texto está no passo 3', (await pg.locator('#prevCard #tr').count()) === 1);
  ok('e não sobrou nada dela no passo 2', (await pg.locator('#cardTr #tr').count()) === 0);
  ok('a tradução também desceu', (await pg.locator('#prevCard #tradRow').count()) === 1);
  ok('o vocabulário foi junto', (await pg.locator('#prevCard #vocLista').count()) === 1);
  /* Baixar .vtt/.srt/.txt soltos saiu da tela: eram mais três arquivos numa
     ferramenta que já entrega quinze, e não é o que ela faz — ela transforma
     gravação em documento. A fala continua saindo dentro do PDF, do Word, do
     HTML e do .zip, ancorada no quadro em que foi dita. */
  ok('e o exportar da transcrição solta não existe mais',
     (await pg.locator('#expRow').count()) === 0);
}

console.log('\n[4] com um vídeo, tudo destrava e a página vai para o passo 2');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('extract').disabled, null, { timeout: 25000 });
await pg.waitForTimeout(500);
{
  /* O que "destravou" quer dizer aqui: o vídeo foi aceito e o bloco de opções
     das telas está ao alcance. A fala é cobrada mais abaixo, DEPOIS da
     varredura — que é quando ela começa. */
  ok('o bloco das telas destravou',
     (await pg.locator('#framesCorpo').getAttribute('inert')) === null);

  /* E AS TELAS COMEÇAM A SAIR SOZINHAS. É a mudança de fluxo: um vídeo carregado
     dava numa parede de dezesseis controles, e nada acontecia até alguém
     escolher entre três botões. */
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length > 0,
                           null, { timeout: 60000 });
  ok('as telas saem sem ninguém clicar em nada',
     (await pg.locator('#thumbs figure').count()) > 0,
     String(await pg.locator('#thumbs figure').count()));
  ok('a página rolou até o passo 2', await pg.evaluate(() => window.scrollY > 40),
     'scrollY=' + await pg.evaluate(() => window.scrollY));
  ok('a revisão já abre, porque é onde se cola uma transcrição pronta',
     !(await pg.locator('#prevCard').getAttribute('class')).includes('fechado'));

  /* ---- E A FALA COMEÇA SOZINHA, DEPOIS DAS TELAS ----

     O pedido: gravando, a caixa "transcrever a fala" faz a fala sair sozinha;
     abrindo um arquivo, a mesma caixa marcada não fazia nada e era preciso
     achar um botão no passo 2 — "entendi que a transcrição tenho que apertar o
     botão, né".

     DEPOIS das telas, e não junto: transcrever desabilita o `#extract`, e a
     varredura automática desiste quando encontra esse botão desabilitado. A
     primeira versão começava 60 ms depois de abrir o vídeo e MATAVA as telas
     automáticas — a parte que já funcionava. Por isso a espera aqui é pelo fim
     da varredura, e não por um relógio. */
  await pg.waitForFunction(() => document.getElementById('auto').disabled,
                           null, { timeout: 45000 }).catch(() => {});
  const falaAndando = await pg.evaluate(() => ({
    caixa: document.getElementById('recTr').checked,
    ocupado: document.getElementById('auto').disabled,
    quadros: document.querySelectorAll('#thumbs figure').length,
    st: (document.getElementById('astatus').textContent || '').trim(),
  }));
  console.log('     ' + JSON.stringify(falaAndando));
  ok('a fala começou sozinha, porque a caixa está marcada',
     falaAndando.caixa && falaAndando.ocupado && falaAndando.st.length > 0,
     JSON.stringify(falaAndando));
  /* E as telas não foram atropeladas por ela: é a metade que a primeira
     versão quebrou sem ninguém notar. */
  ok('e as telas saíram antes, inteiras', falaAndando.quadros > 0,
     String(falaAndando.quadros));

  /* A OUTRA METADE, e sem ela a de cima não prova nada: com a caixa
     DESMARCADA, nada começa sozinho e o botão continua ao alcance de quem
     mudar de ideia. Um começo automático que ignora a caixa seria pior do que
     o clique que ele veio substituir. */
  {
    const ctx2 = await br.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto('http://localhost:8917/app.html?lang=pt');
    await p2.selectOption('#modelo', 'evidencia').catch(() => {});
    await p2.locator('#recTr').uncheck();
    await p2.setInputFiles('#file', '/tmp/amostra.webm');
    await p2.waitForFunction(() => document.querySelectorAll('#thumbs figure').length > 0,
                             null, { timeout: 60000 });
    await p2.waitForTimeout(1500);
    const parado = await p2.evaluate(() => ({
      autoLivre: !document.getElementById('auto').disabled,
      st: (document.getElementById('astatus').textContent || '').trim(),
    }));
    ok('com a caixa desmarcada, a fala NÃO começa sozinha',
       parado.autoLivre && parado.st === '', JSON.stringify(parado));
    await ctx2.close();
  }
}

console.log('\n[5] "Só extrair frames" não inventa transcrição');
{
  await pg.selectOption('#mode', 'count');
  await pg.fill('#count', '3');
  await pg.locator('#extract').click();
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3, null, { timeout: 40000 });
  await pg.waitForTimeout(500);
  ok('saíram os frames', (await pg.locator('#thumbs figure').count()) === 3);
  ok('e o texto continua vazio', (await pg.locator('#tr').inputValue()).trim() === '');
  ok('a barra de progresso some quando acaba', await pg.locator('#barWrap').isHidden());
}

console.log('\n[6] colar a transcrição na revisão ainda pareia com os quadros');
{
  await pg.fill('#tr', 'WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nAbri a transacao e informei o fornecedor');
  await pg.dispatchEvent('#tr', 'input');
  await pg.waitForTimeout(400);
  ok('a ferramenta reconheceu o trecho',
     /1 trechos/.test(await pg.locator('#trInfo').textContent()),
     await pg.locator('#trInfo').textContent());
  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/juntos.md');
  ok('a fala entrou no documento', /informei o fornecedor/.test(fs.readFileSync('/tmp/juntos.md','utf8')));
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nPassos 2 e 3 num só: tudo passou.');
process.exit(falhas ? 1 : 0);
