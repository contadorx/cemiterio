/* AS PÁGINAS DE ETIQUETA.
 *
 * O modelo guardava `tags: string[]` desde sempre e elas não viravam nada:
 * texto no rodapé do post. Uma etiqueta que não vira página não agrupa — nem
 * para quem lê e quer "os outros sobre isto", nem para o buscador, que precisa
 * de um endereço para entender que aquele conjunto existe.
 *
 * ---- por que filtrar em memória, e não no banco ----
 *
 * `lista()` já devolve as tags de cada post, e o blog tem dezenas de posts, não
 * dezenas de milhares. Uma função nova no banco para filtrar o que já veio seria
 * mais uma coisa a versionar, migrar e manter em sincronia com o formato. No dia
 * em que a lista não couber numa resposta, o filtro desce para o banco — e o
 * sinal disso será a lista paginada, não este arquivo.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IDIOMAS, type Lang, endereco, marca } from '@/lib/site';
import { lista, type Resumo } from '@/lib/blog';
import { ldJson, trilha } from '@/lib/seo';
import { BLOG_TXT, enderecoBlog, enderecoTag, chaveDe, dataDe } from '../../txt';

/* Mesma conta da página do post: o que se guarda é a LEITURA, e não o
   retrato da página feito no build. */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

const preencher = (m: string, v: string[]) =>
  v.reduce<string>((s, x, n) => s.split('{' + n + '}').join(x), m);

async function achar(lang: string, tag: string) {
  if (!IDIOMAS.includes(lang as Lang)) return null;
  const chave = chaveDe(decodeURIComponent(tag));
  if (!chave) return null;
  let posts: Resumo[] = [];
  try {
    const r = await lista(lang as Lang);
    posts = Array.isArray(r) ? r : [];
  } catch { return { chave, nome: chave, posts: [] as Resumo[] }; }
  const casam = posts.filter((p) => (p.tags || []).some((t) => chaveDe(t) === chave));
  /* O NOME EXIBIDO é o que o autor escreveu — "Evidência", e não "evidencia".
     A chave normalizada serve para achar; ela não serve para ler. */
  const nome = casam.flatMap((p) => p.tags || []).find((t) => chaveDe(t) === chave) || chave;
  return { chave, nome, posts: casam };
}

export async function generateMetadata({ params }: PageProps<'/[lang]/blog/tag/[tag]'>): Promise<Metadata> {
  const { lang, tag } = await params;
  const r = await achar(lang, tag);
  const L = lang as Lang;
  const b = BLOG_TXT[L] || BLOG_TXT.pt;
  if (!r) return { title: marca.marca };
  const titulo = preencher(b.tagTitulo, [r.nome]);
  return {
    title: `${titulo} — ${marca.marca}`,
    description: preencher(b.tagLead, [r.nome, String(r.posts.length)]),
    alternates: { canonical: marca.site + enderecoTag(L, r.chave) },
    /* ---- SEM ÍNDICE QUANDO NÃO HÁ NADA ----
       Uma página de etiqueta vazia é uma página fina: ela existe, responde 200 e
       não tem conteúdo. Indexar isso enche o site de endereços que não servem a
       ninguém, e é assim que um blog pequeno passa a parecer um site gerado. */
    robots: r.posts.length ? undefined : { index: false, follow: true },
  };
}

export default async function PorTag({ params }: PageProps<'/[lang]/blog/tag/[tag]'>) {
  const { lang, tag } = await params;
  const r = await achar(lang, tag);
  if (!r) notFound();
  const L = lang as Lang;
  const b = BLOG_TXT[L] || BLOG_TXT.pt;
  const titulo = preencher(b.tagTitulo, [r.nome]);

  return (
    <section style={{ paddingTop: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(trilha([
        { nome: marca.marca, url: marca.site + endereco('home', L) },
        { nome: b.titulo, url: marca.site + enderecoBlog(L) },
        { nome: r.nome, url: marca.site + enderecoTag(L, r.chave) },
      ])) }} />
      <div className="wrap">
        <p className="small"><a href={enderecoBlog(L)}>← {b.voltar}</a></p>
        <h1>{titulo}</h1>
        {r.posts.length === 0
          ? <p className="small muted">{b.tagVazio}</p>
          : <p className="lead">{preencher(b.tagLead, [r.nome, String(r.posts.length)])}</p>}
        <ul className="postList">
          {r.posts.map((p) => (
            <li key={p.slug}>
              <a href={`${enderecoBlog(L)}/${p.slug}`}><b>{p.titulo}</b></a>
              <p className="small muted">
                <time dateTime={p.publicado_em}>{dataDe(L, p.publicado_em)}</time>
                {p.autor ? ` · ${p.autor}` : ''}
              </p>
              <p>{p.resumo}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
