"use client";

import { useEffect, useState, useCallback } from "react";
import { painel, cor } from "./ui";

/**
 * O aviso de SERVIÇO ADICIONAL.
 *
 * A família pede uma limpeza extra pelo WhatsApp — para o Dia dos Pais, para um
 * aniversário — e isso morria dentro da conversa. Aqui o pedido aparece,
 * ganha jazigo, data e preço, e vira serviço de verdade.
 *
 * Quem dá o preço é você. A IA só avisa.
 */

export interface Pedido {
  id: string;
  clienteId: string | null;
  cliente: string;
  conversaId: string | null;
  tumuloId: string | null;
  tumulo: string | null;
  resumo: string;
  trecho: string | null;
  prazo: string | null;
  diasAte: number | null;
  ocasiao: string | null;
  origem: string;
  status: string;
}

function corDoPrazo(dias: number | null): string {
  if (dias === null) return cor.cinza;
  if (dias < 0) return "rgb(var(--zm-perigo))";
  if (dias <= 3) return "rgb(var(--zm-perigo))";
  if (dias <= 7) return "rgb(var(--zm-aviso))";
  return cor.cinza;
}

function textoDoPrazo(p: Pedido): string {
  if (!p.prazo) return "sem data dita";
  const d = p.diasAte;
  const data = p.prazo.split("-").reverse().join("/");
  if (d === null) return data;
  if (d < 0) return `${data} · passou há ${-d} dia${-d > 1 ? "s" : ""}`;
  if (d === 0) return `${data} · é hoje`;
  return `${data} · faltam ${d} dia${d > 1 ? "s" : ""}`;
}

export function PedidosAdicionais({
  conversaId,
  aoMudar,
}: {
  conversaId?: string;      // na tela da conversa, mostra só os desta conversa
  aoMudar?: () => void;
}) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [semMigration, setSemMigration] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/pedidos-conversa?status=novo")
      .then((x) => x.json())
      .catch(() => null);
    if (!r?.ok) return;
    setSemMigration(!!r.semMigration);
    const lista: Pedido[] = r.pedidos || [];
    setPedidos(conversaId ? lista.filter((p) => p.conversaId === conversaId) : lista);
  }, [conversaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (semMigration) {
    return (
      <div style={{ ...painel.card, borderLeft: "4px solid #b45309" }}>
        <strong style={{ color: "rgb(var(--zm-aviso))" }}>Falta rodar a migration 0035 no banco</strong>
        <p style={{ color: cor.cinza, margin: "6px 0 0", fontSize: 14 }}>
          Até lá, os pedidos de serviço adicional continuam só dentro da conversa.
        </p>
      </div>
    );
  }

  if (pedidos.length === 0) return null;

  return (
    <div style={{ ...painel.card, borderLeft: "4px solid #b45309", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <strong style={{ fontSize: 18, color: "rgb(var(--zm-aviso))" }}>
          {pedidos.length === 1 ? "1 pedido de serviço adicional" : `${pedidos.length} pedidos de serviço adicional`}
        </strong>
      </div>
      <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 12px" }}>
        A família pediu algo fora do plano. Não vira limpeza sozinho — precisa de jazigo, data e preço.
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {pedidos.map((p) => (
          <div
            key={p.id}
            style={{ border: `1px solid ${cor.linha}`, borderRadius: 10, padding: 12, background: "#fffdf7" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: cor.navy }}>{p.cliente}</strong>
              <span style={{ color: corDoPrazo(p.diasAte), fontWeight: 700, fontSize: 14 }}>
                {textoDoPrazo(p)}
              </span>
            </div>

            <div style={{ margin: "6px 0", color: cor.navy }}>{p.resumo}</div>

            {p.trecho && (
              <div
                style={{
                  borderLeft: `3px solid ${cor.linha}`,
                  paddingLeft: 10,
                  color: cor.cinza,
                  fontSize: 14,
                  fontStyle: "italic",
                  margin: "6px 0",
                }}
              >
                “{p.trecho}”
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button
                style={painel.botaoMini}
                onClick={() => setAbertoId(abertoId === p.id ? null : p.id)}
              >
                {abertoId === p.id ? "fechar" : "Registrar como serviço"}
              </button>
              {/* O link "abrir conversa" saiu: /painel/conversas foi desligada
                  junto com o agente de IA e passou a devolver 404. Deixar um
                  botão que leva a lugar nenhum é pior que não ter botão. */}
              <button
                style={painel.botaoMiniSec}
                onClick={async () => {
                  if (!confirm("Descartar este pedido? Ele some da lista.")) return;
                  await fetch("/api/pedidos-conversa", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pedidoId: p.id, acao: "descartar" }),
                  });
                  carregar();
                  aoMudar?.();
                }}
              >
                descartar
              </button>
            </div>

            {abertoId === p.id && (
              <FormRegistrar
                pedido={p}
                aoPronto={() => {
                  setAbertoId(null);
                  carregar();
                  aoMudar?.();
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormRegistrar({ pedido, aoPronto }: { pedido: Pedido; aoPronto: () => void }) {
  const [jazigos, setJazigos] = useState<any[]>([]);
  const [tumuloId, setTumuloId] = useState(pedido.tumuloId || "");
  const [data, setData] = useState(pedido.prazo || "");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!pedido.clienteId) return;
    fetch(`/api/clientes/${pedido.clienteId}`)
      .then((x) => x.json())
      .then((r) => {
        const t = r?.tumulos || [];
        setJazigos(t);
        if (!pedido.tumuloId && t.length === 1) setTumuloId(t[0].id);
      })
      .catch(() => {});
  }, [pedido.clienteId, pedido.tumuloId]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await fetch("/api/pedidos-conversa", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pedidoId: pedido.id,
        acao: "registrar",
        tumuloId: tumuloId || null,
        dataPrevista: data || null,
        valor: valor === "" ? null : Number(valor.replace(",", ".")),
      }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setSalvando(false);
    if (r?.ok) aoPronto();
    else setErro(r?.mensagem || r?.erro || "não deu para registrar");
  }

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${cor.linha}`, paddingTop: 12 }}>
      {!pedido.clienteId && (
        <p style={{ color: "rgb(var(--zm-aviso))", fontSize: 14, margin: "0 0 8px" }}>
          Este contato ainda não é uma família cadastrada. Vincule o lead a um cliente antes de registrar.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <div>
          <label style={painel.rotulo}>Jazigo</label>
          <select style={painel.input} value={tumuloId} onChange={(e) => setTumuloId(e.target.value)}>
            <option value="">escolha…</option>
            {jazigos.map((j: any) => (
              <option key={j.id} value={j.id}>
                {j.identificacao}
                {j.falecido_nome ? ` — ${j.falecido_nome}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={painel.rotulo}>De preferência em</label>
          <input type="date" style={painel.input} value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div>
          <label style={painel.rotulo}>Valor (R$)</label>
          <input
            style={painel.input}
            placeholder="deixe vazio se ainda não decidiu"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
      </div>

      <p style={{ color: cor.cinza, fontSize: 13, margin: "8px 0 0" }}>
        Entra como limpeza <b>avulsa</b> (fora do plano), pendente, com prioridade. Rode a agenda depois
        para ela cair num dia de trabalho. A data é <b>preferência</b>: a agenda tenta esse dia,
        antecipa se ele estiver cheio e nunca passa dele.
      </p>

      {erro && <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 14, margin: "8px 0 0" }}>{erro}</p>}

      <button style={{ ...painel.botao, marginTop: 10 }} disabled={salvando || !tumuloId} onClick={salvar}>
        {salvando ? "registrando…" : "Registrar serviço"}
      </button>
    </div>
  );
}

/** Anotar à mão um pedido que apareceu numa conversa antiga. */
export function AnotarPedido({
  conversaId,
  clienteId,
  aoPronto,
}: {
  conversaId: string;
  clienteId: string | null;
  aoPronto: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [resumo, setResumo] = useState("");
  const [trecho, setTrecho] = useState("");
  const [prazo, setPrazo] = useState("");
  const [ocasiao, setOcasiao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) {
    return (
      <button style={painel.botaoSec} onClick={() => setAberto(true)}>
        + Anotar pedido de serviço adicional
      </button>
    );
  }

  return (
    <div style={{ ...painel.card, borderLeft: "4px solid #b45309" }}>
      <strong style={{ color: "rgb(var(--zm-aviso))" }}>Pedido de serviço adicional</strong>
      <p style={{ color: cor.cinza, fontSize: 14, margin: "4px 0 10px" }}>
        Para o que a família pediu aqui na conversa e ainda não virou trabalho.
      </p>

      <label style={painel.rotulo}>O que ela pediu</label>
      <input
        style={painel.input}
        placeholder="lavar o jazigo do pai antes do Dia dos Pais"
        value={resumo}
        onChange={(e) => setResumo(e.target.value)}
      />

      <label style={{ ...painel.rotulo, marginTop: 8 }}>A frase dela (opcional, serve de prova)</label>
      <input style={painel.input} value={trecho} onChange={(e) => setTrecho(e.target.value)} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 8 }}>
        <div>
          <label style={painel.rotulo}>De preferência em</label>
          <input type="date" style={painel.input} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </div>
        <div>
          <label style={painel.rotulo}>Ocasião</label>
          <input style={painel.input} placeholder="Dia dos Pais" value={ocasiao} onChange={(e) => setOcasiao(e.target.value)} />
        </div>
      </div>

      {erro && <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 14, margin: "8px 0 0" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          style={painel.botao}
          disabled={salvando || !resumo.trim()}
          onClick={async () => {
            setSalvando(true);
            setErro(null);
            const r = await fetch("/api/pedidos-conversa", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversaId, clienteId, resumo, trecho: trecho || null, prazo: prazo || null, ocasiao: ocasiao || null }),
            })
              .then((x) => x.json())
              .catch(() => null);
            setSalvando(false);
            if (r?.ok) {
              setAberto(false);
              setResumo(""); setTrecho(""); setPrazo(""); setOcasiao("");
              aoPronto();
            } else setErro(r?.mensagem || r?.erro || "não deu para anotar");
          }}
        >
          {salvando ? "anotando…" : "Anotar"}
        </button>
        <button style={painel.botaoSec} onClick={() => setAberto(false)}>cancelar</button>
      </div>
    </div>
  );
}
