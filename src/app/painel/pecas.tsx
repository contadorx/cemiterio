"use client";

/**
 * As peças de tela, num lugar só.
 *
 * Existem porque cada tela vinha desenhando o próprio cartão, o próprio
 * rótulo e o próprio botão com objetos de estilo em linha — e por isso duas
 * telas do mesmo sistema nunca ficavam iguais. Aqui a decisão é tomada uma
 * vez.
 */

export function Cartao({
  titulo, acao, children, className = "",
}: {
  titulo?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-3 rounded-xl2 border border-line bg-card p-4 ${className}`}>
      {(titulo || acao) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {titulo && (
            <h2 className="text-[15px] font-semibold text-ink">{titulo}</h2>
          )}
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export function Campo({
  rotulo, dica, children,
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink-muted">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-[12px] text-ink-soft">{dica}</span>}
    </label>
  );
}

const CONTROLE =
  "w-full rounded-lg border border-line bg-card px-3 py-2.5 text-[15px] text-ink " +
  "placeholder:text-ink-soft focus:border-brand focus:outline-none";

export function Entrada(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${CONTROLE} ${p.className || ""}`} />;
}

export function Selecao(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${CONTROLE} ${p.className || ""}`} />;
}

/**
 * Botões. `principal` é um só por tela: quando tudo tem o mesmo peso, nada
 * tem peso, e a pessoa precisa ler todos para achar o que fazer.
 */
export function Botao({
  tom = "secundario", className = "", ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tom?: "principal" | "secundario" | "perigo";
}) {
  const tons = {
    principal: "bg-brand text-sobre hover:bg-brand-dark border-transparent",
    secundario: "bg-card text-ink border-line hover:bg-surface",
    perigo: "bg-card text-perigo border-line hover:bg-surface",
  };
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5
                  text-[15px] font-medium transition-colors disabled:opacity-50
                  ${tons[tom]} ${className}`}
    />
  );
}

/**
 * A pílula de situação. O texto carrega o significado — cor sozinha não
 * atravessa daltonismo nem tela no sol.
 */
export function Selo({
  tom, children,
}: {
  tom: "bom" | "atencao" | "neutro";
  children: React.ReactNode;
}) {
  const tons = {
    bom: "bg-positivo/10 text-positivo",
    atencao: "bg-aviso/10 text-aviso",
    neutro: "bg-surface text-ink-soft",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${tons[tom]}`}>
      {children}
    </span>
  );
}

export const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O AVISO DE FALHA — a peça que faltava para vazio e erro pararem de se
 * parecer.
 *
 * Toda lista do painel tem quatro estados (ver `src/lib/buscar.ts`), e três
 * deles já tinham cara: carregando, vazio, conteúdo. Erro não tinha nenhuma:
 * virava vazio. Esta peça existe para que nenhuma tela precise inventar a
 * sua — e para que a saída seja sempre a mesma: dizer o que houve e dar o
 * botão de tentar de novo.
 *
 * `parcial` é quando havia dado bom na tela e a ATUALIZAÇÃO é que falhou. Aí o
 * aviso é uma faixa fina em cima do que já está ali, e não um bloco no lugar
 * do conteúdo: o número velho continua útil desde que se saiba que é velho.
 */
export function Falhou({
  mensagem, aoTentar, parcial = false, desde,
}: {
  mensagem: string;
  aoTentar: () => void;
  parcial?: boolean;
  desde?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl2 border p-4 ${
        parcial
          ? "mb-3 border-aviso/40 bg-aviso/10"
          : "mb-3 border-perigo/40 bg-perigo/5"
      }`}
    >
      <div className="min-w-0">
        <p className={`text-[15px] font-semibold ${parcial ? "text-aviso" : "text-perigo"}`}>
          {parcial ? "Não consegui atualizar" : mensagem}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {parcial
            ? `${mensagem} O que está na tela é de ${desde || "antes"}.`
            : "Isto não quer dizer que está tudo em dia — quer dizer que não deu para saber."}
        </p>
      </div>
      <Botao onClick={aoTentar}>Tentar novamente</Botao>
    </div>
  );
}

/**
 * A hora em que o número era verdade. Vai embaixo do conteúdo, discreta.
 * Sem ela, "3 esperando" não diz se é de agora ou de quando a aba abriu.
 */
export function Desde({ hora }: { hora: string }) {
  if (!hora) return null;
  return <p className="mt-2 text-[12px] text-ink-soft">Atualizado às {hora}.</p>;
}
