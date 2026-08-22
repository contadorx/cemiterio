/* O convite por e-mail — o único ponto do produto em que alguma coisa sai daqui.
 *
 * Este arquivo existe por um motivo que não é técnico: a ferramenta promete que
 * nada sai do computador de quem usa, e essa promessa é o produto. Abrir um
 * endereço que manda e-mail é a única exceção que já foi feita a ela, e uma
 * exceção não declarada é uma mentira. Então o que se cobra aqui, antes de
 * qualquer coisa, é que a exceção esteja ESCRITA — na tela do formulário e na
 * página de privacidade — e que o que sai seja só o endereço de destino.
 *
 * Depois disso, as travas. Um endereço que manda e-mail para quem for pedido é
 * um relé de spam e vira um em uma semana:
 *   - recusa quem não vem do nosso site;
 *   - recusa quando falta segredo, em vez de abrir;
 *   - não aceita mensagem livre — só destinatário e um nome;
 *   - e conta por origem e por destinatário, guardando hash e não valor.
 */
import { chromium } from 'playwright';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const BASE = 'http://localhost:8802';
const APP = `${RAIZ_WS}/public/app.html`;
const ROTA = `${RAIZ_WS}/app/api/convite/route.ts`;

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const app = fs.readFileSync(APP, 'utf8');
const rota = fs.readFileSync(ROTA, 'utf8');

console.log('[1] a exceção está escrita, e é só o endereço de destino');
{
  /* A frase tem que estar NO FORMULÁRIO, e não só na página de privacidade:
     quem digita um e-mail dentro de uma ferramenta que promete não enviar nada
     merece a explicação na mesma tela, e não numa página que ninguém abre. */
  ok('a tela do convite tem uma nota própria', /id="compEmailNota"/.test(app));
  ok('e ela diz que é o único ponto em que algo sai',
     /único ponto da ferramenta em que alguma coisa sai/.test(app));
  ok('e diz o que NÃO sai', /Nem vídeo, nem transcrição, nem documento/.test(app));

  /* O que o navegador manda: só destinatário, quem indica e o idioma. Nenhum
     campo de documento, nenhum campo de mensagem. */
  const envio = app.match(/JSON\.stringify\(\{ para[^}]*\}\)/);
  ok('o pedido leva só para, quem e lang', !!envio && /para, quem[^}]*lang/.test(envio[0]),
     envio ? envio[0].slice(0, 90) : 'não achei o corpo do pedido');
  ok('não há campo de mensagem livre na tela', !/id="compMensagem"/.test(app));
}

console.log('\n[2] as travas do servidor');
{
  ok('recusa quem não vem do nosso site', /function daCasa/.test(rota));
  /* E a origem vem ANTES dos segredos: responder 503 para quem não é da casa
     entrega de graça que existe um serviço aqui esperando uma chave. */
  ok('e confere a origem antes de conferir os segredos',
     rota.indexOf('if (!daCasa(req))') < rota.indexOf('if (!temTudo)'));
  ok('faltando segredo, recusa em vez de abrir', /if \(!temTudo\)[\s\S]{0,180}status: 503/.test(rota));
  ok('conta por origem e por destinatário', /walkstamp_convite_pode/.test(rota));
  /* Banco fora do ar não pode virar permissão para mandar à vontade. */
  ok('banco mudo NÃO vira permissão',
     /permitido === null[\s\S]{0,140}status: 503/.test(rota));
  ok('guarda hash, e não o endereço', /createHash\('sha256'\)/.test(rota));
  ok('com sal do ambiente', /CONVITE_SAL/.test(rota));
  /* O corpo é nosso, sempre. Um endereço que manda texto livre com o nosso
     remetente é um envelope aberto: o conteúdo é de quem chamou e a reputação
     queimada é a nossa. */
  ok('o corpo do e-mail é escrito no servidor', /const TEXTOS/.test(rota));
  ok('e o nome recebido é limpo e curto', /replace\(\/\[\\r\\n<>\]\/g/.test(rota));
  /* O disparo saiu da rota e virou `lib/email.ts` — ha um segundo e-mail no
     produto agora (o aviso de chamado respondido). A REGRA nao mudou de lugar:
     o corpo do erro do servico as vezes traz o endereco de destino, e a tela e
     de quem enviou, nao de quem recebe. Entao a prova passou a olhar os dois
     arquivos: o log existe no disparador, e a rota nao devolve detalhe. */
  const disparador = fs.readFileSync(`${RAIZ_WS}/lib/email.ts`, 'utf8');
  ok('o erro do serviço vai para o log', /console\.error\('email:/.test(disparador));
  ok('e a rota devolve só "envio", sem o corpo do erro',
     /erro: 'envio'/.test(rota) && !/detalhe:[^\n]*enviado|await r\.text\(\)/.test(rota));
}

console.log('\n[3] o servidor recusa de verdade');
{
  const bate = async (h, corpo) => (await fetch(BASE + '/api/convite', {
    method: 'POST', headers: { 'content-type': 'application/json', ...h },
    body: JSON.stringify(corpo),
  })).status;
  ok('sem origem: 403', (await bate({}, { para: 'a@b.com' })) === 403);
  ok('origem de fora: 403', (await bate({ origin: 'https://mau.example' }, { para: 'a@b.com' })) === 403);
  /* Com a origem certa e sem as variáveis configuradas, 503 — que é o estado
     desta máquina de teste e é o estado certo. */
  const nosso = await bate({ origin: 'https://walkstamp.com' }, { para: 'a@b.com', lang: 'pt' });
  ok('do nosso site, sem chave: 503 (e não 200)', nosso === 503, String(nosso));
}

console.log('\n[4] a página de privacidade declara a exceção, nas cinco');
{
  const ROTAS = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/rotas.json`, 'utf8'));
  const PROVA = {
    pt: /convite por e-mail/i, en: /email invitation/i, es: /invitación por correo/i,
    de: /Einladung per E-Mail/i, fr: /invitation par e-mail/i,
  };
  const HASH = {
    pt: /hash/i, en: /hash/i, es: /hash/i, de: /Hash/i, fr: /empreinte|hash/i,
  };
  for (const L of ROTAS.idiomas) {
    const u = (L === 'pt' ? '' : '/' + L) + '/' + ROTAS.slugs.privacidade[L];
    const r = await fetch(BASE + u);
    ok(`${L}: a página responde`, r.status === 200, `${u} → ${r.status}`);
    const html = await r.text();
    ok(`${L}: fala do convite por e-mail`, PROVA[L].test(html));
    ok(`${L}: diz que guarda hash, e não o endereço`, HASH[L].test(html));
    ok(`${L}: e o prazo de sete dias`, /7 dias|sete dias|seven days|siete días|sieben Tagen|sept jours/i.test(html));
  }
}

console.log('\n[5] o mailto continua existindo — como reserva, não como caminho');
{
  ok('há um mailto guardado', /const mailto = 'mailto:\?subject='/.test(app));
  ok('e ele é usado quando o servidor não responde', /caiNoMailto\('compSemServidor'\)/.test(app));
  /* O pacote offline abre de file:// e não tem rede: nem tenta. Um convite que
     só funciona com internet, numa ferramenta que se orgulha de funcionar sem
     ela, seria uma contradição. */
  ok('e de file:// vai direto para o programa de e-mail',
     /location\.protocol === 'file:'[\s\S]{0,60}caiNoMailto\('compSemRede'\)/.test(app));
  /* Limite estourado NÃO cai no mailto: cair seria transformar uma recusa
     deliberada em "tente por outro caminho", que é o contrário de um limite. */
  /* Recorta SÓ o galho do 429 — do `{` dele até o `} else {` seguinte. A
     primeira versão desta linha usava uma janela de 200 caracteres e ela
     atravessava para dentro do `else`, achando lá o `caiNoMailto` do erro
     genérico e reprovando um código correto. Regex com janela fixa em cima de
     código é isso: mede distância, não estrutura. */
  const galho429 = (app.match(/r\.status === 429\) \{([\s\S]*?)\n\s*\} else \{/) || [])[1] || '';
  ok('o galho do 429 existe', galho429.length > 0);
  ok('ele mostra a frase do limite', /compLimite/.test(galho429));
  ok('e NÃO cai no mailto: um limite com desvio não é limite',
     !/caiNoMailto/.test(galho429), galho429.slice(0, 80));
}

console.log('\n[6] o documento para pôr isso de pé existe');
{
  const doc = fs.readFileSync(`${RAIZ_WS}/CONVITE-POR-EMAIL.md`, 'utf8');
  ok('tem o SQL da tabela', /create table if not exists public\.convite_envio/.test(doc));
  ok('com a função de limite', /walkstamp_convite_pode/.test(doc));
  /* Regra de servidor, e só de servidor: se o navegador pudesse chamar,
     bastaria chamar com hashes inventados para zerar o limite a cada pedido. */
  ok('e ela é revogada de anon e authenticated',
     /revoke all on function public\.walkstamp_convite_pode[\s\S]{0,80}anon, authenticated/.test(doc));
  ok('só o service_role executa', /grant execute[\s\S]{0,60}to service_role/.test(doc));
  ok('lista as variáveis de ambiente', /BREVO_API_KEY/.test(doc) && /CONVITE_SAL/.test(doc));
  /* O documento e a unica coisa que a pessoa le antes de configurar. Se ele
     ainda falar do servico antigo, ela configura o antigo — e o produto recusa
     com um 503 que ela nao vai entender. */
  ok('e nao fala mais do serviço antigo', !/Resend|RESEND_/.test(doc));
  ok('e diz o que acontece se faltarem', /o app cai no `mailto:`/.test(doc));
}

console.log('\n[7] o LinkedIn continua sem passar por nós');
{
  ok('o link é montado no navegador',
     /linkedin\.com\/sharing\/share-offsite/.test(app));
  ok('e leva o endereço do site, não um documento',
     /share-offsite\/\?url=' \+ encodeURIComponent\(url\)/.test(app));
}

const br = await chromium.launch({
  executablePath: CHROME_WS,
});
console.log('\n[8] o formulário aparece e valida antes de gastar uma ida ao servidor');
{
  const pg = await (await br.newContext()).newPage();
  const idas = [];
  await pg.route('**/api/convite', r => { idas.push(1); r.fulfill({ status: 503, body: '{}' }); });
  await pg.goto(BASE + '/app.html?lang=pt');
  await pg.evaluate(() => {
    /* O convite nasce escondido e só aparece depois de a pessoa baixar alguma
       coisa — este teste é sobre o formulário, não sobre o gatilho. */
    document.getElementById('compCx').classList.remove('hide');
  });
  await pg.waitForTimeout(200);
  ok('o botão de e-mail existe', (await pg.locator('#compEmailAbrir').count()) === 1);
  ok('e o formulário começa fechado',
     await pg.locator('#compEmailCx').evaluate(e => e.classList.contains('hide')));
  await br.close();
  ok('nenhuma ida ao servidor sem alguém pedir', idas.length === 0, String(idas.length));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nConvite por e-mail: tudo passou.');
process.exit(falhas ? 1 : 0);
