"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, Home, Inbox, MapPin, Receipt, Settings,
  Sparkles, Users, MessageCircle, LogOut,
} from "lucide-react";

/**
 * A COLUNA — a identidade do produto.
 *
 * Escura nos dois temas, de propósito: é ela que dá ao painel a cara de
 * sistema, separando "onde eu ando" de "o que eu estou fazendo". Sem ela,
 * cada tela parecia uma página solta.
 *
 * Os itens vêm em GRUPOS porque nove links em lista corrida não têm hierarquia
 * — a Sureya lia todos toda vez para achar um. Agrupados, ela olha o bloco.
 */

const DIA_A_DIA = [
  { href: "/painel", label: "O mês", icon: Home },
  { href: "/painel/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/painel/fila", label: "Liberação", icon: Inbox },
  { href: "/painel/avulsos", label: "Avulsos", icon: Sparkles },
  { href: "/campo", label: "Campo", icon: MapPin },
];

const CARTEIRA = [
  { href: "/painel/clientes", label: "Famílias", icon: Users },
  { href: "/painel/financeiro", label: "Financeiro", icon: Receipt },
];

const AJUSTES = [
  { href: "/painel/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/painel/config", label: "Configurações", icon: Settings },
];

export default function Sidebar({ aoNavegar }: { aoNavegar?: () => void }) {
  const caminho = usePathname();

  // "/painel" só está ativo na raiz: sem isto ele acenderia junto com todas as
  // telas filhas, e a Sureya veria dois itens marcados ao mesmo tempo.
  const ativo = (href: string) =>
    href === "/painel" ? caminho === "/painel" : caminho.startsWith(href);

  const grupo = (titulo: string, itens: typeof DIA_A_DIA) => (
    <div className="mb-5">
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-rail-muted">
        {titulo}
      </p>
      {itens.map(({ href, label, icon: Icone }) => (
        <Link
          key={href}
          href={href}
          onClick={aoNavegar}
          aria-current={ativo(href) ? "page" : undefined}
          className={[
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
            ativo(href)
              ? "bg-rail-hover font-semibold text-sobre"
              : "text-rail-muted hover:bg-rail-hover hover:text-sobre",
          ].join(" ")}
        >
          {/* O item ativo ganha um filete dourado. A cor sozinha não bastaria
              para quem não distingue bem tons sobre fundo escuro. */}
          <span
            aria-hidden
            className={[
              "h-5 w-[3px] rounded-full",
              ativo(href) ? "bg-ouro" : "bg-transparent",
            ].join(" ")}
          />
          <Icone size={18} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </div>
  );

  return (
    <nav className="flex h-full flex-col overflow-y-auto bg-rail px-3 py-5">
      <div className="mb-6 px-3">
        <p className="text-[17px] font-semibold leading-tight text-sobre">
          Zelo &amp; Memória
        </p>
        <p className="text-[12px] text-rail-muted">Dona Nadir · desde 1990</p>
      </div>

      {grupo("Dia a dia", DIA_A_DIA)}
      {grupo("Carteira", CARTEIRA)}
      {grupo("Ajustes", AJUSTES)}

      <form action="/api/sair" method="post" className="mt-auto px-1">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-rail-muted transition-colors hover:bg-rail-hover hover:text-sobre"
        >
          <span aria-hidden className="h-5 w-[3px]" />
          <LogOut size={18} strokeWidth={2} />
          Sair
        </button>
      </form>
    </nav>
  );
}
