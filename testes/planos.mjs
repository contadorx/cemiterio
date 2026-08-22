/* OS CARTÕES DE PLANO E O CATÁLOGO CONTAM A MESMA HISTÓRIA.
 *
 * A página de preços tem DUAS listas, e elas vinham de lugares diferentes:
 *
 *   a lista comparativa   montada de `src/features.json` por `tabelaDePlanos()`,
 *                         nos cinco idiomas, de uma fonte só;
 *   os cartões de plano   escritos à mão em cinco arquivos `precos.<lang>.html`.
 *
 * Medido em 21/08/2026, antes do conserto: os cartões marcavam QUATRO coisas
 * como "em breve" e o catálogo não marcava nenhuma. Três delas existiam desde
 * 16 de agosto — modelo de documento próprio, perfil entre máquinas e padrão do
 * time empurrado. O produto estava deixando de vender o que já fazia.
 *
 * A quarta — a lista de termos guardada — de fato não existe: `vocLista` mora
 * em `sessionStorage` e morre com a aba. Essa continua marcada, e agora a marca
 * mora no catálogo, que é onde a regra do arquivo sempre disse que ela morava:
 * "só entra o que EXISTE; o que ainda não existe entra com breve: true".
 *
 * Este arquivo é o portão. Ele é ESTÁTICO de propósito — lê JSON e HTML, sem
 * navegador e sem servidor. Um portão de release que precisa de `next start`
 * é um portão que se aprende a pular.
 */
import fs from 'fs';
import { RAIZ_WS } from './_caminhos.mjs';

const IDIOMAS = ['pt', 'en', 'es', 'de', 'fr'];
const cat = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/features.json`, 'utf8'));
const dic = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/i18n-site.json`, 'utf8'));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++ };

const itens = cat.grupos.flatMap((g) => g.itens);
const porId = new Map(itens.filter((i) => i.id).map((i) => [i.id, i]));

console.log('[1] o catálogo é a fonte, e ele se descreve');
{
  const semTexto = itens.filter((i) => IDIOMAS.some((L) => !String(i[L] || '').trim()));
  ok('todo item existe nos cinco idiomas', semTexto.length === 0,
     semTexto.slice(0, 3).map((i) => i.pt).join(' | '));
  const planoTorto = itens.filter((i) => !/^[fpt]+$/.test(i.planos || ''));
  ok('e todo item diz de que plano é', planoTorto.length === 0,
     planoTorto.slice(0, 3).map((i) => i.pt).join(' | '));
  const alcas = itens.filter((i) => i.id).map((i) => i.id);
  ok('as alças são únicas', new Set(alcas).size === alcas.length, alcas.join(' '));
}

console.log('\n[2] cada cartão aponta para um item que existe');
const marcados = {};
for (const L of IDIOMAS) {
  const html = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/precos.${L}.html`, 'utf8');
  /* Todo `<li>` do cartão que carrega alça, com o que vem dentro dele. */
  const bullets = [...html.matchAll(/<li data-f="([^"]+)">([\s\S]*?)<\/li>/g)]
    .map((m) => ({ id: m[1], dentro: m[2] }));
  marcados[L] = bullets;
  const orfas = bullets.filter((b) => !porId.has(b.id)).map((b) => b.id);
  ok(`${L}: nenhuma alça aponta para o vazio`, orfas.length === 0, orfas.join(' '));
}

console.log('\n[3] OS CINCO CARTÕES PROMETEM AS MESMAS COISAS');
{
  /* Uma página que promete mais em espanhol do que em português não é erro de
     tradução: é o produto sendo outro dependendo de quem lê. */
  const base = marcados.pt.map((b) => b.id).sort().join(',');
  for (const L of IDIOMAS.slice(1)) {
    const meu = marcados[L].map((b) => b.id).sort().join(',');
    ok(`${L} cita os mesmos itens que o pt`, meu === base, meu || '(nenhum)');
  }
}

console.log('\n[4] O SELO "EM BREVE" SAI DO CATÁLOGO, E DE MAIS NENHUM LUGAR');
{
  for (const L of IDIOMAS) {
    const erradas = marcados[L].filter((b) => {
      const temSelo = /class="soon"/.test(b.dentro);
      return temSelo !== !!porId.get(b.id).breve;
    });
    ok(`${L}: cartão e catálogo concordam sobre o que ainda não existe`,
       erradas.length === 0,
       erradas.map((b) => `${b.id}: cartão diz ${/soon/.test(b.dentro) ? 'breve' : 'pronto'}, ` +
                          `catálogo diz ${porId.get(b.id).breve ? 'breve' : 'pronto'}`).join(' | '));
    /* E a PALAVRA do selo é a mesma dos dois lados. O alemão dizia "bald" no
       cartão e "demnächst" na lista comparativa — duas palavras para o mesmo
       selo, na mesma página, e nenhum teste reclamava. */
    const palavra = dic[L].tpBreve;
    const outra = marcados[L].filter((b) => /class="soon"/.test(b.dentro) &&
                                            !b.dentro.includes(`>${palavra}<`));
    ok(`${L}: e usa a mesma palavra da lista comparativa ("${palavra}")`,
       outra.length === 0, outra.map((b) => b.dentro.match(/soon">([^<]*)</)?.[1]).join(' '));
  }
}

console.log('\n[5] e nada fora dos cartões promete futuro por conta própria');
{
  /* O rodapé da página explica o que o selo quer dizer, e é o único `soon` que
     pode existir sem alça. Qualquer outro é uma promessa que ninguém registrou
     no catálogo — que é exatamente como as três de 16/08 ficaram esquecidas. */
  for (const L of IDIOMAS) {
    const html = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/precos.${L}.html`, 'utf8');
    const todos = (html.match(/class="soon"/g) || []).length;
    const comAlca = marcados[L].filter((b) => /class="soon"/.test(b.dentro)).length;
    ok(`${L}: todo selo tem alça, menos o da explicação`,
       todos === comAlca + 1, `${todos} selo(s), ${comAlca} com alça`);
  }
}

console.log('\n[6] UM ESTADO POR PLANO, e a lista espera o que não existe');
{
  /* O DEFEITO. A página vendia o Personal com preço, badge de 14 dias e
     "na hora, sem cartão" — e cinquenta linhas abaixo pedia o e-mail da pessoa
     para avisar "quando o plano pago sair". As duas coisas na mesma página, e
     as duas em cinco idiomas.

     Não era erro de texto: era a página não saber que o que ela promete já foi
     entregue. O mesmo defeito do B1, no outro sentido — lá ela escondia o que
     existia, aqui ela promete o que já existe. */
  for (const L of IDIOMAS) {
    const html = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/precos.${L}.html`, 'utf8');

    const planos = [...html.matchAll(/<div class="plan[^"]*" data-plano="([^"]+)"/g)].map((m) => m[1]);
    ok(`${L}: os três planos têm identidade`, planos.join() === 'free,personal,team', planos.join());

    /* UMA ação primária por cartão. Dois botões num cartão de preço é a pessoa
       parada escolhendo entre eles em vez de escolhendo o plano. */
    /* Cortar no primeiro `</div>` não serve: há `<div>` aninhado dentro do
       cartão. Dividir pelo próprio marcador dá os três pedaços certos — o
       último vai até o fim da fileira, e é o que se quer. */
    const fileira = html.slice(html.indexOf('<div class="plans'));
    const cartoes = fileira.split(/<div class="plan[^"]*" data-plano=/).slice(1);
    const botoes = cartoes.map((c) => (c.match(/<a class="btn/g) || []).length);
    ok(`${L}: uma ação primária em cada`, botoes.length === 3 && botoes.every((n) => n === 1),
       botoes.join('/'));

    /* E O QUE A LISTA ESPERA NÃO PODE SER O QUE A PÁGINA VENDE. É a afirmação
       estrutural do defeito: `data-espera` nomeia o que ainda não saiu, e se
       um dia ele coincidir com um plano que tem preço na tela, isto reprova. */
    const espera = (html.match(/<section id="lista" data-espera="([^"]+)"/) || [])[1];
    ok(`${L}: a lista diz o que está esperando`, !!espera, espera || '(nada)');
    ok(`${L}: e não é algo que a página já vende`, !planos.includes(espera), `${espera} vs ${planos.join()}`);
  }
}

console.log('\n[7] o que o Personal PROMETE é o que a planilha DEVOLVE');
{
  /* O cartão do Personal parou de vender identidade visual e passou a vender a
     rodada de casos: "suba a planilha, cada caso vira um link, e ela volta em
     .xlsx com situação, quando, quem executou, o arquivo e a impressão".
     "Colocar logotipo" se compara com editar um Word; isto substitui um
     processo.
     
     A promessa e a entrega moram em arquivos diferentes, então elas podem
     divergir em silêncio: tirar uma coluna do export não faz a página parar de
     prometê-la. Esta afirmação amarra as duas. */
  const rota = fs.readFileSync(`${RAIZ_WS}/app/conta/planilha/route.ts`, 'utf8');
  const cab = (rota.match(/const cab = \[([\s\S]*?)\]/) || [])[1] || '';
  const colunas = [...cab.matchAll(/t\.(rot[A-Za-z]+)/g)].map((m) => m[1]);
  /* As cinco que o cartão nomeia, uma a uma. Um `every` sobre a lista inteira
     diria "sim" com quatro delas presentes e a quinta trocada por outra. */
  for (const c of ['rotColSit', 'rotColQuando', 'rotColQuem', 'rotColArq', 'rotColImp']) {
    ok(`a planilha devolve ${c}`, colunas.includes(c), colunas.join(' '));
  }
  ok('e sai em .xlsx, como o cartão diz', /montarXlsx/.test(rota));

  /* E o cartão continua liderando pelo roteiro. A primeira bala é a que a
     pessoa lê; se ela voltar a ser o logotipo, o reposicionamento se desfez
     sem ninguém mexer numa linha de código. */
  for (const L of IDIOMAS) {
    const html = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/precos.${L}.html`, 'utf8');
    const card = html.slice(html.indexOf('data-plano="personal"'));
    const primeira = (card.match(/<li[^>]*>([\s\S]*?)<\/li>/) || [])[1] || '';
    ok(`${L}: a primeira bala do Personal é a rodada de casos`,
       /xlsx|csv|Excel/i.test(primeira), primeira.replace(/<[^>]*>/g, '').slice(0, 70));
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nCartões e catálogo: uma verdade só.');
process.exit(falhas ? 1 : 0);
