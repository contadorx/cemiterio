# Walkstamp

Transforma um vídeo em um **PDF único** com os frames que importam e a transcrição sincronizada — pronto para entregar a um modelo de linguagem.

Modelos de texto não assistem vídeo. O que eles leem bem é: imagens dos momentos certos, transcrição com marcação de tempo, e as duas coisas pareadas. É isso que este projeto produz.

**Tudo roda no navegador do usuário.** O vídeo nunca é enviado para servidor nenhum — não há backend, não há limite de upload, não há custo de processamento.

---

## O que faz

- **Escolhe frames por mudança de cena.** Varre o vídeo e só guarda quando a imagem realmente muda. Num vídeo de slides, troca dezenas de capturas repetidas por uma de cada tela. Também há os modos de quantidade fixa e intervalo fixo.
- **Transcreve localmente** com Whisper (`@huggingface/transformers`), no processador por padrão e na
  placa de vídeo como opção — o tamanho do download aparece antes da escolha, e muda com ela. Também
  aceita `.vtt` / `.srt` / texto colado do painel do Google Drive.
- **Pula o silêncio.** Janela de 30 s sem voz não vai ao modelo: o Whisper processa sempre 30 segundos,
  então uma janela muda custa o mesmo que uma cheia — e ainda convida o modelo a inventar texto.
- **Conta em qual motor rodou e quão rápido**, em quantas linhas, e quantas vezes o tempo real.
- **Pareia imagem e fala.** No PDF, cada frame aparece com o que é dito naquele trecho. Falas que começaram antes do frame vêm marcadas com `...`.
- **Deixa revisar antes de gerar.** Grade de miniaturas, clique para descartar, botão para remover quase-duplicados, e estimativa do tamanho do PDF em tempo real.
- **Monta o prompt.** No fim do fluxo, gera o texto que explica ao modelo como o PDF está organizado — instantes, o que é imagem e o que é fala, e o aviso de que os frames são amostras. Com quatro objetivos prontos ou pedido livre.
- **Dá para interromper.** A varredura mostra previsão de término e pode ser parada a qualquer momento, aproveitando o que já foi extraído.
- **Três idiomas.** Português, inglês e espanhol, incluindo o texto do prompt e do PDF. O idioma vem de `?lang=pt|en|es` ou do navegador.
- **Vídeo de exemplo narrado** em `public/demo/`, um por idioma, com legenda — dá para testar tanto a
  detecção de cena quanto a transcrição sem arquivo próprio.
- **Abre vídeo do Google Drive** sem sair do navegador: o arquivo vai do Google direto para a máquina da
  pessoa, sem passar por servidor nosso. Nasce desligado — veja `GOOGLE-DRIVE.md`.
- **Captura a tela ao vivo, sem guardar vídeo.** Durante o compartilhamento, extrai os frames quando a
  imagem muda e transcreve **dois canais de áudio em separado** — o microfone e o som do computador —,
  rotulando cada fala com sua origem. Uma reunião de uma hora que ocuparia perto de um giga em disco
  termina como algumas dezenas de imagens e um texto. Nada de vídeo é escrito em lugar nenhum.
- **Recorta o trecho a analisar**: em vez de varrer uma hora inteira, aponte `10:00` a `25:00`.
- **Quatro saídas do mesmo material**: o **PDF**, um **.docx** editável, um **.zip só com as figuras**
  e o **JSON** completo (instantes, transcrição, texto lido da tela e imagens em base64). O `.docx` e o
  `.zip` são montados por um escritor de ZIP escrito à mão — um `.docx` é um zip de XML, então o mesmo
  código serve aos dois e o projeto não ganha dependência nenhuma.
- **Exporta a transcrição** em `.vtt`, `.srt` ou `.txt`.
- **Lê o texto que aparece na tela** (OCR local) e inclui no PDF, no JSON e no aviso ao modelo.
- **Descarta frames sem fala**, pela transcrição quando existe, ou medindo a energia do áudio quando não.
- **Índice no PDF e no Word**: a primeira página lista cada instante com o começo da fala, dando ao
  modelo um mapa do vídeo antes das imagens.

## Estrutura

São **dois programas** no mesmo repositório, e a separação é deliberada:

| | o que é | por quê |
|---|---|---|
| `public/app.html` | a ferramenta: um arquivo, 627 KB, **zero npm em tempo de execução** | é o argumento de venda. Um arquivo que a TI escaneia, versiona e roda sem rede. Virar bundle custaria isso. |
| o resto | site e área do cliente, em **Next.js** | é onde a sessão em cookie, o checkout e o webhook precisam de servidor |

O Next **nunca renderiza a ferramenta**: ele a serve, intocada, por um `rewrite` de `/app` para
`/app.html`.

```
app/[lang]/              as 45 páginas do site — montam src/site/*.html com os {{tokens}}
app/conta/               a área do cliente: link mágico, plano, faturas, chamados
app/api/stripe/webhook/  a cobrança vira plano; a assinatura do corpo é a fechadura inteira
lib/site.ts              o mapa de endereços e a montagem das páginas
lib/marca.ts             a identidade, sem tocar disco (o middleware roda no Edge)
next.config.mjs          o roteamento público: / é a home pt, /precos é /precos
middleware.ts            renova a sessão — só em /conta, não no site inteiro
.env.exemplo             os quatro segredos do servidor, com onde pegar cada um

src/site/home.html       modelo da landing, com marcadores {{chave}}
src/site/doc.html        modelo das páginas internas
src/site/bodies/*.html   o corpo de cada página, por idioma
src/i18n-site.json       os textos do site nos três idiomas
src/marca.json           GERADO pelo build.py — a identidade, para o TypeScript ler
src/rotas.json           GERADO pelo build.py — slug, título e descrição de cada página
public/site.css          estilo compartilhado das páginas institucionais
public/app.html          A FERRAMENTA — gerada pelo build, não edite
offline/*.html           build autocontido: um arquivo só, funciona sem internet
src/template.html        fonte da ferramenta; contém o marcador /*__JSPDF__*/
vendor/jspdf.umd.min.js  cópia da biblioteca usada no build offline
brand/                   logotipos, favicon (.svg e .ico), marca do rodapé e paleta
brand/paletas.py         validador de contraste WCAG da paleta — rode antes de mexer em cor
brand/gerar/             scripts que regeram os vídeos: exemplo, tour e GIF
public/favicon.ico       ícone multi-tamanho, referenciado por todas as páginas
media/                   GIF e MP4 de demonstração, para divulgação
build.py                 gera public/app.html e o build offline
public/support.js        bloco de apoio voluntário (preencha os identificadores no topo)
LANCAMENTO.md            textos de divulgação, palavras-chave e posicionamento
ARQUITETURA-PAGO.md      o que é preciso para cobrar: custos, preços e ordem de construção
GOOGLE-DRIVE.md          como ligar o botão do Drive: escopo, chaves e configuração no Google Cloud
DESEMPENHO.md            o que vale otimizar, com o que foi medido e o que é estimativa
PARA-O-SALAVOX.md        o que este projeto tem a devolver ao projeto irmão
```

## Captura ao vivo

O botão de gravar a tela não grava um arquivo. Enquanto a tela está compartilhada, três coisas acontecem
ao mesmo tempo, todas na máquina de quem usa:

1. a imagem é comparada a cada 700 ms e um frame é guardado quando a tela muda de verdade;
2. o microfone e o som do computador entram por **canais separados**, em 16 kHz, por `AudioWorklet` — na
   thread de áudio, e não na principal, justamente porque o Whisper ocupa a principal em rajadas;
3. cada canal é transcrito em janelas de 20 segundos, durante a gravação, e cada fala sai marcada com o
   canal de onde veio.

A separação dos canais é o que torna a transcrição de reunião utilizável: em vez de um bloco único de
texto, sai `Microfone:` para quem está no computador e `Computador:` para as outras pessoas. O prompt
gerado no fim explica ao modelo o que cada rótulo significa.

Janelas silenciosas não vão para a GPU. O corte olha blocos de um segundo, e não a média da janela —
com a média, meio segundo de fala diluído em vinte segundos de silêncio ficaria abaixo do limiar e a
frase seria descartada sem nunca chegar ao modelo.

O modelo é carregado **antes** de a gravação começar, porque baixá-lo no meio travaria a captura. Se ele
não carregar, a gravação continua e guarda os frames sem transcrever.

## As saídas

| Saída | Para quê |
|---|---|
| **PDF** | entregar a um modelo de linguagem — é o formato que eles leem melhor |
| **Word (.docx)** | relatório editável: capa, índice dos instantes, cada frame com a fala daquele trecho, e a transcrição completa no fim |
| **Zip das figuras** | só os JPEGs, nomeados `0001-00-01-45.jpg` — ordem primeiro para o gerenciador de arquivos ordenar certo, instante depois para saber de onde a imagem veio (sem rodapé: são imagens cruas, como pedido) |
| **JSON** | para outro programa consumir |

O PDF e o Word saem com um **rodapé de marca em todas as páginas**: a logo, a frase que explica o que a
ferramenta faz, o endereço do site e o número da página, tudo em uma linha só. No PDF a marca é
desenhada com primitivas (quatro retângulos arredondados) — sai vetorial e não soma um byte ao arquivo.
No Word ela é um PNG de 48 px embutido no template, com parte de rodapé própria (`word/footer1.xml`) e
relacionamento separado. O nome do arquivo, que antes ocupava o rodapé do PDF, ficou só na capa.

**O rodapé segue o idioma da interface**, pela mesma chave (`ftPromo`) e pelo mesmo `t()` que já regem o
título, o índice e os rótulos do documento. Não existe regra separada para ele de propósito: um rodapé
em inglês embaixo de um relatório em português leria como defeito, não como alcance internacional.

Três medidas que não são gosto pessoal:

- **Uma linha, não duas.** Em duas linhas o bloco lê como aviso legal, que é o que as pessoas aprendem a
  ignorar; em uma linha lê como assinatura de autoria.
- **Contraste acima de 4,5:1.** O cinza `#5C6473` e o índigo `#3A3F9E` passam
  folgadamente do mínimo da WCAG para texto pequeno. A versão anterior, em 7,2pt e `#919191`, ficava em
  3,15:1 — ilegível para quem imprime em modo econômico.
- **Corpo que se ajusta ao idioma.** A frase em espanhol é sensivelmente mais longa que a em inglês; o
  rodapé mede a largura e reduz o corpo em passos de 0,2pt, até 6,6pt, se houver risco de encostar no
  número da página. Hoje nenhum dos três idiomas aciona isso — é rede de proteção para textos futuros.

O rodapé custa **938 bytes por página** no PDF (1,3% do arquivo) e **3,7 KB** no `.docx` (3,4%).

O `.docx` sai pronto do navegador, sem servidor e sem biblioteca: um `.docx` é um zip com XML dentro, e
o escritor de ZIP (método armazenado, com CRC-32 próprio) já existia para o zip das figuras. Guardar sem
compressão é deliberado — as imagens já são JPEG, e deflate sobre elas economizaria quase nada em troca
de segundos de espera.

Dois detalhes que só aparecem quando dá errado: a ordem dos elementos dentro de `w:rPr` **não é
estética** — o schema do OOXML é uma *sequence*, e com `w:color` depois de `w:sz` o LibreOffice tolera
mas o Word recusa o arquivo inteiro. E a imagem tem teto de altura: sem ele, um vídeo em retrato gera
uma figura de quase 11 polegadas, que estoura a área útil da página e empurra a legenda para longe do
frame.

## Paleta

Uma fonte de verdade por meio: as variáveis CSS em `src/template.html` e `public/site.css`, e os SVGs
de `brand/`. Os ícones (`favicon.ico`, `apple-touch-icon.png`, a marca do rodapé do Word) são
**gerados a partir de `public/favicon.svg`**, lendo a cor de dentro do próprio SVG — assim não há como
ficarem fora de sincronia com o resto.

| | claro | escuro |
|---|---|---|
| fundo | `#F7F8FA` | `#121419` |
| painel | `#FFFFFF` | `#1A1D24` |
| texto | `#15171C` | `#E9EBF1` |
| secundário | `#5C6473` | `#949BAB` |
| linha | `#E0E3EA` | `#282C36` |
| acento | `#3A3F9E` | `#737CF0` |
| texto do botão | `#FFFFFF` | `#121419` |
| aviso | `#8A6A12` | `#D8BD63` |
| erro | `#B32A3A` | `#EF8484` |

Índigo profundo sobre neutros frios. A escolha não foi só estética: a paleta anterior — terracota sobre
papel quente — era a assinatura visual da Anthropic, e **não bastava trocar o laranja**, porque o fundo
quente e os cinzas amarelados respondiam por metade da associação. Por isso os neutros foram para o
frio junto com o acento.

De quebra, a troca corrigiu uma falha real: a paleta antiga **reprovava em contraste no modo claro**,
com o acento como link em 3,97:1 contra o mínimo 4,5:1 da WCAG. Todos os pares da paleta atual passam
nos dois modos — o verificador está em `/tmp/paletas.py` no histórico, e os números estão na tabela
acima.

O acento também vale para os arquivos gerados: a marca vetorial do rodapé do PDF e o domínio em negrito
saem no `#3A3F9E`, que dá 8.8:1 sobre papel branco.

## Vídeos

Os três vídeos do projeto — o exemplo narrado, o tour da landing e o GIF de
divulgação — **são gerados por script**, não gravados à mão. Isso existe por um
motivo concreto: numa troca de paleta eles precisam ser refeitos, e sem script
isso vira um dia de trabalho manual. O passo a passo está em `brand/gerar/`.

O tour percorre o app de verdade num roteiro do Playwright, com cursor sintético,
e o trecho da varredura é acelerado 3,2x na montagem — a barra de progresso diz o
que precisa em quatro segundos, e em tempo real leva onze. O corte usa os tempos
que o próprio roteiro anota, não um palpite.

Uma armadilha que vale saber: **o vídeo de exemplo é a vitrine da detecção de
cena.** Se duas telas seguidas ficarem parecidas demais, a varredura perde a
transição e o exemplo subestima a própria ferramenta. Na primeira versão em
índigo isso aconteceu — as telas 4 e 5 tinham a mesma estrutura e a diferença
ficou em 4,01, abaixo do limiar de 5,5. A tela 5 ganhou cartões com fundo tingido
e todas as transições passaram para acima de 8. Meça antes de publicar.

## Google Drive

O botão "Abrir do Google Drive" nasce **desligado**, como o bloco de apoio. Preencha as três constantes
`GOOGLE_*` no topo do script de `src/template.html` e ele aparece; vazias, a linha não é renderizada e
nenhum endereço do Google é requisitado. Os SDKs do Google só são carregados quando alguém clica no
botão — quem não usa o Drive continua com uma página que não fala com terceiro nenhum.

O escopo é `drive.file`, o mais restrito possível: dá acesso só aos arquivos escolhidos no seletor,
nunca ao Drive inteiro. Passo a passo da configuração em `GOOGLE-DRIVE.md`.

## Apoio voluntário

O bloco de apoio nasce **desligado**. Abra `public/support.js`, preencha só os identificadores que
você usa (GitHub Sponsors, Buy Me a Coffee, chave Pix) e ele aparece sozinho na landing e na página de
preços, nos três idiomas. Se todos ficarem vazios, o bloco não é renderizado e nenhuma página fica com
buraco. Nada nele destrava funcionalidade — é voluntário de verdade.

Para mudar um texto da landing, edite `src/i18n-site.json` e rode o build — as três versões saem
sincronizadas. `public/app.html` e as três `index.html` são geradas; nunca edite direto.

Preços, privacidade e termos também saem do build, nos três idiomas: o cabeçalho e o rodapé vêm de
`src/site/doc.html` e o texto de cada página fica em `src/site/bodies/<pagina>.<idioma>.html`. São doze
páginas geradas ao todo — nunca edite nada dentro de `public/`.

**Detecção de idioma:** só a home em português carrega o script de detecção, e só age quando não há
`?lang=` na URL. Quem chega de navegador em inglês vai para `/en`, em espanhol para `/es`, e qualquer
outro idioma fica no português. O seletor PT/EN/ES no topo sempre permite trocar, e o link para a
versão em português leva `?lang=pt` justamente para não ser redirecionado de volta.

Edite sempre `src/template.html` e rode o build. Não edite os arquivos gerados.

```bash
python3 build.py
```

## Domínio e ícone

O endereço público sai de uma linha só: `SITE` no topo de `build.py`. Dele saem o `canonical`, os
`hreflang`, o link do topo da ferramenta e a base do vídeo de exemplo — o template usa os marcadores
`__SITE__` e `__SITEDOM__`, substituídos no build. Trocar de domínio é mudar essa linha e rodar o build.

O ícone existe em três formas: `favicon.ico` multi-tamanho (16 a 256 px), `favicon.svg` e
`apple-touch-icon.png`. Todas as páginas os declaram. A ferramenta traz **o SVG embutido como data URI**,
além do `.ico`: assim o arquivo de `offline/` mostra o ícone sem depender de rede nem de um arquivo ao
lado. A logo no topo do app também é SVG inline, pelo mesmo motivo.

## Publicar

Na Vercel, como projeto Next.js. O comando de build está no `vercel.json` e é
`python3 build.py && next build`, nessa ordem: o Python monta a ferramenta e escreve `src/marca.json`
e `src/rotas.json`, que o Next lê para montar o site. Rodar só o `next build` num repositório limpo
falha — e falha dizendo o que faltou, que é o que se quer.

```bash
python3 build.py && npx next build && npx next start   # local
npx vercel --prod                                       # no ar
```

Os quatro segredos do servidor vão em *Settings → Environment Variables*, e estão listados um a um
no `.env.exemplo`. Sem eles o site inteiro funciona; o que fica desligado é o botão de assinar, e
ele diz por quê.

**Não serve mais em hospedagem só-de-arquivos** (GitHub Pages e afins). A área do cliente e o
webhook precisam de servidor. A *ferramenta* continua servindo: `public/app.html` é um arquivo e
roda de qualquer lugar, inclusive de `file://`.

## Como está sendo testado

A suíte usa Playwright com Chromium e vídeos gerados por ffmpeg — inclusive um vídeo de cinco cenas de doze segundos, usado para verificar que a detecção acha os cinco cortes exatos (00:00, 00:12, 00:24, 00:36, 00:48). O cancelamento é verificado interrompendo uma extração de 120 frames e conferindo que ela para em torno de 18 e ainda assim gera PDF.

Um detalhe que só apareceu por causa desse teste: comparar os frames em tons de cinza **não** funciona. Vermelho `(254,0,0)` e verde `(0,128,0)` têm quase o mesmo brilho, e a troca de cena entre eles passava despercebida. A assinatura precisa guardar os três canais de cor separados.

## Limitações conhecidas

- **A transcrição de arquivo não pode ser interrompida** depois de iniciada (a varredura de frames pode,
  e a captura ao vivo permite não esperar a fila).
- **A captura ao vivo disputa a máquina**: a transcrição roda junto com o compartilhamento de tela, e em
  computador modesto a detecção de cena pode perder alguma troca. É o preço de ver o texto aparecendo.
- **Formatos que o navegador não decodifica** (HEVC, alguns MKV) simplesmente não abrem. Resolver isso exige conversão no servidor.
- **Estado não é salvo**: atualizar a página perde tudo.
- **Não adaptada para celular.**
- **Vídeo do Drive vira um `Blob` na memória**: acima de ~1,5 GB a interface avisa, e arquivos muito
  maiores podem derrubar a aba. Baixar e arrastar continua sendo o caminho seguro nesses casos.
- O modelo `base` do Whisper é modesto em português; o `small` é bem melhor e bem mais pesado.

## Roadmap

1. Acelerar a varredura (hoje ~75 ms por salto)
2. Salvar o estado — hoje atualizar a página perde tudo
3. Cancelamento também na transcrição de arquivo (a captura ao vivo já permite abreviar)
4. YouTube: colar o link e receber a legenda pronta, com os frames vindo da gravação da aba.
   Exige um proxy no servidor — `youtube.com` não libera CORS — e o endereço de legenda não é
   documentado. Veja `ARQUITETURA-PAGO.md`, seção 8.
5. Camada paga no servidor: formatos exóticos, vídeos longos, transcrição de qualidade superior, lote
6. API / MCP para agentes consumirem vídeo já mastigado

## Licença

Proprietário. O código roda no navegador de quem usa e pode ser lido ali, mas não é
distribuído sob licença livre.

Versões publicadas até 14/08/2026 sob o nome Walkstamp saíram com licença MIT; quem
as obteve mantém os direitos daquela licença sobre aquelas versões.

Dependências de terceiros: [jsPDF](https://github.com/parallax/jsPDF) (MIT) e
[transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0), que baixa modelos Whisper sob demanda.
Confirme as licenças de cada uma antes de uso comercial.
