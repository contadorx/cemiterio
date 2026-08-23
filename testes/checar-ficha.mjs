// Prova que a ficha LIGA cada edicao a uma rota que aceita o campo.
// Compilar nao prova isso: o cartao "Dados da familia" compilava e editava a
// pessoa, e as rotas PATCH/DELETE de contato compilavam sem tela nenhuma.
import { readFileSync, existsSync } from "node:fs";
const ficha = readFileSync("src/app/painel/clientes/[id]/page.tsx", "utf8");
const rotaFam = readFileSync("src/app/api/familias/[id]/route.ts", "utf8");
const rotaCont = readFileSync("src/app/api/familias/[id]/contatos/route.ts", "utf8");
const rotaCli = readFileSync("src/app/api/clientes/[id]/route.ts", "utf8");
const rotaConv = readFileSync("src/app/api/conversas/route.ts", "utf8");
const telaConv = readFileSync("src/app/painel/conversas/VisaoConversas.tsx", "utf8");
const telaConvIndex = readFileSync("src/app/painel/conversas/page.tsx", "utf8");
const lista       = readFileSync("src/app/painel/clientes/page.tsx", "utf8");
const rotaLista   = readFileSync("src/app/api/clientes/route.ts", "utf8");
const rotaCC      = readFileSync("src/app/api/conta-corrente/route.ts", "utf8");
const rotaFila    = readFileSync("src/app/api/fila/route.ts", "utf8");
const libFin      = readFileSync("src/lib/financeiro.ts", "utf8");
const libProativo = readFileSync("src/lib/proativo.ts", "utf8");

// O que o usuario LE e o arquivo sem comentarios. Uma checagem que proibe um
// texto tem de olhar aqui: senao explicar num comentario por que o texto saiu
// derruba o teste, e a licao fica sem lugar para morar.
const semComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fichaVisivel = semComentarios(ficha);

let falhas = 0;
const ok = (n, c) => { console.log((c ? "  ok  " : "  !!  ") + n); if (!c) falhas++; };

ok("a ficha edita o NOME DA FAMILIA",
   /familias\/\$\{familiaId\}`, \{\s*method: "PATCH"/.test(ficha)
   && /rotulo="Nome da família"/.test(ficha));
ok("e a rota da familia ACEITA nome", /if \(b\.nome !== undefined\)/.test(rotaFam));

ok("a ficha edita uma PESSOA da familia (PATCH em contatos)",
   /contatos`, \{\s*method: "PATCH"/.test(ficha));
ok("e a rota de contatos TEM PATCH", /export async function PATCH/.test(rotaCont));

ok("a ficha REMOVE uma pessoa (DELETE em contatos)",
   /contatos\?contatoId=\$\{p\.id\}`, \{\s*method: "DELETE"/.test(ficha));
ok("e a rota de contatos TEM DELETE", /export async function DELETE/.test(rotaCont));

// UM CARTAO SO PARA CADA COISA. Havia "Dados do contato" (uma pessoa) E
// "Contatos da familia" (todas); e "Contrato" (da familia) E "Tumulo". Os
// dois pares foram fundidos, e as funcoes velhas SAIRAM do arquivo — codigo
// que compila, nao e renderizado e volta a ser chamado por engano ja mordeu
// esta ficha uma vez.
ok("o cartao duplicado de contato nao existe mais",
   !ficha.includes('titulo="Dados do contato"') && !/function Identificacao\(/.test(ficha));
ok("o cartao de contrato foi absorvido",
   !/function Contrato\(/.test(ficha));
ok("e existe um cartao proprio 'Dados da familia'",
   ficha.includes('titulo="Dados da família"'));
ok("o que e da familia mora nele (fotos, quando paga, extrato)",
   /rotulo="Fotos do serviço para esta família"/.test(ficha)
   && /rotulo="A família paga"/.test(ficha)
   && /rotulo="No extrato"/.test(ficha));
ok("e o que e do jazigo mora no jazigo (mensal, base, inicio)",
   /rotulo="Valor mensal deste túmulo"/.test(ficha)
   && /rotulo="Esse valor é"/.test(ficha)
   && /rotulo="Cobrar a partir de"/.test(ficha));

// VARIOS PODEM ACERTAR A CONTA; o TITULAR continua sendo um.
ok("da para marcar mais de um contato financeiro",
   /acertaConta: ligar/.test(ficha) && /também acerta a conta/.test(ficha));
ok("e a rota aceita a marcacao", /acertaConta === "boolean"/.test(rotaCont));

// O TETO CAIU NO BANCO (0102), ENTAO A TELA NAO PODE REPOR UM PROPRIO.
// A tela tinha recusa propria para desmarcar o titular — mais dura que a regra
// da casa. O unico limite e o PISO, e quem o aplica e o gatilho; a rota so
// traduz a recusa para o portugues.
ok("a tela nao inventa limite proprio de pagador",
   !/e o titular desta família/.test(ficha));
ok("e a recusa do banco vira frase, nao codigo",
   /familia_ficaria_sem_quem_acerta_a_conta/.test(rotaCont)
   && /Marque outra antes de tirar esta/.test(rotaCont));

// O NOME DE NINGUEM NUMA CAIXA DE CADASTRO.
ok("a caixa do tumulo nao tem mais o nome da Nina",
   !/A Nina limpa este túmulo/.test(fichaVisivel) && /entra na rota/.test(fichaVisivel));

// CODIGO INTERNO NAO VAI PARA A TELA.
ok("o erro cru nao vaza para a ficha",
   !/setErro\(r\?\.mensagem \|\| r\?\.erro/.test(ficha) && /function traduzirErro/.test(ficha));

ok("a rota de cliente aceita nome/telefone", /"nome", "telefone"/.test(rotaCli));

ok("a barra de conferencia e RENDERIZADA", /<BarraConferencia familiaId=/.test(ficha));
ok("o cartao da familia e RENDERIZADO", /<DadosDaFamilia fam=/.test(ficha));

// o defeito que originou tudo: jazigos por familia, nao por cliente
ok("os jazigos vem por FAMILIA", /from\("tumulos"\)[\s\S]{0,400}\.eq\("familia_id", chaveFam\)/.test(rotaCli));
ok("e nao ha mais busca de tumulos por cliente_id na ficha",
   !/from\("tumulos"\)[\s\S]{0,400}\.eq\("cliente_id", id\)/.test(rotaCli));



// ---------------------------------------------------------------------------
// A SEGUNDA PORTA DA IA FICA FECHADA
//
// Os rascunhos da IA tinham LISTA PROPRIA — uma aba "Fila antiga" com textos
// soltos, sem a pergunta que os originou. Foi por ela que 162 rascunhos se
// acumularam sem ninguem ver. A 0094 fechou a segunda porta das mensagens e
// deixou esta aberta.
//
// A sugestao agora mora DENTRO da conversa. Se alguem recriar a lista solta, o
// problema volta inteiro — e volta silencioso, que e o pior jeito.
ok("a lista solta de rascunhos da IA nao existe mais",
   !existsSync("src/app/painel/conversas/VisaoRascunhos.tsx")
   && !/VisaoRascunhos/.test(telaConvIndex));

ok("e a aba 'Fila antiga' saiu das abas",
   !/\["antiga"/.test(telaConvIndex));

ok("a conversa CARREGA a sugestao da IA, nao so o aviso de que existe",
   /motivo_retencao/.test(rotaConv) && /sugestao: sugestaoDe\.get/.test(rotaConv));

ok("e a tela MOSTRA o texto e o motivo",
   /c\.sugestao/.test(telaConv) && /segurou porque/.test(telaConv));

// ---------------------------------------------------------------------------
// COMPETENCIA, VENCIMENTO E INADIMPLENCIA SAO TRES COISAS (0114)
//
// `conta_corrente.data` e o VENCIMENTO num debito de contrato. A Anninha paga
// em dezembro pelo semestre jul-dez: os meses ja prestados sao receita de
// julho e de agosto e nao sao divida nenhuma ate o dia 10 de dezembro.
//
// O jeito de perder isso e discreto: alguem soma `saldo` num lugar so e a
// familia volta a nascer inadimplente no dia em que o mes prestado vira
// receita. Cada uma das linhas abaixo e um desses lugares.
ok("o saldo da familia separa VENCIDO de A VENCER",
   /vencido: number/.test(libFin) && /aVencer: number/.test(libFin));

ok("e quem pergunta 'posso cobrar?' le o vencido",
   /s\.vencido < -0\.005/.test(libFin));

ok("a lista de familias marca atrasado pelo que VENCEU",
   /atrasado: Number\(c\.vencido \|\| 0\) < -0\.005/.test(rotaLista)
   && !/atrasado: c\.saldo/.test(rotaLista));

ok("e mostra o mesmo numero que usou para marcar",
   /money\(Math\.abs\(c\.vencido\)\)/.test(lista));

ok("a ficha diz 'Em dia' sobre o que venceu, nao sobre o que existe",
   /emDia: vencido <= 0\.005/.test(rotaCC));

ok("e o que ainda vai vencer aparece, em vez de sumir",
   /a vencer/.test(rotaCC) && /aVencer/.test(ficha));

ok("o corte de INADIMPLENTE na fila usa vencido, nao saldo",
   /select\("familia_id,vencido"\)/.test(rotaFila));

ok("a cobranca gentil nao cobra o que ainda nao venceu",
   /s\.vencido >= -0\.005\) continue/.test(libProativo)
   && !/s\.saldo >= -0\.005\) continue;\n\n    const valor/.test(libProativo));

process.exit(falhas ? 1 : 0);
