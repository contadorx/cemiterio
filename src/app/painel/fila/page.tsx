"use client";

import { useEffect, useState } from "react";
import { PainelNav } from "../ui";

/**
 * A FILA DE LIBERAÇÃO — a tela onde a Sureya aprova cada mensagem.
 *
 * Ela vê a PRÉVIA EXATA do que vai sair: as fotos e o texto já com o nome da
 * família preenchido. Pode editar antes de mandar. Nada é enviado sem que ela
 * toque em "Enviar", uma mensagem por vez.
 *
 * O envio sai pela instância da Evolution — a mesma linha de WhatsApp da
 * Sureya —, levando AS FOTOS junto. O link `wa.me` não serviria: ele carrega
 * só texto, e as fotos do antes e do depois são o motivo da mensagem existir.
 *
 * Se o envio falhar, a mensagem VOLTA para a fila. Marcar como enviada uma
 * mensagem que não saiu faria a família sumir da lista sem ter recebido nada,
 * e ninguém descobriria.
 */

interface Item {
  id: string;
  tipo: string;
  texto: string;
  fotos: string[];
  criadoEm: string;
  familia: string | null;
  para: string | null;
  telefone: string | null;
  local: string | null;
}

const ROTULO: Record<string, string> = {
  foto: "Foto do serviço",
  cobranca: "Cobrança",
  lembrete: "Lembrete",
  agradecimento: "Agradecimento",
};

export default function Fila() {
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState<string>("");

  async function carregar() {
    setCarregando(true);
    try {
      const r = await fetch("/api/fila").then((x) => x.json());
      if (r.ok) { setItens(r.itens); setWhatsapp(r.whatsapp || ""); }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function decidir(item: Item, acao: "enviar" | "descartar") {
    setOcupado(item.id);
    const texto = editando[item.id] ?? item.texto;
    try {
      const r = await fetch("/api/fila", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, acao, texto }),
      }).then((x) => x.json());

      if (!r.ok) {
        // A mensagem VOLTA para a fila quando o envio falha, então ela
        // continua na lista e pode ser tentada de novo.
        alert(r.erro || "Não consegui enviar.");
        carregar();
        return;
      }
      setItens((a) => a.filter((x) => x.id !== item.id));
    } finally {
      setOcupado(null);
    }
  }

  if (carregando) {
    return (
      <>
        <PainelNav atual="/painel/fila" />
        <p style={s.info}>Carregando...</p>
      </>
    );
  }

  if (!itens.length) {
    return (
      <>
        <PainelNav atual="/painel/fila" />
        <div style={s.vazio}>
        <p style={s.vazioTitulo}>Nada esperando aprovação</p>
        <p style={s.vazioTexto}>
          Quando a Nina terminar uma limpeza, a mensagem com as fotos aparece aqui
          para você revisar antes de enviar.
        </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PainelNav atual="/painel/fila" />
      <div style={s.pagina}>
      <h1 style={s.h1}>Aguardando sua liberação</h1>
      <p style={s.sub}>
        {itens.length} {itens.length === 1 ? "mensagem" : "mensagens"} ·
        nada é enviado sem você aprovar
      </p>

      {/* O WhatsApp precisa estar de pé para as FOTOS saírem. Avisar aqui
          evita ela revisar tudo e descobrir o problema só no último clique. */}
      {whatsapp && whatsapp !== "conectado" && (
        <div style={s.alerta}>
          <b>O WhatsApp está {whatsapp === "conectando" ? "conectando" : "desconectado"}.</b>{" "}
          As mensagens ficam guardadas aqui até a conexão voltar.{" "}
          <a href="/painel/whatsapp" style={{ color: "#8B2020" }}>Reconectar agora</a>
        </div>
      )}

      {itens.map((item) => (
        <div key={item.id} style={s.card}>
          <div style={s.cabecalho}>
            <span style={s.etiqueta}>{ROTULO[item.tipo] ?? item.tipo}</span>
            <span style={s.para}>{item.para || item.familia}</span>
          </div>
          {item.local && <p style={s.local}>{item.local}</p>}

          {!!item.fotos.length && (
            <div style={s.fotos}>
              {item.fotos.map((f, i) => (
                <img key={i} src={f} alt="" style={s.foto} />
              ))}
            </div>
          )}

          {/* A prévia é editável: o texto que ela vê é o texto que vai sair. */}
          <textarea
            style={s.texto}
            value={editando[item.id] ?? item.texto}
            onChange={(e) => setEditando((x) => ({ ...x, [item.id]: e.target.value }))}
            rows={7}
          />

          <div style={s.acoes}>
            <button
              style={{ ...s.botao, ...s.enviar }}
              disabled={ocupado === item.id || !item.telefone}
              onClick={() => decidir(item, "enviar")}
            >
              {ocupado === item.id ? "Enviando…" : `Enviar${item.fotos.length ? ` com ${item.fotos.length} foto${item.fotos.length > 1 ? "s" : ""}` : ""}`}
            </button>
            <button
              style={{ ...s.botao, ...s.descartar }}
              disabled={ocupado === item.id}
              onClick={() => decidir(item, "descartar")}
            >
              Não enviar
            </button>
          </div>

          {!item.telefone && (
            <p style={s.aviso}>Esta pessoa não tem WhatsApp cadastrado.</p>
          )}
        </div>
      ))}
      </div>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  pagina: { padding: "20px 16px 60px", maxWidth: 640, margin: "0 auto" },
  h1: { fontSize: 24, color: "#0E2B4B", margin: "0 0 4px" },
  sub: { fontSize: 14, color: "#778", margin: "0 0 22px" },
  info: { padding: 28, color: "#667" },
  vazio: { padding: "60px 24px", textAlign: "center", maxWidth: 420, margin: "0 auto" },
  vazioTitulo: { fontSize: 19, color: "#0E2B4B", fontWeight: 600, margin: 0 },
  vazioTexto: { fontSize: 15, color: "#778", marginTop: 10, lineHeight: 1.5 },
  alerta: { background: "#FDECEC", border: "1px solid #E9B4B4", borderRadius: 12,
            padding: "12px 14px", marginBottom: 16, fontSize: 15, color: "#8B2020",
            lineHeight: 1.5 },
  card: { background: "#fff", borderRadius: 16, padding: 18, marginBottom: 18,
          boxShadow: "0 2px 12px rgba(0,0,0,.08)" },
  cabecalho: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  etiqueta: { background: "#EEF3F9", color: "#0E2B4B", borderRadius: 999,
              padding: "4px 12px", fontSize: 13, fontWeight: 600 },
  para: { fontSize: 16, color: "#223", fontWeight: 600 },
  local: { fontSize: 13, color: "#889", margin: "6px 0 0" },
  fotos: { display: "flex", gap: 8, marginTop: 14, overflowX: "auto" },
  foto: { width: 150, height: 112, objectFit: "cover", borderRadius: 10, flexShrink: 0 },
  texto: { width: "100%", marginTop: 14, padding: 12, borderRadius: 10,
           border: "1px solid #D8DEE6", fontSize: 15, lineHeight: 1.5,
           fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" },
  acoes: { display: "flex", gap: 10, marginTop: 12 },
  botao: { flex: 1, padding: "14px 12px", borderRadius: 11, fontSize: 15,
           fontWeight: 600, cursor: "pointer", border: "none" },
  enviar: { background: "#2E7D32", color: "#fff" },
  descartar: { background: "#fff", color: "#667", border: "1px solid #CFD6DE" },
  aviso: { fontSize: 13, color: "#8B6B20", marginTop: 10 },
};
