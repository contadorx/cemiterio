/* A PÁGINA DE QUEM ESCREVE.
 *
 * O autor era um nome solto no rodapé do post — três palavras que não levavam a
 * lugar nenhum e não diziam nada sobre quem escreveu. Isso é o que o Google
 * chama de falta de E-E-A-T: experiência, especialidade, autoridade e confiança
 * não se afirmam num campo de texto, se demonstram num corpo de trabalho.
 *
 * O que esta página faz é justamente isso: junta o que a pessoa escreveu, num
 * endereço estável, e liga cada artigo dela a ele pelo `author` do JSON-LD. Não
 * há biografia inventada aqui — o que se afirma é o que existe.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IDIOMAS, type Lang, endereco, marca } from '@/lib/site';
import { lista, type Resumo } from '@/lib/blog';
import { ldJson, organizacao, trilha } from '@/lib/seo';
import { BLOG_TXT, enderecoBlog, enderecoAutor, chaveDe, dataDe } from '../../txt';

/* Mesma conta da página do post: o que se guarda é a LEITURA, e não o
   retrato da página feito no build. */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

const preencher = (m: string, v: string[]) =>
  v.reduce<string>((s, x, n) => s.split('{' + n + '}').join(x), m);

async function achar(lang: string, autor: string) {
  if (!IDIOMAS.includes(lang as Lang)) return null;
  const chave = chaveDe(decodeURIComponent(autor));
  if (!chave) return null;
  let posts: Resumo[] = [];
  try {
    const r = await lista(lang as Lang);
    posts = Array.isArray(r) ? r : [];
  } catch { return { chave, nome: chave, posts: [] as Resumo[] }; }
  const casam = posts.filter((p) => p.autor && chaveDe(p.autor) === chave);
  const nome = casam.map((p) => p.autor).find(Boolean) || chave;
  return { chave, nome, posts: casam };
}

export async function generateMetadata({ params }: PageProps<'/[lang]/blog/autor/[autor]'>): Promise<Metadata> {
  const { lang, autor } = await params;
  const r = await achar(lang, autor);
  const L = lang as Lang;
  const b = BLOG_TXT[L] || BLOG_TXT.pt;
  if (!r) return { title: marca.marca };
  const titulo = preencher(b.autorTitulo, [r.nome]);
  return {
    title: `${titulo} — ${marca.marca}`,
    description: preencher(b.autorLead, [r.nome, String(r.posts.length)]),
    alternates: { canonical: marca.site + enderecoAutor(L, r.chave) },
    /* Mesma regra da etiqueta: sem artigos, sem índice. Uma página de autor
       vazia não demonstra autoridade nenhuma — demonstra que o site tem
       endereços sobrando. */
    robots: r.posts.length ? undefined : { index: false, follow: true },
  };
}

export default async function PorAutor({ params }: PageProps<'/[lang]/blog/autor/[autor]'>) {
  const { lang, autor } = await params;
  const r = await achar(lang, autor);
  if (!r) notFound();
  const L = lang as Lang;
  const b = BLOG_TXT[L] || BLOG_TXT.pt;
  const url = marca.site + enderecoAutor(L, r.chave);

  /* `ProfilePage` com a `Person` dentro, e a organização como afiliação: é o
     formato que o Google documenta para "quem é esta pessoa e por que ela sabe
     do assunto". `worksFor` é o único vínculo que se pode afirmar sem inventar. */
  const perfil = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person', name: r.nome, url,
      worksFor: organizacao(),
    },
  };

  return (
    <section style={{ paddingTop: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(perfil) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(trilha([
        { nome: marca.marca, url: marca.site + endereco('home', L) },
        { nome: b.titulo, url: marca.site + enderecoBlog(L) },
        { nome: r.nome, url },
      ])) }} />
      <div className="wrap">
        <p className="small"><a href={enderecoBlog(L)}>← {b.voltar}</a></p>
        <h1>{preencher(b.autorTitulo, [r.nome])}</h1>
        {r.posts.length === 0
          ? <p className="small muted">{b.autorVazio}</p>
          : <p className="lead">{preencher(b.autorLead, [r.nome, String(r.posts.length)])}</p>}
        <ul className="postList">
          {r.posts.map((p) => (
            <li key={p.slug}>
              <a href={`${enderecoBlog(L)}/${p.slug}`}><b>{p.titulo}</b></a>
              <p className="small muted">
                <time dateTime={p.publicado_em}>{dataDe(L, p.publicado_em)}</time>
              </p>
              <p>{p.resumo}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
