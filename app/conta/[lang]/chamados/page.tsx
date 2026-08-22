/* Os chamados — uma rota do painel.
 *
 * Abrir um chamado é o que se faz quando algo deu errado — e era a sexta
 * seção da página. Alguém com um problema não rola sete blocos para achar onde
 * contar o problema: manda um e-mail e a gente perde o registro.
 */
import { notFound, redirect } from 'next/navigation';
import { ehLang, textos, CAMINHO } from '@/lib/conta/textos';
import { podeAbrir } from '@/lib/conta/nav';
import { Envolver, Porta, capacidades, carregar } from '../carga';
import { Chamados } from '../secoes';
import { abrirChamado } from '../../acoes';
import Abrir from './Abrir';

export const dynamic = 'force-dynamic';

export default async function Pagina(
  { params, searchParams }: PageProps<'/conta/[lang]/chamados'>,
) {
  const { lang } = await params;
  /* O aviso da ação volta PARA CÁ, e é lido aqui. Ele morava só na raiz do
     painel, e por isso quem abrisse um chamado daqui seria mandado para outra
     página para ler o número que precisa anotar. */
  const q = await searchParams;
  const recado = (n: string) => {
    const v = q?.[n];
    return typeof v === 'string' ? v : null;
  };
  if (!ehLang(lang)) notFound();
  const t = textos(lang);
  const carga = await carregar();
  /* Chave faltando ou banco mudo continuam indo para a raiz: são defeito de
     configuração, e a raiz é quem sabe explicar isso. O que MUDOU é o caso de
     não haver sessão — antes ele também caía lá, e a pessoa perdia o menu
     junto, que é a única coisa da tela que diz o que existe aqui dentro. */
  if (carga.estado === 'semChave' || carga.estado === 'erro') redirect(CAMINHO[lang]);
  const liberado = carga.estado === 'ok' && podeAbrir('chamados', capacidades(carga));

  return (
    <Envolver lang={lang} t={t} slug="chamados" carga={carga}>
      {/* O título visível é o do próprio bloco, logo abaixo — repetir "Faturas"
          duas vezes seguidas em tamanhos diferentes é ruído. Mas a página
          precisa de um `h1`: sem ele, quem navega por cabeçalhos com leitor de
          tela cai num documento que começa no meio. */}
      <h1 className="soLeitor">{t.navChamados}</h1>
      {recado('erro') && <p className="aviso err">{recado('erro')}</p>}
      {recado('feito') && <p className="aviso ok">{recado('feito')}</p>}
      {carga.estado === 'ok' && liberado
        ? <>
            {/* ABRIR VEM ANTES DE LISTAR. Quem chega aqui com um problema quer
                contar o problema; a lista é o que se consulta depois, e ela
                nasce vazia justamente para quem mais precisa do formulário. */}
            <Abrir lang={lang} t={t} acao={abrirChamado} />
            <Chamados conta={carga.conta} lang={lang} t={t} />
          </>
        : <Porta lang={lang} t={t}
                 motivo={carga.estado === 'fora' ? 'fora' : 'plano'}
                 titulo={t.navChamados} texto={t.pitchChamados} />}
    </Envolver>
  );
}
