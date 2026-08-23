"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, Home, Inbox, Landmark, LogOut, MapPin, Receipt, Settings, Sparkles, Users } from "lucide-react";

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
  // CONVERSAS é uma entrada só para tudo que é falar com a família: a
  // liberação das mensagens preparadas, as conversas de WhatsApp e quem
  // escreveu pelo site. Eram três endereços — e, embaixo deles, duas filas
  // de mensagem esperando decisão, das quais só uma tinha tela que alguém
  // abria. Ver 0094 e D-16.
  { href: "/painel/conversas", label: "Conversas", icon: Inbox },
  { href: "/painel/avulsos", label: "Avulsos", icon: Sparkles },
  { href: "/campo", label: "Campo", icon: MapPin },
];

const CARTEIRA = [
  { href: "/painel/clientes", label: "Famílias", icon: Users },
  // Onde se edita e corrige jazigo — inclusive os que ainda não têm família,
  // que é o caso de tudo que a Nina cadastra no campo.
  { href: "/painel/jazigos", label: "Jazigos", icon: Landmark },
  { href: "/painel/financeiro", label: "Financeiro", icon: Receipt },
  // A dupla conferência do cadastro (Build 7, etapa 1). Fica na carteira e não
  // no dia a dia de propósito: é trabalho de preparação, feito uma vez por
  // família, não algo que se abre todo dia.
  { href: "/painel/conferencia", label: "Conferência", icon: ClipboardCheck },
];

// A CONEXÃO DO WHATSAPP É UMA ABA DE CONFIGURAÇÕES.
//
// Ela tinha entrada própria no menu, ao lado de Configurações — duas portas
// para a mesma casa. O endereço `/painel/whatsapp` continua de pé,
// redirecionando, porque está em links dentro do sistema (o aviso da fila
// aponta para lá quando a instância cai).
//
// "Ajustes" também sai como grupo: com um item só, o título do grupo era mais
// alto que o próprio item.
const AJUSTES = [
  { href: "/painel/config", label: "Configurações", icon: Settings },
];

export default function Sidebar({ aoNavegar }: { aoNavegar?: () => void }) {
  const caminho = usePathname();

  // "/painel" só está ativo na raiz: sem isto ele acenderia junto com todas as
  // telas filhas, e a Sureya veria dois itens marcados ao mesmo tempo.
  const ativo = (href: string) =>
    href === "/painel" ? caminho === "/painel" : caminho.startsWith(href);

  const grupo = (titulo: string, itens: typeof DIA_A_DIA) => (
    <div className="mb-3">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-rail-muted">
        {titulo}
      </p>
      {itens.map(({ href, label, icon: Icone }) => (
        <Link
          key={href}
          href={href}
          onClick={aoNavegar}
          aria-current={ativo(href) ? "page" : undefined}
          className={[
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] transition-colors",
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
              "h-4 w-[3px] rounded-full",
              ativo(href) ? "bg-ouro" : "bg-transparent",
            ].join(" ")}
          />
          <Icone size={17} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </div>
  );

  return (
    <nav className="flex h-full flex-col overflow-y-auto bg-rail px-3 py-4">
      <div className="mb-4 px-3">
        <p className="text-[15px] font-semibold leading-tight text-sobre">
          Zelo &amp; Memória
        </p>
        <p className="text-[11px] text-rail-muted">Dona Nadir · desde 1990</p>
      </div>

      {grupo("Dia a dia", DIA_A_DIA)}
      {grupo("Carteira", CARTEIRA)}
      {grupo("Ajustes", AJUSTES)}

      <form action="/api/sair" method="post" className="mt-auto px-1">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-rail-muted transition-colors hover:bg-rail-hover hover:text-sobre"
        >
          <span aria-hidden className="h-4 w-[3px]" />
          <LogOut size={17} strokeWidth={2} />
          Sair
        </button>
      </form>
    </nav>
  );
}
