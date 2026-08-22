"use client";

import { useEffect, useState } from "react";
import { Send, Trash2, AlertTriangle, Undo2 } from "lucide-react";
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

interface Foto { url: string; etapa: "antes" | "depois" | null }

interface Item {
  id: string; tipo: string; texto: string; fotos: Foto[] | null;
  familia: string | null; para: string | null; telefone: string | null; local: string | null;
  jazigo: string | null; executadoEm: string | null; criadoEm: string | null;
  /** O que a fila lembra da última tentativa (migration 0077). */
  tentativas: number; ultimoErro: string | null; ultimoErroEm: string | null;
  erroTipo: string | null; fotosEnviadas: number;
}

/** "2026-08-14T09:30:00Z" -> "14/08 às 09:30". Sem depender de locale do device. */
function quando(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  /** O último descarte, para o "desfazer". Um só: descartar de novo substitui. */
  const [descartado, setDescartado] = useState<Item | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await fetch("/api/fila").then((x) => x.json());
      if (r.ok) { setItens(r.itens); setWhatsapp(r.whatsapp || ""); }
    } finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function decidir(item: Item, acao: "enviar" | "descartar" | "restaurar") {
    setOcupado(item.id);
    try {
      const r = await fetch("/api/fila", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acao, texto: editando[item.id] ?? item.texto }),
      }).then((x) => x.json());

      if (!r.ok) {
        // A mensagem VOLTA para a fila quando o envio falha — e agora a fila
        // GUARDA o motivo. Recarregar faz o cartão mostrar a tentativa e o erro
        // em vez de a informação morrer neste alert.
        alert(r.erro || "Não consegui enviar.");
        await carregar();
        return;
      }
      if (acao === "descartar") setDescartado(item);
      if (acao === "restaurar") { setDescartado(null); await carregar(); return; }
      setItens((a) => a.filter((x) => x.id !== item.id));
    } finally { setOcupado(null); }
  }

  /**
   * CONFIRMAR O DESCARTE.
   *
   * "Não enviar" ficava ao lado de "Enviar", do mesmo tamanho, e agia na hora.
   * Descartar por engano a foto da limpeza do túmulo do pai de alguém é o tipo
   * de erro que não dá para consertar depois — a mensagem some da lista e a
   * família nunca recebe, sem ninguém perceber.
   *
   * A confirmação é uma pergunta só, e o desfazer fica no topo depois.
   */
  function pedirDescarte(item: Item) {
    const quem = item.para || item.familia || "esta família";
    if (!confirm(`Não enviar esta mensagem para ${quem}?\n\nEla sai da fila. Você pode desfazer logo em seguida.`)) return;
    decidir(item, "descartar");
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

      {/* DESFAZER — a segunda metade da entrega 2 do Build 6.
          Fica no topo, não dentro do cartão que acabou de sumir. */}
      {descartado && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl2 border border-line bg-card p-3 text-[14px]">
          <span className="text-ink-soft">
            Mensagem para <b className="text-ink">{descartado.para || descartado.familia}</b> não será enviada.
          </span>
          <Botao tom="secundario" disabled={ocupado === descartado.id}
                 onClick={() => decidir(descartado, "restaurar")}>
            <Undo2 size={16} /> Desfazer
          </Botao>
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
          {/* QUEM, PARA QUEM, ONDE E QUANDO — entrega 1 do Build 6.
              Antes o cartão mostrava `para || familia`, que colapsa os dois: com
              a neta recebendo a foto do jazigo da avó, a tela dizia só um nome e
              não dava para saber qual dos dois era. */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Selo tom="neutro">{ROTULO[item.tipo] ?? item.tipo}</Selo>
            <span className="text-[15px] font-medium text-ink">
              {item.para || item.familia || "—"}
            </span>
            {item.para && item.familia && item.para !== item.familia && (
              <span className="text-[13px] text-ink-soft">família {item.familia}</span>
            )}
          </div>
          <p className="mb-3 text-[13px] text-ink-soft">
            {[
              item.jazigo,
              item.local,
              quando(item.executadoEm) ? `limpo em ${quando(item.executadoEm)}` : null,
              item.telefone,
            ].filter(Boolean).join(" · ")}
          </p>

          {/* O QUE A FILA LEMBRA DA ÚLTIMA TENTATIVA (migration 0077).
              Sem isto, uma mensagem que falhou seis vezes fica visualmente
              idêntica a uma que acabou de entrar na fila. */}
          {item.tentativas > 0 && (
            <div className={`mb-3 rounded-lg border p-3 text-[13px] leading-relaxed ${
              item.erroTipo === "permanente"
                ? "border-perigo/30 bg-perigo/10 text-perigo"
                : "border-aviso/30 bg-aviso/10 text-aviso"}`}>
              <b>
                {item.erroTipo === "permanente"
                  ? "Não vai sair sem alguém corrigir."
                  : `Já tentei ${item.tentativas}ª vez${item.tentativas > 1 ? "" : ""}.`}
              </b>
              {item.ultimoErro && <> {item.ultimoErro}</>}
              {quando(item.ultimoErroEm) && (
                <span className="opacity-80"> ({quando(item.ultimoErroEm)})</span>
              )}
              {item.fotosEnviadas > 0 && (item.fotos?.length || 0) > item.fotosEnviadas && (
                <p className="mt-1">
                  <b>{item.fotosEnviadas} de {item.fotos!.length} fotos já foram.</b>{" "}
                  Ao tentar de novo mando só as que faltam — a família não recebe repetido.
                </p>
              )}
            </div>
          )}

          {!!item.fotos?.length && (
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {(item.fotos || []).map((f, i) => (
                <figure key={i} className="flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.url}
                    alt={f.etapa === "antes" ? "Antes da limpeza"
                       : f.etapa === "depois" ? "Depois da limpeza"
                       : "Foto do serviço"}
                    className="h-28 w-40 rounded-lg object-cover"
                  />
                  {/* O rótulo vem do serviço, não da posição na lista — com uma
                      foto só, a posição não diz se é o antes ou o depois. Foto
                      sem par conhecido fica sem rótulo em vez de receber um chute. */}
                  <figcaption className="mt-1 text-center text-[12px] text-ink-soft">
                    {f.etapa === "antes" ? "antes" : f.etapa === "depois" ? "depois" : "—"}
                    {item.fotosEnviadas > i && <span className="text-positivo"> · enviada</span>}
                  </figcaption>
                </figure>
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
                : item.fotosEnviadas > 0 && (item.fotos?.length || 0) > item.fotosEnviadas
                  ? `Continuar (faltam ${item.fotos!.length - item.fotosEnviadas})`
                  : `Enviar${item.fotos?.length ? ` com ${item.fotos.length} foto${item.fotos.length > 1 ? "s" : ""}` : ""}`}
            </Botao>
            <Botao tom="perigo" disabled={ocupado === item.id}
                   onClick={() => pedirDescarte(item)}>
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
