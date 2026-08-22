"use client";

import { useEffect } from "react";

// Registra o service worker do app de campo (PWA) para funcionar offline.
export default function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sem SW, o app ainda funciona online */
      });
    }
  }, []);
  return null;
}
