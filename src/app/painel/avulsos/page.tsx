"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../ui";

/**
 * /painel/avulsos — a fila dos pedidos fora de plano.
 *
 * Por que essa tela existe: todas as outras listas de serviço filtram por data.
 * A agenda mostra uma janela de dias, o Início mostra o que vence hoje, o campo
 * mostra o dia. Um avulso pedido para daqui a dez dias não aparecia em lugar
 * nenhum — ficava correto no banco e invisível para você.
 *
 * Aqui não há filtro de data. É a lista de tudo que foi prometido e ainda não
 * foi feito, com duas datas lado a lado: a que a família pediu e a que a agenda
 * conseguiu. Quando a segunda passa da primeira, a linha fica vermelha.
 */

interface Servico {
  id: string;
  avulso: boolean;
  clienteId: string | null;
  cliente: string;
  tumuloId: string | null;
  tumulo: string;
  status: string;
  dataPrevista: string | null;
  dataPedida: string | null;
  diasAte: number | null;
  estourou: boolean;
  executadaEm: string | null;
  mes: string | null;
  valor: number | null;
  observacao: string | null;
  cobrado: boolean;
  valorCobrado: number | null;
}

function br(d: string | null) {
  if (!d) return "—";
  const [a, m, x] = d.slice(0, 10).split("-");
  return `${x}/${m}/${a}`;
}

function dinheiro(v: number | null) {
  if (v === null || v === undefined) return "—";
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
}

export default function AvulsosPage() {
  const [lista, setLista] = useState<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [temMigration, setTemMigration] = useState(true);
  const [situacao, setSituacao] = useState<"abertos" | "feitos">("abertos");

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch(`/api/servicos?tipo=avulso&situacao=${situacao}&limite=200`)
      .then((x) => x.json())
      .catch(() => null);
    setLista(r?.servicos || []);
    setTemMigration(r?.temMigration !== false);
    setCarregando(false);
  }, [situacao]);

  useEffect(() => { carregar(); }, [carregar]);

  const atrasados = lista.filter((s) => s.estourou).length;

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/avulsos" />
      <main style={painel.conteudo}>
        <h1 style={painel.h1}>Avulsos</h1>

        <div style={{ ...painel.card, padding: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 15, color: cor.cinza, marginRight: 4 }}>Mostrar:</span>
            <button
              style={situacao === "abertos" ? painel.botao : painel.botaoSec}
              onClick={() => setSituacao("abertos")}
            >
              A fazer
            </button>
            <button
              style={situacao === "feitos" ? painel.botao : painel.botaoSec}
              onClick={() => setSituacao("feitos")}
            >
              Já feitos
            </button>
            <span style={{ marginLeft: "auto", fontSize: 15, color: cor.cinza }}>
              {lista.length} limpeza(s)
            </span>
          </div>
        </div>

        {!temMigration && (
          <div style={{ ...painel.card, borderLeft: "4px solid #d97706", background: "rgb(var(--zm-aviso) / 0.08)" }}>
            <strong style={{ color: "rgb(var(--zm-aviso))" }}>A migration 0037 ainda não rodou</strong>
            <p style={{ color: "rgb(var(--zm-aviso))", fontSize: 15, margin: "6px 0 0", lineHeight: 1.5 }}>
              A lista funciona, mas sem a coluna da data pedida ela só mostra o dia em que a
              agenda encaixou. Rode <code>0037_data_desejada.sql</code> no Supabase para as
              duas datas aparecerem lado a lado.
            </p>
          </div>
        )}

        {atrasados > 0 && (
          <div style={{ ...painel.card, borderLeft: "4px solid #dc2626", background: "rgb(var(--zm-perigo) / 0.08)" }}>
            <strong style={{ color: "rgb(var(--zm-perigo))" }}>
              {atrasados} limpeza(s) não cabem até a data pedida
            </strong>
            <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 15, margin: "6px 0 0", lineHeight: 1.5 }}>
              A agenda tentou o dia pedido e os dias anteriores, e não havia vaga em nenhum.
              Ou você abre capacidade nesses dias, ou avisa a família antes — é melhor um
              telefonema hoje do que a limpeza chegando depois da data.
            </p>
          </div>
        )}

        {carregando ? (
          <p style={{ color: cor.cinza }}>Carregando…</p>
        ) : lista.length === 0 ? (
          <div style={painel.card}>
            <p style={{ color: cor.cinza, margin: 0, lineHeight: 1.6 }}>
              {situacao === "abertos"
                ? "Nenhuma limpeza avulsa em aberto. Elas nascem na ficha da família, no botão 🧽 Nova limpeza avulsa, ou no aviso de pedido que chega pela conversa."
                : "Nenhuma limpeza avulsa concluída ainda."}
            </p>
          </div>
        ) : (
          <div style={painel.card}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: cor.cinza }}>
                    <th style={{ padding: "6px 8px" }}>Família / jazigo</th>
                    <th style={{ padding: "6px 8px" }}>Pediu para</th>
                    <th style={{ padding: "6px 8px" }}>
                      {situacao === "feitos" ? "Feita em" : "Agenda marcou"}
                    </th>
                    <th style={{ padding: "6px 8px" }}>Valor</th>
                    <th style={{ padding: "6px 8px" }}>Cobrança</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((s) => (
                    <tr
                      key={s.id}
                      style={{
                        borderTop: `1px solid ${cor.linha}`,
                        background: s.estourou ? "rgb(var(--zm-perigo) / 0.08)" : undefined,
                      }}
                    >
                      <td style={{ padding: "8px" }}>
                        {s.clienteId ? (
                          <Link
                            href={`/painel/clientes/${s.clienteId}`}
                            style={{ color: cor.teal, fontWeight: 600, textDecoration: "none" }}
                          >
                            {s.cliente}
                          </Link>
                        ) : (
                          <b>{s.cliente}</b>
                        )}
                        <div style={{ color: cor.cinza }}>{s.tumulo}</div>
                        {s.observacao && (
                          <div style={{ color: "rgb(var(--zm-aviso))", marginTop: 2 }}>💬 {s.observacao}</div>
                        )}
                      </td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                        {br(s.dataPedida)}
                        {s.dataPedida && s.diasAte !== null && situacao === "abertos" && (
                          <div style={{ color: s.diasAte < 0 ? "rgb(var(--zm-perigo))" : cor.cinza }}>
                            {s.diasAte < 0
                              ? `${-s.diasAte} dia(s) atrás`
                              : s.diasAte === 0
                                ? "é hoje"
                                : `em ${s.diasAte} dia(s)`}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                        {situacao === "feitos" ? (
                          br(s.executadaEm)
                        ) : (
                          <>
                            <span style={{ color: s.estourou ? "rgb(var(--zm-perigo))" : undefined, fontWeight: s.estourou ? 700 : 400 }}>
                              {br(s.dataPrevista)}
                            </span>
                            {s.estourou && (
                              <div style={{ color: "rgb(var(--zm-perigo))" }}>depois do pedido</div>
                            )}
                            {s.status === "pendente" && !s.dataPrevista && (
                              <div style={{ color: cor.cinza }}>sem dia — gere a agenda</div>
                            )}
                          </>
                        )}
                      </td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{dinheiro(s.valor)}</td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                        {s.cobrado ? (
                          <span style={{ color: "#166534" }}>
                            lançada · {dinheiro(s.valorCobrado)}
                          </span>
                        ) : s.status === "executado" ? (
                          <span style={{ color: "rgb(var(--zm-aviso))" }}>feita, sem lançamento</span>
                        ) : (
                          <span style={{ color: cor.cinza }}>ao concluir</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ ...painel.card, background: "rgb(var(--zm-fundo))" }}>
          <strong style={{ color: cor.navy }}>Como a cobrança acontece</strong>
          <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 0", lineHeight: 1.6 }}>
            Não existe botão de cobrar limpeza por limpeza — e é de propósito. Quando a limpeza
            é concluída (no campo ou aqui no painel), o débito entra sozinho no extrato da
            família. Se o avulso foi marcado sem valor, ele usa o valor de referência da
            configuração, para nunca sair um débito em branco. A cobrança em si sai pelo{" "}
            <Link href="/painel/financeiro" style={{ color: cor.teal }}>Financeiro</Link>, pelo
            saldo da família — que é onde o dinheiro de verdade é conferido.
          </p>
        </div>
      </main>
    </div>
  );
}
