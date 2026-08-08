# Correções da auditoria — leva 2

**Build:** `npm run build` limpo. **`npm run checar` passa sem nenhum aviso** — os 4 acessos desprotegidos que existiam desde antes também foram fechados.

**Três decisões suas entraram no código nesta leva:**
1. A família recebe **só a foto do depois**. A do antes continua sendo tirada, mas como prova interna — e o site parou de prometer o par.
2. `valor_vigente` é o **preço de UMA limpeza**. Quem decide o quanto sai por mês é a periodicidade.
3. Quando o pagamento quita a conta, **o vencimento anda sozinho**.

**Três migrations novas.** Nenhuma apaga dado; a 0038 é a única que sobrescreve colunas, e vem com a conferência antes e o backup explicado dentro. Ordem sugerida: **0039 → 0040 → 0038**.

---

## O que subir, na ordem

### Passo 1 — o código (pode subir já)
Nada aqui depende das migrations. Se você subir só o código, tudo funciona; o que faltar é o painel de rotinas dizer "rode a 0039" e o índice de duplicata ainda não existir.

### Passo 2 — `0039_rotinas_heartbeat.sql`
Cria uma tabela nova. Zero risco. Depois de rodar, espere 2 minutos e confira: se a tabela ficar vazia, seus crons **não estão rodando** — e você acabou de descobrir isso, que era o objetivo.

### Passo 3 — `0040_tumulo_sem_duplicata.sql`
Rode a **Parte 1** e resolva as duplicatas pelo `/painel/jazigos` (a tela mostra a foto ao lado, foi feita para isso). Só então rode a Parte 2. O índice **não nasce** enquanto houver duplicata — e isso é o certo.

### Passo 4 — `0038_DECISAO_valor_vigente_preco_por_limpeza.sql`
**É a única que mexe em dinheiro.** Leia linha por linha o resultado da Parte 1 antes de rodar a Parte 2. Guarde o `select id, cadencia, valor_vigente, valor_mensal from planos` — é o seu backup.

---

## 1. Só a foto do depois — o site agora promete o que o sistema faz

**Arquivos:** `src/lib/site.ts`, `src/app/page.tsx`, `public/manifest.json`

O site prometia "a foto de antes e a de depois, do mesmo ângulo" em três lugares, e o sistema manda uma foto só. Recuei a copy em vez de inflar o sistema:

- **Hero:** "Terminado o serviço, chega no seu WhatsApp a foto do jazigo limpo."
- **Passo 3:** "A foto do jazigo limpo, tirada ali, no dia. Sem ela o serviço não é dado como feito nem cobrado — é regra do sistema, não boa vontade."
- **O que entra:** saiu "foto do antes e do depois"; entrou **"uma página só da sua família, com o histórico de todas as visitas"** — o portal, que é o melhor ativo do produto e o site quase não contava.
- **Mockup do WhatsApp:** mostrava dois balões (Antes/Depois). Agora mostra um, que é o que sai de verdade.
- **FAQ:** saiu **"Pix ou boleto"** — boleto não existe em lugar nenhum do código.
- Também saiu o aviso de "quando o cemitério mexer perto do jazigo": as ocorrências existem, mas são internas e nunca chegaram à família.

**A foto do antes continua sendo tirada e guardada.** Ela é a sua defesa numa reclamação e o histórico do jazigo — só deixou de ser promessa.

**Bug de produto corrigido junto:** `manifest.json` tinha `start_url: "/painel"`. Como o manifest é declarado no layout que envolve a home pública, uma família que instalasse o site no celular abria na **tela de login da equipe**. Agora abre no site, com atalho para "Ver minhas visitas".

**De brinde, o que faltava para o link ser compartilhável:** `og.png` (1200×630, navy/dourado, gerado com o logo da casa), `metadataBase`, card do Twitter, `sitemap.xml`, `robots.txt` e o FAQ em `schema.org/FAQPage`. O robots **bloqueia** `/familia/TOKEN`, `/t/`, `/avaliar/` e `/indicar/` — nesses endereços o link é a senha, e portal de família indexado no Google seria o histórico de um luto exposto.

---

## 2. `valor_vigente` = preço de uma limpeza

**Arquivos:** `src/lib/vencimento.ts`, `api/planos/route.ts`, `api/planos/[id]/route.ts`, `lib/jazigo.ts`, `api/clientes/route.ts`, `painel/clientes/*`, migration `0038`

**O que estava errado:** as telas novas gravavam `valor_vigente = mensal × meses da cadência`, enquanto a agenda e o débito liam a coluna como preço por lavagem. Um plano anual de R$ 40 fazia **cada lavagem nascer valendo R$ 480**; um quinzenal de R$ 40 debitava R$ 80 no mês.

**O que mudou:**
- O número digitado é gravado **igual nas duas colunas** (`valor_vigente` e `valor_mensal`).
- O PATCH do plano **parou de recalcular** o valor. Mexer na periodicidade não mexe mais no preço — que é exatamente o que "o prazo da lavagem decide o plano" quer dizer.
- **O reajuste parou de evaporar.** Antes: você aplicava R$ 45 → R$ 50 (o RPC grava só `valor_vigente`), e semanas depois, ao corrigir a periodicidade, o servidor regravava a partir do `valor_mensal` antigo — a família voltava ao preço velho, sem aviso. A migration 0038 recria `sureya_aplicar_reajuste` gravando as duas colunas (é a função de 0006 palavra por palavra, com uma linha a mais).
- **Rótulos:** "Valor mensal" virou **"Valor por limpeza"** na Carteira, na ficha e na tela de Jazigos. A caixa ao lado, que dizia "Cobrança do ciclo", agora diz **"Dá por mês"** e mostra `preço × limpezas do ciclo ÷ meses do ciclo`.
- **Os totais da carteira ficaram honestos.** Somar `valor_mensal` cru punha um plano anual e um quinzenal no mesmo patamar. Agora usa o "por mês" efetivo (`valorMensalEfetivo`).

**Como sei que funcionou:** a Parte 3 da 0038 tem que voltar vazia, e o "por mês" da carteira deve ficar **menor** do que era antes se você tem planos semestrais/anuais — o número antigo era inflado.

---

## 3. O vencimento anda sozinho quando a família quita

**Arquivo:** `src/lib/financeiro.ts`

`proxima_cobranca` e `pago_ate` só mudavam por digitação — os baldes de vencimento valiam o que a sua memória valesse. A função que avança a data (`proximaData`) existia desde sempre e **não era chamada por ninguém**.

Agora, quando um pagamento zera a conta, cada plano ativo **que já venceu** anda um ciclo, e `pago_ate` passa a ser a data que acabou de ser paga.

**Três cuidados deliberados:**
- Só anda o que **estava vencido**. Plano que vence daqui a 20 dias não pula um ciclo porque a família adiantou outro jazigo.
- Anda **um ciclo por pagamento**, nunca vários. Uma família com 4 meses de atraso que paga tudo tem a data corrigida para o próximo mês, não empurrada para daqui a quatro — o atraso continua visível.
- Avulso e por_data não têm ciclo: ficam em paz.

**Toda mudança vai para `auditoria`** com de/para, plano e cliente. A data é do sistema, mas a trilha é sua: veja em **Config → Auditoria**, ação `vencimento_avancado`.

---

## 4. Débito e remuneração

**Arquivos:** `api/servico/concluir/route.ts`, `api/servico/concluir-admin/route.ts`

- **Débito que falha parou de responder `ok:true`.** Era um `console.error` e a resposta seguia como sucesso: limpeza feita e **não cobrada**, sem sinal em lugar nenhum. Agora vai para `erros_log` (aparece em Config → Diagnóstico) e volta na resposta.
- **O campo agora congela o valor no serviço**, como o painel já fazia. Um avulso sem preço concluído no campo debitava R$ 40 e continuava com `valor` nulo — a tela de Avulsos mostrava "—" ao lado de "lançada · R$ 40,00".
- **A ajudante parou de ganhar R$ 0,00.** `carimbarRemuneracao` recebia o valor **antes** da cascata — nulo justamente nos avulsos. Com regra por percentual, a família pagava R$ 40 e o carimbo saía zero, sem erro nenhum. Nas duas portas.
- **`concluir-admin` ganhou a trava de corrida** (`.neq("status","executado")`) que o campo já tinha. Sem ela, duas submissões simultâneas passavam as duas e a família levava dois débitos.
- O débito do painel também passou a usar o dia de São Paulo.

---

## 5. As rotinas automáticas agora deixam rastro

**Arquivos:** `migrations/0039`, `src/lib/rotinas.ts`, `api/rotinas/route.ts`, os 4 crons, o webhook, `painel/page.tsx`

Os quatro crons e o webhook não gravavam **nenhum** sinal de sucesso — só de erro. E a tela de Diagnóstico, com a lista de erros vazia, escrevia "Nenhum erro registrado ✓". *"Rodou perfeito"* e *"não roda há uma semana"* davam a mesma tela verde.

Agora cada rotina carimba quando passou, e o **Início mostra uma faixa vermelha** quando alguma some, dizendo o que quebra na prática:

| Rotina | Silêncio aceitável | O que quebra quando para |
|---|---|---|
| Respostas e envios (por minuto) | 15 min | As respostas param na fila e as fotos não saem |
| Agenda e cobranças (9h) | 26 h | **A agenda para de ser criada** — Nina sem serviço, família sem limpeza |
| Convites e avaliações (13h) | 26 h | Convites de data e pedidos de avaliação não saem |
| Perfis (6h) | 26 h | Só o aprendizado da IA fica velho |
| Chegada de mensagens | 48 h | Mensagem de família pode não estar entrando |

**Uma rotina que NUNCA rodou conta como parada**, não como "sem novidade" — era exatamente esse caso que ficava verde. O texto da faixa lembra de conferir `CRON_SECRET` e o plano da Vercel.

---

## 6. O campo funciona sem sinal — de verdade

**Arquivos:** `src/lib/offline-fila.ts` (reescrito), `campo/page.tsx`, `campo/Concluir.tsx`, `public/sw.js`

Eram **três** buracos por trás da faixa que prometia "pode continuar — eu guardo e mando depois":

1. **O "Começar" não tinha fila.** Era um fetch cru com alerta. Como o botão de finalizar só aparece depois de iniciar, sem internet a Nina **não fechava jazigo nenhum**. Agora o início entra na mesma fila, e o cartão muda para "Finalizar com a foto" na hora, sem esperar a rede.
2. **A fila estourava em silêncio.** As fotos iam em base64 no `localStorage` (limite ~5 MB, ~300-400 KB por foto). Num dia de 15 jazigos offline, o `salvar` estourava, a exceção subia e o botão ficava travado em "Enviando…" — **trabalho perdido, sem mensagem**. Agora é IndexedDB (sem esse teto), o erro é tratado, e existe um desfecho `"perdido"` que a tela **avisa** com o que fazer.
3. **O app não abria sem sinal.** O `sw.js` não cacheia página — com bom motivo, documentado no próprio arquivo: HTML velho + JS versionado do Next = tela branca. Agora **só o `/campo`** usa "rede primeiro, cache como reserva": online ela sempre recebe a versão nova; offline, a última que funcionou. O painel e o site continuam como antes.

**Também:** a rota do dia fica guardada no aparelho e só é reusada **se for do mesmo dia** (rota de ontem é pior que tela vazia). E a fila da versão anterior é migrada na primeira abertura, para não perder o que já estava lá.

**Este é o item mais arriscado da leva.** Teste com o celular em modo avião antes de mandar para a Nina: abrir o app, começar e concluir 2 jazigos, ligar a internet e ver os 2 subirem sozinhos.

---

## 7. Menos toques no campo

**Arquivos:** `campo/ComoChegar.tsx`, `campo/page.tsx`, `campo/Concluir.tsx`

- **"▶ Começar" agora fica dentro da tela "Como chegar".** Ela chegava no túmulo, fechava a tela (1 toque) e procurava o botão no cartão (mais 1). Em 15 jazigos, 30 toques por dia só para sair de uma tela. O botão fica em destaque quando o GPS diz que chegou, e discreto antes disso — para ela não começar no jazigo errado.
- **O GPS parou de segurar o envio.** A conclusão esperava até 8 segundos por uma leitura **opcional**, parada no sol. Agora a leitura corre por fora, como a foto de longe já fazia.

---

## 8. Duplicata de túmulo

**Arquivos:** `src/lib/jazigo.ts`, `migrations/0040`

**O buraco do "S/Q":** quem cadastra pela ficha muitas vezes não sabe a quadra. O código jogava o jazigo num balde chamado "S/Q" e procurava duplicata **dentro desse balde** — onde, por definição, o jazigo certo nunca está. O número 45 já cadastrado na Q-12 pelo campo virava um segundo registro em S/Q, com a foto de um e a descrição do outro.

Agora, quando a quadra vem vazia, a busca é no **cemitério inteiro**:
- achou um só → é ele, reaproveita e mantém a quadra real;
- achou vários → **não decide sozinho**: recusa e pede a quadra, dizendo em quais ela aparece;
- não achou → aí sim cria em S/Q.

E a `0040` põe a trava no banco: índice único **funcional** sobre `(quadra_id, upper(btrim(identificacao)))`, então "L-128", "l-128 " e "L-128" passam a ser o mesmo jazigo para o banco — como são no mundo real.

---

## 9. Consertos de uma linha (mas caros)

| Onde | O que era | O que é agora |
|---|---|---|
| `lib/agenda.ts` | Qualquer erro no insert virava "já existia" e o ponteiro do plano **avançava mesmo assim** — a família pulava uma limpeza, para sempre | Só duplicata conta como "já existia"; erro de verdade vai para `erros_log`, **o ponteiro não anda**, e o Início mostra em vermelho quantos planos falharam |
| `lib/servico.ts` | `notificado_cliente = true` era gravado **antes** de olhar se o envio saiu — e ainda liberava o pedido de avaliação de um serviço cuja foto nunca chegou | Só marca se saiu de verdade |
| `lib/atendimento.ts` | Todo áudio de família era baixado e transcrito **duas vezes** (webhook + registro), com custo dobrado e o texto duplicado na conversa | Transcreve uma vez |
| `api/whatsapp/route.ts` | A URL com o **segredo do webhook** era impressa na tela do navegador | Volta mascarada |
| `api/campo/nao-feito` | Dois toques somavam +30 de prioridade e "adiado 2x" sem ter ficado | Idempotente |
| 4 telas | Acessos a `.map`/`.join` sem proteção (o `npm run checar` acusava) | Fechados — o `checar` passa limpo |

---

## O que continua na fila

- **Multi-cemitério** — nada aqui muda a agenda/capacidade. O mínimo está mapeado na Parte 2-G da auditoria e vale a pena fazer **antes** do segundo cemitério entrar, não depois.
- **A tela "como foi o mês"** — continuam sendo 9 telas e 15 cliques. É a maior melhoria de CONTROLE que sobrou, e é G.
- **O fuso nas telas de financeiro** — lá o "hoje" é valor pré-preenchido de formulário; mexer muda o que aparece na tela e merece seu olhar.
- **`agenda.ts` apagando remarcação manual** a cada geração, **`fechar_dia` sobrescrevendo o motivo** do "não deu", e o **acerto da equipe que pode pagar duas vezes** — os três são reais, estão na Parte 2-B da auditoria, e mexem em rotina que você usa toda semana. Prefiro fazer com você olhando.

---

## Conferência rápida depois de subir

1. `/campo` às 22h continua mostrando a lista do dia.
2. Modo avião: começar e concluir um jazigo, voltar a internet, ver subir.
3. Concluir uma limpeza e olhar `servicos.foto_antes_url` — continua preenchido.
4. Registrar um pagamento que quita: `cobranca_nivel` volta a 0 e `proxima_cobranca` anda (confira em Config → Auditoria).
5. Preencher o formulário do site: card amarelo aparece no Início.
6. Financeiro → Pagamento da equipe: os números batem com "A pagar".
7. Início: sem faixa vermelha de rotinas depois de rodar a 0039 e esperar um dia.
