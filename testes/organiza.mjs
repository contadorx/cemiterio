/* A arrumação da tela de trabalho.
 *
 * Nenhum destes itens é uma função nova. Todos são a mesma função no lugar
 * certo — que é o trabalho que menos aparece e o que mais muda o uso.
 *
 *   - "Outro" no fim dos cenários: uma lista fechada não impede o uso fora
 *     dela, só faz a pessoa mentir na resposta;
 *   - o custo do modelo sai do rótulo da transcrição e entra "recomendado":
 *     desde que o download começa sozinho ao abrir a página, anunciar
 *     megabytes ao lado de uma caixa marcada é assustar por um preço que já
 *     não se paga;
 *   - no passo 3, resultado DEPOIS da ação: placar antes do jogo não é placar;
 *   - o campo do comentário na janelinha tem que ser LEGÍVEL quando está
 *     desligado, senão a frase existe no código e não na tela;
 *   - e a janelinha avisa quando o modelo falha, porque é para ela que a
 *     pessoa está olhando enquanto a aba está atrás da tela compartilhada.
 */
import { chromium } from './_navegador.mjs';
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
await new Promise(r => srv.listen(8949, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1150, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.addInitScript(() => {
  function tela(){
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); let i = 0;
    setInterval(() => { i++; g.fillStyle = ['#123','#eee','#567','#fa0'][i%4]; g.fillRect(0,0,1280,720); }, 700);
    return c.captureStream(12);
  }
  navigator.mediaDevices.getDisplayMedia = async () => tela();
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
});
await pg.goto('http://localhost:8949/app.html?lang=pt');
await pg.waitForTimeout(700);

console.log('[1] "Outro" existe, é o último, e é o genérico assumido');
{
  const vals = await pg.locator('#modelo option').evaluateAll(o => o.map(x => x.value));
  ok('é a última opção da lista', vals[vals.length - 1] === 'outro', vals.join(','));
  ok('e continua havendo o pedido em primeiro', vals[0] === '');
  await pg.selectOption('#modelo', 'outro');
  await pg.waitForTimeout(350);
  const dica = (await pg.locator('#cenDica').textContent() || '').trim();
  ok('a explicação diz que é o formato neutro',
     /neutro|nenhum dos cinco/i.test(dica), dica.slice(0, 62));
  /* A parte que impede a mentira: quem escolhe Outro tem que receber o
     genérico DE VERDADE, e não um cabeçalho de evidência sem os campos. */
  ok('não pede dados de evidência', await pg.locator('#evBox').evaluate(
     e => e.classList.contains('hide')).catch(() => true));
}

console.log('\n[2] a transcrição diz "recomendado", e não "249 MB"');
{
  const nota = (await pg.locator('#optTr').textContent() || '').trim();
  ok('a nota ao lado da caixa é a recomendação', /recomendad/i.test(nota), nota);
  ok('e não anuncia megabytes', !/\bMB\b|\d{2,}\s*MB/i.test(nota), nota);
  ok('a caixa continua marcada por padrão', await pg.locator('#recTr').isChecked());
  /* O número não sumiu do produto: ele continua na ajuda, atrás do "?", para
     quem quiser saber o que vai ser baixado antes de deixar marcado. */
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('o tamanho continua existindo na ajuda', /recTrOn/.test(fonte));
}

console.log('\n[3] o modelo começa a baixar ao chegar na página');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('há um adiantamento disparado sozinho', /setTimeout\(\(\) => \{[\s\S]{0,200}?adiantarModelo\(\);/.test(fonte));
  /* E as três recusas. Puxar 249 MB no celular de quem só abriu para ver o que
     é seria cobrar uma conta de dados sem avisar — numa ferramenta cuja
     promessa é "grátis, sem instalar nada". */
  ok('mas não com economia de dados ligada', /c\.saveData/.test(fonte));
  ok('nem em conexão medida', /c\.metered/.test(fonte));
  ok('nem em rede 2g', /slow-\)\?2g/.test(fonte));
}

console.log('\n[4] no passo 3, o resultado vem DEPOIS da ação');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  /* A ORDEM MUDOU, e esta é a nova — pedida assim: "o revisar quadro a quadro
     deve ficar mais próximo do quadro; na organização deve ter algo para
     reduzir os frames, e depois a revisão individual".

     Antes: título → oito botões em fila → revisar → placar → grade.
     Agora:  título → reduzir → acrescentar → placar → CONFERIR → grade.

     O que se afirma continua sendo relação de posição, e não pixel: as ações
     de lote antes do placar (resultado depois da ação), e o conferir COLADO na
     grade, que é o pedido inteiro em uma linha. */
  const iTit  = fonte.indexOf('data-i18n="orgTit"');
  const iRed  = fonte.indexOf('data-i18n="orgReduzirH"');
  const iAcao = fonte.indexOf('id="dedup"');
  const iPlac = fonte.indexOf('id="nKeep"');
  const iRev  = fonte.indexOf('id="revisar"');
  const iGrade = fonte.indexOf('id="thumbs"');
  ok('o título de organizar vem antes das ações', iTit > 0 && iTit < iRed && iRed < iAcao);
  ok('as ações de lote vêm antes do placar', iAcao < iPlac, `${iAcao} < ${iPlac}`);
  ok('e o conferir vem depois do placar, já perto da grade',
     iPlac < iRev && iRev < iGrade, `${iPlac} < ${iRev} < ${iGrade}`);
  /* O NÚMERO QUE IMPORTA: entre o botão de conferir e a grade não sobra
     nenhuma outra AÇÃO. "Mais próximo do quadro" é isto — se um botão novo se
     enfiar no meio, esta conta acusa. */
  const miolo = fonte.slice(fonte.indexOf('id="conferirCx"'), iGrade);
  const botoesNoMeio = (miolo.match(/<button/g) || []).length;
  ok('e nada se enfia entre o conferir e a grade', botoesNoMeio === 1,
     botoesNoMeio + ' botão(ões) no trecho');
  ok('o placar está separado por uma linha', /class="row placar"/.test(fonte));
  /* O "começar outro" fica DEPOIS de tudo, no fim da página: quem terminou não
     desistiu — gerou o documento e tem a próxima gravação esperando. O
     "Recomeçar" de cima serve a outra pessoa, a que desiste no meio. */
  const iNovo = fonte.indexOf('id="novoFluxo"');
  const iReset = fonte.indexOf('id="reset"');
  const iPrompt = fonte.indexOf('id="promptCard"');
  ok('o começar-outro vem depois do passo 4', iPrompt > 0 && iPrompt < iNovo,
     `${iPrompt} < ${iNovo}`);
  ok('e não é o mesmo botão do recomeçar do meio', iReset > 0 && iReset < iPrompt,
     `${iReset} < ${iPrompt}`);
  const lbl = (await pg.locator('label[for="unNome"]').textContent() || '').trim();
  /* Era `/quadro\/frame/`: o rótulo mostrava os DOIS termos, porque a
     ferramenta falava os dois. Com uma palavra só, a barra perdeu a razão
     de existir — e o campo continua sendo a pergunta "como VOCÊ chama
     isto?", que é o que ele sempre respondeu. */
  ok('o campo diz o que se escreve nele', /cada quadro de/i.test(lbl), lbl);
  /* O botão passou a dizer QUANTAS e a usar a palavra do cenário — a mesma
     que `rotuloUnidade()` dá aos outros dezoito lugares. Antes ele dizia
     "Revisar quadro a quadro", fixo; numa ata, a tela inteira falava em
     "Momento" e só este botão falava em "quadro". */
  const txtRev = (await pg.locator('#revisar').textContent() || '').trim();
  ok('e o botão fala de quadros, não de passos', /quadro a quadro/i.test(txtRev), txtRev);
  /* A versão COM contagem é cobrada em `revisao.mjs`, que tem quadros na tela;
     aqui não há vídeo nenhum, e um botão que exigisse contagem para ter texto
     apareceria vazio nesta mesma tela. */
}

console.log('\n[5] baixar a transcrição solta saiu, e o plano saiu do rodapé');
{
  ok('não há mais .vtt/.srt/.txt soltos', (await pg.locator('#expVtt').count()) === 0);
  ok('nem o botão de ativar o plano', (await pg.locator('#licBtn').count()) === 0);
  /* Nenhum dos dois pode ter levado função junto: a legenda continua saindo
     dentro do .zip, e a chave continua se aplicando pelo link do e-mail. */
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('mas a legenda continua sendo montada para o .zip', /function montarLegenda/.test(fonte));
  ok('e a caixa da licença continua existindo para o link', /id="licBox"/.test(fonte));
  /* A frase que explica o .vtt MUDOU DE CASA. Ela era um texto solto ao lado do
     botão, segurado por `flex:1` para não colar na borda; virou o parágrafo do
     bloco "Enviar arquivo de transcrição", que tem respiro próprio. A régua
     cobra o respiro onde ele agora mora — cobrar o `flex:1` de um elemento que
     não existe mais é cobrar a forma antiga de resolver, e não o problema. */
  ok('a frase do envio de transcrição não encosta na borda',
     /\.trFonte\{[^}]*padding:12px 14px/.test(fonte) && /data-i18n="trEnviarP"/.test(fonte));
}

console.log('\n[6] a caixa da janelinha é legível mesmo desligada');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  /* O campo virou `textarea`: uma linha só ensinava a escrever pouco, e o que
     se pede ali não cabe em quarenta caracteres. O que a régua cobra continua
     idêntico — desligado tem que ser legível —, só mudou a etiqueta. */
  ok('desligada não é quase invisível',
     !/textarea\.nota:disabled\{opacity:\.45\}/.test(fonte));
  ok('ela fica pontilhada, que é o sinal de "ainda não vale"',
     /textarea\.nota:disabled\{[^}]*border-style:dashed/.test(fonte));
  ok('e a frase dentro dela tem contraste', /textarea\.nota::placeholder\{color:#9aa3b2/.test(fonte));
  ok('o botão de trazer a janelinha de volta é destacado',
     /class="sm hide destaque" id="recPip"/.test(fonte));
}

console.log('\n[7] a janelinha avisa quando a gravação morre');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('há um estado de erro na janelinha', /if \(etapa === 'erro'\)/.test(fonte));
  ok('e um de download com porcentagem', /if \(etapa === 'baixando'\)/.test(fonte));
  /* O estado de erro deixou de pertencer ao modelo — o modelo não derruba mais
     a gravação (ver linhas.mjs [L3]). Ele passou a pertencer a `desistir`, que
     é quem realmente desiste: permissão negada, compartilhamento encerrado. E
     é ELE que precisa aparecer na janelinha, porque é para lá que quem grava
     está olhando quando a gravação morre. */
  ok('o erro é chamado quando a gravação desiste de verdade',
     /const desistir = \(msg, classe\) => \{[\s\S]{0,900}?controle\('erro', \{ msg \}\)/.test(fonte));
  ok('e a janelinha mostra o MOTIVO, não um "deu erro"',
     /pipTexto\.textContent = \(dados && dados\.msg\) \|\| t\('pipErro'\)/.test(fonte));
  /* E a janela NÃO fecha em seguida: fechar junto mostraria a frase por zero
     milissegundo, e sumir sem explicar é o que faz a pessoa achar que a culpa
     foi dela. */
  ok('e a janelinha fica na tela tempo de ser lida',
     /pipErroTic = setTimeout\(fecharControle, 6000\)/.test(fonte));
  ok('o texto de erro é vermelho e quebra linha', /\.txt\.ruim\{color:#ef8484/.test(fonte));
}

console.log('\n[8] os cinco idiomas, sem rótulo em branco');
for (const L of ['pt', 'en', 'es', 'de', 'fr']) {
  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:8949/app.html?lang=' + L);
  await p2.waitForTimeout(500);
  const vazios = await p2.evaluate(() => [...document.querySelectorAll('[data-i18n]')]
    .filter(e => !e.textContent.trim()).map(e => e.getAttribute('data-i18n')));
  ok(`${L}: nenhum rótulo em branco`, vazios.length === 0, vazios.slice(0, 6).join(' '));
  const outro = await p2.locator('#modelo option[value="outro"]').textContent();
  ok(`${L}: "Outro" traduzido`, (outro || '').trim().length > 4, outro);
  await p2.close();
}

console.log('\n[9] nada disso quebrou o JS');
ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 170));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nArrumação da tela: tudo passou.');
process.exit(falhas ? 1 : 0);
