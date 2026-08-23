// Prova que a ficha LIGA cada edicao a uma rota que aceita o campo.
// Compilar nao prova isso: o cartao "Dados da familia" compilava e editava a
// pessoa, e as rotas PATCH/DELETE de contato compilavam sem tela nenhuma.
import { readFileSync } from "node:fs";
const ficha = readFileSync("src/app/painel/clientes/[id]/page.tsx", "utf8");
const rotaFam = readFileSync("src/app/api/familias/[id]/route.ts", "utf8");
const rotaCont = readFileSync("src/app/api/familias/[id]/contatos/route.ts", "utf8");
const rotaCli = readFileSync("src/app/api/clientes/[id]/route.ts", "utf8");

let falhas = 0;
const ok = (n, c) => { console.log((c ? "  ok  " : "  !!  ") + n); if (!c) falhas++; };

ok("a ficha edita o NOME DA FAMILIA",
   /method: "PATCH"[\s\S]{0,200}JSON\.stringify\(\{ nome \}\)/.test(ficha));
ok("e a rota da familia ACEITA nome", /if \(b\.nome !== undefined\)/.test(rotaFam));

ok("a ficha edita uma PESSOA da familia (PATCH em contatos)",
   /contatos`, \{\s*method: "PATCH"/.test(ficha));
ok("e a rota de contatos TEM PATCH", /export async function PATCH/.test(rotaCont));

ok("a ficha REMOVE uma pessoa (DELETE em contatos)",
   /contatos\?contatoId=\$\{p\.id\}`, \{\s*method: "DELETE"/.test(ficha));
ok("e a rota de contatos TEM DELETE", /export async function DELETE/.test(rotaCont));

ok("o cartao do CONTATO nao se chama mais 'Dados da familia'",
   ficha.includes('titulo="Dados do contato"'));
ok("e existe um cartao proprio 'Dados da familia'",
   ficha.includes('titulo="Dados da família"'));

ok("o salvar do contato LE a resposta (nao falha calado)",
   /clientes\/\$\{c\.id\}`[\s\S]{0,300}if \(!r\?\.ok\)/.test(ficha));
ok("e a rota de cliente aceita nome/telefone",
   /"nome", "telefone"/.test(rotaCli));

ok("a barra de conferencia e RENDERIZADA", /<BarraConferencia familiaId=/.test(ficha));
ok("o cartao da familia e RENDERIZADO", /<DadosDaFamilia fam=/.test(ficha));

// o defeito que originou tudo: jazigos por familia, nao por cliente
ok("os jazigos vem por FAMILIA", /from\("tumulos"\)[\s\S]{0,400}\.eq\("familia_id", chaveFam\)/.test(rotaCli));
ok("e nao ha mais busca de tumulos por cliente_id na ficha",
   !/from\("tumulos"\)[\s\S]{0,400}\.eq\("cliente_id", id\)/.test(rotaCli));

process.exit(falhas ? 1 : 0);
