/* Cartões colapsados: fecham quando o passo não chegou, abrem quando destrava. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webm':'video/webm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}
  const u=q.url.split('?')[0]; const f=path.join(ROOT,u==='/'?'index.html':u);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8878,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
const pg=await br.newPage({viewport:{width:1000,height:900}});
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.route('**/rpc/*stamp_*', r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
await pg.goto('http://localhost:8878/app.html?lang=pt'); await pg.waitForTimeout(500);
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});

const fechado = id => pg.locator('#'+id).evaluate(e=>e.classList.contains('fechado'));
const alturaCorpo = id => pg.locator('#'+id+' .dobra > div').evaluate(e=>e.getBoundingClientRect().height);

const gavetaAberta = () => pg.locator('#ajustesCx').evaluate(e => e.classList.contains('aberta'));
const alturaGaveta = () => pg.locator('#ajustesCx > div').evaluate(e => e.getBoundingClientRect().height);

console.log('\n[1] página nova');
/* O PASSO 2 ABRE, e quem fecha agora são os AJUSTES.
   Fechado, ele era uma faixa cinza que não dizia o que fazia — e a pergunta que
   ele gerava era "isto só serve para vídeo enviado?". Não serve: o modelo de
   voz, o idioma e a sensibilidade valem para a gravação ao vivo também. O que
   sobrava de parede — dezesseis controles — foi para dentro de uma gaveta. */
ok('passo 2 ABERTO, mesmo sem vídeo', !(await fechado('cardTr')));
ok('e os dois botões dele estão à vista',
   await pg.locator('#auto').isVisible() && await pg.locator('#extract').isVisible());
ok('mas os ajustes estão fechados', !(await gavetaAberta()));
ok('e a gaveta dos ajustes tem mesmo altura zero', (await alturaGaveta()) < 2,
   (await alturaGaveta()).toFixed(1) + 'px');
ok('passo 3 (revisão) fechado', await fechado('prevCard'));
ok('passo 4 (prompt) fechado', await fechado('promptCard'));
ok('o passo 3 EXISTE na tela (a numeração não pula)',
   await pg.locator('#prevCard').isVisible());
ok('e explica quando vai servir',
   /depois da etapa 2/.test(await pg.locator('#hintPrev').textContent()),
   await pg.locator('#hintPrev').textContent());
{
  const nums = await pg.locator('.card .step').allTextContents();
  /* TRÊS, e não quatro. O quarto era o prompt para IA — a numeração dizia que
     entregar o vídeo a uma máquina é um quarto da tarefa, e para a maioria não
     é tarefa nenhuma: quem vinha gravar uma tela terminava o trabalho olhando
     para um passo por fazer. O cartão continua na página, oferecido no fim
     junto dos outros próximos passos; o que saiu foi o número. */
  ok('os passos estão numerados em sequência, e são três',
     JSON.stringify(nums) === JSON.stringify(['1','2','3']), nums.join(','));
}
ok('o cabeçalho e a dica continuam visíveis',
   await pg.locator('#cardTr h2').isVisible() && await pg.locator('#hintTr').isVisible());
const altura = await pg.evaluate(()=>document.documentElement.scrollHeight);
console.log('     altura da página com os ajustes fechados:', altura + 'px');

console.log('\n[1b] a gaveta dos ajustes abre e fecha');
/* O NÚMERO QUE IMPORTA: com a gaveta fechada, a placa de vídeo NÃO é
   alcançável. Uma gaveta que só muda de cor e deixa tudo clicável por baixo
   não guardou nada — e era exatamente o que o título "quase ninguém precisa
   mexer" fazia antes: avisava, e mostrava os dezesseis controles assim mesmo. */
/* CLIQUE, e não `check()`.
   `check()` não clica quando a caixa JÁ está no estado pedido — ele volta na
   hora, com sucesso. Desde que a placa passou a nascer marcada onde existe
   WebGPU (e existe, neste Chromium, quando a página vem por http), esta linha
   passou a afirmar "consegui marcar o que já estava marcado" e reprovou uma
   gaveta que continuava fechando direitinho. O clique sempre age, então o que
   se mede volta a ser o que interessa: dá ou não dá para ALCANÇAR o controle. */
ok('com a gaveta fechada não dá para alcançar a placa de vídeo',
   !(await pg.locator('#gpu').click({ timeout: 1200 }).then(()=>true).catch(()=>false)));
await pg.locator('#ajustesBtn').click();
await pg.waitForTimeout(450);
ok('clicar em "ajustes" abre a gaveta', await gavetaAberta());
ok('e os ajustes ficam alcançáveis antes de gravar',
   (await alturaGaveta()) > 100 && !(await pg.locator('#gpu').isDisabled()),
   (await alturaGaveta()).toFixed(0) + 'px');
/* E aberta ela é alcançável — medido pelo estado que MUDA, e não por um
   `check()` que pode ser um não-fazer-nada. */
const antesDoClique = await pg.locator('#gpu').isChecked();
ok('dá para mexer na placa de vídeo sem ter vídeo nenhum',
   await pg.locator('#gpu').click().then(()=>true).catch(()=>false));
ok('e o clique realmente mudou o estado da caixa',
   (await pg.locator('#gpu').isChecked()) !== antesDoClique,
   antesDoClique + ' → ' + (await pg.locator('#gpu').isChecked()));
await pg.locator('#gpu').setChecked(antesDoClique);
ok('o botão diz o seu estado para quem não vê a seta',
   (await pg.locator('#ajustesBtn').getAttribute('aria-expanded')) === 'true');
const alturaAberta = await pg.evaluate(()=>document.documentElement.scrollHeight);
console.log('     altura da página com os ajustes abertos :', alturaAberta + 'px');
/* Em pixels, e não em proporção da página: a página inteira tem cinco cartões,
   então uma razão dilui justamente o que se quer medir — quanto de parede a
   gaveta tirou da frente de quem abre a ferramenta. */
ok('a gaveta guarda uma parede de controles, não um enfeite',
   alturaAberta - altura > 250,
   (alturaAberta - altura) + 'px de controles fora do caminho');
await pg.locator('#ajustesBtn').click();
await pg.waitForTimeout(450);
ok('e clicar de novo fecha', !(await gavetaAberta()));
ok('o cabeçalho do cartão continua alcançável por teclado',
   (await pg.locator('#cardTr h2').getAttribute('tabindex')) === '0');

console.log('\n[2] carregar um vídeo mantém o passo 2 aberto');
await pg.setInputFiles('#file','/tmp/cinco.webm');
await pg.waitForFunction(()=>!document.getElementById('extract').disabled,null,{timeout:20000});
await pg.waitForTimeout(700);
ok('passo 2 aberto', !(await fechado('cardTr')));
ok('e o corpo do passo 2 tem altura de verdade', (await alturaCorpo('cardTr')) > 100,
   (await alturaCorpo('cardTr')).toFixed(0) + 'px');

console.log('\n[3] extrair frames abre a revisão e o prompt');
await pg.click('#extract');
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>0,null,{timeout:60000});
await pg.waitForTimeout(700);
ok('passo 4 aberto', !(await fechado('prevCard')));
ok('passo 5 aberto', !(await fechado('promptCard')));
ok('e sem dica de trava sobrando', !(await pg.locator('#hintPrompt').isVisible()));

ok('nenhum erro de JS', erros.length===0, erros.join(' | ').slice(0,160));
await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nColapso dos cartões: tudo passou.');
process.exit(falhas?1:0);
