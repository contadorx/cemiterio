# Sequência de builds — Walkstamp

**Aberto em:** 20/08/2026
**Origem:** a auditoria de usabilidade e código e a proposta de redesenho de UX, medidas
contra o código em 20/08.

Cada build abaixo é **entregável sozinho**: sai com zip, régua verde e um ganho que a pessoa
percebe. Nenhum depende do seguinte. A ordem é por (risco removido × valor) ÷ custo — e não
pela ordem em que os documentos os listaram.

---

## As três decisões que moldam a sequência

**1. Português primeiro, com queda para o português.** Sete dias de uso real:

| idioma | abriu | carregou vídeo | baixou documento |
|---|---:|---:|---:|
| pt | 361 | 153 | **71** |
| en | 48 | 3 | **0** |
| es | 7 | 0 | **0** |
| de | 0 | 0 | **0** |
| fr | 0 | 0 | **0** |

91% dos eventos são pt, dois idiomas não têm um único registro, e nenhum documento saiu fora
do português. Chave nova nasce escrita em pt e **copiada** para os outros quatro: `chaves.mjs`
continua verde, nenhuma tela mostra vazio, e traduzir depois é trocar string — não caçar o que
falta. Isso tira quase todo o custo "×5 idiomas" das estimativas.

Vale só para a ferramenta (`I18N` no `src/template.html`). No site, `build.py` faz `return 1`
se faltar chave em qualquer idioma — lá não existe pt-first.

**2. O aditivo vem antes do reflow.** Builds 1 a 6 criam estado novo sem mexer na hierarquia da
página; 7 a 9 remexem. Isso importa porque **69 dos 125 testes afirmam visibilidade ou ordem** e
são eles que cobram o reflow. Fazer o aditivo primeiro entrega valor sem pagar essa conta, e dá
dados para decidir se o reflow ainda é o gargalo.

**3. Régua rasa é pior que régua nenhuma.** A régua da anotação passou verde com o recurso
completamente quebrado, porque usava `fill()` — que atribui o valor de uma vez — e o defeito
morava no caminho de uma tecla. Congelar afirmações de **layout** durante o reflow é legítimo;
congelar as que carregam trabalho (texto → `f.nota` → documento, "não perdi o que escrevi",
"o download saiu completo") nunca é.

---

## Build 1 — A régua roda, e a placa não trava (1,5 d)

O único com urgência de defeito.

- **P0 — o fallback da GPU espera por si mesmo.** `usandoPipe++` fica antes do `try`, o
  `finally { usandoPipe-- }` só roda depois do `catch`, e o `catch` chama `soltarPipe()`, que
  espera `usandoPipe > 0` por até 600 × 100 ms. Um minuto parado na máquina que acabou de
  falhar. Além disso o pipeline de recuperação nasce com `{ dtype:'q8' }` e **sem
  `device:'wasm'`** — pode voltar ao backend que quebrou.
- **A suíte não roda fora desta máquina.** `preparar.sh` procura `/root/cc/walkstamp`; os testes
  carregam `/root/walkstamp`. Ele substitui zero arquivos. 117 testes com caminho absoluto, 118
  com o Chromium fixo.

**Régua:** teste que simula erro na *primeira* inferência e cobra (a) sem espera artificial,
(b) um pipeline vivo, (c) o mesmo trecho refeito, (d) `device === 'wasm'`. Mais `preparar.sh`
derivando a raiz de `import.meta.url` e o Playwright resolvendo o navegador.

---

## Build 2 — O documento tem fim (2,5–4 d)

Hoje o download acontece e a tela fica igual, com os mesmos botões, como se nada tivesse
ocorrido. E o **prompt para IA é o passo 4 de 4** — a numeração diz que ele é um quarto da
tarefa, e para a maioria não é tarefa nenhuma.

- estado de conclusão depois de baixar: o que saiu, quantas telas, se a fala estava completa;
- distinguir `documento baixado` de `projeto guardado`, uma vez só, sem sermão;
- baixar de novo sem reprocessar;
- prompt sai da numeração e vira "próximos passos" da conclusão.

**Aditivo.** Cria tela nova, não move as existentes.

---

## Build 3 — A saída certa primeiro (2–3 d)

Sete formatos com o mesmo peso viram sete decisões. A ferramenta já sabe o cenário (`#modelo`).

- formato recomendado por cenário, com os demais recolhidos em "ver todos";
- layout e papel só depois de escolher um formato que os use;
- vocabulário da interface unificado — *etapa*, *tela*, *passo do procedimento*,
  *projeto Walkstamp*, *documento* (pt-first, copiado para os quatro).

---

## Build 4 — Parar sem perder (4–6 d)

A interface diz que dá para deixar rodando, mas não há como parar e ficar com o que já saiu —
fechar a aba perde o trabalho.

- "Parar e ficar com o que já está pronto" entre janelas de transcrição;
- não prometer abortar a inferência corrente: dizer "parando após este trecho";
- separar, no `#astatus`, **etapa** (`Transcrevendo no processador`), **progresso** (`46%`),
  **previsão** (`faltam ~7 min`), **motor** (recolhido) e **ação**;
- leitor de tela anunciando só início, mudança relevante, erro e fim.

---

## Build 5 — Medir antes de otimizar (3,5–4,5 d)

Sem isto, trocar janela, modelo ou runtime é palpite. Estende o `medir()` que já existe (9
eventos, com opt-out) em vez de construir telemetria nova.

- `performance.mark()` em cada fronteira: leitura, decodificação, cache/download, sessão ONNX,
  primeiro texto, inferência total, fallback, áudio enviado ÷ áudio original;
- amostras versionadas de 1, 10 e 40 min, cold e warm cache, CPU 1/4 threads e GPU, saída JSON;
- **e a pergunta aberta:** inglês abre 48 vezes e converte zero. Funil quebrado ou robôs?
  Meia hora de consulta responde, e muda a prioridade de traduzir.

---

## Build 6 — Menos árvore, menos download (3–4 d)

Numa máquina sem combinação lembrada, o `buildPipe()` percorre ambientes, runtimes, quantização,
repositório reserva, cache limpo e fp32 — algumas falhas custam 73–200 MB extras. Há ainda uma
URL sem versão (`@huggingface/transformers`).

- classificar o erro (rede, arquivo, operador, memória, worker/COEP, backend) e saltar direto
  para o fallback pertinente;
- fixar todas as versões, com manifesto testado de biblioteca ↔ runtime ↔ modelo;
- avisar antes de um fallback caro: "a alternativa baixa mais 73 MB";
- nunca limpar cache sozinho sem evidência de corrupção.

---

## Build 7 — A entrada (1,5–2,5 d)

Primeiro toque no reflow, e o mais barato dele.

- gravar / escolher vídeo / abrir projeto deixam de ter o mesmo peso;
- Drive vira origem dentro de "escolher vídeo", não terceira tarefa;
- roteiro aparece **depois** do tipo de documento e só nos cenários em que ajuda;
- opções de gravação recolhidas; modelo expresso por intenção (rápido / mais preciso), com
  tamanho e motor como consequência abaixo.

---

## Build 8 — A conferência (7–11 d)

- resumo automático antes da grade: quantas telas, quantas com fala, quantas repetidas;
- limpeza recomendada como ação primária, com consequência antes e **desfazer** depois — e
  nunca descartando o que foi marcado à mão;
- cartão da grade com o essencial; anotação, tarja, recorte, comparação e clipe dentro de
  `Editar`;
- fala como painel contextual: transcrição, vocabulário, hesitações e tradução moram lá dentro;
- identificação progressiva: só o campo que falta para o cabeçalho, na hora de gerar.

---

## Build 9 — As três etapas (13–17 d)

O reflow de verdade: `Entrada → Conferir → Baixar`, com uma ação primária por etapa e a frase
"próxima ação" abaixo. É aqui que os 69 testes de visibilidade cobram, e é por isso que ele vem
depois de tudo que entrega valor sem mexer na página.

- controlador de etapas com estado **derivado** dos dados que já existem — não um segundo lugar
  onde mora a verdade;
- `hidden`/classes para revelar painéis, sem duplicar controle nem inventar id novo;
- mover elemento no DOM só quando a ordem de foco exigir;
- acessibilidade: foco e rolagem nas transições, `aria-current="step"`, teclado completo, zoom
  200%, NVDA + Chrome e VoiceOver + Safari.

Ao fim, **descongelar** as réguas de layout e reescrevê-las contra a hierarquia definitiva.

---

## Build 10 — A dívida que sustenta o resto (16–24 d)

Nada aqui o usuário vê. Tudo aqui decide o custo dos próximos anos.

- **máquina de estados do motor ASR** (`idle`, `loading`, `ready`, `inferring`, `switching`,
  `disposing`, `failed`) com fila e dono explícito da sessão. O P0 do build 1 é sintoma disto:
  dez variáveis globais cooperando por convenção;
- **modularizar a fonte** — o artefato continua sendo um HTML só; o `build.py` concatena. Começar
  pelo motor ASR e pelos parsers, com funções puras e teste sem navegador;
- **memória**: `decodeTo16k()` carrega arquivo comprimido, buffer decodificado e `Float32Array`
  ao mesmo tempo. Medir o pico por duração antes de redesenhar; só então WebCodecs em blocos;
- **qualidade da compactação de silêncio**: medir WER/CER com voz baixa, ruído e microfone
  distante, com e sem compactação, antes de tocar em margens — e nunca adicionar VAD neural só
  para ter VAD.

---

## O total, e como ler

| Trecho | Dias | O que você tem no fim |
|---|---:|---|
| Builds 1–4 | **10–15** | nada trava, o documento tem fim, a saída certa vem primeiro, dá para parar sem perder |
| Builds 5–6 | **6,5–8,5** | você mede antes de otimizar, e o pior caso da rede encolhe |
| Builds 7–9 | **22–31** | o redesenho de UX inteiro, com acessibilidade validada |
| Build 10 | **16–24** | a dívida paga; as próximas mudanças ficam baratas |
| **Total** | **54–78** | |

Os documentos originais somavam 20–28 dias só para a parte de UX. A diferença é honesta: são os
69 testes de visibilidade, os cinco idiomas (que o pt-first quase zera) e o backlog de código
que a proposta de UX não contava.

**Se for para parar em algum lugar, pare depois do build 4.** Dez a quinze dias, quatro dos
cinco maiores ganhos das duas listas, e nenhuma linha do reflow.

---

## O que sai do caminho principal, e não do produto

Reabrir e consolidar projetos como bloco fixo · detalhes de modelo e runtime · webcam e clipe ·
controles finos do detector · OCR e ações raras em lote · tradução múltipla · Jira, Google Docs
e SCORM · layout e papel antes do formato · "JSON" como termo primário · prompt como quarta
etapa · diagnóstico técnico sem erro presente.

Nenhum deles é removido. Todos continuam a no máximo dois cliques.

## O que não fazer

Aumentar threads além de quatro sem medir captura concorrente · trocar o modelo padrão antes de
comparar tempo e qualidade em áudio representativo · VAD neural só para ter VAD · virtualizar a
grade para resolver lentidão de transcrição · backend ou GPU remota, que contradiz a proposta
local · remover os fallbacks (eles ficam mais seletivos, não desaparecem) · converter o artefato
final em bundle com dependências: modularizar a **fonte** preserva o HTML único.
