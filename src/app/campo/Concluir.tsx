"use client";

/**
 * ⚠️  ESTA TELA NÃO ESTÁ NO AR.
 *
 * Nenhum arquivo a importa: `campo/page.tsx` conclui a lavagem no próprio
 * cartão, com a câmera dentro do botão. Este é o fluxo antigo, de quando
 * finalizar abria um modal de quatro passos.
 *
 * Está aqui com aviso porque a auditoria (CP-10) chamou justamente isto: com
 * três implementações do cartão no diretório, dá para consertar a errada e
 * acreditar que mudou a produção — foi o que quase aconteceu ao ajustar a fila
 * do Build B. A remoção está marcada no Build E do ROADMAP_UX.md; até lá, se
 * você veio consertar alguma coisa de campo, o arquivo é `campo/page.tsx`.
 */

import { useRef, useState } from "react";
import { capturarGps, qualidade } from "@/lib/gps";
import { prepararFoto, motivoFalha, type FotoPronta } from "@/lib/foto";
import { concluirOuEnfileirar } from "@/lib/offline-fila";

/**
 * FINALIZAR a lavagem: foto do depois, confirmação de local e envio.
 * A foto do "antes" é tirada no Começar (ConfirmarJazigo). Aqui ela só aparece
 * confirmada — tirar de novo agora seria fotografar o jazigo já limpo.
 */
export default function Concluir({
  item,
  onFechar,
  onPronto,
}: {
  item: any;
  onFechar: () => void;
  onPronto: (offline: boolean) => void;
}) {
  const [antes, setAntes] = useState<FotoPronta | null>(null);
  const [depois, setDepois] = useState<FotoPronta | null>(null);
  const [enquadramento, setEnquadramento] = useState<FotoPronta | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [gpsEstado, setGpsEstado] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [gpsMsg, setGpsMsg] = useState("");
  const refAntes = useRef<HTMLInputElement>(null);
  const refDepois = useRef<HTMLInputElement>(null);
  const refEnq = useRef<HTMLInputElement>(null);

  /**
   * Le a foto do celular e JA REDUZ antes de guardar no estado: sem isto, uma
   * foto de 8 MB vira ~11 MB em base64 e o envio morre no limite do servidor.
   */
  async function lerArquivo(f: File): Promise<FotoPronta | null> {
    try {
      return await prepararFoto(f);
    } catch (e) {
      setErro(motivoFalha(e));
      return null;
    }
  }

  // Confirmação de localização pela Nina: captura a melhor leitura possível e
  // manda pro servidor, que recalcula a média. Cada visita melhora o ponto.
  async function confirmarLocal() {
    setGpsEstado("buscando");
    setGpsMsg("Procurando sinal…");
    const leitura = await capturarGps({
      alvoMetros: 8,
      timeoutMs: 15000,
      aoProgredir: (p) => setGpsMsg(`Sinal: ${p} m — aguarde…`),
    });

    if (!leitura) {
      setGpsEstado("erro");
      setGpsMsg("Não consegui o GPS. Verifique se a localização está ligada.");
      return;
    }

    const q = qualidade(leitura.precisao);
    if (!q.serve) {
      setGpsEstado("erro");
      setGpsMsg(`Sinal ${q.rotulo} (${leitura.precisao} m). Chegue mais perto e tente de novo.`);
      return;
    }

    const r = await fetch(`/api/tumulos/${item.tumuloId}/gps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...leitura, origem: "confirmacao" }),
    }).then((x) => x.json()).catch(() => null);

    if (r?.ok) {
      setGpsEstado("ok");
      setGpsMsg(
        `✓ Localização confirmada (${r.amostras} leitura${r.amostras > 1 ? "s" : ""}, precisão ~${r.precisao} m)`
      );
    } else {
      setGpsEstado("erro");
      setGpsMsg(r?.mensagem || "Não consegui salvar. Tente de novo.");
    }
  }

  async function concluir() {
    if (!depois) {
      setErro("A foto do depois é obrigatória.");
      return;
    }
    setEnviando(true);
    setErro("");

    // O GPS NAO SEGURA MAIS O ENVIO.
    // Isto aqui esperava ate 8 segundos (`await capturarGps`) antes de mandar a
    // conclusao — parada no sol, por uma leitura que e OPCIONAL: ela so entra
    // numa media, e o botao "Confirmar que estou neste tumulo" ja faz esse
    // trabalho com calma. Agora a leitura corre por fora, como a foto de longe
    // logo abaixo ja fazia.
    capturarGps({ alvoMetros: 10, timeoutMs: 8000 }).then((l) => {
      if (l && l.precisao <= 30) {
        fetch(`/api/tumulos/${item.tumuloId}/gps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...l, origem: "conclusao" }),
        }).catch(() => {});
      }
    }).catch(() => {});

    // foto de enquadramento (referência do túmulo), se ela tirou uma nova
    if (enquadramento) {
      fetch(`/api/tumulos/${item.tumuloId}/foto-referencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: enquadramento.b64, mimetype: enquadramento.mt, tipo: "enquadramento" }),
      }).catch(() => {});
    }

    const { desfecho: modo } = await concluirOuEnfileirar({
      servicoId: item.id,
      fotoDepoisBase64: depois.b64,
      fotoAntesBase64: antes?.b64,
      mimetype: depois.mt,
    });
    setEnviando(false);

    // "perdido" = nem subiu nem coube na memoria do aparelho. Este caso existia
    // e era MUDO: a excecao subia, o botao ficava travado em "Enviando..." e o
    // trabalho sumia. Agora ela sabe o que aconteceu e o que fazer.
    if (modo === "perdido") {
      setErro(
        "A memória do aparelho encheu e eu não consegui guardar esta foto. " +
        "Procure um lugar com sinal e abra o app: o que já está guardado sobe e libera espaço."
      );
      return;
    }

    // online = subiu; offline = guardado no aparelho e sobe sozinho quando voltar o sinal.
    // Em ambos, a Nina segue em frente (o cemitério tem sinal ruim; travar não ajuda).
    onPronto(modo === "offline");
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalTopo}>
          <strong style={{ fontSize: 20 }}>{item.tumulo}</strong>
          <button style={s.fechar} onClick={onFechar}>
            ✕
          </button>
        </div>
        <div style={s.modalSub}>
          Quadra {item.quadra}
          {item.falecido ? ` · ${item.falecido}` : ""}
        </div>

        {item.fotoEnquadramento && (
          <div>
            <div style={s.rotulo}>Onde fica (foto de longe):</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.fotoEnquadramento} alt="enquadramento" style={s.fotoRef} />
          </div>
        )}
        {item.fotoReferencia && (
          <div>
            <div style={s.rotulo}>Confira se é este túmulo:</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.fotoReferencia} alt="referência" style={s.fotoRef} />
          </div>
        )}
        {(item.lat != null && item.lng != null) && (
          <a
            style={s.mapa}
            href={`https://www.google.com/maps?q=${item.lat},${item.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            📍 abrir no mapa
            {item.gpsAmostras > 0 && item.gpsPrecisao != null
              ? ` (±${item.gpsPrecisao} m · ${item.gpsAmostras} leitura${item.gpsAmostras > 1 ? "s" : ""})`
              : ""}
          </a>
        )}

        <input
          ref={refAntes}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => e.target.files?.[0] && setAntes(await lerArquivo(e.target.files[0]))}
        />
        <input
          ref={refDepois}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => e.target.files?.[0] && setDepois(await lerArquivo(e.target.files[0]))}
        />

        <input
          ref={refEnq}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => e.target.files?.[0] && setEnquadramento(await lerArquivo(e.target.files[0]))}
        />

        {/* a foto do antes normalmente ja foi tirada no "Comecar"; aqui so
            confirmamos, para ela nao tirar de novo com o jazigo ja limpo */}
        <button
          style={{ ...s.fotoBtn, ...(antes || item.fotoAntes ? s.fotoOk : {}) }}
          onClick={() => refAntes.current?.click()}
        >
          {antes
            ? "✓ Foto do antes (nova)"
            : item.fotoAntes
              ? "✓ Foto do antes já tirada — tocar para trocar"
              : "📷 Foto do antes (opcional)"}
        </button>
        <button style={{ ...s.fotoBtn, ...(depois ? s.fotoOk : {}) }} onClick={() => refDepois.current?.click()}>
          {depois ? "✓ Foto do depois" : "📷 Foto do depois"}
        </button>

        {/* Localização: cada confirmação melhora a média do ponto */}
        <div style={s.blocoGps}>
          <button
            style={{ ...s.fotoBtn, ...(gpsEstado === "ok" ? s.fotoOk : {}), marginBottom: 6 }}
            onClick={confirmarLocal}
            disabled={gpsEstado === "buscando"}
          >
            {gpsEstado === "buscando" ? "📍 Procurando sinal…" : gpsEstado === "ok" ? "✓ Localização confirmada" : "📍 Confirmar que estou neste túmulo"}
          </button>
          {gpsMsg && (
            <p style={{ ...s.gpsMsg, color: gpsEstado === "erro" ? "#dc2626" : "#0f766e" }}>{gpsMsg}</p>
          )}
          <button style={{ ...s.fotoBtn, ...(enquadramento ? s.fotoOk : {}) }} onClick={() => refEnq.current?.click()}>
            {enquadramento ? "✓ Foto de longe salva" : "🖼 Atualizar foto de longe (ajuda a achar)"}
          </button>
          <p style={s.gpsDica}>
            A foto de longe é tirada do corredor, mostrando o túmulo junto com os vizinhos. É ela que ajuda a
            encontrar da próxima vez.
          </p>
        </div>

        {erro && <p style={s.erro}>{erro}</p>}

        <button style={s.concluir} onClick={concluir} disabled={enviando}>
          {enviando ? "Enviando…" : "Concluir e enviar à família"}
        </button>
      </div>
    </div>
  );
}


const s: Record<string, React.CSSProperties> = {
  blocoGps: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, margin: "10px 0" },
  gpsMsg: { fontSize: 17, margin: "0 0 8px", textAlign: "center" },
  gpsDica: { fontSize: 18, color: "#475569", margin: "8px 0 0", lineHeight: 1.4 },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "grid", placeItems: "end center", zIndex: 50 },
  modal: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, display: "flex", flexDirection: "column", gap: 12, maxHeight: "92vh", overflowY: "auto" },
  modalTopo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalSub: { color: "#475569", fontSize: 17, marginTop: -6 },
  fechar: { background: "none", border: "none", fontSize: 22, color: "#475569" },
  rotulo: { fontSize: 18, color: "#475569", marginBottom: 6 },
  fotoRef: { width: "100%", borderRadius: 12, maxHeight: 220, objectFit: "cover" },
  mapa: { display: "block", textAlign: "center", padding: 12, background: "#eff6ff", color: "#1d4ed8", borderRadius: 12, fontWeight: 600, textDecoration: "none" },
  fotoBtn: { padding: 18, fontSize: 17, fontWeight: 600, borderRadius: 12, border: "2px dashed #cbd5e1", background: "#f8fafc", color: "#334155" },
  fotoOk: { borderStyle: "solid", borderColor: "#6ee7b7", background: "#ecfdf5", color: "#059669" },
  concluir: { padding: 20, fontSize: 20, fontWeight: 800, borderRadius: 14, border: "none", background: "#0f766e", color: "#fff", marginTop: 4 },
  erro: { color: "#dc2626", margin: 0 },
};
