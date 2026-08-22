/* A FIGURA DO BLOG — dois tetos que não se falavam.
 *
 * O RELATO, de produção: subir a figura de um post devolvia "This page couldn't
 * load — a server error occurred". Sem mensagem, sem pista, e dependendo do
 * arquivo: as pequenas subiam.
 *
 * A causa eram DOIS TETOS em dois arquivos. O produto permite 8 MB
 * (`TETO_FIGURA`), o formulário aceita 8 MB, e a ação tem até a frase pronta
 * para recusar acima disso. Só que uma Server Action do Next tem teto PRÓPRIO,
 * e o padrão é 1 MB — sem `bodySizeLimit` no `next.config.mjs`, tudo entre
 * 1 MB e 8 MB morre com um 413 ANTES de a ação rodar, e o erro genérico do
 * framework é tudo o que sobra na tela.
 *
 * Este arquivo não sobe servidor: ele lê os dois arquivos do disco e compara os
 * números, que é o que estava faltando. Dois tetos em dois lugares voltam a
 * divergir na primeira distração — e descobrir isso por relato custa uma
 * publicação travada e uma tarde.
 *
 *   node testes/figura.mjs
 */
import fs from 'fs';
import { RAIZ_WS } from './_caminhos.mjs';

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const cfg = fs.readFileSync(`${RAIZ_WS}/next.config.mjs`, 'utf8');
const lib = fs.readFileSync(`${RAIZ_WS}/lib/supabase/figura.ts`, 'utf8');
const acoes = fs.readFileSync(`${RAIZ_WS}/app/conta/[lang]/negocio/acoes.ts`, 'utf8');
const pagina = fs.readFileSync(`${RAIZ_WS}/app/conta/[lang]/negocio/blog/page.tsx`, 'utf8');

/* "9mb", "8 MB", "1048576" — o Next aceita as três formas. */
const emBytes = (v) => {
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!m) return NaN;
  const mult = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return parseFloat(m[1]) * (m[2] ? mult[m[2].toLowerCase()] : 1);
};

console.log('[1] o teto do produto e o teto do Next se conhecem');
{
  const mLib = lib.match(/TETO_FIGURA\s*=\s*([\d*\s]+);/);
  const teto = mLib ? Function('return ' + mLib[1])() : NaN;
  const mCfg = cfg.match(/bodySizeLimit:\s*['"]([^'"]+)['"]/);
  const limite = mCfg ? emBytes(mCfg[1]) : NaN;
  console.log('     produto: ' + (teto / 1048576).toFixed(0) + ' MB   ' +
              'Next: ' + (isFinite(limite) ? (limite / 1048576).toFixed(0) + ' MB' : '(não declarado)'));

  ok('o produto declara um teto de figura', isFinite(teto) && teto > 0, String(teto));
  /* SEM ESTA LINHA o padrão do Next vale, e ele é 1 MB — conferido na fonte da
     versão instalada, `app-render/action-handler.js`. */
  ok('o next.config declara bodySizeLimit', isFinite(limite),
     mCfg ? mCfg[1] : '(ausente — o padrão de 1 MB volta a valer)');
  /* O NÚMERO QUE IMPORTA: o teto do framework não pode ser MENOR que o do
     produto, senão a recusa educada da ação nunca chega a ser possível de ver. */
  ok('e ele não é menor que o teto do produto', limite >= teto,
     (limite / 1048576).toFixed(1) + ' MB vs ' + (teto / 1048576).toFixed(1) + ' MB');
  /* O corpo multipart leva também `lang`, `chave` e `alt`, e o teto vale para o
     corpo inteiro — não só para o arquivo. Sem folga, uma figura de exatamente
     8 MB estoura por causa do texto ao lado dela. */
  ok('com folga para os outros campos do formulário', limite > teto,
     ((limite - teto) / 1024).toFixed(0) + ' KB de folga');
  /* No `experimental`, que é onde o Next 16 lê. Fora dali a chave é ignorada em
     silêncio, e o conserto não conserta nada. */
  ok('e está dentro de `experimental.serverActions`',
     /experimental:\s*\{[\s\S]{0,200}?serverActions:\s*\{[^}]*bodySizeLimit/.test(cfg));
}

console.log('\n[2] o que o formulário aceita é o que a ação sabe guardar');
{
  /* A outra dupla que pode divergir: o `accept` do input e a tabela de tipos do
     servidor. Divergindo, a pessoa escolhe um arquivo que o navegador aprova e
     recebe "erro=tipo" depois de esperar o upload inteiro. */
  const mAccept = pagina.match(/accept="([^"]+)"/);
  const doForm = mAccept ? mAccept[1].split(',').map((s) => s.trim()).sort() : [];
  const doServidor = [...lib.matchAll(/'(image\/[\w+.-]+)':/g)].map((m) => m[1]).sort();
  console.log('     formulário: ' + doForm.join(' '));
  console.log('     servidor  : ' + doServidor.join(' '));
  ok('as duas listas de tipos são a mesma',
     doForm.join(',') === doServidor.join(','),
     JSON.stringify({ form: doForm, servidor: doServidor }));
}

console.log('\n[3] o redirect não volta para dentro do try');
{
  /* O `redirect` do Next funciona LANÇANDO um `NEXT_REDIRECT`. Dentro de um
     `try` com `catch`, ele é apanhado pelo próprio `catch` — e a recusa limpa
     do banco virava `erro=Error: NEXT_REDIRECT;replace;/conta/...` na tela.
     O resto deste arquivo já usa o padrão certo: guarda o resultado numa
     variável, sai do `try`, e só então desvia. */
  const corpo = acoes.slice(acoes.indexOf('export async function enviarFigura'));
  const fim = corpo.indexOf('\nexport async function', 1);
  const fn = fim > 0 ? corpo.slice(0, fim) : corpo;
  const ini = fn.indexOf('try {');
  const cat = fn.indexOf('} catch', ini);
  const dentro = ini >= 0 && cat > ini ? fn.slice(ini, cat) : '';
  const linhas = dentro.split('\n').filter((l) => /\bredirect\(/.test(l) && !/^\s*(\*|\/\/)/.test(l));
  ok('nenhum redirect dentro do try de enviarFigura', linhas.length === 0,
     JSON.stringify(linhas.map((l) => l.trim().slice(0, 60))));
  ok('e o desvio acontece depois dele', /if \(falhou\) redirect\(/.test(fn));
}

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);
