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
const telaCampo   = readFileSync("src/app/campo/page.tsx", "utf8");
const libBuscar   = readFileSync("src/lib/buscar.ts", "utf8");
const home        = readFileSync("src/app/painel/page.tsx", "utf8");
const sinais      = readFileSync("src/app/painel/SinaisDeVida.tsx", "utf8");
const blocoPrec   = readFileSync("src/app/painel/PrecisaDeVoce.tsx", "utf8");
const rotaPrec    = readFileSync("src/app/api/precisa-de-voce/route.ts", "utf8");
const pecas       = readFileSync("src/app/painel/pecas.tsx", "utf8");
const telaAgenda2 = readFileSync("src/app/painel/agenda/page.tsx", "utf8");
const telaLib     = readFileSync("src/app/painel/conversas/VisaoLiberacao.tsx", "utf8");
const libFila     = readFileSync("src/lib/offline-fila.ts", "utf8");
const telaNaoDeu  = readFileSync("src/app/campo/NaoDeu.tsx", "utf8");
const telaMat     = readFileSync("src/app/campo/Materiais.tsx", "utf8");
const dialogos    = readFileSync("src/components/Dialogos.tsx", "utf8");
const layPainel   = readFileSync("src/app/painel/layout.tsx", "utf8");
const layCampo    = readFileSync("src/app/campo/layout.tsx", "utf8");
const assistente  = readFileSync("src/app/campo/Assistente.tsx", "utf8");
const vocab       = readFileSync("src/lib/vocabulario.ts", "utf8");
const funilTela   = readFileSync("src/app/painel/financeiro/Funil.tsx", "utf8");
const funilRota   = readFileSync("src/app/api/financeiro/funil/route.ts", "utf8");
const cadastro    = readFileSync("src/app/painel/clientes/CadastrarFamilia.tsx", "utf8");
const medidas     = readFileSync("src/app/painel/medidas.ts", "utf8");
const uiTsx       = readFileSync("src/app/painel/ui.tsx", "utf8");
const estiloMovel = readFileSync("src/app/painel/EstiloMobile.tsx", "utf8");
const rotaTumulo  = readFileSync("src/app/api/tumulos/[id]/route.ts", "utf8");
const rotaOrfaos  = readFileSync("src/app/api/manutencao/arquivos-orfaos/route.ts", "utf8");
const rotaLgpd    = readFileSync("src/app/api/clientes/[id]/lgpd/route.ts", "utf8");
const atendimento = readFileSync("src/lib/atendimento.ts", "utf8");
const telaThread  = readFileSync("src/app/painel/conversas/[id]/page.tsx", "utf8");
const rotaThread  = readFileSync("src/app/api/conversas/[id]/route.ts", "utf8");
const telaPrio    = readFileSync("src/app/painel/config/Prioridade.tsx", "utf8");
const rotaPrio    = readFileSync("src/app/api/config/prioridade/route.ts", "utf8");
const libAgenda2  = readFileSync("src/lib/agenda.ts", "utf8");
const { readdirSync, statSync } = await import("node:fs");
const { join } = await import("node:path");
function varrer(dir, achados = []) {
  for (const nome of readdirSync(dir)) {
    const cheio = join(dir, nome);
    if (statSync(cheio).isDirectory()) varrer(cheio, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(cheio);
  }
  return achados;
}

// O que o usuario LE e o arquivo sem comentarios. Uma checagem que proibe um
// texto tem de olhar aqui: senao explicar num comentario por que o texto saiu
// derruba o teste, e a licao fica sem lugar para morar.
//
// ESTE AJUDANTE JA EXISTIA E EU TROPECEI NELE TRES VEZES EM DOIS DIAS — no
// `semPlano` (0128), no "Virou cliente" (conversas) e no botao da avulsa
// (0132). Nas tres, a guarda achou no COMENTARIO a citacao do que fora
// trocado, e reprovou um conserto correto. Toda busca NEGATIVA passa por
// aqui. Numa positiva, achar no comentario e inofensivo.
const semComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * O MESMO, PARA SQL.
 *
 * `semComentarios` tira comentario de JavaScript (`//` e a barra-asterisco) e
 * NAO tira o `--` do SQL. A guarda da 0140 pegou isso na hora: ela procura, no
 * corpo da migration, que o `where telefone in (select telefone from clientes)`
 * NAO esteja mais la — e o cabecalho da migration CITA essa linha, para
 * explicar o bug que ela conserta. A busca negativa achava a citacao e reprovava
 * um conserto correto, que e exatamente o defeito que `semComentarios` existe
 * para evitar.
 *
 * So linhas inteiras de comentario: `--` no meio de uma linha pode estar dentro
 * de um literal de texto, e apagar dali mutilaria o SQL que se quer conferir.
 */
const semComentariosSql = (t) => t.replace(/^\s*--.*$/gm, "");
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

// A REGRA MUDOU DE CASA, E A GUARDA FOI ATRAS DELA.
//
// Ela cobrava a conta dentro de `/api/conta-corrente`. A conferencia passou a
// mostrar o mesmo saldo, e recalcular la seria a segunda conta sobre os mesmos
// fatos — entao a regra virou `lib/saldo.ts`, chamada pelas duas rotas.
//
// A guarda foi atualizada porque o CODIGO mudou de proposito, nao porque era
// mais facil mexer nela: o que ela protege continua sendo o mesmo, e agora tem
// tambem oito asserts de comportamento em `testes/simular.ts` — inclusive o do
// debito que vence HOJE, que e onde o dia em UTC estragava tudo.
const libSaldo = readFileSync("src/lib/saldo.ts", "utf8");

ok("a ficha diz 'Em dia' sobre o que venceu, nao sobre o que existe",
   /emDia: vencido <= 0\.005/.test(libSaldo));

ok("e o que ainda vai vencer aparece, em vez de sumir",
   /a vencer/.test(libSaldo) && /aVencer/.test(ficha));

// O dia que decide o vencimento e o da OPERACAO. Era aqui que o UTC entrava.
ok("e quem decide o vencido e o dia da operacao, nao o de UTC",
   /hoje = diaOperacao\(\)/.test(libSaldo));

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

// ===========================================================================
// AVULSO E O QUE ALGUEM PEDIU (0128)
//
// Estas guardas nao existem para provar que a coluna `origem` foi usada. Elas
// existem para impedir a VOLTA da conta antiga. `avulso = !plano_id` esteve
// certa por 25 migrations e continuou parecendo certa depois de parar de ser:
// nao quebrou nada, nao deu erro, so passou a responder "sim" para tudo. Em
// 24/08 eram 258 de 262 servicos chamados de avulsos, os 258 em jazigo
// contratado. Um defeito que nao grita e um que ninguem procura.
// ===========================================================================
const rotaServicos   = readFileSync("src/app/api/servicos/route.ts", "utf8");
const rotaFinMes     = readFileSync("src/app/api/financeiro/mes/route.ts", "utf8");
const libRemuneracao = readFileSync("src/lib/remuneracao.ts", "utf8");
const libAgenda      = readFileSync("src/lib/agenda.ts", "utf8");
const rotaFeito      = readFileSync("src/app/api/servico/registrar-feito/route.ts", "utf8");
const rotaMes        = readFileSync("src/app/api/mes/route.ts", "utf8");
const telaInicio     = readFileSync("src/app/painel/page.tsx", "utf8");
const telaAvulsos    = readFileSync("src/app/painel/avulsos/page.tsx", "utf8");

ok("a lista de servicos separa avulso por ORIGEM, nao por plano",
   /\.eq\("origem", "pedido"\)/.test(rotaServicos) &&
   /avulso: s\.origem === "pedido"/.test(rotaServicos));

ok("e a conta antiga (`plano_id is null` = avulso) sumiu de la",
   !/is\("plano_id", null\)/.test(rotaServicos) &&
   !/avulso: !s\.plano_id/.test(rotaServicos));

ok("o relatorio do mes conta avulsa por origem",
   /s\.origem === "pedido"/.test(rotaFinMes) &&
   !/!s\.plano_id \|\| s\.planos\?\.cadencia === "avulso"/.test(rotaFinMes));

// ISTO AQUI DECIDE PAGAMENTO. Uma regra com `so_avulso`, ou com valor
// diferente para avulso, pagaria a Nina pelo balde errado.
ok("a regra de remuneracao pergunta a origem, nao o plano",
   /servico\?\.origem === "pedido"/.test(libRemuneracao) &&
   !/if \(!servico\?\.plano_id\) return true/.test(libRemuneracao));

ok("e as duas leituras dela trazem a coluna origem",
   (readFileSync("src/app/api/equipe/remuneracao/route.ts", "utf8")
     .match(/plano_id,origem/g) || []).length === 2);

// O gerador escreve centenas de linhas por rodada. Deixar no default seria
// repetir o erro que causou tudo isto: um campo importante ficando implicito.
ok("o gerador de contrato diz, por escrito, que a lavagem e de contrato",
   /origem: "contrato"/.test(libAgenda));

ok("as duas portas de pedido gravam pedido",
   /origem: "pedido"/.test(readFileSync("src/app/api/servico/route.ts", "utf8")) &&
   /origem: "pedido"/.test(readFileSync("src/app/api/pedidos-conversa/route.ts", "utf8")));

// "avulso tem o estado do tumulo, mas o servico somente o solicitado":
// registrar uma limpeza JA FEITA nao e pedido nenhum — quem responde e o
// estado do jazigo.
ok("registrar limpeza ja feita decide pelo ESTADO DO JAZIGO",
   /origem: ehContratado \? "contrato" : "pedido"/.test(rotaFeito) &&
   /contratado,valor_mensal/.test(rotaFeito));

// 293 familias recebiam selo "avulso" e nenhuma era avulsa; 122 nem jazigo
// tem. Cadastro pela metade nao e regime de cobranca.
ok("o regime da familia tem TRES respostas, e sai dos jazigos",
   /"sem_jazigo"/.test(rotaMes) && /"contrato"/.test(rotaMes) && /"avulso"/.test(rotaMes) &&
   // ancorado no inicio da linha: a conta velha aparece CITADA num comentario
   // logo acima, e uma busca solta acharia a citacao e reprovaria o conserto
   !/^\s+semPlano: !f\.contratado/m.test(rotaMes));

ok("e a tela de Inicio nao chama de avulsa a familia sem jazigo",
   /l\.regime === "sem_jazigo"/.test(telaInicio) &&
   /l\.regime === "avulso"/.test(telaInicio));

ok("o vazio da tela de Avulsos e explicado, nao deixado no ar",
   /vazio aqui é uma boa notícia/.test(telaAvulsos));

// --- e na AGENDA tambem (0128) ------------------------------------------
// A agenda mistura contrato e pedido de proposito: e uma rota so, e a Nina
// lava as duas do mesmo jeito. O que NAO pode e as duas serem a mesma linha na
// tela — adiar uma de contrato encurta o intervalo; adiar um pedido fura uma
// data combinada com a familia.
const rotaSemana = readFileSync("src/app/api/agenda/semana/route.ts", "utf8");

ok("a agenda traz a origem de cada lavagem",
   /tumulo_id,origem,data_desejada/.test(rotaSemana) &&
   /origem: \(\(s as any\)\.origem \|\| "nao_definido"\)/.test(rotaSemana));

ok("a linha da agenda mostra quando foi PEDIDA",
   /s\.origem === "pedido"/.test(telaAgenda) && /🙋 pedido/.test(telaAgenda));

ok("e da para ver so os pedidos",
   /recorte === "pedidos" && s\.origem !== "pedido"/.test(telaAgenda) &&
   /\["pedidos", "só pedidos"\]/.test(telaAgenda));

// A CAIXA QUE FABRICAVA AVULSO. Criava, de uma vez, uma lavagem para todo
// mundo — a unica maquina do sistema que produzia avulso sem ninguem pedir.
ok("nao existe mais caixa de 'incluir os avulsos deste mes'",
   !/incluirAvulsos/.test(telaAgenda) &&
   !/Incluir os avulsos neste mês/.test(telaAgenda));

ok("e nem o gerador do mes sabe fabricar avulso",
   !/incluirAvulsos/.test(libAgenda) && !/avulsosIncluidos/.test(libAgenda) &&
   /if \(!DIAS_CICLO\[p\.cadencia\]\) continue;/.test(libAgenda));

// ===========================================================================
// A ABA CONVERSAS TAMBEM TEM NUMERO, E O CONTATO DO SITE TEM PARA ONDE IR
// ===========================================================================
//
// Duas guardas sobre o MESMO defeito, que ja custou dezenove dias de silencio:
// coisa que espera por alguem e nao aparece em lugar nenhum.
const telaConversas = readFileSync("src/app/painel/conversas/page.tsx", "utf8");
const visaoConversas = readFileSync("src/app/painel/conversas/VisaoConversas.tsx", "utf8");
const visaoSite = readFileSync("src/app/painel/conversas/VisaoSite.tsx", "utf8");
const rotaContatos = readFileSync("src/app/api/contatos/route.ts", "utf8");

// Liberacao e Contatos do site diziam quantos havia; Conversas ficava muda.
ok("a aba Conversas tem numero, como as outras duas",
   /conv\?\.pendentes \?\? null/.test(telaConversas));

// E O NUMERO NAO E "QUANTAS CONVERSAS EXISTEM": sao 161, e 3 pedem alguma
// coisa. Um crachá com 161 vira ruido, e ruido se aprende a ignorar.
ok("e o numero vem dos CONTADORES, nao do tamanho da lista",
   /r\.contadores/.test(telaConversas) &&
   !/\(r\.conversas \|\| \[\]\)\.length/.test(telaConversas));

ok("o cracha diz quantos e a linha de resumo diz o que",
   /conversas esperam/.test(telaConversas) &&
   /sem resposta/.test(telaConversas) && /escalada/.test(telaConversas));

// Link que abre a aba e deixa a pessoa procurando qual das 161 nao serve.
ok("e o atalho do resumo chega com o recorte feito",
   /ver=aguardando/.test(telaConversas) &&
   /get\("ver"\)/.test(visaoConversas));

// -- o contato do site vira gente de uma familia -----------------------------
// "Virou cliente" so escrevia status no lead: 108 de 112 contatos ficaram com
// `cliente_id` nulo, e a ponte nunca existiu.
ok("existe a acao que cria familia, contato e conversa",
   /case "virar_familia"/.test(rotaContatos));

ok("e ela grava o cliente_id no lead — a ponte que faltava",
   /patch\.cliente_id = clienteId/.test(rotaContatos));

// UMA PORTA SO PARA ABRIR CONVERSA. Duas comecariam iguais e terminariam
// discordando sobre o que e "conversa aberta".
ok("a conversa nasce pela MESMA porta do WhatsApp",
   /garantirConversa\(clienteId\)/.test(rotaContatos) &&
   !/from\("conversas"\)\s*\n?\s*\.insert/.test(rotaContatos));

// Telefone repetido e o caso comum: quem escreve pelo site pode ja estar na
// casa. A resposta tem de dizer ONDE, e nao "erro ao salvar".
ok("telefone repetido responde ONDE a pessoa ja esta",
   /telefone_ja_existe/.test(rotaContatos));

ok("a tela oferece virar contato de uma familia",
   /Virar contato de uma família/.test(visaoSite) &&
   /acao: "virar_familia"/.test(visaoSite));

// Um "pronto" sem para onde ir faz o assunto se perder.
ok("e depois de converter mostra o caminho para a ficha e para a conversa",
   /ir para a conversa/.test(visaoSite) && /abrir a ficha/.test(visaoSite));

// O botao antigo prometia "Virou cliente" e nao criava cliente nenhum.
ok("o botao que so carimbava status nao promete mais o que nao faz",
   // `semComentarios` porque o rotulo antigo aparece CITADO no comentario que
   // explica a troca — o ancoramento no JSX que eu tinha posto aqui era
   // fragil, e o ajudante ja existia no topo deste arquivo.
   !/Virou cliente/.test(semComentarios(visaoSite)) &&
   /Já é cliente — só tirar da fila/.test(visaoSite));

// ===========================================================================
// A LIMPEZA AVULSA TEM BOTAO (0132)
// ===========================================================================
//
// `POST /api/servico` foi escrita para marcar a avulsa — o cabecalho dela
// dizia "agora tem botao na ficha da familia" — e NENHUMA tela a chamava. O
// vazio da tela de Avulsos prometia esse botao. Estas guardas existem para o
// caminho nao voltar a ser uma promessa.
const fichaFamilia = readFileSync("src/app/painel/clientes/[id]/page.tsx", "utf8");
const rotaServico  = readFileSync("src/app/api/servico/route.ts", "utf8");

ok("a ficha da familia CHAMA a rota de marcar avulsa",
   /fetch\("\/api\/servico", \{/.test(fichaFamilia));

// Dois atos diferentes: uma que ja aconteceu, outra que vai acontecer.
ok("e os dois botoes dizem qual e qual",
   /Marcar avulsa/.test(fichaFamilia) && /Registrar feita/.test(fichaFamilia));

ok("o formulario tem os quatro campos pedidos",
   /Para quando/.test(fichaFamilia) && /rotulo="Valor"/.test(fichaFamilia) &&
   /rotulo="Recebimento"/.test(fichaFamilia) && /Quem pediu/.test(fichaFamilia));

ok("os contatos da familia alimentam o 'quem pediu'",
   /\/api\/familias\/\$\{familiaId\}\/contatos/.test(fichaFamilia));

ok("a rota aceita o contato e o momento da cobranca",
   /momentoCobranca/.test(rotaServico) && /momento_cobranca: momento/.test(rotaServico));

// Um id de outra familia passaria pelo banco e poria o pedido no nome de um
// estranho: a coluna so exige que o contato exista.
ok("e confere se o contato e MESMO daquela familia",
   /contato_de_outra_familia/.test(rotaServico));

// "Antes" so e escolha de verdade se FIZER alguma coisa.
ok("recebimento ANTES cria a divida na hora",
   /momento === "antes" && valor !== null && valor > 0/.test(rotaServico) &&
   /origem: "avulso"/.test(rotaServico));

// `valorDaLimpeza()` devolve ZERO para familia sem contrato em modo consumo —
// a avulsa viraria um debito de R$ 0,00, trabalho feito que nunca vira dinheiro.
ok("e cobra o preco DO SERVICO, nao o da conta do contrato",
   /valor,\n        descricao: `Limpeza avulsa/.test(rotaServico));

ok("o vazio da tela de Avulsos nao promete mais o botao que nao existia",
   !/🧽 Nova limpeza avulsa/.test(
     semComentarios(readFileSync("src/app/painel/avulsos/page.tsx", "utf8"))) &&
   /no botão Marcar avulsa/.test(readFileSync("src/app/painel/avulsos/page.tsx", "utf8")));

// ===========================================================================
// CONFERIR UM COMPROVANTE E DECIDIR, NAO E SO DIZER SIM (0134)
// ===========================================================================
//
// A tela mostrava imagem, valor, data e o nome do contato, e oferecia dois
// botoes. Para dizer "sim, este dinheiro entrou" faltava de quem e, quanto a
// familia deve e a que se refere. Confirmar virava um sim automatico.
const telaFin  = readFileSync("src/app/painel/financeiro/page.tsx", "utf8");
const rotaComp = readFileSync("src/app/api/comprovantes/route.ts", "utf8");
const rotaConc = readFileSync("src/app/api/financeiro/conciliar/route.ts", "utf8");

ok("a lista de comprovantes traz o contexto da decisao",
   /familiaId/.test(rotaComp) && /devendo/.test(rotaComp) &&
   /competencias/.test(rotaComp) && /jazigos/.test(rotaComp));

// O contato e quem apertou o botao; a conta e da FAMILIA.
ok("a tela mostra a familia, e nao so quem mandou",
   /c\.familia \|\| c\.cliente/.test(telaFin) && /mandado por/.test(telaFin));

// ESTA GUARDA FALHOU NO BUILD E, E ESTAVA CERTA EM FALHAR.
// Ela esperava as palavras "em aberto" e "saldo a favor dela". O Build E fixou
// o vocabulario do dinheiro (src/lib/vocabulario.ts) e as duas viraram "a
// receber" e "a favor dela". A expectativa mudou porque a TELA mudou de
// proposito — nao para a guarda parar de reclamar.
ok("e diz quanto essa familia deve",
   /a receber:/.test(telaFin) && /a favor dela/.test(telaFin));

// A leitura da IA e palpite bom, nao fato: quem tem o extrato do banco e ela.
ok("o valor e a data sao corrigiveis na conferencia",
   /Valor que entrou/.test(telaFin) && /Dia em que caiu/.test(telaFin) &&
   /a leitura dizia/.test(telaFin));

// O rotulo virou PLURAL na 0144 — "A que meses se refere" —, porque um
// pagamento cobre varios. A guarda acompanha: o que ela protege e que a tela
// continue perguntando as duas coisas, nao a palavra exata.
// Os DOIS rotulos viraram plural: um pagamento cobre varios meses (0144) e
// varios jazigos (0146). A guarda protege que a tela continue perguntando as
// duas coisas — nao a palavra exata.
ok("da para dizer de quais jazigos e a que meses se refere",
   /De quais jazigos/.test(telaFin) && /A que meses se refere/.test(telaFin));

// Familia sem contrato e o caso de quem esta sendo cadastrada agora — nao e
// erro, mas quem confirma precisa saber.
ok("e avisa quando a familia ainda nao tem contrato",
   /ainda não tem contrato/.test(telaFin) && /cadastrar o contrato/.test(telaFin));

ok("a rota leva a decisao inteira para o banco",
   /p_valor: valor/.test(rotaConc) && /p_tumulo/.test(rotaConc) &&
   /p_competencia: competencia/.test(rotaConc));

// Vazio e DIFERENTE de zero: vazio quer dizer "nao corrigi nada".
ok("campo vazio nao vira zero na hora de conferir",
   /cru === "" \|\| cru === null \|\| cru === undefined/.test(rotaConc));

// CANCELAR A CAMERA NAO GUARDA UMA ORDEM PARA DEPOIS.
// A acao pendente era lida de `pendente.current` DEPOIS do await, e so era
// limpa no `finally`. Quem tocasse em "comecar", saisse da camera sem foto, e
// mais tarde abrisse a camera por outro caminho, executava o "comecar" velho
// com a foto nova. A acao passa a ser copiada para uma variavel local e o ref
// e zerado ANTES de qualquer saida da funcao.
const campoVisivel = semComentarios(telaCampo);
ok("cancelar a camera limpa a acao que estava pendente",
   /const acao = pendente\.current;\s*\n\s*pendente\.current = null;\s*\n\s*if \(!arquivo \|\| !acao\) return;/
     .test(campoVisivel));

ok("a foto executa a acao que foi pedida, nao a que sobrou no ref",
   /if \(acao === "comecar"\) onIniciar\(foto\);/.test(campoVisivel) &&
   !/if \(pendente\.current === "comecar"\)/.test(campoVisivel));

// ===================== BUILD A: falha nao pode parecer vazio =====================
//
// A tela inicial dizia "Nenhuma pendencia neste mes" quando /api/mes CAIA — a
// mesma frase de um mes em dia. Vazio nao e zero, agora tambem na tela.

// O ajudante tem de reprovar as TRES formas de nao saber. A terceira e a que
// mais passava batido: a rota responde 200 dizendo {ok:false} e o .then sai
// sem fazer nada, deixando a tela no estado inicial — vazio.
ok("o ajudante de busca reprova rede, HTTP e corpo negativo",
   /if \(!r\.ok\) throw new Error/.test(libBuscar) &&
   /corpo\?\.ok === false\) throw new Error/.test(libBuscar) &&
   /catch \(e\)/.test(libBuscar));

ok("e guarda a hora em que o dado virou verdade",
   /setAtualizadoEm\(new Date\(\)\)/.test(libBuscar) && /atualizadoEm/.test(libBuscar));

// Apagar a tela quando a ATUALIZACAO falha castiga quem esta olhando por um
// problema que nao e dela. O dado velho fica, com a hora.
ok("uma atualizacao que falha nao apaga o que ja estava na tela",
   !/setDados\(null\)/.test(semComentarios(libBuscar)));

const homeVisivel = semComentarios(home);
ok("a tela inicial nao engole mais a falha do mes",
   /useBusca/.test(homeVisivel) && /<Falhou/.test(homeVisivel) &&
   !/catch\(\(\) => \{\}\)/.test(homeVisivel) &&
   !/catch\(\(\) => null\)/.test(homeVisivel));

// O pior caso possivel desta tela: anunciar "nenhuma pendencia" sem ter
// conseguido perguntar.
ok("e so diz 'nenhuma pendencia' depois de ter conseguido perguntar",
   /mes\.fase !== "erro" && !linhas\.length/.test(homeVisivel));

ok("a tela inicial diz de que hora sao os numeros",
   /<Desde hora=\{horaCurta\(mes\.atualizadoEm\)\}/.test(homeVisivel));

// O alarme existe porque o WhatsApp ficou 19 dias calado sem ninguem ver. Ele
// sumir quando nao consegue medir repete a falha que o criou.
const sinaisVisivel = semComentarios(sinais);
ok("o alarme do sistema nao falha calado",
   /useBusca/.test(sinaisVisivel) && /fase === "erro"/.test(sinaisVisivel) &&
   !/catch\(\(\) => \{\}\)/.test(sinaisVisivel));

ok("existe uma peca unica de falha, com botao de tentar de novo",
   /export function Falhou/.test(pecas) && /Tentar novamente/.test(pecas));

// Erro e vazio tem de ser DIFERENTES na tela, senao a peca nao serve.
ok("e ela diz que nao saber nao e estar em dia",
   /nao quer dizer que esta tudo em dia|não quer dizer que está tudo em dia/.test(pecas));

// ---- CA-01: as filas que ficavam atras do menu ----

ok("a tela inicial mostra o que espera decisao fora do mes",
   /<PrecisaDeVoce \/>/.test(homeVisivel));

const precVisivel = semComentarios(blocoPrec);
ok("o bloco cobre as quatro filas com gente do outro lado",
   /liberacao/.test(precVisivel) && /conversas/.test(precVisivel) &&
   /comprovantes/.test(precVisivel) && /contatos/.test(precVisivel));

// Duas contas sobre os mesmos fatos comecam iguais e terminam discordando —
// ja mordeu a agenda (0092), o painel (0105) e a lista de familias (0106).
ok("o numero de conversas vem da MESMA funcao da aba 'Precisam de voce'",
   /sureya_contadores_conversas/.test(rotaPrec) && /contadores\?\.pendentes/.test(rotaPrec));

ok("e a fila de liberacao usa o mesmo filtro de adiada da tela dela",
   /adiada_para\.is\.null,adiada_para\.lte\./.test(rotaPrec));

// Vazio nao e zero tambem do lado do servidor: consulta que falhou nao pode
// virar "nada para conferir".
ok("fila que nao respondeu vem nula, nao zerada",
   /r\?\.error \? null/.test(rotaPrec));

ok("e a tela avisa quais filas ela nao conseguiu ler",
   /naoSoube/.test(precVisivel) && /f\.n === null/.test(precVisivel));

// Bloco com quatro zeros todo dia vira moldura, e moldura ninguem le. Mas
// falhar em silencio e o defeito inteiro da CA-13.
//
// A CONDICAO CRESCEU NA 0137, e a guarda foi atualizada porque a TELA mudou de
// proposito — nao porque era mais facil mexer aqui. O bloco passou a mostrar
// tambem as lavagens feitas pela metade e a falta de regra de pagamento, e um
// bloco que some com trabalho para mostrar e pior que um que fica.
//
// Por isso a guarda deixou de cobrar a frase literal e passou a cobrar o que
// ela protege: TODO motivo de aparecer entra na condicao, e `fase !== "erro"`
// continua nela — e esse ultimo e o ponto inteiro da CA-13.
const somem = /if \(!comTrabalho\.length[\s\S]{0,220}?fase !== "erro"\) return null;/.exec(precVisivel);
ok("o bloco some quando esta tudo em dia, mas nao quando falhou",
   !!somem
   && /!naoSoube\.length/.test(somem[0])
   && /!semJazigo/.test(somem[0])
   && /!incompletas/.test(somem[0])
   && /!semRegraEquipe/.test(somem[0]));

// As quatro afirmacoes que so podem ser feitas depois de ter conseguido
// perguntar. Cada uma delas era dita, antes, tambem quando a rota caia.
const agenda2Visivel = semComentarios(telaAgenda2);
ok("'nada agendado no periodo' so aparece se nao houve erro",
   /!carregando && !erro && chaves\.length === 0/.test(agenda2Visivel) &&
   /<Falhou mensagem=\{erro\}/.test(agenda2Visivel));

// Esta e a unica porta de saida de mensagem para familia. Nada sai sem o toque
// dela — entao a tela dizer que a fila esta vazia tem peso.
const libVisivel = semComentarios(telaLib);
ok("'nada esperando liberacao' so aparece se a fila foi mesmo lida",
   /itens\.length === 0 && !erro/.test(libVisivel) &&
   /!itens\.length && !erro/.test(libVisivel));

ok("e a fila avisa quando nao conseguiu ser lida",
   /setErro\("Não consegui ler a fila/.test(telaLib));

ok("'nada para conferir' nao esconde comprovante que nao deu para ler",
   /if \(erroLista\) return <Falhou/.test(semComentarios(telaFin)));

ok("a lista de familias nao fica presa em 'Carregando'",
   /!d && !erroLista && <p/.test(semComentarios(lista)));

// ===================== BUILD B: o campo nao perde trabalho =====================

const campoB = semComentarios(telaCampo);
const filaVisivel = semComentarios(libFila);

// CP-11: uma lavagem gera DOIS registros. "4 registros esperando" para duas
// lavagens fazia o trabalho parado parecer o dobro.
ok("a faixa conta lavagem, nao registro",
   /\{fila\.lavagens === 1 \? "lavagem" : "lavagens"\}/.test(campoB) &&
   !/registro esperando/.test(campoB));

ok("e diz QUAIS jazigos estao esperando",
   /p\.rotulo/.test(campoB));

// CP-06: os quatro estados. "guardado" e "precisa de ajuda" ficam gravados;
// "enviando" e transitorio e "confirmado" e ter saido da fila.
ok("a fila separa o que o tempo resolve do que precisa de gente",
   /precisa_de_ajuda/.test(filaVisivel) && /tente_depois/.test(filaVisivel) &&
   /subiu/.test(filaVisivel));

ok("e a regra dessa separacao e pura, para dar para provar",
   /export function classificar\(status: number, corpo: any\)/.test(libFila));

// Sem isto, um item recusado pelo servidor tenta para sempre e aparece como
// "aguardando envio" — com o cartao ja sumido da lista dela.
ok("item recusado para de ser tentado",
   /if \(p\.estado === "precisa_de_ajuda"\) continue;/.test(filaVisivel));

ok("e a tela mostra o que precisa de ajuda, com o motivo",
   /precisamDeAjuda \|\| \[\]\)\.map/.test(campoB) && /motivoFalha/.test(campoB));

ok("o quarto estado, confirmado, tem recibo na tela",
   /subiramAgora/.test(campoB) && /enviada|enviadas/.test(campoB));

// O comentario dizia que parava no servico travado e o laco seguia direto: um
// `iniciar` preso mandava o `concluir` assim mesmo, sem foto do antes.
ok("conclusao nao sobe na frente do inicio que ficou preso",
   /travados\.add\(p\.servicoId\)/.test(filaVisivel) &&
   /if \(travados\.has\(p\.servicoId\)\) continue;/.test(filaVisivel));

// CP-08: cada tentativa criava um uuid novo.
ok("a chave da fila e determinista, entao dois toques nao viram dois",
   /export function chaveDe/.test(libFila) &&
   /\$\{servicoId \|\| "avulso"\}:\$\{tipo\}/.test(libFila));

ok("e o botao trava no PRIMEIRO toque",
   /if \(abrindo \|\| preparando \|\| ocupado\) return;/.test(campoB) &&
   /setAbrindo\(true\)/.test(campoB));

// Travar cedo sem soltar seria pior: em alguns Android cancelar a camera nao
// dispara `change`, e o botao ficaria morto para sempre.
ok("e a trava se solta quando a janela volta a ter foco",
   /addEventListener\("focus", soltar\)/.test(campoB));

// CP-05: a conclusao offline ficava no IndexedDB, o cache continuava com o
// jazigo pendente, e reabrir sem sinal trazia o mesmo jazigo de volta.
ok("o que ja esta feito no aparelho nao volta como pendente",
   /async function reconciliar/.test(campoB) &&
   /estadoLocalDosServicos/.test(campoB));

ok("e quem escreve na lista escreve no cache, no mesmo gesto",
   /const marcar = useCallback/.test(campoB) &&
   /localStorage\.setItem\(CACHE_DIA/.test(campoB));

// CP-04: sao as acoes mais provaveis onde o sinal e pior.
ok("'nao deu para fazer' entra na fila",
   /naoFeitoOuEnfileirar/.test(telaNaoDeu) && !/fetch\("\/api\/campo\/nao-feito"/.test(telaNaoDeu));

ok("pedido de material entra na fila",
   /materialOuEnfileirar/.test(telaMat) && !/fetch\("\/api\/campo\/pedido-material"/.test(telaMat));

ok("e a tela diz que guardou, em vez de dizer que enviou",
   /Pedido guardado/.test(telaMat) && /sinal voltar/.test(telaNaoDeu));

// ===================== BUILD C: uma porta so para o que nao tem volta ===============
//
// Eram 193 dialogos do navegador: 57 confirm, 9 prompt e 109 alert no painel,
// mais 18 no campo. Todos com a mesma cara, nenhum dizendo o que acontece
// DEPOIS de confirmar. Confirmar vira reflexo, e reflexo apaga a coisa errada.

// A CONTAGEM E A GUARDA. Uma unica volta de `confirm` num arquivo novo desfaz
// o trabalho todo, e nao quebraria nenhum outro teste.
{
  const arquivos = [...varrer("src/app/painel"), ...varrer("src/app/campo")];
  const sobrando = [];
  for (const f of arquivos) {
    const visivel = semComentarios(readFileSync(f, "utf8"));
    // `window.confirm` no proprio Dialogos.tsx e a saida de emergencia de quem
    // usa o gancho fora do provedor — essa fica.
    if (/(^|[^.\w])(confirm|prompt)\s*\(/.test(visivel)) sobrando.push(f);
  }
  ok(`nenhum confirm/prompt do navegador no painel nem no campo (${arquivos.length} arquivos)`,
     sobrando.length === 0, sobrando.join(", "));
}

// O campo e o unico que ficou 100% limpo tambem de `alert`: quem esta de pe,
// no sol, nao pode levar uma caixa cinza que trava a tela.
ok("o campo nao tem mais nenhum dialogo do navegador",
   !/(^|[^.\w])(confirm|prompt|alert)\s*\(/.test(semComentarios(telaCampo)) &&
   !/(^|[^.\w])(confirm|prompt|alert)\s*\(/.test(semComentarios(telaNaoDeu)) &&
   !/(^|[^.\w])(confirm|prompt|alert)\s*\(/.test(semComentarios(telaMat)) &&
   !/(^|[^.\w])(confirm|prompt|alert)\s*\(/.test(semComentarios(assistente)));

// A PARTE QUE O `confirm()` NUNCA TEVE: o que acontece depois.
ok("todo pedido de confirmacao exige dizer o efeito",
   /oQue: string;/.test(dialogos) && /efeito: string;/.test(dialogos));

// Sincrono era o que fazia o `confirm()` facil de usar. A promessa mantem isso.
ok("perguntar devolve promessa, para a chamada mudar uma linha so",
   /perguntar: \(p: Pedido\) => Promise<Resposta>/.test(dialogos));

// Toque acidental tem de cair para o lado seguro.
ok("tocar fora desiste, nunca confirma",
   /if \(e\.target === e\.currentTarget\) fechar\(false\)/.test(dialogos));

// Confirmar sem escrever o motivo obrigatorio nao e decisao informada.
ok("motivo obrigatorio trava o botao",
   /pedido\.pedirMotivo && !pedido\.motivoOpcional && !motivo\.trim\(\)/.test(dialogos));

// Um "nao consegui salvar" que some em tres segundos e o mesmo que nao avisar.
ok("recado de erro nao some sozinho",
   /if \(tom !== "erro"\)/.test(dialogos));

ok("e o desfazer existe para o que nao e dinheiro",
   /r\.desfazer/.test(dialogos) && /Desfazer/.test(dialogos));

// Fora do provedor, sumir seria pior: o botao pareceria quebrado, e devolver
// true executaria o ato sem ninguem confirmar.
ok("fora do provedor cai no dialogo do navegador, nao no silencio",
   /const SEM_PROVEDOR/.test(dialogos) && /window\.confirm/.test(dialogos));

// Uma tela que montasse o proprio provedor perderia o recado ao trocar de
// pagina — que e justamente quando ele importa.
ok("o balcao vive nos dois layouts",
   /<Dialogos>/.test(layPainel) && /<Dialogos campo>/.test(layCampo));

// CP-12: eram confirm, depois prompt, depois alert. Tres telas travadas em
// fila, e nenhuma dizendo o que estava sendo encerrado.
const assistenteVisivel = semComentarios(assistente);
ok("encerrar o dia e uma folha so, com o resumo do que esta sendo fechado",
   /oQue: "Encerrar o dia\?"/.test(assistenteVisivel) &&
   /lavagem feita|lavagens feitas/.test(assistenteVisivel));

// Encerrar com tres lavagens paradas no aparelho e diferente de encerrar com
// tudo entregue, e ela nao tinha como saber a diferenca na hora de decidir.
ok("e o resumo diz o que ainda nao subiu",
   /resumoFila/.test(assistenteVisivel) && /ainda não .*subi/.test(assistenteVisivel));

// CA-08: a mensagem some da fila e a familia nunca recebe, sem ninguem ver.
ok("descartar uma mensagem para familia pede confirmacao",
   /oQue: `Não enviar esta mensagem para \$\{quem\}\?`/.test(telaLib));

ok("e o cartao diz quando o jazigo foi limpo, com hora",
   /limpo em \$\{quando\(item\.executadoEm\)\}/.test(telaLib));

ok("e rotula as fotos de antes e depois",
   /f\.etapa === "antes" \? "antes"/.test(telaLib));

// ===================== BUILD D: a tela comeca no trabalho =====================

// CP-01: antes do primeiro cartao havia cinco areas para rolar, de pe.
ok("no campo, a rota vem antes das ferramentas",
   campoB.indexOf("grupos.entries()") < campoB.indexOf("Mais opções"));

// CORRECAO DO LEANDRO, 27/08: "no aplicativo de campo eu uso cadastrar
// jazigos". A auditoria mandava para "Mais opcoes"; ferramenta que se usa todo
// dia nao e ferramenta ocasional. Fica ANTES da lista.
ok("e cadastrar jazigo NAO foi para Mais opcoes",
   campoB.indexOf("Cadastrar jazigo") < campoB.indexOf("Mais opções"));

ok("instalar o app e o pedido de material desceram",
   campoB.indexOf("Mais opções") < campoB.indexOf("Pedir material") &&
   campoB.indexOf("Mais opções") < campoB.indexOf("<InstalarApp"));

// O que estava faltando ela precisa saber ANTES de andar ate a quadra.
ok("mas o que esta faltando continua no topo",
   /Está faltando: \{\(brief\.materiais/.test(campoB));

// CP-02: a saida de excecao roubava largura da acao principal.
ok("'nao deu para fazer' saiu de perto do botao da foto",
   /style=\{s\.linkNaoDeu\}/.test(campoB) &&
   campoB.indexOf("</div>\n\n      <button style={s.linkNaoDeu}") > -1 ||
   /s\.linkNaoDeu/.test(campoB));

// CP-09: tres miniaturas de 104px em carrossel nao servem para reconhecer
// lapide no sol, e empurravam a acao para baixo.
ok("uma foto grande, o resto em 'ver mais'",
   /s\.fotoGrande\b/.test(campoB) && /ver \{outras\.length === 1/.test(campoB));

// O ganho da CP-09 esta aqui: a foto principal muda com o momento.
ok("e a foto principal muda depois de comecar",
   /emAndamento\s*\n?\s*\? \(tem\.find\(\(f\) => f\.rotulo === "antes \(hoje\)"\)/.test(campoB));

// CA-04: a consulta cotidiana atravessava uma central de filtros.
const listaVisivel = semComentarios(lista);
ok("Familias tem busca e tres atalhos",
   /"Em aberto"/.test(listaVisivel) && /"Cadastro incompleto"/.test(listaVisivel) &&
   /"Próxima lavagem"/.test(listaVisivel));

ok("e os filtros avancados recolhem",
   /<details open=\{temFiltroAvancado\}/.test(listaVisivel));

// Filtro escondido E ativo e a lista curta sem explicacao.
ok("mas abrem sozinhos quando algum esta em uso",
   /const temFiltroAvancado =/.test(listaVisivel) && /em uso/.test(listaVisivel));

// CA-06 COM A CORRECAO DO LEANDRO: as decisoes de agenda NAO viram tela
// separada. O conserto e de ordem — gerar o mes vivia ENTRE o resumo e a lista.
ok("a agenda mostra o trabalho antes da maquina que o fabrica",
   agenda2Visivel.indexOf("{carregando &&") < agenda2Visivel.indexOf(">Gerar limpezas<"));

ok("e a maquina continua na mesma tela, aberta",
   /Gerar limpezas/.test(agenda2Visivel) && !/<details[^>]*>\s*<summary[^>]*>Planejar/.test(agenda2Visivel));

// O aviso de roteiro velho diz que o que esta na tela abaixo ja nao vale.
ok("mas a saude do roteiro continua em cima de tudo",
   agenda2Visivel.indexOf("Refazer o roteiro") < agenda2Visivel.indexOf("{carregando &&"));

// Texto que aponta para onde a coisa NAO esta e pior do que texto nenhum.
ok("e o vazio aponta para onde o botao foi parar",
   /Gere as limpezas no fim desta tela/.test(telaAgenda2));

// ===================== BUILD E: vocabulario e casa arrumada =====================
//
// Sete palavras para tres ideias, sem lugar nenhum dizendo qual e qual: "em
// aberto" 41x, "saldo" 61x, "recebido" 22x, "devendo" 21x, "atrasado" 27x,
// "falta pagar" 5x, "a receber" 2x. Ler "saldo R$ 2.315" e entender "temos isso
// no caixa" quando e "isso esta na rua" e decisao errada com dinheiro na mesa.

ok("as cinco palavras vivem num lugar so",
   /aReceber: "a receber"/.test(vocab) && /recebido: "recebido"/.test(vocab) &&
   /aIdentificar: "a identificar"/.test(vocab) && /conferido: "conferido"/.test(vocab) &&
   /saldoDaFamilia: "saldo da família"/.test(vocab));

// A auditoria propunha "conciliado". Escolhi "conferido" porque o BANCO ja fala
// assim (comprovantes.status = 'a_conferir', conta_corrente.conferido_em) e a
// tela tambem (52 "conferir" contra 4 "conciliar"). Trocar custaria renomear um
// enum em producao para piorar a palavra.
ok("e a palavra escolhida e a que o banco ja fala",
   /conferido/.test(vocab) && !/conciliado:/.test(vocab));

// O sinal do saldo ja foi invertido por engano em tres rotas (0105, 0106, 0122).
ok("o saldo tem uma boca so para ser dito",
   /export function frasedoSaldo/.test(vocab) && /a favor dela/.test(vocab));

// CA-09: a tela abria em "Fechar o mes" - resposta antes da pergunta. Da para
// fechar o mes com dinheiro do banco ainda sem dono.
const finVisivel = semComentarios(telaFin);
ok("o Financeiro abre no funil, antes das abas",
   finVisivel.indexOf("<Funil") < finVisivel.indexOf("ABAS_FIN.map"));

ok("e o funil tem as quatro etapas em ordem",
   /A identificar/.test(funilTela) && /A conferir/.test(funilTela) &&
   /A receber/.test(funilTela) && /Fechar o mês/.test(funilTela));

// De novo a licao de sempre: duas contas sobre o mesmo fato terminam
// discordando (0092, 0105, 0106).
ok("'a receber' vem da MESMA funcao da ficha da familia",
   /calcularSaldosPorFamilia/.test(funilRota));

ok("e 'fechar' vem da MESMA previa da tela de fechamento",
   /previewCompetencia/.test(funilRota));

// Vazio nao e zero, tambem aqui: etapa que nao deu para ler mostra "?" e nao um
// zero tranquilizador.
ok("etapa que nao deu para ler mostra '?', nao zero",
   /e\.numero === null \? "\?" : e\.numero/.test(funilTela));

// O funil e uma sequencia: sumir uma etapa vazia faria a sequencia ter buraco.
// Aqui, ao contrario do "Precisa de voce", "0 a identificar" e boa noticia.
ok("mas a etapa vazia FICA na tela, em cinza",
   !/if \(!e\.numero\) return null/.test(funilTela));

// A etapa "a receber" nao se resolve no Financeiro: resolve-se familia por
// familia. Sem o atalho, o clique traria a lista inteira.
ok("'a receber' leva para a lista de familias ja filtrada",
   /atalho=em_aberto/.test(funilTela) &&
   /a === "em_aberto"\) setF/.test(semComentarios(lista)));

// CA-14 nas telas: as palavras trocadas onde o dinheiro aparece.
ok("a tela inicial fala 'a receber', nao 'falta pagar'",
   /a receber/.test(homeVisivel) && !/falta pagar<\/p>/.test(homeVisivel));

// CP-10: 724 linhas que ninguem importava, num diretorio com tres
// implementacoes do mesmo cartao. Eu mesmo quase consertei a errada no Build B.
{
  const mortos = ["src/app/campo/CardTumulo.tsx", "src/app/campo/Concluir.tsx",
                  "src/app/campo/ConfirmarJazigo.tsx", "src/app/campo/DistanciaAoVivo.tsx"];
  ok("o cartao do campo tem UMA implementacao",
     mortos.every((f) => !existsSync(f)), mortos.filter((f) => existsSync(f)).join(", "));
}

// Os 109 alert eram desfecho usando a ferramenta de pergunta.
{
  const arquivos = varrer("src/app/painel");
  const sobrando = arquivos.filter((f) =>
    /(^|[^.\w])alert\s*\(/.test(semComentarios(readFileSync(f, "utf8"))));
  ok(`nenhum alert do navegador no painel (${arquivos.length} arquivos)`,
     sobrando.length === 0, sobrando.join(", "));
}

// ===================== BUILD F: cadastrar e uma tarefa so =====================
//
// CA-05: uma tela longa com nome, tratamento, telefone, jazigo novo ou
// existente, quadra, rua, falecido, frequencia, valor, primeira lavagem e
// consentimento — mais uma aba de planilha na mesma area. Um erro no fim
// obrigava a reler tudo, e o sucesso PELA METADE nao era dito.

const cadVisivel = semComentarios(cadastro);
ok("cadastrar familia virou quatro passos",
   /const PASSOS = \["Família", "Jazigo", "Contrato", "Conferir"\]/.test(cadastro));

// O passo 4 e o que resolve o erro tardio: ele aparece antes de gravar.
ok("e o ultimo passo confere antes de gravar",
   /Nada foi gravado ainda/.test(cadVisivel));

// Errar o valor no passo 3 nao pode fazer voltar ao nome.
ok("cada passo valida so o que e dele",
   /function podeAvancar\(p: number\)/.test(cadastro));

// Pular para a frente sem passar pela validacao do meio recriaria o buraco.
ok("da para voltar pelos numeros, mas nao pular para a frente",
   /i < passo && setPasso\(i\)/.test(cadVisivel) && /disabled=\{i > passo\}/.test(cadVisivel));

// A rota cria familia, depois jazigo, depois plano — cada um pode falhar
// sozinho, e devolve ok:true com aviso. Um recado que some em 4s nao serve.
ok("sucesso pela metade vira tela, nao recado que some",
   /Entrou pela metade/.test(cadVisivel) && /O jazigo NÃO entrou/.test(cadVisivel));

ok("e ela diz para terminar na ficha, nao cadastrar de novo",
   /cadastrar de novo criaria/.test(cadVisivel));

// CSV e cadastro sao trabalhos de momentos opostos: um com a familia na linha,
// o outro uma migracao feita uma vez.
ok("planilha e cadastro sao duas portas",
   /\+ Nova família/.test(listaVisivel) && /Importar planilha/.test(listaVisivel) &&
   /abrindo === "nova"/.test(listaVisivel) && /abrindo === "csv"/.test(listaVisivel));

// CA-11, primeira fatia: a auditoria manda comecar por formulario e acao
// critica, e cadastrar familia e os dois.
ok("o cadastro novo usa as pecas unicas, nao estilo em objeto",
   /from "\.\.\/pecas"/.test(cadastro) && !/React\.CSSProperties/.test(cadastro));

// O botao aparecia em 9 de 10 cartoes e nao dizia nada sobre o jazigo.
ok("'fazer este agora' parou de parecer distintivo",
   /s\.linkAgora/.test(campoB) && !/style=\{s\.botaoAgora\}/.test(campoB));

// O que E prioridade tem selo proprio, e vem antes dos outros avisos.
ok("e a prioridade de verdade ganhou selo",
   /it\.adiadoVezes >= 2/.test(campoB) && /PRIORIDADE/.test(campoB));

// ===================== BUILD G: os dois sistemas param de divergir ==============
//
// A auditoria (CA-11) descreveu isto como estetica. Ao comparar os dois para
// unificar, o que estava variando nao era so aparencia.

// `ui.tsx` escrevia a regra e a cumpria ("altura de toque confortavel >= 48px").
// `pecas.tsx` — o sistema NOVO, usado na Liberacao e no cadastro — nao tinha
// min-height nenhum: ~44px, e encolheria junto se alguem mudasse a fonte.
ok("as medidas dos controles vivem num lugar so",
   /export const ALVO = 48/.test(medidas) && /export const ALVO_MINI/.test(medidas));

ok("e os dois sistemas bebem da mesma fonte",
   /from "\.\/medidas"/.test(pecas) && /from "\.\/medidas"/.test(uiTsx));

// Numero cravado e como a divergencia volta na proxima peca que alguem escrever.
ok("nenhum dos dois crava a altura na mao",
   !/minHeight: 48/.test(uiTsx) && !/minHeight: 40/.test(uiTsx) &&
   /minHeight: ALVO/.test(pecas));

// A FALHA MAIOR DESTE BUILD, e ela nao e de estilo:
// `EstiloMobile` chegou em 23/08, `ui.tsx` a IMPORTAVA, e NENHUM arquivo
// escrevia <EstiloMobile />. Import sem uso nao quebra build, nao acende lint e
// nao aparece em teste: o painel passou quatro dias sem uma linha daquilo no
// DOM, com todo mundo achando que o celular estava corrigido.
ok("a folha do celular esta REALMENTE montada",
   /<EstiloMobile \/>/.test(layPainel));

// E no LAYOUT, nao no menu: 17 das 32 telas nao montam PainelNav — entre elas a
// inicial e a ficha da familia, que e a maior do sistema.
ok("e no layout, por onde o painel inteiro passa",
   !/EstiloMobile/.test(uiTsx));

// Tudo o que ela faz e dentro do media query: no desktop, nada muda.
ok("e o que ela faz fica todo dentro do celular",
   /@media \(max-width: 640px\)/.test(estiloMovel));

// ================== APAGAR O JAZIGO APAGA AS FOTOS (0135) ==================
//
// Medido em 27/08: 817 arquivos no balde, 282 orfaos (105 MB, 36%), 281 deles
// de tumulos apagados. A rota de exclusao nunca tocou no Storage.

const tumuloVisivel = semComentarios(rotaTumulo);

ok("apagar o jazigo apaga as fotos dele",
   /sureya_arquivos_do_tumulo/.test(tumuloVisivel) && /apagarArquivos/.test(tumuloVisivel));

// A ORDEM E O CONSERTO. Apagar o registro primeiro e deixar o arquivo depois e
// exatamente como se fabricaram os 281: o dono some e a foto fica sem ninguem
// que a alcance.
ok("e o arquivo sai ANTES do registro",
   tumuloVisivel.indexOf("apagarArquivos") <
   tumuloVisivel.indexOf('from("tumulos").delete()'));

// Se o Storage falhar, apagar o tumulo assim mesmo criaria um orfao novo.
ok("se o Storage falhar, o jazigo NAO e apagado",
   /falharam\.length\) \{[\s\S]{0,400}?NÃO apaguei o jazigo/.test(rotaTumulo));

// A mesma regra da remocao por LGPD, que ja fazia certo — e cuja lista deixava
// de fora justamente o tumulo apagado.
ok("a mesma ordem que a remocao por LGPD ja usava",
   /apagarArquivos/.test(rotaLgpd) && /sureya_arquivos_do_cliente/.test(rotaLgpd));

// O inventario nao apaga: ver antes de apagar e o ponto.
ok("a faxina mostra antes de apagar",
   /export async function GET/.test(rotaOrfaos) &&
   !/storage\.from\(balde\)\.remove/.test(rotaOrfaos.split("export async function POST")[0]));

// POST tambem sai de um curl, de um teste, de um script de outra pessoa.
ok("e so apaga com a palavra escrita no corpo",
   /confirmar !== "APAGAR"/.test(rotaOrfaos));

// "Dono sumido" e sobra de exclusao, e sobre ela nao ha duvida. "Nao
// referenciado" pode ser upload em andamento no minuto da leitura.
ok("por padrao so mexe no que tem dono sumido",
   /const soDonoSumido = b\?\.incluirOutros !== true/.test(rotaOrfaos));

// Apagar 105 MB de foto sem rastro de quem e quando seria trocar um problema
// por outro. E `auditar` engole excecao: alvo_id e UUID, entao um id de texto
// faria o registro sumir em silencio.
ok("e deixa rastro na auditoria, sem id de texto num campo uuid",
   /"faxina_arquivos_orfaos"/.test(rotaOrfaos) &&
   !/id: "orfaos"/.test(rotaOrfaos));

// ============ A IMAGEM DA FAMILIA NAO PODE SER JOGADA FORA ============
//
// Medido em 27/08: 39 mensagens no sistema, ZERO com midia. A imagem era
// baixada, passava pelo leitor de comprovante, e so sobrevivia se ele a
// reconhecesse como Pix. Quando NAO reconhecia, escrevia "[cliente enviou uma
// imagem que nao parece um comprovante]" e descartava — ou seja, a imagem
// morria exatamente no caso em que um humano precisa olhar. A Katia mandou
// duas no mesmo dia (10:24 e 13:06), as duas perdidas.

const atendVisivel = semComentarios(atendimento);

ok("a imagem da conversa e guardada, comprovante ou nao",
   /guardarMidiaDaConversa/.test(atendVisivel) && /BUCKET_CONVERSAS/.test(atendVisivel));

// A ORDEM E O CONSERTO: se o leitor estourar, a imagem ja esta salva. Guardar
// DEPOIS da leitura faria a falha do leitor levar a imagem junto — a forma
// antiga do mesmo defeito.
ok("e guardada ANTES de o leitor tentar entender",
   atendVisivel.indexOf("guardarMidiaDaConversa(cliente.id, midia)") <
   atendVisivel.indexOf("extrairComprovante(midia)"));

// `gravarMensagem` ja aceitava midiaUrl desde sempre. Ninguem passava.
ok("e a url chega mesmo na mensagem",
   /transcrita: !!transcrito, midiaUrl/.test(atendVisivel));

// Perder a mensagem inteira porque a foto nao subiu seria trocar um problema
// pequeno por um grande.
ok("falha ao guardar nao derruba a mensagem",
   /async function guardarMidiaDaConversa[\s\S]{0,900}?return null;[\s\S]{0,300}?catch/.test(atendimento));

// Sem isto a Sureya le "nao parece um comprovante" e nao sabe o que era.
ok("a frase avisa que a imagem esta na conversa",
   /está aqui na conversa/.test(atendimento));

// A coluna existia e a rota nao a trazia: a tela nao teria o que mostrar.
ok("a rota da conversa devolve a midia",
   /midia_url/.test(rotaThread));

ok("e a tela mostra a imagem",
   /m\.midia_url && \(/.test(telaThread) && /<img src=\{m\.midia_url\}/.test(telaThread));

// A remocao por LGPD ja listava mensagens.midia_url — mas o balde novo
// precisa ser reconhecido, senao `apagarArquivos` nao acha o caminho e a foto
// fica servindo depois de "removida" (o mesmo buraco da 0135).
ok("o balde novo entra na conta da remocao",
   /BUCKET_CONVERSAS/.test(readFileSync("src/lib/storage.ts", "utf8")) &&
   /BUCKET_SERVICOS, BUCKET_COMPROVANTES, BUCKET_CONVERSAS/.test(readFileSync("src/lib/storage.ts", "utf8")));

// ============ A REGUA DE PRIORIDADE E CONFIGURAVEL (0136) ============
//
// Antes: um numero so (servicos.prioridade, +15 por adiamento). Nada mais
// levantava prioridade, e ele era MUDO — "este veio na frente" sem dizer por
// que. Medido em 27/08, antes de escolher os pesos: nunca lavado alcancava 80
// jazigos, e os outros CINCO criterios alcancavam zero.

const prioVisivel = semComentarios(telaPrio);
const agendaVisivel = semComentarios(libAgenda2);

// SOMAR e nao substituir: a coluna guarda historia (quantas vezes ja foi
// adiado), a regua responde ao mundo de hoje. Trocar uma pela outra perderia
// metade da verdade.
ok("o alocador soma a regua a prioridade que ja existia",
   /pontosDaRegua/.test(agendaVisivel) &&
   /\(a\.prioridade \|\| 0\) \+ \(pontosDaRegua\.get\(a\.id\) \|\| 0\)/.test(agendaVisivel));

// Sem a regua a agenda ainda e melhor que agenda nenhuma.
ok("e se a regua nao carregar, a geracao nao para",
   /nao consegui ler a regua de prioridade/.test(libAgenda2));

// O alocador roda no cron, e current_org_id() e nulo fora de sessao (0103).
ok("a funcao recebe p_org, porque o cron nao tem sessao",
   /sureya_prioridade_calculada", \{ p_org: org \}/.test(libAgenda2));

// A prioridade era um numero mudo.
ok("a prioridade passou a dizer por que",
   /motivos/.test(libAgenda2) || /motivos text\[\]/.test(readFileSync("migrations/0136_a_regua_de_prioridade_e_ajustavel.sql", "utf8")));

// O ALCANCE AO LADO DO PESO e o ponto da tela: cinco dos seis criterios
// alcancavam zero no dia em que ela nasceu. Sem o numero, quem mexesse num
// peso nao veria efeito e concluiria que a tela esta quebrada.
ok("a tela mostra quantos cada criterio alcanca hoje",
   /alcança hoje/.test(prioVisivel) && /c\.alcanca/.test(prioVisivel));

// Vazio nao e zero: contagem que falhou nao pode passar por "nenhum caso".
ok("e contagem que falhou vira '?', nao zero",
   /c\.alcanca === null \? "\?"/.test(prioVisivel) && /alcance\.error \? null/.test(rotaPrio));

// Campo em branco virando 0 desligaria o criterio em silencio.
ok("peso em branco nao vira zero",
   /String\(b\.peso\)\.trim\(\) !== ""/.test(rotaPrio));

ok("e peso fora da faixa e recusado com explicacao",
   /peso_fora_da_faixa/.test(rotaPrio) && /-200 a 200/.test(rotaPrio));

// Peso negativo REBAIXA de proposito — manda para o fim sem desligar.
ok("peso negativo e um caminho, nao um erro",
   /negativo/.test(prioVisivel) && /-200/.test(rotaPrio));

// A ordem da rota da Nina mudou por decisao de alguem.
ok("mexer na regua fica na auditoria",
   /"mudou_regua_prioridade"/.test(rotaPrio));

// ACHADO PELO TESTE: uma org nova nascia com a tabela VAZIA, e a regua nao
// fazia nada em silencio — nao da erro, nao aparece em log, e a agenda
// continua saindo ordenada so por quadra e rua.
ok("uma org nova nasce com a regua, e nao vazia",
   /tg_semear_regua_prioridade/.test(readFileSync("migrations/0136_a_regua_de_prioridade_e_ajustavel.sql", "utf8")));

// ===========================================================================
// TODA LAVAGEM FEITA DEIXA MARCA (0137)
//
// Havia QUATRO portas que marcam uma limpeza como feita. Tres chamavam
// `sureya_concluir_lavagem`; a quarta — `POST /api/servico` com
// `dataExecutada` — escrevia a mao, e a limpeza nascia sem preco, sem baixa de
// material, sem o pagamento da equipe e sem a fila da foto. Duas assim em
// producao, com `valor` NULO: trabalho feito sem preco nenhum no historico.
//
// E o defeito de forma que este projeto mais repete (0092, 0105, 0106, 0115):
// duas implementacoes da mesma regra que comecam iguais e terminam
// discordando. A guarda existe porque a porta fechada nao faz barulho ao
// reabrir — ninguem ve, e a lavagem so aparece quebrada semanas depois.
// ===========================================================================
// `rotaServico` ja foi lida acima.
const rotaLav = readFileSync("src/app/api/manutencao/lavagens-incompletas/route.ts", "utf8");
const telaManut = readFileSync("src/app/painel/config/Manutencao.tsx", "utf8");
const mig37 = readFileSync("migrations/0137_toda_lavagem_feita_deixa_marca.sql", "utf8");

ok("limpeza que nasce executada passa pela transacao de conclusao",
   /jaFeita && \(srv as any\)\?\.id/.test(rotaServico)
   && /rpc\("sureya_concluir_lavagem"/.test(rotaServico));

// A quinta implementacao entraria aqui: uma conta propria de valor ou de
// remuneracao na rota de manutencao seria de novo dois numeros sobre o mesmo
// fato. O conserto chama a MESMA transacao.
ok("o conserto chama a transacao, nao recalcula por fora",
   /rpc\("sureya_concluir_lavagem"/.test(rotaLav)
   && !/valor_executora:/.test(semComentarios(rotaLav)));

// Consertar numero nao pode mexer no que vai ser dito a familia: uma foto de
// tres semanas atras entrando na fila hoje e decisao da Sureya.
ok("consertar nao poe foto antiga na fila",
   /p_foto_depois: null/.test(rotaLav));

// Vazio nao e zero, agora do lado do alarme: lavagem registrada a mao nao tem
// foto, e cobrar dela uma linha na fila seria inventar uma falta.
ok("so cobra a fila quando a foto existe",
   /coalesce\(s\.foto_depois_url, ''\) <> ''/.test(mig37));

// Alarme que sempre grita ensina a ignorar alarme: sem regra de pagamento
// cadastrada, nenhuma lavagem e acusada — vira um recado so.
ok("sem regra de pagamento, o recado e um, nao um por lavagem",
   /sem_regra_equipe/.test(mig37) && /sem_regra_equipe/.test(telaManut));

// SECURITY DEFINER ignora RLS e o Supabase concede EXECUTE a anon por padrao
// em `public`. Estas duas devolvem nome de familia e codigo de jazigo.
ok("as funcoes do 0137 nao ficam abertas para anon",
   /revoke execute on function sureya_lavagens_incompletas\(uuid\)\s+from public, anon/.test(mig37)
   && /revoke execute on function sureya_lavagens_incompletas_resumo\(uuid\)\s+from public, anon/.test(mig37));

// Dizer "2 completadas" calando que 2 continuam na lista seria anunciar um
// resultado que nao aconteceu.
ok("o conserto conta o que sobrou, e diz",
   /aindaIncompletas/.test(rotaLav) && /aindaIncompletas/.test(telaManut));

// ===========================================================================
// O TERMO TEM VERSAO (0138)
//
// Medido em 27/08: 62 contatos marcados como tendo autorizado o contato, 59
// deles vindos de uma importacao de planilha em 18/07 — e ZERO caracteres em
// `orgs.aviso_privacidade`. Nunca houve texto. O sistema afirmava que 62
// pessoas concordaram, e nao havia com o que.
//
// Estas guardas existem porque NADA disto aparece em tela: um consentimento
// gravado sem versao nao da erro, nao entra em log e nao muda numero nenhum. O
// dia em que se descobre e o dia em que alguem pergunta — e ai nao ha mais o
// que medir.
// ===========================================================================
const mig38 = readFileSync("migrations/0138_o_termo_tem_versao.sql", "utf8");
const rotaTermo = readFileSync("src/app/api/config/termo/route.ts", "utf8");
const telaTermo = readFileSync("src/app/painel/config/Termo.tsx", "utf8");
const rotaCli38  = readFileSync("src/app/api/clientes/route.ts", "utf8");
const rotaCont38 = readFileSync("src/app/api/familias/[id]/contatos/route.ts", "utf8");
const cadFam38   = readFileSync("src/app/painel/clientes/CadastrarFamilia.tsx", "utf8");

// Havia TRES portas gravando consentimento, e duas escreviam a coluna direto —
// sem dizer a que texto. Agora as tres passam pela mesma funcao.
ok("cadastrar familia registra o consentimento pela funcao",
   /rpc\("sureya_registrar_consentimento"/.test(rotaCli38)
   && !/consentimento_em: body\?\.consentimento/.test(semComentarios(rotaCli38)));

ok("a ficha da familia tambem, e retirar tem funcao propria",
   /rpc\("sureya_registrar_consentimento"/.test(rotaCont38)
   && /rpc\("sureya_retirar_consentimento"/.test(rotaCont38)
   && !/campos\.consentimento_em/.test(semComentarios(rotaCont38)));

// Sem esta trava "versao" e enfeite: bastaria reescrever a 1 para todo mundo
// passar a ter aceitado outra coisa, sem nunca a ter visto.
ok("versao publicada nao se edita, e a trava mora no banco",
   /tg_termo_publicado_nao_muda/.test(mig38)
   && /termo_publicado_nao_muda/.test(rotaTermo));

// Carimbar as 62 de julho com a versao 1 seria fabricar um fato juridico.
ok("consentimento antigo fica como versao desconhecida, nao como versao 1",
   /termo_id is null and versao is null/.test(mig38)
   && /vers\u00e3o desconhecida/.test(semComentarios(telaTermo)));

// ACHADO PELO TESTE: era um insert solto na migration, valia so para as 62.
ok("semear o consentimento antigo e funcao, nao instrucao de uma vez",
   /create or replace function sureya_semear_consentimentos_antigos/.test(mig38));

// ACHADO PELO TESTE: `now()` nao anda dentro da transacao, e "qual foi o
// ultimo evento" virava sorteio numa tabela que so serve para isso.
ok("o evento carimba o relogio de parede, nao o inicio da transacao",
   /em            timestamptz not null default clock_timestamp\(\)/.test(mig38));

// A recusa nao pode chegar de surpresa com a familia do outro lado do telefone.
ok("sem aviso publicado, o cadastro nem oferece a caixinha",
   /temAviso === false/.test(cadFam38));

// Achar que registrou uma autorizacao que nao entrou e o erro que nao se
// descobre olhando a tela.
ok("e autorizacao que nao entrou volta escrita, nao calada",
   /consentimentoRecado/.test(rotaCli38) && /parcial\.consentimento/.test(cadFam38));

// Vazio nao e zero, numa tela sobre consentimento: contagem que falhou nao
// pode virar "ninguem autorizou".
ok("contagem que falhou nao vira 'ninguem autorizou'",
   /porVersao: porVersao\.error \? null/.test(rotaTermo)
   && /porVersao === null/.test(telaTermo));

// SECURITY DEFINER ignora RLS e o Supabase concede EXECUTE a anon por padrao.
// Estas escrevem consentimento de pessoa fisica.
ok("as funcoes do 0138 nao ficam abertas para anon",
   /revoke execute on function sureya_registrar_consentimento\(uuid, text\)\s+from public, anon/.test(mig38)
   && /revoke execute on function sureya_retirar_consentimento\(uuid, text\)\s+from public, anon/.test(mig38)
   && /revoke execute on function sureya_consentimentos_por_versao\(uuid\)\s+from public, anon/.test(mig38));

// ===========================================================================
// OS BALDES QUE NAO ABREM SOZINHOS (0139)
//
// Medido em 27/08: os tres baldes estavam publicos. Balde publico abre para
// qualquer um que tenha o endereco, sem senha, para sempre.
//
// Estas guardas existem porque o defeito e MUDO nos dois sentidos: um balde
// reaberto continua mostrando as imagens (so que para mais gente), e um link
// que nao assinou some da tela sem dizer nada — a Sureya confirmaria dinheiro
// sem ter visto o comprovante.
// ===========================================================================
const stor = readFileSync("src/lib/storage.ts", "utf8");
const mig39 = readFileSync("migrations/0139_os_baldes_que_nao_abrem_sozinhos.sql", "utf8");
const rComp = readFileSync("src/app/api/comprovantes/route.ts", "utf8");
const rConta = readFileSync("src/app/api/conta-corrente/route.ts", "utf8");
const rConv = readFileSync("src/app/api/conversas/[id]/route.ts", "utf8");
const tFin = readFileSync("src/app/painel/financeiro/page.tsx", "utf8");
const tConv = readFileSync("src/app/painel/conversas/[id]/page.tsx", "utf8");

ok("os dois baldes sensiveis estao na lista dos fechados",
   /BALDES_PRIVADOS[\s\S]{0,120}BUCKET_COMPROVANTES[\s\S]{0,60}BUCKET_CONVERSAS/.test(stor));

// A funcao cria o balde sozinha quando ele falta (conserto da 0009). Se
// continuasse criando tudo aberto, um balde recriado por engano voltaria
// publico sem erro nenhum — so a porta destrancada de novo.
ok("balde que se cria sozinho nasce fechado quando e dos fechados",
   /public: !BALDES_PRIVADOS\.has\(bucket\)/.test(stor));

// Uma porta so: quem transforma endereco guardado em link que abre.
ok("assinar e a porta unica, e devolve null em vez do endereco cru",
   /export async function assinar/.test(stor)
   && /if \(!BALDES_PRIVADOS\.has\(balde\)\) return url;/.test(stor)
   && /return null;/.test(stor));

// As quatro rotas que emitem esses enderecos.
ok("as quatro rotas assinam antes de devolver",
   [rComp, rConta, rConv].every((r) => /assinar\(/.test(r))
   && /assinar\(supabaseAdmin\(\), data\.imagem_url\)/.test(
        readFileSync("src/app/api/comprovantes/anexar/route.ts", "utf8")));

// `map` nao espera promessa: um await dentro dele devolveria Promise para a
// tela, e o extrato mostraria [object Promise] no lugar do link.
ok("o extrato assina em lote, fora do map",
   /linksComp/.test(rConta) && !/comprovanteUrl: await/.test(rConta));

// NAO CONSEGUI ABRIR != NAO TEM. Sem isto a tela cala e a falha vira ausencia.
ok("comprovante que nao abriu avisa, em vez de sumir",
   /imagemFalhou/.test(rComp) && /imagemFalhou/.test(tFin)
   && /sem ver o comprovante/.test(tFin));

ok("e imagem da conversa que nao abriu tambem",
   /midia_falhou/.test(rConv) && /midia_falhou/.test(tConv));

// A decisao de deixar `servicos` aberto e uma decisao, e esta escrita.
ok("a migration diz por que servicos continua aberto",
   /NAO\*\* FAZ: fechar `servicos`|NAO. FAZ: fechar .servicos./.test(mig39)
   && /Evolution BAIXA a URL/.test(mig39));

// ===========================================================================
// A REMOCAO A PEDIDO ALCANCA O QUE FICOU, E SE PROVA (0140)
//
// O caminho existia desde a 0010 e NUNCA tinha rodado — nem dava, porque nao
// havia botao nenhum no painel. Exercitado em producao num bloco desfeito, ele
// deixava SEIS coisas para tras, entre elas um `update leads` que casava ZERO
// linhas por erro de ordem.
//
// Esse tipo de defeito e invisivel: a linha esta la, parece certa, e nenhuma
// tela muda. Por isso o conserto nao foi so alcancar o que faltava — foi fazer
// a remocao DEVOLVER o que sobrou. Estas guardas protegem as duas coisas.
// ===========================================================================
const mig40 = readFileSync("migrations/0140_a_remocao_alcanca_o_que_ficou.sql", "utf8");
const rLgpd = readFileSync("src/app/api/clientes/[id]/lgpd/route.ts", "utf8");
const telaFicha40 = readFileSync("src/app/painel/clientes/[id]/page.tsx", "utf8");

// O BUG DE ORDEM. Os numeros tem de ser lidos ANTES de a coluna ser
// embaralhada; procurar o lead por `(select telefone from clientes ...)` depois
// do update casa zero linhas.
ok("os telefones sao capturados antes de qualquer escrita",
   /select coalesce\(array_agg\(t\.telefone\), '\{\}'\) into v_tels/.test(mig40)
   && /telefone = any\(v_tels\)/.test(mig40)
   && !/where telefone in \(select telefone from clientes/.test(semComentariosSql(mig40)));

// As quatro tabelas que o ensaio pegou sobrando.
ok("o rascunho da IA, o log do webhook e o lead entram na limpeza",
   /update interacoes_ia/.test(mig40)
   && /update eventos_webhook set telefone = null/.test(mig40)
   && /update leads/.test(mig40));

// `leads.telefone` e NOT NULL: nulo daria erro, entao leva o mesmo
// embaralhamento de `clientes.telefone`. Achado no SEGUNDO ensaio.
ok("o lead tambem perde o proprio numero",
   /update leads[\s\S]{0,320}telefone = 'anon:' \|\| left\(md5/.test(mig40));

// A familia batizada com o nome dela deixa de carrega-lo — mas continua
// achavel pelo jazigo, senao a Sureya perde de quem e o que ela lava.
ok("a familia perde o nome dela e ganha o codigo do jazigo",
   /Família do jazigo/.test(mig40));

// A remocao NAO apaga o contrato: a familia pode ter outras pessoas.
ok("a remocao nao apaga a familia nem o jazigo",
   !/delete from familias/.test(semComentariosSql(mig40))
   && !/delete from tumulos/.test(semComentariosSql(mig40)));

// A PARTE QUE IMPORTA MAIS QUE O CONSERTO: ela se prova.
ok("a remocao devolve o laudo do que sobrou",
   /return query select \* from sureya_sobrou_da_remocao/.test(mig40)
   && /sobrouPorTelefone/.test(rLgpd));

// Telefone e inequivoco; nome pode ser mencao de terceiro. Misturar faria o
// aviso gritar sempre, e aviso que sempre grita ensina a ignorar aviso.
ok("o laudo separa telefone de mencao ao nome",
   /pelo_telefone/.test(mig40) && /mencoesAoNome/.test(rLgpd)
   && /mencoesAoNome/.test(telaFicha40));

// "Apertei o botao e ficou verde" nao e prova de nada, meses depois.
ok("o que sobrou fica na auditoria, nao so na tela",
   /completa: porTelefone\.length === 0/.test(rLgpd)
   && /sobrou_por_telefone/.test(rLgpd));

// A REMOCAO NAO TINHA BOTAO — era por isso que nunca tinha rodado.
ok("existe onde apertar, e e diferente de excluir a ficha",
   /removerDados/.test(telaFicha40)
   && /Remover os dados a pedido da família/.test(telaFicha40)
   && /Excluir ficha/.test(telaFicha40));

// A deriva achada de raspao: producao tinha a coluna, a trilha nao a criava, e
// a 0120 ja a lia dentro de uma funcao — que o Postgres nao valida na criacao.
ok("a coluna que so existia em producao entrou na trilha",
   /alter table interacoes_ia add column if not exists motivo_retencao text/.test(mig40));

// ===========================================================================
// A CONFERENCIA VIRA UMA FILA DE DECISOES (0141)
//
// Medido em 28/08: 363 familias, 293 com pendencia — e 290 delas travadas pela
// MESMA pergunta binaria, "contrato ou avulso". O cartao mandava "abra a ficha
// e escolha uma das duas": 290 aberturas para 290 escolhas.
//
// E a soma das pendencias era 838, porque as 122 familias sem jazigo eram
// contadas QUATRO vezes — tres itens diziam, literalmente, "nenhum jazigo para
// conferir". Quem cadastra um jazigo via quatro pendencias sumirem, e aprendia
// que o numero nao quer dizer nada.
// ===========================================================================
const mig41 = readFileSync("migrations/0141_a_conferencia_conta_problemas_nao_sintomas.sql", "utf8");
const rotaConf = readFileSync("src/app/api/conferencia/route.ts", "utf8");
const telaConf = readFileSync("src/app/painel/conferencia/page.tsx", "utf8");
const confVisivel = semComentarios(telaConf);

// Nao ter o que olhar nao e ter achado um problema — mesma regra que `ritmo`
// ja usava para o avulso.
ok("o item que depende do jazigo nao conta como pendencia quando nao ha jazigo",
   (semComentariosSql(mig41).match(/depende do jazigo, que ainda nao existe/g) || []).length === 3);

// Mas com jazigo eles VOLTAM a ser cobrados: um conserto que calasse sempre
// seria pior que a contagem inflada.
ok("e o 'nao se aplica' e so quando nao existe jazigo",
   /not exists \(select 1 from jaz\) then 'nao se aplica'/.test(mig41));

// A causa continua sendo apontada.
ok("a pendencia de verdade — o jazigo — continua obrigatoria",
   /'jazigo cadastrado',\s*\n\s*case when \(select count\(\*\) from jaz\) > 0 then 'ok' else 'pendente' end/.test(mig41));

// 290 aberturas para 290 escolhas binarias.
ok("contrato ou avulso se responde na propria linha",
   /decidirRegime/.test(confVisivel)
   && /f\.regime === "nao_definido"/.test(confVisivel));

// Trocar de ideia continua sendo na ficha: mudar o regime de quem ja tem
// contrato muda como a familia e cobrada.
ok("mas so enquanto ninguem decidiu — trocar de ideia e na ficha",
   /regime === "nao_definido" && \(/.test(confVisivel));

// Varrer 290 e trabalho de uma tarde; varrer 363 procurando quais sao as 290
// e trabalho de duas.
ok("da para filtrar pelo que falta, com a contagem de cada tipo",
   /porPendencia/.test(rotaConf) && /porPendencia/.test(confVisivel)
   && /searchParams\.get\("falta"\)/.test(rotaConf));

// O resumo e do TODO: com filtro ligado, contar o filtrado faria "363
// familias" virar "290" sem avisar.
ok("o resumo continua sendo do todo, nao do filtro",
   /total: todas\.length/.test(rotaConf)
   && /mostrando: familias\.length/.test(rotaConf));

// E a tela diz quantas ficaram de fora, senao o resumo briga com a lista.
ok("e a tela diz quantas esta mostrando",
   /dados\.mostrando/.test(confVisivel));

// O cartao mandava abrir 290 fichas.
ok("o cartao do regime deixou de mandar abrir a ficha",
   !/Abra a ficha e escolha uma das duas/.test(confVisivel)
   && /Ver só essas/.test(confVisivel));

// ===========================================================================
// A BANCADA DAS LAPIDES (0142)
//
// Medido em 28/08: 266 jazigos, 62 com alguem cadastrado, ZERO com mais de uma
// pessoa, e 62 de 62 sem nenhuma data. Os 62 nomes vieram do campo de texto
// antigo — Nakandakari, Ogasawara, "Familia grave", "Filha do Sr joao": e o que
// esta escrito na LAPIDE, nao quem esta enterrado. E 266 de 266 jazigos ja tem
// a foto da lapide.
//
// O trabalho e o mesmo 266 vezes. Pela ficha seria: achar na lista, abrir,
// rolar, digitar, voltar — a mesma forma do "abra a ficha e escolha" que
// travava 290 familias na conferencia.
// ===========================================================================
const compQD = readFileSync("src/app/painel/jazigos/QuemDescansa.tsx", "utf8");
const telaBancada = readFileSync("src/app/painel/jazigos/lapides/page.tsx", "utf8");
const fichaJazigo = readFileSync("src/app/painel/jazigos/[id]/page.tsx", "utf8");
const listaJazigos = readFileSync("src/app/painel/jazigos/page.tsx", "utf8");
const rotaFalec = readFileSync("src/app/api/falecidos/route.ts", "utf8");

// UMA IMPLEMENTACAO, DOIS LUGARES. Copiar o formulario para a segunda tela e
// como, tres meses depois, um lugar aceita "so o ano" e o outro nao.
ok("o cadastro de quem descansa e um componente so, montado nos dois lugares",
   /export default function QuemDescansa/.test(compQD)
   && /import QuemDescansa from "\.\.\/QuemDescansa"/.test(fichaJazigo)
   && /import QuemDescansa from "\.\.\/QuemDescansa"/.test(telaBancada)
   && !/function FormularioFalecido/.test(semComentarios(telaBancada)));

// Transcrever com o documento noutra aba e como se troca um nome por outro
// parecido e ninguem descobre nunca.
ok("a foto da lapide fica grudada no formulario, nos dois",
   /fotoLapide/.test(compQD)
   && /fotoLapide=\{j\.fotoReferencia/.test(fichaJazigo)
   && /fotoLapide=\{atual\.fotoLapide\}/.test(telaBancada));

// Nao ter foto e diferente de nao ter pedido a foto.
ok("e jazigo sem foto diz que da para preencher assim mesmo",
   /fotoLapide === null/.test(compQD));

// A fila ordena pelo trabalho, nao pelo banco.
ok("a fila poe primeiro quem nao tem ninguem, e nunca esconde quem nao tem foto",
   /searchParams\.get\("fila"\)/.test(rotaFalec)
   && /grupo\(a\) - grupo\(b\)/.test(rotaFalec)
   && /semFoto/.test(rotaFalec) && /semFoto/.test(telaBancada));

// Sem `key`, o formulario meio preenchido do jazigo anterior apareceria em
// cima da lapide do seguinte — o erro mais caro num trabalho de copiar nomes.
ok("trocar de jazigo recomeca o formulario do zero",
   /<QuemDescansa key=\{atual\.id\}/.test(telaBancada));

// Contador que so anda ao trocar de jazigo nao mostra que o trabalho contou.
ok("digitar alguem faz o contador da bancada andar",
   /aoMudar\?\.\(\)/.test(compQD) && /aoMudar=\{carregar\}/.test(telaBancada));

// Tela nova sem porta na tela de sempre e tela que ninguem abre.
ok("a bancada tem porta na lista de jazigos",
   /\/painel\/jazigos\/lapides/.test(listaJazigos));

// ===========================================================================
// A FAMILIA CHEGA AO APP DE CAMPO
//
// A familia e a entidade do sistema desde a D-10 — dela e o contrato, ela
// aparece na agenda do painel, na conferencia e na cobranca. O app de campo era
// o UNICO lugar que nao a mostrava: a Nina via o jazigo, a quadra e o nome da
// lapide, e nao sabia de quem estava cuidando. Medido: `/api/agenda/dia` nao
// tinha uma unica mencao a familia.
// ===========================================================================
const rotaDia = readFileSync("src/app/api/agenda/dia/route.ts", "utf8");

// A FAMILIA VEM DO TUMULO, nao do servico. `servicos.cliente_id` e quem PEDIU:
// faz sentido num avulso e e nulo na lavagem de contrato, que e a maioria do
// dia dela — lendo dali, o cartao ficaria vazio justamente nas de sempre.
ok("a agenda do dia leva a familia, lida do tumulo",
   /tumulos\([^)]*familias\(nome\)/.test(rotaDia)
   && /familia: s\.tumulos\?\.familias\?\.nome \|\| null/.test(rotaDia));

// O titulo do cartao continua sendo o que esta escrito na LAPIDE: e por ele
// que ela reconhece a pedra. Trocar pelo nome da familia faria a Nina procurar
// no cemiterio por um nome que nao esta gravado em lugar nenhum.
ok("o cartao mantem a lapide no titulo e poe a familia embaixo",
   /<div style=\{s\.nome\}>\{it\.falecido \|\| it\.tumulo\}<\/div>/.test(campoVisivel)
   && /família \$\{it\.familia\}/.test(campoVisivel));

// Linha vazia e ruido: sem familia e sem falecido, ela nao aparece.
ok("e a linha nao aparece quando nao ha o que dizer",
   /\{\(it\.familia \|\| it\.falecido\) && \(/.test(campoVisivel));

// Chegando, a pergunta e "de quem e" — a tela de navegacao tambem responde.
ok("a tela de como chegar tambem diz de quem e o jazigo",
   /indo\.familia \? `família \$\{indo\.familia\}` : null/.test(campoVisivel));

// ===========================================================================
// O MENU MORTO DE `ui.tsx`
//
// `PainelNav` devolve null desde que o menu virou a coluna do AppShell, mas a
// LISTA continuou no arquivo — completa, comentada e plausivel. Ela tinha
// divergido do menu de verdade: trazia "WhatsApp" e "Liberacao" e nao trazia
// Conversas, Jazigos, Conferencia nem Memoria.
//
// Quem fosse tirar o WhatsApp do menu editaria a lista morta, daria por feito e
// nao mudaria nada na tela. Foi exatamente o que aconteceu aqui.
// ===========================================================================
const sidebar = readFileSync("src/app/painel/Sidebar.tsx", "utf8");

ok("nao ha uma segunda lista de menu em ui.tsx",
   !/const GRUPOS: \{ titulo: string/.test(uiTsx) && !/const ITENS = GRUPOS/.test(uiTsx));

ok("e o menu de verdade nao tem entrada propria de WhatsApp",
   !/href: "\/painel\/whatsapp"/.test(semComentarios(sidebar)));

// ===========================================================================
// UM "HOJE" SO, EM TODO O CODIGO
//
// `diaOperacao()` existe desde a 0114 e foi escrita para um bug concreto: com
// `toISOString()` o dia vira as 21h de Brasilia, e das 21h a meia-noite o
// sistema opera com a data de AMANHA. Tres horas por dia, todo dia.
//
// Mesmo assim, 13 arquivos continuavam calculando o dia em UTC — entre eles o
// MOTOR DO DINHEIRO (`financeiro.ts`), o que decide o que esta VENCIDO
// (`conta-corrente`) e o painel do mes, que pinta de vermelho quem atrasou.
//
// Esta guarda e negativa de proposito: nao basta ter a funcao certa, tem de
// nao haver a errada. Foi assim que o defeito sobreviveu a 0114.
// ===========================================================================
import { readdirSync as _lerDir, statSync as _stat } from "node:fs";

function arquivosDe(dir) {
  const saida = [];
  for (const nome of _lerDir(dir)) {
    const caminho = `${dir}/${nome}`;
    if (_stat(caminho).isDirectory()) saida.push(...arquivosDe(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

// A regra do saldo mora num lugar so: a ficha e a conferencia leem a MESMA
// funcao. Recalcular na segunda tela seria a segunda conta sobre os mesmos
// fatos — e quando duas contas discordam sobre dinheiro, alguem liga para uma
// familia cobrando o que ela ja pagou.
const rotaConta = readFileSync("src/app/api/conta-corrente/route.ts", "utf8");
const rotaConf41 = readFileSync("src/app/api/conferencia/route.ts", "utf8");
ok("o saldo e calculado por uma funcao so, chamada pelas duas rotas",
   /calcularSaldo\(/.test(rotaConta) && /calcularSaldo\(/.test(rotaConf41)
   && !/function frasear\(/.test(semComentarios(rotaConta)));

// Numa tela de conferencia, saldo zerado por erro de leitura faz dar o ok
// achando que a familia esta quite.
ok("conta que nao pode ser lida vira null, nao R$ 0,00",
   /const dinheiro: Record<string, any> \| null = eMov \? null/.test(rotaConf41)
   && /dados\.dinheiro === null/.test(readFileSync("src/app/painel/conferencia/page.tsx", "utf8")));

// 363 familias: uma chamada por familia seriam 363 idas ao servidor.
ok("e vem numa consulta so, nao uma por familia",
   /from\("conta_corrente"\)[\s\S]{0,200}limit\(20000\)/.test(rotaConf41));

// ===========================================================================
// A PROMESSA NASCE NO ENVIO, E FECHAR NAO MANDA NADA (0142)
//
// Medido em 29/08: das 25 respostas a mensagens de familia, 11 (44%)
// prometiam voltar, ZERO diziam prazo, ZERO deixavam registro.
//
// Duas regras estruturais que nenhum teste de funcao alcanca:
//
//   1. A promessa nasce quando a mensagem SAI, nao quando a IA rascunha.
//      Rascunho descartado nao prometeu nada a ninguem; anotar no rascunho
//      encheria a lista de dividas que a familia nunca ouviu.
//   2. Fechar um compromisso NAO manda mensagem. "Ha nenhuma mensagem deve ir
//      automatica ate o app se provar na operacao" — o disparo e manual, pela
//      fila. Um botao de "ja respondi" que dispara texto seria uma segunda
//      porta de envio, que e o defeito que a 0094 fechou.
// ===========================================================================
const rotaAprovar42 = readFileSync("src/app/api/atendimento/aprovar/route.ts", "utf8");
ok("a promessa e anotada quando a mensagem sai, na rota de aprovar",
   /anotarCompromisso\(/.test(semComentarios(rotaAprovar42)));

const rotaComp42 = readFileSync("src/app/api/compromissos/route.ts", "utf8");
ok("fechar um compromisso nao manda mensagem nenhuma",
   !/enviarWhatsapp|enviarTextoComRetry|enviarMidia/.test(semComentarios(rotaComp42)));
ok("e fechar exige dizer o que aconteceu com o assunto",
   /"respondido", "nao_cabe"/.test(rotaComp42));
ok("um compromisso ja fechado nao se fecha de novo",
   /\.is\("cumprido_em", null\)/.test(semComentarios(rotaComp42)));

// A regra de "isto vira pendencia?" mora num lugar so, e e o lugar testavel.
const atend42 = readFileSync("src/lib/atendimento.ts", "utf8");
ok("a regra da promessa esta numa funcao pura, nao enterrada no insert",
   /export function promessaAnotavel\(/.test(atend42));

// A caixa fica ANTES das mensagens: quem abre a conversa para responder
// precisa saber o que ja foi prometido antes de escrever, nao depois de enviar.
const telaConversa42 = readFileSync("src/app/painel/conversas/[id]/page.tsx", "utf8");
ok("a conversa mostra o que foi prometido, antes das mensagens",
   telaConversa42.indexOf("<Compromissos") > 0
   && telaConversa42.indexOf("<Compromissos") < telaConversa42.indexOf("d.mensagens.length === 0"));

// ===========================================================================
// A BANCADA CALIBRA CONTRA A FAMILIA DE VERDADE
//
// O simulador antigo montava um contexto ficticio ali dentro — "Maria
// (teste)", "Familia Exemplo", saldo "em dia" — e um prompt de bloco unico.
// Nenhum dos blocos que causaram os 44% de promessas (a tabela de extras, os
// pedidos em aberto, os comprovantes a conferir) existia naquele contexto,
// porque ele nao passava por `montarContexto`. Afinar o tom ali era afinar
// contra algo que nunca rodou.
//
// Estas guardas sao NEGATIVAS de proposito: o defeito nao era falta de tela,
// era a existencia de uma SEGUNDA montagem. Basta alguem recriar uma para o
// defeito voltar inteiro.
// ===========================================================================
ok("o simulador de familia ficticia nao existe mais",
   !existsSync("src/app/api/simulador"));

const rotaCal = readFileSync("src/app/api/calibragem/route.ts", "utf8");
const rotaCalSem = semComentarios(rotaCal);
ok("a bancada monta o contexto pelo caminho da producao",
   /montarContexto\(/.test(rotaCalSem) && /montarSystemDeProducao\(/.test(rotaCalSem));
ok("e nao inventa uma familia dentro dela",
   !/saldoTexto:\s*["'`]/.test(rotaCalSem) && !/identificacao:\s*["'`]/.test(rotaCalSem));

// O modelo e amostrado: a MESMA pergunta da textos diferentes a cada rodada.
// Sem fixar isso, a diferenca entre as duas colunas seria em parte o ajuste e
// em parte o acaso — e ele mudaria o tom por causa de ruido.
ok("os dois lados rodam sem a variacao do modelo",
   /temperature: 0/.test(rotaCalSem));

// Uma bancada que envia deixa de ser bancada. "Nenhuma mensagem deve ir
// automatica ate o app se provar na operacao" — o disparo e manual, pela fila.
ok("a bancada nao envia nem grava resposta",
   !/enviarWhatsapp|enviarTextoComRetry|from\("mensagens"\)\s*\n?\s*\.insert|from\("interacoes_ia"\)/
      .test(rotaCalSem));

// Gasto de testar que se esconde dentro do atendimento faz o custo do
// atendimento subir sem que ninguem saiba por que.
ok("o custo da bancada aparece separado do atendimento",
   /proposito: "calibragem"/.test(rotaCalSem));

const agente42 = readFileSync("src/app/painel/conversas/VisaoAgente.tsx", "utf8");
ok("a tela de ensinar a IA mostra a bancada",
   /<Bancada /.test(agente42));
// 786 caracteres de instrucao num campo de UMA LINHA: nao dava para ler o que
// estava escrito nem achar a frase que se queria mudar.
ok("e o tom cabe numa caixa que se le",
   /value=\{tom\}/.test(agente42)
   && agente42.slice(0, agente42.indexOf("value={tom}")).lastIndexOf("<textarea")
      > agente42.slice(0, agente42.indexOf("value={tom}")).lastIndexOf("<input"));

// ===========================================================================
// O PRECO MOSTRA OS DOIS CUSTOS, E NAO CHAMA NENHUM DELES DE "O CUSTO"
//
// "Quanto custa uma lavagem?" tem duas respostas certas, e trocar uma pela
// outra custa dinheiro nos dois sentidos: o custo CHEIO (o fixo rateado pelas
// lavagens de hoje) responde "este contrato paga o proprio custo?"; o custo de
// MAIS UMA responde "vale pegar mais um jazigo?". Com a agenda em 42% de uso
// eles sao numeros muito diferentes.
//
// A guarda e negativa junto com a positiva: nao basta mostrar os dois, tem de
// nao existir um terceiro calculo escondido na tela.
// ===========================================================================
const libPreco = readFileSync("src/lib/precificacao.ts", "utf8");
const telaPreco = readFileSync("src/app/painel/financeiro/Preco.tsx", "utf8");
const rotaPreco = readFileSync("src/app/api/precificacao/route.ts", "utf8");

ok("a tela mostra o custo cheio E o custo de mais uma",
   /custoCheioPorLavagem/.test(telaPreco) && /custoDeMaisUm/.test(telaPreco));
ok("e a conta mora numa funcao so, nao na tela",
   /export function precificar\(/.test(libPreco)
   && /precificar\(/.test(semComentarios(rotaPreco))
   && !/precificar\(/.test(semComentarios(telaPreco)));

// Periodicidade desconhecida virando zero lavagem faria o contrato parecer
// trabalho de graca — margem infinita — e ele subiria para o topo da lista de
// melhores contratos da casa.
ok("periodicidade desconhecida nao vira zero lavagem",
   /return null;/.test(libPreco) && !/default: return 0/.test(libPreco));

// Uma sobra calculada com material, transporte e sistema em ZERO, lida como
// lucro, e o jeito mais rapido de baixar um preco que ja nao paga a conta.
ok("a tela avisa quando a sobra foi calculada com custo faltando",
   /buracos/.test(rotaPreco) && /o teto, não o que sobra/.test(telaPreco));

// A tela de preco nao pode ter uma capacidade propria: ela e a agenda
// discordando de si mesma, com as duas certas segundo a propria conta.
ok("a capacidade vem da configuracao da casa, nao de um numero na tela",
   /limpezas_por_dia/.test(rotaPreco) && !/435|4\.345/.test(telaPreco));

// Enquanto os dados nao foram revisados com a Sureya, a tela so le.
ok("a tela de preco nao grava nada",
   !/method: "(POST|PUT|PATCH|DELETE)"/.test(telaPreco));

// ===========================================================================
// UM PAGAMENTO COBRE VARIOS MESES (0144)
//
// A Thais mandou R$ 240 e escreveu "referente julho-dezembro". Seis
// competencias num pagamento so, e o seletor era de escolha unica — e quando
// nada era apontado, um gatilho carimbava o mes do Pix. Entao a opcao
// "sem apontar — so entra no saldo", que a tela oferecia, NUNCA EXISTIU: o
// lancamento saia carimbado assim mesmo, no mes errado do calendario.
//
// O saldo da familia continuava certo (ele e soma), mas o RELATORIO POR
// COMPETENCIA — o que a Sureya confere — mostrava agosto inflado e set-dez
// zerados, com a familia parecendo inadimplente enquanto tinha credito.
// Dinheiro no lugar errado do calendario e pior que dinheiro nenhum: ele
// parece certo.
// ===========================================================================
// Reusa as leituras da secao 0134 — reler o mesmo arquivo com outro nome e o
// mesmo defeito de forma que estas guardas existem para caçar.
const rotaConcSem = semComentarios(rotaConc);
const telaFinSem = semComentarios(telaFin);

ok("a rota sabe repartir um pagamento entre varios meses",
   /sureya_conciliar_comprovante_meses/.test(rotaConcSem));
ok("e a tela pede os meses no plural, com de e ate",
   /type="month"/.test(telaFinSem) && /competencias: meses/.test(telaFinSem));

// A previa TEM de ser a mesma conta da execucao. Duas implementacoes da mesma
// regra e o defeito que este projeto mais repete — e aqui ele apareceria como
// "a previa dizia outra coisa", em cima de dinheiro.
ok("a previa e a MESMA funcao, em modo ensaio",
   /p_ensaio: ensaio/.test(rotaConcSem)
   && !/function\s+ratear|const ratear\s*=/.test(telaFinSem));

// Um ensaio que fecha o comprovante deixa de ser ensaio.
ok("o ensaio nao audita nem fecha nada",
   /if \(ensaio\) return NextResponse/.test(rotaConcSem));

// Mexer nos campos e continuar vendo a previa velha faria confirmar olhando
// para um rateio que ja nao e o que vai acontecer.
ok("mexer nos campos apaga a previa velha",
   /setPrevia\(\(x\) => \{ const y = \{ \.\.\.x \}; delete y\[c\.id\]; return y; \}\);/
     .test(telaFinSem));

// Intervalo invertido aceito calado repartiria o pagamento em meses que
// ninguem pediu.
ok("intervalo invertido nao vira meses",
   /saida\.length < 60/.test(telaFin) && /mesesDe\(/.test(telaFinSem));

// ===========================================================================
// O TELEFONE NAO CRIA GENTE NOVA (0145/0146)
//
// `acharCliente` comparava com igualdade exata. O WhatsApp sempre manda o
// numero com o DDI, e 46 clientes estavam cadastrados sem o 55 — nenhum deles
// era reconhecido. Viravam lead, alguem cadastrava de novo, e nasciam os 11
// pares de duplicados. O caso que expos isso: a Katia, responsavel dos
// Tonellotti (2 jazigos), com a copia numa "Familia Katia" vazia segurando um
// Pix de R$ 40.
// ===========================================================================
const ctx45 = readFileSync("src/lib/context.ts", "utf8");
const ctx45Sem = semComentarios(ctx45);

ok("a busca por telefone passa pela forma normalizada",
   /sureya_achar_cliente/.test(ctx45Sem));
// Uma normalizacao em TypeScript aqui seria a setima vez que este projeto paga
// por duas implementacoes da mesma regra — e a lista de duplicados e a fusao
// usariam a outra.
ok("e a regra do numero mora num lugar so, no banco",
   !/replace\(\/\\D\/g/.test(ctx45Sem) && !/startsWith\("55"\)/.test(ctx45Sem));
// Devolver null num erro de rede faria a familia virar lead — o defeito
// consertado, de volta por outro caminho.
ok("falha na busca nao vira 'nao e cliente' em silencio",
   /console\.error\("\[acharCliente\]/.test(ctx45));

const rotaDup = readFileSync("src/app/api/duplicados/route.ts", "utf8");
const telaDup = readFileSync("src/app/painel/config/Duplicados.tsx", "utf8");
ok("a tela de duplicados mostra o que cada lado carrega",
   /jazigos/.test(telaDup) && /comprovantes/.test(telaDup) && /conversas/.test(telaDup));
// Fundir apaga um cadastro, e doze das vinte e nove referencias a `clientes`
// sao ON DELETE CASCADE. Um botao que resolvesse os onze de uma vez apagaria
// historico de familia com base num palpite.
// `semComentarios` porque o proprio comentario da tela explica POR QUE nao
// existe esse botao — e a guarda casaria com a explicacao.
ok("nao existe botao de juntar todos de uma vez",
   !/juntar todos|fundir todos|limpar tudo/i.test(semComentarios(telaDup)));
ok("e a fusao tem ensaio antes",
   /ensaio/.test(rotaDup) && /O que vai mudar/.test(telaDup));

// O jazigo apontado tem de ser da familia do pagador: sem isso o dinheiro fica
// no razao de uma familia apontando para o jazigo de outra.
ok("jazigo de outra familia tem recado proprio",
   /jazigo_de_outra_familia/.test(readFileSync("src/app/api/financeiro/conciliar/route.ts", "utf8")));

// ===========================================================================
// FINALIZAR O ATENDIMENTO MORA NA CONVERSA (0147)
//
// "Resolver" e "Arquivar" existiam so na LISTA. O momento em que se sabe que o
// assunto acabou e o momento em que se acabou de responder — e esse momento
// acontece DENTRO da conversa. Ter de voltar, achar a linha e agir de fora e
// friccao no lugar onde ela custa mais: o que da trabalho fica para depois, e
// "depois" foi como a fila de 164 mensagens nasceu.
// ===========================================================================
const telaConv47 = readFileSync("src/app/painel/conversas/[id]/page.tsx", "utf8");
const telaConv47Sem = semComentarios(telaConv47);
ok("a conversa tem botao de finalizar atendimento",
   /Finalizar atendimento/.test(telaConv47Sem) && /acao: "resolver"/.test(telaConv47Sem));
ok("e de reabrir quando ja esta finalizada",
   /Reabrir atendimento/.test(telaConv47Sem) && /acao: "reabrir"/.test(telaConv47Sem));
// Sem o estado vindo do servidor a tela nao sabe qual dos dois mostrar.
ok("a rota da conversa devolve se ela esta resolvida",
   /resolvida: !!\(conv as any\)\.resolvida/
     .test(readFileSync("src/app/api/conversas/[id]/route.ts", "utf8")));
// Fechar com promessa aberta e o defeito que a 0142 mediu: a familia esperando
// um retorno que ninguem sabia que devia.
ok("finalizar avisa quando ha promessa em aberto",
   /promessas > 0/.test(telaConv47Sem));

// ===========================================================================
// A FAXINA VEM DEPOIS DA FUSAO (0147)
//
// `conta_corrente.familia_id` e CASCADE (o razao some), `mensagens.cliente_id`
// tambem (a conversa some) e `clientes.familia_id` e SET NULL (a pessoa fica
// orfa, e `sureya_lancar` recusa orfao). Medido em 29/08: das 122 familias sem
// jazigo, 3 escreveram de verdade — Eliana, Nena Roberto e Zulmira.
// ===========================================================================
const rotaVaz = readFileSync("src/app/api/familias-vazias/route.ts", "utf8");
const telaVaz = readFileSync("src/app/painel/config/FamiliasVazias.tsx", "utf8");
ok("a faxina separa quem tem historico de quem nao tem",
   /pode_apagar/.test(rotaVaz) && /seguram/.test(telaVaz));
// Um `delete in (...)` pararia tudo na primeira recusa e a tela diria "falhou"
// sobre 119 familias por causa de uma.
ok("e apaga uma a uma, contando as recusas",
   /recusadas/.test(semComentarios(rotaVaz)));
// A pessoa vai junto: deixa-la criaria o orfao que sureya_lancar recusa.
ok("a tela diz que a pessoa sai junto com a familia",
   /órfã/.test(telaVaz));

// ===========================================================================
// UMA CAIXA SO, E O QUE VAI E O QUE ESTA NELA (0148)
//
// O QUE ACONTECEU COM A JOSEFINA, EM 29/08:
//   09:10  a IA rascunha uma resposta sobre luto
//   12:35  a familia volta e pergunta OUTRA coisa: "Qual valor", "quando vc
//          poderia vir"
//   16:59  o rascunho das 9h sai, palavra por palavra
//
// A tela tinha DUAS caixas editaveis e TRES botoes de enviar. Ele reescreveu o
// texto na caixa do rascunho e clicou em "Aprovar e enviar" — o unico dos
// botoes que NAO olhava para a caixa. `texto_final` ficou null: a edicao nao
// chegou nem a ser gravada.
//
// Estas guardas sao NEGATIVAS de proposito: o defeito nao era falta de aviso,
// era a existencia da segunda caixa e do botao que a ignorava.
// ===========================================================================
const telaConv48 = readFileSync("src/app/painel/conversas/[id]/page.tsx", "utf8");
const telaConv48Sem = semComentarios(telaConv48);

// Contar `<textarea>` no arquivo inteiro pegaria os do painel "Me ajuda a
// escrever", que sao outra coisa. O defeito era um SEGUNDO ESTADO editavel
// para a MESMA resposta — `rascText` ao lado de `texto`. E isso que nao pode
// voltar.
ok("nao ha um segundo estado editavel para a mesma resposta",
   !/rascText/.test(telaConv48)
   && (telaConv48Sem.match(/value=\{texto\}/g) || []).length === 1);
ok("nem o botao que enviava o rascunho ignorando a caixa",
   !/Aprovar e enviar/.test(telaConv48Sem) && !/Enviar editado/.test(telaConv48Sem));
ok("a sugestao da IA vai PARA a caixa, em vez de ter a sua",
   /Usar esta resposta/.test(telaConv48Sem) && /setTexto\(d\?\.rascunho\?\.rascunho/.test(telaConv48Sem));

// A rota conserta todos os outros caminhos: tela conserta o de hoje.
const rotaApr48 = readFileSync("src/app/api/atendimento/aprovar/route.ts", "utf8");
const rotaApr48Sem = semComentarios(rotaApr48);
ok("a rota manda o texto que veio, nao o rascunho do banco",
   /const textoParaEnviar = veio \|\| rascunhoOriginal;/.test(rotaApr48Sem));
// "aprovou" com texto diferente e edicao — a acao passa a ser deduzida do
// texto em vez de acreditada, senao o score aprenderia errado.
ok("e deduz se foi aprovacao ou edicao comparando com o rascunho",
   /veio !== rascunhoOriginal \? "editou" : "aprovou"/.test(rotaApr48Sem));

// Responder pela caixa livre deixava a interacao ABERTA, e a conversa ficava
// eternamente "precisa de voce" por um rascunho que ninguem ia mais usar.
ok("enviar com rascunho pendente fecha o rascunho",
   /d\?\.rascunho\?\.id/.test(telaConv48Sem) && /atendimento\/aprovar/.test(telaConv48Sem));

// O rascunho da Josefina tinha OITO HORAS e respondia outro assunto.
ok("a tela avisa quando a sugestao esta velha",
   /rascunhoVelho/.test(telaConv48Sem) && /msgsDepois/.test(telaConv48Sem));

const comHojeEmUtc = arquivosDe("src").filter((f) =>
  /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/.test(readFileSync(f, "utf8")));

ok("nenhum arquivo calcula o dia de hoje em UTC",
   comHojeEmUtc.length === 0);
if (comHojeEmUtc.length) {
  for (const f of comHojeEmUtc) console.log(`      ${f}`);
  console.log("      use diaOperacao() de src/lib/vencimento.ts");
}

process.exit(falhas ? 1 : 0);
