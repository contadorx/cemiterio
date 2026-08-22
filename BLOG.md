# O blog

Conteúdo escrito no back-office, publicado no site, em português e inglês —
sempre os dois.

Endereços: `/blog`, `/en/blog`, `/es/blog`, `/de/blog`, `/fr/blog`.
Gestão: `/conta/negocio/blog` (só o dono).

## A regra que decide o desenho

**Um post é uma coisa só, com as versões dentro** — não um post por idioma. São
duas tabelas: `walkstamp.post` guarda a identidade e a data de publicação;
`walkstamp.post_idioma` guarda o texto e o endereço de cada idioma.

Guardar "o post em português" e "o post em inglês" como dois registros
independentes é como o alemão deste site ficou sem `hreflang`: duas linhas para
a mesma coisa, uma atualizada e a outra não.

**Publicar exige português e inglês.** A recusa mora na função
`walkstamp_blog_publicar` — escrita só na tela, ela valeria para um formulário e
para nenhum outro caminho. O botão de publicar nasce desligado e diz o que
falta.

## O `hreflang` sai do que existe

A página de um post anuncia apenas os idiomas em que ele **realmente** tem
título. Anunciar uma versão alemã que não existe manda o buscador para um 404 do
próprio site.

## O corpo é markdown, e o escape vem primeiro

O editor é um formulário e o texto dele vira HTML numa página pública. Se o que
estivesse guardado fosse HTML, um `<script>` colado num post rodaria na tela de
todo visitante, com o domínio do produto na barra.

`paraHtml`, em `lib/blog.ts`, faz **uma** coisa antes de qualquer outra: escapa
tudo. Só depois aplica as marcas permitidas — títulos `##`, `**negrito**`,
`_itálico_`, `[link](endereço)`, listas, citação, código, imagem, linha. Links só
aceitam `http(s)`, caminho do próprio site, `mailto:` e âncora: `javascript:` num
link é a mesma execução que o escape evitou, e fechar uma porta deixando a outra
aberta não fecha nada.

Não há editor de texto rico, e é decisão: editor rico produz HTML.

## Compartilhar

| canal | por quê |
|---|---|
| **LinkedIn** | onde o público está, e onde o link tem contexto profissional |
| **E-mail** | o canal de dentro da empresa; muita gente não tem rede aberta no trabalho |
| **WhatsApp** | no Brasil é o canal real de equipe, inclusive corporativa |
| **X** | alcance de nicho técnico, barato de manter |
| **Copiar o link** | o que a pessoa cola no Teams, no Slack, no Jira |

Ficaram de fora: **Instagram e TikTok**, que não deixam pôr link em publicação —
"compartilhar um artigo" lá é um botão que não compartilha nada; e o **Facebook**,
que para texto técnico B2B é um ícone que ninguém aperta.

**Nenhum deles carrega script de terceiro.** São links `href` montados no
servidor. Um botão oficial de rede social traz o rastreador da rede junto, e a
política de privacidade deste site diz que não há rastreador de terceiro — o
teste confere que a página do post não faz nenhum pedido a domínio de fora.

## Escrever um post

1. `/conta/negocio/blog` → preencha o **identificador** (o mesmo em todos os
   idiomas; não é o endereço público).
2. Preencha **PT** e **EN**: título, endereço, resumo, corpo. O endereço sai do
   título se ficar vazio.
3. **Salvar**. O post nasce rascunho — nada no ar.
4. **Publicar**. Só habilita com os dois idiomas.

O endereço de um post publicado **não** se recalcula sozinho ao editar o título:
mudá-lo quebraria todo link que alguém já compartilhou.

## O que ele ainda não faz

- **Imagem de compartilhamento por post.** Hoje todo post usa a `og.<idioma>.png`
  do site. Uma imagem por post pede um lugar para guardá-la e um recorte —
  quando houver post suficiente para isso importar, vale.
- **Categorias.** As etiquetas são guardadas e ainda não filtram nada.
- **RSS.** Barato de fazer; sem leitor pedindo, é uma rota a manter à toa.
