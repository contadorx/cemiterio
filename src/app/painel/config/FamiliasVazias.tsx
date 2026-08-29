"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";
import { useConfirmar, useRecado } from "@/components/Dialogos";

/**
 * FAMÍLIAS SEM JAZIGO — a faxina depois da fusão (0147).
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VIERAM
 * ---------------------------------------------------------------------------
 * Medido em 29/08, com os 11 duplicados já juntados: 122 famílias sem jazigo
 * nenhum. E 103 das pessoas dentro delas nasceram no MESMO DIA, 19/08 — a
 * importação da planilha. São contatos que nunca foram vinculados a um túmulo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO É UM `DELETE` E PRONTO
 * ---------------------------------------------------------------------------
 * `conta_corrente.familia_id` é ON DELETE CASCADE — apagar leva o razão junto.
 * `mensagens.cliente_id` também — apagar leva a conversa junto. E
 * `clientes.familia_id` é SET NULL: apagar só a família deixaria a pessoa
 * órfã, e `sureya_lancar` recusa órfão, então todo pagamento dela falharia.
 *
 * Então: a pessoa vai JUNTO com a família, e quem tem histórico o banco
 * RECUSA — nomeando quem e por quê.
 */

type Fam = {
  familia_id: string; familia: string; pessoas: number; nomes: string | null;
  lancamentos: number; comprovantes: number; mensagens: number; conversas: number;
  pode_apagar: boolean; porque: string;
};

export default function FamiliasVazias() {
  const perguntar = useConfirmar();
  const recado = useRecado();
  const [lista, setLista] = useState<Fam[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/familias-vazias").then((x) => x.json()).catch(() => null);
    setLista(r?.ok ? (r.familias as Fam[]) : null);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function apagar(alvos: Fam[]) {
    if (!alvos.length) return;
    const pessoas = alvos.reduce((t, f) => t + f.pessoas, 0);
    const ok = await perguntar({
      oQue: alvos.length === 1
        ? `Apagar a família "${alvos[0].familia}"?`
        : `Apagar ${alvos.length} famílias sem jazigo?`,
      efeito: `Some ${alvos.length === 1 ? "ela" : "elas"} e ${pessoas === 1 ? "a pessoa" : `as ${pessoas} pessoas`} `
            + "de dentro. Não dá para desfazer. Quem tiver mensagem, comprovante ou "
            + "lançamento o banco recusa — essas continuam aqui.",
      confirmar: "Apagar", tom: "perigo",
    });
    if (!ok) return;

    setOcupado(true);
    try {
      const r = await fetch("/api/familias-vazias", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familias: alvos.map((f) => f.familia_id) }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { recado.erro(r?.erro || "Não consegui agora."); return; }
      const n = Number(r.apagadas) || 0;
      const rec = (r.recusadas || []).length;
      recado.ok(`${n} ${n === 1 ? "família apagada" : "famílias apagadas"}`
                + (rec ? ` · ${rec} recusada${rec > 1 ? "s" : ""} pelo banco` : ""));
      await carregar();
    } finally { setOcupado(false); }
  }

  if (lista === null) return <p style={{ color: cor.cinza }}>Procurando famílias sem jazigo…</p>;

  if (lista.length === 0) {
    return (
      <div style={painel.card}>
        <div style={painel.rotulo}>Famílias sem jazigo</div>
        <p style={{ fontSize: 14, color: cor.cinza, margin: 0 }}>
          Toda família cadastrada tem pelo menos um jazigo vinculado.
        </p>
      </div>
    );
  }

  const podem = lista.filter((f) => f.pode_apagar);
  const seguram = lista.filter((f) => !f.pode_apagar);

  return (
    <div>
      <div style={painel.card}>
        <div style={painel.rotulo}>Famílias sem jazigo · <b>{lista.length}</b></div>
        <p style={{ fontSize: 14, color: cor.cinza, margin: "0 0 12px", lineHeight: 1.55 }}>
          Famílias cadastradas sem nenhum jazigo vinculado. A pessoa de dentro sai junto —
          deixá-la sozinha a tornaria <b>órfã</b>, e o sistema recusa lançar pagamento de
          quem não tem família.
        </p>
        <button style={painel.botaoPerigo} disabled={ocupado || podem.length === 0}
                onClick={() => apagar(podem)}>
          {ocupado ? "…" : `Apagar as ${podem.length} que não têm histórico`}
        </button>
      </div>

      {seguram.length > 0 && (
        <div style={{ ...painel.card, borderColor: "rgb(var(--zm-aviso) / 0.45)",
                      background: "rgb(var(--zm-aviso) / 0.09)" }}>
          <div style={painel.rotulo}>
            <b>{seguram.length}</b> {seguram.length === 1 ? "fica" : "ficam"} — {seguram.length === 1 ? "tem" : "têm"} histórico
          </div>
          <p style={{ fontSize: 14, color: cor.cinza, margin: "0 0 10px", lineHeight: 1.5 }}>
            Estas famílias escreveram ou movimentaram dinheiro. Apagar levaria a conversa
            junto, calada. Vincule um jazigo a elas, ou junte com o cadastro certo.
          </p>
          {seguram.map((f) => (
            <div key={f.familia_id} style={{
              padding: "8px 0", borderTop: `1px solid ${cor.linha}`, fontSize: 14,
            }}>
              <b>{f.familia}</b>
              {f.nomes && <span style={{ color: cor.cinza }}> · {f.nomes}</span>}
              <div style={{ fontSize: 13, color: "rgb(var(--zm-aviso))" }}>{f.porque}</div>
            </div>
          ))}
        </div>
      )}

      <div style={painel.card}>
        <div style={painel.rotulo}>As {podem.length} que podem sair</div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {podem.map((f) => (
            <div key={f.familia_id} style={{
              padding: "7px 0", borderTop: `1px solid ${cor.linha}`, fontSize: 14,
            }}>
              <b>{f.familia}</b>
              {f.nomes && <span style={{ color: cor.cinza }}> · {f.nomes}</span>}
              <span style={{ color: cor.cinza, fontSize: 13 }}> — {f.porque}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
