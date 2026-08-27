# O que das duas auditorias já está de pé, e em que ordem fazer o resto

Conferi as 26 contraprovas das duas auditorias (14 do painel, 12 do campo)
contra o código do `main` de hoje — não contra o zip do último deploy, que
está em 0130 e não tem as migrações 0131 a 0134.

Cada linha abaixo tem onde eu olhei. Onde escrevi um número, contei.

## O placar

| | quantas |
|---|---|
| Aplicado | 14 |
| Aplicado pela metade | 0 |
| Não aplicado | 11 |
| Não dá para provar lendo código | 1 |

Três de vinte e seis é pouco, mas as duas auditorias são de antes de boa parte
do trabalho recente, e o trabalho recente foi quase todo em cima de dinheiro e
de regra — não de tela. O que segue é a lista honesta.

## Painel

| # | Promessa | Situação | Onde eu vi |
|---|---|---|---|
| CA-01 | A home mostra tudo que precisa de atenção | **sim (Build A)** | bloco "Precisa de você" com as quatro filas, cada número pela regra da tela que ele aponta |
| CA-02 | O mês é a fotografia da competência | **sim** | `src/app/api/mes/route.ts:75` corta em `{ ate: ultimoDia }` |
| CA-03 | Se a home não carregar, ela sabe | **sim (Build A)** | `useBusca` + `Falhou` com hora da última atualização |
| CA-04 | Famílias é uma lista simples | **não** | 701 linhas, nenhum agrupamento de filtro avançado |
| CA-05 | Cadastrar família é uma tarefa só | **não** | formulário único, sem etapas nem resumo final |
| CA-06 | A agenda mostra trabalho, não engenharia | **não** | "Gerar limpezas" continua na tela principal (`agenda/page.tsx:675`) |
| CA-07 | Ação destrutiva é consistente e segura | **sim (Build C)** | 66 `confirm`/`prompt` do painel e os 18 do campo viraram uma peça só; 99 `alert` de desfecho ainda por converter |
| CA-08 | Liberação deixa revisar com segurança | **sim (Build C)** | descarte confirmado, "limpo em 14/08 às 09:30" no cartão, fotos rotuladas, desfazer |
| CA-09 | Financeiro tem uma porta só | **não** | continua abas dentro de abas; não é funil |
| CA-10 | Configuração é fácil de achar | **sim** | `config/page.tsx` tem `GRUPOS` com quatro domínios e diagnóstico por último |
| CA-11 | O painel é visualmente consistente | **não** | 3 telas com estilo em objeto inline, 14 com classe — dois vocabulários visuais |
| CA-12 | O mobile administrativo é simples | **não dá para provar** | responsividade se prova em aparelho, com teclado aberto e voltando do navegador |
| CA-13 | O sistema separa vazio de falha | **sim nas cinco telas caras** | O mês, Liberação, Agenda, Financeiro e Famílias têm os quatro estados; telas de segunda ordem vão no Build C |
| CA-14 | Termo igual quer dizer coisa igual | **não** | "em aberto" 39×, "saldo" 57×, "recebido" 22×, "falta pagar" 4×, "a receber" 2×; "a identificar" e "conciliado" 0× |

## Campo

| # | Promessa | Situação | Onde eu vi |
|---|---|---|---|
| CP-01 | A tela leva direto ao trabalho | **não** | antes do primeiro cartão: instalar app, assistente, materiais, cadastrar jazigo |
| CP-02 | Uma escolha por vez | **não** | `campo/page.tsx:641` — "Não deu para fazer" no mesmo bloco da ação principal |
| CP-03 | Dois toques concluem | **não é conserto** | a câmera do celular pede confirmação e isso não está na nossa mão. Vira métrica: medir tempo e erro, não toque |
| CP-04 | Sem internet dá para continuar | **sim (Build B)** | "não deu" e pedido de material entraram na fila. Cadastrar jazigo ainda não — ver Build D |
| CP-05 | O que ficou guardado não reaparece | **sim (Build B)** | a lista é sempre servidor + fila local, e quem escreve na lista escreve no cache |
| CP-06 | "Guardado" quer dizer terminado | **sim (Build B)** | `guardado` / `precisa de ajuda` gravados, `enviando` transitório, `confirmado` com recibo na tela |
| CP-07 | Cancelar a câmera não muda o fluxo | **sim, hoje** | consertado nesta entrega — ver abaixo |
| CP-08 | Toque duplo não duplica | **sim (Build B)** | chave `servicoId:tipo` na fila e trava no primeiro toque, solta no foco |
| CP-09 | As fotos simplificam o cartão | **não** | carrossel de miniaturas em `Fotos` (`campo/page.tsx:473`), empurra a ação para baixo |
| CP-10 | Existe uma implementação do cartão | **não** | **710 linhas mortas**: `CardTumulo.tsx` 167, `Concluir.tsx` 276, `ConfirmarJazigo.tsx` 189, `DistanciaAoVivo.tsx` 78 — nenhuma importada pela tela viva |
| CP-11 | Ela sabe o que já foi enviado | **sim (Build B)** | conta lavagens e diz quais jazigos; recados contados à parte |
| CP-12 | Encerrar o dia é simples e seguro | **sim (Build C)** | uma folha com o resumo: feitas, o que fica para depois, o que ainda não subiu |

## O que já vai nesta entrega: CP-07

Era o único defeito de comportamento da lista inteira — o resto é forma, e
forma não erra sozinha.

A ação pendente ("comecar" ou "terminar") ficava num `ref` e só era apagada no
`finally`. Quem tocasse em "TIRAR FOTO E COMEÇAR", saísse da câmera sem tirar
foto, e mais tarde abrisse a câmera por outro caminho, executava o **começar
velho com a foto nova**. Agora a ação é copiada para uma variável local e o
`ref` é zerado antes de qualquer saída da função, cancelamento inclusive. Duas
guardas novas em `testes/checar-ficha.mjs` reprovam a volta do jeito antigo.

## Os builds, na ordem

A ordem não é a das auditorias. É por dano: primeiro o que faz alguém decidir
errado, depois o que faz perder trabalho, depois o que assusta, e só então o
que incomoda.

### Build A — falha não pode parecer vazio ✅ ENTREGUE
**CA-03, CA-13, CA-01** — ver `LEIA-ME_falha_nao_e_vazio.md`

É o mais perigoso da lista e o mais barato de arrumar. Hoje a home engole o
erro em `.catch(() => {})` e mostra tela vazia. Você olha, vê zero pendência,
e fecha o dia — mas o zero pode ser a rede que caiu. É exatamente o "vazio não
é zero" que já consertamos no dinheiro e que continua solto na tela.

O que entra: quatro estados obrigatórios em toda lista (carregando, erro com
"tentar novamente", vazio confirmado, conteúdo com hora da última atualização);
um ajudante único para buscar dados, para o `catch` mudo não voltar; e o bloco
"Precisa de você" na home juntando as filas que hoje só aparecem se você abrir
cada menu — mensagens, comprovante sem conciliar, cadastro incompleto, WhatsApp
desconectado.

Fica pronto sem tocar em banco.

### Build B — o campo não perde trabalho ✅ ENTREGUE
**CP-06, CP-05, CP-11, CP-08, CP-04** — ver `LEIA-ME_o_campo_nao_perde_trabalho.md`

A Nina é quem mais sofre com o que está aqui, e é a que menos tem como
reclamar no momento em que acontece.

Um item da fila passa a ter estado de verdade — `guardado`, `enviando`,
`confirmado`, `precisa de ajuda` — e erro permanente (o servidor recusou por
regra) para de se disfarçar de "aguardando envio". A lista reconcilia o que
está em cache com o que está na fila local, para o jazigo já feito não
reaparecer como pendente quando ela recarrega sem sinal. A faixa passa a contar
lavagem, não registro. A trava do botão vira no primeiro toque, com liberação
ao voltar o foco da janela, e a fila ganha idempotência por `servicoId + tipo`.
E "Não deu para fazer" e o pedido de material entram na fila — são justamente o
que ela precisa fazer onde o sinal é pior.

### Build C — uma porta só para o que não tem volta ✅ ENTREGUE
**CA-07, CA-08, CP-12** — ver `LEIA-ME_uma_porta_so.md`

**187** diálogos do navegador entre painel e campo. Cada um com aparência
diferente, nenhum dizendo o que vai acontecer depois, nenhum com desfazer.

Entra um componente único de confirmação: o quê, o efeito, motivo quando faz
falta, e desfazer para o que não é dinheiro. Encerrar o dia vira uma folha só,
com o resumo — feitos, esperando envio, não feitos — e um botão que diz o que
faz. Liberação ganha data e hora da lavagem no cartão e confirmação no
descarte.

### Build D — a tela começa no trabalho
**CP-01, CP-02, CP-09, CA-04, CA-06**

**Duas correções suas, de 27/08, que mudam o que a auditoria pedia. Elas valem
mais que a auditoria — quem usa é você.**

> *"tem decisões importantes no admin com relação a agenda de limpeza,
> considere elas"*

CA-06 pedia separar `Agenda` de `Planejar agenda`, empurrando gerar,
reorganizar e refazer para uma ação secundária. **Não vai ser assim.** Gerar o
mês, reorganizar a agenda e refazer o roteiro são decisões que você toma
olhando a mesma tela em que vê o trabalho — esconder atrás de um segundo
clique é pior. O que fica de CA-06 é o problema real: seis horizontes, período
personalizado, geração por dias, geração mensal, avulsos e diagnósticos
disputando o mesmo espaço vertical. O conserto é **ordem e agrupamento na
mesma tela**, não uma tela nova.

> *"e no aplicativo de campo eu uso cadastrar jazigos"*

CP-01 pedia mandar instalar app, materiais e **cadastrar jazigo** para "Mais
opções". **Cadastrar jazigo fica.** É trabalho de verdade que você faz no
cemitério, não ferramenta ocasional. Vão para "Mais opções" só o convite de
instalação e o pedido de material — e mesmo o material só depois de conferir
com a Nina.

O resto do build segue: no campo, resumo e o primeiro cartão logo abaixo;
"Não deu" vira link secundário longe da ação principal; uma foto grande e
útil, o resto em "ver mais". No painel, Famílias fica com busca e três atalhos
("em aberto", "cadastro incompleto", "próxima lavagem") e o resto dos filtros
recolhido.

**Ainda em aberto:** cadastrar jazigo hoje não funciona sem sinal — é um
`fetch` direto que cria o túmulo e só depois manda GPS e fotos, e a criação não
dá para fingir offline (o resto do fluxo precisa do id que o servidor devolve).
Se você cadastra em lugar sem sinal, isso vira um item próprio; me diga.

### Build E — vocabulário e casa arrumada
**CA-14, CA-09, CA-05, CA-11, CP-10, CA-12**

CA-14 precisa de você antes de mim: são cinco palavras a fixar — `a receber`,
`recebido`, `a identificar`, `conciliado`, `saldo da família`. Depois disso o
Financeiro pode virar funil (CA-09), porque o funil é essas palavras em ordem.

Junto vão: cadastro em etapas com resumo e gravação única (CA-05), unificação
visual começando por formulário e ação crítica (CA-11), e a remoção das 710
linhas mortas do campo (CP-10) — hoje dá para consertar `CardTumulo.tsx`
inteiro e achar que mudou o app.

CA-12 não é código: é sentar com a Sureya num aparelho de verdade, com teclado
aberto e voltando do navegador.

## Decisões guardadas, esperando você

### O "Fazer este agora" não é prioridade — e parece (27/08)

Você perguntou se os jazigos com o botão "⬆ Fazer este agora" eram prioridades.
Não são. O botão aparece em todo cartão que ainda não é o primeiro da lista e
ainda não foi começado — num dia de 10 jazigos, em 9 deles. E ele só mexe na
ordem de HOJE (`ordem_dia`); não encosta em `prioridade`.

Prioridade de verdade existe e é outra coisa: `servicos.prioridade` sobe **+15**
a cada "Não deu para fazer", `adiado_vezes` sobe **+1**, o alocador ordena por
ela ao gerar a agenda (`agenda.ts:789`), e no campo isso só vira texto a partir
de dois adiamentos: *"ficou pra depois 3x — hoje é prioridade"*.

Medido em 27/08 na produção: 10 serviços pendentes, **zero** com prioridade
acima de zero, **zero** já adiados.

Duas coisas separadas, as duas esperando decisão sua:

1. **A confusão de tela** — o botão vira link discreto em vez de bloco com
   seta, e o cartão ganha selo só quando o jazigo É prioridade. Cabe no Build D.
2. **A régua de prioridade** — hoje só levanta prioridade o que a Nina adiou.
   Família que ligou pedindo, data de memória chegando, atrasado do mês
   passado: nada disso levanta. Se deve levantar, e quais casos, é decisão do
   Leandro — não é ajuste de tela.

## Onde estamos

Builds A, B e C entregues. O próximo é o D — e ele já vem com as suas duas
correções escritas acima.

Sobrou do C: 99 `alert` de desfecho no painel. Não converti em massa porque
distinguir sucesso de falha mecanicamente arrisca marcar um erro como recibo
verde. Entram numa passada lida.
