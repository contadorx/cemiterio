# Build A — falha não pode parecer vazio

CA-03, CA-13 e CA-01 das auditorias de UX. É o build que eu recomendei fazer
primeiro, e a razão é uma só: era o único da lista de 26 que podia te fazer
tomar uma decisão errada com dinheiro na mesa achando que estava tudo certo.

## O que estava acontecendo

A tela inicial buscava o mês assim:

```
try {
  const r = await fetch(`/api/mes?...`).then((x) => x.json());
  if (r?.ok) setDados(r);
} finally {
  setCarregando(false);
}
```

Sem `catch`. Sem estado de erro. Se a rota caísse — 500, internet, sessão
vencida — `dados` continuava nulo, `carregando` virava falso, e a tela escrevia:

> Nenhuma pendência neste mês. 🌿

A **mesma frase** de um mês realmente em dia. Você fecharia o dia tranquila com
o sistema fora do ar.

Contei o resto: **144 `catch(() => null)`** e **22 `catch(() => {})`** no
painel. Cada um deles transforma uma falha em lista vazia.

É o "vazio não é zero" que já custou caro no dinheiro duas vezes — ausência de
medida sendo apresentada como medida — e estava solto na tela que você mais
abre.

## O que passou a existir

### Uma porta só para buscar dados (`src/lib/buscar.ts`)

Quatro estados, não dois:

| | quer dizer |
|---|---|
| carregando | ainda não sei |
| **erro** | perguntei e não consegui saber — com botão de tentar de novo |
| vazio | perguntei, soube, e a resposta é nenhum |
| pronto | perguntei, soube, e é isto — desde tal hora |

"Vazio" e "erro" eram a mesma tela em quase todo o painel. São opostos: um diz
que não há trabalho, o outro que não dá para saber se há.

Ela reprova **as três formas de não saber**, e a terceira era a que mais passava
batido: a rota responder `200` dizendo `{ok: false}`, o `.then` ver que não deu,
sair sem fazer nada, e a tela ficar com o estado inicial — vazio.

**O dado velho não é jogado fora** quando a atualização falha. Apagar a tela
castiga quem está olhando por um problema que não é dela. O que estava fica, com
o aviso de que não atualizou e a hora em que aquilo era verdade.

### O aviso de falha é um só (`Falhou` em `pecas.tsx`)

Diz o que houve, dá o botão, e diz a frase que faltava:

> Isto não quer dizer que está tudo em dia — quer dizer que não deu para saber.

### As cinco telas onde a mentira era cara

| Tela | O que ela dizia quando não sabia | Agora |
|---|---|---|
| O mês | "Nenhuma pendência neste mês 🌿" | erro com hora e botão |
| Liberação | "Nada esperando liberação" | avisa que pode haver mensagem parada |
| Agenda | "Nada agendado no período" | "isto não quer dizer que o dia está livre" |
| Financeiro | "Nada para conferir agora" | avisa que pode haver dinheiro esperando |
| Famílias | "Carregando…" para sempre | erro com botão |

A Liberação é a pior das cinco: é a única porta de saída de mensagem para
família, nada sai sem o seu toque, e ela não tinha nem `catch` — a falha morria
no console como *unhandled rejection*, sem nada na tela.

O alarme de **Sinais de vida** também estava `.catch(() => {})`. Ele existe
porque o WhatsApp ficou dezenove dias calado e ninguém viu. Um alarme que some
quando não consegue medir repete exatamente a falha que o criou.

## Precisa de você (CA-01)

O bloco novo no topo da tela inicial, com as filas que só apareciam se você
abrisse o menu certo:

- mensagens prontas esperando liberação
- conversas que precisam de você
- comprovantes para conferir
- pessoas que escreveram pelo site

**Cada número vem da mesma regra da tela para onde ele aponta.** O de conversas
é a própria função `sureya_contadores_conversas()` que a aba "Precisam de você"
usa — não uma segunda contagem. O de liberação usa o mesmo filtro de adiadas de
`/api/fila`, senão a home diria "4 esperando" com a lista vazia. Duas contas
sobre os mesmos fatos começam iguais e terminam discordando; já aconteceu na
agenda, no painel e na lista de famílias.

**Fila que não respondeu não vale zero.** A rota devolve `null`, e o bloco diz
quais filas não conseguiu ler em vez de anunciar que não há nada nelas.

O bloco **some quando está tudo em dia** — quatro zeros todo dia viram moldura,
e moldura ninguém lê. Mas **não some quando falha**: esse é o caso inteiro.

Embaixo, em cinza e separado, o que é trabalho sem relógio correndo: **122
famílias sem nenhum jazigo cadastrado** — não dá para lavar nem cobrar. Medido
hoje na produção, e é o mesmo número que a tela inicial já mostra com o selo
"sem jazigo".

## O que ficou de fora, e por quê

Sobraram `catch` mudos em telas de segunda ordem (configurações, jazigos,
plaquetas, memória). Converti as cinco onde a falha vira decisão errada. As
outras entram junto do Build C, que já vai mexer em confirmação e desfazer nessas
mesmas telas — abrir 25 arquivos agora, sem necessidade, é como se erra por
excesso de zelo.

## Provas

20 guardas novas em `testes/checar-ficha.mjs`, entre elas:

- a tela inicial só diz "nenhuma pendência" **depois de ter conseguido perguntar**
- "nada esperando liberação" só aparece se a fila foi mesmo lida
- fila que não respondeu vem nula, não zerada
- o bloco some quando está tudo em dia, **mas não quando falhou**
- uma atualização que falha não apaga o que já estava na tela
- o número de conversas vem da mesma função da aba "Precisam de você"

`npm run ci` verde: 227 testes, 123 migrações, placar igual à produção
(tabelas 66, funções 129, gatilhos 25, policies 151).

Nenhuma migração — este build inteiro é tela e rota.
