# Pacote de marca — Walkstamp

Para abrir páginas nas redes sociais. Tudo aqui foi gerado pelo
`marca/gerar-logos.py`: mudar o azul é mudar uma linha e rodar de novo, e as
vinte e poucas peças saem certas juntas.

## O que subir em cada lugar

### LinkedIn — a página da empresa

| campo | arquivo |
|---|---|
| Logotipo | `redes/linkedin/linkedin-logo-empresa-400.png` |
| Imagem de capa | `redes/linkedin/linkedin-capa-empresa-1128x191.png` |

> A capa da empresa é uma faixa **muito baixa** (1128×191) e o LinkedIn desenha
> o logotipo da página **por cima do canto de baixo à esquerda dela**. Por isso
> o conteúdo desta peça — e só dela — está deslocado para a direita.

### LinkedIn — o seu perfil pessoal

| campo | arquivo |
|---|---|
| Foto | `redes/linkedin/linkedin-foto-perfil-400.png` |
| Imagem de fundo | `redes/linkedin/linkedin-capa-perfil-1584x396.png` |

### As outras

| rede | foto | capa |
|---|---|---|
| X | `x-perfil-400.png` | `x-header-1500x500.png` |
| Instagram | `instagram-perfil-1080.png` | — |
| Facebook | `facebook-perfil-1000.png` | `facebook-capa-1640x624.png` |
| YouTube | `youtube-perfil-800.png` | `youtube-banner-2560x1440.png` |
| Bluesky | `bluesky-perfil-1000.png` | `bluesky-banner-3000x1000.png` |
| TikTok | `tiktok-perfil-1000.png` | — |

Toda capa tem uma versão em inglês, com `-en` no nome.

## Três coisas que decidem se isto vai ficar bom

**A foto de perfil é recortada em CÍRCULO em todas as redes.** Por isso ela não
é o símbolo cheio: o desenho encolhe e recentra para caber redondo com folga. Se
você usar o `walkstamp-simbolo.svg` como foto de perfil, o canto do documento e
um pedaço do selo vão embora no recorte — some justamente a parte que dá nome à
marca.

**O banner do YouTube tem duas verdades.** O arquivo é 2560×1440, mas no celular
o YouTube mostra só 1546×423 do miolo. O texto desta peça nasce dentro desse
miolo; o resto é fundo. Não mova o texto para fora dele achando que sobrou
espaço.

**O nome está em contorno, não em texto.** Os SVG não dependem de nenhuma fonte
instalada: abrem iguais no Canva, no Figma, no PowerPoint e na tela de upload da
rede — que é onde o texto costuma sumir e virar Times New Roman.

## As peças soltas

Em `svg/` (para quem for desenhar) e `png/` com fundo transparente em 256, 512 e
1024 px de altura (para quem não abre SVG):

| arquivo | quando usar |
|---|---|
| `walkstamp-horizontal` | o padrão, sobre fundo claro |
| `walkstamp-horizontal-branco` | sobre foto ou fundo escuro |
| `walkstamp-horizontal-preto` | uma cor só — carimbo, fax, serigrafia |
| `walkstamp-vertical` | quando o espaço é mais alto que largo |
| `walkstamp-vertical-branco` | idem, sobre escuro |
| `walkstamp-simbolo` | só o símbolo, com o quadrado azul |
| `walkstamp-simbolo-branco` | só o símbolo, vazado em branco |
| `walkstamp-avatar` | foto de perfil (já pronto para o recorte redondo) |

## As cores

| | | |
|---|---|---|
| Azul da marca | `#3A3F9E` | o quadrado, o "stamp" do nome |
| Tinta | `#15171C` | o "Walk" do nome, texto |
| Papel | `#F7F8FA` | fundo claro |
| Branco | `#FFFFFF` | o desenho dentro do quadrado |

## A fonte

**Inter** — SemiBold no "Walk", Bold no "stamp". Licença SIL Open Font, então
pode ser usada e distribuída à vontade: <https://rsms.me/inter/>

> Uma diferença que vale saber: o **site** escreve "Walkstamp" com a fonte do
> sistema (Segoe no Windows, SF no Mac, Roboto no Android) — o que é ótimo para
> uma página, que assim não baixa fonte nenhuma, e péssimo para uma marca, que
> não pode mudar de forma conforme a máquina. Por isso o pacote fixa em Inter.
> Na prática as duas são muito parecidas; a diferença aparece lado a lado.

## O que NÃO fazer

- Não recomponha o logo à mão (símbolo de um arquivo, nome de outro): o espaço
  entre eles faz parte do desenho.
- Não use o horizontal colorido sobre fundo escuro — use o `-branco`.
- Não estique. Todas as peças têm proporção fixa; se precisar de outro tamanho,
  rode o gerador em vez de arrastar o canto.
- Não ponha o logo colorido sobre o azul da marca. Nas capas o símbolo entra
  **invertido** (quadrado branco, desenho azul) exatamente por isso.

## Refazer o pacote

```bash
python3 marca/gerar-logos.py
```

Precisa de Inter instalada (`apt-get install fonts-inter`) e do Chromium que já
vem com o Playwright do projeto.
