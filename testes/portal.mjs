/* O portal do cliente — assentos, convite, faturas, padrões, modelos e
 * histórico —, agora que ele mora num lugar só.
 *
 * POR QUE ESTE ARQUIVO FOI REESCRITO. O mesmo painel existia duas vezes: na
 * `/time`, em JavaScript no navegador com o JWT do link mágico na mão, falando
 * com a Edge Function `walkstamp-time`; e na `/conta`, em Server Actions, com o
 * e-mail vindo da sessão. Duas telas para o mesmo painel divergem — é questão
 * de tempo até uma ganhar um conserto que a outra não tem.
 *
 * Ficou a de `/conta`, que é a que não confia em nada que o navegador diga. Este
 * teste seguiu o painel: as mesmas perguntas de antes, feitas na tela nova. E
 * ganhou uma pergunta que não existia — que o painel de fato SUMIU da `/time`,
 * porque duplicação removida sem teste volta na próxima rodada.
 *
 * O que ele NÃO prova: as regras de servidor (`nao_admin`, `sem_assento`,
 * `fora_do_cliente`, `nao_a_si`). Elas moram no Postgres e são provadas lá —
 * uma página que "esconde o botão" não é controle de acesso.
 */
import { chromium } from './_navegador.mjs';
import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
/* O menu sai do `rotas.json`, a mesma tabela que o painel usa. Escrito aqui,
   seria a lista de mentira ao lado da de verdade. */
const MENU_CONTA = JSON.parse(
  fs.readFileSync(`${RAIZ_WS}/src/rotas.json`, 'utf8')).menuConta;

const P = 8817, B = 8818;
const BASE = `http://localhost:${P}`;

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* ----------------------------------------------------------- o banco falso */

const chamadas = [];
let QUEM = 'chefe@teste-portal.example';
let RECUSA = null;   // o erro que a próxima ação de time vai receber

const PESSOAS = () => ([
  { email: 'ana@teste-portal.example', papel: 'membro', ativo: true, admin: false,
    ultima_em: '2026-08-15T19:20:30Z', vence_em: '2026-11-13' },
  { email: 'chefe@teste-portal.example', papel: 'admin', ativo: true, admin: true,
    ultima_em: '2026-08-15T19:20:30Z', vence_em: '2026-11-13' },
]);

const conta = (mudar = {}) => ({
  email: QUEM, plano: 'time', assentos: 3, dias: 90, cliente: 'Cliente de Teste',
  motivo: 'conta', papel: 'admin', vence_em: '2026-11-13', emissoes: 2, assinante: true,
  perfil: { cliente: 'Cliente de Teste', config: null, modelos: [] },
  faturas: [
    { numero: '2026-002', valor: 104700, moeda: 'BRL', status: 'em aberto', vence_em: '2026-09-10',
      pago_em: null, nf_url: null, nf_numero: null, criado_em: '2026-08-16T10:00:00Z' },
    { numero: '2026-001', valor: 104700, moeda: 'BRL', status: 'paga', vence_em: '2026-08-10',
      pago_em: '2026-08-15T19:20:30Z', nf_url: 'https://financeirox.example/nf/2026-001.pdf',
      nf_numero: 'NFSe 4417', criado_em: '2026-07-16T10:00:00Z' },
  ],
  chamados: [], resposta: null,
  time: {
    cliente: 'Cliente de Teste', assentos: 3, usados: 2, dias: 90,
    dominios: ['teste-portal.example'],
    config: { empresa: 'Cliente de Teste S.A.', logo_url: 'https://x/logo.png',
              cenario: 'evidencia', rotulo: 'Passo', ambiente: 'QAS' },
    pessoas: PESSOAS(),
    modelos: [
      { id: 5, nome: 'Padrão de auditoria', escopo: 'time', dados: { cenario: 'evidencia' } },
      { id: 6, nome: 'Meu rascunho', escopo: 'personal', dados: {} },
    ],
    emissoes: [
      { email: 'ana@teste-portal.example', vence_em: '2026-11-13', dias: 90, criado_em: '2026-08-15T19:20:30Z' },
      { email: 'chefe@teste-portal.example', vence_em: '2026-11-13', dias: 90, criado_em: '2026-08-14T19:20:30Z' },
    ],
    ...mudar,
  },
});
let CONTA = conta();

const banco = http.createServer((q, r) => {
  const p = [];
  q.on('data', (d) => p.push(d));
  q.on('end', () => {
    const j = (o) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url.startsWith('/auth/v1/user')) {
      if (!QUEM) { r.writeHead(401); return r.end('{}'); }
      return j({ id: 'u', aud: 'authenticated', email: QUEM });
    }
    const fn = q.url.replace('/rest/v1/rpc/', '');
    const args = JSON.parse(Buffer.concat(p).toString('utf8') || '{}');
    chamadas.push({ fn, args, auth: q.headers.authorization || '' });
    if (fn === 'walkstamp_conta_do_usuario') return j(CONTA);
    if (fn.startsWith('walkstamp_time_')) {
      if (RECUSA) { const e = RECUSA; RECUSA = null; return j({ erro: e }); }
      return j({ ok: true });
    }
    j({});
  });
});
await new Promise((r) => banco.listen(B, r));

const matarPorta = () => { try { execSync(`fuser -k ${P}/tcp 2>/dev/null`); } catch {} };
matarPorta();
await new Promise((r) => setTimeout(r, 500));

const next = spawn('npx', ['next', 'start', '-p', String(P)], {
  cwd: `${RAIZ_WS}`, stdio: 'ignore',
  env: { ...process.env,
    SUPABASE_URL: `http://localhost:${B}`,
    SUPABASE_SERVICE_ROLE_KEY: 'chave_de_mentira',
    WALKSTAMP_SUPA_TESTE: `http://localhost:${B}` },
});
process.on('exit', () => { try { next.kill('SIGKILL'); } catch {} matarPorta(); banco.close(); });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/conta`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const br = await chromium.launch({ executablePath: CHROME_WS });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ctx = await br.newContext({ viewport: { width: 1200, height: 1400 } });
{
  const jwt = [b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ role: 'authenticated', email: QUEM, exp: Math.floor(Date.now() / 1000) + 3600 }), 'x'].join('.');
  const sess = { access_token: jwt, token_type: 'bearer', expires_in: 3600,
                 expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r',
                 user: { id: 'u', email: QUEM } };
  await ctx.addCookies([{ name: 'sb-localhost-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify(sess)).toString('base64'),
    domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }]);
}
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
/* Os formulários da conta são Server Actions: o `<form>` sai com `action=""` e
   quem sabe qual ação chamar é o JavaScript do Next, depois de hidratar. Clicar
   antes disso posta para a própria página e não acontece nada — foi o que este
   teste fez, e ficou dez segundos achando que o botão estava quebrado. Esperar
   a hidratação é esperar o React assumir o formulário. */
/* A conta virou um PAINEL com menu, e cada assunto tem a sua rota: assentos e
   modelos em `/conta/time`, faturas em `/conta/faturas`, chamados em
   `/conta/chamados`. Era tudo uma página de 484 linhas — quem entrava para ver
   uma fatura rolava por cima do plano, da chave de licença e da lista de
   assentos até achar.

   Por isso cada bloco daqui para baixo abre o endereço do seu assunto. */
const abrir = async (rota = '/conta') => {
  await pg.goto(BASE + rota, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(400);
};

/** Clica e espera a volta do Server Action, que sempre traz `feito` ou `erro`
 *  no endereço. Esperar `networkidle` não serve: ele resolve antes do
 *  redirecionamento e o teste lê a tela velha. */
async function enviar(seletor) {
  /* `.first()` porque vários botões legítimos compartilham o mesmo rótulo — dois
     modelos têm "Apagar", e o modo estrito do Playwright recusa a ambiguidade.
     Quem escolhe qual é o teste, e para estas ações o primeiro serve. */
  await pg.locator(seletor).first().click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
}
const corpo = () => pg.locator('body').innerText();

/* ------------------------------------------------------------------ provas */

console.log('[1] o painel SUMIU da /time — e ela virou o que é');
{
  const t = await (await fetch(`${BASE}/time`)).text();
  /* O nome da função ainda aparece — num COMENTÁRIO que conta o que foi
     tirado e por quê. O que não pode existir é a chamada. */
  ok('a /time não CHAMA mais a Edge Function do time', !t.includes('functions/v1/walkstamp-time'));
  ok('nem tem o painel dentro dela', !/tpAba|pintarPainel|tpConteudo/.test(t));
  ok('mas continua emitindo a chave, que é a porta de entrada',
     t.includes('walkstamp-licenca') && t.includes('tmEnviar'));
  ok('e aponta para a conta', /href="\/conta"/.test(t));
  for (const [rota, destino] of [['/en/team', '/en/account'], ['/es/equipo', '/es/cuenta']]) {
    const x = await (await fetch(BASE + rota)).text();
    ok(`${rota} aponta para ${destino}`, x.includes(`href="${destino}"`));
    ok(`${rota} também perdeu o painel`, !x.includes('functions/v1/walkstamp-time'));
  }
}

console.log('\n[2] quem não administra não vê painel de time');
{
  CONTA = { ...conta(), papel: 'membro', time: null };
  await abrir();
  const t = await corpo();
  ok('a conta abre', /Sua conta|Conta/i.test(t) || t.length > 100);
  ok('e o painel do time não aparece', !/assentos usados/.test(t));
  ok('sem convite nem bloqueio', await pg.locator('input[type="email"][name="email"]').count() === 0);
}

console.log('\n[3] o administrador vê o cliente, e o uso de assentos');
{
  CONTA = conta();
  /* O nome do cliente é do PLANO, e o plano ficou na raiz do painel: ele
     responde "que conta é esta", que é a primeira pergunta de quem entra. Os
     assentos são do time e foram para a rota do time. Duas perguntas
     diferentes, duas telas. */
  await abrir('/conta');
  ok('nomeando o CLIENTE', /Cliente de Teste/.test(await corpo()));
  await abrir('/conta/time');
  const t = await corpo();
  ok('com o domínio como detalhe, não como identidade', /teste-portal\.example/.test(t));
  ok('e o uso de assentos na cara', /2 de 3 assentos usados/.test(t),
     (t.match(/\d+ de \d+ assentos usados/) || [''])[0]);
  ok('a página diz que conteúdo nenhum passa por ali',
     /Nada do que você grava passa por aqui/.test(t));

  /* A regra que atravessa a área do cliente inteira, e que era a razão de
     aposentar o painel do navegador: o e-mail de quem administra vem da SESSÃO.
     Na /time ele vinha de um JWT que o próprio navegador carregava. */
  const c = chamadas.filter((x) => x.fn === 'walkstamp_conta_do_usuario').pop();
  ok('o painel é pedido com o e-mail da sessão', c.args.p_email === 'chefe@teste-portal.example',
     c.args.p_email);
  ok('e com a chave de SERVIÇO, não com a publicável',
     c.auth.includes('chave_de_mentira'), c.auth.slice(0, 24));
}

console.log('\n[4] convidar, e o limite de assento');
{
  await abrir('/conta/time');
  const antes = chamadas.length;
  await pg.locator('input[type="email"][name="email"]').first().fill('novo@teste-portal.example');
  await enviar('button:has-text("Convidar")');
  const c = chamadas.slice(antes).find((x) => x.fn === 'walkstamp_time_convidar');
  ok('o convite chega ao banco', !!c);
  ok('com o convidado', !!c && c.args.p_email === 'novo@teste-portal.example', c && c.args.p_email);
  ok('e o admin da sessão, nunca do formulário',
     !!c && c.args.p_admin === 'chefe@teste-portal.example', c && c.args.p_admin);

  RECUSA = 'sem_assento';
  await abrir('/conta/time');
  await pg.locator('input[type="email"][name="email"]').first().fill('quarto@teste-portal.example');
  await enviar('button:has-text("Convidar")');
  ok('o quarto é recusado com o motivo em português, não com um código',
     /assento livre/i.test(await corpo()), (await corpo()).slice(0, 90).replace(/\n/g, ' '));

  /* E-mail torto nem chega ao servidor: o campo é `type=email` e o navegador
     recusa o envio sozinho. É a primeira linha de defesa, e é de graça — o que
     este teste garante é que ela EXISTE, e não que a frase do servidor apareça
     num caminho que o navegador nunca deixa acontecer. */
  await abrir('/conta/time');
  const antesTorto = chamadas.length;
  await pg.locator('input[type="email"][name="email"]').first().fill('torto@');
  await pg.locator('button:has-text("Convidar")').click();
  await pg.waitForTimeout(800);
  ok('e-mail torto nem sai do navegador', !/[?&](feito|erro)=/.test(pg.url()), pg.url());
  ok('e não encosta no banco',
     !chamadas.slice(antesTorto).some((x) => x.fn === 'walkstamp_time_convidar'));

  /* Já o e-mail que É válido e o banco recusa por outro motivo: a frase tem que
     ser dele, e não um código. */
  RECUSA = 'ja_de_outro';
  await abrir('/conta/time');
  await pg.locator('input[type="email"][name="email"]').first().fill('de-outro@empresa.example');
  await enviar('button:has-text("Convidar")');
  ok('a recusa do banco vira frase, não código',
     !/ja_de_outro/.test(await corpo()) && (await corpo()).length > 100,
     (await corpo()).split('\n').find((l) => l.length > 20) || '');
}

console.log('\n[5] bloquear, e o prazo como controle real');
{
  CONTA = conta({ pessoas: PESSOAS().map((p) => (p.email.startsWith('ana') ? { ...p, ativo: false } : p)) });
  await abrir('/conta/time');
  const linhaAna = pg.locator('tr', { hasText: 'ana@teste-portal.example' }).first();
  ok('a linha da ana ficou riscada',
     /line-through/.test(await linhaAna.locator('td').first().getAttribute('style') || ''));
  ok('e o botão virou Liberar', /Liberar/.test(await linhaAna.locator('button').textContent()));

  /* Quem administra não pode se bloquear: a conta ficaria sem dono. O banco
     recusa também, e é lá que a regra mora — aqui o botão nem existe. */
  const linhaChefe = pg.locator('tr', { hasText: 'chefe@teste-portal.example' }).first();
  ok('o administrador não tem botão para bloquear a si mesmo',
     await linhaChefe.locator('button').count() === 0);

  const antes = chamadas.length;
  await pg.locator('input[name="dias"]').fill('7');
  await enviar('form:has(input[name="dias"]) button[type=submit]');
  const c = chamadas.slice(antes).find((x) => x.fn === 'walkstamp_time_ajustar');
  ok('salvar manda o prazo novo', !!c && c.args.p_dias === 7, c && String(c.args.p_dias));

  await abrir('/conta/time');
  const t = await corpo();
  ok('e a página explica o que o bloqueio NÃO faz', /PRÓXIMA emissão/.test(t));
  ok('com o motivo, não só a limitação', /prazo/i.test(t));
}

console.log('\n[6] faturas: a nota vem depois do pagamento');
{
  CONTA = conta();
  await abrir('/conta/faturas');
  const t = await corpo();
  ok('as duas faturas aparecem', /2026-001/.test(t) && /2026-002/.test(t));
  ok('com o valor em reais', /1\.047,00/.test(t), (t.match(/R\$[\s ]?[\d.,]+/) || [''])[0]);
  ok('e a situação por extenso', /em aberto/.test(t) && /paga/.test(t));
  const links = await pg.locator('a[href*="financeirox"]').count();
  ok('só a fatura paga tem link de nota', links === 1, String(links));
  ok('o número da nota fiscal está na tela', /NFSe 4417/.test(t));
  ok('e a página avisa que a nota sai depois do pagamento',
     /depois do pagamento/.test(t));
}

console.log('\n[7] padrões: o que é empurrado, e o que não é');
{
  /* Este bloco herdava a página do anterior. Com as seções em rotas próprias, o
     anterior deixa a tela em `/conta/faturas` — e a configuração do time não
     está lá. Herdar estado entre blocos de teste é o tipo de economia que
     funciona até o dia em que a tela muda de lugar. */
  /* Os padroes sairam da tela de `Time` e viraram a aba `Modelos`. Estavam no
     fim de uma tela cujo assunto e assento: quem entra em `Time` vem bloquear
     ou convidar alguem, e o logotipo da empresa ficava depois de tudo isso,
     onde ninguem rola. */
  await abrir('/conta/modelos');
  ok('a configuração veio preenchida',
     (await pg.locator('input[name="empresa"]').inputValue()) === 'Cliente de Teste S.A.');
  ok('inclusive o logotipo',
     (await pg.locator('input[name="logo_url"]').inputValue()) === 'https://x/logo.png');
  const t = await corpo();
  ok('a página diz que isso chega já preenchido', /empurrado/.test(t));

  const antes = chamadas.length;
  await pg.locator('input[name="rotulo"]').fill('Tela');
  await enviar('form:has(input[name="empresa"]) button[type=submit]');
  const c = chamadas.slice(antes).find((x) => x.fn === 'walkstamp_time_config');
  ok('salvar manda só os campos de padrão', !!c && c.args.p_config.rotulo === 'Tela',
     c && JSON.stringify(c.args.p_config));
  /* A lista é de PADRÃO, e a fronteira é essa: COMO o documento sai (empresa,
     logotipo, cenário, rótulo, ambiente, papel, layout, impressão digital,
     numeração) pode vir da conta; o QUE o documento diz — caso, chamado,
     transcrição, anotação, quadro — nunca. Conteúdo de cliente subindo para o
     servidor é a única promessa do produto que não tem meio-termo, e uma chave
     nova entrando aqui sem ninguém pensar nisso é exatamente como ela seria
     quebrada. Por isso a lista é fechada: campo novo reprova até ser lido. */
  const PADROES = ['empresa', 'logo_url', 'cenario', 'rotulo', 'ambiente',
                   'papel', 'layout', 'hash', 'numerar'];
  ok('e nada de conteúdo vai junto',
     !!c && Object.keys(c.args.p_config).every((k) => PADROES.includes(k)),
     c && Object.keys(c.args.p_config).join(','));
}

console.log('\n[8] modelos de documento — o que veio da /time');
{
  await abrir('/conta/modelos');
  const t = await corpo();
  ok('o modelo existente está listado', /Padrão de auditoria/.test(t));
  ok('marcado como do time', /todo o time/.test(t));
  ok('e o pessoal como só para mim', /só para mim/.test(t));
  /* O botão de CRIAR não existe aqui de propósito: o modelo nasce dentro da
     ferramenta, onde cenário, rótulo, sistema e papel já estão preenchidos.
     Criar um vazio aqui foi um defeito de verdade, e não pode voltar. */
  ok('não há como criar um modelo vazio por aqui',
     await pg.locator('input[name="nome"]').count() === 0);
  ok('e a página diz onde eles nascem', /dentro da ferramenta/.test(t));

  const antes = chamadas.length;
  await enviar('button:has-text("Apagar")');
  const c = chamadas.slice(antes).find((x) => x.fn === 'walkstamp_time_modelo');
  ok('apagar chega ao banco como apagar', !!c && c.args.p_apagar === true, c && JSON.stringify(c.args));
  ok('com o id do modelo', !!c && c.args.p_id === 5, c && String(c.args.p_id));
  ok('e o admin da sessão', !!c && c.args.p_admin === 'chefe@teste-portal.example');
}

console.log('\n[9] histórico de emissões — o outro que veio da /time');
{
  await abrir('/conta/time');
  const t = await corpo();
  ok('as emissões aparecem', /ana@teste-portal\.example/.test(t) && /chefe@/.test(t));
  ok('com a data', /15 de ago/.test(t) || /2026/.test(t), (t.match(/\d+ de \w+\.? de 2026/) || [''])[0]);
  ok('e o prazo de cada uma', /90/.test(t));
}

console.log('\n[10] a chave de licença, que também só existia na /time');
{
  await abrir();
  ok('o cartão da chave existe na conta', /chave de licença/i.test(await corpo()));
  ok('com o botão de emitir', await pg.locator('button:has-text("Emitir")').count() === 1);
  /* A tese do produto, escrita onde a pessoa decide: a chave é conferida no
     navegador dela e funciona offline. */
  ok('e a promessa junto', /offline/i.test(await corpo()));

  CONTA = { ...conta(), plano: null, motivo: 'teste_usado' };
  await abrir();
  ok('quem não tem plano não vê o botão de emitir',
     await pg.locator('button:has-text("Emitir")').count() === 0);
}

console.log('\n[11] os cinco idiomas: o menu, a rota do time e o rodapé');
/* Os endereços das sub-rotas saem do `rotas.json`, montado pelo `build.py`. É a
   MESMA tabela que o `next.config.mjs` usa para a ponte de reescrita e que o
   `lib/conta/nav.ts` usa para o menu — se o teste tivesse a própria cópia, ele
   passaria a provar que a cópia dele está certa, e não o produto. */
const ROTAS_JSON = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/rotas.json`, 'utf8'));
const RAIZ = { pt: '/conta', en: '/en/account', es: '/es/cuenta', de: '/de/konto', fr: '/fr/compte' };
for (const [L, menuTime] of [['pt', 'Time'], ['en', 'Team'], ['es', 'Equipo'],
                             ['de', 'Team'], ['fr', 'Équipe']]) {
  CONTA = conta();
  const rota = RAIZ[L] + '/' + ROTAS_JSON.subConta.time[L];
  await abrir(rota);
  const t = await corpo();
  ok(`${rota}: o painel abre`, /assentos|seats|asientos|plätze|sièges/i.test(t));
  ok(`${rota}: o menu está traduzido`, t.includes(menuTime), t.slice(0, 60).replace(/\n/g, ' '));
  /* O menu é a única coisa que diz O QUE EXISTE. Um item que some numa língua é
     uma função que deixa de existir só para quem lê naquela língua. */
  const itens = await pg.locator('.painelMenu a').count();
  /* O NUMERO NAO FICA ESCRITO AQUI.
     
     Ficava: `itens === 6`. No dia em que os padroes do documento viraram a aba
     `Modelos`, este teste caiu apontando "7" — sem que nada estivesse errado.
     Numero escrito a mao ao lado de uma lista de verdade e o defeito que este
     projeto mais repete, e num teste custa dobrado: falha no acerto e cala no
     erro.
     
     A conta certa sai da tabela: os itens que este cliente ve (todos menos o
     `negocio`, que e so do dono) mais a saida para a ferramenta. */
  const previstos = MENU_CONTA.filter((i) => i.quando !== 'dono').length + 1;
  ok(`${rota}: os ${previstos} do menu, e nem um a mais`, itens === previstos,
     `${itens} na tela, ${previstos} no rotas.json`);
  ok(`${rota}: e nada de aba de negócio para o cliente`,
     !/Neg[óo]cio|Business|Gesch[äa]ft|Activit[ée]/.test(
       await pg.locator('.painelMenu').innerText()));
  ok(`${rota}: o item aberto é o do time`,
     (await pg.locator('.painelMenu a.on').textContent() || '').trim() === menuTime,
     await pg.locator('.painelMenu a.on').textContent());
  /* Os modelos SAIRAM daqui: viraram a aba `Modelos`, junto do nome da empresa
     e do logotipo. Ver o bloco [8]. */
  ok(`${rota}: e os modelos NAO estao mais nesta tela`, !/Padrão de auditoria/.test(t));

  /* O rodapé é o mesmo do site, em três colunas. Ele era uma linha com três
     links — e a conta é onde a pessoa está quando lembra de procurar a política
     de privacidade ou a página que explica como conferir uma evidência. Ter que
     voltar para a home para achar o rodapé é o caminho que ninguém faz: fecha a
     aba. */
  const cols = await pg.locator('footer .rodapeCols > div').count();
  ok(`${rota}: o rodapé tem as três colunas do site`, cols === 3, String(cols));
  /* O numero de links NAO fica escrito aqui.
     
     Ficava: `links === 15`. No dia em que o rodape ganhou o link do blog, este
     teste caiu apontando "16" -- sem que nada estivesse errado. Um numero
     escrito a mao ao lado de uma lista de verdade e o defeito que este projeto
     mais repete; num teste ele custa dobrado, porque falha ruidosamente no
     acerto e cala no erro.
     
     O que importa e a promessa: o rodape da conta e O MESMO do site. Entao a
     conta e contra a home, e nao contra uma constante. */
  const daConta = await pg.locator('footer .rodapeCols a').evaluateAll(
    (as) => as.map((a) => a.textContent.trim()));
  const htmlHome = await (await fetch(BASE + (rota === '/conta' ? '/' : '/' + rota.split('/')[1]))).text();
  const bloco = (htmlHome.match(/<div class="rodapeCols">([\s\S]*?)<div class="rodapeFim"/) || ['', ''])[1];
  const daHome = [...bloco.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((x) => x[1].trim());
  ok(`  com os mesmos links da home (${daHome.length})`,
     daHome.length > 0 && JSON.stringify(daConta) === JSON.stringify(daHome),
     `conta ${daConta.length}: ${daConta.join(', ')} | home ${daHome.length}: ${daHome.join(', ')}`);

  /* E os endereços do rodapé têm que ser os DAQUELE idioma: `/de/precos` não
     existe — lá é `/de/preise`. Um rodapé traduzido apontando para o slug
     errado é um 404 em cada linha. */
  const hrefs = await pg.locator('footer .rodapeCols a').evaluateAll(
    (as) => as.map((a2) => a2.getAttribute('href')));
  /* O prefixo sai do IDIOMA, e não de fatiar o endereço. Enquanto a conta era
     uma página só, `rota.split('/')[1]` dava o idioma por coincidência; com
     sub-rotas (`/conta/time`) ele passou a dar "conta", e o teste reprovou o
     rodapé português inteiro. Contas com índice de fatia em cima de endereço
     são assim: funcionam até o endereço ganhar um pedaço. */
  const pre = L === 'pt' ? '' : '/' + L;
  const forasteiros = hrefs.filter((h) => h && h.startsWith('/') && !h.startsWith('/app')
    && !(pre ? h.startsWith(pre + '/') : /^\/[a-z]/.test(h) && !/^\/(en|es|de|fr)\//.test(h)));
  ok(`  todos no idioma da página`, forasteiros.length === 0, forasteiros.slice(0, 3).join(' '));

  const siglas = await pg.locator('header nav a').evaluateAll(
    (as) => as.map((a2) => a2.textContent.trim()).filter((x) => /^(PT|EN|ES|DE|FR)$/.test(x)));
  ok(`  e as cinco siglas no cabeçalho`, siglas.length === 5, siglas.join(' '));
}

ok('sem erro de JS em nenhuma tela', erros.length === 0, erros.join(' | ').slice(0, 180));

await br.close();
next.kill('SIGKILL'); matarPorta(); banco.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nPortal do cliente: tudo passou.');
process.exit(falhas ? 1 : 0);
