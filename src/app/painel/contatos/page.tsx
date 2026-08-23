"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Phone, Check, X, Clock, AlertTriangle, Send, ArrowLeft, Search } from "lucide-react";
import { Cartao, Botao, Selo, Campo, Entrada } from "../pecas";
import { diasDesde, faz } from "@/lib/datas";

/**
 * CONTATOS — quem escreveu pelo site e ainda espera resposta.
 *
 * POR QUE ESTA TELA EXISTE
 * ---------------------------------------------------------------------------
 * O formulário público grava o contato em `leads` e avisa por push e por
 * WhatsApp. Os dois avisos apontavam para `/painel/leads/<id>` — que o
 * middleware devolve 404 desde que o CRM foi desligado. E o "card de leads no
 * Início" que a rota do formulário promete no comentário saiu quando a tela
 * inicial virou "O mês".
 *
 * Resultado: o site dizia "respondemos no mesmo dia" e o contato não tinha
 * para onde ir. Se o aviso por WhatsApp não estivesse configurado, ele ficava
 * só no banco, sem tela nenhuma em que aparecesse.
 *
 * O QUE ELA É, E O QUE NÃO É
 * ---------------------------------------------------------------------------
 * É uma FILA: quem espera, há quanto tempo, o que a pessoa escreveu, quantas
 * vezes já se tentou falar, e qual é a próxima ação.
 *
 * Não é um CRM. O CRM foi desligado porque tinha superfície demais para duas
 * pessoas, e ressuscitá-lo inteiro para resolver isto seria trocar um problema
 * por outro maior.
 *
 * DUAS PALAVRAS COM SIGNIFICADO PRECISO
 *   ATRASADO — chegou há mais de 24 h e NINGUÉM tentou falar. É a promessa do
 *              site quebrada, e não "contato velho": quem já foi procurado
 *              duas vezes e não retornou não é culpa da casa.
 *   VENCIDO  — você marcou "ligo terça" e a terça passou.
 */

type Contato = {
  id: string; nome: string | null; telefone: string; origem: string | null;
  cemiterio_interesse: string | null; contexto: string | null;
  mensagens: Array<{ t: string; texto: string }> | null;
  created_at: string; tentativas: number; ultima_tentativa_em: string | null;
  responsavel: string | null; proximo_passo: string | null; proxima_acao: string | null;
  horas_esperando: number; atrasado: boolean; vencido: boolean;
};

/** "há 3 horas", "ontem", "há 5 dias" — em horas enquanto for o mesmo dia. */
function espera(horas: number, iso: string): string {
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const d = diasDesde(iso);
  return d === null ? `há ${horas} horas` : faz(d);
}

/**
 * "há 3 horas", "ontem 14:20", "14/08 09:30" — o jeito que se lê uma conversa.
 *
 * Hora exata no que é de hoje (é o que decide se ainda dá para responder agora),
 * e data no que é antigo (ali a hora não muda nada).
 */
function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  const hora = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const dias = diasDesde(iso);
  if (dias === 0) return hora;
  if (dias === 1) return `ontem ${hora}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${hora}`;
}

function telBonito(t: string) {
  const d = String(t || "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export default function Contatos() {
  // DUAS ABAS, UMA TELA.
  //
  // "Esperando" é a fila de quem escreveu e ainda não foi atendido — o trabalho
  // do dia. "Conversas" é o histórico de WhatsApp de quem já tem contato com a
  // casa, para ler e responder sem sair daqui.
  //
  // A aba começa em "esperando" de propósito: quem abre esta tela veio ver o
  // que falta, não navegar por conversas.
  const [aba, setAba] = useState<"esperando" | "conversas">("esperando");

  return (
    <>
      <h1 className="text-[22px] font-semibold text-ink">Contatos</h1>
      <p className="mb-4 text-[14px] text-ink-soft">
        Quem escreveu pelo site ou pelo WhatsApp — e a conversa com cada um.
      </p>

      <div className="mb-4 flex gap-2">
        {(["esperando", "conversas"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setAba(v)}
            className={`rounded-lg border px-3 py-2 text-[14px] font-medium transition-colors ${
              aba === v
                ? "border-transparent bg-brand text-sobre"
                : "border-line bg-card text-ink hover:bg-surface"
            }`}
          >
            {v === "esperando" ? "Esperando resposta" : "Conversas"}
          </button>
        ))}
      </div>

      {aba === "esperando" ? <Esperando /> : <Conversas />}
    </>
  );
}

function Esperando() {
  const [pendentes, setPendentes] = useState<Contato[]>([]);
  const [feitos, setFeitos] = useState<any[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [historico, setHistorico] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editando, setEditando] = useState<Record<string, { acao: string; prazo: string }>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/contatos${historico ? "?historico=1" : ""}`)
        .then((x) => x.json());
      if (r?.ok) { setPendentes(r.pendentes || []); setFeitos(r.feitos || []); setResumo(r.resumo); }
    } finally { setCarregando(false); }
  }, [historico]);

  useEffect(() => { carregar(); }, [carregar]);

  async function agir(id: string, acao: string, extra: Record<string, any> = {}) {
    setOcupado(id);
    try {
      const r = await fetch("/api/contatos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao, ...extra }),
      }).then((x) => x.json());
      if (!r?.ok) { alert(r?.erro || "Não consegui salvar."); return; }
      await carregar();
    } finally { setOcupado(null); }
  }

  return (
    <>
      {resumo && (pendentes.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Selo tom="neutro">{resumo.total} esperando</Selo>
          {resumo.atrasados > 0 && (
            <Selo tom="atencao">{resumo.atrasados} sem ninguém ter tentado falar</Selo>
          )}
          {resumo.vencidos > 0 && <Selo tom="atencao">{resumo.vencidos} com prazo vencido</Selo>}
        </div>
      )}

      {carregando && <p className="text-[15px] text-ink-soft">Carregando…</p>}

      {!carregando && !pendentes.length && (
        <Cartao>
          <p className="text-[16px] font-semibold text-positivo">Ninguém esperando. 🌿</p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Todo contato que chegou já foi atendido, convertido ou descartado.
          </p>
        </Cartao>
      )}

      {pendentes.map((c) => {
        const ed = editando[c.id] || { acao: c.proxima_acao || "", prazo: c.proximo_passo || "" };
        const ultima = (c.mensagens || []).slice(-1)[0]?.texto || c.contexto || null;
        const oi = encodeURIComponent(
          `Ola${c.nome ? `, ${c.nome.split(" ")[0]}` : ""}! Aqui e da Zelo & Memoria. ` +
          `Recebi seu contato pelo site e queria entender como posso ajudar com o jazigo da sua familia.`
        );

        return (
          <Cartao key={c.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {c.atrasado && (
                <Selo tom="atencao">
                  <AlertTriangle size={13} /> ninguém tentou falar ainda
                </Selo>
              )}
              {c.vencido && <Selo tom="atencao"><Clock size={13} /> prazo venceu</Selo>}
              <span className="text-[16px] font-medium text-ink">{c.nome || "sem nome"}</span>
              <span className="text-[14px] text-ink-soft">{telBonito(c.telefone)}</span>
            </div>

            <p className="mb-2 text-[13px] text-ink-soft">
              {[
                `chegou ${espera(c.horas_esperando, c.created_at)}`,
                c.origem === "site" ? "pelo site" : c.origem ? `por ${c.origem}` : null,
                c.cemiterio_interesse,
                c.tentativas > 0
                  ? `${c.tentativas} ${c.tentativas === 1 ? "tentativa" : "tentativas"} de falar`
                  : null,
              ].filter(Boolean).join(" · ")}
            </p>

            {/* O QUE A PESSOA ESCREVEU, na íntegra e antes dos botões. É por
                isso que ela escreveu, e ler antes de ligar é a diferença entre
                atender e abordar. */}
            {ultima && (
              <p className="mb-3 rounded-lg bg-surface p-3 text-[15px] leading-relaxed text-ink">
                “{ultima}”
              </p>
            )}

            <div className="mb-3 flex flex-wrap gap-2">
              <a href={`https://wa.me/${c.telefone}?text=${oi}`} target="_blank" rel="noreferrer">
                <Botao tom="principal"><MessageCircle size={16} /> Chamar no WhatsApp</Botao>
              </a>
              <a href={`tel:+${c.telefone}`}>
                <Botao><Phone size={16} /> Ligar</Botao>
              </a>
              {/* "Falei" é o botão que tira o cartão do vermelho. Ele existe
                  separado do WhatsApp porque abrir a conversa não é ter falado. */}
              <Botao disabled={ocupado === c.id} onClick={() => agir(c.id, "tentei")}>
                <Check size={16} /> Marquei que falei
              </Botao>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Campo rotulo="Próxima ação" dica="o que fazer — escrito, para o dia chegar com motivo">
                <Entrada
                  value={ed.acao}
                  placeholder="ex.: mandar orçamento do jazigo da Q1"
                  onChange={(e: any) => setEditando((x) => ({ ...x, [c.id]: { ...ed, acao: e.target.value } }))}
                />
              </Campo>
              <Campo rotulo="Quando">
                <Entrada type="date" value={ed.prazo}
                         onChange={(e: any) => setEditando((x) => ({ ...x, [c.id]: { ...ed, prazo: e.target.value } }))} />
              </Campo>
            </div>

            {(ed.acao !== (c.proxima_acao || "") || ed.prazo !== (c.proximo_passo || "")) && (
              <Botao tom="principal" disabled={ocupado === c.id}
                     onClick={() => agir(c.id, "proxima", { proximaAcao: ed.acao, prazo: ed.prazo })}>
                Salvar próxima ação
              </Botao>
            )}

            {c.proxima_acao && ed.acao === c.proxima_acao && (
              <p className="mt-2 text-[13px] text-ink-soft">
                Combinado: <b>{c.proxima_acao}</b>
                {c.proximo_passo && <> — {c.proximo_passo.slice(8, 10)}/{c.proximo_passo.slice(5, 7)}</>}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              <Botao disabled={ocupado === c.id} onClick={() => agir(c.id, "convertido")}>
                <Check size={16} /> Virou cliente
              </Botao>
              <Botao tom="perigo" disabled={ocupado === c.id}
                     onClick={() => {
                       const m = prompt("Por que este contato não segue? (fica registrado)");
                       if (m === null) return;
                       agir(c.id, "descartar", { motivo: m });
                     }}>
                <X size={16} /> Não era para a gente
              </Botao>
            </div>
          </Cartao>
        );
      })}

      <button
        onClick={() => setHistorico((h) => !h)}
        className="mt-4 text-[14px] text-ink-soft underline decoration-dotted hover:text-brand"
      >
        {historico ? "Esconder o histórico" : "Ver contatos já resolvidos"}
      </button>

      {historico && (
        <div className="mt-3">
          {!feitos.length && <p className="text-[14px] text-ink-soft">Nada no histórico.</p>}
          {feitos.map((f: any) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2 text-[14px]">
              <Selo tom={f.status === "convertido" ? "bom" : "neutro"}>{f.status}</Selo>
              <span className="text-ink">{f.nome || f.nome_wa || "sem nome"}</span>
              <span className="text-ink-soft">{telBonito(f.telefone)}</span>
              <span className="flex-1" />
              <button className="text-ink-soft underline decoration-dotted hover:text-brand"
                      onClick={() => agir(f.id, "reabrir")}>
                voltar para a fila
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

type Fio = {
  chave: string; tipo: "cliente" | "lead"; id: string;
  nome: string; telefone: string | null;
  ultima: string | null; ultimaEm: string | null; ultimoAutor: string | null;
  esperando: boolean; familiaId: string | null;
};

/**
 * AS CONVERSAS — o módulo que estava escondido, de volta só na parte que serve.
 *
 * `/painel/conversas` foi desligada junto com o agente de IA: era uma tela de
 * CRM, com abas de leads, rascunhos e gestão de atendimento. O webhook nunca
 * parou — toda mensagem que chega continua sendo gravada e o áudio continua
 * sendo transcrito. A conversa existia e ninguém conseguia ler.
 *
 * O que volta é a lista de quem já tem contato com a casa, e a caixa de
 * resposta. Nada mais: o CRM continua desligado.
 */
function Conversas() {
  const [fios, setFios] = useState<Fio[]>([]);
  const [resumo, setResumo] = useState<{ total: number; esperando: number } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<Fio | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const q = busca.trim() ? `?q=${encodeURIComponent(busca.trim())}` : "";
      const r = await fetch(`/api/contatos/conversas${q}`).then((x) => x.json());
      if (r?.ok) { setFios(r.fios || []); setResumo(r.resumo || null); }
    } finally { setCarregando(false); }
  }, [busca]);

  useEffect(() => {
    // Espera a digitação parar: buscar a cada tecla numa lista de duzentos é
    // uma consulta por letra.
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  if (aberta) {
    return <Fio1 fio={aberta} aoVoltar={() => { setAberta(null); carregar(); }} />;
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl2 border border-line bg-card px-3">
        <Search size={16} className="flex-shrink-0 text-ink-soft" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar por nome ou telefone"
          className="w-full bg-transparent py-2.5 text-[15px] text-ink outline-none"
        />
      </div>

      {resumo && resumo.esperando > 0 && (
        <p className="mb-3">
          <Selo tom="atencao">{resumo.esperando} esperando resposta</Selo>
        </p>
      )}

      {carregando && <p className="text-[15px] text-ink-soft">Carregando…</p>}

      {!carregando && !fios.length && (
        <Cartao>
          <p className="text-[15px] text-ink-soft">
            {busca
              ? "Ninguém com esse nome ou telefone nas conversas."
              : "Nenhuma conversa ainda. Elas aparecem aqui assim que alguém escrever no WhatsApp da casa."}
          </p>
          {/* A lista só mostra quem JÁ trocou mensagem. Para começar uma
              conversa nova, o caminho é a ficha da família — é lá que está o
              telefone certo e o contexto. Dizer isso evita procurar aqui uma
              pessoa que nunca escreveu e concluir que ela sumiu. */}
          <p className="mt-2 text-[14px] text-ink-soft">
            Aqui aparece só quem já trocou mensagem. Para começar uma conversa
            nova, abra a <a href="/painel/clientes" className="text-brand underline decoration-dotted">ficha da família</a>.
          </p>
        </Cartao>
      )}

      {fios.map((f) => (
        <button
          key={f.chave}
          onClick={() => setAberta(f)}
          className="mb-2 block w-full rounded-xl2 border border-line bg-card p-3 text-left hover:bg-surface"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium text-ink">{f.nome}</span>
            <span className="text-[13px] text-ink-soft">{telBonito(f.telefone || "")}</span>
            {/* Quem ainda não é da casa aparece marcado: a conversa é a mesma,
                mas o que se responde a um lead é outra coisa. */}
            {f.tipo === "lead" && <Selo tom="neutro">ainda não é cliente</Selo>}
            {f.esperando && <Selo tom="atencao">esperando</Selo>}
            <span className="flex-1" />
            {f.ultimaEm && (
              <span className="text-[13px] text-ink-soft">{quando(f.ultimaEm)}</span>
            )}
          </div>
          {f.ultima && (
            <p className="mt-1 truncate text-[14px] text-ink-soft">
              {f.ultimoAutor === "cliente" ? "" : "você: "}{f.ultima}
            </p>
          )}
        </button>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */

type Msg = {
  id: string; minha: boolean; autor: string; texto: string;
  em: string | null; transcrita: boolean; peloCelular: boolean;
};

/** Uma conversa aberta: o histórico e a caixa de resposta. */
function Fio1({ fio, aoVoltar }: { fio: Fio; aoVoltar: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [quem, setQuem] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/contatos/conversa?tipo=${fio.tipo}&id=${fio.id}`)
        .then((x) => x.json());
      if (r?.ok) { setMsgs(r.mensagens || []); setQuem(r.quem || null); }
      else setErro(r?.erro || "Não consegui abrir a conversa.");
    } finally { setCarregando(false); }
  }, [fio.tipo, fio.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch("/api/contatos/conversa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: fio.tipo, id: fio.id, texto: t }),
      }).then((x) => x.json()).catch(() => null);

      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "Não consegui enviar."); return; }
      // A mensagem SAIU mas não entrou no histórico. Dizer isso evita ela mandar
      // de novo achando que não foi.
      if (r.avisoHistorico) {
        setErro("A mensagem foi enviada, mas não consegui gravá-la no histórico. Não mande de novo.");
      }
      setTexto("");
      await carregar();
    } finally { setEnviando(false); }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={aoVoltar}
                className="inline-flex items-center gap-1 text-[14px] text-ink-soft hover:text-brand">
          <ArrowLeft size={16} /> voltar
        </button>
        <span className="text-[16px] font-medium text-ink">{fio.nome}</span>
        <span className="text-[14px] text-ink-soft">{telBonito(fio.telefone || "")}</span>
        {quem?.familiaId && (
          <a href={`/painel/clientes?familiaId=${quem.familiaId}`}
             className="text-[14px] text-brand underline decoration-dotted">
            ver a família
          </a>
        )}
      </div>

      <Cartao>
        {carregando && <p className="text-[15px] text-ink-soft">Carregando…</p>}
        {!carregando && !msgs.length && (
          <p className="text-[15px] text-ink-soft">Nenhuma mensagem guardada nesta conversa.</p>
        )}

        {(msgs || []).map((m) => (
          <div key={m.id} className={`mb-2 flex ${m.minha ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl2 px-3 py-2 text-[15px] leading-relaxed ${
              m.minha ? "bg-brand text-sobre" : "border border-line bg-surface text-ink"}`}>
              <p className="whitespace-pre-wrap">{m.texto}</p>
              <p className={`mt-1 text-[11px] ${m.minha ? "opacity-75" : "text-ink-soft"}`}>
                {quando(m.em)}
                {/* De onde veio importa na leitura: o áudio transcrito não é o
                    que a pessoa digitou, e o que saiu do celular dela não passou
                    por esta tela. */}
                {m.transcrita && " · áudio transcrito"}
                {m.peloCelular && " · mandada do seu celular"}
                {m.autor === "ia" && " · resposta automática (da época do robô)"}
                {m.autor === "campo" && " · do app de campo"}
              </p>
            </div>
          </div>
        ))}
      </Cartao>

      <div className="mt-3">
        <textarea
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Escrever para ${fio.nome.split(" ")[0]}…`}
          className="w-full rounded-lg border border-line bg-card p-3 text-[15px] leading-relaxed text-ink focus:border-brand focus:outline-none"
        />
        {erro && <p className="mt-1 text-[13px] text-perigo">{erro}</p>}
        <div className="mt-2 flex items-center gap-2">
          <Botao tom="principal" disabled={enviando || !texto.trim()} onClick={enviar}>
            <Send size={16} /> {enviando ? "Enviando…" : "Enviar no WhatsApp"}
          </Botao>
          <span className="text-[13px] text-ink-soft">
            Sai do WhatsApp da casa. Nada é enviado sozinho.
          </span>
        </div>
      </div>
    </>
  );
}
