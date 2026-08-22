/* A área do cliente.
 *
 * O que ela guarda, e o que ela deliberadamente NÃO guarda:
 *
 *   guarda      chamado, fatura, assento, licença, logotipo e modelos
 *   não guarda  vídeo, áudio, transcrição e documento
 *
 * A segunda lista é a identidade do produto e não muda por conveniência de
 * tela. Um `.json` de sessão "só para recuperar" carrega as imagens em base64
 * dentro — guardá-lo seria guardar o documento inteiro com outro nome.
 */
import { notFound } from 'next/navigation';
import { emailDaSessao } from '@/lib/supabase/servidor';
import { type Lang, type Textos, ehLang, preencher, textos } from '@/lib/conta/textos';
import { entrar, sair } from '../acoes';
import { Envolver, carregar } from './carga';
import { Plano, RoteiroAtalho } from './secoes';
import Licenca from './Licenca';

export const dynamic = 'force-dynamic';

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES',
                                      de: 'de-DE', fr: 'fr-FR' };

const dinheiro = (lang: Lang, centavos: number, moeda: string) =>
  new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: moeda || 'BRL' }).format(centavos / 100);

const data = (lang: Lang, iso: string | null) =>
  iso ? new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'medium' }).format(new Date(iso)) : '—';

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function Pagina({ params, searchParams }: PageProps<'/conta/[lang]'>) {
  const { lang } = await params;
  if (!ehLang(lang)) notFound();
  const t = textos(lang);
  const q = await searchParams;
  const email = await emailDaSessao();
  const recado = (n: string) => (typeof q[n] === 'string' ? (q[n] as string) : null);

  /* Os recados de volta do Stripe e das ações continuam por cima de tudo: eles
     são a resposta ao que a pessoa acabou de fazer, e uma resposta que aparece
     depois do menu é uma resposta que ela já rolou por cima. */
  const avisos = (
    <>
      {recado('erro') && <p className="aviso err">{recado('erro')}</p>}
      {recado('feito') && <p className="aviso ok">{recado('feito')}</p>}
      {recado('comprou') && <p className="aviso ok">{t.avisoComprou}</p>}
      {recado('cancelou') && <p className="aviso">{t.avisoCancelou}</p>}
    </>
  );

  if (!email) {
    /* Deslogado, a caixa de e-mail vem DENTRO do painel, com o menu ao lado.
       Antes era uma página nua: quem chegava aqui via um campo de e-mail e nada
       que dissesse o que existe do outro lado. O menu é a única peça da tela que
       responde "o que eu ganho ao entrar" — e agora os itens pagos aparecem
       nele, marcados, levando a uma tela que explica o recurso e aos preços. */
    return (
      <Envolver lang={lang} t={t} slug="" carga={{ estado: 'fora' }}>
        {avisos}
        <Entrada lang={lang} t={t} enviadoPara={recado('enviado')} />
      </Envolver>
    );
  }
  return <><div className="wrap" style={{ paddingTop: 26 }}>{avisos}</div>
             <Portal email={email} lang={lang} t={t} /></>;
}

/* ------------------------------------------------------------------ entrar */

function Entrada({ lang, t, enviadoPara }: { lang: Lang; t: Textos; enviadoPara: string | null }) {
  if (enviadoPara) {
    const [antes, depois] = t.olheAjuda.split('{link}');
    return (
      <>
        <h1>{t.olheTitulo}</h1>
        <p className="lead" dangerouslySetInnerHTML={{
          __html: preencher(t.olheLead, { email: `<b>${escapar(enviadoPara)}</b>` }),
        }} />
        <p className="small muted">
          {antes}<a href="?">{t.olhePedirOutro}</a>{depois}
        </p>
      </>
    );
  }
  return (
    <>
      <h1>{t.titulo}</h1>
      <p className="lead">{t.entrarLead}</p>
      <form action={entrar} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '20px 0' }}>
        <input type="hidden" name="lang" value={lang} />
        <input type="email" name="email" required placeholder={t.entrarPlaceholder}
               autoComplete="email" style={{ flex: '1 1 260px' }} />
        <button className="btn" type="submit">{t.entrarBotao}</button>
      </form>
      <p className="small muted">
        <b>{t.opcional}</b> {t.opcionalTexto}{' '}
        <a href={`/app?lang=${lang}`}>{t.opcionalLink}</a>{t.opcionalFim}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ portal */

async function Portal({ email, lang, t }: { email: string; lang: Lang; t: Textos }) {
  const carga = await carregar();

  if (carga.estado === 'semChave') {
    return (
      <Recusa lang={lang} t={t}>
        <p className="aviso err">{t.erroSemChave} <code>SUPABASE_SERVICE_ROLE_KEY</code></p>
      </Recusa>
    );
  }
  if (carga.estado === 'erro') {
    return (
      <Recusa lang={lang} t={t}>
        <p className="aviso err">{t.erroLeitura}</p>
        <p className="small muted">{carga.detalhe}</p>
      </Recusa>
    );
  }
  if (carga.estado !== 'ok') {
    return (
      <Envolver lang={lang} t={t} slug="" carga={carga}>
        <Entrada lang={lang} t={t} enviadoPara={null} />
      </Envolver>
    );
  }

  const { conta } = carga;
  return (
    <Envolver lang={lang} t={t} slug="" carga={carga}>
      <h1>{t.painelTit}</h1>
      <p className="lead">{email}</p>

      <Plano conta={conta} lang={lang} t={t} />
      {/* A chave vinha só da página de venda, e quem já estava logado aqui
          precisava entrar de novo por lá para pegá-la. Duas portas para a mesma
          coisa é o que a rodada do portal veio acabar. */}
      {carga.tem.plano && <Licenca lang={lang} t={t} />}
      <RoteiroAtalho conta={conta} lang={lang} t={t} />

      <Sair lang={lang} t={t} />
    </Envolver>
  );
}

/* As telas de recusa continuam FORA do painel: um menu lateral em volta de
   "não consegui ler a sua conta" oferece cinco lugares que também não vão
   carregar. Sem chave e sem banco, a única coisa honesta na tela é sair. */
function Recusa({ lang, t, children }: { lang: Lang; t: Textos; children: React.ReactNode }) {
  return (
    <section style={{ paddingTop: 40 }}>
      <div className="wrap" style={{ maxWidth: 780 }}>
        <h1>{t.titulo}</h1>
        {children}
        <Sair lang={lang} t={t} />
      </div>
    </section>
  );
}

const Sair = ({ lang, t }: { lang: Lang; t: Textos }) => (
  <form action={sair} style={{ marginTop: 22 }}>
    <input type="hidden" name="lang" value={lang} />
    <button className="btn ghost" type="submit">{t.sair}</button>
  </form>
);
