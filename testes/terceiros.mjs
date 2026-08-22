/* A LISTA DE SUBOPERADORES SAI DO CÓDIGO, e não da memória de quem escreveu.
 *
 * O ACHADO: a seção "Conexões externas" da política listava quatro terceiros —
 * jsDelivr, Hugging Face, Supabase e Vercel — e o produto falava com seis.
 * Faltavam a **Stripe**, que cobra a assinatura e recebe nome e e-mail de quem
 * contrata, e a **Brevo**, que manda o link de acesso à conta e o convite, e
 * portanto recebe o endereço de e-mail do destinatário. A Stripe até aparecia
 * em OUTRO parágrafo da mesma política ("as faturas, vindas da Stripe") — ou
 * seja, o documento já se contradizia sozinho.
 *
 * Isso não é esquecimento de ninguém. É o formato: uma lista escrita à mão ao
 * lado de uma lista de verdade sempre diverge, e a de verdade aqui é o código.
 * A lista à mão é a que vai para a avaliação de fornecedor — e um suboperador
 * omitido numa avaliação não é um detalhe de redação: é o item que reprova.
 *
 * COMO ISTO DERIVA. Dois sinais, os dois lidos do fonte:
 *
 *   1. CREDENCIAL. Guardar uma chave de um terceiro é a definição operacional
 *      de falar com ele. `STRIPE_SECRET_KEY`, `BREVO_API_KEY`,
 *      `SUPABASE_SERVICE_ROLE_KEY` — o primeiro pedaço do nome é o fornecedor.
 *   2. CHAMADA DE REDE. Endereço que a ferramenta BUSCA (`fetch`, `<script
 *      src>`, `new Worker`), e não endereço para onde ela só aponta um link.
 *      A distinção importa: o LinkedIn aparece no fonte como destino de um
 *      botão de compartilhar, e um link que a PESSOA clica não é suboperador.
 *
 * O que este teste NÃO cobra, e é de propósito: a Vercel. Ela hospeda — não há
 * credencial nem chamada a ela no código, porque ela é o chão. Uma régua que
 * tentasse derivá-la precisaria de uma lista à mão, que é justamente o que este
 * arquivo existe para não ter. A afirmação aqui é de um lado só: **todo
 * terceiro que o código conhece está na política.** Uma entrada a mais na
 * política é inofensiva; uma a menos é a que custa a venda.
 *
 *   node testes/terceiros.mjs
 */
import fs from 'fs';
import path from 'path';

import { RAIZ_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

/** Todo arquivo de servidor, para varrer as credenciais. */
function arquivos(dir, ext, saida = []) {
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    if (nome.name === 'node_modules' || nome.name.startsWith('.')) continue;
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) arquivos(p, ext, saida);
    else if (ext.some(e => nome.name.endsWith(e))) saida.push(p);
  }
  return saida;
}

// ---------------------------------------------------------------------------
console.log('[1] os terceiros que o código conhece');

const vendors = new Map();   // rótulo -> por que ele entrou na lista
const marcar = (rot, porque) => {
  if (!vendors.has(rot)) vendors.set(rot, porque);
};

/* ---- sinal 1: credencial guardada ---- */
{
  const fontes = [
    ...arquivos(path.join(RAIZ, 'app'), ['.ts', '.tsx']),
    ...arquivos(path.join(RAIZ, 'lib'), ['.ts', '.tsx']),
    ...arquivos(path.join(RAIZ, 'supabase'), ['.ts', '.mjs']),
  ];
  const re = /process\.env\.([A-Z0-9]+)_(?:API_KEY|SECRET_KEY|SERVICE_ROLE_KEY|WEBHOOK_SECRET|ACCESS_TOKEN)/g;
  for (const arq of fontes) {
    const txt = fs.readFileSync(arq, 'utf8');
    let m;
    while ((m = re.exec(txt))) marcar(m[1].toLowerCase(), 'credencial ' + m[0].split('.').pop());
  }
}

/* ---- sinal 2: endereço que a ferramenta BUSCA ---- */
{
  const txt = fs.readFileSync(path.join(RAIZ, 'src', 'template.html'), 'utf8');
  const re = /https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g;
  let m;
  while ((m = re.exec(txt))) {
    /* Link que a pessoa clica não é suboperador. O que separa os dois é o que
       vem ANTES do endereço no fonte: `href=` é destino de clique; qualquer
       outra coisa (fetch, src, Worker, import) é o programa indo buscar. */
    const antes = txt.slice(Math.max(0, m.index - 30), m.index);
    if (/href\s*=\s*["'`]?$/.test(antes)) continue;
    const partes = m[1].split('.');
    /* O rótulo do fornecedor é o penúltimo pedaço do domínio: `cdn.jsdelivr.net`
       → jsdelivr, `www.googleapis.com` → googleapis, `huggingface.co` →
       huggingface. Os quatro endereços do Google caem em rótulos diferentes, e
       é por isso que a conferência abaixo aceita o prefixo comum. */
    marcar(partes[partes.length - 2], 'busca ' + m[1]);
  }
}

const achados = [...vendors.keys()].sort();
console.log('     ' + achados.map(v => `${v} (${vendors.get(v)})`).join('\n     '));
ok('a varredura achou pelo menos cinco terceiros', achados.length >= 5, String(achados.length));

// ---------------------------------------------------------------------------
console.log('\n[2] todos eles estão na política, nos cinco idiomas');

const IDIOMAS = ['pt', 'en', 'es', 'de', 'fr'];
for (const lang of IDIOMAS) {
  const arq = path.join(RAIZ, 'src', 'site', 'bodies', `privacidade.${lang}.html`);
  if (!fs.existsSync(arq)) { ok(`privacidade.${lang}.html existe`, false); continue; }
  /* A CONFERÊNCIA É NA TABELA, e não no documento inteiro.
     Procurar o nome do fornecedor em qualquer lugar da página passava por
     acidente: a Stripe já era citada de passagem num parágrafo sobre faturas,
     então "stripe está na política" dava verdadeiro enquanto ela seguia fora
     da tabela de suboperadores — que é a única coisa que a avaliação de
     fornecedor lê. O `id` existe para esta pergunta ter onde ser feita. */
  const bruto = fs.readFileSync(arq, 'utf8');
  const tab = bruto.match(/<table[^>]*id="suboperadores"[\s\S]*?<\/table>/);
  if (!tab) {
    ok(`privacidade.${lang}: tem a tabela de suboperadores`, false,
       'falta <table id="suboperadores"> — traduza a seção');
    continue;
  }
  const pol = tab[0].toLowerCase();
  /* `googleapis`, `accounts.google`, `docs.google` são o MESMO fornecedor, e
     nenhuma política razoável vai escrever "googleapis". A conferência aceita
     o prefixo: quem escreveu "Google" respondeu pelos quatro endereços. */
  const faltando = achados.filter(v => {
    if (pol.includes(v)) return false;
    for (let n = v.length - 1; n >= 5; n--) if (pol.includes(v.slice(0, n))) return false;
    return true;
  });
  /* O NÚMERO QUE IMPORTA: zero. Antes desta rodada, em pt, esta lista trazia
     `stripe` e `brevo`. */
  ok(`privacidade.${lang}: nenhum terceiro do código ficou de fora`,
     faltando.length === 0, faltando.join(', ') || '—');
}

// ---------------------------------------------------------------------------
console.log('\n[3] e no anexo que vai assinado');
{
  const arq = path.join(RAIZ, 'src', 'site', 'dpa.pt.html');
  if (!fs.existsSync(arq)) ok('dpa.pt.html existe', false);
  else {
    const dpa = fs.readFileSync(arq, 'utf8').toLowerCase();
    /* O DPA lista SUBOPERADORES — quem trata dado da conta paga por nossa
       conta. jsDelivr e Hugging Face entregam arquivo ao navegador da pessoa e
       não tocam em dado de conta nenhum; exigi-los aqui seria inflar o anexo
       com o que ele não regula. O que se cobra é o núcleo: quem guarda, quem
       cobra e quem manda e-mail. */
    const NUCLEO = achados.filter(v => vendors.get(v).startsWith('credencial'));
    console.log('     núcleo (temos credencial deles): ' + NUCLEO.join(', '));
    const faltando = NUCLEO.filter(v => !dpa.includes(v));
    ok('o DPA lista todo terceiro de quem guardamos credencial',
       faltando.length === 0, faltando.join(', ') || '—');

    /* E a tabela do DPA não pode contradizer a da política: um contrato
       assinado que diverge da política publicada é pior do que não ter
       contrato. */
    const pol = fs.readFileSync(path.join(RAIZ, 'src', 'site', 'bodies', 'privacidade.pt.html'), 'utf8')
      .toLowerCase();
    const soNoDpa = NUCLEO.filter(v => dpa.includes(v) && !pol.includes(v));
    ok('e não inventa nenhum que a política não conheça', soNoDpa.length === 0,
       soNoDpa.join(', ') || '—');
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nSuboperadores: a política acompanha o código.');
process.exit(falhas ? 1 : 0);
