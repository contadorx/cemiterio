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
//
// ESTE AJUDANTE JA EXISTIA E EU TROPECEI NELE TRES VEZES EM DOIS DIAS — no
// `semPlano` (0128), no "Virou cliente" (conversas) e no botao da avulsa
// (0132). Nas tres, a guarda achou no COMENTARIO a citacao do que fora
// trocado, e reprovou um conserto correto. Toda busca NEGATIVA passa por
// aqui. Numa positiva, achar no comentario e inofensivo.
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

ok("e diz quanto essa familia deve",
   /em aberto:/.test(telaFin) && /saldo a favor dela/.test(telaFin));

// A leitura da IA e palpite bom, nao fato: quem tem o extrato do banco e ela.
ok("o valor e a data sao corrigiveis na conferencia",
   /Valor que entrou/.test(telaFin) && /Dia em que caiu/.test(telaFin) &&
   /a leitura dizia/.test(telaFin));

ok("da para dizer de qual jazigo e a que se refere",
   /De qual jazigo/.test(telaFin) && /A que se refere/.test(telaFin));

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

process.exit(falhas ? 1 : 0);
