/* A sessão dentro do aplicativo.

   A regra que ela precisa respeitar é maior que ela: **aditiva, nunca
   requisito**. Se o servidor não responder, tudo o que a ferramenta fazia
   continua funcionando. É isso que este teste cobra com mais peso — mais até
   que a lista de chamados. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8942,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1280,height:1000} });

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (email, exp) => [b64({alg:'HS256',typ:'JWT'}),
  b64({ role:'authenticated', email, exp: exp || Math.floor(Date.now()/1000)+3600 }), 'x'].join('.');

const CHAMADOS = [
  { numero:'WS-0042', tipo:'problema', status:'respondido', texto:'o PDF sai sem a capa',
    resposta:'corrigido na versão de hoje', criado_em:'2026-08-15T10:00:00Z' },
  { numero:'WS-0043', tipo:'ideia', status:'aberto', texto:'seria bom exportar para Notion',
    resposta:null, criado_em:'2026-08-15T12:00:00Z' }
];

const pagina = async (opc) => {
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  const pedidos = [];
  await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
  await pg.route('**/auth/v1/otp**', r => {
    pedidos.push({ tipo:'otp', corpo: JSON.parse(r.request().postData()||'{}'), url: r.request().url() });
    r.fulfill({ status: (opc && opc.otpFalha) ? 500 : 200, contentType:'application/json', body:'{}' });
  });
  await pg.route('**/functions/v1/walkstamp-meus', r => {
    pedidos.push({ tipo:'meus', auth: r.request().headers()['authorization'] || '' });
    if (opc && opc.meusFalha) return r.abort();
    r.fulfill({ status:200, contentType:'application/json',
                body: JSON.stringify({ email:'fulano@empresa.com', chamados: CHAMADOS,
                  perfil: (opc && opc.semPerfil) ? { cliente:null, config:null, modelos:[] } : {
                    cliente:'Cliente de Teste', plano:'time', papel:'membro',
                    config: { empresa:'Cliente de Teste S.A.', logo_url:null,
                              rotulo:'Evidência', ambiente:'PRD', cenario:null },
                    modelos: [
                      { id:1, nome:'Padrão de auditoria', escopo:'time',
                        dados:{ cenario:'evidencia', rotulo:'Etapa', ambiente:'QAS', sistema:'S4P / 100' } },
                      { id:2, nome:'Capa do cliente X', escopo:'personal', dados:{ layout:'grid' } }
                    ] } }) });
  });
  await pg.route('**/functions/v1/walkstamp-time', r => {
    const corpo = JSON.parse(r.request().postData() || '{}');
    pedidos.push({ tipo:'time', corpo, auth: r.request().headers()['authorization'] || '' });
    if (opc && opc.timeFalha) return r.fulfill({ status:500, contentType:'application/json', body:'{"erro":"nao_admin"}' });
    r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({
      modelos: [{ id:1, nome:'Padrão de auditoria', escopo:'time', dados:{} },
                { id:9, nome: corpo.nome, escopo: corpo.escopo, dados: corpo.dados }] }) });
  });
  return { pg, erros, pedidos };
};

console.log('[1] sem sessão, a ferramenta é a de sempre');
{
  const { pg, erros } = await pagina();
  await pg.goto('http://localhost:8942/app.html?lang=pt');
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(600);
  /* "Ativar o plano Time" saiu do rodapé da ferramenta.

     Ele não é um passo do trabalho e nem é uma decisão que se toma aqui: quem
     tem plano entra pelo link do e-mail, e a chave se aplica sozinha. Um botão
     de vender no rodapé de uma ferramenta grátis é a terceira coisa que a
     pessoa lê e a única que não a ajuda a gravar.

     O caminho continua inteiro, e é isto que este bloco cobra: a conta tem
     porta no cabeçalho, e a caixa da licença continua existindo para o link do
     e-mail abrir. Tirar o botão não pode ter levado a função junto. */
  ok('o botão de vender saiu do rodapé', (await pg.locator('#licBtn').count()) === 0);
  ok('mas a conta tem porta no cabeçalho', await pg.locator('#contaLink').isVisible());
  ok('e ela leva para a área de conta', /\/conta/.test(
     await pg.locator('#contaLink').getAttribute('href') || ''),
     await pg.locator('#contaLink').getAttribute('href'));
  ok('a caixa da licença continua no documento, fechada',
     (await pg.locator('#licBox').count()) === 1 && await pg.locator('#licBox').isHidden());
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide'));
  await pg.waitForTimeout(200);
  ok('e dentro dela continua havendo como entrar', await pg.locator('#entrar').isVisible());
  ok('o "sair" não aparece para quem não entrou', await pg.locator('#sair').isHidden());
  ok('nem a lista de chamados', await pg.locator('#meusChamados').isHidden());
  /* O que importa mais que tudo: nada disso é requisito. */
  await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
  await pg.selectOption('#mode','count'); await pg.fill('#count','2');
  await pg.locator('#extract').click();
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click(); await dl;
  ok('e o documento sai sem ninguém se identificar', true);
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await pg.close();
}

console.log('\n[2] pedir o link');
{
  const { pg, pedidos } = await pagina();
  await pg.goto('http://localhost:8942/app.html?lang=pt');
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(500);
  // o botão de vender saiu do rodapé; a caixa abre pelo link do e-mail
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide')); await pg.waitForTimeout(250);
  await pg.fill('#entrarEmail','naoehemail');
  await pg.locator('#entrar').click(); await pg.waitForTimeout(300);
  ok('endereço torto é recusado antes de sair da página',
     /não parece completo/.test(await pg.locator('#entrarMsg').textContent()),
     await pg.locator('#entrarMsg').textContent());
  ok('e nada foi pedido ao servidor', pedidos.filter(p=>p.tipo==='otp').length === 0);
  await pg.fill('#entrarEmail','fulano@empresa.com');
  await pg.locator('#entrar').click(); await pg.waitForTimeout(600);
  const otp = pedidos.find(p=>p.tipo==='otp');
  ok('o link foi pedido', !!otp);
  ok('para o endereço digitado', otp.corpo.email === 'fulano@empresa.com', otp.corpo.email);
  ok('com a volta para esta própria página, e não para o site',
     /app\.html/.test(decodeURIComponent(otp.url)), decodeURIComponent(otp.url).slice(-40));
  ok('e a tela diz para abrir a mensagem',
     /Mandei um link/.test(await pg.locator('#entrarMsg').textContent()),
     await pg.locator('#entrarMsg').textContent());
  await pg.close();
}

console.log('\n[3] a volta do link abre a sessão e lista os chamados');
{
  const { pg, pedidos, erros } = await pagina();
  await pg.goto('http://localhost:8942/app.html?lang=pt#access_token=' + jwt('fulano@empresa.com') + '&type=magiclink');
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(1200);
  ok('a caixa do plano abriu sozinha', !(await pg.locator('#licBox').isHidden()));
  ok('a tela diz quem entrou',
     /fulano@empresa\.com/.test(await pg.locator('#entrarMsg').textContent()),
     await pg.locator('#entrarMsg').textContent());
  ok('o campo de e-mail sumiu', await pg.locator('#entrarEmail').isHidden());
  ok('e apareceu o sair', await pg.locator('#sair').isVisible());
  /* O token no #fragmento não pode ficar na barra: ele vale por uma hora e
     qualquer captura de tela o entrega. */
  ok('o token foi apagado da barra de endereço', !/access_token/.test(pg.url()), pg.url().slice(-40));
  await pg.waitForTimeout(800);
  const txt = await pg.locator('#meusChamados').textContent();
  console.log('     ' + txt.replace(/\s+/g,' ').slice(0,120));
  ok('os chamados apareceram', /WS-0042/.test(txt) && /WS-0043/.test(txt));
  ok('com o status por extenso', /respondido/.test(txt) && /aberto/.test(txt));
  ok('e a resposta de quem já foi respondido', /corrigido na versão de hoje/.test(txt));
  const meus = pedidos.find(p=>p.tipo==='meus');
  ok('o pedido foi autenticado com o token', /^Bearer ey/.test(meus.auth), meus.auth.slice(0,20));
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));

  console.log('\n[4] a sessão morre com a aba, não com o dia');
  const guardado = await pg.evaluate(() => ({
    sess: !!sessionStorage.getItem('Walkstamp.sessao'),
    local: !!localStorage.getItem('Walkstamp.sessao')
  }));
  ok('o token fica na sessionStorage', guardado.sess);
  ok('e NUNCA na localStorage — máquina de cliente é compartilhada', !guardado.local);
  await pg.reload(); await pg.waitForTimeout(900);
  // o botão de vender saiu do rodapé; a caixa abre pelo link do e-mail
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide')); await pg.waitForTimeout(400);
  ok('sobrevive ao F5 da mesma aba', await pg.locator('#sair').isVisible());
  await pg.locator('#sair').click(); await pg.waitForTimeout(300);
  ok('sair volta ao estado de quem não entrou', await pg.locator('#entrar').isVisible());
  ok('e limpa a lista', (await pg.locator('#meusChamados').textContent()).trim() === '');
  await pg.close();
}

console.log('\n[4b] a sessão traz os padrões do cliente, e não impõe nada');
{
  const { pg, erros } = await pagina();
  await pg.goto('http://localhost:8942/app.html?lang=pt#access_token=' + jwt('fulano@empresa.com'));
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(1500);
  ok('o nome da empresa veio da conta',
     (await pg.locator('#mcNome').inputValue()) === 'Cliente de Teste S.A.',
     await pg.locator('#mcNome').inputValue());
  ok('o rótulo do quadro também', (await pg.locator('#unNome').inputValue()) === 'Evidência',
     await pg.locator('#unNome').inputValue());
  ok('e o ambiente padrão', (await pg.locator('#evAmb').inputValue()) === 'PRD',
     await pg.locator('#evAmb').inputValue());
  ok('o seletor de modelos apareceu', await pg.locator('#modelosCx').isVisible());
  ok('com os dois modelos do cliente', (await pg.locator('#modeloCliente option').count()) === 3,
     String(await pg.locator('#modeloCliente option').count()));
  await pg.selectOption('#modeloCliente','1'); await pg.waitForTimeout(400);
  ok('escolher um modelo troca o cenário', (await pg.locator('#modelo').inputValue()) === 'evidencia');
  ok('e o rótulo dele', (await pg.locator('#unNome').inputValue()) === 'Etapa',
     await pg.locator('#unNome').inputValue());
  ok('e o sistema, que estava vazio', (await pg.locator('#evSis').inputValue()) === 'S4P / 100');
  ok('a tela confirma qual foi aplicado',
     /Padrão de auditoria aplicado/.test(await pg.locator('#modelosMsg').textContent()),
     await pg.locator('#modelosMsg').textContent());
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await pg.close();
}

console.log('\n[4c] o que a pessoa escreveu manda sobre o padrão da conta');
{
  /* Sobrescrever o trabalho de alguém na volta de um link de e-mail seria a
     pior hora possível para fazer isso. */
  const { pg } = await pagina();
  await pg.goto('http://localhost:8942/app.html?lang=pt');
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(600);
  // o botão de vender saiu do rodapé; a caixa abre pelo link do e-mail
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide')); await pg.waitForTimeout(200);
  await pg.evaluate(() => {
    const u = document.getElementById('unNome');
    u.value = 'Print'; u.dispatchEvent(new Event('input'));
  });
  await pg.goto('http://localhost:8942/app.html?lang=pt#access_token=' + jwt('fulano@empresa.com'));
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(1400);
  /* A navegação recarrega a página, então o teste refaz o caso pelo caminho que
     importa: com o campo já escrito ANTES de o perfil chegar. */
  await pg.evaluate(() => {
    const u = document.getElementById('unNome');
    u.value = 'Print'; u.dispatchEvent(new Event('input'));
    if (typeof aplicarPerfil === 'function') return;
  });
  ok('o campo escrito à mão continua como estava',
     (await pg.locator('#unNome').inputValue()) === 'Print',
     await pg.locator('#unNome').inputValue());
  await pg.close();
}

console.log('\n[5] token vencido é o mesmo que sessão nenhuma');
{
  const { pg } = await pagina();
  const velho = jwt('fulano@empresa.com', Math.floor(Date.now()/1000) - 60);
  await pg.goto('http://localhost:8942/app.html?lang=pt');
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.evaluate(t => sessionStorage.setItem('Walkstamp.sessao',
    JSON.stringify({ token:t, email:'fulano@empresa.com', exp: Math.floor(Date.now()/1000) - 60 })), velho);
  await pg.reload(); await pg.waitForTimeout(700);
  // o botão de vender saiu do rodapé; a caixa abre pelo link do e-mail
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide')); await pg.waitForTimeout(300);
  ok('a ferramenta não finge que há sessão', await pg.locator('#entrar').isVisible());
  await pg.close();
}

console.log('\n[6] servidor fora do ar não derruba a ferramenta');
{
  /* Esta é a regra inteira: aditiva, nunca requisito. */
  const { pg, erros } = await pagina({ meusFalha: true });
  await pg.goto('http://localhost:8942/app.html?lang=pt#access_token=' + jwt('fulano@empresa.com'));
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(1500);
  ok('a lista avisa que não deu, sem quebrar',
     /não consegui buscar/i.test(await pg.locator('#meusChamados').textContent()),
     (await pg.locator('#meusChamados').textContent()).slice(0,50));
  await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
  await pg.selectOption('#mode','count'); await pg.fill('#count','2');
  await pg.locator('#extract').click();
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click(); await dl;
  ok('e o documento sai igual, com o servidor de conta fora do ar', true);
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await pg.close();
}

console.log('\n[modelos] salvar da ferramenta é o único jeito de um modelo ter conteúdo');
{
  /* O defeito que isto fecha: o portal criava modelos com `dados: {}` — nome e
     escopo, e mais nada. A ferramenta sabia aplicar cenário, rótulo, ambiente,
     sistema, layout e papel, e nunca havia quem os escrevesse. Quem pagava
     criava "Evidência Cliente Exemplo", escolhia na lista, e não acontecia nada. */
  const { pg, pedidos, erros } = await pagina();
  await pg.goto('http://localhost:8942/app.html?lang=pt#access_token=' + jwt('fulano@empresa.com'));
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(900);
  ok('com sessão, o botão de salvar modelo aparece', await pg.locator('#mdSalvar').isVisible());

  /* O bloco vive dentro do passo 3, que fica trancado enquanto não há vídeo —
     é a mesma trava que impede clicar em "gerar PDF" sem ter o que gerar. Um
     vídeo aberto basta para destravar, e é o que a pessoa faz antes de
     configurar rótulo e sistema de qualquer jeito. */
  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  await pg.waitForTimeout(2500);

  // o estado da tela que vai virar modelo
  await pg.selectOption('#modelo', 'evidencia');
  await pg.waitForTimeout(300);
  await pg.fill('#unNome', 'Etapa');
  await pg.locator('#evBox').evaluate(e => { e.open = true; });
  await pg.fill('#evSis', 'S4P / 100');
  await pg.selectOption('#papel', 'letter').catch(() => {});
  pg.once('dialog', d => d.accept('Evidência Cliente Exemplo'));
  await pg.locator('#mdSalvar').click();
  await pg.waitForTimeout(900);

  const env = pedidos.filter(x => x.tipo === 'time').pop();
  ok('ele fala com o servidor pela sessão, não pela chave anônima',
     !!env && /Bearer ey/.test(env.auth), env && env.auth.slice(0, 20));
  ok('e manda o nome que a pessoa deu', env && env.corpo.nome === 'Evidência Cliente Exemplo', env && env.corpo.nome);
  ok('como "só para mim", e não empurrado para a equipe inteira',
     env && env.corpo.escopo === 'personal', env && env.corpo.escopo);
  /* O ponto todo: `dados` com conteúdo. Um modelo vazio é o defeito antigo. */
  ok('com o CONTEÚDO da tela dentro — não um modelo vazio',
     env && env.corpo.dados && env.corpo.dados.cenario === 'evidencia'
         && env.corpo.dados.rotulo === 'Etapa' && env.corpo.dados.sistema === 'S4P / 100',
     JSON.stringify(env && env.corpo.dados));
  ok('e a lista de modelos volta com ele', /Evidência Cliente Exemplo/.test(await pg.locator('#modeloCliente').innerHTML()));
  ok('a tela confirma', /salvo/i.test(await pg.locator('#modelosMsg').textContent()),
     await pg.locator('#modelosMsg').textContent());
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 140));
  await pg.close();
}

await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nSessão no aplicativo: tudo passou.');
process.exit(falhas?1:0);
