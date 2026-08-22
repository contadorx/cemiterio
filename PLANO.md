# O que falta — Walkstamp

**Atualizado em:** 21/08/2026 — depois do A0, do A1 e do B3
**Origem:** a auditoria de código, a proposta de redesenho de UX e a avaliação das
features pagas, medidas contra o código.

> **Tudo abaixo foi medido** contra a árvore do `walkstampbuild8_1.zip`, que é o `main`
> de produção (`285d4a5`) mais os seis commits do `APLICAR/correcoes.bundle`.

---

## Onde estamos

| Build | Estado |
|---|---|
| 1 — a régua roda, e a placa não trava | **feito** |
| 2 — o documento tem fim | **feito** |
| 3 — a saída certa primeiro | **feito**: transportado no A0 |
| 4 — parar sem perder | **feito**, e melhor do que eu tinha feito |
| 7 — a entrada | **feito**, já no `main` |
| 8 — a conferência | **feito**: o menu `Editar` da grade fechou o build |
| 5, 6, 9, 10 | por fazer |

A perna da etapa de conferir caiu de **2828 px para 1649 px — 42% menor** — recolhendo a
fala e a identificação, que são estado do material e não tarefa.

### A correção do relato: o build 3 nunca chegou

Medido na árvore do zip:

```
recPrim       0        saidasTodas   0
```

A saída recomendada e a gaveta "ver todos os formatos" **não existem na linhagem de
produção**. Elas foram feitas, testadas e comitadas numa cópia que nunca foi aplicada —
`2229ff8`, com `saidarec.mjs` e as 39 adaptações de teste que a gaveta cobrou: 45
arquivos, 1030 linhas. Não é um build a fazer; é um **transporte**.

### E o build 4 deles é melhor que o meu

Medido: `role="status"` 8×, `trMotorCx` (o motor recolhido, que o plano pedia) 5×,
"após este trecho" 3×, e existe `testes/parar.mjs`. O meu — `trLinha`/`trPct`/`trEta`,
inacabado e sem régua verde — deve ser **descartado**, não portado.

Falta um detalhe pequeno no deles: a consequência medida. `sem cerca de` dá **0**. O
plano pedia "a fala está em 62%; o documento ficará sem aproximadamente 16 minutos
finais" — hoje a tela diz que parou, mas não diz o quanto ficou de fora.

---

## A fila do que falta

A ordem respeita o que você pediu: **terminar o UX do app primeiro**. Depois vem o que
trava a venda, e por último o motor e a dívida. Uma exceção argumentada está no fim
desta seção.

### Trilha A — terminar o UX (1–2 d: só a validação com leitor de tela)

**A0. Transportar o build 3 e fechar o 4 — FEITO**

`2229ff8` aplicado sobre a linhagem: a saída recomendada por cenário, com o catálogo
recolhido. `recPrim` e `saidasTodas` davam zero na árvore do zip; agora dão 11 no
`app.html`.

**A1. O menu `Editar` da grade — FEITO**

O que faltava do build 8, e não era o que a proposta descrevia. Medido, o cartão não
tinha tarja nem recorte à vista — eles já moravam na lente. O defeito era outro:

- a lente só abria por um `⤢` com `opacity:0` até o mouse passar por cima. **Num aparelho
  de toque não existe `:hover`** — metade da ferramenta era inalcançável. Agora é um botão
  `Editar`, sempre visível, com o `title` listando o que há atrás da porta;
- a seta de mover desabilitada era `opacity:0 !important`: nas pontas, "não há para onde"
  era silêncio. Agora fica apagada, não sumida;
- o cartão passou a mostrar **a primeira linha da fala**, pela mesma conta que o documento
  usa — cartão e PDF não contam duas histórias sobre o mesmo quadro.

A anotação **continua no cartão**, contra a proposta: anotar é o trabalho desta etapa, e
um trabalho que exige abrir um diálogo por quadro é um trabalho que ninguém faz quarenta
vezes.

Régua: `testes/cartao.mjs`, no grupo `app`.

**A2. As três etapas — FEITO, menos a validação com leitor de tela**

`Entrada → Conferir → Baixar`, e não como rótulo: `Gerar` saiu de dentro de
"Revisão" e virou a etapa 3, num cartão próprio.

A numeração mentia duas vezes. **"2 — A fala (opcional)"** é onde moram `#auto`,
`#extract` e os ajustes de extração: o único botão que faz a ferramenta
funcionar estava dentro de um passo rotulado como dispensável. E **"3 — Revisão"**
escondia quatro blocos, sendo o quarto `Gerar` — a coisa que a pessoa veio
buscar, atrás de três blocos de rolagem.

Agora o cartão da fala perde o número (é a segunda metade da entrada), e são três
etapas com uma barra que diz onde você está (`aria-current="step"`), botões que
levam à etapa, uma frase de próxima ação em `role="status"`, e **a travessia**:
cruzar uma fronteira trabalhando leva a pessoa até a etapa nova — só para
frente, nunca durante a captura, e sem tirar o cursor de quem está escrevendo.

**A barra acompanha a rolagem** e mostra os quatro estados — *atual*,
*concluída*, *com atenção* e *bloqueada* —, cada um por palavra no rótulo
acessível e não só por cor. "Com atenção" sai da mesma conta do botão de faxina,
e por isso os dois nunca discordam. No celular vira `Etapa 2 de 3 · Conferir`
mais uma barra de três segmentos. Abaixo, sempre, uma frase só: **"Próxima
ação: …"**.

E nada pousa debaixo dela: `scroll-padding-top` conserta a classe inteira do
problema — `scrollIntoView`, âncora, o `irPara()` dos subpassos e a travessia.
As duas alturas (cabeçalho e barra) são **medidas** por `ResizeObserver`, porque
cravar o número erraria no alemão a 900 px, onde o menu quebra em duas linhas.

**O estado é derivado**, não guardado: não há quadro → entrada; há quadros e nada
saiu → conferir; saiu documento → baixar. `etapas.mjs` cobra isso recomeçando a
sessão e vendo a barra voltar sozinha.

Ganho não previsto: com `Baixar` num cartão próprio, `passos()` consegue
deixá-lo **inerte** enquanto não há o que baixar. Dentro da antiga "Revisão"
isso era impossível.

**O vocabulário unificado**, que estava adiado desde o build 3, também está
feito — e medir mudou o escopo:

| | antes | agora |
|---|---|---|
| `frame` vs `quadro` em pt | 43 vs 44 | **uma palavra: quadro** |
| `passo 1/2/3` (fase da ferramenta) | 14 chaves em pt, 14 em es | **etapa**, com a concordância certa |
| `trecho` | 32 | **fica** — é trecho de *fala*, conceito diferente |
| en, es, de, fr | já consistentes | intocados |

Só o português estava dividido: em inglês "frame" *é* a palavra nativa, e
espanhol, alemão e francês já usavam a deles. `chaves.mjs` ganhou a guarda que
reprova se qualquer uma voltar.

**O que falta**, e não dá para fazer daqui: **NVDA + Chrome, VoiceOver + Safari
e zoom 200%**. Não há leitor de tela nesta máquina, e uma régua que dissesse
"acessível" sem isso estaria mentindo com autoridade. O que deu para medir está
medido — `aria-current`, o foco indo para o cabeçalho, o rótulo acessível com
número e a palavra "feita", a frase de status que não se repete, e as duas
guardas da travessia.

### Trilha B — o que trava a venda: **FEITA**

**B1. Verdade única entre página, catálogo e código — FEITO**

A página de preços tinha duas listas vindas de lugares diferentes: a **lista
comparativa**, montada de `src/features.json` nos cinco idiomas por
`tabelaDePlanos()`, e os **cartões de plano**, escritos à mão em cinco arquivos.
Elas discordavam.

Medido item por item, contra o código e o banco:

| o cartão dizia | a verdade |
|---|---|
| Modelo de documento próprio — *em breve* | **existe** desde 16/08 (`modelo_doc`, `time_modelo()`, salvar e listar na ferramenta) |
| Perfil entre visitas e máquinas — *em breve* | **existe** (`config`, `perfil_do_usuario()`, `aplicarPerfil()`) |
| Perfil de equipe empurrado — *em breve* | **existe** (`time_config()`, e a ferramenta consome) |
| Termos do sistema guardados — *em breve* | **não existe**: `vocLista` mora em `sessionStorage` e morre com a aba |

Ou seja: **três coisas prontas há cinco dias estavam sendo anunciadas como
futuras**. A migração `20260816062235` diz isso com todas as letras — "a metade
que faltava de duas features que estavam meio prontas" — e a página nunca soube.

O que mudou:

- as três saíram do "em breve" nos cinco idiomas;
- a que falta entrou no catálogo como `"breve": true`, que é onde a regra do
  próprio arquivo sempre disse que ela deveria morar;
- cada bala do cartão ganhou `data-f`, a alça que a amarra ao item do catálogo —
  o selo passa a ter uma fonte só;
- o alemão dizia **"bald"** no cartão e **"demnächst"** na lista comparativa:
  duas palavras para o mesmo selo, na mesma página. Unificado.

**A "terceira fonte" não existia.** O plano falava em unificar também as *feature
flags* do código; medido, a ferramenta não trava nada por nome de plano — ela
trava por haver sessão com cliente. O campo `planos` do catálogo é documentação,
e não interruptor. Um problema a menos, por não existir.

**A trava:** `testes/planos.mjs`, estático — lê JSON e HTML, sem navegador e sem
servidor, porque um portão de release que precisa de `next start` é um portão que
se aprende a pular. Ele reprova (provado nas duas direções) se um cartão marcar
como futuro o que o catálogo diz que existe, se um idioma prometer o que outro
não promete, ou se a palavra do selo divergir. Entrou no `rodar.sh` ao lado do
`chaves.mjs`, e no `rapido.sh site`.

**B2. Webhook único — FEITO**

Havia dois, e o repositório não dizia qual URL estava no painel da Stripe. **Não
era empate.** Medido:

| | rota do Next | Edge Function |
|---|---|---|
| faturas | 6 tipos | os mesmos 6 |
| **`checkout.session.completed`** | **sim** | **não** |
| **`customer.subscription.*`** | **sim** | **não** |
| assentos pela `quantity` | sim | não |
| conferência da assinatura | `constructEvent` da biblioteca | à mão |

A Edge Function tratava **só faturas**. Com a URL apontada para lá, a pessoa
paga, a fatura aparece, e o plano **nunca chega** — em silêncio, porque a Stripe
recebe 200 e vai embora satisfeita.

E ela estava no ar: `walkstamp-stripe`, versão 2, `ACTIVE`, `verify_jwt:false`.

A autoridade é a rota do Next, por três medidas: só ela chama
`walkstamp_assinatura_da_stripe`, e portanto só ela transforma pagamento em
acesso; ela usa a biblioteca oficial; e a produção tem cliente com
`stripe_assinatura` preenchido, campo que só esse caminho escreve.

A Edge Function passou a responder **410 com o endereço certo no corpo** — e não
a ser apagada: um 404 é indistinguível de deploy quebrado, e o 410 diz que o
endereço existiu e mudou. Ela continua reentregando, que é o que se quer.

**A ordem de aplicar importa:** mover a URL no painel da Stripe primeiro,
reenviar por lá o que falhou, e só então publicar a recusa. Ao contrário, as
faturas do intervalo se perdem.

**Idempotência e replay observáveis.** A idempotência já existia, e no lugar
certo — `fatura_stripe_uk` único em `stripe_id` com `on conflict do update`, e a
assinatura sobrescrita inteira a cada evento. O que faltava era **saber que a
entrega aconteceu**: hoje, quando uma compra não vira plano, não há como
distinguir "a Stripe não mandou" de "recebemos e falhamos".

`walkstamp.stripe_evento` responde isso. Ela é **anotação, não trava**: uma
trava que pulasse o `event.id` repetido descartaria justamente a reentrega com
que a Stripe conserta uma falha. `repetido` conta as reentregas — é o número que
denuncia um laço.

Régua: `stripehook.mjs` reescrito (a Edge recusa, a rota do Next é a única que
concede plano, e anota **depois** do trabalho), mais o bloco [8b] da
`supabase/testes/10-fumaca.sql`. **O que continua por conferir:** o caminho de
rede, com `stripe listen --forward-to` e a Stripe CLI — não dá para fazer daqui.

**B3. Banco versionado — FEITO**

Eram zero `.sql` contra mais de vinte RPCs. Agora são **42 migrações versionadas** em
`supabase/migrations/`, e `supabase/testes/prova.sh` reconstrói o esquema do zero e
compara com a produção: **as oito categorias batem** — colunas, funções, índices,
restrições, RLS, sequências, permissões e baldes.

As 38 primeiras saíram **verbatim** de `supabase_migrations.schema_migrations`, cada uma
conferida por md5 contra o que a base diz que aplicou. As quatro últimas são o que a
comparação encontrou de fora do Git:

- **três objetos que ninguém versionou** — `negocio_nps()`, `negocio_painel_base()` e o
  `negocio_painel()` reescrito, feitos à mão no editor do painel. Se a base tivesse sido
  perdida, o painel voltaria sem o NPS e ninguém saberia dizer o que faltou;
- **sete tabelas sem RLS** — `cliente`, `config`, `emissao`, `fatura`, `modelo_doc`,
  `recado`, `usuario`. Não é porta aberta (`anon` não tem USAGE no esquema `walkstamp`),
  é a segunda tranca;
- **dois chamados de mentira na produção**, sobra de uma migração de prova. Um deles está
  marcado como respondido e entra no tempo médio que a **página pública** mostra;
- **treze funções sem `search_path` fixo**, que é o que o linter do Supabase apontava.

Vai junto `seed.sql`, `config.toml` e uma prova de comportamento com 40 afirmações — a
licença, os assentos, o chamado, o roteiro, a cobrança, o blog, o painel, o expurgo e a
parede que separa o navegador das tabelas. Ver `supabase/LEIA-ME.md`.

As quatro novas ainda **não foram aplicadas**: falta um `supabase db push`, e só a da
limpeza mexe em dado.

**B4. Um estado por plano no funil — FEITO**

Cada cartão já tinha uma ação primária. O que estava jogado no meio era outra
coisa, e pior: a página **vendia o Personal** — preço, selo de 14 dias, "na hora,
sem cartão" — e cinquenta linhas abaixo pedia o e-mail da pessoa para avisar
**"quando o plano pago sair"**. Nos cinco idiomas.

Não é erro de texto. É a página não saber que o que ela promete já foi entregue —
o mesmo defeito do B1, no sentido contrário: lá ela escondia o que existia, aqui
ela promete o que já vende. E há checkout de verdade
(`stripe().checkout.sessions.create`), então quem manda é o cartão.

A lista tinha um assunto verdadeiro esperando por ela: **Pro e API**, que a
própria página descreve dois parágrafos acima como "nada disso existe ainda".
Agora ela espera isso, e diz em voz alta que o plano pago já está no ar.

Os quatro estados ficam assim:

| plano | estado | ação |
|---|---|---|
| Free | *testar agora* | Abrir a ferramenta |
| Personal | *testar agora* | Começar os 14 dias |
| Team | *pedir acesso* | Falar sobre o Team |
| Pro e API — não existe | *entrar na lista* | Quero ser avisado |

**A trava** entrou no `planos.mjs`, e é estrutural em vez de casar frases: os
cartões ganharam `data-plano`, a seção ganhou `data-espera`, e o teste afirma que
o que a lista espera **não pode ser algo que a página vende** — mais uma ação
primária por cartão. Provado nas duas direções: apontar a lista para `personal`
reprova, e um segundo botão num cartão reprova.

**B5. Reposicionar o Personal em torno do roteiro — FEITO**

O cartão liderava pela identidade visual. A chamada era *"Para quem entrega
documento com o próprio nome — ou com o do cliente"*, a primeira bala era o
logotipo, e o roteiro vinha em segundo, numa linha: *"suba a planilha, execute um
a um, e ela volta preenchida"*.

"Colocar logotipo" se compara com editar um Word. O que substitui um processo
está medido no código, e agora está escrito no cartão:

| o cartão promete | onde isso vive |
|---|---|
| suba a planilha (.xlsx, .csv, colada do Excel) | `roteiro_salvar()`, `Importar.tsx` |
| cada caso vira um link que abre a ferramenta preenchida | o `caso=` no `template.html` |
| volta em .xlsx com situação, quando, quem, arquivo e impressão | `app/conta/planilha/route.ts` — as 11 colunas |
| recibo por caso, sem imagem sair | `roteiro_caso.recibo`, do build de 16/08 |

A marca **continua no pago**, na quarta bala, junto com o modelo e o perfil — como
prova visível do plano, e não como a justificativa dele.

Uma restrição real do `cenarios.mjs` moldou o resultado: cartões de no máximo
seis balas, e no máximo uma de diferença entre eles. Os três seguem **6/6/5** —
a identidade e o perfil dividem uma linha para o roteiro caber com as duas metades
da tese.

**A trava** entrou no `planos.mjs` e amarra promessa a entrega: as cinco colunas
que o cartão nomeia têm que existir no `cab` da rota da planilha, o export tem que
sair em `.xlsx`, e a primeira bala do Personal tem que falar da planilha nos cinco
idiomas. Provado nas duas direções — tirar `rotColImp` do export reprova, e o
logotipo voltar a liderar reprova.

### Trilha C — motor e dívida (22,5–32,5 d)

**C1. Build 5 — medir antes de otimizar (3,5–4,5 d).** `performance.mark()` em cada
fronteira, amostras versionadas, cold e warm cache. E a pergunta aberta: inglês abre 48
vezes e converte zero.

**C2. Build 6 — menos árvore, menos download (3–4 d).** Classificar o erro e saltar
direto para o fallback pertinente; fixar versões; avisar antes de um fallback de 73 MB.

**C3. Build 10 — a dívida (16–24 d).** Máquina de estados do motor ASR, modularizar a
fonte, medir o pico de memória, medir WER antes de tocar na compactação de silêncio.

---

## Fora da fila, com você

- **sitemap** — precisa do `build.py` depois de aplicar;
- **figura do blog** — precisa de deploy; até lá, exportar abaixo de 1 MB;
- **a branch remota velha** `claude/ux-build-continuation-2hs0b2`, parada em `f505ea8`:
  apagá-la faz o contador de commits parar de mentir, e ela não tem nada que já não
  esteja no `main`.

---

## O total

| Trilha | Dias | O que você tem no fim |
|---|---:|---|
| A — terminar o UX | **1–2** | o redesenho inteiro, com acessibilidade validada |
| B — destravar a venda | **feita** | uma verdade só, cobrança auditável, banco reconstruível |
| C — motor e dívida | **22,5–32,5** | você mede antes de otimizar; as próximas mudanças ficam baratas |
| **Total** | **23,5–34,5** | |

---

## O que não fazer

Aumentar threads além de quatro sem medir captura concorrente · trocar o modelo padrão
antes de comparar tempo e qualidade em áudio representativo · VAD neural só para ter VAD ·
virtualizar a grade para resolver lentidão de transcrição · **transcrição na nuvem como
fallback automático** — ela toca a promessa mais sensível do produto e só pode existir
como escolha explícita, com preço, região e retenção à vista · API genérica de frames +
transcrição, que vira commodity: a defensável é a de **evidência estruturada** · remover
os fallbacks (eles ficam seletivos, não desaparecem) · converter o artefato final em
bundle: modularizar a **fonte** preserva o HTML único.
