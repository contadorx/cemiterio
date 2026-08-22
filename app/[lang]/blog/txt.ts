/* Os textos e o endereço do blog, num lugar só.
 *
 * `blog` é a mesma palavra nos cinco idiomas — e por isso NÃO entra na tabela de
 * slugs traduzidos do `rotas.json`, que existe para os casos em que a palavra
 * muda. Uma entrada que traduz "blog" para "blog" cinco vezes é ruído numa
 * tabela cujo valor é justamente chamar atenção para o que muda. */
import type { Lang } from '@/lib/site';

export const enderecoBlog = (lang: Lang) => (lang === 'pt' ? '/blog' : `/${lang}/blog`);

/* ---- TAG E AUTOR VIRAM ENDEREÇO ----

   O modelo já guardava `tags: string[]` e `autor`, e nenhum dos dois virava
   página: eram texto no rodapé do post. Tag que não vira página não agrupa
   nada — nem para quem lê, nem para quem rastreia —, e um autor que é só um
   nome solto não constrói autoridade nenhuma.

   A CHAVE DO ENDEREÇO É NORMALIZADA, e a comparação também: "Evidência" e
   "evidencia" são a mesma tag, e duas páginas para a mesma tag competiriam
   entre si na busca — o defeito que o `canonical` existe para evitar, criado
   por nós mesmos. Acento sai, espaço vira hífen, e o resto é minúscula. */
export const chaveDe = (s: string) =>
  String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const enderecoTag = (lang: Lang, tag: string) =>
  `${enderecoBlog(lang)}/tag/${encodeURIComponent(chaveDe(tag))}`;
export const enderecoAutor = (lang: Lang, autor: string) =>
  `${enderecoBlog(lang)}/autor/${encodeURIComponent(chaveDe(autor))}`;

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR' };
export const dataDe = (lang: Lang, iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE[lang] || 'pt-BR',
    { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

export const BLOG_TXT: Record<Lang, Record<string, string>> = {
  pt: { titulo: 'Blog', lead: 'Notas sobre evidência de teste, documentação de processo e o que a gente aprende construindo o Walkstamp.',
        vazio: 'Ainda não há publicações neste idioma.', erro: 'Não deu para ler as publicações agora.',
        tagTitulo: 'Publicações sobre {0}', tagLead: '{1} publicação(ões) marcadas com esta etiqueta.', tagVazio: 'Nenhuma publicação com esta etiqueta.', autorTitulo: 'Publicações de {0}', autorLead: '{1} publicação(ões) escritas por esta pessoa.', autorVazio: 'Nenhuma publicação desta pessoa neste idioma.', tags: 'Etiquetas', autores: 'Quem escreve', assinar: 'Assinar por RSS',
        voltar: 'Todas as publicações', minutos: 'min de leitura', atualizado: 'atualizado em' },
  en: { titulo: 'Blog', lead: 'Notes on test evidence, process documentation, and what we learn while building Walkstamp.',
        vazio: 'No posts in this language yet.', erro: 'Could not read the posts right now.',
        tagTitulo: 'Posts about {0}', tagLead: '{1} post(s) tagged this way.', tagVazio: 'No posts with this tag.', autorTitulo: 'Posts by {0}', autorLead: '{1} post(s) written by this person.', autorVazio: 'No posts by this person in this language.', tags: 'Tags', autores: 'Who writes', assinar: 'Subscribe by RSS',
        voltar: 'All posts', minutos: 'min read', atualizado: 'updated on' },
  es: { titulo: 'Blog', lead: 'Notas sobre evidencia de prueba, documentación de proceso y lo que aprendemos construyendo Walkstamp.',
        vazio: 'Todavía no hay publicaciones en este idioma.', erro: 'No se pudieron leer las publicaciones ahora.',
        tagTitulo: 'Publicaciones sobre {0}', tagLead: '{1} publicación(es) con esta etiqueta.', tagVazio: 'Ninguna publicación con esta etiqueta.', autorTitulo: 'Publicaciones de {0}', autorLead: '{1} publicación(es) escritas por esta persona.', autorVazio: 'Ninguna publicación de esta persona en este idioma.', tags: 'Etiquetas', autores: 'Quién escribe', assinar: 'Suscribirse por RSS',
        voltar: 'Todas las publicaciones', minutos: 'min de lectura', atualizado: 'actualizado el' },
  de: { titulo: 'Blog', lead: 'Notizen zu Testnachweisen, Prozessdokumentation und dem, was wir beim Bau von Walkstamp lernen.',
        vazio: 'Noch keine Beiträge in dieser Sprache.', erro: 'Die Beiträge konnten gerade nicht gelesen werden.',
        tagTitulo: 'Beiträge über {0}', tagLead: '{1} Beitrag/Beiträge mit diesem Schlagwort.', tagVazio: 'Keine Beiträge mit diesem Schlagwort.', autorTitulo: 'Beiträge von {0}', autorLead: '{1} Beitrag/Beiträge von dieser Person.', autorVazio: 'Keine Beiträge dieser Person in dieser Sprache.', tags: 'Schlagwörter', autores: 'Wer schreibt', assinar: 'Per RSS abonnieren',
        voltar: 'Alle Beiträge', minutos: 'Min. Lesezeit', atualizado: 'aktualisiert am' },
  fr: { titulo: 'Blog', lead: 'Notes sur la preuve de test, la documentation de processus et ce que nous apprenons en construisant Walkstamp.',
        vazio: 'Pas encore de publications dans cette langue.', erro: 'Impossible de lire les publications pour le moment.',
        tagTitulo: 'Publications sur {0}', tagLead: '{1} publication(s) portant cette étiquette.', tagVazio: 'Aucune publication avec cette étiquette.', autorTitulo: 'Publications de {0}', autorLead: '{1} publication(s) écrites par cette personne.', autorVazio: 'Aucune publication de cette personne dans cette langue.', tags: 'Étiquettes', autores: 'Qui écrit', assinar: 'S’abonner par RSS',
        voltar: 'Toutes les publications', minutos: 'min de lecture', atualizado: 'mis à jour le' },
};
