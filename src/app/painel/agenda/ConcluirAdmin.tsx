"use client";

import { useRef, useState } from "react";
import { painel, cor } from "../ui";
import { prepararFoto, motivoFalha } from "@/lib/foto";

/**
 * Concluir uma lavagem pelo painel — quando a Nina mandou a foto por WhatsApp,
 * quando o próprio dono foi ao cemitério, ou quando o registro falhou no campo.
 */
// Traduz o motivo tecnico do envio para uma frase que diz o que fazer.
function explicarEnvio(motivo?: string): string {
  switch (motivo) {
    case "desmarcado": return "você desmarcou o envio";
    case "familia_desligada": return "o envio automático está DESLIGADO nesta família (ligue na ficha dela)";
    case "disparos_desligados": return "a chave mestra de disparos está desligada (Config)";
    case "sem_telefone": return "esta família não tem telefone cadastrado";
    case "sem_cliente": return "este jazigo não está vinculado a nenhuma família";
    case "falhou": return "o WhatsApp falhou; ficou na fila e tenta de novo sozinho";
    default: return "não saiu agora";
  }
}

export default function ConcluirAdmin({ servico, onFechar, onPronto }: {
  servico: any; onFechar: () => void; onPronto: () => void;
}) {
  const [depois, setDepois] = useState<{ b64: string; mt: string; previa: string } | null>(null);
  const [antes, setAntes] = useState<{ b64: string; mt: string; previa: string } | null>(null);
  const [duracao, setDuracao] = useState("");
  const [notificar, setNotificar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const refD = useRef<HTMLInputElement>(null);
  const refA = useRef<HTMLInputElement>(null);
  // Camera separada da galeria: sem o atributo capture, o celular so abre a
  // galeria — o painel nao conseguia TIRAR foto, so recuperar foto ja tirada.
  const refDCam = useRef<HTMLInputElement>(null);
  const refACam = useRef<HTMLInputElement>(null);
  const [fotoErro, setFotoErro] = useState("");

  async function ler(arq: File, set: (v: any) => void) {
    setFotoErro("");
    try {
      // Reduz no navegador: foto de celular em tamanho cheio nao cabia no envio.
      const foto = await prepararFoto(arq);
      set({ b64: foto.b64, mt: foto.mt, previa: foto.previa });
    } catch (e) {
      setFotoErro(motivoFalha(e));
    }
  }

  async function concluir() {
    if (!depois) return alert("A foto do depois é obrigatória — é ela que a família recebe.");
    setEnviando(true);
    const r = await fetch("/api/servico/concluir-admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        servicoId: servico.id,
        fotoDepoisBase64: depois.b64,
        fotoAntesBase64: antes?.b64,
        mimetype: depois.mt,
        duracaoMinutos: duracao ? Number(duracao) : undefined,
        notificar,
      }),
    }).then((x) => x.json()).catch(() => null);
    setEnviando(false);
    if (r?.ok) setResultado(r);
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  if (resultado) {
    return (
      <div style={s.fundo}>
        <div data-folha style={s.folha}>
          <div style={{ fontSize: 40, textAlign: "center" }}>✓</div>
          <p style={{ textAlign: "center", fontSize: 16, color: cor.navy, margin: "10px 0" }}>
            Lavagem registrada.
          </p>
          <ul style={{ color: cor.cinza, fontSize: 14, lineHeight: 1.8 }}>
            <li>{resultado.notificado ? "Foto enviada para a família" : `Foto não enviada — ${explicarEnvio(resultado.motivoEnvio)}`}</li>
            <li>{resultado.debitou ? "Cobrança lançada na conta da família" : "Sem cobrança (já paga ou já lançada)"}</li>
            {resultado.momento === "contra_foto" && (
              <li><b>Cobrança liberada pela entrega da foto</b> — é o combinado deste plano</li>
            )}
            {resultado.material?.total > 0 && (
              <li>Material descontado do estoque: R$ {Number(resultado.material.total).toFixed(2)}</li>
            )}
          </ul>
          <button style={painel.botao} onClick={onPronto}>Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.fundo}>
      <div data-folha style={s.folha}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 18, color: cor.navy }}>Registrar lavagem</strong>
          <button style={s.fechar} onClick={onFechar}>✕</button>
        </div>
        <p style={{ color: cor.cinza, fontSize: 14, margin: "4px 0 16px" }}>
          {servico.tumulo} · {servico.cliente || "—"}
        </p>

        <input ref={refD} type="file" accept="image/*" hidden
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) ler(f, setDepois); }} />
        <input ref={refA} type="file" accept="image/*" hidden
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) ler(f, setAntes); }} />
        <input ref={refDCam} type="file" accept="image/*" capture="environment" hidden
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) ler(f, setDepois); }} />
        <input ref={refACam} type="file" accept="image/*" capture="environment" hidden
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) ler(f, setAntes); }} />

        <label style={painel.rotulo}>Foto do depois (obrigatória — é a que a família recebe)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...s.botaoFoto, flex: 1, ...(depois ? s.botaoFotoOk : {}) }}
                  onClick={() => refDCam.current?.click()}>
            {depois ? "✓ tirar outra" : "📷 Tirar foto agora"}
          </button>
          <button style={{ ...s.botaoFoto, flex: 1 }} onClick={() => refD.current?.click()}>
            🖼 Da galeria
          </button>
        </div>
        {depois && <img src={depois.previa} alt="depois" style={s.previa} />}

        <label style={{ ...painel.rotulo, marginTop: 14 }}>Foto do antes (opcional)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...s.botaoFoto, flex: 1, ...(antes ? s.botaoFotoOk : {}) }}
                  onClick={() => refACam.current?.click()}>
            {antes ? "✓ tirar outra" : "📷 Tirar foto agora"}
          </button>
          <button style={{ ...s.botaoFoto, flex: 1 }} onClick={() => refA.current?.click()}>
            🖼 Da galeria
          </button>
        </div>
        {antes && <img src={antes.previa} alt="antes" style={s.previa} />}
        {fotoErro && <p style={{ color: "#b91c1c", fontSize: 14, margin: "8px 0 0" }}>{fotoErro}</p>}

        <div style={{ marginTop: 14 }}>
          <label style={painel.rotulo}>Tempo gasto (minutos, se souber)</label>
          <input type="number" style={{ ...painel.input, width: 140 }} value={duracao}
                 onChange={(e) => setDuracao(e.target.value)} placeholder="ex.: 30" />
          <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 0" }}>
            Em branco, o custeio usa a média da operação.
          </p>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14,
                        margin: "14px 0", color: cor.navy }}>
          <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />
          Enviar a foto para a família agora
        </label>

        <button style={painel.botao} onClick={concluir} disabled={enviando}>
          {enviando ? "Registrando…" : "Concluir lavagem"}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  fundo: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "flex",
           alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 },
  folha: { background: "#fff", width: "100%", maxWidth: 520, borderRadius: 16, padding: 20,
           maxHeight: "92vh", overflowY: "auto" },
  fechar: { background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b" },
  botaoFoto: { width: "100%", padding: 14, background: "#fff", color: "#12284b",
               border: "2px dashed #cbd5e1", borderRadius: 12, fontSize: 15, cursor: "pointer" },
  botaoFotoOk: { borderStyle: "solid", borderColor: "#0f766e", color: "#0f766e", background: "#f0fdfa" },
  previa: { width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, marginTop: 8 },
};
