/* Os PADRÕES do documento — uma rota do painel.
 *
 * Eles moravam no fim da tela de `Time`, que é a tela de assento. Quem entra em
 * `Time` vem bloquear ou convidar alguém; o nome da empresa e o logotipo ficavam
 * depois disso, abaixo da dobra de uma página que ninguém termina de ler.
 *
 * São dois assuntos e dois momentos: assento se mexe quando entra ou sai gente;
 * padrão se acerta uma vez e vale para sempre.
 */
import { notFound, redirect } from 'next/navigation';
import { ehLang, textos, CAMINHO } from '@/lib/conta/textos';
import { podeAbrir } from '@/lib/conta/nav';
import { Envolver, Porta, capacidades, carregar } from '../carga';
import { Padroes } from '../secoes';

export const dynamic = 'force-dynamic';

export default async function Pagina({ params }: PageProps<'/conta/[lang]/modelos'>) {
  const { lang } = await params;
  if (!ehLang(lang)) notFound();
  const t = textos(lang);
  const carga = await carregar();
  if (carga.estado === 'semChave' || carga.estado === 'erro') redirect(CAMINHO[lang]);
  const liberado = carga.estado === 'ok' && podeAbrir('modelos', capacidades(carga));
  /* `conta.time` de verdade, e não só o plano: o padrão do documento é do
     CLIENTE, e sem cliente por trás não há o que salvar. Uma tela de formulário
     que grava em lugar nenhum é pior que uma porta. */
  const temTime = carga.estado === 'ok' && liberado && Boolean(carga.conta.time);

  return (
    <Envolver lang={lang} t={t} slug="modelos" carga={carga}>
      <h1 className="soLeitor">{t.navModelos}</h1>
      {carga.estado === 'ok' && temTime
        ? <Padroes conta={carga.conta} lang={lang} t={t} />
        : <Porta lang={lang} t={t}
                 motivo={carga.estado === 'fora' ? 'fora' : 'time'}
                 titulo={t.navModelos} texto={t.pitchModelos} />}
    </Envolver>
  );
}
