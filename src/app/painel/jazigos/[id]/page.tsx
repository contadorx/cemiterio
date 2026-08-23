"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { painel, cor } from "../../ui";

/**
 * A FICHA DO JAZIGO.
 *
 * Tudo o que o sistema sabe de um túmulo estava espalhado: a urgência numa
 * view, o roteiro na agenda, o histórico nos serviços, e as pendências em lugar
 * nenhum. Aqui aterrissa.
 *
 * A ordem dos blocos não é arbitrária — é a ordem das perguntas que se faz
 * olhando um jazigo:
 *
 *   1. o que precisa de mim?        (pendências)
 *   2. está atrasado?               (urgência)
 *   3. quando vou lá?               (roteiro)
 *   4. o que já foi feito?          (histórico)
 *
 * Pendência vem primeiro de propósito. Relatório que começa pelo que está bem
 * ensina a rolar até o fim; começar pelo que falta ensina a resolver.
 */

interface Ficha {
  jazigo: any; urgencia: any; agendado: any;
  historico: any[]; pendencias: { o_que: string; porque: string }[];
}

const dia = (iso: string | null) =>
  !iso ? "—" : String(iso).slice(0, 10).split("-").reverse().join("/");

/** Como ler o número da urgência sem precisar de legenda. */
function tomDaSituacao(s: string | null): { fundo: string; borda: string; texto: string } {
  if (s === "MUITO ATRASADO") return { fundo: "#fef2f2", borda: "#dc2626", texto: "#7f1d1d" };
  if (s === "atrasado")       return { fundo: "#fff7ed", borda: "#ea580c", texto: "#7c2d12" };
  if (s === "chegando a hora")return { fundo: "#fefce8", borda: "#ca8a04", texto: "#713f12" };
  if (s === "em dia")         return { fundo: "#ecfdf5", borda: "#059669", texto: "#064e3b" };
  return { fundo: "#f8fafc", borda: "#cbd5e1", texto: "#334155" };
}

export default function FichaJazigo({ params }: { params: { id: string } }) {
  const [f, setF] = useState<Ficha | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch(`/api/tumulos/${params.id}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.erro || "falhou");
      setF(r);
    } catch (e: any) { setErro(e?.message || "não deu para carregar"); }
  }, [params.id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return (
    <div style={painel.card}>
      <p style={{ color: cor.perigo }}>Não deu para carregar: {erro}</p>
      <button style={painel.botaoMiniSec} onClick={carregar}>Tentar de novo</button>
    </div>
  );
  if (!f) return <p style={{ color: cor.cinza }}>Carregando…</p>;

  const j = f.jazigo;
  const u = f.urgencia;
  const tom = tomDaSituacao(u?.situacao ?? null);

  return (
    <>
      <p style={{ margin: "0 0 8px" }}>
        <Link href="/painel/jazigos" style={{ color: cor.cinza, fontSize: 14 }}>← Jazigos</Link>
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "rgb(var(--zm-ink))", margin: "0 0 2px" }}>
        {j.quadra ? `Q${j.quadra} · ` : ""}{j.identificacao || "(sem identificação)"}
      </h1>
      <p style={{ color: cor.cinza, fontSize: 15, margin: "0 0 14px" }}>
        {[j.rua, j.falecido, j.familia].filter(Boolean).join(" · ") || "sem rua, falecido ou família"}
      </p>

      {/* 1. O QUE PRECISA DE MIM */}
      {f.pendencias.length > 0 && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Precisa de alguém</strong>
          {(f.pendencias || []).map((p) => (
            <div key={p.o_que} style={{ marginTop: 10, paddingLeft: 12,
                                        borderLeft: `3px solid ${cor.aviso}` }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.o_que}</div>
              <div style={{ color: cor.cinza, fontSize: 14, lineHeight: 1.45 }}>{p.porque}</div>
            </div>
          ))}
        </div>
      )}

      {/* 2. ESTÁ ATRASADO? */}
      <div style={{ ...painel.card, background: tom.fundo, border: `1px solid ${tom.borda}`, color: tom.texto }}>
        <strong>Idade de lavagem</strong>
        <p style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
          {u?.idade_dias ?? "—"} dias
          {u?.urgencia != null && (
            <span style={{ fontSize: 17, fontWeight: 700 }}>
              {" "}· urgência {Number(u.urgencia).toFixed(2).replace(".", ",")}
            </span>
          )}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>{u?.situacao || "—"}</p>

        {/* DE ONDE VEM O NÚMERO. Hoje quase toda idade é estimativa, não fato —
            e uma tela que não diz isso faz a estimativa parecer medição. */}
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.5, opacity: 0.9 }}>
          Contando desde <b>{dia(u?.ultima_lavagem)}</b>, que veio de:{" "}
          <b>{u?.origem_da_idade || "—"}</b>.
          {u?.origem_da_idade !== "lavagem registrada" && (
            <> Este jazigo <b>ainda não tem lavagem registrada</b> no sistema — o número é
            estimativa, não medição. Se a família disser a data da última limpeza, ela passa
            a valer.</>
          )}
        </p>
        {u?.vence_em && (
          <p style={{ margin: "6px 0 0", fontSize: 14 }}>
            Vence em <b>{dia(u.vence_em)}</b> (a cada {u.intervalo_dias} dias).
          </p>
        )}
      </div>

      {/* 3. QUANDO VOU LÁ */}
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>No roteiro</strong>
        {f.agendado ? (
          <p style={{ margin: "8px 0 0", fontSize: 15 }}>
            Agendado para <b>{dia(f.agendado.data_prevista)}</b>
            {f.agendado.ordem_dia ? <> — <b>{f.agendado.ordem_dia}º</b> do dia</> : null}
            {" "}({f.agendado.status})
            {" · "}
            <Link href="/painel/agenda" style={{ color: cor.navy }}>ver a agenda</Link>
          </p>
        ) : (
          <p style={{ margin: "8px 0 0", fontSize: 15, color: cor.cinza }}>
            Não está agendado.
            {!j.contratado && " Este jazigo não é contratado, então não entra por vencimento."}
          </p>
        )}
        <p style={{ margin: "8px 0 0", fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
          A ordem da caminhada é quadra → rua → posição na rua, com ruas alternadas
          percorridas ao contrário para uma emendar na outra.
          {j.ordemNaRua == null
            ? " Este ainda não tem posição na rua, então fecha a rua dele em ordem qualquer."
            : ` Este é o ${j.ordemNaRua}º da rua.`}
        </p>
      </div>

      {/* 4. O QUE JÁ FOI FEITO */}
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Histórico</strong>
        {f.historico.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 15, color: cor.cinza }}>
            Nenhuma limpeza registrada ainda.
          </p>
        ) : (f.historico || []).map((h) => (
          <div key={h.id} style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.linha}`,
                                   display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{dia(h.data_executada)}</span>
            {h.valor != null && <span style={{ color: cor.cinza }}>R$ {Number(h.valor).toFixed(2)}</span>}
            {[h.foto_antes_url, h.foto_depois_url].filter(Boolean).map((url: string, i: number) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={i} src={url} alt={i === 0 ? "antes" : "depois"}
                   style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
            ))}
          </div>
        ))}
      </div>

      {/* Contrato e dinheiro, por último: é o que se consulta, não o que se age. */}
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Contrato</strong>
        <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.6 }}>
          {j.contratado ? "Contratado" : "Sem contrato — as limpezas entram como avulso"}
          {j.periodicidade ? ` · ${j.periodicidade}` : ""}
          {j.valorLavagem ? ` · R$ ${Number(j.valorLavagem).toFixed(2)} por limpeza` : ""}
        </p>
        {j.familiaId ? (
          <p style={{ margin: "6px 0 0", fontSize: 15 }}>
            <Link href={`/painel/clientes?familiaId=${j.familiaId}`} style={{ color: cor.navy }}>
              Ver a família {j.familia ? `(${j.familia})` : ""} →
            </Link>
          </p>
        ) : (
          /* JAZIGO SEM FAMÍLIA — o mesmo caminho da lista, aqui.
             Quem abre a ficha veio ver de quem é o jazigo; obrigar a voltar
             para a lista para criar a família é a volta que faz o vínculo
             ficar para depois. */
          <NovaFamiliaAqui tumuloId={params.id} aoPronto={carregar} />
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * CRIAR A FAMÍLIA A PARTIR DO JAZIGO.
 *
 * Cadastrando o cemitério, a família de um jazigo quase sempre AINDA NÃO
 * EXISTE. Antes da 0091 nem dava: criar família exigia um contato, e contato
 * exige telefone — 81 jazigos ficaram parados esperando um número que talvez
 * nunca chegue.
 *
 * O contato aqui é opcional de propósito. A família nasce, o jazigo se liga a
 * ela, e as limpezas viram cobrança normalmente.
 */
function NovaFamiliaAqui({ tumuloId, aoPronto }: { tumuloId: string; aoPronto: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState({ nome: "", telefone: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar() {
    const n = nome.trim();
    if (!n) return;
    setSalvando(true); setErro("");
    try {
      const corpo: any = { nome: n };
      if (contato.nome.trim() || contato.telefone.trim()) corpo.contato = contato;

      const r = await fetch("/api/familias", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não consegui criar a família"); return; }

      const v = await fetch(`/api/tumulos/${tumuloId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familia_id: r.familiaId }),
      }).then((x) => x.json()).catch(() => null);

      // A família JÁ existe neste ponto. Dizer isso é o que evita a pessoa
      // criar uma segunda com o mesmo nome achando que a primeira não entrou.
      if (!v?.ok) {
        setErro(`A família "${n}" foi criada, mas não consegui ligar o jazigo a ela. `
                + `Abra Jazigos e escolha "${n}" na lista de famílias.`);
        return;
      }
      aoPronto();
    } finally { setSalvando(false); }
  }

  if (!abrindo) {
    return (
      <div style={{ marginTop: 10 }}>
        <p style={{ margin: "0 0 8px", fontSize: 15, color: "#b45309" }}>
          Este jazigo ainda não tem família.
        </p>
        <button style={painel.botaoMini} onClick={() => setAbrindo(true)}>
          + Cadastrar a família deste jazigo
        </button>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 10, padding: 12, borderRadius: 12,
      border: `1px solid ${cor.linha}`, background: "rgb(var(--zm-fundo))",
    }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
        <input style={{ ...painel.input, margin: 0 }} autoFocus
               placeholder="Nome da família" value={nome}
               onChange={(e) => setNome(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter" && nome.trim()) criar(); }} />
        <input style={{ ...painel.input, margin: 0 }}
               placeholder="Contato (se tiver)" value={contato.nome}
               onChange={(e) => setContato({ ...contato, nome: e.target.value })} />
        <input style={{ ...painel.input, margin: 0 }} inputMode="tel"
               placeholder="WhatsApp (se tiver)" value={contato.telefone}
               onChange={(e) => setContato({ ...contato, telefone: e.target.value })} />
      </div>
      <p style={{ fontSize: 13, color: cor.cinza, margin: "8px 2px 0", lineHeight: 1.45 }}>
        Sem contato a família é criada assim mesmo. As limpezas <b>viram cobrança
        normalmente</b> — o telefone entra quando aparecer.
      </p>
      {erro && <p style={{ fontSize: 14, color: "#b91c1c", margin: "8px 2px 0" }}>{erro}</p>}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button style={nome.trim() ? painel.botaoMini : painel.botaoMiniSec}
                disabled={!nome.trim() || salvando} onClick={criar}>
          {salvando ? "Criando…" : "Criar e ligar a este jazigo"}
        </button>
        <button style={painel.botaoMiniSec} onClick={() => setAbrindo(false)}>Cancelar</button>
      </div>
    </div>
  );
}
