/* As faturas — uma rota do painel.
 *
 * Ela era a quinta seção de uma página de sete. Quem entra para ver uma
 * fatura entra SÓ para isso, e passava por cima do plano, da chave de licença e
 * do atalho do roteiro para chegar nela.
 */
import { notFound, redirect } from 'next/navigation';
import { ehLang, textos, CAMINHO } from '@/lib/conta/textos';
import { podeAbrir } from '@/lib/conta/nav';
import { Envolver, Porta, capacidades, carregar } from '../carga';
import { Faturas } from '../secoes';

export const dynamic = 'force-dynamic';

export default async function Pagina({ params }: PageProps<'/conta/[lang]/faturas'>) {
  const { lang } = await params;
  if (!ehLang(lang)) notFound();
  const t = textos(lang);
  const carga = await carregar();
  /* Chave faltando ou banco mudo continuam indo para a raiz: são defeito de
     configuração, e a raiz é quem sabe explicar isso. O que MUDOU é o caso de
     não haver sessão — antes ele também caía lá, e a pessoa perdia o menu
     junto, que é a única coisa da tela que diz o que existe aqui dentro. */
  if (carga.estado === 'semChave' || carga.estado === 'erro') redirect(CAMINHO[lang]);
  const liberado = carga.estado === 'ok' && podeAbrir('faturas', capacidades(carga));

  return (
    <Envolver lang={lang} t={t} slug="faturas" carga={carga}>
      {/* O título visível é o do próprio bloco, logo abaixo — repetir "Faturas"
          duas vezes seguidas em tamanhos diferentes é ruído. Mas a página
          precisa de um `h1`: sem ele, quem navega por cabeçalhos com leitor de
          tela cai num documento que começa no meio. */}
      <h1 className="soLeitor">{t.navFaturas}</h1>
      {carga.estado === 'ok' && liberado
        ? <Faturas conta={carga.conta} lang={lang} t={t} />
        : <Porta lang={lang} t={t}
                 motivo={carga.estado === 'fora' ? 'fora' : 'plano'}
                 titulo={t.navFaturas} texto={t.pitchFaturas} />}
    </Envolver>
  );
}
