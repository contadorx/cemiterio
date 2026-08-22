# A regressão

135 arquivos que afirmam coisas sobre o produto. Cada um roda sozinho com
`node <arquivo>.mjs` e sai com código 1 se alguma afirmação cair.

## Primeiro uso, depois de abrir o zip

```bash
bash testes/preparar.sh      # confere o que falta e gera as amostras
```

Ele **não reescreve mais os testes**: eles perguntam onde estão a
`testes/_caminhos.mjs`, que deduz a raiz de `import.meta.url` e descobre o
Chromium no disco. Sobrou para o script o que é de verdade preparação.

Ele gera os **vídeos de amostra** que os testes carregam de `/tmp`
(`amostra`, `cinco`, `retrato`, `so-relogio`, `fala-longa`) com
`testes/amostras.py`. Eles não viajam no zip por peso, e sem eles a esteira
acusava `ENOENT` — que na saída é indistinguível de defeito do produto.

`fala-longa` são cinco minutos, e existem por um motivo só: a janela do Whisper
é de trinta segundos, e `parar.mjs` cobra o botão que para a transcrição ENTRE
um trecho e o seguinte. Num vídeo de dez segundos há uma janela só — e num
vídeo de uma janela a única coisa que dá para provar sobre parar entre janelas
é que o teste não provou nada.

Mais um é opcional e pesado, e por isso não é gerado sozinho:

```bash
python3 testes/amostras.py --longo    # 1 hora de vídeo, ~1 min, 8 MB
```

Ele alimenta `varredura.mjs`, que mede a varredura do passo 2 em material de
verdade. Sem ele, o teste **pula dizendo isso** em vez de falhar.

## O navegador da régua, e por que ele não é o do Playwright

Cinquenta arquivos importam o Chromium de `_navegador.mjs`, e não de
`playwright`. A diferença é uma linha: ele abre os `<details class="sub">`
antes de a página carregar.

Existe porque dois painéis do passo 3 — a fala e a identificação — nascem
RECOLHIDOS, e para o Playwright um elemento dentro de um `<details>` fechado
não é invisível por opinião: ele não tem caixa, e `fill()` recusa com "element
is not visible". Sem o atalho seriam cinquenta edições, uma por arquivo, cada
uma num ponto diferente — e cinquenta chances de errar uma.

Ele abre painéis e mais nada: não mexe em estado, não preenche campo, não muda
o produto. E o estado recolhido continua cobrado por `perna.mjs`, que importa o
Playwright DIRETO justamente para enxergá-lo — inclusive uma afirmação de que o
atalho não toca em mais nada. Um atalho que apagasse a própria régua seria o
atalho se autoaprovando.

**Se você escrever um teste novo que dirige `#tr`, `#evBox` ou qualquer coisa
dentro daqueles painéis, importe de `./_navegador.mjs`.** Se o teste for sobre a
tela como ela abre, importe de `playwright`.

## O que NÃO roda a partir do zip

Três testes de licença (`licenca`, `liclink`, `licauto`) e um bloco do
`semmarca` precisam de `emitir-licenca.py` e de `PLANO-TIME.md`, que guardam as
chaves privadas e **não podem** viajar no pacote. Eles pulam, dizendo por quê.
Rode-os na máquina onde o emissor vive.

## As duas esteiras

```bash
bash testes/rapido.sh app      # a ferramenta, só comportamento       (~3m30)
bash testes/rapido.sh medir    # as réguas: memória, peso, espelho, espera (~12 min)
bash testes/rapido.sh site     # o site: build + next build + páginas
bash testes/rapido.sh a.mjs b.mjs
bash testes/rodar.sh           # a regressão inteira                    (~40 min)
```

`rodar.sh` sobe um Next de verdade na 8802 antes de começar, porque sete testes
falam com ele em vez de ler `public/`.

## Antes de entregar um zip

O pacote é montado **de dentro** da pasta do projeto, nunca da pasta acima —
montado de fora, os padrões de `naovai.txt` não casam com o prefixo e as chaves
privadas vão junto. Já aconteceu.

```bash
cd <raiz do projeto>
zip -qr /tmp/walkstamp.zip . -x@testes/naovai.txt
```

Depois **confira**, não confie: `emitir-licenca.py`, as duas chaves privadas,
`node_modules`, `.next`, `.env` e `PLANO-TIME` têm que contar zero.

## Por que eles moram aqui

Moravam em `/tmp`. O zip entregue não levava teste nenhum: quem abrisse o pacote
recebia o produto sem a rede que prova que ele funciona, e qualquer sessão nova
começava sem saber o que já estava garantido. Um teste que não viaja junto com o
código é um teste que existe uma vez só.
