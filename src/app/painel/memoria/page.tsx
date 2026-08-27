"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";
import { useConfirmar } from "@/components/Dialogos";

/**
 * AS DATAS QUE VÊM.
 *
 * Esta tela existe porque o motor da 0096 decidia em silêncio. Ele já sabia
 * o calendário dos próximos treze meses e já sabia por que segurou cada
 * mensagem — e nada disso tinha para onde aparecer.
 *
 * A ordem dos blocos é a ordem das perguntas de quem abre:
 *
 *   1. está ligado?          (a chave da casa, desligada de fábrica)
 *   2. quem ainda não tem data?   (o trabalho de cadastro que destrava tudo)
 *   3. o que vem?            (o calendário)
 *   4. o que foi segurado, e por quê?
 *
 * O bloco 2 vem antes do 3 de propósito. Medido em 23/08: os 65 falecidos
 * migraram do texto do jazigo e chegaram SEM NENHUMA DATA. Um calendário
 * vazio, sozinho, parece defeito; ao lado da lista de quem falta, ele vira
 * uma fila de trabalho.
 *
 * E o bloco 4 é o que responde "por que a família X não recebeu nada?" sem
 * ninguém ter de reconstituir a regra de luto de cabeça.
 */

const dia = (iso: string | null) =>
  !iso ? "—" : String(iso).slice(0, 10).split("-").reverse().join("/");

const ROTULO_TIPO: Record<string, string> = {
  falecimento: "aniversário de falecimento",
  marco_1ano: "um ano",
  nascimento: "aniversário de nascimento",
  finados: "Finados",
  religiosa: "data religiosa",
};

export default function Memoria() {
  const perguntar = useConfirmar();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    const r = await fetch("/api/memoria").then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setErro(r?.erro || "não deu para carregar"); return; }
    setD(r);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function alternar() {
    if (!d) return;
    const novo = !d.ligado;
    if (novo && !await perguntar({
      oQue: "Ligar os lembretes de memória?",
      efeito: "Nada é enviado sozinho: tudo passa pela fila de liberação, e alguém lê antes "
            + "de a família ler. Os limites de luto e de frequência valem sempre.",
      confirmar: "Ligar",
    })) return;
    setOcupado(true);
    const r = await fetch("/api/memoria", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ligado: novo }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) carregar(); else setErro("Não consegui salvar.");
  }

  if (erro) return (
    <div style={painel.card}>
      <p style={{ color: cor.perigo }}>Não deu para carregar: {erro}</p>
      <button style={painel.botaoMiniSec} onClick={carregar}>Tentar de novo</button>
    </div>
  );
  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;

  const previstos = (d.eventos || []).filter((e: any) => e.status === "previsto");
  const segurados = (d.eventos || []).filter((e: any) => e.status === "suprimido");
  const enfileirados = (d.eventos || []).filter((e: any) => e.status === "enfileirado");

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "rgb(var(--zm-ink))", margin: "0 0 2px" }}>
        Datas de memória
      </h1>
      <p style={{ color: cor.cinza, fontSize: 15, margin: "0 0 14px" }}>
        As datas dos próximos doze meses, e o que a casa decidiu sobre cada uma.
      </p>

      {/* 1 · A CHAVE */}
      <div style={{ ...painel.card,
                    background: d.ligado ? "#ecfdf5" : "#f8fafc",
                    border: `1px solid ${d.ligado ? "#a7f3d0" : cor.linha}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ color: cor.navy }}>
            {d.ligado ? "Os lembretes estão ligados" : "Os lembretes estão desligados"}
          </strong>
          <button style={painel.botaoMiniSec} disabled={ocupado} onClick={alternar}>
            {d.ligado ? "Desligar" : "Ligar"}
          </button>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
          Mesmo ligados, <b>nada sai sozinho</b>: cada mensagem entra na fila de liberação e
          alguém lê antes da família. Os limites de luto e de frequência não têm chave —
          valem sempre.
        </p>
      </div>

      {/* 2 · QUEM AINDA NÃO TEM DATA */}
      {(d.semData || []).length > 0 && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>
            Sem data no dia certo — {d.semData.length} de {d.totalFalecidos}
          </strong>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
            Estas pessoas <b>não geram lembrete nenhum</b>. Os nomes vieram do cadastro antigo
            do jazigo, que guardava só o nome — as datas nunca existiram. Abra o jazigo e
            preencha o que a família souber; quem sabe só o mês ou só o ano, marque assim, e
            nada sai numa data inventada.
          </p>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {d.semData.slice(0, 40).map((f: any) => (
              <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "baseline",
                                       flexWrap: "wrap", fontSize: 14.5 }}>
                <Link href={`/painel/jazigos/${f.tumulo_id}`} style={{ color: cor.navy, fontWeight: 600 }}>
                  {f.nome}
                </Link>
                <span style={{ color: cor.cinza }}>
                  {f.tumulos?.identificacao ? `· ${f.tumulos.identificacao}` : ""}
                </span>
              </div>
            ))}
            {d.semData.length > 40 && (
              <p style={{ fontSize: 13.5, color: cor.cinza, margin: "4px 0 0" }}>
                …e mais {d.semData.length - 40}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 3 · O QUE VEM */}
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Próximas datas</strong>
        {previstos.length === 0 && enfileirados.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 15, color: cor.cinza, lineHeight: 1.5 }}>
            Nenhuma data nos próximos doze meses.
            {(d.semData || []).length > 0
              ? " Enquanto ninguém tiver data no dia certo, o calendário fica vazio — é o bloco acima que o enche."
              : ""}
          </p>
        ) : (
          [...enfileirados, ...previstos].map((e: any) => (
            <div key={e.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.linha}` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{dia(e.data_evento)}</span>
                <span style={{ fontSize: 14.5 }}>{e.falecidos?.nome || "—"}</span>
                <span style={{ color: cor.cinza, fontSize: 14 }}>
                  {ROTULO_TIPO[e.tipo] || e.tipo}
                </span>
                {e.status === "enfileirado" && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1e40af",
                                 background: "#eff6ff", border: "1px solid #bfdbfe",
                                 borderRadius: 999, padding: "1px 8px" }}>
                    já está na fila
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13.5, color: cor.cinza, marginTop: 2 }}>
                {e.familias?.nome ? `${e.familias.nome} · ` : ""}
                {e.tumulos?.identificacao ? `${e.tumulos.identificacao} · ` : ""}
                entra na fila em <b>{dia(e.data_disparo)}</b>
                {e.tem_oferta ? " · com oferta de serviço" : " · sem oferta"}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 4 · O QUE FOI SEGURADO */}
      {segurados.length > 0 && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Seguradas — e por quê</strong>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
            Estas datas existiram e a casa decidiu <b>não</b> mandar. O motivo fica aqui para
            que a pergunta “por que fulano não recebeu?” tenha resposta sem ninguém
            reconstituir a regra de cabeça.
          </p>
          {segurados.map((e: any) => (
            <div key={e.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.linha}` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{dia(e.data_evento)}</span>
                <span style={{ fontSize: 14.5 }}>{e.falecidos?.nome || "—"}</span>
                <span style={{ color: cor.cinza, fontSize: 14 }}>{ROTULO_TIPO[e.tipo] || e.tipo}</span>
              </div>
              <div style={{ fontSize: 13.5, marginTop: 2, color: "#b45309" }}>
                {e.motivo_supressao || "sem motivo registrado"}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
