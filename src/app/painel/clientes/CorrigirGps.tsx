"use client";

/**
 * CORRIGIR A LOCALIZAÇÃO DE UM JAZIGO — apagar leitura de GPS errada.
 *
 * O buraco que isto fecha: a posição do jazigo é a MÉDIA das leituras feitas no
 * campo (migration 0013). Uma leitura marcada fora do cemitério — em casa, no
 * carro, com o sinal preso na torre — entra na média e não saía mais: marcar de
 * novo só DILUI o erro, porque marcar ADICIONA leitura. A tela sabia acusar
 * ("GPS suspeito") e não sabia consertar.
 *
 * Aqui dá para ver de onde veio cada leitura e apagar a errada. A distância até
 * a posição atual é o que denuncia: a leitura de casa aparece com quilômetros
 * ao lado das outras, que aparecem com metros.
 *
 * Apagar TODAS tira o jazigo do mapa até alguém marcar de novo no campo — e
 * isso é melhor que uma posição inventada, que manda a ajudante para o lugar
 * errado com cara de certeza.
 */

import { useState } from "react";
import { painel, cor } from "../ui";

type Leitura = {
  id: string;
  lat: number | null;
  lng: number | null;
  precisao: number | null;
  origem: string | null;
  quando: string | null;
  distancia: number | null;
};

function metrosBr(m: number) {
  if (m >= 999.5) return `${(m / 1000).toFixed(m < 10000 ? 2 : 1).replace(".", ",")} km`;
  return m < 1 ? `${m.toFixed(1).replace(".", ",")} m` : `${Math.round(m)} m`;
}

function quandoBr(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CorrigirGps({ tumuloId, onMudou }: { tumuloId: string; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [amostras, setAmostras] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    const r = await fetch(`/api/tumulos/${tumuloId}/gps`)
      .then((x) => x.json())
      .catch(() => null);
    setCarregando(false);
    if (!r?.ok) {
      setErro(String(r?.erro || "não consegui ler as leituras"));
      return;
    }
    setLeituras(r.leituras || []);
    setAmostras(Number(r.tumulo?.amostras ?? 0));
  }

  async function abrir() {
    setAberto(true);
    if (!leituras.length) await carregar();
  }

  async function apagar(leituraId: string | null) {
    const texto = leituraId
      ? "Apagar esta leitura? A posição do jazigo é recalculada com as que sobrarem."
      : "Apagar TODAS as leituras deste jazigo? Ele sai do mapa até alguém marcar a localização de novo no campo.";
    if (!confirm(texto)) return;

    setOcupado(leituraId || "tudo");
    setErro("");
    const url = `/api/tumulos/${tumuloId}/gps?confirmar=1${leituraId ? `&leitura=${leituraId}` : ""}`;
    const r = await fetch(url, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    setOcupado("");
    if (!r?.ok) {
      setErro(String(r?.mensagem || r?.erro || "não consegui apagar"));
      return;
    }
    await carregar();
    onMudou();   // a planta redesenha sem o ponto errado
  }

  if (!aberto) {
    return (
      <button style={painel.botaoMiniSec} onClick={abrir}>
        📍 Corrigir localização
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${cor.linha}`, borderRadius: 12, padding: 12, marginTop: 12, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ color: cor.navy }}>
          Leituras de GPS deste jazigo{amostras != null ? ` (${amostras} na média)` : ""}
        </strong>
        <button style={painel.botaoMiniSec} onClick={() => setAberto(false)}>fechar</button>
      </div>

      <p style={{ color: cor.cinza, fontSize: 13, margin: "6px 0 10px" }}>
        A posição no mapa é a média destas leituras, com peso maior para as mais precisas. Marcar de
        novo no campo <b>não apaga</b> uma leitura errada — só dilui. A coluna “distância” mostra o
        quanto cada uma está longe da posição atual: é ela que entrega a marcação feita fora do
        cemitério.
      </p>

      {carregando && <p style={{ color: cor.cinza, fontSize: 14 }}>Carregando…</p>}
      {erro && (
        <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 14, margin: "0 0 8px" }}>{erro}</p>
      )}

      {!carregando && leituras.length === 0 && (
        <p style={{ color: cor.cinza, fontSize: 14, margin: "0 0 10px" }}>
          Nenhuma leitura registrada. A coordenada deste jazigo veio de importação ou de antes do
          histórico existir — “Apagar tudo” limpa a posição e ele sai do mapa até alguém marcar no
          campo.
        </p>
      )}

      {leituras.map((l) => {
        const longe = l.distancia != null && l.distancia > 200;
        return (
          <div key={l.id}
               style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                        flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${cor.linha}` }}>
            <div style={{ fontSize: 14, color: cor.navy }}>
              <b>{quandoBr(l.quando)}</b>
              <span style={{ color: cor.cinza }}>
                {" · "}±{l.precisao != null ? metrosBr(Number(l.precisao)) : "?"}
                {" · "}{l.origem || "campo"}
              </span>
              {l.distancia != null && (
                <span style={{ color: longe ? "rgb(var(--zm-perigo))" : cor.cinza, fontWeight: longe ? 700 : 400 }}>
                  {" · "}{metrosBr(l.distancia)} da posição atual
                </span>
              )}
            </div>
            <button style={painel.botaoMiniSec} disabled={!!ocupado} onClick={() => apagar(l.id)}>
              {ocupado === l.id ? "…" : "apagar"}
            </button>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button style={painel.botaoPerigo} disabled={!!ocupado} onClick={() => apagar(null)}>
          {ocupado === "tudo" ? "…" : "Apagar tudo e tirar do mapa"}
        </button>
        <button style={painel.botaoMiniSec} disabled={carregando} onClick={carregar}>
          recarregar
        </button>
      </div>
    </div>
  );
}
