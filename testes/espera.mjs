/* A ESPERA — o que a pessoa vê enquanto a ferramenta trabalha.
 *
 * Medido, com um vídeo de uma hora e o botão "Ambos": aos 51 segundos a
 * transcrição já tinha terminado e a varredura estava em 23:00 de 1:00:00 com
 * **46 quadros guardados** — e a tela mostrava ZERO. Os 120 trechos
 * transcritos também não estavam em lugar nenhum: o campo só era escrito
 * depois da última janela.
 *
 * A ferramenta calculava em pedaços e revelava em bloco. É o que faz uma
 * espera parecer o dobro do que ela é — e o que faz alguém fechar a aba, que
 * neste produto significa perder o trabalho.
 *
 * Este arquivo cobra as quatro coisas que consertam isso, e a armadilha que
 * elas criaram:
 *
 *   1. as miniaturas aparecem ENQUANTO a varredura corre;
 *   2. o texto enche o campo ENQUANTO a transcrição corre;
 *   3. o campo fica somente-leitura enquanto enche, e destrava no fim — um
 *      texto que se desfaz enquanto se digita é pior que um campo vazio;
 *   4. a faixa fixa mostra o progresso quando a barra de verdade sai da tela;
 *   5. e as saídas DIZEM que um documento gerado agora sai sem a fala.
 *
 * A biblioteca do modelo é falsificada — o Whisper não sobe nesta máquina, e o
 * que está sendo medido aqui é a tela, não a inferência.
 */
import { chromium } from './_navegador.mjs';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
/* A AMOSTRA LONGA NÃO É UM DETALHE AQUI. Este arquivo mede o que acontece
   DURANTE a espera, e a amostra curta não tem durante: a transcrição inteira
   cabe entre duas leituras do vigia, e as afirmações caem por falta de amostra.
   Ele caía como "o campo nunca esteve à vista" — que se lê como defeito do
   produto, e não como instrumento sem material. Cair assim é pior do que não
   rodar: manda procurar o defeito no lugar errado. */
const VIDEO = '/tmp/longo.webm';
if (!fs.existsSync(VIDEO)) {
  console.log('  pulado  ' + VIDEO + ' não existe — e a amostra curta não serve para medir espera.');
  console.log('          Gere com:  python3 testes/amostras.py --longo   (~1 min, 41 MB)');
  process.exit(0);
}
const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8944, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

/* Um modelo de mentira, e LENTO de propósito: o que este arquivo mede é o que
   acontece DURANTE a espera, e uma transcrição instantânea não tem durante. */
const LIB = `
export const env = { allowLocalModels:true, allowRemoteModels:true,
  backends:{ onnx:{ wasm:{ numThreads:1, wasmPaths:undefined } } } };
let n = 0;
export async function pipeline(t, m, o){
  if ((o||{}).device === 'webgpu') throw new Error('sem webgpu (falso)');
  const p = async () => {
    await new Promise(r => setTimeout(r, 200));
    n++;
    return { text:'trecho ' + n, chunks:[{ timestamp:[0,2], text:'trecho ' + n }] };
  };
  p.dispose = async () => {};
  return p;
}`;

const br = await chromium.launch({
  executablePath: CHROME_WS,
});
const ctx = await br.newContext({ viewport: { width: 1250, height: 900 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/@huggingface/transformers**', r => r.fulfill({
  status: 200, headers: { 'content-type': 'text/javascript' }, body: LIB }));
await pg.goto('http://localhost:8944/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.setInputFiles('#file', VIDEO);
await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                         null, { timeout: 90000 });
await pg.selectOption('#mode', 'scene');
await pg.fill('#maxf', '2000');

/* O vigia: registra o INSTANTE de cada marco. É a única forma de afirmar
   "apareceu ANTES do fim" sem apostar num `waitForTimeout`. */
await pg.evaluate(() => {
  window.__m = {};
  window.__t0 = performance.now();
  const marca = k => { if (window.__m[k] == null) window.__m[k] = Math.round(performance.now() - window.__t0); };
  setInterval(() => {
    if (document.querySelectorAll('#thumbs figure').length) marca('miniatura');
    const tr = document.getElementById('tr');
    if ((tr.value || '').trim()) {
      marca('texto');
      /* ENCHER E NINGUÉM VER é o mesmo que não encher. `#tr` mora no passo 3, e
         quem aperta "Transcrever a fala" está olhando para o passo 2 — depois
         que as telas passaram a sair sozinhas, o empurrão da página para baixo
         acontecia ANTES da transcrição, e ela enchia um campo fora da tela. */
      const r = tr.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) marca('textoNaTela');
    }
    if (tr.readOnly) marca('campoTravado');
    /* A BARRA LISTRADA. Entre "cliquei" e a primeira janela transcrita há um
       vão de dezenas de segundos — extrair o áudio, montar o modelo — em que
       não existe porcentagem para mostrar. A tela escrevia 0% e ficava lá: 0%
       parado lê-se como travado, e não como desconhecido. */
    const bw = document.getElementById('abarWrap');
    if (bw && bw.classList.contains('indef')) marca('listrada');
    if (/sem a fala/i.test(document.getElementById('pdfStatus').textContent || '')) marca('avisoSaida');
    const f = document.getElementById('faixa');
    if (f && !f.classList.contains('hide')) marca('faixa');
    if (/trechos|pronta/i.test(document.getElementById('astatus').textContent || '')) marca('fim');
  }, 60);
});

/* "Transcrever a fala" — que agora traz as telas que faltarem junto. O terceiro
   botão ("Ambos") deixou de existir quando as telas passaram a sair sozinhas.
   Aqui o agendamento automático foi cancelado pelos ajustes acima, que é o
   desenho: quem mexe nos ajustes está dirigindo, e a ferramenta não disputa. */
const t0 = Date.now();
await pg.locator('#auto').click();
/* Enquanto corre, a pessoa desce para revisar — que é o gesto que a melhoria
   provoca, e é ele que tira a barra de verdade da tela. */
await pg.waitForTimeout(2500);
await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await pg.waitForTimeout(900);
const faixaDescido = await pg.evaluate(() => {
  const f = document.getElementById('faixa');
  return { visivel: f && !f.classList.contains('hide'),
           texto: (document.getElementById('faixaTxt').textContent || '').trim().slice(0, 70),
           corpoComFolga: document.body.classList.contains('comFaixa') };
});

/* Espera os DOIS trabalhos, e não só a transcrição: a varredura de uma hora de
   vídeo continua correndo depois de a transcrição acabar — foi ela que revelou
   que a minha primeira versão deste teste afirmava "acabou" com metade do
   trabalho ainda na tela. */
await pg.waitForFunction(() => !document.getElementById('auto').disabled &&
                               !document.getElementById('extract').disabled,
                         null, { timeout: 900000 });
await pg.waitForTimeout(1500);
const total = Date.now() - t0;
const m = await pg.evaluate(() => window.__m);

const linha = (k, v) => console.log('   ' + k.padEnd(40) + v);
console.log('\n  "Transcrever a fala" num vídeo de ' +
            (await pg.evaluate(() => Math.round(document.getElementById('v').duration / 60))) +
            ' minutos — total ' + (total / 1000).toFixed(1) + ' s\n');
linha('primeira miniatura na tela', (m.miniatura == null ? 'nunca' : m.miniatura + ' ms'));
linha('primeiro texto no campo', (m.texto == null ? 'nunca' : m.texto + ' ms'));
linha('aviso "sairia sem a fala"', (m.avisoSaida == null ? 'nunca' : m.avisoSaida + ' ms'));
linha('faixa fixa apareceu', (m.faixa == null ? 'nunca' : m.faixa + ' ms'));
linha('a transcrição terminou', (m.fim == null ? '—' : m.fim + ' ms'));

console.log('\n  o que este arquivo AFIRMA:');
/* O NÚMERO QUE IMPORTA em todos os três: ANTES do fim. Um marco que só
   acontece no fim é exatamente o defeito que estes consertos removeram. */
ok('as miniaturas aparecem enquanto a varredura corre',
   m.miniatura != null && m.fim != null && m.miniatura < m.fim * 0.5,
   m.miniatura + ' ms contra ' + m.fim + ' ms de fim');
ok('o texto enche o campo enquanto a transcrição corre',
   m.texto != null && m.fim != null && m.texto < m.fim,
   m.texto + ' ms contra ' + m.fim + ' ms de fim');
/* E na TELA. Sem esta linha, a anterior passava com o campo enchendo dois mil
   pixels abaixo do que a pessoa está olhando — que foi exatamente a queixa. */
ok('e o campo está na tela enquanto ele enche',
   m.textoNaTela != null && m.fim != null && m.textoNaTela < m.fim,
   m.textoNaTela == null ? 'nunca esteve à vista' : m.textoNaTela + ' ms');
/* O NÚMERO QUE IMPORTA: antes do primeiro texto. Uma barra listrada que só
   aparece depois de já haver porcentagem não serviu para nada. */
ok('antes de haver porcentagem, a barra anda listrada em vez de mostrar 0%',
   m.listrada != null && m.texto != null && m.listrada <= m.texto,
   m.listrada == null ? 'nunca apareceu' : m.listrada + ' ms contra ' + m.texto + ' ms do texto');
ok('o campo fica somente-leitura enquanto enche',
   m.campoTravado != null, String(m.campoTravado));
ok('e destrava quando ela acaba',
   !(await pg.evaluate(() => document.getElementById('tr').readOnly)));
ok('as saídas avisam que o documento sairia sem a fala',
   m.avisoSaida != null && m.fim != null && m.avisoSaida < m.fim,
   m.avisoSaida + ' ms');
ok('e o aviso some quando a transcrição acaba',
   !/sem a fala/i.test(await pg.locator('#pdfStatus').textContent()),
   (await pg.locator('#pdfStatus').textContent()).slice(0, 70));

/* A FAIXA. Ela é a resposta a um problema que a própria melhoria criou: com a
   grade enchendo em um segundo, a pessoa desce para revisar e o progresso — que
   mora no cartão 2 — sai da tela. */
console.log('\n  a faixa fixa, com a página rolada até o fim:');
linha('apareceu', String(faixaDescido.visivel));
linha('dizendo', faixaDescido.texto || '(vazio)');
ok('com a barra de verdade fora da tela, a faixa aparece', faixaDescido.visivel);
ok('e ela diz o que está acontecendo, não só uma barra',
   (faixaDescido.texto || '').length > 10, faixaDescido.texto);
ok('e o corpo ganha folga para ela não cobrir o último passo',
   faixaDescido.corpoComFolga);
/* ACABADO O TRABALHO, a faixa não some: ela MUDA DE ESTADO e dá a notícia.
   Esta linha afirmava que ela saía da tela, e estava certa enquanto a faixa só
   sabia falar de progresso. Depois do relato dos 40 minutos ela ganhou um
   segundo estado — verde, com o que ficou pronto —, porque quem passou a espera
   fora da aba precisa ler o que aconteceu ao voltar, e não achar uma tela que
   se recompôs sozinha.

   O que continua sendo cobrado é o mesmo de sempre, e é o que importa para o
   layout: a faixa e a folga do corpo andam JUNTAS. Uma folga de 76px sem faixa
   nenhuma é um buraco no fim da página; uma faixa sem folga cobre o último
   passo. As duas afirmações abaixo travam esse par nos dois estados. */
/* ESPERAR TUDO PARAR ANTES DE PERGUNTAR SE PAROU.
   Desde que a fala começa sozinha depois da varredura (o pedido de paridade
   com o lado de gravar), "acabou a varredura" deixou de ser "acabou o
   trabalho": um segundo trabalho começa em seguida. Esta linha reprovava o
   produto por perguntar cedo demais — a faixa dizia "Extraindo o áudio…",
   que é a resposta certa para o instante errado. */
await pg.waitForFunction(() => {
  const vivo = ['abarWrap', 'barWrap'].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hide');
  });
  return !vivo;
}, null, { timeout: 120000 }).catch(() => {});
await pg.waitForTimeout(900);

const fim = await pg.evaluate(() => ({
  faixa: !document.getElementById('faixa').classList.contains('hide'),
  pronta: document.getElementById('faixa').classList.contains('pronta'),
  folga: document.body.classList.contains('comFaixa'),
  txt: (document.getElementById('faixaTxt').textContent || '').trim(),
}));
linha('no fim do trabalho', JSON.stringify(fim));
ok('acabado o trabalho, a faixa some OU vira o aviso de concluído',
   !fim.faixa || fim.pronta, JSON.stringify(fim));
ok('e a folga do corpo acompanha a faixa, nos dois casos',
   fim.folga === fim.faixa, JSON.stringify(fim));
ok('e quando ela vira aviso, ela diz o que ficou pronto',
   !fim.pronta || fim.txt.length > 10, fim.txt);
ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nA espera: tudo passou.');
process.exit(falhas ? 1 : 0);
