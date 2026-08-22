"use client";

import { useEffect } from "react";

/**
 * Registra o service worker e — importante — garante que uma versão nova
 * substitua a antiga na hora.
 *
 * Sem isso, o service worker velho continua no comando até a pessoa fechar
 * todas as abas. Foi o que causou a tela branca depois de uma publicação:
 * o aparelho servia a página antiga, que pedia arquivos de código que já
 * não existiam mais.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let recarregando = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        // procura versão nova a cada carregamento e de hora em hora
        reg.update().catch(() => null);
        const t = setInterval(() => reg.update().catch(() => null), 60 * 60 * 1000);

        reg.addEventListener("updatefound", () => {
          const novo = reg.installing;
          if (!novo) return;
          novo.addEventListener("statechange", () => {
            // versão nova pronta e já havia uma antiga no comando: troca agora
            if (novo.state === "installed" && navigator.serviceWorker.controller) {
              novo.postMessage("atualizar");
            }
          });
        });

        return () => clearInterval(t);
      })
      .catch(() => {
        /* sem service worker o app segue funcionando, só não instala */
      });

    // quando a versão nova assume, recarrega uma vez para pegar o código novo
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    });
  }, []);

  return null;
}
