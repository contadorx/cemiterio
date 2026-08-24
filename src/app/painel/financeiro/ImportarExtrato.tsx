"use client";

import { useRef, useState } from "react";
import { painel, cor } from "../ui";

/**
 * O EXTRATO INTEIRO, DE UMA VEZ.
 *
 * POR QUE ISTO PRECISOU EXISTIR
 *
 * A tabela `entradas_banco` existe desde a migração 0045. A API existe. A tela
 * ao lado existe. O palpiteiro existe. E ela tinha ZERO LINHAS — porque só
 * dava para lançar uma a uma, na mão, e em agosto de 2026 entraram 112 Pix.
 * Ninguém digita 112 linhas todo mês. O zero não era desinteresse: era a
 * ausência desta tela.
 *
 * O SALDO É O JUIZ
 *
 * Todo extrato traz o saldo depois de cada movimento. Isso deixa a leitura se
 * PROVAR: se a soma anda junto com o saldo em todas as linhas, nada foi
 * perdido nem inventado. Se não anda, o botão de importar não aparece e a tela
 * diz em que linha quebrou.
 *
 * É essa prova que torna honesto ler PDF com IA. Sem ela, seria um chute caro.
 *
 * O QUE É PESSOAL FICA DE FORA
 *
 * A conta é da Sureya: tem supermercado e cartão no meio das despesas do
 * negócio. Toda saída nasce SEM classificação — e sem classificação ela não
 * entra em resultado nenhum. Marcar é dela, aqui, olhando.
 */

interface Linha {
  data: string;
  tipo: "credito" | "debito";
  valor: number;
  historico: string;
  remetente: string | null;
  documento: string | null;
  saldoApos: number | null;
}

const brl = (n: number) =>
  `R$ ${Number(n || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const dia = (iso: string) => String(iso).slice(0, 10).split("-").reverse().join("/");

export default function ImportarExtrato({ aoImportar }: { aoImportar: () => void }) {
  const arquivo = useRef<HTMLInputElement | null>(null);
  const [nome, setNome] = useState("");
  const [lendo, setLendo] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const [feito, setFeito] = useState<any>(null);
  const [pessoais, setPessoais] = useState<Set<number>>(new Set());

  async function escolher(e: any) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErro(""); setRes(null); setFeito(null); setPessoais(new Set());
    setNome(f.name); setLendo(true);

    const b64: string = await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result || ""));
      r.readAsDataURL(f);
    });

    try {
      const r = await fetch("/api/financeiro/extrato/ler", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivoBase64: b64, nome: f.name }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui ler este arquivo."); return; }
      setRes(r);
    } catch {
      setErro("Não consegui ler este arquivo.");
    } finally {
      setLendo(false);
    }
  }

  async function importar() {
    if (!res?.linhas?.length) return;
    setGravando(true); setErro("");
    try {
      const r = await fetch("/api/financeiro/extrato/importar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // A MARCAÇÃO VAI COLADA NA LINHA. A importação devolve contagem, não
          // os ids do que entrou — mandar a natureza depois exigiria adivinhar
          // quais linhas eram quais, e é assim que uma marcação some.
          linhas: (res.linhas as Linha[]).map((l, i) => ({
            ...l, natureza: pessoais.has(i) ? "pessoal" : null,
          })),
          nome, formato: res.formato, saldoInicial: res.saldoInicial ?? null,
        }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "Não consegui importar."); return; }
      setFeito(r);
      aoImportar();
    } finally {
      setGravando(false);
    }
  }

  const c = res?.conferencia;
  const debitos: { l: Linha; i: number }[] =
    (res?.linhas || []).map((l: Linha, i: number) => ({ l, i })).filter((x: any) => x.l.tipo === "debito");

  return (
    <section style={painel.card}>
      <strong style={{ color: cor.navy, fontSize: 17 }}>Importar o extrato do banco</strong>
      <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 0", lineHeight: 1.6 }}>
        Baixe o extrato no aplicativo do banco e traga o arquivo. <b>OFX é o melhor</b> — é o
        formato feito para isto. CSV, XLSX e PDF também servem.
      </p>

      <input ref={arquivo} type="file" className="hidden" style={{ display: "none" }}
             accept=".ofx,.csv,.txt,.xls,.xlsx,.pdf,application/pdf,text/csv"
             onChange={escolher} />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button style={painel.botao} onClick={() => arquivo.current?.click()} disabled={lendo}>
          {lendo ? "Lendo…" : "Escolher o arquivo"}
        </button>
        {nome && <span style={{ color: cor.cinza, fontSize: 14 }}>{nome}</span>}
      </div>

      {erro && <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 15, marginTop: 10 }}>{erro}</p>}

      {/* ------------------------------------------------------ o veredito */}
      {c && !feito && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${cor.linha}`, paddingTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
            <Numero titulo="Movimentos" valor={String(c.linhas)} />
            <Numero titulo="Entrou" valor={brl(c.somaCreditos)} tom={cor.teal} />
            <Numero titulo="Saiu" valor={brl(c.somaDebitos)} />
            <Numero titulo="Saldo no fim"
                    valor={c.saldoFinal == null ? "—" : brl(c.saldoFinal)} />
          </div>

          {/* A PROVA, EM UMA FRASE. `fecha` tem TRÊS estados e cada um diz uma
              coisa diferente: passou, reprovou, ou não deu para provar. Tratar
              "não deu para provar" como "passou" seria apresentar ausência de
              medida como medida — o erro que a 0120 já custou caro. */}
          {c.fecha === true && (
            <p style={{ color: "rgb(var(--zm-positivo))", fontSize: 15, marginTop: 12, lineHeight: 1.6 }}>
              <b>A conta fecha.</b> Refiz o saldo movimento a movimento, do começo ao fim,
              e bate ao centavo com o que o banco imprimiu. Não falta nem sobra linha.
            </p>
          )}
          {c.fecha === false && (
            <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 15, marginTop: 12, lineHeight: 1.6 }}>
              <b>A conta não fecha.</b> {c.problema}
              <br />Não dá para importar assim — baixe o extrato em OFX, que é o formato do banco.
            </p>
          )}
          {c.fecha == null && (
            <p style={{ color: "rgb(var(--zm-aviso))", fontSize: 15, marginTop: 12, lineHeight: 1.6 }}>
              <b>Não deu para conferir.</b> Este arquivo não traz o saldo linha a linha, então
              não tenho como provar que veio tudo. Confira o total acima com o do banco antes
              de importar.
            </p>
          )}

          {res.porIa && (
            <p style={{ color: cor.cinza, fontSize: 14, marginTop: 8 }}>
              O PDF foi lido pela IA — por isso a conferência acima importa tanto.
            </p>
          )}

          {/* -------------------------------------------- as saídas pessoais */}
          {debitos.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <strong style={{ color: cor.navy, fontSize: 15 }}>
                {debitos.length} {debitos.length === 1 ? "saída" : "saídas"} — marque o que é seu
              </strong>
              <p style={{ color: cor.cinza, fontSize: 14, margin: "4px 0 8px", lineHeight: 1.6 }}>
                A conta é sua, e tem gasto pessoal no meio. O que você marcar aqui entra
                como <b>pessoal</b> e fica fora do resultado do negócio. O que não for
                marcado entra <b>sem classificação</b> — e sem classificação também não
                entra em resultado nenhum, até você decidir.
              </p>
              <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${cor.linha}`,
                            borderRadius: 10, padding: 8 }}>
                {debitos.map(({ l, i }) => (
                  <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start",
                                          padding: "6px 4px", fontSize: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={pessoais.has(i)} style={{ marginTop: 3 }}
                           onChange={(ev) => {
                             const n = new Set(pessoais);
                             if (ev.target.checked) n.add(i); else n.delete(i);
                             setPessoais(n);
                           }} />
                    <span style={{ flex: 1, color: cor.navy }}>
                      <b>{dia(l.data)}</b> · {brl(l.valor)}
                      <span style={{ color: cor.cinza }}> · {l.historico || "sem descrição"}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button style={painel.botaoSec}
                        onClick={() => setPessoais(new Set(debitos.map((x) => x.i)))}>
                  marcar todas
                </button>
                <button style={painel.botaoSec} onClick={() => setPessoais(new Set())}>
                  desmarcar todas
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button style={painel.botao} onClick={importar}
                    disabled={gravando || !res.podeImportar}>
              {gravando ? "Importando…" : `Importar ${c.linhas} movimentos`}
            </button>
            {!res.podeImportar && (
              <span style={{ color: cor.cinza, fontSize: 14, marginLeft: 10 }}>
                a conferência reprovou
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- o feito */}
      {feito && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${cor.linha}`, paddingTop: 14 }}>
          <p style={{ color: "rgb(var(--zm-positivo))", fontSize: 16, margin: 0, lineHeight: 1.6 }}>
            <b>{feito.novas} {feito.novas === 1 ? "movimento entrou" : "movimentos entraram"}</b>
            {feito.repetidas > 0 && (
              <> · {feito.repetidas} já {feito.repetidas === 1 ? "estava" : "estavam"} aqui e não {feito.repetidas === 1 ? "entrou" : "entraram"} de novo</>
            )}
          </p>
          <p style={{ color: cor.cinza, fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
            As entradas aparecem logo abaixo, esperando dono. Nenhuma virou crédito de família
            sozinha — isso continua sendo você quem diz.
          </p>
        </div>
      )}
    </section>
  );
}

function Numero({ titulo, valor, tom }: { titulo: string; valor: string; tom?: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: cor.cinza }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tom || cor.navy }}>{valor}</div>
    </div>
  );
}
