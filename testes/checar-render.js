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
