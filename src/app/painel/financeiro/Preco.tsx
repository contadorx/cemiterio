"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";

/**
 * O PREÇO — o que se cobra, o que custa, e quem está abaixo do custo.
 *
 * ---------------------------------------------------------------------------
 * A ARMADILHA QUE ESTA TELA EXISTE PARA NÃO CAIR
 * ---------------------------------------------------------------------------
 * "Quanto custa uma lavagem?" tem DUAS respostas certas:
 *
 *   CUSTO CHEIO       o pagamento da ajudante dividido pelas lavagens que ela
 *                     de fato faz hoje. Responde "este contrato paga o próprio
 *                     custo?".
 *   CUSTO DE MAIS UM  o que a próxima lavagem acrescenta de verdade. Com a
 *                     agenda em 42% de uso, a ajudante já está paga e já está
 *                     no cemitério: a lavagem a mais custa material, não
 *                     salário.
 *
 * Trocar um pelo outro custa dinheiro nos dois sentidos, e por isso os dois
 * aparecem sempre, com nome. Nenhum deles é "o custo".
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTÁ MEDIDO E O QUE É CHUTE SEU
 * ---------------------------------------------------------------------------
 * Contratos, periodicidade, valor e carga: MEDIDOS, dos 82 contratos reais.
 * Pagamento da ajudante: está cadastrado (R$ 1.840). Material, transporte e
 * sistema: NÃO EXISTEM no sistema — todas as tabelas de custo estão vazias.
 *
 * Enquanto eles estiverem em branco a tela diz, com todas as letras, que a
 * sobra mostrada é o TETO do que pode sobrar, e não o que sobra. Um número de
 * lucro que esconde três custos zerados é pior que nenhum número.
 *
 * NADA AQUI É SALVO. Você mexe nos campos e vê a conta virar; o que ficar bom
 * você decide depois, com a Sureya.
 */

const brl = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Linha = {
  id: string; familia: string | null; codigo: string | null;
  periodicidade: string | null; valorMensal: number | null;
  lavagensMes: number | null; porLavagem: number | null; sobraMes: number | null;
  situacao: "abaixo do custo" | "apertado" | "saudavel" | "nao da para dizer";
};

type Conta = {
  contratos: number; semPeriodicidade: number;
  lavagensMes: number; receitaMes: number; receitaPorLavagem: number | null;
  capacidadeMes: number | null; utilizacao: number | null; folgaLavagens: number | null;
  custoFixoMes: number; custoCheioPorLavagem: number | null; custoDeMaisUm: number;
  sobraMes: number; equilibrioLavagens: number | null;
  linhas: Linha[]; abaixoDoCusto: number; apertados: number;
  referencia: number | null; buracos: string[]; ajudanteVeioDoCadastro: boolean;
};

function Numero({ rotulo, valor, aoMudar, sufixo, dica }: {
  rotulo: string; valor: string; aoMudar: (v: string) => void;
  sufixo?: string; dica?: string;
}) {
  return (
    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
      <label style={painel.rotulo}>{rotulo}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 14, color: cor.cinza }}>R$</span>
        <input style={{ ...painel.input, flex: 1 }} inputMode="decimal"
               value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder="0,00" />
        {sufixo && <span style={{ fontSize: 13, color: cor.cinza, whiteSpace: "nowrap" }}>{sufixo}</span>}
      </div>
      {dica && <p style={{ fontSize: 12.5, color: cor.cinza, margin: "4px 0 0", lineHeight: 1.4 }}>{dica}</p>}
    </div>
  );
}

function Cartao({ titulo, valor, nota, tom }: {
  titulo: string; valor: string; nota?: string; tom?: "bom" | "aviso" | "ruim";
}) {
  const c = tom === "bom" ? "rgb(var(--zm-teal))"
          : tom === "aviso" ? "rgb(var(--zm-aviso))"
          : tom === "ruim" ? "rgb(var(--zm-perigo))" : "rgb(var(--zm-ink))";
  return (
    <div style={{
      flex: "1 1 170px", minWidth: 0, padding: "12px 14px", borderRadius: 12,
      border: `1px solid ${cor.linha}`, background: cor.card,
    }}>
      <div style={{ fontSize: 12.5, color: cor.cinza, marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: c, fontVariantNumeric: "tabular-nums" }}>
        {valor}
      </div>
      {nota && <div style={{ fontSize: 12.5, color: cor.cinza, marginTop: 3, lineHeight: 1.4 }}>{nota}</div>}
    </div>
  );
}

export default function Preco() {
  const [ajudante, setAjudante] = useState("");
  const [material, setMaterial] = useState("");
  const [transporte, setTransporte] = useState("");
  const [sistema, setSistema] = useState("");
  const [d, setD] = useState<Conta | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams();
    if (ajudante.trim()) p.set("ajudante", ajudante);
    if (material.trim()) p.set("material", material);
    if (transporte.trim()) p.set("transporte", transporte);
    if (sistema.trim()) p.set("sistema", sistema);
    const r = await fetch(`/api/precificacao?${p}`).then((x) => x.json()).catch(() => null);
    setD(r?.ok ? (r as Conta) : null);
    setCarregando(false);
  }, [ajudante, material, transporte, sistema]);

  // Espera a digitação parar: recalcular a cada tecla mandaria uma consulta por
  // caractere, e a conta piscaria enquanto a pessoa ainda está escrevendo.
  useEffect(() => {
    const t = setTimeout(carregar, 400);
    return () => clearTimeout(t);
  }, [carregar]);

  if (carregando) return <p style={{ color: cor.cinza }}>Somando os contratos…</p>;
  if (!d) return <p style={{ color: cor.cinza }}>Não consegui montar a conta agora.</p>;

  const abaixo = d.linhas.filter((l) => l.situacao === "abaixo do custo")
                         .sort((a, b) => (a.porLavagem ?? 0) - (b.porLavagem ?? 0));
  const semConta = d.linhas.filter((l) => l.situacao === "nao da para dizer");

  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* O QUE VOCÊ COBRA — tudo medido, nada suposto.                       */}
      {/* ------------------------------------------------------------------ */}
      <div style={painel.card}>
        <div style={painel.rotulo}>O que você cobra hoje</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Cartao titulo="Contratos ativos" valor={String(d.contratos)}
                  nota={`${d.lavagensMes} lavagens por mês`} />
          <Cartao titulo="Receita do mês" valor={brl(d.receitaMes)}
                  nota="se todos pagarem" />
          <Cartao titulo="Média por lavagem" valor={brl(d.receitaPorLavagem)}
                  nota={d.referencia ? `a referência da casa é ${brl(d.referencia)}` : undefined}
                  tom={d.referencia && d.receitaPorLavagem && d.receitaPorLavagem < d.referencia * 0.6
                       ? "aviso" : undefined} />
          <Cartao titulo="Uso da agenda"
                  valor={d.utilizacao === null ? "—" : `${d.utilizacao}%`}
                  nota={d.folgaLavagens === null ? undefined
                        : `cabem mais ${d.folgaLavagens} lavagens no mês`}
                  tom={d.utilizacao !== null && d.utilizacao < 60 ? "aviso" : "bom"} />
        </div>
        {d.semPeriodicidade > 0 && (
          <p style={{ fontSize: 13.5, color: "rgb(var(--zm-aviso))", margin: "10px 0 0", lineHeight: 1.5 }}>
            {d.semPeriodicidade} {d.semPeriodicidade === 1 ? "contrato ficou" : "contratos ficaram"} de
            fora da conta por não ter periodicidade ou valor. Eles não entram como zero — entrariam
            como trabalho de graça, e apareceriam como os melhores contratos da casa.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* O QUE CUSTA — o que ele precisa dizer.                              */}
      {/* ------------------------------------------------------------------ */}
      <div style={painel.card}>
        <div style={painel.rotulo}>O que custa</div>
        <p style={{ fontSize: 14, color: cor.cinza, margin: "0 0 12px", lineHeight: 1.5 }}>
          O sistema não tem custo nenhum lançado — as tabelas de material, compras e pagamento da
          equipe estão vazias. O único número cadastrado é o da ajudante. Preencha o resto aqui e a
          conta vira na hora. <b>Nada é salvo.</b>
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Numero rotulo="Ajudante" valor={ajudante} aoMudar={setAjudante} sufixo="/ mês"
                  dica={d.ajudanteVeioDoCadastro
                        ? `em branco = ${brl(d.custoFixoMes)} do cadastro`
                        : "não há valor cadastrado"} />
          <Numero rotulo="Material" valor={material} aoMudar={setMaterial} sufixo="/ lavagem"
                  dica="produto, pano, água, balde" />
          <Numero rotulo="Transporte" valor={transporte} aoMudar={setTransporte} sufixo="/ lavagem"
                  dica="condução, combustível" />
          <Numero rotulo="Sistema e telefone" valor={sistema} aoMudar={setSistema} sufixo="/ mês"
                  dica="a IA custou R$ 5,87 em 42 dias" />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* A CONTA — os dois custos, sempre os dois.                           */}
      {/* ------------------------------------------------------------------ */}
      <div style={painel.card}>
        <div style={painel.rotulo}>A conta</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Cartao titulo="Custo cheio por lavagem" valor={brl(d.custoCheioPorLavagem)}
                  nota="o fixo dividido pelas lavagens de hoje" />
          <Cartao titulo="Custo de mais uma" valor={brl(d.custoDeMaisUm)}
                  nota="o que a próxima lavagem acrescenta" tom="bom" />
          <Cartao titulo="Sobra do mês" valor={brl(d.sobraMes)}
                  nota={d.buracos.length ? "com custos faltando — é o teto" : "receita menos custos"}
                  tom={d.sobraMes <= 0 ? "ruim" : d.buracos.length ? "aviso" : "bom"} />
          <Cartao titulo="Ponto de equilíbrio"
                  valor={d.equilibrioLavagens === null ? "—" : `${d.equilibrioLavagens} lavagens`}
                  nota="pagam o fixo, ao preço médio de hoje" />
        </div>

        {/* SEM ISTO A TELA MENTE POR OMISSÃO. Uma sobra calculada com três
            custos em zero lida como lucro é o jeito mais rápido de baixar um
            preço que já não paga a conta. */}
        {d.buracos.length > 0 && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 10,
            border: "1px solid rgb(var(--zm-aviso) / 0.45)",
            background: "rgb(var(--zm-aviso) / 0.1)",
            fontSize: 13.5, color: "rgb(var(--zm-aviso))", lineHeight: 1.5,
          }}>
            <b>Esta sobra é o teto, não o que sobra.</b> Está faltando: {(d.buracos || []).join(", ")}.
            Enquanto esses campos estiverem em branco eles valem zero na conta — e nenhum deles é
            zero na vida real.
          </div>
        )}

        <p style={{ fontSize: 13.5, color: cor.cinza, marginTop: 12, lineHeight: 1.55 }}>
          <b>Os dois custos servem para perguntas diferentes.</b> Use o <b>cheio</b> para decidir se
          um contrato que já existe paga o próprio custo. Use o <b>de mais uma</b> para decidir se
          vale pegar mais um jazigo: enquanto houver folga na agenda, a ajudante já está paga e já
          está no cemitério, então a lavagem a mais custa material — não salário. Trocar os dois faz
          recusar cliente que daria dinheiro, ou achar que tudo dá lucro.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* QUEM ESTÁ ABAIXO DO CUSTO.                                          */}
      {/* ------------------------------------------------------------------ */}
      <div style={painel.card}>
        <div style={painel.rotulo}>
          Contratos abaixo do custo cheio
          {abaixo.length > 0 && <b style={{ color: "rgb(var(--zm-perigo))" }}> · {abaixo.length}</b>}
        </div>
        {abaixo.length === 0 ? (
          <p style={{ fontSize: 14, color: cor.cinza, margin: 0 }}>
            Nenhum contrato está abaixo do custo cheio com os números de agora.
          </p>
        ) : (<>
          <p style={{ fontSize: 14, color: cor.cinza, margin: "0 0 10px", lineHeight: 1.5 }}>
            Cada um destes recebe mais trabalho do que paga, medido pelo custo cheio. Quase sempre é
            periodicidade: quem lava toda semana consome {" "}
            <b>4,3 lavagens por mês</b> e costuma pagar quase o mesmo de quem lava a cada quinze
            dias — que consome 2.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: cor.cinza }}>
                  <th style={{ padding: "6px 8px 6px 0" }}>Família</th>
                  <th style={{ padding: "6px 8px" }}>Cada</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Por mês</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Por lavagem</th>
                  <th style={{ padding: "6px 0 6px 8px", textAlign: "right" }}>Falta</th>
                </tr>
              </thead>
              <tbody>
                {abaixo.map((l) => (
                  <tr key={l.id} style={{ borderTop: `1px solid ${cor.linha}` }}>
                    <td style={{ padding: "8px 8px 8px 0" }}>
                      {l.familia || "(sem família)"}
                      {l.codigo && <span style={{ color: cor.cinza }}> · {l.codigo}</span>}
                    </td>
                    <td style={{ padding: "8px", color: cor.cinza }}>{l.periodicidade || "—"}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {brl(l.valorMensal)}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {brl(l.porLavagem)}
                    </td>
                    <td style={{ padding: "8px 0 8px 8px", textAlign: "right",
                                 fontVariantNumeric: "tabular-nums", color: "rgb(var(--zm-perigo))" }}>
                      {brl(l.sobraMes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 13.5, color: cor.cinza, marginTop: 10, lineHeight: 1.5 }}>
            Isto <b>não quer dizer que dão prejuízo hoje</b>: com a agenda em{" "}
            {d.utilizacao === null ? "—" : `${d.utilizacao}%`}, o custo de mais uma lavagem é{" "}
            {brl(d.custoDeMaisUm)} e todos eles ainda somam. Quer dizer que{" "}
            <b>eles são os primeiros a rever quando a agenda encher</b> — e que, se todos os
            contratos fossem assim, a conta não fecharia.
          </p>
        </>)}

        {semConta.length > 0 && (
          <p style={{ fontSize: 13.5, color: "rgb(var(--zm-aviso))", marginTop: 10, lineHeight: 1.5 }}>
            {semConta.length} {semConta.length === 1 ? "contrato ficou" : "contratos ficaram"} sem
            conta por falta de periodicidade ou valor: {" "}
            {semConta.slice(0, 6).map((l) => l.familia || l.codigo || "?").join(", ")}
            {semConta.length > 6 ? ` e mais ${semConta.length - 6}` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
