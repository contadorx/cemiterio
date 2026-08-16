"use client";

import { useEffect, useState } from "react";
import { Send, Trash2, AlertTriangle } from "lucide-react";
import { Cartao, Botao, Selo } from "../pecas";

/**
 * A FILA DE LIBERAÇÃO — onde a Sureya aprova cada mensagem.
 *
 * Ela vê a PRÉVIA EXATA do que vai sair: as fotos e o texto já com o nome
 * preenchido. Pode editar antes de mandar. Nada é enviado sem que ela toque
 * em "Enviar", uma mensagem por vez.
 *
 * O envio sai pela instância da Evolution — a mesma linha de WhatsApp dela —,
 * levando AS FOTOS junto. O link `wa.me` não serviria: carrega só texto, e as
 * fotos do antes e do depois são o motivo da mensagem existir.
 */

interface Item {
  id: string; tipo: string; texto: string; fotos: string[];
  familia: string | null; para: string | null; telefone: string | null; local: string | null;
}

const ROTULO: Record<string, string> = {
  foto: "Foto do serviço",
  cobranca: "Cobrança",
  lembrete: "Lembrete",
  agradecimento: "Agradecimento",
};

export default function Fila() {
  const [itens, setItens] = useState<Item[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await fetch("/api/fila").then((x) => x.json());
      if (r.ok) { setItens(r.itens); setWhatsapp(r.whatsapp || ""); }
    } finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function decidir(item: Item, acao: "enviar" | "descartar") {
    setOcupado(item.id);
    try {
      const r = await fetch("/api/fila", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acao, texto: editando[item.id] ?? item.texto }),
      }).then((x) => x.json());

      if (!r.ok) {
        // A mensagem VOLTA para a fila quando o envio falha, então ela
        // continua na lista e pode ser tentada de novo.
        alert(r.erro || "Não consegui enviar.");
        carregar();
        return;
      }
      setItens((a) => a.filter((x) => x.id !== item.id));
    } finally { setOcupado(null); }
  }

  if (carregando) return <p className="text-[15px] text-ink-soft">Carregando…</p>;

  return (
    <>
      <h1 className="text-[22px] font-semibold text-ink">Liberação</h1>
      <p className="mb-4 text-[14px] text-ink-soft">
        {itens.length} {itens.length === 1 ? "mensagem" : "mensagens"} · nada é enviado sem você aprovar
      </p>

      {/* O WhatsApp precisa estar de pé para as FOTOS saírem. Avisar aqui
          evita ela revisar tudo e descobrir o problema no último clique. */}
      {whatsapp && whatsapp !== "conectado" && (
        <div className="mb-4 flex items-start gap-2 rounded-xl2 border border-aviso/30 bg-aviso/10 p-3 text-[14px] text-aviso">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <span>
            O WhatsApp está {whatsapp === "conectando" ? "conectando" : "desconectado"}. As
            mensagens ficam guardadas aqui até a conexão voltar.{" "}
            <a href="/painel/whatsapp" className="underline">Reconectar</a>
          </span>
        </div>
      )}

      {!itens.length && (
        <Cartao>
          <p className="text-[16px] font-medium text-ink">Nada esperando aprovação</p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Quando a Nina terminar uma limpeza, a mensagem com as fotos aparece aqui
            para você revisar antes de enviar.
          </p>
        </Cartao>
      )}

      {itens.map((item) => (
        <Cartao key={item.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Selo tom="neutro">{ROTULO[item.tipo] ?? item.tipo}</Selo>
            <span className="text-[15px] font-medium text-ink">
              {item.para || item.familia}
            </span>
            {item.local && <span className="text-[13px] text-ink-soft">{item.local}</span>}
          </div>

          {!!item.fotos.length && (
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {item.fotos.map((f, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={i} src={f} alt="" className="h-28 w-40 flex-shrink-0 rounded-lg object-cover" />
              ))}
            </div>
          )}

          {/* A prévia é editável: o texto que ela vê é o texto que vai sair. */}
          <textarea
            rows={6}
            value={editando[item.id] ?? item.texto}
            onChange={(e) => setEditando((x) => ({ ...x, [item.id]: e.target.value }))}
            className="w-full rounded-lg border border-line bg-card p-3 text-[15px] leading-relaxed text-ink focus:border-brand focus:outline-none"
          />

          <div className="mt-3 flex gap-2">
            <Botao tom="principal" disabled={ocupado === item.id || !item.telefone}
                   onClick={() => decidir(item, "enviar")}>
              <Send size={16} />
              {ocupado === item.id
                ? "Enviando…"
                : `Enviar${item.fotos.length ? ` com ${item.fotos.length} foto${item.fotos.length > 1 ? "s" : ""}` : ""}`}
            </Botao>
            <Botao tom="perigo" disabled={ocupado === item.id}
                   onClick={() => decidir(item, "descartar")}>
              <Trash2 size={16} /> Não enviar
            </Botao>
          </div>

          {!item.telefone && (
            <p className="mt-2 text-[13px] text-aviso">
              Esta pessoa não tem WhatsApp cadastrado.
            </p>
          )}
        </Cartao>
      ))}
    </>
  );
}
