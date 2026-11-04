"use client";
import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";
import { useRecado } from "@/components/Dialogos";

/**
 * AS FOTOS QUE SAÍRAM E AINDA NÃO VIRARAM LAVAGEM.
 *
 * MEDIDO EM 04/11/2026: 7 serviços executados, 3 com foto — e 8 fotos saíram
 * do celular da Sureya sem que o arquivo fosse guardado (0160). Não é que a
 * limpeza não aconteça: é que a prova dela ficava só no WhatsApp.
 *
 * A TELA NÃO ADIVINHA O JAZIGO. Uma família pode ter três, e a foto não diz
 * qual. Chutar "o único jazigo dela" acerta na maioria e erra exatamente nas
 * famílias grandes — e lavagem lançada no jazigo errado vira cobrança no
 * jazigo errado.
 */
export default function LavagensSemRegistro() {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [dia, setDia] = useState<Record<string, string>>({});
  const recado = useRecado();

  async function carregar() {
    try {
      const r = await fetch("/api/fotos-que-sairam");
      const j = await r.json();
      if (!r.ok || !j?.ok) { setErro(j?.erro || "não consegui ler a fila"); return; }
      setErro(null);
      setD(j);
    } catch {
      setErro("não consegui falar com o servidor");
    }
  }
  useEffect(() => { carregar(); }, []);

  async function registrar(item: any) {
    const tumuloId = escolha[item.mensagemId];
    if (!tumuloId) { recado.erro("Escolha o jazigo desta limpeza."); return; }
    const data = dia[item.mensagemId] || String(item.quando).slice(0, 10);
    setOcupado(item.mensagemId);
    try {
      const r = await fetch("/api/servico/registrar-feito", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tumuloId, data, fotoDepoisUrl: item.fotoOriginal }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        recado.erro(j?.mensagem || "Não consegui registrar. A foto continua na fila.");
        return;
      }
      recado.ok("Limpeza registrada com a foto.");
      carregar();
    } finally { setOcupado(null); }
  }

  const fila: any[] = (d?.fila) || [];

  return (
    <div style={painel.wrap}>
      <PainelNav />
      <div style={painel.conteudo}>
        <h1 style={{ fontSize: 26, color: cor.navy, marginBottom: 4 }}>
          Fotos que saíram e não viraram registro
        </h1>
        <p style={{ color: cor.cinza, marginTop: 0, fontSize: 14, lineHeight: 1.5 }}>
          Fotos que você mandou pelo WhatsApp do celular. Diga de qual jazigo é cada
          uma e ela vira limpeza registrada — com a foto no jazigo, para a família.
        </p>

        {erro && (
          <div style={{ ...painel.card, borderColor: "rgb(var(--zm-perigo))" }}>
            Não consegui carregar a fila: {erro}
          </div>
        )}

        {!d && !erro && <div style={painel.card}>Lendo…</div>}

        {d && fila.length === 0 && (
          <div style={painel.card}>
            Nenhuma foto esperando. Toda foto que você mandou já virou registro.
          </div>
        )}

        {(fila || []).map((item: any) => (
          <div key={item.mensagemId} style={painel.card}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {item.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.foto} alt="foto enviada"
                     style={{ width: 150, height: 150, objectFit: "cover", borderRadius: 10 }} />
              ) : (
                /* NÃO CONSEGUI ABRIR ≠ NÃO TEM FOTO (0139). */
                <div style={{ width: 150, height: 150, borderRadius: 10, display: "grid",
                              placeItems: "center", textAlign: "center", fontSize: 13,
                              padding: 8, color: "rgb(var(--zm-aviso))",
                              border: "1px solid rgb(var(--zm-aviso))" }}>
                  não consegui abrir esta foto
                </div>
              )}

              <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                <strong style={{ fontSize: 17, color: cor.navy }}>{item.familia}</strong>
                <p style={{ margin: "2px 0 8px", fontSize: 14, color: cor.cinza }}>
                  enviada em {new Date(item.quando).toLocaleString("pt-BR")}
                  {item.legenda ? ` · “${item.legenda}”` : ""}
                </p>

                {(item.jazigos || []).length === 0 ? (
                  <p style={{ fontSize: 14, color: "rgb(var(--zm-aviso))", lineHeight: 1.5 }}>
                    Esta família não tem jazigo cadastrado — ligue um jazigo a ela
                    antes de registrar a limpeza.
                  </p>
                ) : (
                  <>
                    <label style={painel.rotulo}>De qual jazigo é esta limpeza?</label>
                    <select style={painel.input}
                            value={escolha[item.mensagemId] || ""}
                            onChange={(e) => setEscolha({ ...escolha, [item.mensagemId]: e.target.value })}>
                      <option value="">escolha…</option>
                      {(item.jazigos || []).map((j: any) => (
                        <option key={j.id} value={j.id}>
                          {j.identificacao}{j.quadra ? ` · ${j.quadra}` : ""}
                          {j.cemiterio ? ` · ${String(j.cemiterio).split("—")[0].trim()}` : ""}
                        </option>
                      ))}
                    </select>

                    <label style={{ ...painel.rotulo, marginTop: 8 }}>Em que dia foi feita?</label>
                    <input type="date" style={painel.input}
                           value={dia[item.mensagemId] || String(item.quando).slice(0, 10)}
                           max={d.hoje}
                           onChange={(e) => setDia({ ...dia, [item.mensagemId]: e.target.value })} />

                    <button style={{ ...painel.botao, marginTop: 10 }}
                            disabled={ocupado === item.mensagemId}
                            onClick={() => registrar(item)}>
                      {ocupado === item.mensagemId ? "registrando…" : "Registrar como limpeza feita"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
