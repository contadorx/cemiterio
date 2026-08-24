"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { painel, cor } from "../ui";
import { prepararFoto, motivoFalha } from "@/lib/foto";

/**
 * O SÁBADO DAS FLORES.
 *
 * A ORDEM DA TELA é a ordem do dia do Leandro:
 *
 *   1. o que eu compro          — o papel que se leva para a floricultura
 *   2. o que eu entrego hoje    — a rota, uma linha por jazigo, com a câmera
 *   3. o mês inteiro            — os outros sábados, para negociar volume
 *
 * A COMPRA VEM PRIMEIRO de propósito. A rota se resolve no lugar; a compra
 * não: buquê a mais é prejuízo miúdo que ninguém confere, buquê a menos é uma
 * família sem flor no dia em que ela foi ver o jazigo.
 *
 * NADA É ENVIADO DAQUI. A foto entra na fila de liberação e espera o comando —
 * como todo o resto do sistema.
 */

const brl = (n: any) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dia = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  const semana = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"][d.getDay()];
  return `${semana}, ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
};

const hojeISO = () => new Date().toISOString().slice(0, 10);

export default function Flores() {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [foco, setFoco] = useState<string>("");   // a data aberta na rota

  const carregar = useCallback(async () => {
    setErro("");
    const r = await fetch("/api/flores").then((x) => x.json()).catch(() => null);
    setCarregando(false);
    if (!r?.ok) { setErro(r?.erro || "não deu para carregar"); return; }
    setD(r);
    // Abre o PRÓXIMO dia com entrega prevista, e não o primeiro da lista: no
    // dia 20 o que interessa é o sábado que vem, não o que já passou.
    if (!foco) {
      const prox = (r.entregas || [])
        .filter((e: any) => e.status === "prevista" && e.data >= hojeISO())
        .map((e: any) => e.data).sort()[0];
      setFoco(prox || (r.entregas?.[0]?.data ?? ""));
    }
  }, [foco]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando) return <div style={painel.card}><p style={{ margin: 0 }}>Carregando…</p></div>;

  if (erro) return (
    <div style={painel.card}>
      <p style={{ margin: 0, color: "rgb(var(--zm-perigo))" }}>{erro}</p>
    </div>
  );

  const entregas = (d?.entregas || []) as any[];
  const compras = d?.compras;
  const datas = (compras?.datas || []) as any[];

  // A PRÓXIMA DATA COM COMPRA. É o cartão de cima.
  const proxima = datas.find((x: any) => x.data >= hojeISO()) || datas[0] || null;
  const doDia = entregas.filter((e) => e.data === foco);

  // NENHUM COMBINADO AINDA: a tela explica o que fazer em vez de mostrar uma
  // lista vazia, que lê como falha de carregamento.
  if (!entregas.length && !datas.length) {
    return (
      <>
        <h1 style={painel.h1}>Flores</h1>
        <div style={painel.card}>
          <p style={{ margin: "0 0 8px", fontSize: 15 }}>
            <b>Nenhuma entrega combinada ainda.</b>
          </p>
          <p style={{ margin: 0, fontSize: 14, color: cor.cinza, lineHeight: 1.6 }}>
            O combinado de flores mora no jazigo. Abra a família, o jazigo, e
            marque o ritmo — <i>todo último sábado do mês</i>, por exemplo. A
            partir daí as datas aparecem aqui sozinhas, com a compra do dia.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 style={painel.h1}>Flores</h1>

      {/* ======================================= 1 · O QUE EU COMPRO */}
      {proxima && (
        <div style={{ ...painel.card, borderColor: cor.teal }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, color: cor.cinza }}>
            A compra de {dia(proxima.data)}
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 600 }}>
            {brl(proxima.custo)}{" "}
            <span style={{ fontSize: 15, fontWeight: 400, color: cor.cinza }}>
              de custo · {proxima.jazigos} jazigo(s)
            </span>
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {(proxima.itens || []).map((it: any, i: number) => (
              <li key={i} style={{ padding: "6px 0", borderTop: i ? `1px solid ${cor.linha}` : "none",
                                   display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 15 }}>
                  <b>{Number(it.quantidade)}</b> {it.unidade} · {it.nome}
                </span>
                <span style={{ fontSize: 14, color: cor.cinza }}>{brl(it.custo)}</span>
              </li>
            ))}
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: cor.cinza }}>
            Rende {brl(proxima.preco)} — sobram <b>{brl(proxima.preco - proxima.custo)}</b>.
          </p>
        </div>
      )}

      {/* ======================================= 2 · O QUE EU ENTREGO */}
      <div style={painel.card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {[...new Set(entregas.map((e) => e.data))].sort().map((dt: any) => {
            const n = entregas.filter((e) => e.data === dt && e.status === "prevista").length;
            return (
              <button key={dt} onClick={() => setFoco(dt)}
                      style={dt === foco ? painel.botaoMini : painel.botaoMiniSec}>
                {dia(dt)}{n ? ` · ${n}` : ""}
              </button>
            );
          })}
        </div>

        {!doDia.length && (
          <p style={{ margin: 0, fontSize: 14, color: cor.cinza }}>Nada neste dia.</p>
        )}

        {doDia.map((e) => (
          <Linha key={e.id} e={e} aoMudar={carregar} />
        ))}
      </div>

      {/* ======================================= 3 · O MÊS INTEIRO */}
      {datas.length > 1 && (
        <div style={painel.card}>
          <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 600 }}>
            O mês, sábado a sábado
          </p>
          {datas.map((x: any) => (
            <div key={x.data} style={{ display: "flex", justifyContent: "space-between",
                                       gap: 12, padding: "8px 0", borderTop: `1px solid ${cor.linha}` }}>
              <span style={{ fontSize: 15 }}>
                {dia(x.data)}
                <span style={{ color: cor.cinza, fontSize: 13 }}> · {x.jazigos} jazigo(s)</span>
              </span>
              <span style={{ fontSize: 14, color: cor.cinza }}>
                custo {brl(x.custo)} · rende {brl(x.preco)}
              </span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12,
                        padding: "10px 0 0", borderTop: `2px solid ${cor.linha}`, marginTop: 4 }}>
            <b style={{ fontSize: 15 }}>No mês</b>
            <span style={{ fontSize: 15 }}>
              custo <b>{brl(compras.custo)}</b> · sobram <b>{brl(compras.margem)}</b>
            </span>
          </div>
          {/* A MARGEM DAQUI NÃO É O LUCRO DO SERVIÇO. Não desconta o tempo do
              Leandro nem o deslocamento — e dizer "lucro" sem isso seria
              vender uma conta que não fecha. */}
          <p style={{ margin: "10px 0 0", fontSize: 13, color: cor.cinza, lineHeight: 1.6 }}>
            É a diferença entre o que a flor custa e o que ela é cobrada. Não
            entra aqui o seu tempo nem o deslocamento.
          </p>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * UMA ENTREGA. Marcar feita é o gesto principal, e ele leva a foto junto.
 *
 * A foto não é enfeite: é a prova do serviço, e é o que a família recebe. Por
 * isso a câmera abre no mesmo botão em vez de virar uma segunda tela — no
 * cemitério, com o celular numa mão, um passo a mais é um passo que não se dá.
 */
function Linha({ e, aoMudar }: { e: any; aoMudar: () => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<{ b64: string; mime: string; previa: string } | null>(null);
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [pulando, setPulando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const feita = e.status === "entregue";
  const pulada = e.status === "pulada";

  async function escolher(ev: any) {
    const arq = ev.target.files?.[0];
    if (!arq) return;
    setErro("");
    try {
      const p = await prepararFoto(arq);
      setFoto({ b64: p.b64, mime: p.mt, previa: p.previa });
    } catch (x) {
      setErro(motivoFalha(x));
    }
  }

  async function entregar() {
    setOcupado(true); setErro(""); setAviso("");
    try {
      const r = await fetch("/api/flores/entregas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "entregar", id: e.id,
          fotoBase64: foto?.b64 ?? null, mimetype: foto?.mime ?? null,
          observacao: obs || null,
        }),
      }).then((x) => x.json());

      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não deu para registrar"); return; }

      // O QUE ACONTECEU, DITO INTEIRO. "Feita" sem dizer se a foto entrou na
      // fila deixaria o Leandro achando que a família já recebeu.
      if (r.semFoto) setAviso("Registrada sem foto — nada foi para a liberação.");
      else if (!r.naFila) setAviso("Registrada, mas a foto não entrou na liberação. Vale conferir.");
      aoMudar();
    } finally { setOcupado(false); }
  }

  async function pular() {
    if (!motivo.trim()) { setErro("Diga por que não foi entregue."); return; }
    setOcupado(true); setErro("");
    try {
      const r = await fetch("/api/flores/entregas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "pular", id: e.id, motivo }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não deu"); return; }
      aoMudar();
    } finally { setOcupado(false); }
  }

  return (
    <div style={{ borderTop: `1px solid ${cor.linha}`, padding: "12px 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {e.familia || "sem família"}
            {e.avulsa && (
              <span style={{ fontSize: 12, fontWeight: 400, color: cor.cinza }}> · avulsa</span>
            )}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: cor.cinza }}>
            {[e.jazigo, e.local].filter(Boolean).join(" · ")}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 14 }}>
            {Number(e.quantidade)} {e.unidade} · {e.nome}
            <span style={{ color: cor.cinza }}> · {brl(e.quantidade * e.preco)}</span>
          </p>
        </div>

        <div style={{ flexShrink: 0, textAlign: "right" }}>
          {feita && (
            <span style={{ fontSize: 14, color: cor.teal, fontWeight: 600 }}>
              ✓ entregue{e.foto ? " · com foto" : " · sem foto"}
            </span>
          )}
          {pulada && (
            <span style={{ fontSize: 14, color: "rgb(var(--zm-aviso))" }}>
              não foi — {e.observacao || "sem motivo"}
            </span>
          )}
        </div>
      </div>

      {!feita && !pulada && (
        <>
          <input ref={camera} type="file" accept="image/*" capture="environment"
                 onChange={escolher} style={{ display: "none" }} />

          {foto && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.previa} alt=""
                   style={{ height: 56, width: 56, borderRadius: 8, objectFit: "cover" }} />
              <button style={painel.botaoMiniSec} onClick={() => setFoto(null)}>trocar</button>
            </div>
          )}

          <input value={obs} onChange={(ev) => setObs(ev.target.value)}
                 placeholder="observação (opcional) — flor branca, como ela pediu"
                 style={{ ...painel.input, marginTop: 10 }} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <button style={painel.botaoMiniSec} onClick={() => camera.current?.click()}>
              📷 {foto ? "Trocar foto" : "Foto"}
            </button>
            <button style={painel.botaoMini} onClick={entregar} disabled={ocupado}>
              {ocupado ? "Registrando…" : "Entreguei"}
            </button>
            <button style={painel.botaoMiniSec} onClick={() => setPulando((x) => !x)}>
              Não foi
            </button>
          </div>

          {pulando && (
            <div style={{ marginTop: 8 }}>
              <input value={motivo} onChange={(ev) => setMotivo(ev.target.value)}
                     placeholder="por que não foi? (a família pode perguntar depois)"
                     style={painel.input} />
              <button style={{ ...painel.botaoMiniSec, marginTop: 8 }}
                      onClick={pular} disabled={ocupado}>
                Marcar como não entregue
              </button>
            </div>
          )}
        </>
      )}

      {erro && <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgb(var(--zm-perigo))" }}>{erro}</p>}
      {aviso && <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgb(var(--zm-aviso))" }}>{aviso}</p>}
    </div>
  );
}
