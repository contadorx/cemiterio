import Link from "next/link";

import { MARCA } from "@/lib/marca";
import { SITE, PRECO_A_PARTIR_DE, PRECO_UNIDADE, linkWhats } from "@/lib/site";
import FormularioContato from "./_site/FormularioContato";

/**
 * A HOME PÚBLICA — o site do Zelo & Memória.
 *
 * Quem chega aqui é a FAMÍLIA, não a equipe. Painel e app de campo continuam
 * em /painel e /campo; o acesso deles ficou no rodapé, discreto, porque quem
 * trabalha entra uma vez e salva o atalho — e uma tela de sistema na porta da
 * frente espanta quem vinha contratar.
 *
 * Não tem texto escrito dentro deste arquivo: tudo vem de src/lib/site.ts, para
 * você trocar frase e preço sem mexer em layout.
 *
 * Sem framework de CSS, como o resto do projeto: estilo inline, um objeto `s`
 * no fim do arquivo. Layout responsivo com grid + minmax, que se vira sozinho
 * no celular sem media query.
 */

const c = MARCA.cores;

export const metadata = {
  title: `${MARCA.nome} — Limpeza e conservação de jazigos em Mauá`,
  description:
    "Cuidado de túmulos no Cemitério da Saudade, em Mauá. Limpeza na frequência que você escolher, " +
    "com foto do antes e do depois no WhatsApp. Desde 1990.",
  alternates: { canonical: `https://${MARCA.site}` },
  openGraph: {
    title: `${MARCA.nome} — ${MARCA.assinatura}`,
    description: "O túmulo da sua família cuidado, mesmo quando você não pode ir. Foto do antes e do depois, toda visita.",
    url: `https://${MARCA.site}`,
    siteName: MARCA.nome,
    locale: "pt_BR",
    type: "website",
  },
};

// Ficha do negócio para o Google entender que é um serviço local.
// É isto que faz aparecer com endereço e telefone em "limpeza de túmulo Mauá".
const FICHA = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: MARCA.nome,
  description: "Limpeza e conservação de jazigos no Cemitério da Saudade, em Mauá.",
  url: `https://${MARCA.site}`,
  telephone: `+${MARCA.whatsapp}`,
  foundingDate: String(MARCA.desde),
  areaServed: { "@type": "City", name: "Mauá" },
  address: { "@type": "PostalAddress", addressLocality: "Mauá", addressRegion: "SP", addressCountry: "BR" },
  priceRange: "$",
};

export default function Home() {
  return (
    <main style={s.pagina}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FICHA) }} />

      {/* ------------------------------------------------------------------ */}
      {/* TOPO                                                                */}
      {/* ------------------------------------------------------------------ */}
      <header style={s.topo}>
        <div style={s.faixa}>
          <span style={s.marca}>🕊 {MARCA.nome}</span>
          <a href={linkWhats()} style={s.topoWhats} target="_blank" rel="noopener">
            WhatsApp
          </a>
        </div>

        <div style={s.hero}>
          <p style={s.olho}>{SITE.hero.olho}</p>
          <h1 style={s.h1}>{SITE.hero.titulo}</h1>
          <p style={s.heroTexto}>{SITE.hero.texto}</p>
          <div style={s.botoes}>
            <a href={linkWhats()} style={s.botaoOuro} target="_blank" rel="noopener">
              {SITE.hero.cta}
            </a>
            <a href="#contato" style={s.botaoVazio}>
              {SITE.hero.cta2}
            </a>
          </div>
          <p style={s.assinatura}>{MARCA.assinatura}</p>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* A SITUAÇÃO                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section style={s.secao}>
        <h2 style={s.h2}>{SITE.dor.titulo}</h2>
        <div style={s.tres}>
          {SITE.dor.itens.map((i) => (
            <div key={i.t} style={s.cartao}>
              <h3 style={s.h3}>{i.t}</h3>
              <p style={s.p}>{i.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* COMO FUNCIONA                                                       */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* O QUE ENTRA + PREÇO                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section style={s.secao}>
        <div style={s.duas}>
          <div>
            <h2 style={{ ...s.h2, textAlign: "left", marginBottom: 20 }}>{SITE.incluso.titulo}</h2>
            <ul style={s.lista}>
              {SITE.incluso.itens.map((t) => (
                <li key={t} style={s.item}>
                  <span style={s.tique}>✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>

            <h3 style={{ ...s.h3, marginTop: 28 }}>{SITE.incluso.extras.titulo}</h3>
            <ul style={s.lista}>
              {SITE.incluso.extras.itens.map((t) => (
                <li key={t} style={s.item}>
                  <span style={{ ...s.tique, color: c.suave }}>+</span>
                  <span style={{ color: c.suave }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <aside style={s.preco}>
            <p style={s.precoRotulo}>A partir de</p>
            <p style={s.precoValor}>
              <span style={{ fontSize: 22, verticalAlign: "top", marginRight: 4 }}>R$</span>
              {PRECO_A_PARTIR_DE}
            </p>
            <p style={s.precoUnidade}>{PRECO_UNIDADE}</p>
            <p style={s.precoTexto}>
              O valor final depende do tamanho do jazigo, de como ele está hoje e da
              frequência. A gente diz o preço antes de começar — e o que estiver fora do
              combinado é perguntado, nunca cobrado de surpresa.
            </p>
            <a href={linkWhats("Ola! Queria saber o valor para o jazigo da minha familia.")}
               style={{ ...s.botaoOuro, width: "100%", boxSizing: "border-box", textAlign: "center" }}
               target="_blank" rel="noopener">
              Perguntar o valor
            </a>
          </aside>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* DATAS                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section style={{ ...s.secao, background: c.navy, color: "#fff" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ ...s.h2, color: "#fff" }}>{SITE.datas.titulo}</h2>
          <p style={{ ...s.p, color: "rgba(255,255,255,0.85)", fontSize: 18 }}>{SITE.datas.texto}</p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* QUEM CUIDA                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section style={s.secao}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <h2 style={s.h2}>{SITE.prova.titulo}</h2>
          <p style={{ ...s.p, fontSize: 17 }}>{SITE.prova.texto}</p>
        </div>

        {SITE.prova.mostrarFotos ? (
          <div style={{ ...s.tres, marginTop: 36 }}>
            {SITE.prova.fotos.map((f) => (
              <figure key={f.antes} style={s.par}>
                <div style={s.parFotos}>
                  <img src={f.antes} alt="Antes do serviço" style={s.foto} />
                  <img src={f.depois} alt="Depois do serviço" style={s.foto} />
                </div>
                <figcaption style={s.legenda}>{f.legenda}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FAQ                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section style={{ ...s.secao, background: c.cream }}>
        <h2 style={s.h2}>{SITE.faq.titulo}</h2>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 12 }}>
          {SITE.faq.itens.map((f) => (
            <details key={f.p} style={s.detalhe}>
              <summary style={s.pergunta}>{f.p}</summary>
              <p style={{ ...s.p, marginTop: 10, marginBottom: 0 }}>{f.r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* CONTATO                                                             */}
      {/* ------------------------------------------------------------------ */}
      <section id="contato" style={s.secao}>
        <h2 style={s.h2}>{SITE.form.titulo}</h2>
        <p style={{ ...s.p, textAlign: "center", maxWidth: 560, margin: "0 auto 28px" }}>
          {SITE.form.texto}
        </p>
        <FormularioContato />

        <p style={{ textAlign: "center", marginTop: 28, color: c.suave, fontSize: 15 }}>
          Ou, se for mais fácil,{" "}
          <a href={linkWhats()} style={s.linkTexto} target="_blank" rel="noopener">
            chame no WhatsApp agora
          </a>
          .
        </p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* RODAPÉ                                                              */}
      {/* ------------------------------------------------------------------ */}
      <footer style={s.rodape}>
        <div style={s.rodapeGrid}>
          <div>
            <p style={{ ...s.marca, color: "#fff", fontSize: 18 }}>🕊 {MARCA.nome}</p>
            <p style={s.rodapeTexto}>{MARCA.assinatura}</p>
            <p style={s.rodapeTexto}>{MARCA.cemiterio}</p>
            <p style={s.rodapeTexto}>{MARCA.endereco}</p>
          </div>
          <div>
            <a href={linkWhats()} style={s.rodapeLink} target="_blank" rel="noopener">
              Falar no WhatsApp
            </a>
            <a href="#contato" style={s.rodapeLink}>
              Pedir um orçamento
            </a>
          </div>
        </div>

        <div style={s.rodapeFim}>
          <span>
            © {MARCA.desde}–{new Date().getFullYear()} {MARCA.nome}
          </span>
          {/* acesso da equipe: existe, mas não disputa atenção com o visitante */}
          <span style={{ display: "flex", gap: 18 }}>
            <Link href="/painel" style={s.equipe}>
              Painel
            </Link>
            <Link href="/campo" style={s.equipe}>
              App de campo
            </Link>
          </span>
        </div>
      </footer>

      {/* botão flutuante: em celular, a pessoa decide no meio da leitura */}
      <a href={linkWhats()} style={s.flutuante} target="_blank" rel="noopener" aria-label="Falar no WhatsApp">
        <span style={{ fontSize: 20 }}>💬</span>
        <span>WhatsApp</span>
      </a>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  pagina: {
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    color: c.navy,
    background: "#fff",
    margin: 0,
    lineHeight: 1.6,
  },

  // topo
  topo: { background: c.navy, color: "#fff", paddingBottom: 72 },
  faixa: {
    maxWidth: 1080,
    margin: "0 auto",
    padding: "20px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  marca: { fontSize: 19, fontWeight: 700, letterSpacing: 0.2 },
  topoWhats: {
    color: c.gold,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 15,
    border: `1px solid ${c.gold}`,
    padding: "8px 16px",
    borderRadius: 999,
  },
  hero: { maxWidth: 820, margin: "0 auto", padding: "48px 24px 0", textAlign: "center" },
  olho: {
    margin: "0 0 16px",
    color: c.gold,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  h1: { margin: "0 0 20px", fontSize: 40, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.5 },
  heroTexto: { margin: "0 auto 32px", fontSize: 18.5, color: "rgba(255,255,255,0.82)", maxWidth: 620 },
  botoes: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  botaoOuro: {
    display: "inline-block",
    padding: "16px 30px",
    background: c.gold,
    color: c.navy,
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 17,
  },
  botaoVazio: {
    display: "inline-block",
    padding: "16px 30px",
    background: "transparent",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 17,
  },
  assinatura: { marginTop: 28, marginBottom: 0, color: "rgba(255,255,255,0.5)", fontSize: 14 },

  // seções
  secao: { padding: "72px 24px" },
  h2: { fontSize: 30, textAlign: "center", margin: "0 0 36px", fontWeight: 700, letterSpacing: -0.3 },
  h3: { fontSize: 18, margin: "0 0 8px", fontWeight: 700 },
  p: { margin: 0, fontSize: 16, color: c.suave, lineHeight: 1.7 },

  tres: {
    maxWidth: 1080,
    margin: "0 auto",
    display: "grid",
    gap: 24,
    gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
  },
  duas: {
    maxWidth: 1080,
    margin: "0 auto",
    display: "grid",
    gap: 40,
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    alignItems: "start",
  },
  cartao: { padding: 24, border: `1px solid ${c.linha}`, borderRadius: 14, background: "#fff" },
  passo: { padding: 4 },
  numero: {
    display: "inline-grid",
    placeItems: "center",
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: c.navy,
    color: c.gold,
    fontWeight: 700,
    fontSize: 17,
    marginBottom: 14,
  },

  lista: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 },
  item: { display: "flex", gap: 12, alignItems: "flex-start", fontSize: 16, lineHeight: 1.6 },
  tique: { color: c.gold, fontWeight: 700, flexShrink: 0 },

  preco: {
    padding: 32,
    background: c.cream,
    border: `1px solid ${c.linha}`,
    borderRadius: 16,
    textAlign: "center",
  },
  precoRotulo: { margin: 0, fontSize: 13, letterSpacing: 1.2, textTransform: "uppercase", color: c.suave, fontWeight: 700 },
  precoValor: { margin: "6px 0 0", fontSize: 56, fontWeight: 700, lineHeight: 1, letterSpacing: -1 },
  precoUnidade: { margin: "6px 0 20px", fontSize: 15, color: c.suave },
  precoTexto: { margin: "0 0 24px", fontSize: 14.5, color: c.suave, lineHeight: 1.7, textAlign: "left" },

  par: { margin: 0 },
  parFotos: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  foto: { width: "100%", height: 200, objectFit: "cover", borderRadius: 10, display: "block" },
  legenda: { marginTop: 10, fontSize: 13.5, color: c.suave },

  detalhe: {
    background: "#fff",
    border: `1px solid ${c.linha}`,
    borderRadius: 12,
    padding: "18px 22px",
  },
  pergunta: { fontWeight: 700, fontSize: 16.5, cursor: "pointer", listStyle: "none" },

  linkTexto: { color: c.navy, fontWeight: 700 },

  // rodapé
  rodape: { background: c.navy, color: "#fff", padding: "56px 24px 28px" },
  rodapeGrid: {
    maxWidth: 1080,
    margin: "0 auto",
    display: "grid",
    gap: 28,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  },
  rodapeTexto: { margin: "4px 0", fontSize: 14.5, color: "rgba(255,255,255,0.6)" },
  rodapeLink: {
    display: "block",
    color: c.gold,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 15.5,
    marginBottom: 10,
  },
  rodapeFim: {
    maxWidth: 1080,
    margin: "36px auto 0",
    paddingTop: 20,
    borderTop: "1px solid rgba(255,255,255,0.12)",
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "space-between",
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
  },
  equipe: { color: "rgba(255,255,255,0.45)", textDecoration: "none" },

  flutuante: {
    position: "fixed",
    right: 18,
    bottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "13px 20px",
    background: "#25d366",
    color: "#0b3d1f",
    borderRadius: 999,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 15,
    boxShadow: "0 6px 20px rgba(0,0,0,0.22)",
    zIndex: 50,
  },
};
