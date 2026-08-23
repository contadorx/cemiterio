/**
 * Procura .map / .length / .join sobre valores que podem chegar indefinidos.
 *
 * Foi exatamente esse tipo de erro que derrubou o app de campo: eu mudei o
 * formato do briefing (tirei "atencoes") e um componente continuou lendo
 * `b.atencoes.map(...)`. O TypeScript não pega porque o dado vem de fetch,
 * tipado como any. O build passa e a tela quebra no celular.
 */
const fs = require("fs");
const path = require("path");

function arquivos(dir, saida = []) {
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) arquivos(p, saida);
    else if (/\.tsx?$/.test(it.name)) saida.push(p);
  }
  return saida;
}

const suspeitos = [];
for (const p of arquivos("src/app")) {
  const linhas = fs.readFileSync(p, "utf8").split("\n");
  linhas.forEach((l, i) => {
    // dentro do JSX: {algo.propriedade.map(  — sem proteção
    const m = l.match(/\{\s*([a-zA-Z_$][\w$]*)\.([\w$]+)\.(map|join)\(/);
    if (!m) return;
    const antes = l.slice(0, m.index);
    if (/\|\||\?\?|\?\.|Array\.isArray/.test(l)) return;   // já protegido
    if (/^\s*\/\//.test(antes)) return;                     // comentário
    suspeitos.push(`${p}:${i + 1}  ${l.trim().slice(0, 90)}`);
  });
}

if (suspeitos.length) {
  console.log(`\n${suspeitos.length} acesso(s) sem proteção — podem quebrar a tela:\n`);
  suspeitos.forEach((s) => console.log("  " + s));
  console.log("\nUse (x || []).map(...) ou x?.length para proteger.\n");
  process.exit(1);
}
console.log("Nenhum acesso desprotegido a .map/.join em dados de fetch.");

// ---------------------------------------------------------------------------
// O MENU NAO PODE APONTAR PARA UMA ROTA DESLIGADA
//
// Custou um 404 em producao para virar teste. A tela nova de Conversas
// aterrissou em `/painel/conversas` — um endereco que estava na lista
// DESLIGADAS do middleware desde que o CRM foi desligado. O middleware
// responde ANTES da pagina, entao a tela subiu perfeita e o usuario viu
// "HTTP ERROR 404".
//
// A lista casa por `startsWith`: ela desliga o endereco e TUDO abaixo dele,
// inclusive uma tela que ainda vai nascer ali. Nao da para confiar na memoria
// de quem escreve a proxima.
// ---------------------------------------------------------------------------
const mid = fs.readFileSync("src/middleware.ts", "utf8");
const bloco = mid.slice(mid.indexOf("const DESLIGADAS"), mid.indexOf("];", mid.indexOf("const DESLIGADAS")));
const desligadas = [...bloco.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);

const sidebar = fs.readFileSync("src/app/painel/Sidebar.tsx", "utf8");
const doMenu = [...sidebar.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

const mortos = doMenu.filter((h) => desligadas.some((d) => h.startsWith(d)));
if (mortos.length) {
  console.log("\nO MENU APONTA PARA ROTA DESLIGADA — vai dar 404 em producao:\n");
  mortos.forEach((h) => {
    const quem = desligadas.find((d) => h.startsWith(d));
    console.log(`  ${h}   (bloqueada por "${quem}" em src/middleware.ts)`);
  });
  console.log("\nTire a linha de DESLIGADAS ou tire o item do menu.\n");
  process.exit(1);
}
console.log(`Menu confere: ${doMenu.length} links, nenhum em rota desligada.`);
