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
          {/* o logo ja existia no projeto como icone do app (public/icon-192.png):
              o escudo navy com o ramo de oliveira. Trocar o arquivo troca em
              todo lugar — topo, rodape, icone do celular e aba do navegador. */}
          <Link href="/" style={s.marca}>
            <img src="/icon-192.png" alt="" width={38} height={38} style={s.logo} />
            <span>{MARCA.nome}</span>
          </Link>
          <nav style={s.menu}>
            <Link href="/familia" style={s.topoLink}>
              Já sou cliente
            </Link>
            <a href={linkWhats()} style={s.topoWhats} target="_blank" rel="noopener">
              WhatsApp
            </a>
          </nav>
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
      {/* A CONVERSA — a parte visual                                         */}
      {/*                                                                     */}
      {/* Vem logo depois do passo 3 ("você recebe a foto") porque MOSTRA o    */}
      {/* passo 3 em vez de prometer. O desenho da lápide é desenho mesmo,     */}
      {/* de propósito: enquanto não houver foto real, exemplo tem que ter     */}
      {/* cara de exemplo. Foto de banco de imagem aqui seria mentira.        */}
      {/* ------------------------------------------------------------------ */}
      <section style={{ ...s.secao, background: c.navy, color: "#fff" }}>
        <div style={s.duas}>
          <div style={{ alignSelf: "center" }}>
            <p style={{ ...s.olho, textAlign: "left" }}>No dia do serviço</p>
            <h2 style={{ ...s.h2, color: "#fff", textAlign: "left", marginBottom: 18 }}>
              Assim chega no seu celular
            </h2>
            <p style={{ ...s.p, color: "rgba(255,255,255,0.8)", fontSize: 17, marginBottom: 18 }}>
              Nada de relatório para você abrir, nem senha para lembrar. A mensagem chega
              no WhatsApp que você já usa, com a foto de antes e a de depois — do mesmo
              ângulo, para dar para comparar de verdade.
            </p>
            <p style={{ ...s.p, color: "rgba(255,255,255,0.8)", fontSize: 17 }}>
              Se preferir ver tudo junto, cada família tem uma página só dela com o
              histórico de todas as visitas.{" "}
              <Link href="/familia" style={{ color: c.gold, fontWeight: 700 }}>
                Já é cliente? Pegue o seu link
              </Link>
              .
            </p>
          </div>

          <div style={s.celularFora}>
            <div style={s.celular}>
              <div style={s.zapTopo}>
                <img src="/icon-192.png" alt="" width={30} height={30} style={s.logo} />
                <div>
                  <p style={s.zapNome}>{MARCA.nome}</p>
                  <p style={s.zapStatus}>online</p>
                </div>
              </div>

              <div style={s.zapCorpo}>
                <Balao hora="09:12">
                  Bom dia, dona Cleide. Passamos hoje no jazigo do seu pai. 🌿
                </Balao>

                <Balao hora="09:13" foto={<Lapide estado="antes" />} etiqueta="Antes" />
                <Balao hora="09:13" foto={<Lapide estado="depois" />} etiqueta="Depois" />

                <Balao hora="09:14">
                  Tudo certo por aqui. A próxima visita fica para 12 de setembro — e no dia 3
                  de outubro, aniversário dele, a gente deixa preparado.
                </Balao>
              </div>
            </div>
            <p style={s.exemplo}>Exemplo ilustrativo de uma mensagem de visita</p>
          </div>
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
            <p style={{ ...s.marca, color: "#fff", fontSize: 18, marginTop: 0 }}>
              <img src="/icon-192.png" alt="" width={34} height={34} style={s.logo} />
              <span>{MARCA.nome}</span>
            </p>
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
            <Link href="/familia" style={s.rodapeLink}>
              Já sou cliente — ver o acompanhamento
            </Link>
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

/** Um balão de mensagem recebida, com ou sem foto dentro. */
function Balao({
  children,
  hora,
  foto,
  etiqueta,
}: {
  children?: React.ReactNode;
  hora: string;
  foto?: React.ReactNode;
  etiqueta?: string;
}) {
  return (
    <div style={s.balao}>
      {foto ? (
        <div style={s.balaoFoto}>
          {foto}
          {etiqueta ? <span style={s.etiqueta}>{etiqueta}</span> : null}
        </div>
      ) : null}
      {children ? <p style={s.balaoTexto}>{children}</p> : null}
      <span style={s.hora}>{hora} ✓✓</span>
    </div>
  );
}

/**
 * O desenho da lápide, em dois estados.
 *
 * É SVG desenhado à mão, não foto. Duas razões: não existe foto real aprovada
 * ainda, e foto de banco de imagem num serviço como este é mentira que o cliente
 * percebe. Desenho todo mundo entende como exemplo.
 *
 * O par usa exatamente o mesmo enquadramento — que é a regra do serviço.
 */
function Lapide({ estado }: { estado: "antes" | "depois" }) {
  const sujo = estado === "antes";
  const pedra = sujo ? "#8d8b7a" : "#e8e3d6";
  const sombra = sujo ? "#6f6d5e" : "#cfc9b8";
  const risco = sujo ? "#6f6d5e" : "#a9a290";
  const chao = sujo ? "#6b7355" : "#b9bda3";

  return (
    <svg viewBox="0 0 220 150" style={{ width: "100%", display: "block", background: sujo ? "#7c8168" : "#cdd2bb" }}>
      {/* chão */}
      <rect x="0" y="112" width="220" height="38" fill={chao} />

      {/* base do túmulo */}
      <rect x="42" y="96" width="136" height="20" rx="3" fill={sombra} />
      <rect x="48" y="90" width="124" height="10" rx="2" fill={pedra} />

      {/* lápide */}
      <path d="M74 90 V46 a36 36 0 0 1 72 0 V90 Z" fill={pedra} />

      {/* inscrição */}
      <rect x="92" y="52" width="36" height="4" rx="2" fill={risco} />
      <rect x="88" y="62" width="44" height="3" rx="1.5" fill={risco} opacity="0.75" />
      <rect x="96" y="70" width="28" height="3" rx="1.5" fill={risco} opacity="0.55" />

      {sujo ? (
        <>
          {/* manchas e mato: o que o tempo faz */}
          <ellipse cx="88" cy="80" rx="12" ry="7" fill="#5f6b4a" opacity="0.5" />
          <ellipse cx="132" cy="60" rx="9" ry="14" fill="#5f6b4a" opacity="0.35" />
          <ellipse cx="110" cy="93" rx="30" ry="5" fill="#5f6b4a" opacity="0.4" />
          <path d="M46 112 q4-16 9-20 M52 112 q1-14 7-19 M168 112 q-4-15-10-19 M176 112 q-2-12-8-16"
                stroke="#4f5c3a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M60 116 q6-10 12-12 M156 116 q-7-9-13-11"
                stroke="#4f5c3a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* limpo, e um vaso com flor */}
          <rect x="150" y="100" width="16" height="16" rx="2" fill="#b08968" />
          <path d="M158 100 V88" stroke="#4f6b3a" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="158" cy="84" r="5" fill="#c96a7a" />
          <circle cx="152" cy="88" r="3.4" fill="#d98a97" />
          <circle cx="164" cy="88" r="3.4" fill="#d98a97" />
          <path d="M78 44 a32 32 0 0 1 24-14" stroke="#fff" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
        </>
      )}
    </svg>
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
  marca: {
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: 0.2,
    color: "#fff",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logo: { borderRadius: 8, display: "block", flexShrink: 0 },
  menu: { display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" },
  topoLink: { color: "rgba(255,255,255,0.72)", textDecoration: "none", fontSize: 14.5, fontWeight: 600 },
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
  // clamp() = o texto acompanha a largura da tela sem media query: no celular
  // encolhe sozinho, no monitor nao passa do teto.
  h1: { margin: "0 0 20px", fontSize: "clamp(27px, 6.4vw, 40px)", lineHeight: 1.22, fontWeight: 700, letterSpacing: -0.5 },
  heroTexto: { margin: "0 auto 32px", fontSize: "clamp(16px, 4.2vw, 18.5px)", color: "rgba(255,255,255,0.82)", maxWidth: 620 },
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
  secao: { padding: "clamp(52px, 9vw, 72px) 24px" },
  h2: { fontSize: "clamp(23px, 5.2vw, 30px)", textAlign: "center", margin: "0 0 36px", fontWeight: 700, letterSpacing: -0.3 },
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
  precoValor: { margin: "6px 0 0", fontSize: "clamp(44px, 11vw, 56px)", fontWeight: 700, lineHeight: 1, letterSpacing: -1 },
  precoUnidade: { margin: "6px 0 20px", fontSize: 15, color: c.suave },
  precoTexto: { margin: "0 0 24px", fontSize: 14.5, color: c.suave, lineHeight: 1.7, textAlign: "left" },

  // a conversa ilustrada
  celularFora: { display: "grid", justifyItems: "center", gap: 12 },
  celular: {
    width: "100%",
    maxWidth: 330,
    background: "#ece5dd",
    borderRadius: 26,
    overflow: "hidden",
    border: "6px solid #0a1a33",
    boxShadow: "0 18px 44px rgba(0,0,0,0.35)",
  },
  zapTopo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    background: "#0b2340",
  },
  zapNome: { margin: 0, fontSize: 14.5, fontWeight: 700, color: "#fff", lineHeight: 1.2 },
  zapStatus: { margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.55)" },
  zapCorpo: { padding: 14, display: "grid", gap: 10 },
  balao: {
    background: "#fff",
    borderRadius: 12,
    borderTopLeftRadius: 3,
    padding: 8,
    maxWidth: "88%",
    boxShadow: "0 1px 1px rgba(0,0,0,0.12)",
    position: "relative",
  },
  balaoFoto: { position: "relative", borderRadius: 8, overflow: "hidden" },
  balaoTexto: { margin: "6px 4px 2px", fontSize: 13.5, lineHeight: 1.5, color: "#111b21" },
  etiqueta: {
    position: "absolute",
    left: 8,
    top: 8,
    background: "rgba(0,0,0,0.62)",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    padding: "3px 9px",
    borderRadius: 999,
    textTransform: "uppercase",
  },
  hora: { display: "block", textAlign: "right", fontSize: 10.5, color: "#8696a0", marginTop: 2, marginRight: 4 },
  exemplo: { margin: 0, fontSize: 12.5, color: "rgba(255,255,255,0.45)", textAlign: "center" },

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
