"use client";

/**
 * O antigo /painel/atendimento — que NAO estava no menu nenhum e so era
 * alcancavel por link direto. Rascunho da IA parado e resposta que a familia
 * nao recebeu: nao pode morar num endereco escondido. Agora e ABA daqui.
 */

import { useEffect, useState } from "react";
import { painel, cor } from "../ui";

interface Rascunho {
  id: string;
  assunto: string;
  rascunho: string;
  cliente: string;
  quando: string;
}

export default function VisaoRascunhos({ onMudou }: { onMudou?: () => void }) {
  const [itens, setItens] = useState<Rascunho[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/rascunhos").then((x) => x.json());
    if (r.ok) setItens(r.rascunhos);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function agir(id: string, acao: "aprovou" | "editou" | "descartou") {
    setOcupado(id);
    await fetch("/api/atendimento/aprovar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interacaoId: id, acao, textoFinal: acao === "editou" ? edit[id] : undefined }),
    });
    setOcupado(null);
    carregar();
    onMudou?.();
  }

  return (
    <div>
      <div>
        <p style={{ color: cor.cinza, fontSize: 14, marginTop: 0, marginBottom: 14 }}>
          O que a IA escreveu e está esperando o seu aval antes de sair.
        </p>

        {itens.length === 0 && <p style={{ color: cor.cinza }}>Nenhum rascunho aguardando. 🌿</p>}

        {itens.map((it) => (
          <div key={it.id} style={painel.card}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ color: cor.navy }}>{it.cliente}</strong>
              <span style={{ fontSize: 14, color: cor.cinza, textTransform: "uppercase" }}>{it.assunto}</span>
            </div>
            <textarea
              style={{ ...painel.input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
              defaultValue={it.rascunho}
              onChange={(e) => setEdit({ ...edit, [it.id]: e.target.value })}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button style={painel.botao} disabled={ocupado === it.id} onClick={() => agir(it.id, "aprovou")}>
                Aprovar e enviar
              </button>
              <button
                style={painel.botaoSec}
                disabled={ocupado === it.id}
                onClick={() => agir(it.id, "editou")}
              >
                Enviar editado
              </button>
              <button style={painel.botaoPerigo} disabled={ocupado === it.id} onClick={() => agir(it.id, "descartou")}>
                Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
