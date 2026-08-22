/* O time — uma rota do painel.
 *
 * Assentos, modelos e emissões. Era a última seção da página mais longa do
 * produto, e por isso quem administra um domínio não descobria que podia
 * bloquear um acesso — a função existia e ficava atrás de tudo.
 */
import { notFound, redirect } from 'next/navigation';
import { ehLang, textos, CAMINHO } from '@/lib/conta/textos';
import { podeAbrir } from '@/lib/conta/nav';
import { Envolver, Porta, capacidades, carregar } from '../carga';
import { Time } from '../secoes';

export const dynamic = 'force-dynamic';

export default async function Pagina({ params }: PageProps<'/conta/[lang]/time'>) {
  const { lang } = await params;
  if (!ehLang(lang)) notFound();
  const t = textos(lang);
  const carga = await carregar();
  /* Chave faltando ou banco mudo continuam indo para a raiz: são defeito de
     configuração, e a raiz é quem sabe explicar isso. O que MUDOU é o caso de
     não haver sessão — antes ele também caía lá, e a pessoa perdia o menu
     junto, que é a única coisa da tela que diz o que existe aqui dentro. */
  if (carga.estado === 'semChave' || carga.estado === 'erro') redirect(CAMINHO[lang]);
  const liberado = carga.estado === 'ok' && podeAbrir('time', capacidades(carga));
  /* Esta linha era `if (!carga.tem.time) redirect(...)` — sem time, a rota
     não existia. Ela saiu porque a estratégia virou o contrário: o item APARECE
     no menu para todo mundo, marcado, e quem clica sem ter o plano cai numa
     tela que explica o que ele faz. Escondido, ninguém o deseja.

     O que sobrou é a checagem que continua sendo verdade: `podeAbrir` já disse
     se libera, e o `Time` só desenha quando há `conta.time` de fato — um painel
     de assentos sem cliente por trás não é tela vazia, é tela quebrada. */
  const comTime = carga.estado === 'ok' && liberado && Boolean(carga.conta.time);

  return (
    <Envolver lang={lang} t={t} slug="time" carga={carga}>
      {/* O título visível é o do próprio bloco, logo abaixo — repetir "Faturas"
          duas vezes seguidas em tamanhos diferentes é ruído. Mas a página
          precisa de um `h1`: sem ele, quem navega por cabeçalhos com leitor de
          tela cai num documento que começa no meio. */}
      <h1 className="soLeitor">{t.navTime}</h1>
      {carga.estado === 'ok' && comTime
        ? <Time conta={carga.conta} lang={lang} t={t} />
        : <Porta lang={lang} t={t}
                 motivo={carga.estado === 'fora' ? 'fora' : 'time'}
                 titulo={t.navTime} texto={t.pitchTime} />}
    </Envolver>
  );
}
