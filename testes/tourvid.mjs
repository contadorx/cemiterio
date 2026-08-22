/* O vídeo do tour e o vídeo de exemplo — os dois refeitos, e o que não pode
 * voltar a acontecer com eles.
 *
 * O EXEMPLO era a gravação de um relatório trimestral: slides passando. Aquilo
 * mostrava a ferramenta funcionando e mostrava o PRODUTO ERRADO — quem procura
 * "evidência de teste" ou "instrução de trabalho" não grava slides, grava um
 * sistema. Um exemplo que não parece o trabalho de quem chega faz a pessoa
 * concluir que a ferramenta é para outra coisa.
 *
 * Agora é um pedido de compra sendo testado numa intranet, com a recusa do
 * sistema no meio — que é o quadro que interessa numa evidência e o motivo de a
 * marcação manual existir.
 *
 * E o TOUR foi regravado percorrendo o aplicativo de verdade, nas cinco
 * línguas. O alemão e o francês viam o tour em inglês porque `lib/site.ts`
 * tinha a lista de idiomas escrita à mão ao lado de um `build.py` que olhava o
 * disco — a mesma armadilha que já tinha apagado o hreflang deles.
 */
import fs from 'fs';

import { RAIZ_WS } from './_caminhos.mjs';
const BASE = 'http://localhost:8802';
const DEMO = `${RAIZ_WS}/public/demo`;
const ROTAS = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/rotas.json`, 'utf8'));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

console.log('[1] os cinco idiomas têm tour e exemplo, em disco');
for (const L of ROTAS.idiomas) {
  for (const [tipo, ext] of [['tour', 'webm'], ['tour', 'mp4'], ['tour', 'jpg'],
                             ['exemplo', 'webm'], ['exemplo', 'mp4'], ['exemplo', 'vtt']]) {
    const f = `${DEMO}/${tipo}.${L}.${ext}`;
    const existe = fs.existsSync(f) && fs.statSync(f).size > 400;
    ok(`${L}: ${tipo}.${ext}`, existe, existe ? '' : 'falta ou está vazio');
  }
}

console.log('\n[2] a lista de quem tem tour é DERIVADA do disco');
{
  /* Escrita à mão, ela ficou meses dizendo ['pt','en','es'] depois de o vídeo
     alemão existir — e ninguém viu, porque um vídeo em inglês numa página
     alemã não quebra nada, só decepciona. */
  const site = fs.readFileSync(`${RAIZ_WS}/lib/site.ts`, 'utf8');
  ok('o site não tem a lista escrita à mão',
     !/\['pt', 'en', 'es'\]\.includes\(lang\)/.test(site));
  ok('ele lê o que o build.py apurou', /rotas\.demoLangs/.test(site));
  const build = fs.readFileSync(`${RAIZ_WS}/build.py`, 'utf8');
  ok('e o build.py apura olhando o disco',
     /com_tour = \[L for L in IDIOMAS if \(root \/ "public" \/ "demo"/.test(build));
  ok('os cinco entraram no rotas.json',
     JSON.stringify(ROTAS.demoLangs) === JSON.stringify(ROTAS.idiomas),
     JSON.stringify(ROTAS.demoLangs));
}

console.log('\n[3] cada home mostra o tour da própria língua');
for (const L of ROTAS.idiomas) {
  const u = L === 'pt' ? '/?lang=pt' : '/' + L;
  const html = await (await fetch(BASE + u)).text();
  const achou = (html.match(/demo\/tour\.([a-z]{2})\.webm/) || [])[1];
  ok(`${L}: aponta para tour.${L}.webm`, achou === L, `achou ${achou}`);
  const r = await fetch(BASE + `/demo/tour.${L}.webm`);
  ok(`${L}: e o arquivo responde`, r.status === 200, String(r.status));
}

console.log('\n[4] a legenda do exemplo fala do SISTEMA, e não de um relatório');
for (const L of ROTAS.idiomas) {
  const vtt = fs.readFileSync(`${DEMO}/exemplo.${L}.vtt`, 'utf8');
  /* A prova de que o exemplo mudou de assunto. "trimestre/quarterly" era o
     relatório antigo; o novo fala de pedido, sistema e recusa. */
  ok(`${L}: não é mais o relatório trimestral`,
     !/trimestr|quarterly|Quartals|trimestre/i.test(vtt));
  const conta = {
    pt: /centro de custo/i, en: /cost centre/i, es: /centro de coste/i,
    de: /Kostenstelle/i, fr: /centre de coût/i,
  }[L];
  ok(`${L}: e conta o teste do centro de custo`, conta.test(vtt));
  /* A RECUSA é o miolo: é o quadro que interessa numa evidência. Um exemplo em
     que tudo dá certo na primeira tentativa não mostra para que serve marcar
     um passo à mão. */
  const recusa = {
    pt: /recusou/i, en: /refused/i, es: /rechaz/i, de: /abgelehnt/i, fr: /refus/i,
  }[L];
  ok(`${L}: com a recusa do sistema no meio`, recusa.test(vtt));
}

console.log('\n[5] a legenda da home descreve o vídeo que existe');
for (const L of ROTAS.idiomas) {
  const u = L === 'pt' ? '/?lang=pt' : '/' + L;
  const html = await (await fetch(BASE + u)).text();
  /* A legenda dizia "o fluxo completo em 19 segundos". O vídeo tem 33 e mostra
     outra coisa. Uma legenda que descreve um vídeo que não existe mais é do
     mesmo tipo de defeito do `revoke` que não revogava — só que na vitrine. */
  ok(`${L}: não promete mais 19 segundos`, !/19 segundos|19 seconds|19 segundos|19 Sekunden|19 secondes/.test(html));
}

console.log('\n[6] os vídeos têm a duração e o peso de quem vai rodar em laço');
for (const L of ROTAS.idiomas) {
  const t = fs.statSync(`${DEMO}/tour.${L}.webm`).size;
  const e = fs.statSync(`${DEMO}/exemplo.${L}.webm`).size;
  /* Um vídeo que roda sozinho no alto da home paga o preço na primeira visita
     de todo mundo. Acima de 2 MB isso começa a doer em rede de escritório. */
  ok(`${L}: o tour cabe em 2 MB`, t < 2 * 1024 * 1024, `${(t/1048576).toFixed(2)} MB`);
  ok(`${L}: e o exemplo em 1 MB`, e < 1024 * 1024, `${(e/1048576).toFixed(2)} MB`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nVídeos do site: tudo passou.');
process.exit(falhas ? 1 : 0);
