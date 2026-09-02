"use client";
import { useEffect, useState } from "react";
import { painel, cor } from "../../ui";

/**
 * A CONTA DA FAMÍLIA, DENTRO DA CONVERSA.
 *
 * O QUE ACONTECIA (relatado em 02/09): para saber de qual mês era um pagamento
 * recebido no WhatsApp, era preciso abrir TRÊS telas — a conversa, o
 * comprovante e a ficha da família — e comparar de cabeça. A pergunta nasce
 * aqui, olhando a imagem que a família acabou de mandar, e a resposta morava
 * em outro lugar.
 *
 * O QUE ESTE CARTÃO NÃO FAZ. Não é a ficha em miniatura, e não tenta ser: o
 * extrato inteiro, os contatos, os jazigos e os contratos continuam na ficha.
 * Aqui cabe uma coisa só — QUAL MÊS FALTA E QUAL JÁ FOI PAGO. Uma tela que
 * responde tudo um pouco obriga a abrir a outra do mesmo jeito.
 *
 * Ele nasce FECHADO quando a família está em dia: quem está respondendo um
 * recado de saudade não precisa de dinheiro na frente. Abre sozinho quando há
 * mês em aberto, porque aí a informação muda a resposta que vai ser escrita.
 */
export default function ContaDaFamilia({ familiaId }: { familiaId: string | null }) {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!familiaId) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/conta-corrente?familiaId=${encodeURIComponent(familiaId)}`);
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok || !j?.ok) { setErro(j?.erro || "não consegui ler a conta"); return; }
        setD(j);
        // ABRE POR ATRASO, NÃO POR "EM ABERTO".
        // Medido em 02/09: 158 meses em aberto na casa, e só 55 vencidos.
        // Abrir em cima dos 158 faria o cartão saltar em quase toda conversa,
        // e um alarme que toca sempre para de ser lido.
        setAberto(((j.meses || []) as any[]).some((m) => m.atrasado));
      } catch {
        if (vivo) setErro("não consegui falar com o servidor");
      }
    })();
    return () => { vivo = false; };
  }, [familiaId]);

  // SEM FAMÍLIA VINCULADA NÃO É "EM DIA" — é desconhecido, e dizer "Em dia"
  // aqui seria apresentar ausência como medição.
  if (!familiaId) {
    return (
      <div style={{ ...painel.card, padding: "10px 14px" }}>
        <span style={{ fontSize: 14, color: cor.cinza }}>
          Este contato não está ligado a uma família — não há conta para mostrar.
        </span>
      </div>
    );
  }

  if (erro) {
    return (
      <div style={{ ...painel.card, padding: "10px 14px" }}>
        <span style={{ fontSize: 14, color: "rgb(var(--zm-aviso))" }}>
          Não consegui carregar a conta desta família: {erro}
        </span>
      </div>
    );
  }

  if (!d) {
    return (
      <div style={{ ...painel.card, padding: "10px 14px" }}>
        <span style={{ fontSize: 14, color: cor.cinza }}>Lendo a conta da família…</span>
      </div>
    );
  }

  const meses: any[] = d.meses || [];
  const atrasados = meses.filter((m) => m.atrasado);
  const aVencer = meses.filter((m) => !m.quitado && !m.atrasado);
  const dinheiro = (v: number) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = (iso: string | null) => {
    if (!iso) return "—";
    const [, m, d] = String(iso).split("-");
    return `${d}/${m}`;
  };
  const mes = (comp: string) => {
    const [a, m] = String(comp).split("-");
    return `${m}/${a}`;
  };

  return (
    <div style={{ ...painel.card, padding: "10px 14px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15,
                         color: d.emDia ? cor.teal : "rgb(var(--zm-perigo))" }}>
          {d.frase}
        </strong>
        {aVencer.length > 0 && (
          <span style={{ fontSize: 14, color: cor.cinza }}>
            · {aVencer.length === 1 ? "1 mês a vencer" : `${aVencer.length} meses a vencer`}
          </span>
        )}
        <button style={{ ...painel.botaoMiniSec, marginLeft: "auto" }}
                onClick={() => setAberto(!aberto)}>
          {aberto ? "esconder" : "ver os meses"}
        </button>
      </div>

      {/* A PERGUNTA QUE SE FAZ OLHANDO O COMPROVANTE.
          "Em aberto" e "atrasado" não são a mesma coisa: 158 meses da casa
          estão em aberto e só 55 venceram. Sem essa linha, quem recebe um Pix
          não sabe se ele cobre um mês vencido ou o mês que ainda vai vencer —
          e é justamente isso que decide se dá para cobrar o resto. */}
      {d.fraseAtraso && (
        <div style={{ marginTop: 6, fontSize: 15, fontWeight: atrasados.length ? 700 : 400,
                      color: atrasados.length ? "rgb(var(--zm-perigo))" : cor.cinza }}>
          {d.fraseAtraso}
        </div>
      )}

      {aberto && (
        meses.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 14, color: cor.cinza }}>
            Nenhum lançamento nesta família ainda — nem cobrança, nem pagamento.
          </p>
        ) : (
          <div style={{ marginTop: 8, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
              <thead>
                <tr style={{ color: cor.cinza, textAlign: "left" }}>
                  <th style={{ padding: "4px 8px 4px 0", fontWeight: 500 }}>mês</th>
                  <th style={{ padding: "4px 8px", fontWeight: 500, textAlign: "right" }}>cobrado</th>
                  <th style={{ padding: "4px 8px", fontWeight: 500, textAlign: "right" }}>pago</th>
                  <th style={{ padding: "4px 0 4px 8px", fontWeight: 500, textAlign: "right" }}>situação</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                {meses.map((m: any) => (
                  <tr key={m.competencia}
                      style={{ borderTop: `1px solid ${cor.linha}`,
                               color: m.quitado ? cor.cinza : "rgb(var(--zm-ink))" }}>
                    <td style={{ padding: "5px 8px 5px 0", fontWeight: m.atrasado ? 700 : 400 }}>
                      {mes(m.competencia)}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{dinheiro(m.devido)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{dinheiro(m.pago)}</td>
                    {/* TRÊS ESTADOS, NÃO DOIS. Um mês que ainda não venceu não
                        é dívida: chamá-lo de "falta" em vermelho faria a
                        família parecer inadimplente por uma cobrança cujo
                        prazo nem chegou. */}
                    <td style={{ padding: "5px 0 5px 8px", textAlign: "right",
                                 fontWeight: m.atrasado ? 700 : 400,
                                 color: m.quitado ? cor.teal
                                      : m.atrasado ? "rgb(var(--zm-perigo))" : cor.cinza }}>
                      {m.quitado ? "✓ pago"
                        : m.atrasado ? `${dinheiro(m.falta)} atrasado`
                        : `${dinheiro(m.falta)} · vence ${dia(m.vence)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: cor.cinza, lineHeight: 1.5 }}>
              O mês vem do campo <strong>competência</strong> de cada lançamento — o mesmo que
              você escolhe ao ligar um comprovante. Nada aqui é adivinhado.
            </p>
          </div>
        )
      )}
    </div>
  );
}
