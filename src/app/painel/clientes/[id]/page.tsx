"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Plus, ChevronDown } from "lucide-react";
import { Cartao, Campo, Entrada, Selecao, Botao, Selo, dinheiro } from "../../pecas";

/**
 * A FICHA DA FAMÍLIA.
 *
 * A ordem é a ordem em que se pensa: quem é a família, o que ela contratou, o
 * que foi feito, e só então se está pago.
 *
 * A ficha antiga fazia o contrário — mostrava os pagamentos na quarta posição
 * e os túmulos na sexta, ou seja, o dinheiro antes do que foi vendido. E
 * metade dela servia ao agente de IA: instruções por contato, memória
 * destilada, "treinar com histórico", score de entendimento.
 *
 * CAMPOS QUE SAÍRAM DO CADASTRO, e por quê:
 *   número do jazigo        duplicava a identificação
 *   nascimento/falecimento  eram gatilho de mensagem automática, desligada
 *   tratamento              idem
 *   régua de cobrança       automação de lembrete, desligada
 *   dias entre lembretes    idem
 *   máximo de lembretes     idem
 *   convite a cada N meses  campanha de ativação, desligada
 *   lavagens no período     derivado da periodicidade
 *   pago até / próxima cobrança  a conta corrente responde melhor
 *
 * Sobraram sete campos por túmulo, e todos são usados toda semana.
 */

const PERIODICIDADES = [
  ["semanal", "toda semana"],
  ["quinzenal", "a cada quinze dias"],
  ["mensal", "uma vez por mês"],
  ["bimestral", "a cada dois meses"],
  ["trimestral", "a cada três meses"],
];

const FREQUENCIAS = [
  ["mensal", "todo mês"],
  ["trimestral", "a cada três meses"],
  ["semestral", "a cada seis meses"],
  ["anual", "uma vez por ano"],
];

export default function Ficha() {
  const params = useParams();
  const id = String(params?.id || "");
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/clientes/${id}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r); else setErro(r?.erro || "Não consegui abrir esta ficha.");
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <p className="text-[15px] text-perigo">{erro}</p>;
  if (!d) return <p className="text-[15px] text-ink-soft">Carregando…</p>;

  const c = d.cliente;
  // A API de cliente devolve crédito como positivo — o oposto da conta
  // corrente. Invertemos aqui para que "em aberto" signifique a mesma coisa
  // nas duas telas do sistema.
  const devendo = -d.saldo;
  const emDia = Math.abs(devendo) < 0.005;
  const fone = String(c.telefone || "").replace(/\D/g, "");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/painel/clientes" className="text-[13px] text-ink-soft hover:text-ink">
            ← Famílias
          </Link>
          <h1 className="mt-1 text-[22px] font-semibold text-ink">{c.nome}</h1>
          <p className="text-[13px] text-ink-soft">{c.telefone}</p>
        </div>
        {fone && (
          <a
            href={`https://wa.me/55${fone}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-4 py-2.5 text-[15px] font-medium text-ink hover:bg-surface"
          >
            <MessageCircle size={17} /> WhatsApp
          </a>
        )}
      </div>

      {/* A RESPOSTA EM TRÊS SEGUNDOS — a primeira coisa que se quer saber ao
          abrir a ficha. Antes dividia espaço com o "score de entendimento",
          uma métrica da IA que aparecia MAIOR que o dinheiro. */}
      <div className="mb-3 rounded-xl2 bg-brand p-5 text-sobre">
        <p className="text-[13px] opacity-80">Situação</p>
        <p className="mt-0.5 text-[28px] font-semibold leading-tight">
          {emDia
            ? devendo < -0.005
              ? `Pago adiantado · ${dinheiro(-devendo)} a favor`
              : "Em dia"
            : `Em aberto · ${dinheiro(devendo)}`}
        </p>
        {d.aConferir > 0.005 && (
          <p className="mt-1 text-[14px] opacity-80">
            {dinheiro(d.aConferir)} aguardando conferência
          </p>
        )}
      </div>

      <Tumulos tumulos={d.tumulos || []} aoMudar={carregar} />
      <ContaCorrente familiaId={c.familia_id} aoMudar={carregar} />
      <Limpezas clienteId={id} />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Tumulos({ tumulos, aoMudar }: { tumulos: any[]; aoMudar: () => void }) {
  return (
    <Cartao titulo={tumulos.length === 1 ? "Túmulo" : "Túmulos"}>
      {!tumulos.length && (
        <p className="text-[14px] text-ink-soft">
          Nenhum túmulo ligado a esta família ainda.
        </p>
      )}
      {tumulos.map((t) => (
        <Tumulo key={t.id} t={t} aoMudar={aoMudar} />
      ))}
    </Cartao>
  );
}

function Tumulo({ t, aoMudar }: { t: any; aoMudar: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const [f, setF] = useState({
    valor_lavagem: t.valor_lavagem ?? "",
    periodicidade: t.periodicidade ?? "",
    freq_pagamento: t.freq_pagamento ?? "",
    contratado: !!t.contratado,
    falecido_nome: t.falecido_nome ?? "",
    identificacao: t.identificacao ?? "",
    quadra_id: t.quadra_id ?? "",
    rua: t.ruas?.nome ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [quadras, setQuadras] = useState<any[]>([]);
  const [ruas, setRuas] = useState<any[]>([]);

  // As listas só carregam quando a gaveta abre: são 4 quadras e 10 ruas por
  // quadra, mas buscar isso para cada túmulo da ficha ao entrar seria pedir ao
  // servidor um trabalho que ninguém pediu.
  useEffect(() => {
    if (!abrindo || quadras.length) return;
    fetch("/api/quadras").then((x) => x.json())
      .then((r) => { if (r?.ok) setQuadras(r.quadras || []); }).catch(() => {});
  }, [abrindo, quadras.length]);

  useEffect(() => {
    if (!abrindo || !f.quadra_id) { setRuas([]); return; }
    fetch(`/api/ruas?quadraId=${f.quadra_id}`).then((x) => x.json())
      .then((r) => { if (r?.ok) setRuas(r.ruas || []); }).catch(() => {});
  }, [abrindo, f.quadra_id]);

  const local = [t.quadras?.codigo, t.ruas?.nome].filter(Boolean).join(" · ");

  async function salvar() {
    setSalvando(true);
    try {
      await fetch(`/api/tumulos/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      setAbrindo(false);
      aoMudar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        {t.foto_referencia_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={t.foto_referencia_url}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-[11px] text-ink-soft">
            sem foto
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink">
            {local || "sem endereço"}
            {t.identificacao && (
              <span className="font-normal text-ink-muted"> · {t.identificacao}</span>
            )}
          </p>
          {t.falecido_nome && (
            <p className="text-[13px] text-ink-soft">{t.falecido_nome}</p>
          )}
          {/* O código é a identidade de verdade. Discreto: a Sureya confere,
              a Nina nunca digita. */}
          {t.codigo && <p className="text-[11px] tracking-wide text-ink-soft">{t.codigo}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {t.contratado ? (
              <>
                <Selo tom="neutro">{dinheiro(Number(t.valor_lavagem || 0))} por limpeza</Selo>
                <Selo tom="neutro">limpeza {t.periodicidade || "—"}</Selo>
                <Selo tom="neutro">paga {t.freq_pagamento || "—"}</Selo>
              </>
            ) : (
              <Selo tom="atencao">sem plano · avulso</Selo>
            )}
          </div>
        </div>

        <button
          onClick={() => setAbrindo((x) => !x)}
          className="flex-shrink-0 rounded-lg p-2 text-ink-soft hover:bg-surface"
          aria-label="Editar túmulo"
        >
          <ChevronDown size={18} className={abrindo ? "rotate-180 transition" : "transition"} />
        </button>
      </div>

      {abrindo && (
        <div className="mt-3 rounded-lg bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* O ENDEREÇO é editável aqui porque foi cadastrado no campo, de
                pé, no sol — e é onde o erro acontece. */}
            <Campo rotulo="Quadra">
              <Selecao
                value={f.quadra_id}
                onChange={(e: any) => setF({ ...f, quadra_id: e.target.value, rua: "" })}
              >
                <option value="">escolha</option>
                {quadras.map((q: any) => (
                  <option key={q.id} value={q.id}>{q.codigo}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Rua">
              <Selecao
                value={f.rua}
                onChange={(e: any) => setF({ ...f, rua: e.target.value })}
                disabled={!f.quadra_id || !ruas.length}
              >
                <option value="">{f.quadra_id ? "escolha" : "escolha a quadra antes"}</option>
                {ruas.map((r: any) => (
                  <option key={r.id} value={r.nome}>{r.nome}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo
              rotulo="Nome escrito na pedra"
              dica="opcional — quem identifica o túmulo é o código e a foto"
            >
              <Entrada
                value={f.identificacao}
                onChange={(e: any) => setF({ ...f, identificacao: e.target.value })}
                placeholder="Ex.: Almeida"
              />
            </Campo>
            <Campo rotulo="Nome do falecido">
              <Entrada
                value={f.falecido_nome}
                onChange={(e: any) => setF({ ...f, falecido_nome: e.target.value })}
                placeholder="opcional"
              />
            </Campo>
            <Campo rotulo="Valor por limpeza">
              <Entrada
                inputMode="decimal"
                value={f.valor_lavagem}
                onChange={(e: any) => setF({ ...f, valor_lavagem: e.target.value })}
                placeholder="40,00"
              />
            </Campo>
            {/* Os três atributos ficam lado a lado e visivelmente separados: é
                isso que impede o erro de tratar periodicidade e cobrança como
                a mesma coisa. */}
            <Campo rotulo="A Nina limpa" dica="de quanto em quanto tempo">
              <Selecao
                value={f.periodicidade}
                onChange={(e: any) => setF({ ...f, periodicidade: e.target.value })}
              >
                <option value="">escolha</option>
                {PERIODICIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="A família paga" dica="de quanto em quanto tempo">
              <Selecao
                value={f.freq_pagamento}
                onChange={(e: any) => setF({ ...f, freq_pagamento: e.target.value })}
              >
                <option value="">escolha</option>
                {FREQUENCIAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </Selecao>
            </Campo>
          </div>

          <label className="mt-3 flex items-center gap-2 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={f.contratado}
              onChange={(e: any) => setF({ ...f, contratado: e.target.checked })}
              className="h-4 w-4"
            />
            Tem plano — entra na cobrança do mês
          </label>

          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
            <Botao onClick={() => setAbrindo(false)}>Cancelar</Botao>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ContaCorrente({ familiaId, aoMudar }: { familiaId: string | null; aoMudar: () => void }) {
  const [dados, setDados] = useState<any>(null);
  const [abrindo, setAbrindo] = useState<"pagamento" | "avulso" | "abertura" | null>(null);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    if (!familiaId) return;
    fetch(`/api/conta-corrente?familiaId=${familiaId}`)
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setDados(r); })
      .catch(() => {});
  }, [familiaId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!familiaId) {
    return (
      <Cartao titulo="Conta corrente">
        <p className="text-[14px] text-ink-soft">
          Esta família ainda não está vinculada — a conta aparece quando o vínculo existir.
        </p>
      </Cartao>
    );
  }

  const temAbertura = (dados?.linhas || []).some((l: any) => l.origem === "abertura");

  async function lancar() {
    const n = Number(String(valor).replace(",", "."));
    if (!isFinite(n) || (abrindo !== "abertura" && n <= 0)) {
      setErro(abrindo === "abertura" ? "Informe o valor." : "Informe um valor maior que zero.");
      return;
    }
    setOcupado(true);
    setErro("");
    try {
      const r = await fetch("/api/conta-corrente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId, acao: abrindo, valor: n, descricao }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui lançar."); return; }
      setAbrindo(null); setValor(""); setDescricao("");
      carregar(); aoMudar();
    } finally {
      setOcupado(false);
    }
  }

  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const periodo = (comp: string) => `${MESES[Number(comp.slice(5, 7)) - 1]}/${comp.slice(2, 4)}`;

  return (
    <Cartao
      titulo="Conta corrente"
      acao={dados && (
        <span className={`text-[14px] font-semibold ${dados.emDia ? "text-positivo" : "text-aviso"}`}>
          {dados.frase}
        </span>
      )}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Botao tom="principal" onClick={() => { setAbrindo("pagamento"); setErro(""); }}>
          <Plus size={16} /> Pagamento
        </Botao>
        <Botao onClick={() => { setAbrindo("avulso"); setErro(""); }}>Avulso</Botao>
        {dados && !temAbertura && (
          <Botao onClick={() => { setAbrindo("abertura"); setErro(""); }}>Situação inicial</Botao>
        )}
      </div>

      {abrindo && (
        <div className="mb-3 rounded-lg bg-surface p-3">
          {abrindo === "abertura" && (
            <p className="mb-2 text-[13px] leading-relaxed text-ink-muted">
              Se ela <b>deve</b>, escreva o valor normal (240). Se está{" "}
              <b>adiantada</b>, escreva com menos (-80). Lançado uma vez só, para
              o extrato começar contando a verdade.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Valor">
              <Entrada inputMode="decimal" value={valor}
                       onChange={(e: any) => setValor(e.target.value)}
                       placeholder={abrindo === "abertura" ? "240 ou -80" : "160,00"} />
            </Campo>
            <Campo rotulo="Descrição">
              <Entrada value={descricao} onChange={(e: any) => setDescricao(e.target.value)}
                       placeholder="opcional" />
            </Campo>
          </div>
          {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}
          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={lancar} disabled={ocupado}>
              {ocupado ? "Lançando…" : "Lançar"}
            </Botao>
            <Botao onClick={() => setAbrindo(null)}>Cancelar</Botao>
          </div>
        </div>
      )}

      {dados?.linhas?.length === 0 && (
        <p className="text-[14px] text-ink-soft">Nenhum lançamento ainda.</p>
      )}

      {(dados?.linhas || []).map((l: any) => (
        <div key={l.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5">
          <div className="min-w-0">
            <p className="text-[14px] text-ink">{l.descricao}</p>
            <p className="text-[12px] text-ink-soft">
              {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
              {l.competencia && ` · ${periodo(l.competencia)}`}
              {l.local && ` · ${l.local}`}
            </p>
          </div>
          {/* A lavagem é REGISTRO, não dinheiro: "+ R$ 0,00" pareceria uma
              cobrança de valor zero. */}
          {l.origem === "lavagem" ? (
            <span className="flex-shrink-0 text-[12px] text-ink-soft">✓ serviço feito</span>
          ) : (
            <span className={`flex-shrink-0 text-[14px] font-semibold ${
              l.tipo === "debito" ? "text-aviso" : "text-positivo"}`}>
              {l.tipo === "debito" ? "+" : "−"} {dinheiro(l.valor)}
            </span>
          )}
        </div>
      ))}
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */

function Limpezas({ clienteId }: { clienteId: string }) {
  const [lista, setLista] = useState<any[]>([]);

  useEffect(() => {
    // Só as executadas: a ficha mostra o que FOI feito. O que está agendado
    // vive na Agenda, e misturar os dois faria a família parecer atendida
    // antes de a Nina ter ido lá.
    fetch(`/api/servicos?clienteId=${clienteId}&situacao=todos&limite=100`)
      .then((x) => x.json())
      .then((r) => {
        const feitos = (r?.servicos || []).filter((s: any) => s.data_executada);
        setLista(feitos);
      })
      .catch(() => {});
  }, [clienteId]);

  return (
    <Cartao titulo="Limpezas">
      {!lista.length && (
        <p className="text-[14px] text-ink-soft">Nenhuma limpeza registrada ainda.</p>
      )}
      {lista.map((l: any) => (
        <div key={l.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
          {l.foto_depois_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={l.foto_depois_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-ink">
              {l.data_executada
                ? new Date(l.data_executada).toLocaleDateString("pt-BR")
                : "sem data"}
            </p>
            {l.executora && <p className="text-[12px] text-ink-soft">{l.executora}</p>}
          </div>
          <Selo tom="bom">feita</Selo>
        </div>
      ))}
    </Cartao>
  );
}
