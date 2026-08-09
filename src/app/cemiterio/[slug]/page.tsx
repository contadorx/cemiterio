import Link from "next/link";
import { notFound } from "next/navigation";

import { MARCA, CEMITERIOS, acharCemiterio } from "@/lib/marca";
import { SITE, PRECO_A_PARTIR_DE, PRECO_UNIDADE, linkWhats } from "@/lib/site";

/**
 * UMA PÁGINA POR CEMITÉRIO.
 *
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * Quem procura este serviço não digita "limpeza de jazigo": digita o nome do
 * cemitério onde está o pai. Uma home genérica falando de "Mauá" compete com
 * todo mundo; uma página que fala DAQUELE cemitério, com o bairro e a ficha
 * certa no schema.org, responde exatamente a busca que foi feita.
 *
 * E é a única estrutura que sobrevive à expansão sem reescrita: cada cemitério
 * novo em src/lib/marca.ts ganha página, entra no sitemap e passa a existir no
 * Google sozinho.
 *
 * O conteúdo é o MESMO da home (mesma promessa, mesmo preço, mesmo FAQ) — muda
 * o lugar. Página de SEO com texto diferente do que a empresa entrega é o tipo
 * de coisa que funciona por seis meses e queima o nome depois.
 */

const c = MARCA.cores;

export function generateStaticParams() {
  return CEMITERIOS.map((cem) => ({ slug: cem.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const cem = acharCemiterio(params.slug);
  if (!cem) return {};
  const titulo = `Limpeza de túmulo no ${cem.nome} — ${cem.cidade}`;
  return {
    title: `${titulo} | ${MARCA.nome}`,
    description:
      cem.status === "chegando" && cem.primeiraGratis
        ? `Limpeza de túmulos no ${cem.nome}, ${cem.cidade}. Estamos começando aqui: a primeira ` +
          "limpeza é por nossa conta e você recebe a foto do resultado. Mais de 30 anos em Mauá."
        : `Limpeza e conservação de jazigos no ${cem.nome}, ${cem.bairro}, ${cem.cidade}. ` +
          "A foto do jazigo limpo chega no seu WhatsApp a cada visita. Desde 1990.",
    metadataBase: new URL(`https://${MARCA.site}`),
    alternates: { canonical: `https://${MARCA.site}/cemiterio/${cem.slug}` },
    openGraph: {
      title: titulo,
      description: `O túmulo da sua família cuidado no ${cem.nome}, mesmo quando você não pode ir.`,
      url: `https://${MARCA.site}/cemiterio/${cem.slug}`,
      siteName: MARCA.nome,
      locale: "pt_BR",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: MARCA.nome }],
    },
  };
}

export default function PaginaCemiterio({ params }: { params: { slug: string } }) {
  const cem = acharCemiterio(params.slug);
  if (!cem) notFound();

  // A ficha do Google DESTE lugar: é o que faz aparecer com endereço quando
  // alguém busca o nome do cemitério junto de "limpeza de túmulo".
  const ficha = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: `${MARCA.nome} — ${cem.nome}`,
    description: `Limpeza e conservação de jazigos no ${cem.nome}, em ${cem.cidade}.`,
    url: `https://${MARCA.site}/cemiterio/${cem.slug}`,
    telephone: `+${MARCA.whatsapp}`,
    foundingDate: String(MARCA.desde),
    areaServed: { "@type": "City", name: cem.cidade },
    address: {
      "@type": "PostalAddress",
      streetAddress: cem.bairro,
      addressLocality: cem.cidade,
      addressRegion: cem.uf,
      addressCountry: "BR",
    },
    image: `https://${MARCA.site}/og.png`,
    logo: `https://${MARCA.site}/icon-512.png`,
    priceRange: "$",
  };

  const chegando = cem.status === "chegando";

  // O texto do WhatsApp diz DE ONDE veio o clique. Numa expansão isso é o que
  // separa "chegou um lead" de "chegou um lead do cemitério novo" — e é o que
  // permite você medir se a página está vendendo.
  const zap = linkWhats(
    chegando && cem.primeiraGratis
      ? `Ola! O jazigo da minha familia fica no ${cem.nome}. Vi que a primeira limpeza e por conta de voces.`
      : `Ola! O jazigo da minha familia fica no ${cem.nome}. Queria saber sobre o cuidado.`,
  );

  return (
    <main style={s.pagina}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ficha) }} />

      <header style={s.topo}>
        <div style={s.faixa}>
          <Link href="/" style={s.marca}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" width={38} height={38} style={s.logo} />
            <span>{MARCA.nome}</span>
          </Link>
          <nav style={s.menu}>
            <Link href="/familia" style={s.topoLink}>Já sou cliente</Link>
            <a href={zap} style={s.topoWhats} target="_blank" rel="noopener">WhatsApp</a>
          </nav>
        </div>

        <div style={s.hero}>
          <p style={s.olho}>
            {cem.bairro}, {cem.cidade} — {cem.uf}
            {chegando && " · estamos começando aqui"}
          </p>
          <h1 style={s.h1}>
            {chegando
              ? `Chegamos ao ${cem.nome} — e a primeira limpeza é por nossa conta.`
              : `Cuidamos do túmulo da sua família no ${cem.nome}.`}
          </h1>
          <p style={s.heroTexto}>
            {chegando ? (
              <>
                A gente cuida de túmulos em {MARCA.regiao} há mais de trinta anos, no
                Cemitério da Saudade. Agora estamos atendendo aqui também — e, para as
                primeiras famílias, a <b>primeira limpeza é sem custo</b>: você recebe a
                foto do jazigo limpo e decide depois se quer continuar.
              </>
            ) : (
              <>
                Limpeza e conservação na frequência que você escolher. Terminado o serviço,
                a foto do jazigo limpo chega no seu WhatsApp — mesmo que você não possa ir.
              </>
            )}
          </p>
          <div style={s.botoes}>
            <a href={zap} style={s.botaoOuro} target="_blank" rel="noopener">
              {chegando ? "Quero a primeira limpeza" : "Falar no WhatsApp"}
            </a>
            <Link href="/#contato" style={s.botaoVazio}>Pedir um orçamento</Link>
          </div>
          <p style={s.assinatura}>{MARCA.assinatura}</p>
        </div>
      </header>

      {/* O QUE SÓ VALE PARA ESTE CEMITÉRIO — é a parte que não dá para copiar */}
      <section style={s.secao}>
        <h2 style={s.h2}>
          {chegando ? "Somos novos aqui — e vamos falar disso na cara" : "Por que a gente conhece este cemitério"}
        </h2>
        <p style={{ ...s.p, textAlign: "center", maxWidth: 660, margin: "0 auto" }}>
          {cem.conhecimento}
        </p>
        {chegando && (
          <p style={{ ...s.p, textAlign: "center", maxWidth: 660, margin: "16px auto 0" }}>
            Se quiser conferir antes de confiar, o jeito mais rápido é a primeira limpeza:
            você não paga nada e vê a foto do resultado no mesmo dia.
          </p>
        )}
      </section>

      {/* ================= A OFERTA DE CHEGADA =================
          Só existe onde a gente está entrando. Fica DEPOIS do "somos novos
          aqui" de propósito: a oferta é a resposta à desconfiança que o
          parágrafo de cima acabou de admitir — não um desconto solto. */}
      {chegando && cem.primeiraGratis && (
        <section style={{ ...s.secao, background: c.navy, color: "#fff" }}>
          <h2 style={{ ...s.h2, color: "#fff" }}>A primeira limpeza é por nossa conta</h2>
          <div style={{ maxWidth: 620, margin: "0 auto" }}>
            <ul style={{ ...s.lista, marginBottom: 24 }}>
              {[
                "Você diz qual é o jazigo — quadra e número, ou só o nome de quem está lá.",
                "A gente vai, limpa e manda a foto do jazigo limpo no seu WhatsApp.",
                "Aí você decide se quer que a gente continue cuidando. Sem compromisso nenhum.",
              ].map((t) => (
                <li key={t} style={{ ...s.item, color: "rgba(255,255,255,.85)" }}>
                  <span style={s.tique}>✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p style={{ ...s.p, color: "rgba(255,255,255,.7)", fontSize: 16, textAlign: "center" }}>
              Uma por família, enquanto estivermos abrindo o {cem.nome}. Jazigo que ficou
              muitos anos sem cuidado precisa de uma limpeza pesada primeiro — nesse caso a
              gente diz o valor antes, e você decide.
            </p>
            <div style={{ textAlign: "center", marginTop: 22 }}>
              <a href={zap} style={s.botaoOuro} target="_blank" rel="noopener">
                Quero a primeira limpeza
              </a>
            </div>
          </div>
        </section>
      )}

      {/* como funciona — o MESMO texto da home, de propósito */}
      <section style={{ ...s.secao, background: c.cream }}>
        <h2 style={s.h2}>{SITE.passos.titulo}</h2>
        <div style={s.tres}>
          {SITE.passos.itens.map((i) => (
            <div key={i.n} style={s.passo}>
              <span style={s.numero}>{i.n}</span>
              <h3 style={s.h3}>{i.t}</h3>
              <p style={s.p}>{i.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={s.secao}>
        <h2 style={s.h2}>{SITE.incluso.titulo}</h2>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <ul style={s.lista}>
            {SITE.incluso.itens.map((t) => (
              <li key={t} style={s.item}>
                <span style={s.tique}>✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div style={s.preco}>
            <p style={s.precoOlho}>A partir de</p>
            <p style={s.precoValor}>R$ {PRECO_A_PARTIR_DE}</p>
            <p style={s.precoUnidade}>{PRECO_UNIDADE}</p>
            {chegando && cem.primeiraGratis && (
              <p style={{ ...s.precoOlho, marginTop: 10, color: "#166534", fontWeight: 700 }}>
                a primeira é por nossa conta
              </p>
            )}
            <a href={zap} style={{ ...s.botaoOuro, marginTop: 14 }} target="_blank" rel="noopener">
              Pedir o valor do seu jazigo
            </a>
          </div>
        </div>
      </section>

      <footer style={s.rodape}>
        <p style={s.rodapeTexto}>
          {MARCA.nome} · {MARCA.assinatura}
        </p>
        <p style={s.rodapeTexto}>
          {cem.nome} — {cem.bairro}, {cem.cidade} - {cem.uf}
        </p>
        <p style={s.rodapeTexto}>
          <a href={`tel:+${MARCA.whatsapp}`} style={{ color: "#fff", textDecoration: "none" }}>
            {MARCA.whatsappVisivel}
          </a>
        </p>
        <p style={{ ...s.rodapeTexto, marginTop: 14 }}>
          <Link href="/" style={{ color: c.gold, fontWeight: 700, textDecoration: "none" }}>
            ← Ver todos os cemitérios que a gente atende
          </Link>
        </p>
      </footer>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  pagina: { fontFamily: "Georgia, 'Times New Roman', serif", color: c.navy, background: "#fff", margin: 0 },
  topo: { background: c.navy, color: "#fff", padding: "0 20px 64px" },
  faixa: { maxWidth: 1040, margin: "0 auto", display: "flex", alignItems: "center",
           justifyContent: "space-between", padding: "18px 0", flexWrap: "wrap", gap: 12 },
  marca: { display: "flex", alignItems: "center", gap: 10, color: "#fff",
           textDecoration: "none", fontWeight: 700, fontSize: 20 },
  logo: { borderRadius: 8, display: "block" },
  menu: { display: "flex", gap: 14, alignItems: "center" },
  topoLink: { color: "#cbd5e1", textDecoration: "none", fontSize: 16 },
  topoWhats: { background: c.gold, color: c.navy, textDecoration: "none", fontWeight: 700,
               padding: "10px 18px", borderRadius: 999, fontSize: 16 },
  hero: { maxWidth: 780, margin: "0 auto", textAlign: "center", paddingTop: 34 },
  olho: { color: c.gold, letterSpacing: 1.5, textTransform: "uppercase", fontSize: 14,
          fontFamily: "system-ui, sans-serif", margin: "0 0 14px" },
  h1: { fontSize: 44, lineHeight: 1.15, margin: "0 0 20px", fontWeight: 400 },
  heroTexto: { fontSize: 19, lineHeight: 1.6, color: "rgba(255,255,255,.85)", margin: "0 0 28px" },
  botoes: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  botaoOuro: { display: "inline-block", background: c.gold, color: c.navy, fontWeight: 700,
               padding: "16px 28px", borderRadius: 999, textDecoration: "none", fontSize: 17,
               fontFamily: "system-ui, sans-serif" },
  botaoVazio: { display: "inline-block", border: "1px solid rgba(255,255,255,.4)", color: "#fff",
                padding: "16px 28px", borderRadius: 999, textDecoration: "none", fontSize: 17,
                fontFamily: "system-ui, sans-serif" },
  assinatura: { marginTop: 24, color: "rgba(255,255,255,.6)", fontSize: 15 },
  secao: { padding: "64px 20px" },
  h2: { fontSize: 32, textAlign: "center", fontWeight: 400, margin: "0 0 32px" },
  h3: { fontSize: 21, fontWeight: 400, margin: "0 0 8px" },
  p: { fontSize: 17, lineHeight: 1.65, color: "#334155", margin: 0 },
  tres: { maxWidth: 1040, margin: "0 auto", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 24 },
  passo: { background: "#fff", border: `1px solid ${c.linha}`, borderRadius: 16, padding: 24 },
  numero: { display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 999, background: c.navy, color: "#fff",
            fontSize: 16, marginBottom: 12, fontFamily: "system-ui, sans-serif" },
  lista: { listStyle: "none", padding: 0, margin: "0 0 32px" },
  item: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14,
          fontSize: 17, lineHeight: 1.55, color: "#334155" },
  tique: { color: c.gold, fontWeight: 700 },
  preco: { textAlign: "center", background: c.cream, border: `1px solid ${c.linha}`,
           borderRadius: 16, padding: 28 },
  precoOlho: { fontSize: 15, color: "#64748b", margin: 0, fontFamily: "system-ui, sans-serif" },
  precoValor: { fontSize: 46, margin: "4px 0 0", color: c.navy },
  precoUnidade: { fontSize: 16, color: "#64748b", margin: 0, fontFamily: "system-ui, sans-serif" },
  rodape: { background: c.navy, color: "#fff", padding: "44px 20px", textAlign: "center" },
  rodapeTexto: { color: "rgba(255,255,255,.7)", fontSize: 15, margin: "4px 0" },
};
