/* Nenhuma marca de terceiro dentro do produto.
 *
 * Havia uma: o campo "Nome do cliente no documento" trazia uma empresa real
 * como exemplo, e o exemplo de nome de modelo dentro da ferramenta também.
 * Um campo de exemplo com o nome de outra companhia aparece na tela de todo
 * mundo que abre a ferramenta, sugere um cliente que talvez não seja cliente, e
 * é a primeira coisa que a área jurídica de qualquer um dos dois lados
 * pergunta.
 *
 * O pior estava nos documentos: exemplos de SQL com o domínio de e-mail e o
 * CNPJ DE VERDADE da companhia, num repositório que constrói o site publicado.
 * Isso não se desfaz depois de publicado.
 *
 * Este arquivo existe porque o defeito volta pelo caminho mais natural do
 * mundo: alguém precisa de um exemplo, lembra de um cliente de verdade, e
 * escreve o nome dele. Uma máquina relendo cada build é o que impede.
 */
import fs from 'fs';
import path from 'path';

import { RAIZ_WS } from './_caminhos.mjs';
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const RAIZ = `${RAIZ_WS}`;

/* As marcas que já estiveram aqui, e as que não podem entrar. Não é uma lista
   de empresas proibidas — é a lista do que a gente já errou uma vez, mais os
   nomes que apareceriam se alguém fosse buscar um exemplo "que soe real". */
const PROIBIDO = [
  /\bNatura\b/i,
];

/* E o formato de um CNPJ que não seja o nosso nem o de zeros. Um documento
   fiscal de outra empresa num repositório é pior que um nome. */
const CNPJ = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const NOSSO = '48.417.292/0001-99';
const NEUTRO = '00.000.000/0001-00';

/* Onde procurar: tudo o que é enviado. `node_modules` e `.next` são de fora e
   não são nossos para limpar. */
const PULAR = new Set(['node_modules', '.next', '.git', 'demo']);
function varrer(dir, achados = []) {
  for (const nome of fs.readdirSync(dir)) {
    if (PULAR.has(nome)) continue;
    const f = path.join(dir, nome);
    const st = fs.statSync(f);
    if (st.isDirectory()) { varrer(f, achados); continue; }
    if (!/\.(html|md|ts|tsx|js|mjs|json|py|css|sh|txt)$/.test(nome)) continue;
    if (st.size > 3_000_000) continue;
    achados.push(f);
  }
  return achados;
}

const arquivos = varrer(RAIZ);
console.log(`[1] varrendo ${arquivos.length} arquivos do produto`);

const sujos = [];
const cnpjs = new Map();
for (const f of arquivos) {
  const s = fs.readFileSync(f, 'utf8');
  for (const re of PROIBIDO) {
    if (re.test(s)) {
      const trecho = (s.match(new RegExp('.{0,50}' + re.source + '.{0,40}', 'i')) || [''])[0];
      sujos.push(`${path.relative(RAIZ, f)}: ${trecho.trim().slice(0, 90)}`);
    }
  }
  for (const c of s.match(CNPJ) || []) {
    if (c !== NOSSO && c !== NEUTRO) {
      cnpjs.set(path.relative(RAIZ, f), c);
    }
  }
}
ok('nenhuma marca de terceiro no produto', sujos.length === 0, sujos.slice(0, 3).join(' | '));
ok('nenhum CNPJ que não seja o nosso ou o de zeros', cnpjs.size === 0,
   [...cnpjs].slice(0, 3).map(([f, c]) => `${f}: ${c}`).join(' | '));

console.log('\n[2] os placeholders ensinam o que escrever, em vez de citar alguém');
{
  /* O substituto de um placeholder não é outra empresa inventada — é a
     instrução. "Sua empresa S.A." diz o que vai ali; um nome fictício só troca
     um problema de marca real por um risco de marca por acidente. */
  const esperado = {
    pt: 'Sua empresa S.A.', en: 'Your company Ltd.', es: 'Tu empresa S.A.',
    de: 'Ihr Unternehmen GmbH', fr: 'Votre entreprise SAS',
  };
  for (const [L, v] of Object.entries(esperado)) {
    const s = fs.readFileSync(`${RAIZ}/src/site/bodies/link.${L}.html`, 'utf8');
    ok(`${L}: o campo de nome do cliente diz "${v}"`, s.includes(`placeholder="${v}"`));
  }
}

console.log('\n[3] o exemplo de nome de modelo descreve, em vez de nomear');
{
  const app = fs.readFileSync(`${RAIZ}/public/app.html`, 'utf8');
  for (const v of ['Evidência de homologação', 'UAT evidence', 'Evidencia de homologación',
                   'Abnahmenachweis', 'Preuve de recette']) {
    ok(`o exemplo "${v}" está lá`, app.includes(v));
  }
}

console.log('\n[4] os exemplos de e-mail usam o domínio reservado para exemplos');
{
  /* `example.com` é reservado pela RFC 2606: ninguém pode registrá-lo, então o
     exemplo nunca aponta para alguém de verdade.

     O `PLANO-TIME.md` NÃO viaja no zip — ele guarda as duas chaves privadas
     Ed25519, e um pacote entregue que as levasse junto entregaria o direito de
     assinar licença. Sem ele, este bloco não tem o que ler, e dizer isso é
     melhor do que morrer com ENOENT: quem abre o pacote e vê a esteira vermelha
     vai procurar defeito num produto que está inteiro. */
  if (!fs.existsSync(`${RAIZ}/PLANO-TIME.md`)) {
    console.log('  pulado  PLANO-TIME.md não está neste pacote (ele guarda as chaves privadas).');
  } else {
    const plano = fs.readFileSync(`${RAIZ}/PLANO-TIME.md`, 'utf8');
    ok('o PLANO-TIME usa example.com', /@example\.com/.test(plano));
    ok('e não sobrou domínio de empresa real', !/@[a-z]+\.com\.br/.test(plano),
       (plano.match(/@[a-z]+\.com\.br/) || [''])[0]);
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nSem marca de terceiro: tudo passou.');
process.exit(falhas ? 1 : 0);
