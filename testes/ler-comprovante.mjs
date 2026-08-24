#!/usr/bin/env node
/**
 * LER UM COMPROVANTE DE VERDADE, PELA LINHA DE COMANDO.
 *
 *   node testes/ler-comprovante.mjs ~/Downloads/pix-josiane.jpg
 *
 * Por que isto existe separado dos testes: `npm run testar` prova a REGRA
 * (confiança baixa não preenche, foto que não é comprovante não preenche).
 * Ele não prova a LEITURA — se a IA acerta o valor e a data num Bradesco, num
 * Nubank, num print tremido tirado de outro celular.
 *
 * Essa parte só se prova com papel de verdade, e é a parte que erra na mão da
 * família. Este script chama exatamente a mesma função que o sistema chama e
 * mostra o que ela devolveu, SEM GRAVAR NADA.
 *
 * Precisa da ANTHROPIC_API_KEY no ambiente — a mesma da Vercel.
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("uso: node testes/ler-comprovante.mjs <caminho-da-imagem-ou-pdf>");
  process.exit(2);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("falta ANTHROPIC_API_KEY no ambiente (a mesma da Vercel).");
  process.exit(2);
}

const TIPOS = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
};
const mimetype = TIPOS[extname(arquivo).toLowerCase()] || "image/jpeg";
const base64 = readFileSync(arquivo).toString("base64");

// Importa o código REAL. Se a leitura mudar amanhã, este script muda junto —
// um segundo script "parecido" seria só mais uma cópia da regra para discordar.
const { extrairComprovante, decidirLeitura } = await import("../src/lib/comprovante.ts");

console.log(`\nlendo ${basename(arquivo)} (${mimetype}, ${Math.round(base64.length * 0.75 / 1024)} KB)…\n`);

const dados = await extrairComprovante({ base64, mimetype });
const leitura = decidirLeitura(dados);

console.log("O QUE A IA LEU");
console.log(`  é comprovante   ${dados.eh_comprovante ? "sim" : "NÃO"}`);
console.log(`  confiança       ${dados.confianca}`);
console.log(`  valor           ${dados.valor ?? "—"}`);
console.log(`  data            ${dados.data ?? "—"}`);
console.log(`  identificador   ${dados.id_transacao ?? "—"}`);

console.log("\nO QUE O SISTEMA FAZ COM ISSO");
if (leitura.confiavel) {
  const v = leitura.valor != null
    ? `R$ ${Number(leitura.valor).toFixed(2).replace(".", ",")}` : "(campo fica vazio)";
  const d = leitura.data
    ? String(leitura.data).slice(0, 10).split("-").reverse().join("/") : "(campo fica vazio)";
  console.log(`  preenche valor e data na ficha:  ${v}  ·  ${d}`);
  console.log(`  e guarda o identificador, que impede o mesmo Pix de entrar duas vezes.`);
} else {
  console.log(`  NÃO preenche nada. Na tela aparece:`);
  console.log(`  "${leitura.mensagem}"`);
}
console.log("\n(nada foi gravado)\n");
