/* A faxina agendada: os prazos da política, e a tranca do endereço que apaga.
 *
 * ESCOPO. Um Next de verdade com um Supabase de mentira do outro lado. O que
 * este arquivo prova é o que só o Next pode errar, e é quase tudo sobre a
 * TRANCA — porque este é o único endereço do produto que apaga dado de cliente
 * sem ninguém clicar em nada:
 *
 *   - sem `CRON_SECRET` configurado ele RECUSA, em vez de ficar aberto. Um
 *     endpoint destrutivo que fica público quando falta uma variável de
 *     ambiente é o tipo de porta que ninguém percebe estar aberta;
 *   - com segredo configurado, sem o cabeçalho certo, 401 — e nada é chamado;
 *   - `?seco=1` conta e não apaga;
 *   - os arquivos dos anexos saem do balde de verdade, e o que falha continua
 *     na fila com o motivo;
 *   - o relatório que volta NÃO traz o caminho dos arquivos de cliente.
 *
 * O que ele NÃO prova: as regras do expurgo (quem entra no prazo, o que fica,
 * o que sai). Elas moram no Postgres e foram provadas lá, contra a migração
 * `expurgo_os_prazos_que_a_politica_promete` — sete cenários, incluindo o mais
 * importante deles: a fatura NÃO é apagada.
 */
import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS } from './_caminhos.mjs';
const P = 8821, B = 8822;
const BASE = `http://localhost:${P}`;
const SEGREDO = 'segredo-de-cron-de-teste';

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const chamadas = [];
const balde = new Map();
let quebrarApagar = false;
let RELATORIO = null;

const banco = http.createServer((q, r) => {
  const p = [];
  q.on('data', (d) => p.push(d));
  q.on('end', () => {
    const st = q.url.match(/^\/storage\/v1\/object\/roteiro\/(.+)$/);
    if (st && q.method === 'DELETE') {
      if (quebrarApagar) { r.writeHead(500); return r.end('{}'); }
      balde.delete(decodeURIComponent(st[1])); r.writeHead(200); return r.end('{}');
    }
    const fn = q.url.replace('/rest/v1/rpc/', '');
    const args = JSON.parse(Buffer.concat(p).toString('utf8') || '{}');
    chamadas.push({ fn, args });
    r.writeHead(200, { 'Content-Type': 'application/json' });
    if (fn === 'walkstamp_expurgo') return r.end(JSON.stringify(RELATORIO));
    r.end('1');
  });
});
await new Promise((r) => banco.listen(B, r));

/* Matar o `npx` não mata o Next: ele é um processo filho e sobrevive ao
   SIGKILL do pai. Sem isto, o segundo bloco conversava com o servidor do
   PRIMEIRO — e o teste dizia "falta CRON_SECRET" numa rodada que tinha o
   segredo configurado. Quem manda é a porta, não o pai. */
const matarPorta = () => { try { execSync(`fuser -k ${P}/tcp 2>/dev/null`); } catch {} };

/** Sobe um Next com (ou sem) o segredo, roda o que for pedido, e desce. */
async function comNext(env, corpo) {
  matarPorta();
  await new Promise((r) => setTimeout(r, 600));
  const n = spawn('npx', ['next', 'start', '-p', String(P)], {
    cwd: `${RAIZ_WS}`, stdio: 'ignore',
    env: { ...process.env,
      SUPABASE_URL: `http://localhost:${B}`,
      SUPABASE_SERVICE_ROLE_KEY: 'chave_de_mentira',
      WALKSTAMP_SUPA_TESTE: `http://localhost:${B}`,
      ...env },
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`${BASE}/api/faxina`); if (r.status) break; } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    await corpo();
  } finally {
    n.kill('SIGKILL');
    matarPorta();
    await new Promise((r) => setTimeout(r, 600));
  }
}

const relatorio = (faxina = []) => ({
  seco: false, contas: 2, roteiros: 3, casos: 12, anexos: faxina.length,
  usuarios: 5, modelos: 1, config: 1, dominios: 0, emissoes: 4, chamados: 2,
  lista_de_aviso: 7, marcos_de_uso: 130, faturas_mantidas: 6, faxina,
});

/* ------------------------------------------------------------------ provas */

console.log('[1] sem CRON_SECRET, o endereço que apaga NÃO fica aberto');
await comNext({ CRON_SECRET: '' }, async () => {
  chamadas.length = 0;
  const r = await fetch(`${BASE}/api/faxina`);
  ok('recusa com 503', r.status === 503, String(r.status));
  ok('e não chama o banco', chamadas.length === 0, JSON.stringify(chamadas.map((c) => c.fn)));
  const r2 = await fetch(`${BASE}/api/faxina`, { headers: { authorization: 'Bearer ' } });
  ok('nem com um "Bearer " vazio, que é o que uma variável em branco produziria',
     r2.status === 503, String(r2.status));
});

console.log('\n[2] com segredo, só passa quem tem o segredo');
await comNext({ CRON_SECRET: SEGREDO }, async () => {
  RELATORIO = relatorio();
  chamadas.length = 0;
  ok('sem cabeçalho, 401', (await fetch(`${BASE}/api/faxina`)).status === 401);
  ok('com o segredo errado, 401',
     (await fetch(`${BASE}/api/faxina`, { headers: { authorization: 'Bearer outro' } })).status === 401);
  ok('e nenhuma das duas encostou no banco', chamadas.length === 0,
     JSON.stringify(chamadas.map((c) => c.fn)));

  const r = await fetch(`${BASE}/api/faxina`, { headers: { authorization: `Bearer ${SEGREDO}` } });
  ok('com o segredo certo, 200', r.status === 200, String(r.status));
  const j = await r.json();
  ok('e o relatório volta com as contagens', j.contas === 2 && j.casos === 12, JSON.stringify(j).slice(0, 90));
});

console.log('\n[3] o modo seco conta e não manda apagar');
await comNext({ CRON_SECRET: SEGREDO }, async () => {
  RELATORIO = { ...relatorio(), seco: true, faxina: [] };
  chamadas.length = 0;
  const j = await (await fetch(`${BASE}/api/faxina?seco=1`,
    { headers: { authorization: `Bearer ${SEGREDO}` } })).json();
  const c = chamadas.find((x) => x.fn === 'walkstamp_expurgo');
  ok('o seco chega ao banco como seco', !!c && c.args.p_seco === true, JSON.stringify(c?.args));
  ok('e o relatório diz que foi seco', j.seco === true);
  ok('sem nenhuma ordem de faxina', !chamadas.some((x) => x.fn === 'walkstamp_anexo_faxinado'));
});

console.log('\n[4] os arquivos saem do balde de verdade');
await comNext({ CRON_SECRET: SEGREDO }, async () => {
  balde.clear();
  balde.set('11/um.json', Buffer.from('{}'));
  balde.set('12/dois.json', Buffer.from('{}'));
  RELATORIO = relatorio([{ id: 1, caminho: '11/um.json' }, { id: 2, caminho: '12/dois.json' }]);
  chamadas.length = 0;
  const j = await (await fetch(`${BASE}/api/faxina`,
    { headers: { authorization: `Bearer ${SEGREDO}` } })).json();
  ok('o balde ficou vazio', balde.size === 0, [...balde.keys()].join(','));
  ok('e o relatório conta quantos saíram', j.arquivos_apagados === 2, String(j.arquivos_apagados));
  const c = chamadas.find((x) => x.fn === 'walkstamp_anexo_faxinado' && x.args.p_erro === null);
  ok('a fila foi baixada no banco', !!c && c.args.p_ids.length === 2, JSON.stringify(c?.args));

  /* A informação que NÃO pode aparecer num log de execução. */
  const cru = JSON.stringify(j);
  ok('o relatório não traz o caminho de arquivo de cliente',
     !cru.includes('um.json') && !cru.includes('dois.json'), cru.slice(0, 120));
});

console.log('\n[5] o que o balde recusa continua na fila, com o motivo');
await comNext({ CRON_SECRET: SEGREDO }, async () => {
  balde.clear();
  balde.set('13/tres.json', Buffer.from('{}'));
  RELATORIO = relatorio([{ id: 9, caminho: '13/tres.json' }]);
  chamadas.length = 0;
  quebrarApagar = true;
  const j = await (await fetch(`${BASE}/api/faxina`,
    { headers: { authorization: `Bearer ${SEGREDO}` } })).json();
  quebrarApagar = false;
  ok('o arquivo continua lá', balde.has('13/tres.json'));
  ok('o relatório admite a falha', j.arquivos_que_falharam === 1 && j.arquivos_apagados === 0,
     JSON.stringify(j).slice(0, 120));
  const falhou = chamadas.find((x) => x.fn === 'walkstamp_anexo_faxinado' && x.args.p_erro);
  ok('e a fila guardou o motivo em vez de esquecer', !!falhou && falhou.args.p_ids.includes(9),
     JSON.stringify(falhou?.args));
  ok('sem declarar faxinado o que não foi',
     !chamadas.some((x) => x.fn === 'walkstamp_anexo_faxinado' && x.args.p_erro === null && x.args.p_ids.includes(9)));
});

console.log('\n[6] o disparo está configurado, e a política diz a verdade');
{
  const v = JSON.parse(fs.readFileSync(`${RAIZ_WS}/vercel.json`, 'utf8'));
  const cron = (v.crons || []).find((c) => c.path === '/api/faxina');
  ok('o cron da Vercel aponta para a faxina', !!cron, JSON.stringify(v.crons));
  ok('e roda todo dia', !!cron && /^\d+ \d+ \* \* \*$/.test(cron.schedule), cron?.schedule);

  /* Prazo escrito sem código atrás foi o defeito; prazo com código e texto
     desencontrado seria o mesmo defeito com outra roupa. */
  const pol = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/privacidade.pt.html`, 'utf8');
  ok('a política não promete mais apagar a conta INTEIRA',
     !/a conta inteira — roteiros inclusive — é apagada/.test(pol));
  ok('ela promete o conteúdo em 90 dias', /conteúdo da conta é apagado em até 90 dias/.test(pol));
  ok('e diz que a fatura fica, e por quê',
     /fatura/.test(pol) && /guarda fiscal/.test(pol));
  ok('a tabela de prazos passou a listar a conta paga',
     /Conteúdo da conta paga/.test(pol));
  for (const [L, frase] of [['en', "account's content is deleted within 90 days"],
                            ['es', 'contenido de la cuenta se borra en un plazo de 90 días']]) {
    const t = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/privacidade.${L}.html`, 'utf8');
    ok(`e o ${L} diz o mesmo`, t.includes(frase));
  }
}

matarPorta();
banco.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nFaxina: tudo passou.');
process.exit(falhas ? 1 : 0);
