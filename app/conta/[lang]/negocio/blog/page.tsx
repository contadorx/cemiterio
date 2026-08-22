/* A gestão do blog — a aba `Blog` do back-office.
 *
 * Ela não usa a `paginaDoNegocio` das outras abas por um motivo: aquela fábrica
 * lê o painel de números, que esta tela não usa, e não lê os posts, que é tudo
 * o que ela usa. Ler os dois seria uma consulta inteira jogada fora a cada
 * abertura do editor.
 *
 * Sem editor de texto rico, e isso é decisão: o corpo é markdown num campo de
 * texto. Um editor rico produz HTML, e HTML vindo de um formulário e injetado
 * numa página pública é a porta que o `paraHtml` do `lib/blog.ts` existe para
 * fechar. Campo de texto é feio e é seguro por construção.
 */
import { notFound, redirect } from 'next/navigation';
import { ehLang, textos, CAMINHO } from '@/lib/conta/textos';
import { Envolver, carregar } from '../../carga';
import { todos, type PostAdmin } from '@/lib/blog';
import { ABAS } from '@/lib/conta/negocio';
import { salvarPublicacao, alternarPublicacao, apagarPublicacao,
         enviarFigura, removerFigura, escolherCapa } from '../acoes';

export const dynamic = 'force-dynamic';

const IDIOMAS = ['pt', 'en', 'es', 'de', 'fr'] as const;
/* Português e inglês são OBRIGATÓRIOS para publicar, e a tela diz isso antes de
   a pessoa tentar. A recusa mora no banco; aqui é só o aviso. */
const EXIGIDOS = ['pt', 'en'];

export default async function Pagina({ params, searchParams }: PageProps<'/conta/[lang]/negocio/blog'>) {
  const { lang } = await params;
  if (!ehLang(lang)) notFound();
  const t = textos(lang);
  const q = await searchParams;
  const um = (n: string) => (typeof q[n] === 'string' ? (q[n] as string) : null);

  const carga = await carregar();
  if (carga.estado !== 'ok' || !carga.tem.dono) redirect(CAMINHO[lang]);

  let posts: PostAdmin[] = [];
  let erroLeitura = '';
  try {
    const r = await todos();
    /* `Array.isArray`, e não `|| []`.
       
       A função devolve uma lista; uma resposta que não seja lista — banco de
       outra versão, função ausente, proxy devolvendo `{}` — passava pelo `||`
       intacta, e o `.find` logo abaixo derrubava a página inteira com 500. Uma
       tela de gestão que morre porque a leitura veio torta é pior do que uma
       que diz "não deu para ler". */
    posts = Array.isArray(r) ? r : [];
    if (!Array.isArray(r)) erroLeitura = 'A leitura das publicações não voltou como lista.';
  } catch (e) { erroLeitura = String(e).slice(0, 300); }

  const editando = um('chave');
  const atual = posts.find((p) => p.chave === editando) || null;

  return (
    <Envolver lang={lang} t={t} slug="negocio" carga={carga}>
      <h1 className="soLeitor">{t.navNegocio}</h1>
      <nav className="negAbas" aria-label="Seções do negócio">
        {ABAS.map((a) => (
          <a key={a.slug || 'radar'} href={a.href(lang)}
             className={a.slug === 'blog' ? 'on' : undefined}
             aria-current={a.slug === 'blog' ? 'page' : undefined}>{a.rotulo}</a>
        ))}
      </nav>

      {um('erro') === 'falta_idioma' && (
        <p className="aviso err">
          Para publicar, o post precisa de título em português e em inglês.
          Falta: <b>{um('faltam')}</b>.
        </p>
      )}
      {um('erro') === 'endereco_repetido' && (
        <p className="aviso err">Já existe outro post usando esse endereço em algum idioma.</p>
      )}
      {um('erro') && !['falta_idioma', 'endereco_repetido'].includes(um('erro') || '') && (
        <p className="aviso err">{um('erro')}</p>
      )}
      {um('erro') === 'tipo' && (
        <p className="aviso err">Só PNG, JPG, WebP, GIF ou SVG.</p>
      )}
      {um('erro') === 'grande' && (
        <p className="aviso err">A figura passou de 8 MB. Exporte menor — um post
          bem servido raramente precisa de mais que 300 KB.</p>
      )}
      {um('feito') && <p className="aviso ok">{um('feito')}</p>}
      {erroLeitura && <p className="aviso err">{erroLeitura}</p>}

      <Editor lang={lang} post={atual} />
      {atual && <Figuras lang={lang} post={atual} />}

      <div className="card">
        <h2>Publicações</h2>
        {posts.length === 0 ? (
          <p className="small muted">Nenhum post ainda. O formulário acima cria o primeiro.</p>
        ) : (
          <table className="legal">
            <thead>
              <tr><th>Post</th><th>Idiomas</th><th>Estado</th><th>Mexido</th><th /></tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const langs = Object.keys(p.versoes || {}).filter((L) => p.versoes[L as 'pt']?.titulo);
                const faltam = EXIGIDOS.filter((L) => !langs.includes(L));
                return (
                  <tr key={p.chave}>
                    <td>
                      <b>{p.versoes?.pt?.titulo || p.versoes?.en?.titulo || p.chave}</b>
                      <div className="small muted">{p.chave}</div>
                    </td>
                    <td>
                      {langs.map((L) => L.toUpperCase()).join(' · ') || '—'}
                      {faltam.length > 0 && (
                        <div className="small muted">falta {faltam.join(', ').toUpperCase()}</div>
                      )}
                    </td>
                    <td>
                      {p.publicado_em
                        ? <span className="badge">no ar</span>
                        : <span className="muted small">rascunho</span>}
                    </td>
                    <td className="small muted">{(p.atualizado_em || '').slice(0, 10)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <a className="btn ghost" style={{ padding: '4px 10px', fontSize: 13 }}
                           href={`?chave=${encodeURIComponent(p.chave)}`}>Editar</a>
                        <form action={alternarPublicacao}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="chave" value={p.chave} />
                          <input type="hidden" name="publicar" value={p.publicado_em ? '0' : '1'} />
                          <button className="btn ghost" type="submit"
                                  disabled={!p.publicado_em && faltam.length > 0}
                                  title={!p.publicado_em && faltam.length > 0
                                    ? `Falta ${faltam.join(', ').toUpperCase()}` : undefined}
                                  style={{ padding: '4px 10px', fontSize: 13 }}>
                            {p.publicado_em ? 'Despublicar' : 'Publicar'}
                          </button>
                        </form>
                        <form action={apagarPublicacao}>
                          <input type="hidden" name="lang" value={lang} />
                          <input type="hidden" name="chave" value={p.chave} />
                          <button className="btn ghost" type="submit"
                                  style={{ padding: '4px 10px', fontSize: 13 }}>Apagar</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Envolver>
  );
}

function Editor({ lang, post }: { lang: string; post: PostAdmin | null }) {
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2>{post ? `Editando: ${post.chave}` : 'Novo post'}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        O corpo é markdown: <code>## título</code>, <code>**negrito**</code>,
        {' '}<code>[texto](endereço)</code>, listas com <code>-</code>, código
        entre crases. O que for escrito aqui é escapado antes de virar HTML —
        colar <code>&lt;script&gt;</code> não executa nada.
      </p>
      <form action={salvarPublicacao} style={{ display: 'grid', gap: 14 }}>
        <input type="hidden" name="lang" value={lang} />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="small" style={{ flex: '1 1 220px' }}>Identificador
            <input name="chave" required defaultValue={post?.chave || ''}
                   readOnly={Boolean(post)} placeholder="evidencia-que-o-auditor-aceita" />
          </label>
          <label className="small" style={{ flex: '1 1 160px' }}>Autor
            <input name="autor" defaultValue={post?.autor || ''} />
          </label>
          <label className="small" style={{ flex: '1 1 160px' }}>Etiquetas
            <input name="tags" defaultValue={(post?.tags || []).join(', ')} placeholder="qa, evidência" />
          </label>
        </div>

        {IDIOMAS.map((L) => {
          const v = post?.versoes?.[L];
          return (
            <details key={L} open={L === 'pt' || L === 'en'}>
              <summary className="small" style={{ cursor: 'pointer', fontWeight: 650 }}>
                {L.toUpperCase()}
                {EXIGIDOS.includes(L) && <span className="muted"> · obrigatório para publicar</span>}
              </summary>
              <div style={{ display: 'grid', gap: 10, margin: '10px 0 0' }}>
                <label className="small">Título
                  <input name={`titulo_${L}`} defaultValue={v?.titulo || ''} />
                </label>
                <label className="small">Endereço
                  <input name={`slug_${L}`} defaultValue={v?.slug || ''}
                         placeholder="sai do título se ficar vazio" />
                </label>
                <label className="small">Resumo
                  <input name={`resumo_${L}`} defaultValue={v?.resumo || ''} />
                </label>
                <label className="small">Corpo
                  <textarea name={`corpo_${L}`} rows={14} defaultValue={v?.corpo || ''} />
                </label>
              </div>
            </details>
          );
        })}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" type="submit">Salvar</button>
          {post && <a className="btn ghost" href="?">Novo post</a>}
        </div>
      </form>
    </div>
  );
}

/* AS FIGURAS DO POST.
 *
 * Sem editor de texto rico, pelo mesmo motivo de sempre: editor rico produz
 * HTML, e HTML de formulário injetado numa página pública é a porta que o
 * `paraHtml` existe para fechar. Então o fluxo é o do markdown: envia a figura,
 * a tela devolve a linha pronta, você cola onde quiser no corpo.
 *
 * Isso tem uma vantagem que um editor rico não tem: a MESMA figura serve os
 * cinco idiomas, e a legenda de cada um é a que estiver no corpo daquele
 * idioma.
 */
function Figuras({ lang, post }: { lang: string; post: PostAdmin }) {
  const figs = post.figuras || [];
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2>Figuras</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        A primeira vira a capa sozinha — é ela que aparece na lista do blog e na
        prévia de quem compartilha no LinkedIn. Um link sem imagem numa linha do
        tempo é um link que ninguém clica.
      </p>

      <form action={enviarFigura} encType="multipart/form-data"
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="chave" value={post.chave} />
        <label className="small" style={{ flex: '1 1 240px' }}>Arquivo
          <input type="file" name="figura" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" required />
        </label>
        <label className="small" style={{ flex: '1 1 220px' }}>Descrição
          <input name="alt" placeholder="o que a imagem mostra" />
        </label>
        <button className="btn" type="submit">Enviar</button>
      </form>

      {figs.length === 0 ? (
        <p className="small muted" style={{ marginTop: 14 }}>Nenhuma figura ainda.</p>
      ) : (
        <ul className="figLista">
          {figs.map((f) => (
            <li key={f.caminho}>
              <img src={f.url} alt={f.alt} />
              <div>
                {/* A linha pronta, para copiar e colar no corpo. Digitar o
                    endereço à mão é como se erra o endereço. */}
                <code className="figMd">{`![${f.alt}](${f.url})`}</code>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  {post.capa === f.url ? (
                    <span className="badge">capa</span>
                  ) : (
                    <form action={escolherCapa}>
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="chave" value={post.chave} />
                      <input type="hidden" name="url" value={f.url} />
                      <button className="btn ghost" type="submit"
                              style={{ padding: '4px 10px', fontSize: 13 }}>Usar como capa</button>
                    </form>
                  )}
                  <form action={removerFigura}>
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="chave" value={post.chave} />
                    <input type="hidden" name="caminho" value={f.caminho} />
                    <button className="btn ghost" type="submit"
                            style={{ padding: '4px 10px', fontSize: 13 }}>Apagar</button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
