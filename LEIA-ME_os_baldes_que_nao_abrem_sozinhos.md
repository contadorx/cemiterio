# Os baldes que não abrem sozinhos

*Migration 0139 · 27 de agosto*

## De onde isto veio

Apareceu escrevendo o aviso de privacidade da 0138. Eu precisava dizer, com
todas as letras, o que acontece com as fotos — e a frase honesta era ruim.

## O que se mediu

| balde | arquivos | estava |
|---|---|---|
| `servicos` | 817 | **público** |
| `comprovantes` | 3 | **público** |
| `conversas` | 1 | **público** |

Balde público no Supabase abre para **qualquer um que tenha o endereço**, sem
senha, para sempre. Os caminhos levam identificadores aleatórios, então ninguém
acha por tentativa — mas um link que vaze (encaminhado, no histórico do
navegador, na prévia de um aplicativo) continua valendo depois disso.

Para a foto do jazigo isso é até o que **faz** a foto chegar: o WhatsApp busca
a URL. Para os outros dois é diferente:

- **`comprovantes`** — extrato de banco, com nome, valor e às vezes número de conta.
- **`conversas`** — o que a família mandou no privado.

## O que foi medido antes de fechar

Nenhum dos dois **nunca saiu daqui**: zero mensagens de saída com mídia, zero
linhas na fila de liberação apontando para eles. Eles só são vistos no painel,
por quem entrou. Fechar não quebra nada que já esteja no mundo.

## O que mudou

Os dois fecharam. Passam a ser lidos por **link que expira em uma hora**, gerado
na hora em que a tela pede.

**O endereço guardado no banco não mudou.** `getPublicUrl` só monta uma string —
ela não concede nada. Num balde fechado esse endereço devolve 400, e quem o
transforma em algo que abre é `assinar()`, a porta única. Foi isso que permitiu
fechar dois baldes **sem migrar uma linha**: `caminhoDaUrl` já sabia ler esse
formato, e a exclusão de arquivos da 0135 continua funcionando intacta.

**Balde que se cria sozinho agora nasce fechado.** A função que cria o balde
quando ele falta (o conserto da 0009) criava tudo aberto. Um balde apagado e
recriado por engano voltaria público — sem erro nenhum, só a porta destrancada
de novo.

## O que este build de propósito **não** faz: fechar `servicos`

São 817 arquivos lidos por URL direta em **quatro** lugares: a página da família
por token (que não tem sessão), o site público, o painel, e o próprio envio pelo
WhatsApp — o Evolution **baixa** a URL para entregar a imagem. Fechá-lo exige
assinar em todos eles, inclusive onde não há usuário logado.

É um build próprio, com o seu próprio ensaio. Fazer junto aqui seria trocar um
risco conhecido por um apagão de fotos. O teste tem um assert que diz
`servicos continua aberto — e isso ainda é uma decisão, não um esquecimento`:
no dia em que esse build for feito, ele **vai falhar**, e a falha é o lembrete
de vir aqui apagar a linha em vez de descobrir depois que as fotos pararam.

## A parte que quase ficou muda

Fechar o balde cria um jeito novo de a imagem sumir: o link não assinar. Sem
cuidado, `null` chega na tela e ela simplesmente não desenha nada — a mensagem
pareceria não ter foto, e a fila de conferência mostraria a linha **sem o
comprovante**. É o mesmo defeito que a 0134 consertou pela outra ponta.

Então as duas telas distinguem *"não tem"* de *"não consegui abrir"*. Na
conferência o aviso é vermelho e diz o motivo:

> **Não consegui abrir este comprovante agora.** Existe um arquivo anexado, mas
> o link não saiu. Recarregue a tela antes de confirmar — confirmar sem ver o
> comprovante é dar entrada em dinheiro no escuro.

## O que isso muda no aviso de privacidade

A frase sobre comprovantes fica melhor. A sugestão que te mandei dizia que as
fotos abrem para quem tiver o link; isso continua verdade para as fotos do
jazigo — que é o que a família recebe — e deixou de ser verdade para o
comprovante que ela manda. Vale escrever assim quando você publicar a versão 1.

## Uma coisa que não consegui verificar daqui

O ambiente onde eu rodo bloqueia o endereço do Supabase, então **não pude
buscar a URL pública e ver o 400 com os meus olhos**. O que confirmei foi a
chave que controla isso no banco: os dois baldes estão `public = false`. É o
mesmo controle que o Storage consulta, mas o teste de ponta a ponta é seu:
abra um comprovante na conferência (deve aparecer) e, se quiser a prova, copie
o endereço `.../object/public/comprovantes/...` de antes e veja que ele não
abre mais.
