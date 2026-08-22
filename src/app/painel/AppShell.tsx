"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";

/**
 * O ESQUELETO DO PAINEL.
 *
 * Duas formas para a mesma navegação:
 *   · no desktop, a coluna fica fixa à esquerda — sempre visível, porque há
 *     espaço de sobra e a Sureya troca de tela o tempo todo;
 *   · no celular, ela vira gaveta. Uma coluna fixa comeria metade da tela de
 *     um aparelho de 360px, e é no celular que o trabalho acontece.
 *
 * O conteúdo tem largura máxima. Texto que atravessa um monitor inteiro fica
 * difícil de ler: o olho perde a linha ao voltar.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [gaveta, setGaveta] = useState(false);
  const caminho = usePathname();

  // Navegar fecha a gaveta — senão ela cobre a tela que a pessoa acabou de abrir.
  useEffect(() => { setGaveta(false); }, [caminho]);

  // Esc fecha, como qualquer camada sobreposta.
  useEffect(() => {
    if (!gaveta) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setGaveta(false); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [gaveta]);

  // Trava a rolagem do fundo enquanto a gaveta está aberta: sem isso a página
  // desliza atrás dela e a pessoa perde o lugar onde estava.
  useEffect(() => {
    document.body.style.overflow = gaveta ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [gaveta]);

  return (
    <div className="min-h-screen bg-surface">
      {/* coluna fixa — só a partir de md */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 md:block">
        <Sidebar />
      </aside>

      {/* barra do celular */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-card px-4 py-3 md:hidden">
        <button
          onClick={() => setGaveta(true)}
          aria-label="Abrir menu"
          className="-ml-1 rounded-lg p-2 text-ink-muted hover:bg-surface"
        >
          <Menu size={22} />
        </button>
        <span className="font-semibold text-ink">Zelo &amp; Memória</span>
      </header>

      {/* gaveta */}
      {gaveta && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Fechar menu"
            onClick={() => setGaveta(false)}
            className="absolute inset-0 h-full w-full bg-black/50"
          />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <button
              onClick={() => setGaveta(false)}
              aria-label="Fechar menu"
              className="absolute right-2 top-3 z-10 rounded-lg p-2 text-rail-muted hover:text-sobre"
            >
              <X size={20} />
            </button>
            <Sidebar aoNavegar={() => setGaveta(false)} />
          </div>
        </div>
      )}

      <main className="md:pl-60">
        <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
