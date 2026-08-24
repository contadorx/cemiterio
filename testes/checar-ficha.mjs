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
const telaFlores  = readFileSync("src/app/painel/flores/page.tsx", "utf8");
const rotaFlores  = readFileSync("src/app/api/flores/entregas/route.ts", "utf8");
const cardFlores  = readFileSync("src/app/painel/clientes/[id]/Flores.tsx", "utf8");
const cron        = readFileSync("src/app/api/cron/diario/route.ts", "utf8");
const libCamp     = readFileSync("src/lib/campanha.ts", "utf8");

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

// ---------------------------------------------------------------------------
// FLORES: A ESTEIRA NAO PODE VIRAR UMA SEGUNDA AGENDA (0117)
//
// O risco nao e a tela ficar feia — e a flor ser contada como lavagem. Se uma
// entrega entrar em `servicos`, o painel soma seis buques como seis lavagens e
// o aviso de "cobrado sem limpeza" cala. Silencioso, que e o pior modo.
ok("a esteira das flores NAO escreve em servicos",
   !/from\("servicos"\)/.test(rotaFlores));

ok("e o cartao da ficha tambem nao",
   !/from\("servicos"\)/.test(cardFlores));

// NADA SAI SOZINHO. Foi o pedido explicito do Leandro ao encomendar isto.
ok("a entrega poe a foto na LIBERACAO, e nao no WhatsApp",
   /fila_liberacao/.test(rotaFlores)
   && /status: "aguardando"/.test(rotaFlores)
   && !/enviarWhatsapp|enviarMidia/.test(rotaFlores));

// SO SE COBRA O QUE FOI ENTREGUE — o dinheiro nasce na entrega, nunca no
// gerador. Se o gerador cobrasse, uma entrega cancelada deixaria divida.
ok("quem cobra e a entrega, e a funcao e uma so",
   /sureya_registrar_entrega/.test(rotaFlores)
   && !/conta_corrente/.test(rotaFlores));

// A COMPRA VEM ANTES DA ROTA na tela. A rota se resolve no lugar; a compra
// nao — e comprar a menos e a familia sem flor no dia em que ela foi ver.
ok("a tela poe a compra ANTES da lista de entregas",
   telaFlores.indexOf("A compra de") < telaFlores.indexOf("Nada neste dia"));

ok("e a margem diz o que NAO esta dentro dela",
   /Não\s+entra aqui o seu tempo/.test(telaFlores));

// PULAR EXIGE MOTIVO. "Pulada" sem motivo, tres meses depois, e um buraco que
// ninguem sabe explicar para a familia que ligou.
ok("nao entregue exige o motivo",
   /Diga por que não foi entregue/.test(rotaFlores));

ok("o gerador roda no cron diario, com organizacao propria",
   /gerarEsteiraDeExtras/.test(cron) && /resultado\.flores/.test(cron));

ok("e uma falha nas flores nao derruba o resto da rotina",
   /cron_diario_flores/.test(cron) && /!resultado\.flores\?\.erro/.test(cron));

// ---------------------------------------------------------------------------
// O AVISO PARA TODO MUNDO CAI NUMA TELA QUE EXISTE
//
// A campanha escrevia em `interacoes_ia` — a lista solta de rascunhos que a
// 0094 APAGOU. Ela rodava, dizia "criei 338 rascunhos", e os 338 caiam num
// lugar sem porta. Se alguem apontar de volta para la, a mensagem para todo
// mundo volta a sumir em silencio, que e o pior modo de falhar.
ok("o aviso em massa entra na FILA DE LIBERACAO",
   /fila_liberacao/.test(libCamp) && /status: "aguardando"/.test(libCamp));

ok("e nao na lista de rascunhos que foi apagada",
   !/from\("interacoes_ia"\)\s*\n?\s*\.insert/.test(libCamp)
   && !/interacoes_ia[\s\S]{0,80}rascunho:/.test(libCamp));

// UMA POR FAMILIA. Uma casa com tres telefones receberia tres vezes o mesmo
// recado — o mesmo defeito que a 0102 criou na cobranca gentil.
ok("uma mensagem por FAMILIA, e nao por contato",
   /from\("familias"\)/.test(libCamp) && /familia_id: a\.familiaId/.test(libCamp));

// SEM TELEFONE NAO HA PARA ONDE MANDAR (0116), e quem fica de fora e contado.
ok("familia sem telefone fica de fora, e e contada",
   /semTelefone/.test(libCamp) && /String\(c\.telefone \|\| ""\)\.trim\(\)/.test(libCamp));

ok("e quem pediu silencio nao recebe",
   /silenciar/.test(libCamp) && /silenciadas/.test(libCamp));

// O PUBLICO "ativos" OLHAVA `planos`, que tem UMA linha em producao desde que
// o contrato passou a morar no tumulo (0100). Selecionava quase ninguem, sem
// erro nenhum na tela.
ok("nenhum publico depende mais da tabela `planos`",
   !/from\("planos"\)/.test(libCamp));

// ===========================================================================
// OS RECORTES DE DISPARO NA FILA (0125)
//
// O risco aqui e um filtro que esconde em silencio: a Sureya recorta por
// quadra, a lista fica vazia, e "nao tem nada para liberar" vira
// indistinguivel de "eu filtrei e esqueci".
// ===========================================================================
const telaFila = readFileSync("src/app/painel/conversas/VisaoLiberacao.tsx", "utf8");

// O CORTE DE "COM CONTRATO" TEM DE SER O MESMO DO COBRADOR.
// `sureya_cobrar_competencias` exige `contratado AND valor_mensal > 0`. Um
// jazigo marcado como contratado por R$ 0,00 nao gera competencia nenhuma —
// chama-lo de "com contrato" no filtro faria a tela discordar da conta que
// manda no dinheiro.
ok("o filtro de contrato usa o mesmo corte do cobrador",
   /t\.contratado && Number\(t\.valor_mensal \|\| 0\) > 0/.test(rotaFila));

// A LOCALIZACAO E DA FAMILIA, e nao do `tumulo_id` da mensagem: a cobranca de
// rotina nao carrega tumulo, e filtrar por ele deixaria metade da fila de fora
// sem dizer.
ok("a quadra vem dos jazigos da FAMILIA, nao do tumulo da mensagem",
   /from\("tumulos"\)[\s\S]{0,200}in\("familia_id", familiaIds\)/.test(rotaFila));

// O RECORTE VALE PARA TODOS OS TIPOS. Se ele fosse aplicado depois do grupo,
// ou so dentro de "cobranca", "as fotos da quadra Q1" nao existiria.
ok("o recorte e aplicado antes do grupo, valendo para todo tipo",
   /const recortados = itens\.filter/.test(telaFila)
   && /return recortados\.filter\(g\.pega\)/.test(telaFila));

// O ENVIO EM LOTE TEM DE OBEDECER AO RECORTE — e o pedido: "filtros de
// disparo". Marcar todas dentro de um recorte nao pode marcar a fila inteira.
ok("o lote sai do que esta recortado",
   /const visiveis = itensDoGrupo\(grupoAtual\)/.test(telaFila)
   && /const enviaveis = visiveis\.filter\(podeEnviar\)/.test(telaFila)
   && /new Set\(enviaveis\.map\(\(i\) => i\.id\)\)/.test(telaFila));

// VAZIO POR RECORTE PRECISA SE EXPLICAR.
ok("lista vazia por causa do filtro diz que foi o filtro",
   /Nenhuma mensagem neste recorte/.test(telaFila)
   && /limpar o recorte/.test(telaFila));

// ===========================================================================
// PUXAR O DIA, E O CHIP QUE MENTIA (agenda)
// ===========================================================================
const telaAgenda = readFileSync("src/app/painel/agenda/page.tsx", "utf8");
const rotaMover  = readFileSync("src/app/api/agenda/dia/mover/route.ts", "utf8");

// O CHIP DIZIA "AMANHA" E MOSTRAVA HOJE: `dias: 1` com `inicio` vazio faz a
// API comecar em diaOperacao(), que e hoje. Quem clicava procurando o dia
// seguinte via o dia corrente e concluia que a agenda "comeca amanha".
ok("existe o filtro de HOJE, comecando hoje",
   /\["hoje", 1, "", "Hoje"\]/.test(telaAgenda));

ok("e o de AMANHA comeca mesmo amanha",
   /\["amanha", 1, somaDias\(diaOperacao\(\), 1\), "Amanhã"\]/.test(telaAgenda));

// O que distingue os dois nao e `dias` (e 1 nos dois): e o `inicio`. Sem isso
// na comparacao, os dois botoes acenderiam juntos.
ok("e os dois chips nao acendem juntos",
   /periodo\.dias === v && !periodo\.fim && periodo\.inicio === ini/.test(telaAgenda));

// UMA PORTA SO PARA MOVER. Escrever um segundo movedor daria duas regras para
// o mesmo ato — comecariam iguais e terminariam discordando.
ok("mover o dia usa a MESMA porta do remarcar de uma linha",
   /rpc\("sureya_remarcar_servico"/.test(rotaMover));

// O QUE JA FOI FEITO NAO ANDA: lavagem executada tem foto, data e as vezes
// cobranca lancada. Mover a data dela seria reescrever um fato.
ok("o que ja foi executado nao e movido",
   /\.in\("status", \["pendente", "agendado"\]\)/.test(rotaMover));

// MOVIDO A MAO = DECISAO DE PESSOA (0041). Sem a marca, o alocador devolve
// tudo para o dia de origem na proxima geracao, de madrugada, em silencio.
ok("o dia movido fica fixado, para o alocador nao desfazer",
   /fixado_em: new Date\(\)\.toISOString\(\)/.test(rotaMover));

// REPLANEJAR DESLIGADO no dia inteiro: arrastar o ciclo de quinze jazigos por
// causa de uma chuva mudaria meses de agenda sem ninguem pedir.
ok("mover o dia NAO arrasta o ciclo de cada jazigo por padrao",
   /p_replanejar: b\?\.replanejar === true/.test(rotaMover));

// DESTINO CHEIO OU FORA DO DIA DE TRABALHO NAO E RECUSADO — e dito. Uma
// agenda que estoura em silencio vira uma sexta com trinta paradas.
ok("o destino avisa quando nao e dia de trabalho ou estoura a capacidade",
   /diaDeTrabalho/.test(rotaMover) && /estourou/.test(rotaMover));

process.exit(falhas ? 1 : 0);
