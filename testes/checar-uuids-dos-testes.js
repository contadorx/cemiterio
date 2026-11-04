/**
 * DOIS TESTES NAO PODEM USAR O MESMO UUID.
 *
 * CUSTOU UM TESTE DE DINHEIRO DESLIGADO, calado, por meses.
 *
 * `migrar-limpo.sh` roda TODOS os arquivos de `testes/*.sql` contra o MESMO
 * banco, em sequencia. `painel_do_mes.sql` criou o jazigo CI-PN-A com o id
 * ...0161; `cobranca_por_competencia.sql` usava esse mesmo id para o caso da
 * Aurea — contrato antigo, pre-pago, R$ 40, agosto. O `on conflict do nothing`
 * dele virou um no-op: a Aurea nunca entrou, e o assert passou a cobrar o
 * jazigo do outro teste, de R$ 100 e competencia do mes corrente.
 *
 * O teste nao ficou vermelho. Ele ficou VERDE testando outra coisa — que e o
 * pior dos dois estados, porque ninguem vai olhar.
 *
 * Este guarda e estatico de proposito: ele nao sabe o que cada arquivo faz com
 * o id, so que dois arquivos escreveram o mesmo. Quando um par novo aparecer,
 * ou se troca o id, ou se acrescenta aqui com o motivo escrito.
 */
const fs = require("fs");
const path = require("path");

const DIR = "testes";
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * OS PARES JA CONHECIDOS, com o motivo de cada um.
 *
 * `arquivos_orfaos.sql` e `regua_prioridade.sql` terminam desfazendo tudo
 * ("o ensaio foi desfeito, nada ficou no banco"), entao compartilhar a org de
 * cenario com outros arquivos nao deixa linha atras. Nao e bonito — e nao e o
 * mesmo defeito.
 */
const PERMITIDOS = new Set([
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
  "44444444-4444-4444-4444-444444444444",
  "99999999-9999-9999-9999-999999999999",
  "aaaaaaaa-0000-0000-0000-000000000001",
  "bbbbbbbb-0000-0000-0000-000000000001",
  "bbbbbbbb-0000-0000-0000-000000000002",
  "cccccccc-0000-0000-0000-000000000001",
]);

const onde = new Map();
for (const nome of fs.readdirSync(DIR)) {
  if (!nome.endsWith(".sql")) continue;
  const texto = fs.readFileSync(path.join(DIR, nome), "utf8");
  for (const achado of texto.match(UUID) || []) {
    const u = achado.toLowerCase();
    if (!onde.has(u)) onde.set(u, new Set());
    onde.get(u).add(nome);
  }
}

const repetidos = [];
for (const [u, arquivos] of onde) {
  if (arquivos.size > 1 && !PERMITIDOS.has(u)) {
    repetidos.push(`${u}  em  ${[...arquivos].sort().join(", ")}`);
  }
}

if (repetidos.length) {
  console.log(`\n${repetidos.length} uuid(s) em mais de um teste:\n`);
  repetidos.forEach((r) => console.log("  " + r));
  console.log("\nOs testes rodam contra o MESMO banco. Um `on conflict do nothing`");
  console.log("sobre id repetido nao da erro: o segundo arquivo passa a testar a");
  console.log("linha do primeiro, e fica verde testando outra coisa.");
  console.log("Troque o id, ou acrescente em PERMITIDOS com o motivo escrito.\n");
  process.exit(1);
}
console.log(`UUIDs dos testes: ${onde.size} ids, nenhum repetido fora dos ${PERMITIDOS.size} conhecidos.`);
