/* O MENU do painel, num lugar só.
 *
 * A área do cliente era UMA página de 484 linhas com sete seções empilhadas:
 * plano, licença, roteiro, faturas, chamados, time, modelos. Tudo aberto ao
 * mesmo tempo, sem dizer onde a pessoa está nem o que existe além do que ela
 * enxerga. Quem entra para ver uma fatura rola por cima do plano, da chave de
 * licença e da lista de assentos até achar — e quem entra para bloquear um
 * assento não descobre que dá, porque aquilo está no fim de uma página que
 * ninguém termina de ler.
 *
 * Agora são rotas, e o menu é este.
 *
 * ---- por que uma TABELA, e não os links escritos na casca ----
 *
 * É a lição que este projeto já aprendeu quatro vezes, sempre do mesmo jeito:
 * uma lista escrita à mão ao lado de outra lista de verdade. Foi assim que o
 * alemão e o francês ficaram sem `hreflang`, e depois vendo o tour em inglês
 * mesmo com o vídeo deles pronto. Um item de menu escrito na casca é um item
 * que existe em um idioma e some no outro sem ninguém ver.
 *
 * Aqui: o rótulo vem do dicionário (`lib/conta/textos.ts`), o endereço é
 * montado a partir do idioma, e quem some quando não há do que falar some por
 * uma regra escrita — não por alguém ter lembrado de esconder.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Lang, Textos } from '@/lib/conta/textos';
import { CAMINHO } from '@/lib/conta/textos';

/* Os pedaços traduzidos de cada sub-rota vêm do `rotas.json`, escrito pelo
   `build.py`. O `next.config.mjs` lê a MESMA tabela para montar a ponte de
   reescrita — e é isso que impede o menu apontar para `/de/konto/faturas`
   enquanto a ponte só conhece `/de/konto/rechnungen`, que daria 404 num link
   do próprio produto. */
const rotas = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', 'rotas.json'), 'utf8'),
) as { subConta: Record<string, Record<Lang, string>>; menuConta: ItemNav[] };
const SUB = rotas.subConta;

export interface ItemNav {
  /** o pedaço final do endereço; vazio é a raiz do painel */
  slug: string;
  /** a chave do rótulo no dicionário — nunca o texto */
  rotulo: keyof Textos;
  /** o desenho do ícone, em `path` de SVG 24×24 */
  icone: string;
  /** o item APARECE para todo mundo, com cadeado para quem não tem */
  exige?: 'time' | 'plano';
  /** o item NÃO EXISTE para quem não se encaixa */
  quando?: 'dono';
}

/* A LISTA sai do `rotas.json`, escrito pelo `build.py`, e não daqui.
 *
 * Ela morava aqui, e isso bastava enquanto a barra existia num lugar só. Agora
 * ela existe em DOIS: neste painel, desenhado no servidor, e dentro da própria
 * ferramenta (`public/app.html`), desenhada em JavaScript no navegador a partir
 * do que o `/api/menu` devolve. Dois menus escritos à mão divergem — é questão
 * de tempo até um ganhar um item que o outro não tem, e o sintoma é a pessoa
 * jurar que viu um link que "sumiu".
 *
 * Os ícones vão inline, em `path`: a área do cliente carrega o `site.css` e
 * mais nada, e um pacote de ícones para seis desenhos seria mais bytes que o
 * painel inteiro.
 */
export const NAV: ItemNav[] = rotas.menuConta;

/** O endereço público de um item, no idioma dele. */
export function enderecoDoItem(slug: string, lang: Lang): string {
  const base = CAMINHO[lang];
  if (!slug) return base;
  const traduzido = SUB[slug]?.[lang] ?? slug;
  return `${base}/${traduzido}`;
}

/** O menu que ESTA pessoa vê — e o que dele ela ainda não pode abrir.
 *
 * ---- por que TRANCADO e não escondido ----
 *
 * A área do cliente escondia o que era de plano pago: quem não tinha, não via.
 * Isso é limpo e não vende nada. Um recurso que nunca apareceu não é desejado —
 * quem nunca leu "Casos de teste" no menu não tem por que querer o plano que o
 * libera, e a página de preços fica tentando descrever de fora um recurso que a
 * pessoa poderia ter visto de dentro.
 *
 * Agora o item aparece para todo mundo, marcado, e clicar leva a uma tela que
 * explica o que ele faz e oferece os preços. É porta, não muro.
 *
 * ---- a exceção, e por que ela é o contrário ----
 *
 * O `negocio` continua ESCONDIDO. Uma aba de administração com cadeado anuncia
 * a cada visitante que ela existe, e um endereço conhecido é metade do caminho
 * de quem procura. Ali esconder não é desenho de venda, é a trava — e é por
 * isso que `quando` e `exige` são campos diferentes, e não um só com dois usos.
 */
export function menuDe(lang: Lang, tem: { time: boolean; plano: boolean; dono: boolean }) {
  return NAV.filter((i) => !i.quando || tem[i.quando]).map((i) => ({
    ...i,
    href: enderecoDoItem(i.slug, lang),
    /* `bloqueado` é o que a tela desenha; `exige` é o motivo, que a tela usa
       para dizer QUAL plano abre a porta. Mandar só um booleano faria a tela
       escrever "assine um plano" onde cabia "isto é do plano Time". */
    bloqueado: Boolean(i.exige) && !tem[i.exige as 'time' | 'plano'],
  }));
}

/** Esta pessoa pode abrir esta rota? A mesma resposta que o menu usa para
 *  desenhar o cadeado, para a rota não discordar do menu que levou até ela. */
export function podeAbrir(slug: string, tem: { time: boolean; plano: boolean; dono: boolean }) {
  const item = NAV.find((i) => i.slug === slug);
  if (!item) return true;
  if (item.quando && !tem[item.quando]) return false;
  return !item.exige || tem[item.exige];
}
