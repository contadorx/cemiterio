/* O formato do documento vindo da conta.
 *
 * A pergunta: quando a empresa configura papel, layout e as duas marcações, a
 * ferramenta obedece — e PARA de obedecer no instante em que a pessoa que está
 * com o caso na mão troca alguma coisa.
 *
 * As duas metades importam. Sem a primeira, configurar o padrão do time não faz
 * nada. Sem a segunda, o padrão do time vira camisa de força — e ele chega pela
 * rede, ou seja, DEPOIS de a tela já estar aberta e possivelmente já mexida.
 */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml',
         '.webm':'video/webm','.jpg':'image/jpeg','.png':'image/png','.vtt':'text/vtt'};
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);
 const f=path.join(ROOT,u==='/'?'index.html':u);
 if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f))});
await new Promise(r=>srv.listen(8993,r));

const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0;
const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};

const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=email=>[b64({alg:'HS256',typ:'JWT'}),
  b64({role:'authenticated',email,exp:Math.floor(Date.now()/1000)+3600}),'x'].join('.');

/** Abre a ferramenta com uma sessão e um `config` de conta. `atraso` simula a
 *  rede: o padrão do time chega depois da tela, que é como ele chega na vida. */
async function comConta(config, atraso = 0) {
  const ctx = await br.newContext({ viewport:{width:1300,height:1000} });
  const pg = await ctx.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  /* `atraso: 'comando'` segura a resposta do perfil até o teste mandar soltar.
     Com número, a corrida é contra o relógio — e carregar um vídeo demora o
     que demorar na máquina que estiver rodando. Um teste que às vezes passa
     por ser rápido não prova nada. */
  let soltarPerfil = () => {};
  const preso = atraso === 'comando'
    ? new Promise(r => { soltarPerfil = r; })
    : null;
  await pg.route('**/functions/v1/walkstamp-meus', async r => {
    if (preso) await preso;
    else if (atraso) await new Promise(z=>setTimeout(z,atraso));
    r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
      email:'chefe@formato.test', chamados:[],
      perfil:{ cliente:'ACME', plano:'time', papel:'admin', config, modelos:[] } }) });
  });
  await pg.route('**/rpc/**', r=>r.fulfill({status:200,body:'null'}));
  /* `exp` não é enfeite: `lerSessao()` recusa sessão sem prazo válido, e sem
     ela a ferramenta nunca chega a pedir o perfil. Foi assim que este teste
     começou dizendo que o padrão da conta não chegava — quando o que não
     chegava era a sessão. */
  await pg.addInitScript(([tk, exp]) => {
    try {
      sessionStorage.setItem('Walkstamp.sessao', JSON.stringify({
        token: tk, email: 'chefe@formato.test', exp,
      }));
    } catch (e) {}
  }, [jwt('chefe@formato.test'), Math.floor(Date.now() / 1000) + 3600]);
  await pg.goto('http://localhost:8993/app.html?lang=pt');
  return { pg, ctx, erros, soltarPerfil };
}

console.log('[1] o padrão da conta chega na ferramenta');
{
  const { pg, ctx, erros } = await comConta({ empresa:'ACME', rotulo:'Tela', ambiente:'QAS',
    papel:'letter', layout:'grid', hash:true, numerar:true });
  await pg.waitForFunction(() => document.getElementById('papel').value === 'letter',
    null, { timeout: 15000 }).catch(()=>{});
  ok('o papel veio da conta', await pg.inputValue('#papel') === 'letter', await pg.inputValue('#papel'));
  ok('o layout também', await pg.inputValue('#layout') === 'grid', await pg.inputValue('#layout'));
  ok('a impressão digital veio marcada', await pg.isChecked('#evHash'));
  ok('e a numeração automática', await pg.isChecked('#evNum'));
  ok('o que já vinha antes continua vindo', await pg.inputValue('#unNome') === 'Tela',
     await pg.inputValue('#unNome'));
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await ctx.close();
}

console.log('\n[2] sem nada configurado, nada muda');
{
  const { pg, ctx } = await comConta({ empresa:'ACME' });
  await pg.waitForTimeout(1200);
  ok('o papel fica no padrão da ferramenta', await pg.inputValue('#papel') === 'a4', await pg.inputValue('#papel'));
  ok('e as marcações desmarcadas', !(await pg.isChecked('#evHash')) && !(await pg.isChecked('#evNum')));
  await ctx.close();
}

console.log('\n[3] valor inventado não é obedecido');
{
  const { pg, ctx } = await comConta({ papel:'papiro', layout:'3d' });
  await pg.waitForTimeout(1200);
  ok('papel inventado é ignorado', await pg.inputValue('#papel') === 'a4', await pg.inputValue('#papel'));
  ok('layout inventado também', await pg.inputValue('#layout') === 'auto', await pg.inputValue('#layout'));
  await ctx.close();
}

console.log('\n[4] a mão de quem está com o caso VENCE o padrão do time');
{
  /* O padrão chega pela rede, ou seja, depois da tela. Se ele sobrescrevesse o
     que a pessoa acabou de escolher, a configuração do time viraria estorvo —
     e o defeito seria invisível, porque depende de quem digita mais rápido que
     a rede responde.
     Aqui o time pede A4 e a pessoa escolhe Carta: escolher o mesmo valor que
     já estava na tela não provaria nada, porque não daria para saber se ficou
     por escolha ou por inércia. */
  const { pg, ctx, soltarPerfil } =
    await comConta({ papel:'a4', layout:'grid', hash:true }, 'comando');

  /* Os controles de formato moram no cartão da revisão, e ele nasce `inert` —
     de propósito: antes de existir material não há documento para formatar.
     `inert` não é enfeite visual, ele tira o subárvore inteira do teste de
     acerto do ponteiro, então nem o cabeçalho abre. O jeito de chegar lá é o
     jeito de todo mundo: carregar um vídeo. */
  await pg.selectOption('#modelo', 'evidencia');
  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  await pg.waitForFunction(() => !document.getElementById('prevCard').hasAttribute('inert'),
    null, { timeout: 20000 });

  /* `selectOption` do Playwright NÃO serve aqui: ele escreve o `value` e
     dispara um `Event` de mentira, com `isTrusted: false` — que é exatamente o
     que o código usa para separar a mão da rede. Usá-lo faria o teste
     reprovar uma ferramenta que está certa. A seta do teclado passa pelo
     navegador de verdade, e é isso que uma pessoa produz. */
  await pg.locator('#papel').focus();
  await pg.keyboard.press('ArrowDown');            // A4 → Carta
  await pg.waitForTimeout(120);
  /* O bloco de identificação nasce recolhido — metade das pessoas não preenche
     nada disso. E a impressão digital só existe na evidência: no "Contexto
     para IA", que é o cenário de estreia, ela não quer dizer nada.
     Marcar por JavaScript não serviria: o que este teste precisa provar é a
     mão da PESSOA vencendo o padrão do time, e `isTrusted` separa as duas —
     então o clique tem que ser clique. Marcar e desmarcar deixa a caixa como
     ela já estava, mas com a diferença que importa: agora foi escolha. */
  if (!(await pg.locator('#evBox').evaluate(e => e.open)))
    await pg.locator('#evBox summary').click();
  await pg.check('#evHash');
  await pg.uncheck('#evHash');

  soltarPerfil();
  await pg.waitForTimeout(1500);
  ok('o papel escolhido à mão fica', await pg.inputValue('#papel') === 'letter', await pg.inputValue('#papel'));
  ok('a marcação desmarcada à mão fica desmarcada', !(await pg.isChecked('#evHash')));
  ok('mas o que ninguém tocou obedece o time', await pg.inputValue('#layout') === 'grid',
     await pg.inputValue('#layout'));
  await ctx.close();
}

console.log('\n[5] a tela diz de onde o formato veio');
{
  /* Um seletor que muda sozinho, sem dizer por quê, é o jeito mais rápido de a
     pessoa achar que a ferramenta está mexendo nas coisas pelas costas dela —
     e a segunda coisa que ela precisa saber é que pode trocar. */
  const { pg, ctx } = await comConta({ empresa:'ACME', papel:'letter', layout:'grid' });
  await pg.waitForFunction(() => !document.getElementById('fmtConta').classList.contains('hide'),
    null, { timeout: 15000 }).catch(()=>{});
  const nota = (await pg.locator('#fmtConta').textContent() || '').trim();
  ok('a nota aparece', nota.length > 10, nota.slice(0,80));
  ok('e diz de QUEM é a configuração', /ACME/.test(nota), nota.slice(0,80));
  ok('dizendo também que dá para trocar', /este documento/.test(nota), nota.slice(0,90));
  await ctx.close();
}

console.log('\n[6] sem padrão da conta, nota nenhuma');
{
  /* Uma nota que aparece sempre é uma nota que ninguém lê. */
  const { pg, ctx } = await comConta({ empresa:'ACME' });
  await pg.waitForTimeout(1200);
  ok('a nota fica escondida', await pg.locator('#fmtConta').evaluate(e => e.classList.contains('hide')));
  ok('e sem texto dentro', (await pg.locator('#fmtConta').textContent()).trim() === '');
  await ctx.close();
}

console.log('\n[7] o formato vem ANTES dos botões que produzem o arquivo');
{
  /* O pedido foi literal: "em gerar separe uma seção para formatos… depois
     formato de saída e depois dados e recuperação". A ordem é o pedido — se
     alguém reencaixar os seletores no meio dos botões, isto reprova. */
  const { pg, ctx } = await comConta({});
  const ordem = await pg.evaluate(() => {
    const ids = ['papel','layout','go','docx','json','zip'];
    const pos = {};
    for (const id of ids) pos[id] = [...document.querySelectorAll('#sb4 *')].indexOf(document.getElementById(id));
    const tit = [...document.querySelectorAll('#sb4 .saidaTit')].map(e => e.textContent.trim());
    return { pos, tit };
  });
  ok('papel e layout vêm antes do Gerar PDF',
     ordem.pos.papel < ordem.pos.go && ordem.pos.layout < ordem.pos.go, JSON.stringify(ordem.pos));
  ok('e os dados de recuperação vêm por último',
     ordem.pos.json > ordem.pos.docx && ordem.pos.zip > ordem.pos.json, JSON.stringify(ordem.pos));
  /* CINCO agora, e a primeira é a recomendação. Onze botões com o mesmo peso
     eram onze decisões cobradas de quem só queria entregar o trabalho; a
     recomendação responde a pergunta e o catálogo fica atrás dela, recolhido.
     Dentro do catálogo a ordem antiga continua valendo: forma primeiro,
     recuperação por último. */
  ok('a recomendação abre a seção',
     ordem.tit.length === 5 && /recomendado/i.test(ordem.tit[0]), ordem.tit.join(' | '));
  ok('e o catálogo mantém a ordem: formato primeiro, recuperação por último',
     /formato/i.test(ordem.tit[1]) && /recupera/i.test(ordem.tit[4]),
     ordem.tit.join(' | '));
  await ctx.close();
}

await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nFormato da conta: tudo passou.');
process.exit(falhas?1:0);
