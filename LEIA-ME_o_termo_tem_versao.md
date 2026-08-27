# O termo tem versão, e quem aceitou aceitou uma delas

*Migration 0138 · 27 de agosto*

## O que se mediu, antes de escrever qualquer coisa

| | |
|---|---|
| contatos | 339 |
| marcados como tendo autorizado o contato | **62** |
| … vindos de **uma** importação de planilha, em 18/07 | **59** |
| … vindos da tela de cadastro, entre 26/07 e 17/08 | 3 |
| caracteres em `orgs.aviso_privacidade` | **0** |

A última linha é a que importa. **Nunca houve texto.** O consentimento era uma
caixinha com o rótulo *"A família autorizou o contato por WhatsApp (LGPD)"*, e
o sistema afirmava que 62 pessoas concordaram — sem poder dizer com o quê.

E o campo era texto livre, único e editável. Se alguém escrevesse um texto ali
hoje e o mudasse amanhã, as 62 passariam a "ter aceitado" o texto novo, sem
nunca o terem visto. **Campo que muda em silêncio não é termo — é rascunho.**

## Por que este item não podia esperar

Quase tudo neste sistema dá para consertar depois: um valor errado se
recalcula, uma agenda torta se refaz, uma lavagem sem preço a gente completa
com um toque — foi o build de ontem.

Este não. Não há como voltar em setembro e descobrir o que foi dito a uma
família em julho. E cada dia de cadastro acrescenta gente a uma lista que já
nasce sem resposta. Era por isso que ele estava na faixa *"o que não dá para
descobrir depois"*.

## O que mudou

**O texto passa a ter versão.** Publicada, uma versão não se edita mais —
corrigir o texto cria a próxima, e quem já aceitou continua tendo aceitado a
que leu. A trava mora no banco (`tg_termo_publicado_nao_muda`), não na rota:
trava que vive só numa rota vale até alguém escrever a segunda rota.

**Consentimento virou evento, não coluna.** `clientes.consentimento_em`
guardava um instante e nada mais — quem desse, tirasse e desse de novo
aparecia como se nunca tivesse tirado. Pior: *desmarcar apagava a data*, e com
ela o fato de que houve autorização um dia. Sob a LGPD o que se precisa poder
mostrar é justamente o contrário: que foi dada, e que foi atendida quando
pediram para tirar. Agora cada ato deixa linha em `consentimentos`.

**As três portas viraram uma.** Havia três lugares gravando consentimento e
dois escreviam a coluna direto, sem dizer a que texto. É o defeito de forma de
sempre. Agora as três passam pela mesma função, que carimba a versão vigente
naquele instante.

**Sem aviso publicado, o sistema recusa** registrar novas autorizações. É o
que impede a lista de 62 de crescer. E a recusa não chega de surpresa: sem
aviso publicado o cadastro nem oferece a caixinha, e explica o porquê.

## O que ele de propósito **não** faz

**Não carimba as 62 antigas com a versão 1.** Elas aceitaram alguma coisa que
ninguém escreveu, e inventar que foi o texto de hoje seria fabricar um fato
jurídico. Elas entram no histórico com versão **nula**, que quer dizer o que
realmente se sabe: *aceitou antes de existir termo, e não dá para dizer o quê*.
É o "vazio não é zero" do projeto, agora sobre uma afirmação que se faz a
respeito de outra pessoa.

O número fica na tela e não some sozinho. Ele só cai quando cada família
reconfirmar sobre um texto que existe.

**Não escreve o texto de privacidade.** Que política a casa adota é decisão
sua, não minha. A tela pede o texto; a versão 1 nasce quando você publicar.

## Dois defeitos que o teste achou, e que eu não teria visto

**A semeadura era instrução de uma vez, não regra.** O registro histórico das
62 era um `insert … select` solto na migration. Funcionava para elas e para
mais ninguém: qualquer contato que chegasse depois com `consentimento_em`
preenchido por fora ficaria fora do histórico para sempre. Virou função
convergente — a mesma lição do gatilho da 0136.

**`now()` não anda dentro da transação.** Dar e retirar a autorização na mesma
transação gravava os dois eventos com o mesmo carimbo, e *"qual foi o último"*
virava sorteio. Numa tabela cuja única serventia é dizer o que veio depois do
quê, isso é o defeito inteiro. O carimbo passou a ser `clock_timestamp()`.

## O que fica na sua mão

**Escrever e publicar o aviso**, em Configurações → O sistema → Privacidade.
Enquanto ele não existir, nenhuma autorização nova é registrada — inclusive
nos cadastros que você está fazendo agora.

Sugestão do que o texto precisa dizer, para você adaptar: que dados vocês
guardam (nome, telefone, o histórico das limpezas do jazigo), para que os usam
(combinar os serviços e mandar as fotos pelo WhatsApp), que não passam para
terceiros, e que a família pode pedir a remoção a qualquer momento.
