# Desempenho — o que vale mexer, e o que não

Escrito em 13/08/2026, depois de comparar o ClipContext com o SalaVox, um projeto irmão que resolveu
os mesmos problemas de Whisper no navegador e mediu bastante coisa.

O critério aqui é estreito de propósito: **o ClipContext é gratuito e não tem servidor.** Então só entra
o que custa zero de infraestrutura. Nada de fila, nada de GPU alugada, nada de API por uso — isso já
está tratado em `ARQUITETURA-PAGO.md` e é outra conversa.

---

## Onde o tempo está de verdade

O ClipContext tem **dois** custos independentes, e eles não competem: a varredura de frames e a
transcrição. Quem cola uma legenda pronta paga só o primeiro. Quem transcreve paga os dois.

### 1. A varredura — medida aqui, nesta máquina

| operação | mediana |
|---|---|
| um salto no vídeo + assinatura 32x18 | **79 ms** (p90: 114 ms) |
| capturar um frame de 900 px em JPEG | 6,5 ms |

A varredura por cena usa `janela/700` como passo, com teto de 700 saltos. Para **uma hora de vídeo**
isso dá **55 segundos só saltando**, e menos de meio segundo gravando os frames.

**O custo é o salto, e nada mais.** Otimizar a assinatura, o canvas ou a captura não muda nada — juntos
eles são 8% do total. Isso é medição, não estimativa.

### 2. A transcrição

Não consegui medir aqui: o modelo vem de CDN e este ambiente não alcança a rede. Os números desta parte
são do SalaVox, que rodou o mesmo `transformers.js` com os mesmos modelos, e ordens de grandeza
conhecidas do Whisper. **Estão marcados como estimativa em todo lugar onde aparecem.**

O que sei com certeza, porque está no nosso código: o laço de transcrição manda **todas** as janelas de
30 s ao modelo, com ou sem fala dentro. E o runtime está preso em **uma linha**.

---

## O que vale fazer, em ordem

### 1. Um degrau embaixo do modelo de 4 bits — **é um defeito, não uma melhoria**

**Verificado neste repositório**, com um modelo simulado que abre normalmente e estoura na primeira
inferência:

```
Não consegui transcrever aqui: Can't create a session. ERROR_CODE: 1,
ERROR_MESSAGE: qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits Missing required scale…
```

A transcrição morre inteira. O usuário fica com uma linha de C++ e nenhum texto.

O `try/catch` de hoje cobre só a montagem do pipeline. Mas o arquivo de 4 bits
(`decoder_model_merged: 'q4'`, que só o caminho da placa de vídeo pede) **só é aberto de verdade na
primeira inferência** — depois do `catch`. O SalaVox levou exatamente esse erro de uma reunião real,
duas vezes, e a pessoa ficou sem ata.

**Correção:** envolver também a chamada `pipe(seg, opts)`, e ao reconhecer a assinatura do erro
(`session|Missing required scale|MatMulNBits|DequantizeLinear|ERROR_CODE`) remontar o pipeline em
`dtype:'q8'` e refazer *aquele mesmo pedido*, uma vez só.

**Esforço:** baixo. **Ganho de velocidade:** zero. **Ganho real:** a transcrição deixa de morrer numa
classe inteira de máquinas.

---

### 2. Ligar as linhas do WASM — **o maior ganho gratuito da lista**

Hoje: `w.numThreads = 1`, escrito à mão. Num computador de oito núcleos, sete ficam parados.

Mais de uma linha exige `SharedArrayBuffer`, que exige isolamento entre origens, que se pede por dois
cabeçalhos de resposta — configuração de hospedagem, não código.

**O risco conhecido é que o isolamento quebre o carregamento de CDN de terceiro**, e o modelo, o
`jsPDF` e o Tesseract todos vêm de CDN. **Testei isso aqui**, servindo o app com os cabeçalhos e
carregando um script de outra origem *sem* `Cross-Origin-Resource-Policy` — o pior caso:

| | isolado | SharedArrayBuffer | script de outra origem |
|---|---|---|---|
| sem cabeçalhos | não | não | carrega |
| com `credentialless` | **sim** | **sim** | **carrega** |

`credentialless` e não `require-corp`: com `require-corp` todo recurso externo precisaria mandar CORP
próprio, e as CDNs não mandam — seria trocar velocidade por produto quebrado. Onde `credentialless`
não existe (Safari, hoje) o cabeçalho é ignorado, a página não isola e volta a uma linha. **Não há como
quebrar, só como não melhorar.**

No `vercel.json`:

```json
{ "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
{ "key": "Cross-Origin-Embedder-Policy", "value": "credentialless" },
{ "key": "Cross-Origin-Resource-Policy", "value": "cross-origin" }
```

E no código, `min(4, núcleos − 1)` em vez de `1`. O teto de quatro não é timidez: o ganho achata depois
disso, e no ClipContext a transcrição divide a máquina com a captura ao vivo, quando ela está rodando.

**Ganho estimado: 2× a 4× no caminho do processador** — que é onde quase todo mundo está, porque a
placa de vídeo é a exceção. **Esforço:** baixo.

---

### 3. Peneira de silêncio na transcrição de arquivo — **grande, e já temos metade**

O laço de `$('auto')` manda todas as janelas de 30 s ao modelo. Uma janela com 4 segundos de fala custa
o mesmo que uma cheia: **o Whisper sempre processa 30 segundos.**

Numa aula gravada, numa apresentação de slides ou numa gravação de tela, boa parte do tempo é silêncio.
Pular janelas sem voz corta as passagens pelo modelo quase na proporção.

**A ironia é que a captura ao vivo já faz isso** — `temSinal()`, que olha blocos de um segundo. Falta
levar para o caminho de arquivo, e vale melhorar o critério enquanto isso: o SalaVox usa limiar
**relativo ao próprio canal**, `max(0,006, percentil99,9 × 0,06)`, contando quadros de 20 ms e exigindo
dez deles. Limiar fixo erra nos dois sentidos — grava baixa demais some, gravação alta demais deixa
passar ruído.

Uma armadilha que eles pagaram para aprender: o limiar era 12% e um teste passou raspando, porque o
trecho baixo do arquivo tinha exatamente 18 dB a menos que o alto. Baixaram para 6%. *Verificação que
passa por um fio é aviso, não aprovação.*

**Ganho estimado: proporcional ao silêncio** — 2× num vídeo com metade de silêncio, mais em aula com
pausas. **Esforço:** baixo-médio.

---

### 4. Dizer o tamanho do modelo, e considerar o processador como padrão

Hoje a lista diz "Modelo base — rápido" e "small — preciso", sem tamanho. E o código tenta a placa de
vídeo primeiro, que baixa o **codificador sem compressão**. Os números que o SalaVox conferiu arquivo
por arquivo nos repositórios:

| modelo | processador (q8) | placa de vídeo (fp32 + q4) |
|---|---|---|
| base | **77 MB** | 206 MB |
| small | **249 MB** | 586 MB |

O caminho padrão do `small` baixa **586 MB sem avisar**. Para uma ferramenta gratuita que a pessoa
experimenta uma vez, isso é o abandono mais provável do funil inteiro.

Duas mudanças independentes:

- **Mostrar o tamanho na própria opção**, e mudar o número quando a escolha de motor mudar.
- **Considerar o processador como padrão**, com a placa virando uma caixa a marcar. Além de baixar 2,4×
  menos, há relato da própria biblioteca de que em Whisper o WASM costuma terminar **antes** da WebGPU.
  Isso eu não medi e não deduzo — mas com o item 2 no lugar, o processador fica ainda mais competitivo.

**Esforço:** baixo. **Ganho:** o maior de todos em termos de gente que consegue usar a ferramenta.

---

### 5. `navigator.storage.persist()` — uma linha

Sem isso, o navegador trata o modelo baixado como cache descartável e o apaga quando o disco aperta. A
próxima vez baixa tudo de novo. Uma linha, dentro de `try`, e o pedido pode ser negado sem piorar nada.

```js
try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); }
catch (e) {}
```

---

### 6. Contar em qual motor rodou e quão rápido — **ganho direto zero, e ainda assim vale**

Hoje, quem está lento não sabe se é a máquina, o modelo ou a escolha. A diferença entre placa e
processador é de 5× a 20×, e o aviso de queda é discreto.

Mostrar, junto do resultado: em qual motor, em quantas linhas, e quantas vezes o tempo real. Abaixo de
1×, dizer o que fazer. Isso é o que impede otimizar no escuro — **e é o único jeito de saber se os itens
2 e 4 funcionaram na máquina de quem usa.** Deveria vir antes deles, não depois.

Detalhe que o SalaVox descobriu doendo: citar as linhas no texto é o que denuncia quando a hospedagem
para de mandar os cabeçalhos. Sem isso, uma configuração perdida ficaria invisível e voltaria como "está
lento".

---

### 7. Menos saltos na varredura — **o único item que é só nosso**

Este o SalaVox não tem, porque ele não extrai frames.

Hoje a varredura é uniforme: 700 saltos de passo fixo, 55 segundos numa hora de vídeo. Mas num vídeo de
slides existem talvez vinte trocas de tela — **a varredura gasta 680 saltos confirmando que nada mudou.**

Uma passada grossa seguida de bisseção nos intervalos onde a assinatura mudou encontra as mesmas trocas
com muito menos saltos: ~120 sondas grossas mais ~6 por transição real. Com vinte transições, algo como
240 saltos em vez de 700.

**Ganho estimado: 2× a 3× na varredura**, e de brinde a transição passa a ser localizada com precisão
melhor que o passo fixo. **Esforço:** médio, e a verificação precisa ser dura — o teste de cinco cortes
exatos que já existe é exatamente o instrumento certo.

---

## O que não vale fazer

- **Batching de janelas.** Rende só na placa de vídeo, e briga com a peneira de silêncio, que é o que
  impede o modelo de inventar texto sobre nada. Só faria sentido depois de compactar a fala.
- **Compactar a fala** (costurar os trechos removendo os vãos). É o maior ganho possível — 2× a 3× — e é
  também o mais perigoso: os instantes voltam na linha do tempo compactada e precisam ser remapeados
  para a real. Errar esse mapa desloca o pareamento imagem-fala do PDF inteiro, que é o produto. O
  SalaVox fez, com seis sabotagens em cima do remapeamento. Para o ClipContext eu deixaria por último.
- **Quantizar o codificador para fp16.** Há relato de perda de precisão do codificador Whisper em fp16
  no WebGPU. Pode acelerar e piorar o texto de um jeito difícil de notar — o pior tipo de piora.
- **Transcrever um canal só na captura ao vivo.** Daria até 2×, e destruiria exatamente o que o recurso
  vende: as fontes já chegam separadas. Fica registrado para não ser redescoberto como boa ideia.
- **Otimizar a assinatura ou a captura de frame.** Medido: 8% do custo da varredura. Não há o que ganhar.
- **`condition_on_previous_text`.** Melhora a coerência entre janelas e amplifica laço de alucinação.
  Desligado de propósito.

---

## Um defeito conhecido que nenhum item acima resolve

As janelas de 30 s são cortadas **sem sobreposição**, então uma palavra que cai na emenda pode ser
partida. Consertar custa velocidade — sobreposição é trabalho repetido. A troca está feita a favor da
velocidade, e sem que ninguém tenha decidido, que é o pior jeito de fazer uma troca.

---

---

## 13/08/2026 — os sete, feitos

Todos entraram. O que dá para afirmar com medição, e o que fica como estimativa:

**Item 7, varredura — medido aqui, e é o maior ganho concreto.** Num vídeo de 6 minutos com seis telas:
**136 saltos contra 701** do passo fixo, **5,2× menos**, e a varredura caiu para 3,4 s. De brinde, a
precisão melhorou: as seis transições foram localizadas em 00:00, 01:00, 02:00, 03:00, 04:00 e 05:00 —
o segundo exato, e não o múltiplo do passo. O vídeo de cinco cortes exatos continua devolvendo
00:00 · 00:12 · 00:24 · 00:36 · 00:48, e o cancelamento continua aproveitando o que já foi extraído.

**Item 1, degrau embaixo do 4 bits — o defeito confirmado, e fechado.** Há agora dois pontos de queda,
porque o arquivo de 4 bits pode falhar em dois lugares diferentes: ao montar o pipeline e na primeira
inferência. Os dois têm teste com o erro real do ONNX, e nos dois a transcrição sai assim mesmo, no
processador. Quando a queda acontece durante a transcrição, a caixa da placa é desmarcada — não faz
sentido tentar de novo na mesma sessão.

**Item 3, peneira de silêncio — medido.** Num áudio de 90 s com fala só nos dez primeiros, duas das três
janelas são puladas, e a tela diz quantas. O limiar é relativo ao próprio áudio
(`max(0,006, percentil99,9 × 0,06)`), contando quadros de 20 ms.

**Item 2, linhas do WASM — o risco foi testado e não se confirmou.** Com os três cabeçalhos no
`vercel.json`, a página fica isolada, `SharedArrayBuffer` existe, e script de outra origem *sem* CORP
continua carregando. Sem os cabeçalhos, volta a uma linha e nada quebra. **O ganho de tempo real não foi
medido**: esta máquina tem dois núcleos, e `min(4, 2−1)` dá 1 — a única configuração onde a mudança não
faz efeito nenhum. O número que vale medir é o «× o tempo real» na máquina de quem usa.

**Itens 4, 5 e 6 — feitos.** O tamanho aparece na tela e muda quando a placa é marcada (77 / 206 MB no
rápido, 249 / 586 no preciso); o processador virou o padrão e a placa é uma caixa a marcar;
`storage.persist()` está dentro de `buildPipe`; e o resultado agora conta motor, linhas e quantas vezes
o tempo real, com aviso quando fica abaixo de 1×.

Uma decisão de projeto que vale registrar: **as linhas são citadas no texto de propósito.** Se a
hospedagem parar de mandar os cabeçalhos, o número cai para 1 sem nenhum erro na tela — e sem essa
frase, a configuração perdida ficaria invisível e voltaria como "está lento".

O que continua na fila, e por quê: **compactar a fala** (o maior ganho possível, e o mais perigoso, por
causa do remapeamento de instantes) e **sobreposição nas emendas de 30 s** (custa velocidade, e a troca
atual está feita a favor da velocidade sem ninguém ter decidido).

---

## 15/08/2026 — por que o modelo não montava numa máquina com tudo verde

Um relatório de diagnóstico real, de uma máquina Windows com Chrome 151, mostrava **tudo
funcionando**: WebGPU disponível, `crossOriginIsolated=true`, biblioteca carregada, `config.json`
do modelo em HTTP 200, os 78,6 MB do peso baixando em GET puro, e os três endereços de wasm
respondendo 206. E os três degraus de montagem falhando com a mesma linha:

```
Can't create a session. ERROR_CODE: 1, ERROR_MESSAGE: qdq_actions.cc:137
TransposeDQWeightsForMatMulNBits Missing required scale:
model.decoder.embed_tokens.weight_merged_0_scale
```

Duas pistas dizem onde o defeito está, e nenhuma delas é a rede:

**`qdq_actions.cc` é otimizador de grafo**, não leitor de arquivo. O erro acontece *depois* de ler
o modelo, quando o runtime reescreve o grafo. Não é download corrompido nem 404.

**O degrau `fp32` falhou com um erro de `MatMulNBits`**, que é uma operação de 4 bits. Um degrau
sem compressão não deveria nem passar perto dessa operação. Quando três configurações diferentes
falham identicamente, o que elas têm em comum não são as configurações — é o runtime.

E o runtime era o problema. O `findWasmBase()` sondava três endereços de `onnxruntime-web` e usava
**o primeiro que respondesse** — que era um build `1.26.0-dev`. Só que cada versão do
`transformers.js` é publicada contra uma versão específica do `onnxruntime-web`, e o pacote já
aponta para ela. Trocar esse endereço por fora é montar um motor com a caixa de câmbio de outro
carro: tudo carrega, nada anda.

### O que mudou

**O endereço de fábrica virou o padrão.** A sondagem continua, mas como plano B — ela existe para o
caso do endereço padrão sair do ar, não para substituí-lo por rotina.

**A fila de degraus ganhou duas saídas novas**, e agora é, no caminho do processador:

1. `q8` com o runtime de fábrica
2. `q8` **sem otimização de grafo** (`graphOptimizationLevel: 'disabled'`) — pula exatamente a
   transformação que quebra, ao custo de alguma velocidade
3. `fp32` com o runtime de fábrica
4. `q8` com o runtime sondado — o comportamento antigo, agora por último
5. **resgate pela placa de vídeo**, se a máquina tiver WebGPU e a pessoa não a tiver marcado: o
   caminho da placa não passa pelo otimizador do wasm. Custa 206 MB em vez de 77, e é por isso que
   ele é o último degrau e não o primeiro — só entra quando a alternativa é ficar sem transcrição

Cada degrau ainda repete com uma linha só antes de desistir, pelo motivo de sempre (COEP barrando o
Worker do CDN).

**A caixa "usar a placa de vídeo" some onde não há WebGPU.** Ela continua desmarcada por padrão:
encarecer o primeiro download de todo mundo de 77 para 206 MB, para acelerar alguns, seria pagar no
lugar errado.

### Um defeito de CSS achado no caminho

Esconder essa caixa não funcionava. `.hide{display:none}` estava **acima** de
`.chk{display:inline-flex}` na folha, e com a mesma especificidade quem vence é a última — então
`label.chk.hide` continuava visível. `.hide` passou a ser `!important`, que é o que um utilitário
precisa ser. O defeito não dava erro, não aparecia em revisão e só se via na tela.

---

## 15/08/2026, segunda rodada — a hipótese do runtime caiu

Publicada a correção acima, o mesmo relatório voltou com **seis** degraus, todos com a mesma
linha — incluindo os três que existiam justamente para escapar dela:

| degrau | resultado |
|---|---|
| `wasm · q8` (runtime de fábrica) | `MatMulNBits Missing required scale` |
| `wasm · q8` com uma linha só | idem |
| `wasm · q8 · sem otimização de grafo` | idem |
| `wasm · fp32` | idem |
| `wasm · q8 · runtime reserva` | idem |
| **`webgpu · fp32`** | idem |

Isso encerra três hipóteses de uma vez. **Não é a versão do runtime**, porque o degrau de fábrica e
o sondado falham igual. **Não é o otimizador de grafo**, porque desligá-lo não muda nada. E **não é
o wasm**, porque a placa de vídeo — que nem passa por esse caminho — falha com a mensagem do wasm.

Quando seis configurações diferentes produzem um erro idêntico, o que elas têm em comum não são as
configurações: são **os bytes que estão sendo abertos**. E há duas explicações para os bytes serem
os mesmos em todos os degraus:

1. o `dtype` não está trocando de arquivo — a biblioteca abre o mesmo decodificador sempre;
2. o arquivo está **guardado no navegador** e nenhum degrau chega a pedir outro.

A segunda tem um agravante que combina com uma queixa antiga desta caixa de entrada — *"mesmo após
baixar, na próxima transcrição ele continua baixando"*. Cache Storage não revalida o que já tem: um
arquivo truncado, ou de uma variante que não abre, fica lá indefinidamente.

Uma pista de laboratório reforça o ponto: `wasm de fábrica: [object Object]`. O `wasmPaths` do
transformers.js 4.x é um **objeto** (um mapa de arquivo → endereço), não uma string. Quer dizer que
a versão anterior, que o substituía por uma string de CDN, estava de fato quebrando a resolução —
só que consertar isso não bastou, porque não era a causa raiz.

### O que esta rodada faz — e por que ela é de instrumentação

Eu vinha respondendo por teoria uma pergunta que o código pode responder por medição: **qual
arquivo cada degrau abre.** O `progress_callback` já recebe o nome de cada arquivo pedido; ele
passou a ser registrado por degrau e impresso.

- **O diagnóstico lista o que está guardado no navegador**, endereço por endereço e com o tamanho.
  Um `decoder_model_merged_q4.onnx` guardado enquanto o degrau diz `fp32` fecha o caso na hora.
- **Cada degrau imprime os arquivos que pediu**, ou `(nenhum — veio tudo do cache)`, que é a
  resposta mais reveladora possível.
- **Dois degraus novos**, os dois atacando a causa que sobrou: um que **apaga o guardado e baixa de
  novo**, e um que troca de **repositório do modelo** (`Xenova/whisper-base` em vez de
  `onnx-community/whisper-base` — exportações antigas, sem `MatMulNBits`).
- **Um botão "apagar o modelo guardado"**, ao lado do diagnóstico, para não depender de limpar
  dados de navegação inteiros.

Os rótulos dos degraus deixaram de ser alinhados por coluna fixa: com nomes mais longos, o
`padEnd(34)` colava "sem otimização" em "falhou" no relatório copiado.

---

## 15/08/2026, terceira rodada — a instrumentação apontou o erro que era meu

A medição encerrou as duas hipóteses da rodada anterior, e de quebra mostrou que **um dos degraus
mentia**.

O que os `arquivos pedidos:` provaram:

- **Não é cache corrompido.** O degrau `cache limpo` apagou tudo, baixou de novo e falhou igual.
- **Não é o `dtype` sendo ignorado.** O degrau `fp32` pediu `encoder_model.onnx` e
  `decoder_model_merged.onnx` — os arquivos sem compressão, exatamente como devia.
- **Não é o repositório.** O degrau `Xenova/whisper-base` baixou os 73 MB do outro repositório e
  falhou com a mesma linha, byte a byte.

Dois repositórios, quatro `dtype`, com e sem otimização de grafo, wasm e WebGPU: **oito degraus,
uma mensagem só.** Um erro idêntico em oito configurações diferentes não descreve oito execuções —
descreve uma. O que executava era sempre o mesmo.

### O degrau "runtime reserva" nunca trocou runtime nenhum

Esse é o erro, e ele é meu. O `onnxruntime-web` **instancia o `.wasm` uma vez por módulo** e guarda
a instância. Depois da primeira sessão, mexer em `wasmPaths` não troca nada — o binário já está na
memória. E `import()` do mesmo endereço devolve o módulo do cache, não um módulo novo.

Ou seja: os oito degraus rodaram no mesmo `onnxruntime`, carregado no degrau 1. A hipótese "versão
do runtime" não foi testada e descartada — ela **nunca chegou a ser testada**. Eu li o degrau 5
falhando e concluí a coisa errada.

### O que muda: trocar de ambiente, não de configuração

A unidade de tentativa deixou de ser a configuração e passou a ser o **ambiente** — a combinação de
biblioteca e runtime. Cada ambiente carrega um **módulo novo**, com um `onnxruntime` novo, através
de um parâmetro diferente na URL do `import()`:

```js
await import(url + '?ws=' + (++contadorModulo));
```

Sem esse parâmetro o navegador devolve o módulo já carregado, e a troca vira teatro.

Os ambientes, em ordem:

| # | biblioteca | runtime |
|---|---|---|
| 1 | `@huggingface/transformers@4.2.0` | o que a biblioteca traz |
| 2 | `@huggingface/transformers@4.2.0` | o sondado no CDN (agora aplicado **antes** da 1ª sessão) |
| 3 | `@huggingface/transformers@3` | o que a biblioteca traz |
| 4 | `@huggingface/transformers` (último) | o que a biblioteca traz |

No ambiente 1 vale a fila inteira de degraus; nos seguintes, só `q8`, `fp32` e o repositório de
reserva — se o ambiente for a causa, o primeiro degrau já resolve, e repetir seis variações em cada
um só gastaria a paciência de quem espera.

E o diagnóstico passou a imprimir **`versões`**, lido de `env.versions`: qual `onnxruntime` cada
módulo carregou. Discutir versão por dedução, que é o que eu vinha fazendo há três rodadas, deixa
de ser necessário.

### A lição de método

As três rodadas anteriores foram hipótese → correção → publicar → falhar. Esta foi medição →
hipótese. A diferença de custo é o tempo do Leandro, e ela deveria ter vindo primeiro: o
`progress_callback` já entregava o nome de cada arquivo desde sempre — eu é que não estava olhando.

---

## 15/08/2026, quarta rodada — montou; e o que custou

A escada de ambientes funcionou: a gravação seguinte transcreveu **11 falas ao vivo, a 1,9× o
tempo real**, no processador com 4 linhas. Depois de quatro rodadas, o modelo abre nessa máquina.

O relatório trouxe junto o preço: **353 MB baixados** antes de uma sessão subir, e um cartão que
parecia travado no fim. Três correções.

### O custo: 353 MB

A fila tentava `fp32` (~200 MB) **antes** das alternativas de 8 bits (~73 MB cada). A ordem passou
a ser por custo de download, e não por elegância:

| ordem | degrau | baixa |
|---|---|---|
| 1 | `q8` | ~73 MB (uma vez) |
| 2 | `q8` sem otimização de grafo | nada — mesmo arquivo |
| 3 | `q8` no repositório de reserva | ~73 MB |
| 4 | `q8` com o cache apagado | ~73 MB |
| 5 | `fp32` | ~200 MB |
| 6 | placa de vídeo | ~206 MB |

E antes de qualquer degrau caro a tela **avisa**: *"as opções leves não subiram, tentando uma que
baixa ~200 MB — é a partir daqui que fica grande"*. Ver a barra reiniciar num número maior sem
explicação é o que faz alguém achar que travou.

### A combinação que funciona fica lembrada

A escada era refeita a cada visita. Agora a combinação vencedora — biblioteca, runtime, arquivo —
fica em `localStorage` e vem na frente de tudo na próxima vez. Se ela deixar de funcionar
(biblioteca atualizada, cache limpo), é esquecida e a escada normal corre em seguida.

É **configuração**, não conteúdo: nomes de versão e de arquivo. Está descrito na política de
privacidade e na página de segurança, ao lado do idioma, e o botão *apagar o modelo guardado*
apaga a anotação junto.

### O cartão que parecia travado

Este é o defeito de verdade, e é de interface. A barra de progresso e a linha *"Baixando o modelo
de voz: 100% — 353 de 353 MB"* pertencem à transcrição ao vivo — que termina junto com a gravação.
Ninguém as limpava. O resultado: uma gravação que **deu certo** terminava com uma barra parada na
tela e o botão *Transcrever* desabilitado (corretamente — não há áudio guardado para transcrever de
novo). Lido de fora, isso é "deu erro e não me deixou abrir o diagnóstico".

Agora o fim da gravação limpa a barra e troca a linha por *"Transcrição feita ao vivo: N trechos. O
texto está aqui embaixo e pode ser corrigido."* — em todas as saídas, inclusive na que não gerou
frame nenhum. O teste de gravação passou a verificar as quatro coisas: barra escondida, nenhuma
linha de download sobrando, diagnóstico clicável, apagar-modelo clicável.

### Um teste que estava errado, e a decisão que ele testava

O caso "modelo indisponível" esperava que a gravação seguisse mesmo assim. O produto faz o
contrário, de propósito: **para antes de pedir a tela** e oferece dois botões — diagnóstico e
"gravar só os frames". Uma reunião não se repete; descobrir no fim que não houve transcrição é o
pior momento possível para descobrir. O teste passou a verificar o comportamento certo.

---

## 15/08/2026, quinta rodada — a resposta: a biblioteca era a 3.x

O diagnóstico fechou a questão em duas linhas:

```
1. combinação lembrada  -> OK  [linhas=4]
   ambiente: @huggingface/transformers@3 · runtime de fábrica
```

Montou de primeira, com **zero download** (tudo do cache), pela combinação guardada. E a combinação
guardada é a **3.x**. A hipótese "versão da biblioteca", que eu tinha dado por descartada na
terceira rodada por causa de um degrau que não trocava nada, era a certa desde o começo — só nunca
tinha sido executada de verdade.

Consequência direta: a **3.x virou a primeira da fila**, para todo mundo. Não faz sentido cada
navegador novo subir a escada inteira — e pagar os 353 MB — para chegar onde já sabemos que dá
certo. A 4.2.0 continua logo atrás, para o dia em que a 3.x sair do ar ou parar de servir.

O cache do navegador guarda a marca do preço dessa descoberta: `decoder_model_merged.onnx` com
**198,9 MB** ao lado dos `_quantized` de 51 MB, e as duas cópias do repositório `Xenova`.

### `versões : ?`

O diagnóstico não achava a versão porque procurava só em `env.versions`. A 3.x expõe
`env.version`, e o onnxruntime guarda a sua em `backends.onnx`. Passou a procurar nos três.

### A repetição do Whisper — o "tempos errados"

A captura da rodada anterior mostrava isto no painel ao vivo:

```
00:15  Microfone: Vamos para a linguagem que está gravando.
00:17  Microfone: Vamos para a linguagem que está gravando.
00:18  Microfone: Vamos para a linguagem que está gravando.
00:19  Microfone: Vamos para a linguagem que está gravando.
```

É artefato conhecido do Whisper: numa janela quase muda, ou quando a frase atravessa o corte de 30
segundos, ele devolve a mesma sentença de novo. Numa evidência de teste isso é pior que não ter
transcrição — são horas de relógio afirmando que a pessoa disse a mesma coisa quatro vezes.

O filtro é conservador de propósito: descarta só quando é o **mesmo canal**, a **mesma frase**
(ignorando pontuação e caixa) e dentro de **30 segundos**. Microfone e computador dizendo a mesma
coisa continuam sendo duas falas — juntá-las apagaria informação. E repetição de verdade dentro de
um mesmo trecho ("não, não é da jade dela, não é da jade dela") vem numa linha só e passa inteira.
Vale para a transcrição ao vivo e para a de arquivo.

### "Sem frames" deixou de ser indistinguível de defeito

Zero frames com a gravação rodando não tinha explicação na tela. Agora tem: a captura só guarda a
tela **quando ela muda**, e uma tela parada — ou uma janela que o navegador entrega como quadro
preto — produz zero legitimamente. A mensagem diz isso e diz o que fazer. Um limite explicado é um
limite; um limite mudo é um defeito.

### Ainda na quinta rodada: a minutagem que não batia

Duas âncoras de tempo diferentes governavam a mesma gravação.

Os **frames** eram carimbados por `liveAgora()` — relógio de parede desde o instante zero da
captura. As **janelas de transcrição** eram carimbadas por `consumidos / 16000` — quantas amostras
de áudio já tinham saído da fila. As duas só coincidem enquanto **nenhuma amostra se perde**, e
perder amostra é o normal: o worklet engasga quando a máquina está dividida entre a captura da tela
e o Whisper rodando a 1,9× o tempo real, e o grafo de áudio começa a acumular num instante que não
é exatamente o zero da gravação.

O erro é cumulativo e silencioso. Nada aparece na tela; o que aparece é um passo às 00:13 pareado
com a fala de outro momento — numa evidência de teste, uma hora de relógio afirmando algo que não
aconteceu ali.

Agora cada bloco de áudio carrega o instante de parede em que foi capturado, e a janela herda o
instante do seu primeiro bloco. **Uma âncora só, a mesma dos frames**, por construção e não por
coincidência. O teste novo (`alinhado.mjs`) grava 12 s, pausa 15 s — a pausa descarta o áudio da
espera de propósito — e grava mais 35 s: a última fala tem que cair perto do fim do relógio, e os
frames têm que mostrar o buraco da pausa. Mostram.

### E o "sem frames" com a tela mudando

Aqui eu não tenho a resposta, e chutar de novo custaria mais uma rodada. O que a gravação passou a
fazer é contar **por que** cada quadro foi recusado — sem imagem do vídeo, falha ao ler a tela,
mudança abaixo do limiar — e imprimir os números junto da mensagem de fim, com a **maior mudança
vista** contra o **limiar em vigor**.

É a diferença entre uma hipótese e um fato. Se a maior mudança for 3% contra um limiar de 8%, o
limiar está alto para aquela tela. Se ela for 40% e mesmo assim ninguém entrou, o defeito é meu e o
relatório diz isso na cara.

---

## 15/08/2026, sexta rodada — o "sem frames", e um erro meu de leitura

O diagnóstico veio limpo: `transformers=3.8.1`, `ort.web=1.22.0-dev`, modelo montado pela
combinação lembrada, **zero download**. O lado do modelo está resolvido.

Mas ele veio sem os números dos frames — e a culpa é minha. Eu pus os contadores na **mensagem de
fim da gravação** e pedi "me manda a linha entre parênteses". A pessoa apertou o botão que se chama
**Diagnóstico**, que é o que qualquer um aperta quando algo dá errado, e mandou aquilo. O
instrumento estava no lugar errado.

Os contadores passaram para o Diagnóstico, e ficam guardados depois que a gravação termina:

```
última gravação de tela:
  frames guardados : 1   de um limite de 60
  duração          : 6.1 s   laço a cada 700 ms
  vídeo            : 320×180
  recusas: sem imagem do vídeo=0  falha ao ler a tela=0  falha ao gravar a imagem=0
           mudança abaixo do limiar=9  limite atingido=0
  mudança: maior vista=0.0   limiar em vigor=5.5   (escala 0–255)
```

(As unidades também estavam erradas na primeira versão: `diff()` devolve média de 0 a 255, e eu
imprimia como porcentagem.)

### Uma causa encontrada de caminho

A assinatura de 32×18 serve ao **detector de mudança**. Ela estava barrando também as capturas
**forçadas** — a de abertura, a de fechamento, o botão "marcar" e a retomada da pausa —, que são
justamente as quatro em que não há nada a detectar porque a decisão de guardar já foi tomada.

Se `signature()` falha nessa máquina (a leitura de pixel pode falhar por mais de um motivo), o
resultado é uma gravação inteira com vídeo o tempo todo e **zero frames**. Agora a falha da
assinatura é contada e a captura forçada passa assim mesmo. O teste novo (`semframes.mjs`) quebra a
leitura de pixel de propósito e exige que a gravação ainda termine com frame.

E o `snap()` — que grava a imagem de verdade — ganhou o mesmo tratamento: se ele estourar dentro do
`setInterval`, derrubaria o laço inteiro em silêncio. Agora é contado, com a mensagem do erro, e o
laço continua.

Não afirmo que era isso na máquina do Leandro. Afirmo que era **um** jeito de acontecer, que agora
não acontece mais, e que se ainda acontecer o relatório dirá qual dos cinco motivos foi.

---

## 15/08/2026, sétima rodada — o botão estava embaixo da dobra

*"Agora o aplicativo não habilitou o diagnóstico."*

O botão nunca esteve desabilitado. Ele estava **inalcançável**, e o motivo é estrutural:

O Diagnóstico morava dentro do cartão 2. O cartão 2 **colapsa** quando não há vídeo no passo 1 —
`.card.fechado .dobra{grid-template-rows:0fr}` com `overflow:hidden` no filho. Tudo que está lá
dentro é recortado a zero de altura. Ou seja: **a ferramenta de quem está com problema desaparecia
exatamente no estado em que há problema.** Na captura que o Leandro mandou, o cartão 2 dizia
"Escolha um vídeo no passo 1 para continuar" — e o botão estava logo abaixo daquela linha, com zero
pixel de altura.

O Diagnóstico e o "apagar o modelo guardado" saíram de dentro da dobra e passaram a viver logo
abaixo do aviso de cartão travado, sempre visíveis. A resposta do "apagar" também mudou de lugar:
ela ia para o `#astatus`, que fica dentro da dobra e sumia junto — agora vai para um `#diagStatus`
ao lado dos botões.

### Como isso passou pelos testes

Esta é a parte que me interessa mais. **Dois testes bateram no defeito e eu silenciei os dois.**

O Playwright recusou `locator('#diag').click()` com *"a `<div>` intercepts pointer events"* — que é
literalmente o relatório do defeito, com o elemento culpado nomeado. Eu troquei por
`.evaluate(el => el.click())`, que dispara o clique por dentro do DOM e ignora se o elemento está
alcançável. O teste voltou a passar. O defeito continuou.

Os dois contornos foram removidos, e existe agora um teste (`tapado.mjs`) que faz a pergunta
diretamente: com o cartão travado, `elementFromPoint` no centro do botão devolve o botão? E o
clique de verdade — sem `force`, sem `evaluate` — funciona? Ele cobre os três estados: cartão
travado, durante a gravação e depois de parar.

A regra que fica: **quando o Playwright diz que um elemento não é clicável, ele não está sendo
chato — ele está sendo o usuário.** Contornar o clique é apagar o relatório.

### E os contadores agora sobrevivem ao F5

O relatório dessa rodada veio com `última gravação de tela: (nenhuma gravação nesta aba ainda)` —
diagnóstico rodado em aba nova. Quem grava, vê que deu errado e recarrega a página perdia
justamente o que veio buscar. Os contadores foram para o `sessionStorage`: morrem com a aba, como
todo o resto, e estão descritos na política.

---

## 15/08/2026, oitava rodada — o detector media a coisa errada

O relatório que faltava, enfim:

```
frames guardados : 5   de um limite de 60
duração          : 18.7 s   laço a cada 700 ms
vídeo            : 1920×794
recusas: ... mudança abaixo do limiar=23
mudança: maior vista=6.6   limiar em vigor=5.5
```

Vinte e oito tentativas, cinco guardadas, vinte e três recusadas por "não mudou o suficiente". E a
**maior** mudança de toda a gravação foi 6,6 numa escala de 0 a 255 — raspando o limiar de 5,5.
Alguém percorrendo telas de verdade numa janela de 1920 px, e o detector enxergando quase nada.

### Por que

O detector reduzia cada quadro a uma assinatura de 32×18 e comparava pela **média** da diferença
absoluta. Média funciona em vídeo, onde a cena inteira troca. Em captura de tela ela falha de um
jeito específico:

Numa janela de 1920×794, navegar de uma transação para outra troca a área de conteúdo e deixa
**intactos** o menu do topo, a barra lateral, o rodapé e o fundo. Uma troca que salta aos olhos
ocupa 3% dos pixels. Espalhada pela média de 576 células, vira 2,7 — abaixo de qualquer limiar
utilizável. Baixar o limiar não resolve: a 1 ou 2, o cursor piscando e o relógio da barra de
tarefas viram "mudança de tela" e o documento enche de quadros iguais.

O erro não era o limiar. Era a **grandeza medida**.

### O que passou a medir

O sinal agora tem duas partes, e vale a maior:

- a **média** de sempre — boa para vídeo, onde a cena inteira muda;
- a **fração de células que mudaram de verdade** (algum canal movendo mais de 24 em 255), trazida
  para a mesma escala de 0 a 255.

Usar o **máximo**, e não a soma, garante que o detector só pode ficar mais sensível: nenhuma
captura que acontecia antes deixa de acontecer.

A escala casa com os limiares que já existiam, por um acaso feliz: 5,5 passa a significar "2,2% das
células mudaram" e 26 passa a significar "10,2%". Uma célula solta — o cursor, o relógio — vale 0,4
e não move ninguém.

O teste (`telalarga.mjs`) reproduz a geometria da máquina real: 1920×794, cromo parado, painel de
3% trocando a cada 3 s. Ele exige as duas coisas ao mesmo tempo — que a **média sozinha fique
abaixo do limiar** (senão o cenário é fácil demais e o teste não prova nada) e que a captura
aconteça assim mesmo:

```
mudança: maior vista=10.2   limiar em vigor=5.5
  das duas partes: média=2.7   área=10.2  (4.0% das células)
```

Sete passos para seis navegações, onde antes seriam zero.

E o diagnóstico passou a imprimir as duas partes separadas. Um número composto sem as parcelas é um
número que não se pode interpretar — foi o que me custou uma rodada nesta mesma investigação.

---

## 15/08/2026, nona rodada — "Página sem resposta" e a barra que faltava

Duas queixas na mesma frase, e a segunda é a que decide se a primeira importa:

> *"Agora ele está travando… e a barra da transcrição está somente no baixando o modelo até 100% e
> não mais aparece a da transcrição com percentual e tempo esperado, essa barra é um calcanhar de
> Aquiles pois é a diferença entre aguardar e fechar a página."*

Ele tem razão nas duas, e a leitura é exata: numa espera cega, **fechar a aba é a decisão
racional** — e fechar a aba perde a gravação inteira, porque não há nada guardado em lugar nenhum.
A barra não é enfeite; é o que compra a paciência que o produto precisa.

### A trava

A inferência rodava no **fio principal**. Cada janela de 20 segundos de áudio custa segundos de
processador (a máquina dele mediu entre 1,9× e 5,7× o tempo real), e enquanto ela corre nada é
pintado e nenhum clique é atendido. Passado o limite do navegador, aparece a caixa oferecendo
"sair da página" — no meio de uma gravação que está dando certo.

A correção é uma linha, e ela já existia no runtime: **`env.wasm.proxy = true`**. Com ela o
onnxruntime cria um worker próprio e o fio principal fica livre.

Não virou padrão cego, virou **degrau**. O worker é criado a partir de um blob e, sob isolamento
entre origens, alguns navegadores barram — então ele é o primeiro ambiente da escada, e o segundo é
exatamente o comportamento de antes: mais desconfortável, mas funcionando. A escada que foi
construída para achar a biblioteca certa serviu, sem mudança, para escolher onde a inferência roda.

Entre uma janela e outra o laço agora **devolve o fio ao navegador** por dois quadros. Não elimina
o bloqueio (uma janela sozinha já pode passar do limite), mas garante que a barra ande *entre* as
janelas em vez de saltar de 0 a 100 no fim.

E como a fila de ambientes ganhou um degrau novo e melhor, quem já tinha combinação guardada
ficaria preso na antiga para sempre. A anotação passou a ter **versão**: subir o número descarta o
que foi guardado e faz a escada correr uma vez mais.

### A barra

A cauda — o trecho depois de apertar Parar, quando falta transcrever o que ficou na fila — era a
**única espera longa do produto sem barra nenhuma**. Dizia "Terminando de transcrever o que
faltou…" e mais nada. Cinco segundos e cinco minutos tinham exatamente a mesma aparência.

Agora ela tem porcentagem, contagem de trechos e previsão. Três decisões:

- **A previsão sai do ritmo medido nesta máquina** (`relogio`), não de uma estimativa fixa: a mesma
  gravação leva 4 s numa máquina e 40 s em outra.
- **A barra mora no cartão 1**, junto do botão Parar que a pessoa acabou de apertar — e não no
  cartão 2, que naquele momento ainda pode estar dobrado. Barra escondida é o mesmo que barra
  nenhuma.
- **A porcentagem também vai para a linha de status da gravação**, que é onde os olhos já estão.

### Duas perguntas do Leandro, respondidas com medição

**"Qual a vantagem do worker próprio? Teríamos ganho de performance?"**

Praticamente nenhum. O `proxy` do onnxruntime já tirou a inferência do fio principal, e um worker
nosso rodaria **os mesmos núcleos wasm nas mesmas linhas** — o cálculo não fica mais rápido por
mudar de dono. O que sobraria no fio principal é o preparo do áudio (espectrograma e tokenização),
algo entre 50 e 150 ms por janela. Real, mas pequeno perto dos segundos da inferência.

O que um worker próprio daria de verdade é **controle**: poder matar e recriar uma sessão travada
sem recarregar a página. O custo seria refazer dentro do worker a escada de ambientes, a combinação
lembrada e a limpeza de cache — dias de trabalho por um ganho de velocidade que não existe.
Decisão: não fazer. Se voltar a engasgar, o passo certo é mover **só o preparo do áudio**, que é
pequeno.

**"Preciso transcrever e depois extrair os frames? Não daria para fazer em paralelo?"**

Daria — e já dava. Os dois trabalhos nunca disputaram nada: a transcrição lê o áudio do arquivo
pelo `AudioContext` e roda no worker do runtime; a varredura busca posições no `<video>` e desenha
num canvas. Decodificadores diferentes, nenhuma trava entre eles. **A única coisa que sugeria uma
fila era a numeração dos passos 2 e 3.**

Medido no teste `paralelo.mjs`: em série 1,1 s, junto 0,8 s — **27% no cenário mínimo**. Num vídeo
longo, onde a transcrição domina, a varredura sai praticamente de graça: o ganho tende ao menor dos
dois tempos.

Agora clicar em **Transcrever** dispara a varredura junto, com uma linha explicando. Três regras de
bom senso: só dispara se ainda não houver frames (não refaz o que a pessoa fez nem apaga escolhas
dela), só se a varredura não estiver em curso, e se falhar falha sozinha — a transcrição não pode
cair por causa de uma varredura em segundo plano.

Na gravação de tela isso já acontecia desde sempre: os frames são capturados enquanto o áudio é
transcrito em janelas. A fila só existia no caminho do arquivo.

Uma nota de método sobre o teste: a primeira versão media também "clicar nos dois à mão", e dava
**pior**. O motivo era o próprio teste — com o disparo automático em vigor, o segundo clique
reiniciava a varredura do zero, e o teste media o trabalho duas vezes. Na tela ninguém consegue
fazer isso, porque o botão fica desabilitado enquanto a varredura corre. Um teste que mede o que o
produto não permite não mede nada; esse caso saiu.

---

## 18/08/2026 — o ritmo dos quadros: onde a máscara ajuda e onde ela cega

Três relatos na mesma semana, e os três eram o mesmo mecanismo puxando para lados opostos.

**O relato 1, reunião:** *"ele troca na média 1 frame a cada 2 segundos"*. Numa chamada de vídeo os
quadradinhos das câmeras mudam a cada amostra e arrastavam a tela inteira acima do limiar. A resposta
foi a **máscara de movimento**: a célula que muda em ≥60% das últimas 12 amostras é vídeo, e deixa de
opinar. O que sobra — o slide, o documento — volta a decidir sozinho.

**O relato 2, YouTube:** *"gravei com o YouTube e ficou pouco sensível no novo cenário"*. Medido com
uma página em que o vídeo ocupa metade da tela, moldura parada em volta, **três trocas de cena em 36
segundos**:

| ritmo `equilibrado` | quadros | por quê |
|---|---|---|
| com máscara | **1** | o vídeo inteiro entrou na máscara; quem decidia era a moldura parada |
| sem máscara | **3** | as trocas de cena voltaram a contar; a válvula de 10 s segura o resto |

A máscara pergunta *"o que se mexe sempre?"* e responde *"o vídeo"*. Isso é **certo numa chamada**,
onde o vídeo é a moldura e o slide é o assunto, e **errado num tutorial**, onde o vídeo é o assunto.
Quem sabe a diferença é o cenário — e o cenário já escolhe o ritmo. Então a máscara passou a existir
só em `reuniao`. Fora dela o flipbook continua barrado pelo piso de 1,5 s e pelo assentamento, que era
quem fazia esse trabalho antes de a máscara existir.

**O relato 3, Gmail:** *"rolando o email não pegou o frame"*. Este eu **diagnostiquei errado duas
vezes**, e as duas vale registrar:

1. Achei que era a resolução da assinatura — texto some ao encolher para 32×18. Medi: uma caixa de
   entrada rolada dá diferença de **20 a 47** contra um limiar de 5,5, em 32×18. Subir para 48×27 ou
   64×36 não mudava a decisão em nenhuma amostra. **A assinatura estava certa.** O que estava errado
   era o meu primeiro teste, que renumerava um texto *parado* em vez de rolar pixel — e o Gmail não
   faz isso. Um cenário de teste ruim quase me fez consertar o que funcionava.
2. Achei que era a máscara cegando a comparação quando a rolagem para, e escrevi um desvio
   (`parouRegiao`) que ligava a comparação sem máscara nesse instante. **Era código morto:** a
   máscara é atualizada na mesma amostra, *antes* de a comparação usá-la, então as células liberadas
   já estavam visíveis. Com o desvio forçado a nunca disparar, o resultado do caso saiu idêntico ao
   número. Ele só podia produzir quadro falso, porque religava também o que continuava se mexendo.
   Foi removido. Quem resolve de verdade é o **desmanche** da máscara: 5 amostras (3,5 s) depois de a
   região parar, ela já não opina.

### A tabela de ritmos, hoje

| ritmo | piso entre quadros | amostras paradas p/ guardar | válvula | máscara |
|---|---|---|---|---|
| `tudo` | 0 | 0 | — | não |
| `equilibrado` | 1,5 s | 1 | 10 s | **não** |
| `reuniao` | 12 s | 2 | 45 s | **sim** |

`ata` usa `reuniao`; todo o resto usa `equilibrado`; `tudo` é escolha manual.

### O que ficou de diagnóstico

- `mascaradas` passou a guardar o **pico**, não o valor do instante em que a gravação parou — a
  máscara se desfaz em segundos de tela quieta, e ler o valor final não explicava nada.
- `guardados` conta os quadros mantidos, legível **durante** a gravação. Sem isso um teste só
  conseguia contar miniaturas, que só existem depois de parar.
- O validador do `build.py` passou a ler de `lib/site.ts` quais chaves o Next preenche na hora de
  renderizar. Ele acusava `tabelaPlanos` e `quantasFeatures` como "sem valor" em cinco idiomas a cada
  build: dez linhas de aviso falso por dia, escondendo o aviso verdadeiro que aparecesse no meio.

### O teste

`/tmp/rolar.mjs`, registrado nas duas esteiras. Cinco blocos: rolar uma caixa de entrada de verdade e
parar; a gagueira do Whisper; o desmanche da máscara (no ritmo em que ela existe, senão o bloco testa
o nada); a frase do fim nos cinco idiomas; e a página de vídeo que não pode terminar com um quadro só.

---

## 18/08/2026, décima rodada — o quadro saiu do heap, e três coisas que a medição desmentiu

Esta rodada começou com a lista de "performance de memória e rolagem" e terminou com
duas coisas feitas, uma **não** feita por medição, e um defeito velho encontrado de
caminho. Os números são todos desta máquina, com a régua que agora mora no repositório
(`testes/pesagem.mjs`, `testes/grade.mjs`, `testes/varredura.mjs`) — antes eles moravam
numa sessão de chat, que é o mesmo que não morarem em lugar nenhum.

### O quadro deixou de ser texto

Um quadro era `c.toDataURL('image/jpeg')`: uma string base64 no heap JavaScript. Três
custos ao mesmo tempo — base64 infla o binário em 33%, o texto mora exatamente onde o
navegador aperta primeiro, e JPEG é o dobro de WebP na mesma qualidade.

Medido sobre uma captura de tela **de verdade** a 900 px:

| | bytes | PSNR |
|---|---|---|
| JPEG q0,85 (o de antes) | 40,8 KB | 38,95 |
| **WebP q0,85** | **22,5 KB** | **40,11** |

O WebP é menor **e** mais fiel. Como base64 acrescenta 33% por cima do JPEG, o que
estava no heap eram 54,4 KB por quadro.

Na régua completa (1920×1080 mudando 3×/s, 25 s, sem transcrição):

| medida | antes | depois |
|---|---|---|
| custo de um quadro | 24,4 KB | **13,6 KB** |
| … no heap JavaScript | 24,4 KB | **0 KB** |
| projeção em 300 quadros | 7,1 MB | **4,0 MB** |
| projeção em 2000 quadros | 47,6 MB | **26,6 MB** |
| FPS durante a gravação | 59,8 | 59,4 |

(Os absolutos não batem com os 73,8 KB da rodada anterior porque a tela sintética da
régua é mais lisa que uma tela real. O que se compara aqui é antes contra depois na
mesma régua.)

**O arquivo continua saindo em JPEG.** Todos: PDF, DOCX, PPTX, ZIP, HTML, SCORM e o
`.json` da sessão. Três razões:

- Word e PowerPoint anteriores a 2021 não leem WebP, e o público desta ferramenta é
  quem trabalha em estação travada por política — que é onde o Office velho vive;
- o `.json` precisa continuar reabrível pelas versões anteriores, e vice-versa;
- e o **SHA-256**. Aqui eu **errei um diagnóstico e corrijo**: cheguei a escrever no
  código que o jsPDF grava bytes WebP sob a etiqueta `/Filter /DCTDecode`. Não grava —
  `pdfimages -list` mostra JPEG válido nos dois casos, ele converte sozinho. Mas se
  QUEM converte for ele, a imagem que chega ao PDF deixa de ser a imagem cuja impressão
  digital o documento imprime ao lado. Converter na nossa porta é o que mantém as duas
  sendo a mesma coisa — e `testes/memoria.mjs` agora prova que o `.json`, o `.zip` e o
  `.docx` levam o **mesmo byte** do mesmo passo, com o mesmo hash.

Transcodificar custa 7,4 ms por quadro, uma vez por saída.

E a liberação dos blobs **não é por caminho**. "Revogar em todo lugar que descarta um
quadro" seriam nove lugares hoje e dez amanhã, e o décimo é o que vaza. Pergunta-se a
`frames` quem ainda está vivo e solta-se o resto. Uma sutileza custou uma tarde: uma
imagem nasce **antes** de entrar na lista, e reabrir um `.json` monta trezentas imagens
novas antes de trocar `frames` — a varredura do `render()` da lista velha revogava todas.
O navegador não avisa: entrega `<img>` com `naturalWidth` zero, a miniatura fica com
altura zero, e o que se vê é a lupa embaixo da seta de mover.

### A grade NÃO foi virtualizada, e o motivo é o número

Medido com passo fixo de 120 px por quadro de tela — o ritmo de quem rola com o dedo:

| grade | rolando | `render()` completo |
|---|---|---|
| 300 quadros | 47,5 · 47,2 · 51,9 FPS | 15–22 ms |
| 900 quadros | 45,4 FPS | 47 ms |

Não há problema de rolagem para consertar. Tentei mesmo assim o caminho mais barato,
`content-visibility:auto`, que deixa o motor do navegador pular o que está fora da tela
**sem tirar nada do documento**. Três medições de cada lado: ele deixou **pior** —
43,1 · 43,1 · 40,9 FPS a 300 quadros, e 34,3 FPS com `render()` de 91 ms a 900. Removido.

A virtualização à mão custaria muito mais e cobraria o preço que já estava previsto:
reciclar um campo de anotação com texto dentro apaga o comentário de quem acabou de
digitar; e tirar `<figure>` do documento quebra de uma vez a barra de rolagem, o Ctrl+F,
o leitor de tela e a contagem de passos.

**Uma nota de método:** a primeira medição deu 27,3 FPS e quase me fez consertar o que
funcionava. O erro era do harness — ele rolava uma FRAÇÃO da altura da grade, então uma
grade mais alta pulava mais conteúdo por passo e o número piorava sem nada ter ficado
lento. É o mesmo erro da rodada do Gmail, com outra roupa: um cenário de teste ruim
quase me fez consertar o que funcionava.

### O espelho no disco — o item que valia mais, e não por RAM

Um travamento da aba perdia a gravação inteira. Duas horas que morrem aos 110 minutos
voltavam como nada — e, numa espera longa, fechar a aba é a decisão racional.

Agora cada tela capturada é também gravada no armazenamento privado do navegador (OPFS),
na máquina de quem usa. Os quadros continuam no array — é isso que faz `file://`
funcionar — e o disco é espelho, nunca substituto.

- **Índice append-only** (`indice.jsonl`, uma linha por quadro). Reescrever o índice
  inteiro a cada quadro custaria gravação crescente numa reunião de duas horas e, pior,
  um arquivo reescrito pode ser truncado no meio — que é justamente a hora em que ele
  precisa estar inteiro. Uma linha quebrada no fim se joga fora; um arquivo quebrado no
  meio, não. `testes/espelho.mjs` escreve meia linha de propósito e exige o resto de volta.
- **Some quando um documento sai.** O espelho atravessa o acidente; ele não vira arquivo.
- Some sozinho depois de sete dias, e a caixa do passo 1 desliga **e apaga na hora**.

Isto mexe com a promessa central do produto e não podia ficar em silêncio: a seção nova
está na página de privacidade nos cinco idiomas, e a página de segurança foi **corrigida**
nos cinco — ela dizia "a única coisa que persiste é o modelo de transcrição", e isso
passou a ser falso no instante em que o espelho existiu.

### O defeito que apareceu de caminho: o PDF não contava que tinha saído

Escrevendo "apagar o espelho quando um documento sai", fui procurar onde um documento
sai. `baixarBlob` acendia a bolinha 4 do passo 3; o Jira acendia; o Google Docs acendia.
O `#go` chamava `doc.save()` direto do jsPDF, que não passa por porta nenhuma — quem
gerava **o PDF, a saída principal**, via o passo 3 dizer que nada tinha sido gerado.
Agora existe `registrarSaida()`, e todas as cinco saídas passam por ela.

### A varredura de uma hora de vídeo (o caminho do passo 2)

Ninguém tinha medido. `/tmp/longo.webm`, 60 minutos, 120 trocas de tela:

| medida | valor |
|---|---|
| tempo de parede | **32,7 s** (110× o tempo real) |
| telas encontradas | **120 de 120** |
| FPS da página durante a varredura | **59,2** — p50 16,8 ms, p95 20,4 ms |
| bloqueio do fio principal | **18 ms em 33 s (0,1%)**, pior 68 ms |
| as telas em memória | 1,1 MB (9,2 KB cada) |

O `seek` cede o fio como se supunha. Não há nada a consertar aqui.

### O que continua sem resposta, e o instrumento que foi junto

**Em qual degrau da escada do Whisper as máquinas reais caem** é coisa que só as máquinas
reais sabem — o modelo não sobe nesta máquina (a CDN não é alcançável daqui). Então o
instrumento viaja com elas: o Diagnóstico agora imprime, da última gravação,

```
  fio principal    : bloqueado 0 ms em 25 s (0.0%)   pior tarefa 0 ms   (nenhuma tarefa longa)
  transcrição      : desligada   motor: (não subiu)
```

e uma seção de **memória** com o peso dos quadros nesta aba e, onde a página está isolada
entre origens, `measureUserAgentSpecificMemory()` com a quebra por tipo — que é o número
que responde "quanto uma gravação de duas horas ocupa de verdade", incluindo worker,
WebAssembly e Blob. O bloqueio e o degrau saem **na mesma linha** de propósito: separados,
nenhum dos dois se interpreta.

É a mesma lição da sétima rodada, de novo: o instrumento tem que estar no botão que a
pessoa aperta quando algo dá errado.

### Os cabeçalhos não foram tocados

`Cross-Origin-Embedder-Policy: credentialless` continua como está. A proposta pedia
`require-corp`, que obrigaria cada recurso externo (jsPDF do CDN, arquivos do modelo,
figuras do blog) a mandar CORP. É regressão, não configuração — e, de brinde, é o
`credentialless` que faz o `measureUserAgentSpecificMemory` acima existir.

---

## 18/08/2026, décima primeira rodada — a transcrição: três já estavam feitas, uma estava mesmo quebrada

Avaliei quatro otimizações propostas para o consumo da transcrição. Três delas já
existiam no arquivo — e uma delas, do jeito proposto, seria **pior** do que o que
está lá. A quarta era real, e era um vazamento de verdade.

### 1. "Extrair o áudio direto em 16 kHz mono" — já é assim, e a proposta invertia a ordem

Os dois caminhos já pedem 16 kHz na criação do contexto: `decodeTo16k()` para o
arquivo e `new AudioContext({sampleRate: SR_ASR})` para a captura ao vivo.

A proposta era decodificar no padrão do navegador e reamostrar depois com
`OfflineAudioContext`. Isso **aloca o buffer grande e o pequeno**, com os dois
vivos no instante da conversão. Pedir 16 kHz na criação nunca aloca o grande.

Medido, com uma hora de vídeo com áudio estéreo a 48 kHz (`testes/audio.mjs`):

| medida | valor |
|---|---|
| áudio entregue ao modelo | 57.600.000 amostras = 60,0 min a 16 kHz |
| o buffer que fica | **219,7 MB** |
| … se fosse 48 kHz estéreo | 1.318,4 MB |
| pico do heap durante a extração | 445 MB |
| heap RETIDO depois da coleta | **224 MB** |
| tempo | 20,8 s (173× o tempo real) |

O corte de 80% que a proposta queria fazer já estava feito. Mas medir esse
caminho encontrou **dois defeitos de verdade nele**:

**A taxa era SUPOSTA.** `sampleRate` no construtor é um pedido, não uma ordem —
o Safari o ignorou por anos. Um navegador que o ignore devolve 48 kHz sem erro
nenhum. Com o navegador forçado a mentir, medido: uma hora de vídeo virava
**9.922 segundos** de áudio entregue ao modelo — a fala 2,8× mais lenta, e o
sintoma chegaria como "a transcrição veio errada", que manda procurar no lugar
errado. Agora a taxa é conferida, e a queda é reamostrar (que é exatamente o
código da proposta, no lugar onde ele serve: a exceção, não o caminho).

**A mistura jogava fora o canal do meio.** Ela somava o canal 0 e o 1. Num 5.1 a
fala mora no canal 2: o modelo receberia trilha e ambiente, sem o diálogo. Agora
soma todos — e soma no primeiro canal, no lugar, o que evita um terceiro array de
220 MB numa hora de vídeo.

### 2. Soltar a sessão do ONNX — era real, e eram três caminhos

`pipe = null` não solta nada. As sessões não vivem no heap JavaScript: vivem na
memória linear do WebAssembly e, no caminho da placa, na VRAM. O coletor de lixo
libera o objeto de duzentos bytes que apontava para duzentos e cinquenta
megabytes e considera o trabalho feito.

Três caminhos trocavam de pipeline sem soltar o anterior. Medido com a biblioteca
falsificada (`testes/modelo.mjs`), com o conserto desligado:

| gesto | modelos vivos antes | agora |
|---|---|---|
| trocar de modelo (small → base) | **2** | 1 |
| queda da placa para o processador | **2** | 1 |
| "apagar o modelo de voz baixado" | **2** | 0 |

O terceiro é o que mais incomoda: o botão apagava o cache **em disco** e dizia na
tela que tinha liberado, com o modelo inteiro ainda carregado.

E de caminho: **a caixa "usar a placa de vídeo" era enfeite**. A condição de
remontagem era `pipeId !== modelId`, então marcar ou desmarcar a caixa não fazia
nada até alguém trocar de modelo. Agora o dispositivo entra na identidade do
pipeline.

**O que NÃO foi feito, de propósito:** soltar ao fim de cada transcrição. Quem
transcreve três vídeos seguidos pagaria a montagem inteira três vezes, e montar é
o passo lento. A decisão certa depende de um número que esta máquina não tem — o
modelo não sobe aqui — e ele está no Diagnóstico, na quebra por tipo da memória.

Um detalhe que o conserto trouxe junto: soltar a sessão **por baixo de uma
inferência em curso** derruba a transcrição com uma linha de C++, e o gesto que
causa isso é inocente (clicar em "apagar o modelo" enquanto a barra anda). O
`soltarPipe` espera a janela em curso terminar.

### 3. "Limitar as linhas do WASM" — já está, e mais conservador que a proposta

`quantasLinhas()`: **1** quando a página não está isolada entre origens, e
`min(4, núcleos - 1)` quando está. A proposta pedia `min(4, núcleos / 2)`. A
diferença é de uma linha em máquina de oito núcleos, e o comentário que já estava
lá explica a escolha: a transcrição pode estar dividindo a máquina com uma captura
de tela acontecendo, e tomar todos os núcleos faria a captura engasgar.

`ort.env.wasm.simd = true` não foi acrescentado: a partir do onnxruntime-web 1.17
o SIMD é detectado sozinho e a opção não faz nada. Uma linha que não faz nada é
uma linha que alguém vai defender daqui a um ano.

### 4. "Forçar quantização q8/q4" — já está, e com um porquê que a proposta não tem

A escada já usa `dtype:'q8'` no processador e `q4` no decodificador da placa. A
proposta sugeria `quantized: true`, que é a API do transformers.js **v2**; a
biblioteca aqui é a 3.x, onde essa opção é ignorada em silêncio.

E o codificador na placa fica em `fp32` de propósito — está escrito no código:
as versões comprimidas produzem texto quebrado em parte das máquinas. Uma
otimização que faz o produto entregar texto errado não é uma otimização.

### O que continua sendo o dominante, e continua sem número

O modelo de voz. Ele não sobe nesta máquina, e nenhuma das quatro mudanças acima
o toca. O que existe hoje para responder é o instrumento: o Diagnóstico imprime o
bloqueio do fio principal junto do degrau em que o motor subiu, e a seção de
memória com `measureUserAgentSpecificMemory()` quebrada por tipo — que separa
WebAssembly de imagem e responde, numa máquina real, quanto o Whisper está
custando ali.

---

## 19/08/2026, décima segunda rodada — a espera, e o fluxo que ela obrigou a mexer

A queixa não era um número, era uma sensação: *"mais do que medição, pense no
UX"*. Então a medição aqui serve só para descrever o defeito, e o que foi feito
é desenho.

### O defeito, medido antes

Vídeo de uma hora, botão "Ambos". Aos **51 segundos** a transcrição já tinha
terminado e a varredura estava em 23:00 de 1:00:00 com **46 quadros guardados**.
A tela mostrava **zero**. Os 120 trechos transcritos também não estavam em lugar
nenhum: o campo só era escrito depois da última janela.

A ferramenta calculava em pedaços e revelava em bloco. É o que faz uma espera
parecer o dobro do que ela é — e neste produto fechar a aba significa perder o
trabalho.

### O que passou a acontecer

| | antes | agora |
|---|---|---|
| primeira miniatura na tela | no fim da varredura | **enquanto ela corre** |
| primeiro texto no campo | depois da última janela | **enquanto ela corre** |
| progresso com a página rolada | fora da tela | faixa fixa |
| gerar um PDF no meio | saía sem a fala, calado | **avisa antes** |

O campo fica somente-leitura enquanto enche e destrava no fim: um texto que se
desfaz enquanto se digita é pior que um campo vazio. `testes/espera.mjs` cobra os
cinco, e cobra o **instante** de cada um contra o instante do fim — um marco que
só acontece no fim é exatamente o defeito que isto removeu.

### O fluxo, que era o problema de verdade

Três botões onde a pessoa precisava escolher antes de saber o que queria, e os
ajustes na frente da ação. Agora:

- **a varredura começa sozinha** 1,5 s depois de o vídeo entrar — e qualquer
  toque nos ajustes CANCELA o agendamento. A ferramenta não disputa o volante
  com quem já está dirigindo, e nunca refaz o trabalho de ninguém;
- **dois botões**, não três: "Transcrever a fala" (que traz as telas que
  faltarem junto) e "Refazer as telas", que só existe quando há telas;
- **a ação antes dos ajustes**, com os ajustes sob um título próprio.

### Os dois defeitos que a mudança destapou

Mexer no caminho que 49 arquivos de teste percorrem cobra o preço na hora, e
cobrou:

1. **"Refazer as telas" esvaziava a lista e deixava as miniaturas antigas na
   tela** até o primeiro quadro novo chegar — segundos, num vídeo longo. Nesse
   intervalo os campos continuavam clicáveis. O `render()` passou a acontecer no
   mesmo gesto do `trocarQuadros([])`. Uma tela que mostra o que já foi jogado
   fora não é atraso de desenho: é mentira sobre o estado da ferramenta.
2. **A anotação era escrita em `frames[i]`, por índice.** Com a lista trocada por
   baixo, o índice apontava para o vazio: `Cannot set properties of undefined
   (setting 'nota')`, e a anotação sumia. Agora a escrita vai para o **objeto**
   do quadro. Se o quadro já saiu da lista, a escrita não faz nada — que é o
   certo para um campo que já não representa nada.

Os dois estão cobrados em `testes/grade.mjs`, e os dois foram conferidos
desligando o conserto: com ele desligado o arquivo falha em três afirmações e
imprime a mesma linha de erro que apareceu na regressão.

---

## 19/08/2026, décima terceira rodada — tirar coisas do caminho

Nove pedidos do Leandro, e o fio comum é o mesmo: **menos escolhas antes da
primeira ação.**

### Duas caixas saíram, e o comportamento ficou

| caixa | antes | agora |
|---|---|---|
| "Contar 3 antes de começar" | marcada, desligável | **sempre**, sem caixa |
| "Guardar as telas no meu computador enquanto gravo" | marcada, desligável | **padrão**, sem caixa |

Nenhuma das duas tinha um lado bom para desligar. Sem os três segundos, o
primeiro quadro é quase sempre o seletor de tela do navegador — a janela que a
pessoa acabou de fechar. Sem o espelho, um travamento aos 110 minutos apaga duas
horas; com ele, ficam alguns megabytes no disco até o documento sair.

O que sobreviveu de desligar: `espelhoQuer()` continua lendo a mesma chave, então
**quem tinha desligado continua desligado** — `espelho.mjs` cobra esse zero, e
ele é a diferença entre uma decisão respeitada e uma decisão revogada em silêncio
por uma atualização. E o botão "jogar fora" do passo 1 continua apagando na hora.
As páginas de privacidade e de segurança foram reescritas nos cinco idiomas: elas
descreviam uma caixa que não existe mais.

Os testes encurtam a contagem com `window.__contagem(1)`. É um **número**, não um
desvio: o laço que roda no teste é o mesmo que roda na máquina de quem grava.

### O passo 2: abriu, e emagreceu

Ele nascia fechado e cinza, e a pergunta que gerava era literal — *"ele só serve
para o vídeo?"*. Não serve: o modelo de voz, o idioma, a placa e a sensibilidade
valem igual para a gravação ao vivo, e numa gravação nunca existe "vídeo
carregado" antes de começar.

O que era parede não era o cartão, eram os **dezesseis controles**. Eles foram
para uma gaveta que abre num clique e **lembra** a escolha. Medido: **329 px de
controles fora do caminho**, e com a gaveta fechada a placa de vídeo não é
clicável — uma gaveta que só muda de cor e deixa tudo clicável por baixo não
guardou nada.

### O texto enchia fora da tela

A queixa: *"primeira miniatura e primeira fala não abriu durante a transcrição"*.
Medido, e o número é feio: o campo da transcrição só entrava no campo de visão
aos **137 880 ms** — depois de tudo terminado. `#tr` mora no passo 3, e quem
aperta "Transcrever a fala" está olhando para o passo 2. Enquanto as telas ainda
dependiam de um clique, o primeiro quadro empurrava a página para baixo e o campo
vinha junto **por acidente**; quando a varredura passou a acontecer sozinha, esse
empurrão passou a acontecer antes, e a transcrição ficou enchendo um campo
invisível.

| | antes | agora |
|---|---|---|
| campo da transcrição à vista | 137 880 ms (no fim) | **25 921 ms** (junto com a primeira fala) |

`espera.mjs` cobra isso agora, e a linha nova falha com o conserto desligado.

### A faixa do fim da página, maior

Ela tinha 9 px de respiro, texto de 13,5 e barra de 6 px — tamanho de rodapé,
para o trabalho de ser o **único** sinal de vida numa espera de vinte minutos com
a página rolada. Agora: 15 px de respiro, texto de 15,5, barra de 10 px por 240,
e borda superior na cor da marca. A folga do corpo subiu junto, de 52 para 76 px.

### "Termos do seu sistema" virou item de plano

Passou a ser do Personal e do Team, na tabela (`src/features.json`, de `fpt` para
`pt`), nos cartões dos cinco idiomas e **no código**: sem chave a linha não
aparece, pela mesma regra do logotipo do cliente. Uma tabela que promete
exclusividade enquanto o produto entrega de graça é uma contradição — só na
direção de que ninguém reclama.

Um efeito colateral que quase passou: **tirar hesitações é gratuito** e só era
aplicável pelo botão "Corrigir os termos", que agora é pago. Ela ganhou botão
próprio. `miudos.mjs` cobra as duas coisas na mesma respiração.

E "Tapar um dado" virou **"Tarjar um dado"**: o produto inteiro chama isto de
tarja — `aplicarTarjas`, "Terminar de tarjar", "Tirar as tarjas" — e só o botão
da lente dizia outra coisa.

### A pista rápida ficou rápida de novo

Cinco arquivos respondiam por dois terços do tempo do `rapido.sh app`, e nenhum
deles pergunta "isto ainda funciona?": `espera.mjs` roda uma hora de vídeo,
`espelho.mjs` grava quatro vezes, `memoria.mjs` e `pesagem.mjs` são réguas. Eles
foram para um grupo próprio.

| pista | antes | agora |
|---|---|---|
| `rapido.sh app` | ~9 min | **3 min 31 s** |
| `rapido.sh medir` | — | ~12 min, quando se mexe na mecânica |
| `rodar.sh` | ~20 min | igual — é o portão da entrega, e continua com tudo |

O teto real desta máquina são **2 CPUs**: dois testes de cada vez. Quem manda no
relógio é isso, não o número de arquivos — por isso a resposta foi tirar arquivos
da pista curta, e não tentar rodar mais em paralelo.

---

## 19/08/2026, décima quarta rodada — cinco ajustes de tela

### 1. O 0% que ficava parado

Entre "cliquei" e a primeira janela transcrita há um vão de dezenas de segundos —
extrair o áudio, montar o modelo — em que **não existe porcentagem para mostrar**.
A tela escrevia `0%` e ficava lá. *0% parado lê-se como travado, e não como
desconhecido*, e neste produto recarregar a página significa perder o trabalho.

O `prog()` passou a ter os mesmos três estados que o `progRec()` do passo 1 já
tinha — `null` some, `'?'` barra listrada andando, número é largura — e ganhou um
**relógio da espera**: a linha de status conta os segundos (`— 12 s, aguarde…`).
Ele sai de cima de quem chegar depois: se o texto na tela deixou de ser o que ele
escreveu, para sozinho. `espera.mjs` cobra que a barra listrada aparece **antes**
de haver qualquer porcentagem, e a linha falha com o conserto desligado.

### 2. Letras para as partes, números para os passos

O passo 3 numerava os subpassos 1, 2, 3, 4 — competindo com os passos 1, 2, 3, 4
da página. Viraram **a, b, c, d**. E o passo 1 ganhou as suas: **a** o cenário de
uso, **b** já tenho documento. Mesma bolinha, mesma ideia — uma parte de um passo.

### 3. Termos do seu sistema: voltou a ser grátis, e o que se vende é outra coisa

Revertida a trava da rodada anterior. **Aplicar** os termos é de todo mundo — é o
que faz a transcrição servir para quem trabalha com jargão de sistema, e é essa
pessoa que traz a ferramenta para dentro da empresa. O que o Personal e o Team
vendem é a lista ficar **gravada**: sobreviver à visita, à máquina e ao resto da
equipe. Cobrar pela conveniência é diferente de cobrar pelo acesso.

`features.json` ganhou duas linhas onde havia uma: a aplicação em `fpt`, o
"gravada" em `pt`. O botão próprio do **tirar hesitações** ficou — ele nasceu do
conserto errado, mas resolve um problema real: ela morava dentro da caixa de
vocabulário por vizinhança, e são coisas diferentes.

A marca do cliente e o logotipo continuam **só de plano**.

### 4. A caixa de compartilhar

Ela aparece no momento mais disputado da tela — logo depois de o documento sair,
competindo com onze botões de formato — e tinha 1px de linha cinza e 4% de tinta.
Sem cadastro, sem anúncio e sem rastreio, o único canal deste produto é uma
pessoa contando para outra: a caixa que faz isso acontecer não podia ser a mais
discreta da página. Contorno na cor da marca, faixa lateral de 5px, tinta ao
dobro, título de 14,5 para 16,5 e o botão de copiar deixou de ser fantasma.

---

## 19/08/2026, décima quinta rodada — o passo com várias telas, e o roteiro alheio

### O que estava errado no modelo

Um quadro era um passo. Isso não é como teste funciona: "preencher o cabeçalho
do pedido" precisa de três telas, e a pessoa escolhia entre dois erros — marcar
três quadros, e **uma** ação virar Passo 5, 6 e 7, cada um pedindo um título que
ela não tem; ou marcar um, e perder duas telas de prova.

Agora existe um nível entre o capítulo e o quadro. **Sem palavra nova:** o rótulo
que já existia — Passo, Momento, Trecho, editável — é o do nível de cima, e o que
entra por baixo são as telas dele. No documento sai um título e N imagens. Nada
de "sub-passo 3.1" em cinco idiomas vezes seis cenários.

### Duas decisões que valem mais que o código

**A bandeira é `junto`, e não `novoPasso`.** A ausência dela já quer dizer "um
quadro, um passo" — que é o comportamento de hoje e o que está guardado em todo
`.json` já entregue. Um documento antigo volta certo **sem conversão nenhuma**.
A bandeira inversa obrigaria a marcar 100% dos quadros existentes.

**A lista de passos é derivada, nunca guardada.** Guardá-la ao lado dos quadros
seria a segunda lista à mão que já custou caro aqui: descartar, mover, colar,
reabrir e juntar teriam que lembrar das duas.

### Os dois botões, e por que eu inverti o pedido

O pedido era "marcar tela" como principal e "passar o passo" como o que fecha.
Inverti: **marcar continua abrindo um passo**, e o segundo botão é o aditivo —
"+ mais uma tela deste passo". O motivo é uma regra, não gosto: *quem nunca
tocar no segundo botão tem que receber exatamente o que recebia ontem*. Com
"marcar" juntando telas, quem só marca sairia com um passo de quarenta imagens.

Os dois estão **também na janelinha**, e isso não é simetria: quem grava está
dentro do sistema que testa, não na nossa aba. Um botão que só existe na página
é um botão que não existe durante a gravação.

### O roteiro que a pessoa já tem (o "item A")

Do campo: numa implantação com 780 cenários, o documento com os passos escritos
**já chega pronto** — uma IA genérica gerou. Gerar mais um documento é competir
com um que já existe.

Então o roteiro entra como o subitem **c** do passo 1: uma linha, um passo, colado
ou de `.txt`/`.csv`. Cada "marcar" durante a gravação já sai com o título escrito.
É o encaixe feito **na hora da captura**, e não depois, adivinhando qual print vai
em qual passo. A numeração da lista dele (`1.`, `2.`) é descartada — o documento
numera sozinho, e numerar duas vezes é pior que não numerar.

Não lê `.docx`: o formato que sai de qualquer gerador é texto, e ler OOXML para
chegar ao mesmo lugar seria pagar caro pela mesma coisa.

### O que o teste pegou

**O `.json` não guardava a bandeira** — reabrir um documento agrupado devolvia
quarenta passos de uma tela, e o trabalho de agrupar se perdia no primeiro
salvamento.

E **eu declarei uma segunda `passos()` no mesmo arquivo.** Duas declarações de
função no mesmo escopo não brigam: a segunda apaga a primeira em silêncio. A
função que travava os cartões deixou de existir, o passo 4 parou de travar, e o
console não disse nada. Quem pegou foi o `passos.mjs`. O comentário no lugar do
crime agora avisa o próximo.

### A afirmação que mais importa

`passomulti.mjs` cobra que **os formatos não se contradizem**. Agrupar no HTML e
esquecer o PDF faria a mesma imagem ser o "Passo 3" num arquivo e o "Passo 5" no
outro, dentro do mesmo `.zip`. Todos os dez passaram a ler a mesma régua —
`linhasDoDoc` para HTML/Markdown/planilha, `reguaDePassos` para PDF, Word,
PowerPoint, o índice do `.zip` e a lista da revisão.

Medido no documento de exemplo: 5 imagens, **2 títulos de passo**, 3 blocos de
continuação, e a planilha dizendo `2` na última imagem — que é a quinta da lista.

### Os dois ajustes da mesma rodada

**"Cortar as bordas" desenhava um retângulo.** O caminho: abrir "Apontar na
imagem" (que já entra com o retângulo escolhido) e depois clicar em cortar. O
botão do corte desligava a tarja e **esquecia o destaque**, e o `pointerdown`
testa `marcando()` primeiro. A causa não era esquecimento, era o desenho: cada
botão desligava à mão a lista dos outros dois. Agora há um lugar só — `soEste()`.
Medido com o conserto desligado: largura 900 → 900 (não cortou) e um retângulo
desenhado no lugar.

**As bolinhas a, b, c** ficaram ocas — fundo lavado, letra na cor da marca,
contorno fino. Cheias, eram idênticas à bolinha numerada do cartão, e duas coisas
iguais na tela lêem-se como do mesmo nível. Concluído continua verde e cheio:
terminar um subpasso é uma afirmação, e afirmação lavada não afirma nada.

---

## 19/08/2026, décima sexta rodada — quatro consertos vindos do uso

### 1. "O que aconteceu aqui" saiu

Era a caixa de comentário AO VIVO, no cartão e na janelinha. O relato foi
direto: confusa, e não ajuda. **Concordo**, e o motivo é o mesmo que separou os
dois botões de captura — quem grava está olhando para o sistema que testa, não
para nós. Escrever às cegas, num campo de uma linha, sobre uma imagem que não se
está vendo, é a pior hora possível para descrever qualquer coisa. E com dois
botões de captura, *"sobre qual tela eu estou escrevendo"* virou uma pergunta a
mais no pior momento.

**O que se perde, e vale estar escrito:** anotar no calor do momento. O que fica
é melhor — na revisão e na lente a anotação é escrita com a imagem grande na
frente, e o roteiro colado no passo 1 já entrega o título sem ninguém digitar.

Um detalhe que quase escapou: o comentário ao vivo era **quem escrevia a
anotação no espelho do disco**. Sem substituir isso, anotar quarenta passos na
revisão e perder a aba levaria as quarenta junto — e é justamente depois de
parar que a pessoa passa meia hora anotando. Agora o campo da grade e o da lente
escrevem no espelho.

### 2. O botão errado acendia

Apertar "mais uma tela" acendia o **"marcar"**, e quem apertou concluía que tinha
clicado errado. A causa: qualquer aviso acendia sempre o primeiro botão. Agora o
aviso sabe quem o causou. Um retorno visual que mente sobre o próprio gesto é
pior do que retorno nenhum.

E o rótulo perdeu a duplicação: `+ mais uma tela` → **"Mais uma tela deste
passo"**.

### 3. Fixar um quadro

Os três botões de limpeza — repetidos, sem fala, só os marcados — jogam quadros
fora em lote, e não havia como salvar um do lote. O relato é o caso exato:
"descartar repetidos" levava junto a tela que a pessoa queria, e ela desfazia
tudo com "manter todos" para recomeçar à mão.

`fixo` é passivo: um quadro fixado **nunca é descartado por uma ação em lote**,
e continua podendo ser descartado com um clique na própria miniatura. Fixar
protege do automático, não da pessoa — uma trava que a própria dona não abre é
armadilha, não proteção.

Dois detalhes que valem: o fixado **não vira a nova referência** do detector de
repetidos (senão proteger um mexeria no destino dos vizinhos), e ele ganha selo
na miniatura — sem isso, "manter sempre" seria uma promessa invisível.

Medido: cinco quadros, dois marcados como repetidos, um deles fixado. Depois de
"descartar repetidos": `[true,true,false,true,true]` — o solto caiu, o fixado
ficou.

### 4. Cortar só ESTA tela

O recorte era um só para todos os quadros. Um pop-up no canto de uma tela
obrigava a destruir 39 quadros para consertar 1, e "desfazer o corte" devolvia os
40 juntos. Agora são dois botões, e a área de um quadro mora **nele**, não no
recorte geral — cortar uma tela não redefine a área das outras.

Medido: `[900,900,900,900,900]` → `[900,450,900,900,900]`, e desfazer devolve.

### A regressão

Inteira, 108 arquivos. Três falharam, e as três eram expectativas de teste
desatualizadas pelas decisões já tomadas — `ux.mjs` contava três caixas de opção
onde agora há duas, `tapado.mjs` esperava o cartão 2 fechado, `espelho.mjs`
escrevia no campo de comentário que saiu. As três reescritas e verdes; nenhuma
linha de produto mudou depois da corrida.

### O corte que deformava as outras — e o defeito era mais velho

Relato com um PDF de 13 telas: cortar a **primeira** esticou as outras doze.

A causa está uma linha acima do que parece. O PDF lia a proporção de
`kept[0].img` **uma vez** e desenhava todas as imagens com ela. Recortar o
primeiro quadro mudava a proporção dele, e as outras doze passavam a ser
desenhadas numa caixa com o formato do primeiro.

**Ele é mais velho que o corte por quadro; o corte só o destapou.** Ele já
disparava com "colar uma tela": qualquer imagem anexada de fora com outra
proporção — um print de celular, um recorte — deformava o documento inteiro. O
Word já fazia certo (`medidaImagem` mede imagem por imagem); era só o PDF que
perguntava uma vez e respondia sempre a mesma coisa, nos dois layouts.

Medido, com a primeira tela cortada:

| | razão de cada caixa desenhada |
|---|---|
| antes | `[1.125, 1.125, 1.125, 1.125, 1.125]` |
| agora | `[1.125, 0.562, 0.562, 0.562, 0.562]` |

**A régua embrulha o CONSTRUTOR, e não o protótipo.** A primeira versão do teste
remendava `jsPDF.prototype.addImage` e passava com a lista vazia — o jsPDF
instala os métodos de desenho na INSTÂNCIA, e o remendo ficava num protótipo que
ninguém consulta. Um teste que mede nada é pior do que teste nenhum: ele diz que
está tudo bem.

---

## 19/08/2026, décima sétima rodada — a velocidade do áudio, e onde ela estava mesmo

A queixa voltou: *"ainda estou com muitos problemas na velocidade do áudio"*. A
décima primeira rodada tinha respondido que o dominante é o modelo e que as
quatro otimizações propostas já estavam feitas — o que era verdade e não
resolveu nada para quem espera. Então esta rodada não avaliou propostas: mediu o
caminho, e o que apareceu foram três coisas, nenhuma delas o modelo.

A régua é nova e entra na regressão: **`testes/plano.mjs`**. Ela grava a própria
amostra — uma reunião de 150 s em `.webm`/Opus a 48 kHz estéreo, com fala e
pausa, porque o que precisa estar lá é justamente o que um `sine` do ffmpeg não
tem — e roda o passo 2 inteiro contra um modelo falsificado que cobra um preço
fixo por janela. O que ela mede é o **nosso** caminho.

### 1. A peneira de silêncio não pula nada numa reunião

Ela existe desde a terceira proposta da décima primeira rodada e o raciocínio
está certo: o Whisper processa sempre trinta segundos, com ou sem fala dentro,
então uma janela muda custa o mesmo que uma cheia e não deve ser mandada.

O que ninguém tinha medido é **quantas vezes ela dispara**. Com uma reunião
sintética no formato de uma de verdade — frases de 3 a 8 s, pausas de 0,3 a 2 s
entre elas, uma pausa longa de vez em quando:

| gravação | janelas de 30 s | puladas pela peneira | ao modelo |
|---|---|---|---|
| 10 min, 29% parada | 20 | **0** | 20 |
| 40 min, 28% parada | 80 | **0** | 80 |

Zero. E não é defeito da regra, é do **tamanho do que ela mede**: a peneira
exige trinta segundos seguidos com menos de 200 ms de voz, e o silêncio de uma
reunião não vem assim. Ele vem em pedaços de um ou dois segundos, espalhados
entre as frases. A peneira acerta o caso raro — a gravação esquecida ligada — e
não toca no caso comum, que é o de todo mundo.

### 2. O que economiza é não mandar o silêncio, e não pular a janela muda

`planoDeJanelas()` junta os trechos com fala e os empacota em janelas cheias. A
mesma fala, menos janelas. Medido sobre áudio com a fala em posições conhecidas
(8 min, 54 frases):

| | valor |
|---|---|
| janelas retas | 16 |
| janelas compactadas | **12** — 25% menos inferência |
| silêncio deixado de fora | 2,3 min |
| frases perdidas | **0** |
| erro do mapa de volta | **0,000 ms** |

E no caminho de verdade, com a gravação de 150 s decodificada pelo
`decodeTo16k`: 5 janelas retas → **4**, com 55,8 s de silêncio fora.

**As duas coisas que a tornam segura**, e que estão no código como estão aqui:

- **nenhuma fala se perde.** Cada trecho leva 0,30 s de margem antes e 0,40 s
  depois, e dois trechos a menos de 0,60 s de distância continuam juntos — uma
  pausa curta é parte da frase, e cortar nela entrega ao modelo pedaços sem
  contexto, que é como nascem as invenções que a `semGagueira` limpa depois. A
  régua confere frase por frase que o meio de cada uma está dentro de alguma
  janela;
- **a minutagem continua sendo a da gravação.** Sem o mapa de volta, os tempos
  da legenda seriam os do áudio encolhido e a evidência apontaria para o minuto
  errado — que é um estrago maior do que ser lenta. Na gravação de 150 s o
  último tempo da legenda sai em **145,8 s**, sobre 94,2 s de áudio compactado.

E ela só entra **quando ganha**: menos de 10% de economia não paga o risco de
emendar trechos, e aí as janelas seguem inteiras, como sempre foram. Numa
gravação de fala contínua a compactação simplesmente não acontece.

### 3. O modelo era montado DUAS VEZES

Este é o que mais custava, e não estava na lista de ninguém.

`adiantarModelo()` começa a baixar o modelo no instante em que a caixa
"transcrever ao vivo" é marcada — o conserto da décima segunda rodada, e ele é
bom. O clique em Gravar espera essa promessa. **O passo 2 não esperava.** Ele
perguntava `pipeServe()`, ouvia "não" — porque `pipe` só é atribuído no FIM da
montagem — e começava uma segunda, do zero, com a primeira ainda correndo.

Medido, com o conserto desligado: **duas montagens vivas ao mesmo tempo**,
começando com 1,5 s de diferença. Numa máquina de verdade isso é o download
inteiro duas vezes e dois modelos residentes.

E havia um segundo caminho para o mesmo estrago, mais velho e mais grave, que a
`testes/modelo.mjs` já pegava **antes desta rodada**: `trocarPipe` era chamado
de quatro lugares e nada impedia dois deles de correrem juntos. Quando isso
acontece, cada um chama `soltarPipe()` enquanto `pipe` ainda é nulo, não solta
nada, monta o seu, e o último a terminar escreve por cima do outro — deixando um
modelo residente que ninguém mais sabe soltar. O mesmo vazamento que a décima
primeira rodada fechou, por outra porta.

| `testes/modelo.mjs` | corridas com dois modelos vivos |
|---|---|
| antes (na versão publicada) | **1 em 3** |
| agora | 0 em 7 |

Um defeito de corrida que aparece em parte das vezes e some nas outras é o que
não se conserta olhando: conserta-se **tirando a corrida do desenho**. Agora a
montagem em curso é esperada, e não duplicada; um alvo diferente entra na fila
atrás dela e pergunta de novo, ao chegar a sua vez, se ainda precisa montar.

### 4. A extração do áudio e a montagem do modelo correm juntas

Elas estavam em série: extrair o áudio, e **só então** montar o modelo. Os dois
são longos — a extração de uma hora de vídeo levou 20,8 s na medição da décima
primeira rodada, e a montagem vai de segundos (em cache) a um minuto (baixando)
— e nenhum precisa do outro. Um é o decodificador de áudio do navegador; o outro
é rede e compilação de WebAssembly. Somá-los era cobrar duas esperas por uma.

É a mesma conta que já valia para a varredura de quadros, que roda junto com a
transcrição desde a décima segunda rodada: trabalhos que não disputam nada
correm juntos, e o custo é o maior dos dois, não a soma.

Medido (ms desde o clique em "transcrever a fala"):

| | montagem começa | áudio termina |
|---|---|---|
| antes | depois do áudio | — |
| agora | **565 ms** | 1.889 ms |

O aviso na tela passou a ser o da **montagem** quando ela existe, e não o da
extração: entre "extraindo o áudio" e "baixando 77 MB", quem espera precisa ver
o que explica a espera.

### O que NÃO foi feito, e por quê

**Mandar várias janelas ao modelo de uma vez (`batch`).** É a otimização
seguinte da lista e pode valer bastante no caminho da placa. Não entrou porque
o ganho depende de uma medição que esta máquina não pode fazer — o modelo não
sobe aqui — e porque ela custa o que esta rodada mais protegeu: o texto que
aparece enquanto sai, a troca de modo entre uma janela e outra, e a previsão
que se corrige a cada janela. Trocar isso por um número que ninguém mediu seria
a mesma inversão de ordem da décima primeira rodada.

**Desligar `return_timestamps`.** Ele custa tokens de decodificação, e é o que
faz a legenda ter minutagem por frase em vez de por janela de trinta segundos.
Numa ferramenta de evidência, essa é a coisa errada de trocar por velocidade.

### O que continua sendo o dominante

O modelo, como na décima primeira rodada. O que mudou é que agora ele é montado
uma vez em vez de duas, começa a montar enquanto o áudio é extraído, e recebe um
quarto a menos de janelas numa reunião com pausas. Nada disso o acelera — apenas
para de pagá-lo mais vezes do que o necessário.

---

## 20/08/2026, décima sétima rodada — o diagnóstico que não chegava

O relato: *"o botão de diagnóstico, ou ele na abertura de um problema, não está
ativo"*. Ele estava — tinha deixado de ser botão e virado o anexo do recado, o
que foi uma boa decisão e continua sendo. O que **não** estava ativo era o
anexo, e isso não se via na tela: via-se no banco.

### O defeito, medido em produção

A coleta é assíncrona. Com a rede boa ela leva **1 s**; com a rede ruim — que é
a máquina de quem está reclamando — passou de **10 s** na medição. Durante essa
janela, o campo do relatório mostra a mensagem de espera, dentro de um
`<details>` fechado, com a caixa "mandar o relatório técnico" já marcada.

E o botão Enviar **não esperava a coleta**: ele lia o elemento da tela e
mandava o que estivesse lá. Quem descrevia o problema depressa e apertava
enviar mandava o texto de espera no lugar do relatório.

No banco de produção, `walkstamp.recado`:

| origem | recados | com relatório de verdade | menor relatório |
|---|---|---|---|
| app | 2 | **0** | 1 caractere |
| site | 3 | 2 | 0 |

O chamado **WS-0005** chegou com `diagnostico = "…"`. Um caractere — a
reticência da mensagem "montando o relatório…". Dos dois chamados abertos pela
ferramenta, nenhum trouxe a única parte que quem abre o chamado não sabe
escrever.

Medido com o conserto desligado, na régua `testes/diagchamado.mjs`: o recado
partia em **59 ms** levando 21 caracteres — `Montando o relatório…`. Com o
conserto: espera **10,3 s** e leva **1.969 caracteres**, o relatório inteiro.

**A espera é o preço de uma promessa, e não uma trava.** Com a caixa
desmarcada, o recado sai em 53 ms e sem relatório nenhum — medido na mesma
régua, porque um conserto que faz todo mundo esperar por causa de uma caixa que
alguns desmarcam seria trocar um defeito por outro.

### O botão, de volta — e onde ele foi procurado

Ele voltou a existir em dois lugares, e nos dois pelo mesmo motivo: **é onde os
chamados moram** que se procura o diagnóstico.

**Na ferramenta**, no painel "meus chamados": coleta, mostra o relatório ali
para ler e copiar, e só então oferece *abrir chamado com este relatório* — que
reaproveita o que acabou de ser coletado em vez de refazer a espera na frente
de quem já esperou uma vez.

**No painel da conta** (`/conta/chamados`), que até aqui só LISTAVA e mandava a
pessoa "abrir um no rodapé da ferramenta". Agora abre. O formulário vem antes
da lista — quem chega ali com um problema quer contar o problema, e a lista
nasce vazia justamente para quem mais precisa do formulário.

Uma diferença que está escrita na tela, e não escondida: o relatório do painel
descreve **o navegador daquela página** — versão, placa de vídeo, espaço em
disco e se o modelo de voz é alcançável dali. Quadros na memória, degraus do
modelo e ritmo da transcrição vivem dentro da ferramenta e não existem ali. É
por isso que o botão está nos dois lugares, e não só no mais novo.

E o e-mail do chamado aberto pelo painel vem **da sessão**, nunca do
formulário. Na ferramenta ele é digitado, e um chamado com o e-mail errado é um
chamado que nunca volta para quem o abriu.

### Um relatório guardado, com idade

O coletor é chamado de três lugares e produz o mesmo relatório. Ele agora fica
guardado por **90 segundos** — curto de propósito: um relatório de dois minutos
atrás descreve outra máquina se uma gravação aconteceu no meio, e um relatório
velho é pior que nenhum, porque parece atual.

---

## 20/08/2026, décima oitava rodada — a transcrição que já existe, e a faixa que piscava

Quatro pedidos vindos do uso, e um deles muda o custo do produto inteiro.

### 1. A transcrição do Meet não entrava — e o defeito era o parser, não a falta de botão

Quem sai de uma reunião do Google Meet, do Teams ou do Zoom **já tem a
transcrição pronta**, feita no servidor deles, sem custo nenhum aqui.
Transcrever de novo custa 206 MB de download e minutos de máquina para produzir
um texto **pior** — o modelo daqui é o `base` e não sabe quem falou.

O caminho existia: havia um botão "abrir legenda pronta". Ele não funcionava
para reunião, e não por causa do botão. O Meet — e as "Anotações do Gemini" que
saem dele — escreve **um tempo por BLOCO**, sozinho na linha, com as falas
embaixo:

```
00:02:04

LUCINELIA GONCALVES DA SILVA: na nas reuniões…
LEANDRO OLIVEIRA: Tá bom. Tira aí do
```

O `parseTranscript` pedia tempo e texto **na mesma linha**. Diante deste arquivo
ele achava zero marcações e caía no caminho "texto solto". O sintoma não é um
erro na tela: é um documento em que **a fala não acompanha as telas** — que é
exatamente o que esta ferramenta existe para fazer.

Medido contra os dois arquivos reais de uma reunião de quarenta minutos:

| | antes | agora |
|---|---|---|
| trechos com minutagem | **0** | **521** |
| primeiro / último | — | 00:02:04 → 00:40:52 |
| fora de ordem | — | 0 |

E os dois arquivos dão o mesmo resultado — a aba de transcrição sozinha e o
arquivo inteiro com Resumo, Decisões e Próximas etapas. O cabeçalho e as
seções de notas ficam de fora sozinhos, porque vêm **antes do primeiro tempo** e
não há onde pendurá-los.

**O `.docx` é lido no navegador, sem biblioteca.** Um `.docx` é um `.zip` com um
XML dentro, e o navegador já sabe as duas partes: `DecompressionStream
('deflate-raw')` é o mesmo algoritmo do zip, e o índice são vinte linhas de
leitura. Uma biblioteca aqui seria mais um endereço de CDN para cair — e este
arquivo funciona de `file://`, onde CDN nenhum existe.

**A minutagem por bloco é ESTIMADA, e a tela diz isso.** Um bloco carrega um
instante e várias falas; elas são distribuídas pelo tamanho do texto — quem
fala mais ocupa mais tempo. É melhor que empilhar seis falas no mesmo segundo,
que teria cara de precisão. Uma estimativa que se apresenta como medida é a
única coisa aqui pior do que não ter minutagem.

O botão subiu para **antes do quadro de texto**, com nome próprio: quem chega
com a reunião já transcrita lia o quadro vazio, concluía que precisava
transcrever aqui, e pagava os 206 MB por um texto que já estava pronto.

### 2. A faixa aparecia e sumia sozinha

O relato: *"a faixa avisando que a transcrição está sendo realizada some,
aparece e some"*.

A causa não estava na faixa. `ocupado` era um **booleano**, e isso bastava
enquanto houvesse um trabalho por vez. Não há mais: a varredura dos quadros
corre junto da transcrição de propósito, e a montagem do modelo começa junto da
extração do áudio. **O primeiro a terminar apagava o estado do outro.** Numa
varredura de dez segundos ao lado de uma transcrição de quarenta minutos, a
faixa vivia dez segundos.

O estrago maior não é a faixa: é o `beforeunload`. Com `ocupado` falso, **a aba
fecha sem avisar** no meio da transcrição — a única coisa nesta ferramenta que
não dá para refazer sem pagar o tempo de novo.

Medido em `testes/faixa.mjs`, com o booleano de antes:

| | amostras com a transcrição correndo | e a faixa fora da tela |
|---|---|---|
| antes | 33 | **8** |
| agora | 33 | 0 |

Um **conjunto de nomes** no lugar do booleano. É idempotente — ligar duas vezes
é ligar uma, desligar quem não estava ligado não faz nada — e por isso é mais
seguro que um contador, onde um `false` sem par derruba o trabalho alheio.

### 3. "Começar outro documento" morava depois do rodapé

Abaixo dos links de preços, termos e privacidade, fora da coluna de trabalho.
Quem termina o documento para de ler no fim do passo 4; o que vem depois do
rodapé é o fim da **página**, não o fim da tarefa, e ninguém rola por cima de
dezesseis links institucionais procurando o botão de recomeçar. Agora ele fica
logo depois do passo 4.

### 4. A opção que conta o caminho curto antes da espera

No passo 1, ao lado de "transcrever enquanto gravo", entrou **"usar transcrição
do Google Meet, Zoom ou Teams"** — recomendada e **desmarcada**.

Não é contradição: a recomendação é para quem tem o arquivo, e quem não tem não
pode ser levado a desmarcar a transcrição automática por engano. Marcar não faz
nada sozinho — leva ao passo 3, onde o arquivo entra — e **desliga a outra
caixa**, porque baixar 206 MB para não usar é o desperdício que esta opção
existe para evitar.

---

## 20/08/2026, décima nona rodada — uma moldura só, e a regra que a quebrava

O relato: *"o menu da ferramenta fica deslocado dos demais, ele aloca o logo um
pouco mais para a direita… a ideia é que o cabeçalho e o rodapé não tenham
alteração independente da página"*.

### O número, antes

Medido a 1440 de largura, nas três telas:

| | logo em x | cabeçalho | rodapé | menu |
|---|---|---|---|---|
| página principal | 272 | 940 | 940 | Como funciona · Comparativo · Preços · **[Ferramenta]** |
| painel da conta | 272 | 940 | 940 | **[Abrir a ferramenta]** |
| **ferramenta** | **356** | **1240** | **1240** | **[Minha conta]** |

84 pixels de diferença, e três menus diferentes na mesma marca.

### A causa não estava no cabeçalho da ferramenta

Estava numa regra escrita para outra coisa:

```css
body.comBarra .wrap{display:grid;grid-template-columns:206px minmax(0,1fr);…;max-width:1240px}
```

Ela monta a grade de duas colunas da barra da conta, e foi escrita pensando na
`.wrap` do trabalho. Mas `.wrap` é também a do cabeçalho **e** a do rodapé. Um
seletor de classe nua alcança tudo o que ainda não foi escrito — e o efeito era
mais fundo do que uma largura: o cabeçalho virava GRADE, o `.topbar` caía na
segunda coluna, e a marca começava em x=508 depois que a largura foi corrigida.

É a mesma lição que o `.painelMenu` do site já tinha aprendido com o `nav` nu, e
a terceira vez que este projeto a paga. A `.wrap` do corpo ganhou nome — `.wrap
.corpo` — e a grade passou a falar só com ela.

### O que passou a valer

`--maxTopo` é UM número, e ele vale para o cabeçalho e para o rodapé das três
telas. O corpo continua com a medida de cada uma — 940 no site, que tem texto
corrido; 1240 na ferramenta, que tem grade de miniaturas; 1220 na conta, que tem
tabela. Isso é legítimo: **é a moldura que não pode mudar, não o quadro.** A
conta já resolvia assim, com cabeçalho de 940 sobre corpo de 1220.

Medido depois, pela régua nova `testes/cabecalho.mjs`:

| | logo em x | nav termina em | cabeçalho | rodapé |
|---|---|---|---|---|
| página principal | 272 | 1168 | 940 | 940 |
| ferramenta | 272 | 1168 | 940 | 940 |
| painel da conta | 272 | 1168 | 940 | 940 |

### O menu, um só — e o Blog nele

As três telas passaram a ter os mesmos quatro itens, na mesma ordem e com as
mesmas quebras (`hide-sm`, `hide-xs`): **Como funciona · Comparativo · Preços ·
Blog**, e então o botão de ação — o único item cujo destino depende de onde a
pessoa está (no site e na conta ele leva à ferramenta; na ferramenta, à conta).

O **Blog** entrou, e antes do botão: ele existia só no rodapé, que é onde se
procura o que já se sabe que existe. Um blog no rodapé não é lido por quem ainda
não sabe que há o que ler. E vem antes da ação porque o botão é o fim do
caminho — o que vem depois dele não é lido.

Na ferramenta, os rótulos vêm do dicionário do **site** e os endereços do
`ROTAS_SITE`, pelo mesmo caminho que o rodapé já usava. Conferido em alemão, que
é o caso que pega o defeito: `Preise → /de/preise`, `Vergleich → /de/vergleich`.
Escritos à mão lá dentro, seriam a enésima cópia — e a cópia que existia tinha
quatro das dezesseis páginas, todas apontando para o português.

### Por que uma régua nova

Nenhum teste de conteúdo pega isto: cada página, sozinha, estava perfeita. O
defeito só existe na COMPARAÇÃO entre elas, e por isso a régua abre as três na
mesma janela e mede a mesma coisa nas três.

---

## 20/08/2026, vigésima rodada — os nove itens de ranqueamento

Uma lista pronta, por retorno sobre esforço. O que segue é o que cada um era
antes, o que virou, e o que foi medido — porque **nada disto aparece na tela**,
e é por isso que tudo aqui ganhou régua: quando quebra, ninguém vê. O sintoma
chega meses depois como "o post não indexou", sem nada na página que indique o
quê.

### 1 e 3. O sitemap: os posts não estavam lá, e nada tinha `lastmod`

`/sitemap.xml` era um arquivo escrito pelo `build.py`. Isso bastava enquanto o
site fosse só páginas fixas — elas mudam no deploy, e o arquivo nasce no deploy.
O blog quebrou a conta: **um post publicado pelo painel ficava fora do mapa até
a próxima subida de código**, que pode ser semanas.

Agora `/sitemap.xml` é um **índice** e aponta para dois mapas com cadências
diferentes: `sitemap-paginas.xml`, que continua nascendo no build e sendo lido
do disco por quatro testes; e `sitemap-blog.xml`, lido do banco a cada rastreio.

O `lastmod` do post é o **`atualizado_em`**, e não o `publicado_em`: a pergunta
que ele responde é "mudou?", não "nasceu quando?". As páginas fixas levam a data
do build, que é literalmente quando elas mudaram.

Um detalhe que não dá erro e estraga tudo: um arquivo `public/sitemap.xml`
**sombreia** a rota — no Next o estático ganha. Por isso o nome mudou em vez de
o índice ter outro, e o `build.py` apaga o antigo se ele existir.

### 2. Dados estruturados — o único item que muda COMO o resultado aparece

| onde | o quê |
|---|---|
| home | `SoftwareApplication` + `Organization` |
| base de conhecimento | `FAQPage` com **45 perguntas** + trilha |
| post | `Article` + `Organization` (publicador) + `BreadcrumbList` |
| autor | `ProfilePage` |
| demais páginas | `BreadcrumbList` + `Organization` |

O FAQ é **lido do corpo da página**, pergunta por pergunta, dos `<details>` que
já estavam lá. Escrevê-lo de novo seria a segunda lista ao lado da lista de
verdade — e aqui a divergência seria pior que invisível: marcação de FAQ que não
corresponde ao texto visível é motivo de punição, e com razão. A régua confere
que a primeira pergunta do JSON-LD está mesmo escrita na página.

### 4. Todo rastreio batia no Supabase — e a primeira correção trouxe outro defeito

O item pedia trocar `force-dynamic` por `revalidate`. A primeira versão fez
exatamente isso, e o `testes/blog.mjs` caiu: com `revalidate`, o Next monta a
página **no build**, e num build sem banco — uma prévia, um deploy com o
Supabase fora do ar — o blog nasce **vazio** e serve 200 com uma lista que não
existe por cinco minutos. Um índice vazio servido a um rastreador é pior que um
índice lento: ele ensina que não há nada ali.

O que custava não era montar a página; era a **consulta**. Então o cache mudou
de lugar: `fetchCache: 'default-cache'` guarda a LEITURA por cinco minutos, e a
página continua sendo montada a cada pedido, sempre com o que existe agora.

Medido em `testes/seo.mjs`: **três visitas seguidas → 0 consultas ao banco.**

E publicar revalida os endereços públicos — com uma armadilha achada no
caminho: `revalidatePath('/blog')` **não limpa nada**. O endereço público é
`/blog`, mas por dentro a rota é `/pt/blog`, e o `revalidatePath` fala com o
roteador, que só conhece o de dentro. Em silêncio, como sempre.

### 5. O artigo linkava o próprio blog e o rodapé

`ligarTermos` acrescenta, ao corpo já convertido, **um link por página de
caso** — na primeira vez que o termo aparece e só ali. Quatro travas, e cada uma
existe por um motivo: uma vez por destino (cinco links iguais valem menos que
um, e são padrão de manipulação); nunca dentro de `<a>`, `<code>` ou `<pre>`;
nunca dentro de etiqueta (casar `alt="ata de reunião"` quebraria a imagem); e o
termo mais longo primeiro, senão "teste" venceria dentro de "evidência de
teste".

Um defeito meu, achado antes de sair: comparar sem acento com
`normalize('NFD')` muda o TAMANHO da string, e o índice achado apontava para o
lugar errado no texto original — a âncora sairia cortando palavra no meio, num
idioma com acento a cada duas linhas. `planificar()` troca caractere a caractere
e só quando a troca cabe em um; a igualdade de comprimento virou trava.

### 6 a 9. Feed, Open Graph, etiquetas e autor

**RSS por idioma**, com `dc:creator`, `category` e `rel="self"`. Um feed
misturado é um feed que se cancela: quem assina o alemão não quer português. O
corpo vai como **resumo**, e não inteiro — mandar o artigo completo faz o leitor
de feed virar o destino final.

**`modifiedTime` e `author`** no Open Graph, e **`x-default`** no `hreflang` do
post — apontando para o inglês *quando ele existe*, e para o próprio post quando
não: mandar para um idioma que aquele post não tem repetiria o 404 que o resto
do `hreflang` evita.

**`/blog/tag/...` e `/blog/autor/...`.** O modelo guardava `tags: string[]` e
`autor` desde sempre, e nenhum dos dois virava nada. A chave é normalizada —
"Evidência" e "evidencia" são a mesma etiqueta, e duas páginas para a mesma
coisa competiriam entre si, que é o defeito que o `canonical` existe para
evitar, criado por nós. E **etiqueta sem posts sai do índice**: uma página fina
que responde 200 e não tem conteúdo enche o site de endereços que não servem a
ninguém.

Um detalhe que fazia as duas responderem 404: a ponte `/blog/:slug` casa com UM
segmento, e `/blog/tag/evidencia` tem dois. Uma página que existe por dentro e
não tem ponte é uma página que não existe.
