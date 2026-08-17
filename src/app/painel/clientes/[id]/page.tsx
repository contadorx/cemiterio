"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Plus, ChevronDown, Pencil, Link2, Trash2, Camera } from "lucide-react";
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

/** Quantas limpezas cabem num mês, para mostrar o total antes de salvar. */
const POR_MES: Record<string, number> = {
  semanal: 4, quinzenal: 2, mensal: 1, bimestral: 0.5, trimestral: 1 / 3,
};

function porMes(f: { valor_lavagem: any; valor_base: string; periodicidade: string }) {
  const v = Number(String(f.valor_lavagem).replace(",", "."));
  if (!isFinite(v)) return 0;
  if (f.valor_base === "mes") return Math.round(v * 100) / 100;
  return Math.round(v * (POR_MES[f.periodicidade] ?? 1) * 100) / 100;
}

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

      <Identificacao c={c} aoMudar={carregar} />
      <Pessoas familiaId={c.familia_id} atualId={id} />
      <Tumulos tumulos={d.tumulos || []} clienteId={id} aoMudar={carregar} />
      <ContaCorrente familiaId={c.familia_id} clienteId={id} aoMudar={carregar} />
      <Limpezas clienteId={id} tumulos={d.tumulos || []} aoMudar={carregar} />
      <Ajustes clienteId={id} nome={c.nome} />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Tumulos({ tumulos, clienteId, aoMudar }: {
  tumulos: any[]; clienteId: string; aoMudar: () => void;
}) {
  const [novo, setNovo] = useState(false);
  return (
    <Cartao
      titulo={tumulos.length === 1 ? "Túmulo" : "Túmulos"}
      acao={
        <Botao onClick={() => setNovo((x) => !x)}>
          <Plus size={16} /> Adicionar
        </Botao>
      }
    >
      {novo && (
        <AdicionarTumulo
          clienteId={clienteId}
          aoPronto={() => { setNovo(false); aoMudar(); }}
          aoCancelar={() => setNovo(false)}
        />
      )}
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
    valor_base: t.valor_base ?? "mes",
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
                <Selo tom="neutro">
                  {dinheiro(Number(t.valor_lavagem || 0))}
                  {(t.valor_base ?? "mes") === "mes" ? " por mês" : " por limpeza"}
                </Selo>
                <Selo tom="neutro">limpeza {t.periodicidade || "—"}</Selo>
                <Selo tom="neutro">paga {t.freq_pagamento || "—"}</Selo>
              </>
            ) : (
              <Selo tom="atencao">sem plano · avulso</Selo>
            )}
          </div>
        </div>

        {/* Um chevron sozinho não diz que ali se edita — quem olha vê um
            enfeite. A palavra "Editar" resolve, e o ícone só acompanha. */}
        <button
          onClick={() => setAbrindo((x) => !x)}
          className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-2 text-[14px] font-medium text-ink hover:bg-surface"
        >
          {abrindo ? "Fechar" : "Editar"}
          <ChevronDown size={16} className={abrindo ? "rotate-180 transition" : "transition"} />
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
            <Campo rotulo="Valor combinado">
              <Entrada
                inputMode="decimal"
                value={f.valor_lavagem}
                onChange={(e: any) => setF({ ...f, valor_lavagem: e.target.value })}
                placeholder="40,00"
              />
            </Campo>
            {/* A BASE DO VALOR.
                Sem perguntar, o sistema supunha "por lavagem" e multiplicava:
                R$ 40 com limpeza semanal virava R$ 160 no mês — quatro vezes o
                combinado, numa cobrança que a família não reconheceria. */}
            <Campo rotulo="Esse valor é">
              <Selecao
                value={f.valor_base}
                onChange={(e: any) => setF({ ...f, valor_base: e.target.value })}
              >
                <option value="mes">por mês, não importa quantas limpezas</option>
                <option value="lavagem">o preço de cada limpeza</option>
              </Selecao>
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

          {/* O RESULTADO, escrito antes de salvar. É a única forma de a Sureya
              perceber na hora que combinou uma coisa e o sistema entendeu
              outra. */}
          {f.valor_lavagem && f.periodicidade && (
            <p className="mt-3 rounded-lg bg-brand-light px-3 py-2 text-[14px] text-ink">
              Dá <b>{dinheiro(porMes(f))}</b> por mês
              {f.valor_base === "lavagem" && " (o valor de cada limpeza vezes as do mês)"}.
            </p>
          )}

          <label className="mt-3 flex items-center gap-2 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={f.contratado}
              onChange={(e: any) => setF({ ...f, contratado: e.target.checked })}
              className="h-4 w-4"
            />
            Tem plano — entra na cobrança do mês
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <Botao tom="principal" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
            <Botao onClick={() => setAbrindo(false)}>Cancelar</Botao>
            <Portal tumuloId={t.id} tokenAtual={t.qr_token} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * O LINK DO PORTAL — o que a família abre para ver o antes e o depois.
 *
 * Sem senha, de propósito: idoso não guarda senha. O link chega uma vez pelo
 * WhatsApp e fica salvo no celular dele.
 */
function Portal({ tumuloId, tokenAtual }: { tumuloId: string; tokenAtual: string | null }) {
  const [token, setToken] = useState<string | null>(tokenAtual);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const link = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/familia/${token}`
    : "";

  async function emitir() {
    setOcupado(true);
    try {
      const r = await fetch(`/api/tumulos/${tumuloId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "emitir" }),
      }).then((x) => x.json());
      if (r?.ok) setToken(r.token || r.qr_token || null);
    } finally { setOcupado(false); }
  }

  if (!token) {
    return (
      <Botao onClick={emitir} disabled={ocupado}>
        <Link2 size={16} /> {ocupado ? "Gerando…" : "Gerar link do portal"}
      </Botao>
    );
  }

  return (
    <Botao
      onClick={() => {
        navigator.clipboard?.writeText(link);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      <Link2 size={16} /> {copiado ? "link copiado" : "Copiar link do portal"}
    </Botao>
  );
}

/* ------------------------------------------------------------------ */

function ContaCorrente({ familiaId, clienteId, aoMudar }: {
  familiaId: string | null; clienteId: string; aoMudar: () => void;
}) {
  const [dados, setDados] = useState<any>(null);
  // O comprovante entra AQUI, junto com o pagamento — e não num fluxo à
  // parte. Anexar depois é o tipo de tarefa que ninguém volta para fazer.
  const [comprovante, setComprovante] = useState<{ b64: string; mt: string } | null>(null);
  const camera = useRef<HTMLInputElement | null>(null);
  const [abrindo, setAbrindo] = useState<"pagamento" | "avulso" | "abertura" | null>(null);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  // A data nasce hoje porque é o caso comum, mas precisa ser editável: o Pix
  // costuma cair antes de a Sureya sentar para lançar, e sem isso o extrato
  // registra o dia do lançamento em vez do dia do dinheiro.
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
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

  function escolherComprovante(e: any) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      setComprovante({ b64: String(leitor.result || ""), mt: arquivo.type || "image/jpeg" });
    };
    leitor.readAsDataURL(arquivo);
  }

  async function lancar() {
    const n = Number(String(valor).replace(",", "."));
    if (!isFinite(n) || (abrindo !== "abertura" && n <= 0)) {
      setErro(abrindo === "abertura" ? "Informe o valor." : "Informe um valor maior que zero.");
      return;
    }
    setOcupado(true);
    setErro("");
    try {
      // Sobe o comprovante ANTES do lançamento: se a imagem falhar, nada é
      // gravado e a Sureya tenta de novo. Ao contrário, ela ficaria com um
      // pagamento registrado sem prova e sem saber.
      let comprovanteId: string | null = null;
      if (comprovante) {
        const up = await fetch("/api/comprovantes/anexar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clienteId, imagemBase64: comprovante.b64, mimetype: comprovante.mt, valor: n, data,
          }),
        }).then((x) => x.json());
        if (!up?.ok) { setErro(up?.mensagem || "Não consegui salvar o comprovante."); return; }
        comprovanteId = up.id;
      }

      const r = await fetch("/api/conta-corrente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId, acao: abrindo, valor: n, descricao, comprovanteId, data }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui lançar."); return; }
      setAbrindo(null); setValor(""); setDescricao(""); setComprovante(null);
      setData(new Date().toISOString().slice(0, 10));
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
            <Campo
              rotulo={abrindo === "pagamento" ? "Quando o dinheiro entrou" : "Data"}
              dica={abrindo === "pagamento" ? "a data do Pix, não a de hoje" : undefined}
            >
              <Entrada type="date" value={data}
                       onChange={(e: any) => setData(e.target.value)} />
            </Campo>
            <Campo rotulo="Descrição">
              <Entrada value={descricao} onChange={(e: any) => setDescricao(e.target.value)}
                       placeholder="opcional" />
            </Campo>
          </div>
          {/* O COMPROVANTE, sem depender do WhatsApp.
              Ela tira foto da tela ou escolhe o print que a família mandou no
              WhatsApp pessoal. Funciona com a instância de pé ou caída. */}
          {abrindo === "pagamento" && (
            <div className="mt-3">
              <input ref={camera} type="file" accept="image/*" capture="environment"
                     onChange={escolherComprovante} className="hidden" />
              {comprovante ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={comprovante.b64} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <span className="text-[14px] text-positivo">comprovante anexado</span>
                  <button onClick={() => setComprovante(null)}
                          className="text-[13px] text-ink-soft underline">
                    trocar
                  </button>
                </div>
              ) : (
                <Botao onClick={() => camera.current?.click()}>
                  <Camera size={16} /> Anexar comprovante
                </Botao>
              )}
            </div>
          )}

          {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}
          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={lancar} disabled={ocupado}>
              {ocupado ? "Lançando…" : "Lançar"}
            </Botao>
            <Botao onClick={() => { setAbrindo(null); setComprovante(null); }}>Cancelar</Botao>
          </div>
        </div>
      )}

      {dados?.linhas?.length === 0 && (
        <p className="text-[14px] text-ink-soft">Nenhum lançamento ainda.</p>
      )}

      {(dados?.linhas || []).map((l: any) => (
        <Lancamento key={l.id} l={l} aoMudar={() => { carregar(); aoMudar(); }} />
      ))}
    </Cartao>
  );
}

/**
 * UMA LINHA DO EXTRATO, corrigível.
 *
 * Errar a data de um Pix é banal. Sem poder corrigir, a pessoa passa a evitar
 * registrar — e aí o extrato deixa de valer.
 */
function Lancamento({ l, aoMudar }: { l: any; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ data: l.data, valor: String(l.valor), descricao: l.descricao || "" });
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const periodo = (comp: string) => `${MESES[Number(comp.slice(5, 7)) - 1]}/${comp.slice(2, 4)}`;

  async function salvar() {
    setOcupado(true); setErro("");
    try {
      const r = await fetch("/api/conta-corrente", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: l.id, ...f }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui salvar."); return; }
      setEditando(false); aoMudar();
    } finally { setOcupado(false); }
  }

  async function apagar() {
    if (!confirm("Apagar este lançamento? O saldo muda na hora.")) return;
    setOcupado(true);
    await fetch(`/api/conta-corrente?id=${l.id}`, { method: "DELETE" });
    setOcupado(false);
    aoMudar();
  }

  if (editando) {
    return (
      <div className="border-t border-line py-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Data"><Entrada type="date" value={f.data}
            onChange={(e: any) => setF({ ...f, data: e.target.value })} /></Campo>
          <Campo rotulo="Valor"><Entrada inputMode="decimal" value={f.valor}
            onChange={(e: any) => setF({ ...f, valor: e.target.value })} /></Campo>
          <Campo rotulo="Descrição"><Entrada value={f.descricao}
            onChange={(e: any) => setF({ ...f, descricao: e.target.value })} /></Campo>
        </div>
        {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Botao tom="principal" onClick={salvar} disabled={ocupado}>
            {ocupado ? "Salvando…" : "Salvar"}
          </Botao>
          <Botao onClick={() => setEditando(false)}>Cancelar</Botao>
          <Botao tom="perigo" onClick={apagar} disabled={ocupado}>
            <Trash2 size={16} /> Apagar
          </Botao>
        </div>
      </div>
    );
  }

  return (
        <div className="flex items-center justify-between gap-3 border-t border-line py-2.5">
          <div className="min-w-0">
            <p className="text-[14px] text-ink">{l.descricao}</p>
            <p className="text-[12px] text-ink-soft">
              {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
              {l.competencia && ` · ${periodo(l.competencia)}`}
              {l.local && ` · ${l.local}`}
              {l.comprovanteUrl && (
                <>
                  {" · "}
                  <a href={l.comprovanteUrl} target="_blank" rel="noreferrer"
                     className="text-brand underline">ver comprovante</a>
                </>
              )}
            </p>
          </div>
          {/* A lavagem é REGISTRO, não dinheiro: "+ R$ 0,00" pareceria uma
              cobrança de valor zero. */}
          {/* A lavagem é REGISTRO, não dinheiro, e não se edita: ela é o
              espelho do serviço executado. */}
          {l.origem === "lavagem" ? (
            <span className="flex-shrink-0 text-[12px] text-ink-soft">✓ serviço feito</span>
          ) : (
            <button
              onClick={() => setEditando(true)}
              className={`flex-shrink-0 text-[14px] font-semibold underline decoration-dotted ${
                l.tipo === "debito" ? "text-aviso" : "text-positivo"}`}
              title="Corrigir data, valor ou descrição"
            >
              {l.tipo === "debito" ? "+" : "−"} {dinheiro(l.valor)}
            </button>
          )}
        </div>
  );
}

/* ------------------------------------------------------------------ */

function Limpezas({ clienteId, tumulos, aoMudar }: {
  clienteId: string; tumulos: any[]; aoMudar: () => void;
}) {
  const [lista, setLista] = useState<any[]>([]);
  const [lancando, setLancando] = useState(false);
  const [tumuloId, setTumuloId] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [ocupado, setOcupado] = useState(false);

  // LIMPEZA AVULSA — a que a Sureya registra à mão.
  // Existe porque nem toda limpeza passa pelo app da Nina: a própria Sureya
  // faz uma de vez em quando, e sem isto ela não teria como registrar.
  async function registrar() {
    if (!tumuloId) return;
    setOcupado(true);
    try {
      await fetch("/api/servico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tumuloId, dataExecutada: data, avulso: true }),
      });
      setLancando(false);
      setTumuloId("");
      aoMudar();
      recarregar();
    } finally { setOcupado(false); }
  }

  function recarregar() {
    fetch(`/api/servicos?clienteId=${clienteId}&situacao=todos&limite=100`)
      .then((x) => x.json())
      .then((r) => setLista((r?.servicos || []).filter((sv: any) => sv.data_executada)))
      .catch(() => {});
  }

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
    <Cartao
      titulo="Limpezas"
      acao={
        tumulos.length ? (
          <Botao onClick={() => setLancando((x) => !x)}>
            <Plus size={16} /> Registrar
          </Botao>
        ) : undefined
      }
    >
      {lancando && (
        <div className="mb-3 rounded-lg bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Qual túmulo">
              <Selecao value={tumuloId} onChange={(e: any) => setTumuloId(e.target.value)}>
                <option value="">escolha</option>
                {tumulos.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {[t.quadras?.codigo, t.ruas?.nome, t.identificacao].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Quando foi feita">
              <Entrada type="date" value={data} onChange={(e: any) => setData(e.target.value)} />
            </Campo>
          </div>
          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={registrar} disabled={ocupado || !tumuloId}>
              {ocupado ? "Registrando…" : "Registrar limpeza"}
            </Botao>
            <Botao onClick={() => setLancando(false)}>Cancelar</Botao>
          </div>
        </div>
      )}

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

/* ------------------------------------------------------------------ */

/**
 * EDITAR A FAMÍLIA — nome, WhatsApp e observações.
 *
 * Sumiu na primeira versão da ficha nova, e era a coisa mais básica que se
 * faz aqui: corrigir um telefone digitado errado. Cortar excesso não pode
 * levar função junto.
 */
function Identificacao({ c, aoMudar }: { c: any; aoMudar: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const [f, setF] = useState({
    nome: c.nome ?? "",
    telefone: c.telefone ?? "",
    observacoes: c.observacoes ?? "",
  });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await fetch(`/api/clientes/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      setAbrindo(false);
      aoMudar();
    } finally { setSalvando(false); }
  }

  return (
    <Cartao
      titulo="Dados da família"
      acao={
        <Botao onClick={() => setAbrindo((x) => !x)}>
          <Pencil size={16} /> Editar
        </Botao>
      }
    >
      {!abrindo ? (
        <div className="text-[14px] text-ink-muted">
          <p className="text-[15px] text-ink">{c.nome}</p>
          <p>{c.telefone || "sem WhatsApp"}</p>
          {c.observacoes && <p className="mt-1 text-[13px]">{c.observacoes}</p>}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <Entrada value={f.nome} onChange={(e: any) => setF({ ...f, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="WhatsApp">
              <Entrada value={f.telefone} inputMode="tel"
                       onChange={(e: any) => setF({ ...f, telefone: e.target.value })}
                       placeholder="11 99999-9999" />
            </Campo>
          </div>
          <div className="mt-3">
            <Campo rotulo="Observações" dica="o que ajuda a atender bem esta família">
              <Entrada value={f.observacoes}
                       onChange={(e: any) => setF({ ...f, observacoes: e.target.value })}
                       placeholder="opcional" />
            </Campo>
          </div>
          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
            <Botao onClick={() => setAbrindo(false)}>Cancelar</Botao>
          </div>
        </>
      )}
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */

/**
 * AS PESSOAS DA FAMÍLIA.
 *
 * Uma família pode ter vários cadastros: o filho que paga, a neta que
 * acompanha. Só aparece quando há mais de uma — com uma só, não ocupa espaço.
 */
function Pessoas({ familiaId, atualId }: { familiaId: string | null; atualId: string }) {
  const [lista, setLista] = useState<any[]>([]);

  useEffect(() => {
    if (!familiaId) return;
    fetch(`/api/clientes?familiaId=${familiaId}`)
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setLista(r.clientes || []); })
      .catch(() => {});
  }, [familiaId]);

  if (!familiaId || lista.length <= 1) return null;

  return (
    <Cartao titulo="Pessoas da família">
      {lista.map((p: any) => (
        <div key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
          <div className="min-w-0">
            <p className="text-[15px] text-ink">
              {p.nome}
              {p.id === atualId && <span className="text-ink-soft"> · esta ficha</span>}
            </p>
            <p className="text-[13px] text-ink-soft">
              {p.telefone}{p.parentesco ? ` · ${p.parentesco}` : ""}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-1.5">
            {p.responsavel_financeiro && <Selo tom="bom">paga</Selo>}
            {p.recebe_fotos && <Selo tom="neutro">recebe fotos</Selo>}
          </div>
        </div>
      ))}
    </Cartao>
  );
}

/* ------------------------------------------------------------------ */

/** Liga um túmulo novo a esta família — escolhendo quadra e rua das listas. */
/**
 * LIGAR UM TÚMULO À FAMÍLIA.
 *
 * Duas portas, e a ordem importa: **primeiro os que a Nina já cadastrou no
 * campo**, depois criar do zero.
 *
 * O motivo é o estado real do cadastro: os 71 túmulos capturados no cemitério
 * estavam todos sem família. Se esta tela abrisse no formulário de criar,
 * a Sureya cadastraria de novo o que já existe — e o cemitério acabaria com
 * dois registros para a mesma pedra, cada um com metade da história.
 */
function AdicionarTumulo({ clienteId, aoPronto, aoCancelar }: {
  clienteId: string; aoPronto: () => void; aoCancelar: () => void;
}) {
  const [porta, setPorta] = useState<"campo" | "novo">("campo");
  const [orfaos, setOrfaos] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [quadras, setQuadras] = useState<any[]>([]);
  const [ruas, setRuas] = useState<any[]>([]);
  const [f, setF] = useState({ quadraId: "", quadraCodigo: "", rua: "", identificacao: "", falecidoNome: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/tumulos").then((x) => x.json())
      .then((r) => {
        if (!r?.ok) return;
        setOrfaos(r.semDono || []);
        // Sem nenhum órfão esperando, a porta do campo não serve — abre direto
        // no formulário em vez de mostrar uma lista vazia.
        if (!(r.semDono || []).length) setPorta("novo");
        setQuadras(r.cemiterios?.[0]?.quadras || []);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!f.quadraId) { setRuas([]); return; }
    fetch(`/api/ruas?quadraId=${f.quadraId}`).then((x) => x.json())
      .then((r) => { if (r?.ok) setRuas(r.ruas || []); }).catch(() => {});
  }, [f.quadraId]);

  async function enviar(corpo: any) {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/clientes/${clienteId}/tumulos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "Não consegui ligar."); return; }
      aoPronto();
    } finally { setSalvando(false); }
  }

  const filtrados = orfaos.filter((t: any) => {
    const alvo = [t.identificacao, t.quadra, t.rua].filter(Boolean).join(" ").toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });

  return (
    <div className="mb-3 rounded-lg bg-surface p-3">
      <div className="mb-3 flex gap-2">
        <Botao
          tom={porta === "campo" ? "principal" : "secundario"}
          onClick={() => setPorta("campo")}
        >
          Cadastrados no campo{orfaos.length ? ` (${orfaos.length})` : ""}
        </Botao>
        <Botao
          tom={porta === "novo" ? "principal" : "secundario"}
          onClick={() => setPorta("novo")}
        >
          Criar novo
        </Botao>
      </div>

      {porta === "campo" ? (
        <>
          {!orfaos.length ? (
            <p className="text-[14px] text-ink-soft">
              Nenhum túmulo do campo esperando família. Use &ldquo;Criar novo&rdquo;.
            </p>
          ) : (
            <>
              <Entrada
                value={busca}
                onChange={(e: any) => setBusca(e.target.value)}
                placeholder="Buscar por nome na pedra, quadra ou rua"
              />
              <div className="mt-2 max-h-72 overflow-y-auto">
                {filtrados.map((t: any) => (
                  <button
                    key={t.id}
                    disabled={salvando}
                    onClick={() => enviar({ vincularTumuloId: t.id })}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-2.5 text-left hover:bg-surface disabled:opacity-50"
                    style={{ marginBottom: 6 }}
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] text-ink">
                        {[t.quadra, t.rua].filter(Boolean).join(" · ") || "sem endereço"}
                      </span>
                      {t.identificacao && (
                        <span className="block text-[13px] text-ink-soft">{t.identificacao}</span>
                      )}
                    </span>
                    <Link2 size={16} className="flex-shrink-0 text-ink-soft" />
                  </button>
                ))}
                {!filtrados.length && (
                  <p className="py-2 text-[14px] text-ink-soft">Nada com esse termo.</p>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Quadra">
            <Selecao
              value={f.quadraId}
              onChange={(e: any) => {
                const q = quadras.find((x: any) => x.id === e.target.value);
                setF({ ...f, quadraId: e.target.value, quadraCodigo: q?.codigo || "", rua: "" });
              }}
            >
              <option value="">escolha</option>
              {quadras.map((q: any) => <option key={q.id} value={q.id}>{q.codigo}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Rua">
            <Selecao value={f.rua} disabled={!ruas.length}
                     onChange={(e: any) => setF({ ...f, rua: e.target.value })}>
              <option value="">{f.quadraId ? "escolha" : "escolha a quadra antes"}</option>
              {ruas.map((r: any) => <option key={r.id} value={r.nome}>{r.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Nome escrito na pedra" dica="opcional">
            <Entrada value={f.identificacao}
                     onChange={(e: any) => setF({ ...f, identificacao: e.target.value })}
                     placeholder="Ex.: Almeida" />
          </Campo>
          <Campo rotulo="Nome do falecido">
            <Entrada value={f.falecidoNome}
                     onChange={(e: any) => setF({ ...f, falecidoNome: e.target.value })}
                     placeholder="opcional" />
          </Campo>
        </div>
      )}

      {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}

      <div className="mt-3 flex gap-2">
        {porta === "novo" && (
          <Botao
            tom="principal"
            disabled={salvando}
            onClick={() => {
              if (!f.quadraCodigo) return setErro("Escolha a quadra.");
              if (!f.rua) return setErro("Escolha a rua — é ela que põe o jazigo no roteiro.");
              enviar({
                quadraCodigo: f.quadraCodigo, rua: f.rua,
                identificacao: f.identificacao || null,
                falecidoNome: f.falecidoNome || null,
              });
            }}
          >
            {salvando ? "Criando…" : "Criar e ligar"}
          </Botao>
        )}
        <Botao onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * AJUSTES — recolhido por padrão.
 *
 * Coisas de fazer uma vez: exportar dados e excluir. Ficavam abertas
 * competindo com o que se usa todo dia.
 */
function Ajustes({ clienteId, nome }: { clienteId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function excluir() {
    if (!confirm(
      `Excluir a ficha de ${nome}?\n\nOs túmulos ficam cadastrados e podem ser ligados a outra família. Esta ação não volta.`
    )) return;
    setOcupado(true);
    const r = await fetch(`/api/clientes/${clienteId}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) window.location.href = "/painel/clientes";
    else alert(r?.mensagem || r?.erro || "Não consegui excluir.");
  }

  return (
    <div className="mt-1">
      <Botao className="w-full" onClick={() => setAberto((x) => !x)}>
        {aberto ? "Fechar ajustes" : "Ajustes da família"}
      </Botao>
      {aberto && (
        <Cartao className="mt-2">
          <a
            href={`/api/clientes/${clienteId}/lgpd`}
            className="mb-3 block text-[14px] text-brand underline"
          >
            Exportar os dados desta família
          </a>
          <Botao tom="perigo" onClick={excluir} disabled={ocupado}>
            <Trash2 size={16} /> Excluir ficha
          </Botao>
        </Cartao>
      )}
    </div>
  );
}
