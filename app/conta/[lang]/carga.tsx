/* O que toda rota do painel precisa antes de desenhar qualquer coisa.
 *
 * São quatro perguntas, sempre as mesmas: quem está logado, o que o banco sabe
 * dessa pessoa, o menu que ela vê, e — antes de tudo — se este ambiente sequer
 * tem a chave para perguntar. Cada rota respondendo isso por conta própria
 * seriam cinco cópias de um `try/catch` que precisa estar certo em todas.
 *
 * As três telas de recusa (sem sessão, sem chave, banco mudo) moram aqui pelo
 * mesmo motivo: uma delas escrita diferente numa rota é uma rota que responde
 * "não deu" onde as outras respondem "não deu, e é por isto".
 */
import fs from 'node:fs';
import path from 'node:path';
import { emailDaSessao } from '@/lib/supabase/servidor';
import { type Conta, contaDe, temChaveDeServico } from '@/lib/supabase/servico';
import { type Lang, type Textos, CAMINHO } from '@/lib/conta/textos';
import Painel from './Painel';

export type Carga =
  | { estado: 'fora' }
  | { estado: 'semChave'; email: string }
  | { estado: 'erro'; email: string; detalhe: string }
  | { estado: 'ok'; email: string; conta: Conta;
      tem: { time: boolean; plano: boolean; dono: boolean } };

/** O e-mail do dono da plataforma. Sem ele configurado, a aba de negócio não
 *  existe para ninguém — o que é o padrão certo: uma aba de administração que
 *  aparece por engano é pior que uma que falta. */
const DONO = (process.env.WALKSTAMP_DONO || '').trim().toLowerCase();

export async function carregar(): Promise<Carga> {
  const email = await emailDaSessao();
  if (!email) return { estado: 'fora' };
  if (!temChaveDeServico) return { estado: 'semChave', email };
  try {
    const conta = await contaDe(email);
    return {
      estado: 'ok', email, conta,
      tem: {
        time: Boolean(conta.time),
        plano: Boolean(conta.plano) && conta.motivo !== 'suspensa',
        dono: Boolean(DONO) && email.trim().toLowerCase() === DONO,
      },
    };
  } catch (e) {
    return { estado: 'erro', email, detalhe: String(e).slice(0, 200) };
  }
}

/** O que esta carga pode ver. Deslogado, nada — mas o MENU continua existindo,
 *  e é isso que mudou: um recurso escondido não é desejado. */
export const capacidades = (carga: Carga) =>
  carga.estado === 'ok' ? carga.tem : { time: false, plano: false, dono: false };

/** A casca. Ela aceita QUALQUER estado de carga, inclusive "fora".
 *
 * Antes ela só aceitava a carga boa, e cada rota resolvia o resto com um
 * `redirect` para a raiz. O efeito colateral: quem chegava sem sessão perdia o
 * menu junto — a única coisa da tela que diz o que existe ali dentro. A pessoa
 * caía numa caixa de e-mail sem nenhuma pista do que ganharia ao entrar. */
export function Envolver({
  lang, t, slug, carga, children,
}: {
  lang: Lang; t: Textos; slug: string;
  carga: Carga;
  children: React.ReactNode;
}) {
  return (
    <Painel lang={lang} t={t} email={carga.estado === 'fora' ? null : carga.email}
            slug={slug} tem={capacidades(carga)}>
      {children}
    </Painel>
  );
}

/* O endereço da página de preços em cada idioma. Ele sai do `rotas.json`, que é
   de onde o site inteiro tira os slugs traduzidos — escrito à mão aqui, seria a
   quinta cópia da mesma tabela, e a primeira a apontar para `/de/precos`, que
   não existe: lá é `/de/preise`. */
const rotas = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src', 'rotas.json'), 'utf8'),
) as { slugs: Record<string, Record<string, string>> };
export const precos = (lang: Lang) =>
  (lang === 'pt' ? '' : `/${lang}`) + '/' + rotas.slugs.precos[lang];

/** A PORTA: a tela de quem chegou num item que ainda não abre.
 *
 * Ela não é um muro nem um cadeado mudo. Diz o que o recurso faz, para quem não
 * o tem — porque descrever de fora, na página de preços, é sempre pior do que
 * mostrar de dentro, no lugar onde a pessoa já está com a mão na porta.
 *
 * Tela em branco com um cadeado é indistinguível de defeito. Era a regra que a
 * tela do roteiro já seguia sozinha; agora vale para as cinco. */
export function Porta({
  lang, t, motivo, titulo, texto,
}: {
  lang: Lang; t: Textos;
  motivo: 'fora' | 'plano' | 'time';
  titulo: string;
  texto: string;
}) {
  const cab = motivo === 'fora' ? t.portaEntrarTit
            : motivo === 'time' ? t.portaTimeTit
            : t.portaPlanoTit;
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{titulo}</h2>
      <p className="lead" style={{ marginTop: 0 }}>{texto}</p>
      <p className="small muted"><b>{cab}</b>{' — '}
        {motivo === 'fora' ? t.portaEntrarTxt : t.portaGratis}</p>
      <p style={{ marginBottom: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {motivo === 'fora'
          ? <a className="btn" href={CAMINHO[lang]}>{t.painelEntrar}</a>
          : <a className="btn" href={precos(lang)}>{t.rotVerPlanos}</a>}
        {motivo !== 'fora' && <a className="btn ghost" href={CAMINHO[lang]}>{t.painelTit}</a>}
        {motivo === 'fora' && <a className="btn ghost" href={precos(lang)}>{t.rotVerPlanos}</a>}
      </p>
    </div>
  );
}
