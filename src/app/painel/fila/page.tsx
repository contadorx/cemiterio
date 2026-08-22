"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Trash2, AlertTriangle, Undo2, Shuffle, CheckSquare, Square, StopCircle } from "lucide-react";
import { Cartao, Botao, Selo } from "../pecas";
import { diasDesde, faz } from "@/lib/datas";

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
  /** Quando esta FAMÍLIA recebeu foto pela última vez. `null` = nunca (0087). */
  ultimaFotoFamiliaEm: string | null;
  ultimaFotoFamiliaTotal: number;
  /** E deste jazigo em particular — a família pode ter mais de uma pedra. */
  ultimaFotoJazigoEm: string | null;
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
  /** O limiar de aviso da casa (Config › Mensagens). Zero = sem aviso. */
  const [diasEntreFotos, setDiasEntreFotos] = useState(0);
  /** As mensagens marcadas para o envio em lote. */
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /** O lote em andamento: o que já saiu, o que falhou, e o pedido de parar. */
  const [lote, setLote] = useState<{ total: number; feitos: number; falhas: string[] } | null>(null);
  const pararLote = useRef(false);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** O último descarte, para o "desfazer". Um só: descartar de novo substitui. */
  const [descartado, setDescartado] = useState<Item | null>(null);
  /** Os outros textos da casa, por mensagem, já com o nome de quem recebe. */
  const [outros, setOutros] = useState<Record<string, string[]>>({});
  const [buscandoTexto, setBuscandoTexto] = useState<string | null>(null);

  /**
   * OUTRO TEXTO, EM UM TOQUE.
   *
   * A tela já deixava editar à mão. O que faltava era o caminho rápido: na
   * pressa, o que sai é o que veio — e foi assim que um bilhete de sistema
   * chegou a uma família em 22/08.
   *
   * Os textos vêm RENDERIZADOS do servidor. Montá-los aqui daria uma segunda
   * implementação do primeiro nome e o texto da prévia deixaria de ser, letra
   * por letra, o texto enviado.
   */
  async function outroTexto(item: Item) {
    const atual = editando[item.id] ?? item.texto;
    let lista = outros[item.id];

    if (!lista) {
      setBuscandoTexto(item.id);
      try {
        const r = await fetch(`/api/fila/textos?id=${item.id}`).then((x) => x.json());
        lista = ((r?.textos || []) as Array<{ texto: string }>).map((t) => t.texto).filter(Boolean);
        setOutros((x) => ({ ...x, [item.id]: lista! }));
      } catch {
        lista = [];
      } finally {
        setBuscandoTexto(null);
      }
    }

    if (!lista.length) {
      alert("Não há outros textos cadastrados. Você pode escrever os seus em Config › Textos das mensagens.");
      return;
    }

    // Gira a lista a partir do texto atual: tocar de novo dá o PRÓXIMO, e não
    // um sorteio que pode repetir o que ela acabou de recusar.
    const i = lista.indexOf(atual);
    const proximo = lista[(i + 1) % lista.length];
    if (proximo === atual && lista.length === 1) {
      alert("Só há um texto cadastrado para este tipo. Cadastre outros em Config › Textos das mensagens.");
      return;
    }
    setEditando((x) => ({ ...x, [item.id]: proximo }));
  }

  async function carregar() {
    setCarregando(true);
    try {
      const r = await fetch("/api/fila").then((x) => x.json());
      if (r.ok) { setItens(r.itens); setWhatsapp(r.whatsapp || ""); setDiasEntreFotos(Number(r.diasEntreFotos) || 0); }
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

  // ==========================================================================
  // O ENVIO EM LOTE
  //
  // Vinte fotos de Finados são vinte revisões e vinte cliques, cada um com uma
  // espera de rede no meio. O lote tira os cliques e mantém a revisão: ela lê,
  // marca, e manda de uma vez.
  //
  // SEQUENCIAL, e não em paralelo. Cada envio sobe as FOTOS pela Evolution —
  // são megabytes por mensagem, na mesma linha de WhatsApp dela. Vinte de uma
  // vez derrubaria a instância, e a fila voltaria com vinte erros de rede que
  // não são erros de verdade. Uma de cada vez é mais lento e é o que funciona.
  //
  // E DÁ PARA PARAR NO MEIO. Um lote que só termina quando acaba é um lote que
  // ninguém começa. O que já saiu, saiu — não há como desfazer um WhatsApp —,
  // e o resto continua na fila esperando.
  // ==========================================================================
  function podeEnviar(i: Item) { return !!i.telefone; }

  function alternarMarca(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const enviaveis = itens.filter(podeEnviar);
  /** Sem aviso de foto recente — as que ela provavelmente quer mandar. */
  const semAviso = enviaveis.filter((i) => {
    if (i.tipo !== "foto" || diasEntreFotos <= 0) return true;
    const d = diasDesde(i.ultimaFotoFamiliaEm);
    return d === null || d >= diasEntreFotos;
  });
  const comAviso = enviaveis.length - semAviso.length;

  async function enviarLote() {
    const alvos = itens.filter((i) => marcadas.has(i.id) && podeEnviar(i));
    if (!alvos.length) return;

    const quem = alvos.slice(0, 3).map((a) => a.para || a.familia || "sem nome").join(", ");
    const resto = alvos.length > 3 ? ` e mais ${alvos.length - 3}` : "";
    if (!confirm(
      `Enviar ${alvos.length} ${alvos.length === 1 ? "mensagem" : "mensagens"} agora?\n\n` +
      `Para: ${quem}${resto}.\n\n` +
      `Sai uma de cada vez, com as fotos. Você pode parar no meio — o que já tiver saído não volta.`
    )) return;

    pararLote.current = false;
    setLote({ total: alvos.length, feitos: 0, falhas: [] });

    const falhas: string[] = [];
    let feitos = 0;

    for (const item of alvos) {
      if (pararLote.current) break;
      try {
        const r = await fetch("/api/fila", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, acao: "enviar", texto: editando[item.id] ?? item.texto }),
        }).then((x) => x.json());

        if (r?.ok) {
          feitos++;
          setItens((a) => a.filter((x) => x.id !== item.id));
          setMarcadas((m) => { const n = new Set(m); n.delete(item.id); return n; });
        } else {
          // O NOME DE QUEM FALHOU, não só a contagem. "18 de 20 enviadas" sem
          // dizer quais duas obriga a conferir as vinte na mão.
          falhas.push(`${item.para || item.familia || "sem nome"}: ${r?.erro || "não saiu"}`);
        }
      } catch (e: any) {
        falhas.push(`${item.para || item.familia || "sem nome"}: ${e?.message || "rede"}`);
      }
      setLote({ total: alvos.length, feitos, falhas: [...falhas] });
    }

    setLote({ total: alvos.length, feitos, falhas });
    // Recarrega para as que falharam voltarem com o motivo escrito no cartão.
    if (falhas.length) await carregar();
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

      {/* ------------------------------------------------------- o lote */}
      {lote && (
        <div className="mb-4 rounded-xl2 border border-line bg-surface p-3 text-[14px] text-ink">
          {lote.feitos < lote.total && !pararLote.current ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Enviando… <b>{lote.feitos} de {lote.total}</b>. Uma por vez, com as fotos.</span>
              <Botao tom="perigo" onClick={() => { pararLote.current = true; }}>
                <StopCircle size={16} /> Parar
              </Botao>
            </div>
          ) : (
            <div>
              <b>{lote.feitos} de {lote.total} {lote.total === 1 ? "enviada" : "enviadas"}.</b>
              {lote.falhas.length > 0 && (
                <>
                  {" "}As que não saíram continuam na fila, com o motivo no cartão:
                  <ul className="mt-1 list-disc pl-4 text-perigo">
                    {(lote.falhas || []).map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </>
              )}
              <button className="mt-2 underline" onClick={() => setLote(null)}>ok</button>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------- a barra de seleção
          Só aparece quando há mais de uma mensagem: com uma, marcar para
          depois mandar é mais trabalho que mandar. */}
      {enviaveis.length > 1 && !lote && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-3">
          <button
            onClick={() => setMarcadas((m) =>
              m.size === enviaveis.length ? new Set() : new Set(enviaveis.map((i) => i.id)))}
            className="inline-flex items-center gap-1.5 text-[14px] text-ink hover:text-brand"
          >
            {marcadas.size === enviaveis.length ? <CheckSquare size={17} /> : <Square size={17} />}
            {marcadas.size === enviaveis.length ? "Desmarcar todas" : "Marcar todas"}
          </button>

          {/* O ATALHO QUE NASCEU DO "não quero manter a frequência toda data":
              marcar só as que não têm aviso de foto recente. Sem ele, marcar
              todas e desmarcar as amarelas uma a uma é o trabalho que o lote
              deveria estar tirando. */}
          {comAviso > 0 && (
            <button
              onClick={() => setMarcadas(new Set(semAviso.map((i) => i.id)))}
              className="text-[14px] text-ink-soft underline decoration-dotted hover:text-brand"
              title={`${comAviso} ${comAviso === 1 ? "família recebeu" : "famílias receberam"} foto há menos de ${diasEntreFotos} dias`}
            >
              marcar só as {semAviso.length} sem aviso
            </button>
          )}

          <span className="flex-1" />

          <Botao tom="principal" disabled={!marcadas.size} onClick={enviarLote}>
            <Send size={16} /> Enviar {marcadas.size || ""} {marcadas.size === 1 ? "marcada" : "marcadas"}
          </Botao>
        </div>
      )}

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
            {/* A CAIXA DE SELEÇÃO fica na primeira posição da linha, antes do
                rótulo: é a coluna que o olho percorre ao marcar várias. Some
                quando não há telefone — marcar o que não pode sair só produz
                uma falha no fim do lote. */}
            {enviaveis.length > 1 && item.telefone && (
              <button
                onClick={() => alternarMarca(item.id)}
                aria-label={marcadas.has(item.id) ? "Desmarcar esta mensagem" : "Marcar esta mensagem"}
                className={marcadas.has(item.id) ? "text-brand" : "text-ink-soft hover:text-brand"}
              >
                {marcadas.has(item.id) ? <CheckSquare size={19} /> : <Square size={19} />}
              </button>
            )}
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

          {/* QUANDO ESTA FAMÍLIA RECEBEU FOTO PELA ÚLTIMA VEZ (migration 0087).
              Fica ACIMA das fotos, não abaixo: é a informação com que ela
              decide se vale a pena olhar o resto. */}
          {item.tipo === "foto" && (() => {
            const dFam = diasDesde(item.ultimaFotoFamiliaEm);
            const dJaz = diasDesde(item.ultimaFotoJazigoEm);

            // NUNCA RECEBEU é outra coisa que "recebeu há muito tempo", e é o
            // caso em que ela manda sem pensar duas vezes. Merece palavra
            // própria e cor de tranquilidade, não de alerta.
            if (dFam === null) {
              return (
                <p className="mb-3 rounded-lg border border-positivo/30 bg-positivo/10 px-3 py-2 text-[13px] text-positivo">
                  <b>Primeira foto desta família.</b> Ela nunca recebeu nenhuma.
                </p>
              );
            }

            // O aviso só existe se a casa pediu um limiar. Zero desliga.
            const recente = diasEntreFotos > 0 && dFam < diasEntreFotos;

            return (
              <p className={`mb-3 rounded-lg border px-3 py-2 text-[13px] leading-relaxed ${
                recente ? "border-aviso/30 bg-aviso/10 text-aviso"
                        : "border-line bg-card text-ink-soft"}`}>
                <b>
                  Última foto para esta família: {quando(item.ultimaFotoFamiliaEm)} ({faz(dFam)})
                </b>
                {item.ultimaFotoFamiliaTotal > 1 && <> · {item.ultimaFotoFamiliaTotal} já enviadas</>}
                {/* A segunda pergunta, que só faz sentido quando as duas datas
                    diferem: a foto de 8 dias atrás pode ter sido da outra pedra. */}
                {dJaz !== null && dJaz !== dFam && (
                  <> · <b>neste jazigo:</b> {quando(item.ultimaFotoJazigoEm)} ({faz(dJaz)})</>
                )}
                {dJaz === null && (
                  <> · <b>deste jazigo, nenhuma ainda.</b></>
                )}
                {recente && <> — faz menos de {diasEntreFotos} dias.</>}
              </p>
            );
          })()}

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

          <div className="mt-2">
            <button
              type="button"
              disabled={buscandoTexto === item.id}
              onClick={() => outroTexto(item)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[14px] text-ink-soft hover:border-brand hover:text-brand disabled:opacity-60"
            >
              <Shuffle size={15} />
              {buscandoTexto === item.id ? "Buscando…" : "Outro texto"}
            </button>
          </div>

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
