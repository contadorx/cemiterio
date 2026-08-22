import fs from 'fs';
import { RAIZ_WS } from './_caminhos.mjs';
const s = fs.readFileSync(`${RAIZ_WS}/src/template.html`,'utf8');
const i = s.indexOf('const I18N = {');
// acha o fim do objeto contando chaves
let d=0, j=s.indexOf('{', i), fim=j;
for (; j<s.length; j++){ if(s[j]==='{')d++; else if(s[j]==='}'){d--; if(!d){fim=j; break}} }
const src = s.slice(s.indexOf('{', i), fim+1);
const I = eval('(' + src + ')');
const langs = Object.keys(I);
console.log('idiomas:', langs.join(' '));
const base = Object.keys(I.pt);
let mau = 0;
for (const L of langs) {
  const k = Object.keys(I[L]);
  const falta = base.filter(x => !(x in I[L]));
  const sobra = k.filter(x => !base.includes(x));
  const ordem = k.join(',') === base.join(',');
  console.log(`${L}: ${k.length} chaves | falta ${falta.length} | sobra ${sobra.length} | ordem ${ordem?'igual':'DIFERENTE'}`);
  if (falta.length) { console.log('   faltando:', falta.slice(0,12).join(', ')); mau++; }
  if (sobra.length) { console.log('   sobrando:', sobra.slice(0,12).join(', ')); mau++; }
  /* A ORDEM TAMBÉM REPROVA, e passou muito tempo só sendo impressa.
     O espanhol viveu meses com duas chaves fora do lugar: nada quebrava, e o
     preço era pago em toda leitura de diff — cada tradução nova aparecia
     deslocada de duas linhas em relação às outras quatro. Um aviso que não
     reprova é um aviso que se aprende a rolar para baixo. */
  if (!ordem) {
    const k1 = k.findIndex((x, idx) => x !== base[idx]);
    console.log('   fora de ordem a partir de: ' + k[k1] +
                '  (aqui o português tem ' + base[k1] + ')');
    mau++;
  }
  // marcadores {0}/{1}
  const dif = base.filter(x => typeof I.pt[x]==='string' && typeof I[L][x]==='string' &&
    (I.pt[x].match(/\{\d\}/g)||[]).sort().join() !== (I[L][x].match(/\{\d\}/g)||[]).sort().join());
  if (dif.length) { console.log('   marcadores diferentes em:', dif.join(', ')); mau++; }
}

/* ---- UMA PALAVRA POR COISA, no dicionário que 91% das pessoas leem ----

   Medido antes do conserto: o português tinha 43 "frame" contra 44 "quadro" —
   um empate quase perfeito entre duas palavras para a mesma coisa. Elas chegavam
   a brigar na MESMA frase:

     "{0} de {1} quadros. Perto do limite — dá para aumentar o
      Limite de frames na etapa 3"

   E 14 chaves chamavam as fases da FERRAMENTA de "passo" — a mesma palavra que
   o documento gerado usa para os passos do procedimento. Depois que a barra
   passou a dizer "Etapa 2", virou contradição na cara.

   O que esta conferência NÃO proíbe, e por quê:

   - "trecho" fica. Ele é um trecho de FALA com marcação de tempo, e não um
     quadro. A auditoria original juntou os dois; renomear perderia a distinção.
   - o inglês fica com "frame", que é a palavra nativa dele. Espanhol, alemão e
     francês já estavam consistentes — só o português estava dividido.
   - ids, variáveis e as chaves do JSON exportado ficam. A língua da interface
     unifica; o formato de dados que outra pessoa lê, não. */
const PROIBIDAS = [
  { lang: 'pt', re: /\bframes?\b/i,
    porque: 'em português o quadro se chama "quadro" — "frame" é a outra metade do empate' },
  { lang: 'pt', re: /\bpassos?\s*[123]\b/i,
    porque: 'as fases da ferramenta são ETAPAS; "passo" é o passo do procedimento no documento' },
  { lang: 'es', re: /\b(el|del|al) paso\s*[123]\b/i,
    porque: 'lo mismo en español: las fases son ETAPAS (pero "Paso 1 de 2" de la transcripción se queda)' },
];
for (const { lang, re, porque } of PROIBIDAS) {
  const achadas = Object.entries(I[lang] || {})
    .filter(([, v]) => typeof v === 'string' && re.test(v))
    .map(([k]) => k);
  if (achadas.length) {
    console.log(`${lang}: ${achadas.length} chave(s) com ${re} — ${porque}`);
    console.log('   ' + achadas.slice(0, 12).join(', '));
    mau++;
  }
}
if (!mau) console.log('vocabulário: uma palavra por coisa nos cinco.');

process.exit(mau?1:0);
