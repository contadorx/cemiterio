#!/usr/bin/env node
/**
 * MARCADOR DE CONFLITO NUNCA E CODIGO.
 *
 * Em 24/08/2026 `src/app/painel/config/page.tsx` subiu para main com tres
 * blocos <<<<<<< / ======= / >>>>>>> por resolver. O build da Vercel morreu na
 * primeira linha de marcador, e o painel ficou fora do ar ate alguem olhar o
 * log.
 *
 * Isso nao e um erro de programacao: e um `git stash pop` que ninguem terminou
 * de resolver. Nenhum teste de logica pega — o arquivo nem chega a ser codigo.
 * Uma varredura de texto pega, e custa dois segundos.
 *
 * POR QUE E A PRIMEIRA COISA DO `npm run checar`
 * Se o arquivo nao compila, todo o resto da bateria nao tem o que medir.
 */
const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join, extname } = require("node:path");

const RAIZES = ["src", "migrations", "testes"];
const EXTENSOES = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".sh", ".json", ".md"]);
const PULAR = new Set(["node_modules", ".next", ".git", "_arquivo"]);

// Ancorados no inicio da linha e com o tamanho exato do git: sete caracteres.
// Sem isso, uma linha de `====` separando comentario viraria alarme falso, e
// alarme falso ensina a ignorar o alarme.
const MARCADORES = [/^<{7} /, /^={7}$/, /^>{7} /];

function varrer(dir, achados) {
  let entradas;
  try { entradas = readdirSync(dir); } catch { return; }
  for (const nome of entradas) {
    if (PULAR.has(nome)) continue;
    const caminho = join(dir, nome);
    let st;
    try { st = statSync(caminho); } catch { continue; }
    if (st.isDirectory()) { varrer(caminho, achados); continue; }
    if (!EXTENSOES.has(extname(nome))) continue;

    const linhas = readFileSync(caminho, "utf8").split("\n");
    linhas.forEach((linha, i) => {
      if (MARCADORES.some((m) => m.test(linha))) {
        achados.push(`${caminho}:${i + 1}  ${linha.slice(0, 60)}`);
      }
    });
  }
}

const achados = [];
for (const r of RAIZES) varrer(r, achados);

if (achados.length) {
  console.log(`\n${achados.length} marcador(es) de conflito por resolver:\n`);
  achados.forEach((a) => console.log(`  ${a}`));
  console.log("\nIsto nao compila. Resolva o conflito antes de commitar.\n");
  process.exit(1);
}
console.log("Nenhum marcador de conflito.");
