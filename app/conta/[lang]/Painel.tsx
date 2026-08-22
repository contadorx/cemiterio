/* A casca do painel: menu de um lado, trabalho do outro.
 *
 * A área do cliente era UMA página com sete seções empilhadas. Quem entrava
 * para ver uma fatura rolava por cima do plano, da chave de licença e da lista
 * de assentos até achar; quem entrava para bloquear um assento não descobria
 * que dava, porque aquilo estava no fim de uma página que ninguém termina.
 *
 * O menu não é enfeite: ele é a única coisa que diz O QUE EXISTE. Uma página
 * longa esconde o que está abaixo da dobra e não avisa que existe.
 *
 * ---- por que server component, sem "use client" ----
 *
 * O item ativo é decidido pelo endereço, e o endereço o servidor já conhece:
 * cada rota passa o próprio `slug`. Marcar o ativo no cliente exigiria
 * `usePathname`, que exige `use client`, que arrasta React para o navegador
 * numa área que hoje não manda JavaScript nenhum. Um menu de seis linhas não
 * paga esse preço.
 */
import { marca } from '@/lib/marca';
import { type Lang, type Textos, CAMINHO } from '@/lib/conta/textos';
import { menuDe } from '@/lib/conta/nav';

export default function Painel({
  lang, t, email, slug, tem, children,
}: {
  lang: Lang;
  t: Textos;
  /** null quando não há sessão: o menu continua, o nome de quem é não */
  email: string | null;
  /** qual item do menu está aberto; vazio é o início */
  slug: string;
  tem: { time: boolean; plano: boolean; dono: boolean };
  children: React.ReactNode;
}) {
  const itens = menuDe(lang, tem);
  return (
    <section className="painelCx">
      <div className="wrap painelGrade">
        <nav className="painelMenu" aria-label={t.painelMenu}>
          {/* Quem está logado, no alto do menu. Numa área que trata de fatura e
              de assento, "em nome de quem estou vendo isto" é a primeira
              pergunta — e ela ficava perdida no meio do conteúdo. */}
          {email
            ? <p className="painelQuem" title={email}>{email}</p>
            /* Sem sessão o menu continua inteiro — é ele que diz o que existe
               aqui dentro. O que muda é a linha de cima: em vez de dizer quem
               você é, ela oferece entrar. */
            : <p className="painelQuem"><a href={CAMINHO[lang]}>{t.painelEntrar}</a></p>}
          <ul>
            {itens.map((i) => {
              const ativo = i.slug === slug;
              return (
                <li key={i.slug || 'inicio'}>
                  <a href={i.href}
                     className={[ativo ? 'on' : '', i.bloqueado ? 'trancado' : ''].filter(Boolean).join(' ') || undefined}
                     aria-current={ativo ? 'page' : undefined}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
                         aria-hidden="true">
                      {i.icone.split(' M').map((d, n) => (
                        <path key={n} d={n ? 'M' + d : d} />
                      ))}
                    </svg>
                    {/* O selo vai DENTRO do `span`, e não ao lado dele.
                        Ao lado, ele virava um terceiro item da fileira e roubava
                        a largura do rótulo: "Casos de teste" quebrava em duas
                        linhas para caber ao lado de "do plano pago".

                        E ele NÃO é `aria-hidden`: quem lê a tela por leitor
                        precisa saber que o link leva a uma tela de venda, em vez
                        de descobrir isso depois de sair da página. */}
                    <span>{t[i.rotulo]}
                      {i.bloqueado && <em className="painelTranca">{t.menuTrancado}</em>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {/* A porta de volta para o trabalho. A conta não é onde se trabalha —
              é onde se resolve uma pendência e se volta. Um painel sem saída
              para a ferramenta faz a pessoa procurar o logo do cabeçalho. */}
          <a className="painelSai" href={`/app?lang=${lang}`}>{t.painelFerramenta}</a>
        </nav>
        <div className="painelCorpo">{children}</div>
      </div>
    </section>
  );
}

/** O endereço da conta neste idioma — para quem precisa montar um link de volta. */
export const raiz = (lang: Lang) => CAMINHO[lang];
export const nomeDaMarca = marca.marca;
