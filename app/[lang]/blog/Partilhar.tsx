/* COMPARTILHAR — os canais que fazem sentido para este público.
 *
 * A escolha não é "todas as redes": é onde uma pessoa que testa software, ou
 * que escreve documentação de processo, de fato manda um link para um colega.
 *
 *   LinkedIn   é onde o público está e onde o link tem contexto profissional
 *   E-mail     o canal de dentro da empresa; muita gente não tem rede aberta
 *              no trabalho, e o e-mail passa em qualquer política
 *   WhatsApp   no Brasil é o canal real de equipe, inclusive corporativa
 *   X          alcance de nicho técnico, barato de manter
 *   Copiar     o que a pessoa vai colar no Teams, no Slack, no Jira
 *
 * O que ficou de fora, e por quê: Instagram e TikTok não deixam pôr link em
 * publicação, então "compartilhar um artigo" lá é um botão que não compartilha
 * nada; e o Facebook, para texto técnico B2B, é um ícone que ninguém aperta e
 * que só faz a fileira parecer mais longa do que é.
 *
 * Nenhum deles carrega script de terceiro. São links `href`, montados no
 * servidor — um botão oficial de rede social traz o rastreador da rede junto, e
 * a política de privacidade deste site diz que não há rastreador de terceiro.
 */
import type { Lang } from '@/lib/blog';

const TXT: Record<Lang, Record<string, string>> = {
  pt: { tit: 'Compartilhar', li: 'LinkedIn', mail: 'E-mail', wa: 'WhatsApp', x: 'X', copiar: 'Copiar o link', copiado: 'Link copiado' },
  en: { tit: 'Share', li: 'LinkedIn', mail: 'E-mail', wa: 'WhatsApp', x: 'X', copiar: 'Copy the link', copiado: 'Link copied' },
  es: { tit: 'Compartir', li: 'LinkedIn', mail: 'Correo', wa: 'WhatsApp', x: 'X', copiar: 'Copiar el enlace', copiado: 'Enlace copiado' },
  de: { tit: 'Teilen', li: 'LinkedIn', mail: 'E-Mail', wa: 'WhatsApp', x: 'X', copiar: 'Link kopieren', copiado: 'Link kopiert' },
  fr: { tit: 'Partager', li: 'LinkedIn', mail: 'E-mail', wa: 'WhatsApp', x: 'X', copiar: 'Copier le lien', copiado: 'Lien copié' },
};

const ICONE: Record<string, string> = {
  li: 'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M3 9h4v12H3z M9 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.76 2.5 4.76 5.76V21h-4v-5.2c0-1.24-.02-2.84-1.9-2.84-1.9 0-2.19 1.36-2.19 2.75V21H9z',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  wa: 'M20 12a8 8 0 0 1-11.9 6.96L4 20l1.1-3.9A8 8 0 1 1 20 12z M9 9.5c0 3 2.5 5.5 5.5 5.5 M9 9.5c0-.6.4-1 1-1 M14.5 15c.6 0 1-.4 1-1',
  x: 'M4 4l16 16 M20 4L4 20',
  copiar: 'M9 9h11v11H9z M5 15V4h11',
};

const Ic = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.split(' M').map((seg, n) => <path key={n} d={n ? 'M' + seg : seg} />)}
  </svg>
);

export default function Partilhar({ lang, url, titulo }: { lang: Lang; url: string; titulo: string }) {
  const t = TXT[lang] || TXT.pt;
  const u = encodeURIComponent(url);
  const ti = encodeURIComponent(titulo);
  const canais = [
    { k: 'li', rot: t.li, href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { k: 'mail', rot: t.mail, href: `mailto:?subject=${ti}&body=${ti}%0A%0A${u}` },
    { k: 'wa', rot: t.wa, href: `https://wa.me/?text=${ti}%20${u}` },
    { k: 'x', rot: t.x, href: `https://twitter.com/intent/tweet?text=${ti}&url=${u}` },
  ];
  return (
    <div className="partilhar">
      <span className="partilharTit">{t.tit}</span>
      {canais.map((c) => (
        <a key={c.k} href={c.href} target="_blank" rel="noopener noreferrer"
           aria-label={`${t.tit}: ${c.rot}`} title={c.rot}>
          <Ic d={ICONE[c.k]} /><span>{c.rot}</span>
        </a>
      ))}
      {/* O único que precisa de JavaScript, e ele vai inline: um componente de
          cliente aqui arrastaria React para uma página que hoje é só texto.
          Sem JavaScript, o endereço continua na barra do navegador — que é de
          onde a pessoa copiava antes deste botão existir. */}
      <button type="button" className="partilharCopiar"
              data-url={url} data-ok={t.copiado}
              dangerouslySetInnerHTML={{ __html: '' }} />
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          var b=document.currentScript.previousElementSibling;
          b.innerHTML=${JSON.stringify(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9h11v11H9z"/><path d="M5 15V4h11"/></svg><span>${t.copiar}</span>`)};
          b.onclick=function(){
            navigator.clipboard.writeText(b.dataset.url).then(function(){
              var s=b.querySelector('span'); var antes=s.textContent;
              s.textContent=b.dataset.ok;
              setTimeout(function(){ s.textContent=antes; }, 2000);
            }).catch(function(){});
          };
        })();
      ` }} />
    </div>
  );
}
