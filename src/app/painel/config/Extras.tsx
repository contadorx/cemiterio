"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";

/**
 * O CATÁLOGO DE FLORES E EXTRAS — a lista de preços da casa.
 *
 * Mora em Configurações, e não na ficha da família, porque é preço da CASA:
 * vale para todo mundo, muda quando o fornecedor muda, e não é assunto de uma
 * família em particular. Na ficha se escolhe o item; aqui se define o item.
 *
 * O CUSTO É METADE DO ASSUNTO. Sem ele a previsão de compra do sábado não
 * existe e a pergunta "esse serviço paga?" não tem resposta — foi por isso que
 * o Leandro pediu o serviço de flores com custo desde o primeiro dia.
 *
 * MUDAR O PREÇO AQUI NÃO MEXE EM COMBINADO JÁ FEITO. O combinado congela preço
 * e custo no dia em que nasce (0117), para um reajuste do buquê não reescrever
 * o que foi acertado com quem assinou ano passado. A tela diz isso onde a
 * pessoa está prestes a se enganar, e mostra quantos combinados usam cada item.
 */

const brl = (n: any) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CATEGORIAS = ["flores", "memoria", "limpeza", "reparo", "outro"] as const;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun",
               "jul", "ago", "set", "out", "nov", "dez"];

const VAZIO = {
  id: "", nome: "", categoria: "flores", preco: "", custo: "",
  unidade: "un", descricao: "", sazonal: false, meses: [] as number[], ativo: true,
};

export default function Extras() {
  const [lista, setLista] = useState<any[] | null>(null);
  const [f, setF] = useState<typeof VAZIO>({ ...VAZIO });
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/extras?todos=1").then((x) => x.json()).catch(() => null);
    if (r?.ok) setLista(r.extras || []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function editar(e: any) {
    setF({
      id: e.id, nome: e.nome, categoria: e.categoria || "outro",
      preco: String(e.preco ?? ""), custo: String(e.custo ?? ""),
      unidade: e.unidade || "un", descricao: e.descricao || "",
      sazonal: !!e.sazonal, meses: e.meses || [], ativo: e.ativo !== false,
    });
    setEditando(true); setErro(""); setAviso("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar() {
    setOcupado(true); setErro(""); setAviso("");
    try {
      const r = await fetch("/api/extras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, meses: f.sazonal ? f.meses : [] }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não deu para salvar"); return; }
      setF({ ...VAZIO }); setEditando(false);
      carregar();
    } finally { setOcupado(false); }
  }

  async function apagar(e: any) {
    const quantos = Number(e.combinados) || 0;
    const frase = quantos > 0
      ? `${e.nome} está em ${quantos} combinado(s). Vou desligar em vez de apagar — some de quem escolhe e o histórico fica. Continuar?`
      : `Apagar ${e.nome} do catálogo?`;
    if (!confirm(frase)) return;
    const r = await fetch(`/api/extras?id=${e.id}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.mensagem) setAviso(r.mensagem);
    carregar();
  }

  const margem = (Number(String(f.preco).replace(",", ".")) || 0)
               - (Number(String(f.custo).replace(",", ".")) || 0);

  return (
    <>
      {/* ------------------------------------------------ o formulário */}
      <div style={painel.card}>
        <p style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
          {editando ? `Alterando: ${f.nome || "item"}` : "Novo item"}
        </p>

        <div style={{ display: "grid", gap: 12,
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label>
            <span style={painel.rotulo}>Nome</span>
            <input style={painel.input} value={f.nome} placeholder="Flores frescas"
                   onChange={(e) => setF({ ...f, nome: e.target.value })} />
          </label>

          <label>
            <span style={painel.rotulo}>Categoria</span>
            <select style={painel.input} value={f.categoria}
                    onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label>
            <span style={painel.rotulo}>Unidade</span>
            <input style={painel.input} value={f.unidade} placeholder="buquê, arranjo, un"
                   onChange={(e) => setF({ ...f, unidade: e.target.value })} />
          </label>

          <label>
            <span style={painel.rotulo}>Preço (o que a família paga)</span>
            <input style={painel.input} inputMode="decimal" value={f.preco} placeholder="35,00"
                   onChange={(e) => setF({ ...f, preco: e.target.value })} />
          </label>

          {/* O CUSTO NÃO É OPCIONAL NA PRÁTICA. Sem ele a previsão de compra
              do sábado mostra R$ 0,00 e a margem do serviço vira a receita
              inteira — o mesmo erro que a auditoria do painel achou. */}
          <label>
            <span style={painel.rotulo}>Custo (o que você paga)</span>
            <input style={painel.input} inputMode="decimal" value={f.custo} placeholder="18,00"
                   onChange={(e) => setF({ ...f, custo: e.target.value })} />
          </label>

          <label>
            <span style={painel.rotulo}>Observação</span>
            <input style={painel.input} value={f.descricao} placeholder="opcional"
                   onChange={(e) => setF({ ...f, descricao: e.target.value })} />
          </label>
        </div>

        {(Number(String(f.preco).replace(",", ".")) > 0 || Number(String(f.custo).replace(",", ".")) > 0) && (
          <p style={{ margin: "10px 0 0", fontSize: 14,
                      color: margem > 0 ? cor.teal : cor.perigo }}>
            Sobram <b>{brl(margem)}</b> por {f.unidade || "unidade"}
            {margem <= 0 && " — o preço não cobre o custo."}
          </p>
        )}
        {!Number(String(f.custo).replace(",", ".")) && (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: cor.cinza }}>
            Sem o custo preenchido, a previsão de compra do sábado mostra R$ 0,00
            e a sobra do serviço aparece como se fosse tudo lucro.
          </p>
        )}

        {/* ---------------------------------------------- sazonal */}
        <label style={{ display: "flex", alignItems: "center", gap: 8,
                        marginTop: 12, fontSize: 14.5 }}>
          <input type="checkbox" checked={f.sazonal}
                 onChange={(e) => setF({ ...f, sazonal: e.target.checked })} />
          Só em certos meses (Finados, Dia das Mães…)
        </label>

        {f.sazonal && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {MESES.map((m, i) => {
              const n = i + 1;
              const on = f.meses.includes(n);
              return (
                <button key={m}
                        style={on ? painel.botaoMini : painel.botaoMiniSec}
                        onClick={() => setF({ ...f,
                          meses: on ? f.meses.filter((x) => x !== n) : [...f.meses, n] })}>
                  {m}
                </button>
              );
            })}
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8,
                        marginTop: 10, fontSize: 14.5 }}>
          <input type="checkbox" checked={f.ativo}
                 onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
          Disponível para escolher no jazigo
        </label>

        {erro && <p style={{ margin: "10px 0 0", fontSize: 14, color: cor.perigo }}>{erro}</p>}

        {editando && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: cor.cinza, lineHeight: 1.6 }}>
            Mudar o preço aqui <b>não altera combinado já feito</b>. Cada combinado
            guarda o preço e o custo do dia em que nasceu, para um reajuste não
            reescrever o que foi acertado com quem assinou antes. O preço novo vale
            para os próximos.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button style={painel.botao} onClick={salvar}
                  disabled={ocupado || !f.nome.trim()}>
            {ocupado ? "Salvando…" : editando ? "Salvar alteração" : "Acrescentar ao catálogo"}
          </button>
          {editando && (
            <button style={painel.botaoSec}
                    onClick={() => { setF({ ...VAZIO }); setEditando(false); setErro(""); }}>
              Cancelar
            </button>
          )}
        </div>
      </div>

      {aviso && (
        <div style={{ ...painel.card, background: "#fff7ed", border: "1px solid #fdba74" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#7c2d12" }}>{aviso}</p>
        </div>
      )}

      {/* ------------------------------------------------ a lista */}
      <div style={painel.card}>
        <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>O catálogo</p>
        <p style={{ margin: "0 0 12px", fontSize: 13.5, color: cor.cinza }}>
          É desta lista que sai o que se combina no jazigo, na ficha da família.
        </p>

        {lista === null && <p style={{ margin: 0, color: cor.cinza }}>Carregando…</p>}
        {lista?.length === 0 && (
          <p style={{ margin: 0, color: cor.cinza, fontSize: 14 }}>
            Catálogo vazio. Acrescente o primeiro item acima.
          </p>
        )}

        {(lista || []).map((e: any, i: number) => (
          <div key={e.id}
               style={{ display: "flex", flexWrap: "wrap", gap: 12,
                        justifyContent: "space-between", padding: "10px 0",
                        opacity: e.ativo ? 1 : 0.55,
                        borderTop: i ? `1px solid ${cor.linha}` : "none" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 15.5 }}>
                <b>{e.nome}</b>
                <span style={{ color: cor.cinza }}> · {e.unidade}</span>
                {!e.ativo && <span style={{ color: cor.cinza }}> · desligado</span>}
                {e.sazonal && (
                  <span style={{ color: cor.cinza }}>
                    {" · "}só em {(e.meses || []).map((m: number) => MESES[m - 1]).join(", ")}
                    {!e.naEpoca && " (fora de época)"}
                  </span>
                )}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: cor.cinza }}>
                {e.categoria}
                {e.combinados > 0 && ` · em ${e.combinados} combinado(s)`}
                {e.descricao && ` · ${e.descricao}`}
              </p>
            </div>

            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 15 }}>
                <b>{brl(e.preco)}</b>
                <span style={{ color: cor.cinza }}> − {brl(e.custo)} de custo</span>
              </p>
              <p style={{ margin: "2px 0 6px", fontSize: 13,
                          color: Number(e.margem) > 0 ? cor.teal : cor.perigo }}>
                sobram {brl(e.margem)}
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={painel.botaoMiniSec} onClick={() => editar(e)}>Alterar</button>
                <button style={painel.botaoMiniSec} onClick={() => apagar(e)}>
                  {e.combinados > 0 ? "Desligar" : "Apagar"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
