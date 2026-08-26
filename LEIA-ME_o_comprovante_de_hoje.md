# O comprovante de hoje — o que o produto fez, e o que não fez

Um Pix de verdade, R$ 40,00, 26/08. Segui o rastro dele até o fim. É o melhor
tipo de teste que existe, e ele achou um defeito grave.

---

## A linha do tempo

```
11:42:30  chegou o comprovante pelo WhatsApp
          lido: R$ 40,00 · 26/08 · E18236120202608261141s0058440f18
          gravado em `comprovantes` como `a_conferir`
11:42:32  "Bom dia 😘🩵"
11:43:08  a IA preparou a resposta e SEGUROU
11:43:31  "Se eu precisar lavar o túmulo em uma data específica, como faço"
```

## O que funcionou — e é bastante

- **A leitura acertou tudo:** valor, data e o E2E inteiro. Sem digitação.
- O comprovante entrou como **`a_conferir`**, não como dinheiro. Isso é
  deliberado e está certo: comprovante que a família manda **não é dinheiro**
  até alguém bater com o extrato do banco.
- A conversa ficou **`lida_sem_resposta`** e **escalada para uma pessoa**.
- A IA escreveu uma resposta boa e **não mandou**, com o motivo gravado:
  *"disparos automáticos desligados"*. É a regra da casa, respeitada.

## O que não funcionou

### 1. O dinheiro não chegou ao razão — e esse é o defeito grave

**Zero lançamentos.** Para o sistema, os R$ 40,00 não existem.

Ensaiei em produção com os dados reais desse comprovante:

```
ENSAIO DESFEITO >> sureya_lancar FALHOU: [P0001] sem_org
```

**A causa:** `registrarComprovante` chama `sureya_lancar` para criar o crédito
pendente. Essa função resolve a organização por `current_org_id()` e **não tinha
parâmetro de org**. Quem chama ali é o webhook do WhatsApp, com o cliente de
service_role e **sem sessão de painel** — e fora de uma sessão
`current_org_id()` é nulo.

É a **lição da 0103**, escrita neste repositório: *"toda função chamável por
cron ou psql precisa de `p_org` explícito"*. `sureya_lancar` ficou de fora.

**Por que só apareceu agora:** o comprovante anterior é de 02/08, e naquele dia
funcionou — a escrita ainda passava pelo razão antigo e chegava por gatilho de
espelho. A 0073 mudou a porta para `sureya_lancar` direto. Entre 02/08 e 26/08
**não chegou comprovante nenhum**: o defeito ficou deitado, esperando o próximo.

### 2. Falhou calado

O erro ia só para `console.error`. E o comentário **na linha de cima** dizia,
com todas as letras: *"foi um catch mudo como este que escondeu, por meses, o
extrato da família nunca funcionando"*.

A lição estava escrita a uma linha do lugar onde o mesmo erro aconteceu de
novo. Agora vai para `erros_log`, que aparece no painel de rotinas.

### 3. Confirmar não confirmava nada

`sureya_conciliar_comprovante` só fazia `update conta_corrente ... where
comprovante_id = ...`. Sem linha ligada ao comprovante — e não havia —, o update
mexia em **zero linhas**, e o botão do Financeiro dizia que deu certo.

Agora, ao aprovar, se não existir lançamento ele **é criado** a partir do
próprio comprovante. **É assim que você recupera o de hoje:** confirme na tela
do Financeiro e os R$ 40,00 entram, com o valor e a data que a leitura extraiu.
Confira o extrato do banco antes — é para isso que o `a_conferir` existe.

### 4. Ninguém respondeu a família

Três mensagens entrando, **zero saindo**. Ela pagou, deu bom dia e fez uma
pergunta — e ficou sem resposta. A conversa está escalada e agora aparece no
número da aba Conversas (o que fizemos ontem), então ela não some mais.

**Um cuidado:** o rascunho da IA é de **11:43:08** e a pergunta dela é de
**11:43:31**. Se você mandar o rascunho como está, ele agradece o Pix e **não
responde a pergunta**. Vale escrever a resposta da data junto.

---

## O produto atende?

**Na leitura, sim** — e essa é a parte difícil. Ler um Pix de imagem, acertar
valor, data e E2E, e ainda segurar a resposta para uma pessoa decidir: isso
funciona e é o coração da coisa.

**No fechamento do ciclo, não atendia.** Entre "li o comprovante" e "o dinheiro
existe na conta da família" havia um degrau quebrado, e ele quebrou justamente
onde ninguém olha — sem erro na tela, sem linha no log.

O padrão vale anotar, porque é o terceiro desta semana: **o que quebra aqui não
grita.** A régua emudecendo aos 30 dias, as funções abertas ao anônimo, e agora
o comprovante. Nenhum dava erro. Todos foram achados medindo produção contra o
que o código dizia fazer.

E note qual é a diferença entre este e os outros dois: **este você achou.**
Olhou a tela, sentiu falta dos dados, e perguntou. É exatamente assim que se
acha esse tipo de defeito.

---

## O que ainda está aberto

- **Os R$ 40,00 de hoje** continuam órfãos até você confirmar na tela.
- **A família Xim não tem contrato** (`regime = nao_definido`, nenhum jazigo
  contratado). Mesmo com o crédito lançado, não há dívida para abater — o
  dinheiro fica como saldo a favor dela. Vale decidir o regime na Conferência.
- **A pergunta dela** — *"como faço para lavar em uma data específica"* — é
  literalmente o fluxo que nasceu hoje de manhã: agora existe o botão **Marcar
  avulsa** na ficha, com data, valor e quem pediu.

10 verificações em `testes/comprovante_vira_dinheiro.sql`. `npm run ci` verde:
227 testes, 122 migrations, placar igual à produção.
