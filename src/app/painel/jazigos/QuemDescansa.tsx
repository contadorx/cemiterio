"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";
import { useConfirmar } from "@/components/Dialogos";

/**
 * A BANCADA DE TRANSCRIÇÃO — o componente, não a tela.
 *
 * POR QUE ELE SAIU DA FICHA DO JAZIGO E VIROU ARQUIVO PRÓPRIO
 *
 * Ele nasceu dentro de `jazigos/[id]/page.tsx` e agora é montado em dois
 * lugares: no CADASTRO DO TÚMULO, que é onde o registro mora, e na BANCADA,
 * que é o mesmo trabalho numa fila. Copiar o formulário para a segunda tela
 * criaria duas implementações da mesma regra — e é assim que, três meses
 * depois, um lugar aceita "só o ano" e o outro não.
 *
 * O QUE SE MEDIU EM 28/08, E QUE MUDA O QUE ESTA TELA É
 *
 *   266 jazigos · 62 com alguém cadastrado · 0 com mais de uma pessoa
 *   62 de 62 sem nenhuma data
 *
 * E os 62 nomes vieram do campo de texto antigo `tumulos.falecido_nome`, que
 * era UM campo. Olhando o conteúdo — Nakandakari, Ogasawara, Mantovanelli,
 * "Família grave", "Filha do Sr joão" — não é o nome de quem está enterrado:
 * é o que está escrito na LÁPIDE, quase sempre o sobrenome da família, às
 * vezes uma anotação para reconhecer o jazigo.
 *
 * Então não há 62 pessoas cadastradas. Há 62 etiquetas e 204 jazigos vazios.
 *
 * A FONTE ESTÁ FOTOGRAFADA: 266 de 266 jazigos têm foto da lápide (o próprio
 * código já a chama de `fotoLapide`). Os nomes e as datas estão gravados na
 * pedra, e a pedra está no Storage. Por isso a foto vem JUNTO do formulário:
 * transcrever com o documento noutra aba é como se erra um nome.
 */

/**
 * QUEM DESCANSA NESTE JAZIGO.
 *
 * Este cartão é o que destrava o produto de memória inteiro. Medido em 23/08:
 * os 65 falecidos que a 0095 migrou vieram do texto `tumulos.falecido_nome`,
 * e por isso chegaram **sem nenhuma data** — zero nascimentos, zero
 * falecimentos. O motor da 0096 está certo e faminto: sem data ele não gera
 * um evento sequer, e não havia tela em lugar nenhum para digitar uma.
 *
 * As datas pedem ANO, não só dia e mês. Não é preciosismo:
 *   · "completam-se 7 anos" precisa da conta
 *   · o marco de 1 ano não existe sem ela
 *   · e o luto recente — a zona de silêncio — é a diferença entre uma
 *     lembrança e uma ofensa
 *
 * E cada data anda com a PRECISÃO ao lado. Quem sabe só o ano marca "só o
 * ano", e o motor não dispara: um "faleceu em 1998" sem mês viraria um
 * lembrete em 1º de janeiro, uma data que o sistema inventou.
 */
export default function QuemDescansa({ tumuloId, aoMudar, fotoLapide }: {
  tumuloId: string;
  aoMudar?: () => void;
  /**
   * A FOTO DA LÁPIDE — o documento de onde se transcreve.
   *
   * Opcional porque quem monta pode já estar mostrando a foto por conta
   * própria; quando vem, ela fica GRUDADA no formulário. Transcrever um nome
   * com o documento noutra aba é como se troca "Nakandakari" por
   * "Nakandakura" e ninguém descobre nunca.
   */
  fotoLapide?: string | null;
}) {
  const perguntar = useConfirmar();
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<any>({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/falecidos?tumuloId=${tumuloId}`)
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) setLista(r.falecidos); else setLista([]);
  }, [tumuloId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(metodo: "POST" | "PATCH", corpo: any) {
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/falecidos", {
        method: metodo, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui salvar."); return false; }
      setEditando(null); setAbrindo(false); setRascunho({});
      await carregar();
      // A BANCADA PRECISA SABER. Sem este aviso o contador dela ("faltam 204")
      // só andaria ao trocar de jazigo — e quem acabou de digitar três pessoas
      // veria o mesmo número, sem sinal de que o trabalho contou.
      aoMudar?.();
      return true;
    } finally { setSalvando(false); }
  }

  async function remover(p: any) {
    if (!await perguntar({
      oQue: `Tirar ${p.nome} deste jazigo?`,
      efeito: "A pessoa continua cadastrada — sai só o vínculo com este jazigo.",
      confirmar: "Tirar", tom: "perigo",
    })) return;
    const r = await fetch(`/api/falecidos?id=${p.id}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setErro(r?.mensagem || "Não consegui tirar."); return; }
    carregar();
    aoMudar?.();
  }

  if (lista === null) return null;

  return (
    <div style={painel.card}>
      <strong style={{ color: cor.navy }}>Quem descansa neste jazigo</strong>

      {/* O DOCUMENTO, ANTES DO FORMULÁRIO.
          Os nomes e as datas estão gravados na pedra — é de lá que se copia.
          Toque abre em tamanho cheio, porque letra em pedra gasta não se lê
          numa miniatura. */}
      {fotoLapide && (
        <a href={fotoLapide} target="_blank" rel="noreferrer"
           style={{ display: "block", marginTop: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoLapide} alt="foto da lápide"
               style={{ width: "100%", maxHeight: 340, objectFit: "contain",
                        borderRadius: 10, background: cor.bg, display: "block" }} />
          <span style={{ fontSize: 12.5, color: cor.cinza }}>
            toque para ver maior
          </span>
        </a>
      )}

      {/* NÃO TER FOTO É DIFERENTE DE NÃO TER PEDIDO A FOTO. Sem ela dá para
          cadastrar do mesmo jeito — pelo que a família contou —, mas quem
          está transcrevendo precisa saber que não é distração dela. */}
      {fotoLapide === null && (
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: cor.aviso, lineHeight: 1.45 }}>
          Este jazigo não tem foto da lápide. Dá para preencher pelo que a família
          contar; a foto entra na próxima lavagem.
        </p>
      )}

      {lista.length === 0 && !abrindo && (
        <p style={{ margin: "8px 0 0", fontSize: 15, color: cor.cinza, lineHeight: 1.5 }}>
          Ninguém cadastrado ainda.
        </p>
      )}

      {lista.map((p) => (
        <div key={p.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.linha}` }}>
          {editando === p.id ? (
            <FormularioFalecido
              valor={rascunho} aoMudar={setRascunho} salvando={salvando}
              aoSalvar={() => enviar("PATCH", { id: p.id, ...rascunho })}
              aoCancelar={() => { setEditando(null); setRascunho({}); }} />
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{p.nome}</span>
                {p.apelido_familiar && (
                  <span style={{ color: cor.cinza, fontSize: 14 }}>“{p.apelido_familiar}”</span>
                )}
                {p.principal && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46",
                                 background: "#ecfdf5", border: "1px solid #a7f3d0",
                                 borderRadius: 999, padding: "1px 8px" }}>
                    nome do jazigo
                  </span>
                )}
              </div>

              <div style={{ fontSize: 14, color: cor.cinza, marginTop: 4, lineHeight: 1.6 }}>
                {linhaDaData("Nascimento", p.data_nascimento, p.precisao_nascimento)}
                {" · "}
                {linhaDaData("Falecimento", p.data_falecimento, p.precisao_falecimento)}
              </div>

              {/* SEM DATA NÃO HÁ LEMBRETE — e a tela diz isso onde se resolve,
                  não numa lista de pendências em outro lugar. */}
              {p.precisao_falecimento !== "dia" && p.precisao_nascimento !== "dia" && (
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#b45309", lineHeight: 1.45 }}>
                  Sem nenhuma data no dia certo, <b>nenhum lembrete é gerado</b> para esta pessoa.
                </p>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button style={painel.botaoMiniSec} onClick={() => {
                  setEditando(p.id);
                  setRascunho({
                    nome: p.nome, apelido_familiar: p.apelido_familiar || "",
                    data_nascimento: p.data_nascimento || "", precisao_nascimento: p.precisao_nascimento,
                    data_falecimento: p.data_falecimento || "", precisao_falecimento: p.precisao_falecimento,
                    observacoes: p.observacoes || "",
                  });
                }}>Corrigir</button>
                {!p.principal && (
                  <button style={painel.botaoMiniSec}
                          onClick={() => enviar("PATCH", { id: p.id, principal: true })}>
                    Usar este nome no jazigo
                  </button>
                )}
                <button style={painel.botaoMiniSec} onClick={() => remover(p)}>Tirar</button>
              </div>
            </>
          )}
        </div>
      ))}

      {abrindo ? (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${cor.linha}` }}>
          <FormularioFalecido
            valor={rascunho} aoMudar={setRascunho} salvando={salvando}
            aoSalvar={() => enviar("POST", { tumuloId, ...rascunho })}
            aoCancelar={() => { setAbrindo(false); setRascunho({}); }} />
        </div>
      ) : (
        <button style={{ ...painel.botaoMini, marginTop: 12 }}
                onClick={() => { setAbrindo(true); setRascunho({ precisao_nascimento: "desconhecida", precisao_falecimento: "dia" }); }}>
          + Acrescentar alguém
        </button>
      )}

      {erro && <p style={{ fontSize: 14, color: "#b91c1c", margin: "8px 2px 0" }}>{erro}</p>}
    </div>
  );
}

const dia = (iso: string | null) =>
  !iso ? "—" : String(iso).slice(0, 10).split("-").reverse().join("/");

/** Uma data só vale com o quanto dela se sabe. */
function linhaDaData(rotulo: string, iso: string | null, precisao: string) {
  if (!iso || precisao === "desconhecida") return `${rotulo}: —`;
  if (precisao === "ano") return `${rotulo}: ${String(iso).slice(0, 4)} (só o ano)`;
  if (precisao === "mes_ano") {
    const [a, m] = String(iso).split("-");
    return `${rotulo}: ${m}/${a} (só o mês)`;
  }
  return `${rotulo}: ${dia(iso)}`;
}

const OPCOES_PRECISAO: [string, string][] = [
  ["dia", "dia certo"],
  ["mes_ano", "só mês e ano"],
  ["ano", "só o ano"],
  ["desconhecida", "não se sabe"],
];

function FormularioFalecido({ valor, aoMudar, aoSalvar, aoCancelar, salvando }: {
  valor: any; aoMudar: (v: any) => void;
  aoSalvar: () => void; aoCancelar: () => void; salvando: boolean;
}) {
  const p = (k: string, v: any) => aoMudar({ ...valor, [k]: v });
  const nomeOk = String(valor.nome || "").trim().length > 0;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <input style={{ ...painel.input, margin: 0 }} autoFocus placeholder="Nome completo"
               value={valor.nome || ""} onChange={(e) => p("nome", e.target.value)} />
        <input style={{ ...painel.input, margin: 0 }} placeholder="Como a família chamava (opcional)"
               value={valor.apelido_familiar || ""} onChange={(e) => p("apelido_familiar", e.target.value)} />
      </div>

      {(["nascimento", "falecimento"] as const).map((qual) => (
        <div key={qual} style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", alignItems: "center" }}>
          <input style={{ ...painel.input, margin: 0 }} placeholder={`${qual === "nascimento" ? "Nascimento" : "Falecimento"} — dia/mês/ano`}
                 value={valor[`data_${qual}`] || ""}
                 onChange={(e) => p(`data_${qual}`, e.target.value)} />
          <select style={{ ...painel.input, margin: 0 }}
                  value={valor[`precisao_${qual}`] || "desconhecida"}
                  onChange={(e) => p(`precisao_${qual}`, e.target.value)}>
            {OPCOES_PRECISAO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
      ))}

      <p style={{ fontSize: 13, color: cor.cinza, margin: "0 2px", lineHeight: 1.45 }}>
        O <b>ano importa</b>: é o que permite dizer “completam-se 7 anos” e é o que
        segura o lembrete quando a perda é recente. Se souber só o mês ou só o ano,
        marque ao lado — assim <b>nenhum lembrete sai numa data inventada</b>.
      </p>

      <div style={{ display: "flex", gap: 6 }}>
        <button style={nomeOk ? painel.botaoMini : painel.botaoMiniSec}
                disabled={!nomeOk || salvando} onClick={aoSalvar}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button style={painel.botaoMiniSec} onClick={aoCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
