"use client";

import { useEffect, useState } from "react";

/**
 * INSTALAR NO CELULAR + AVISAR QUANDO CHEGAR MENSAGEM
 *
 * Dois problemas resolvidos aqui:
 *
 * 1. O Android só oferece "instalar" quando existe manifest válido, ícones de
 *    verdade e service worker — e mesmo assim esconde a opção num menu que
 *    ninguém acha. Então capturamos o evento e mostramos um botão claro.
 *
 * 2. Notificação: sem isso, saber que uma família respondeu depende de abrir o
 *    sistema e olhar. Com a permissão concedida, o navegador avisa mesmo com a
 *    aba fechada (no Android, via service worker).
 */

export default function InstalarApp({ contexto = "painel" }: { contexto?: "painel" | "campo" }) {
  const [evento, setEvento] = useState<any>(null);
  const [instalado, setInstalado] = useState(false);
  const [permissao, setPermissao] = useState<NotificationPermission | "indisponivel">("default");
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    // já está rodando como app instalado?
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setInstalado(standalone);

    setPermissao("Notification" in window ? Notification.permission : "indisponivel");
    setDispensado(localStorage.getItem("zm-instalar-dispensado") === "1");

    const capturar = (e: any) => {
      e.preventDefault();       // impede o banner automático do Chrome
      setEvento(e);
    };
    window.addEventListener("beforeinstallprompt", capturar);
    window.addEventListener("appinstalled", () => setInstalado(true));
    return () => window.removeEventListener("beforeinstallprompt", capturar);
  }, []);

  async function instalar() {
    if (!evento) return;
    evento.prompt();
    const r = await evento.userChoice;
    if (r?.outcome === "accepted") setInstalado(true);
    setEvento(null);
  }

  async function pedirNotificacao() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPermissao(p);
    if (p === "granted") {
      new Notification("Pronto!", {
        body: "Vou te avisar quando uma família responder.",
        icon: "/icon-192.png",
      });
    }
  }

  function dispensar() {
    localStorage.setItem("zm-instalar-dispensado", "1");
    setDispensado(true);
  }

  const precisaInstalar = !instalado && evento && !dispensado;
  const precisaNotificacao = permissao === "default";

  if (!precisaInstalar && !precisaNotificacao) return null;

  return (
    <div style={s.caixa}>
      {precisaInstalar && (
        <div style={s.bloco}>
          <div>
            <strong style={s.titulo}>Deixe o atalho no celular</strong>
            <p style={s.texto}>
              {contexto === "campo"
                ? "Fica com ícone na tela inicial, abre direto no seu dia e funciona mesmo sem sinal."
                : "Abre como aplicativo, sem a barra do navegador."}
            </p>
          </div>
          <div style={s.acoes}>
            <button style={s.botao} onClick={instalar}>Instalar</button>
            <button style={s.botaoSec} onClick={dispensar}>Agora não</button>
          </div>
        </div>
      )}

      {precisaNotificacao && (
        <div style={s.bloco}>
          <div>
            <strong style={s.titulo}>Quer ser avisado?</strong>
            <p style={s.texto}>
              Assim você sabe na hora quando uma família responder, sem precisar
              ficar abrindo o sistema.
            </p>
          </div>
          <div style={s.acoes}>
            <button style={s.botao} onClick={pedirNotificacao}>Quero ser avisado</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dispara uma notificação local (usada quando o sistema detecta novidade). */
/**
 * Mostra um aviso no aparelho.
 *
 * No Chrome do Android, `new Notification()` lança "Illegal constructor" — lá o
 * caminho certo é pedir ao service worker. Tentamos primeiro por ele e só caímos
 * no construtor direto no computador, onde ele funciona.
 *
 * Nunca lança: um aviso que falha não pode derrubar a tela.
 */
export function avisar(titulo: string, corpo: string, url?: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const opcoes: NotificationOptions = {
    body: corpo,
    icon: "/icon-192.png",
    badge: "/icon-notificacao.png",
    tag: "zm-novidade",
    data: { url },
  };

  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(titulo, opcoes))
        .catch(() => notificacaoDireta(titulo, opcoes, url));
      return;
    }
  } catch { /* segue para o caminho direto */ }

  notificacaoDireta(titulo, opcoes, url);
}

function notificacaoDireta(titulo: string, opcoes: NotificationOptions, url?: string) {
  try {
    const n = new Notification(titulo, opcoes);
    if (url) n.onclick = () => { window.focus(); location.href = url; };
  } catch { /* Android sem service worker pronto: sem aviso, e tudo bem */ }
}

const NAVY = "#12284b";
const TEAL = "#0f766e";
const s: Record<string, React.CSSProperties> = {
  caixa: { marginBottom: 14 },
  bloco: {
    background: "#fff", border: "1px solid #e7e0cf", borderLeft: `4px solid ${TEAL}`,
    borderRadius: 12, padding: 14, marginBottom: 8,
    display: "flex", gap: 12, justifyContent: "space-between",
    alignItems: "center", flexWrap: "wrap",
  },
  titulo: { color: NAVY, fontSize: 15 },
  texto: { color: "#475569", fontSize: 14, margin: "4px 0 0", maxWidth: 420, lineHeight: 1.4 },
  acoes: { display: "flex", gap: 8, flexWrap: "wrap" },
  botao: {
    minHeight: 44, padding: "10px 18px", background: TEAL, color: "#fff",
    border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
  botaoSec: {
    minHeight: 44, padding: "10px 16px", background: "#fff", color: "#475569",
    border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 15, cursor: "pointer",
  },
};
