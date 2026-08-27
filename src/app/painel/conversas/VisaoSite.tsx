"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Phone, Check, X, Clock, AlertTriangle, Send, ArrowLeft, Search } from "lucide-react";
import { Cartao, Botao, Selo, Campo, Entrada } from "../pecas";
import { diasDesde, faz } from "@/lib/datas";
import { primeiroNome } from "@/lib/mensagens";
import { useConfirmar, useRecado } from "@/components/Dialogos";

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

export default function VisaoSite() {
  const recado = useRecado();
  const perguntar = useConfirmar();
  const [pendentes, setPendentes] = useState<Contato[]>([]);
  const [feitos, setFeitos] = useState<any[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [historico, setHistorico] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editando, setEditando] = useState<Record<string, { acao: string; prazo: string }>>({});

  /**
   * VIRAR CONTATO DE UMA FAMÍLIA.
   *
   * "Virou cliente" só carimbava `status = 'convertido'` no lead: não criava
   * família, nem contato, nem conversa. Medido em 24/08: 108 de 112 contatos
   * do site com `cliente_id` nulo — a ponte nunca existiu, e por isso não
   * havia como responder "de cada dez contatos, quantos viraram cliente?".
   *
   * O painel abre DENTRO do cartão, com o nome e o telefone já preenchidos do
   * que a pessoa escreveu no site. Buscar a família é opcional: sem escolha,
   * nasce uma nova com o nome do contato — que é o caso comum de quem chega
   * pelo site.
   */
  const [virando, setVirando] = useState<string | null>(null);
  const [form, setForm] = useState<{
    nome: string; telefone: string; nomeFamilia: string;
    familiaId: string; familiaNome: string; busca: string;
  }>({ nome: "", telefone: "", nomeFamilia: "", familiaId: "", familiaNome: "", busca: "" });
  const [achadas, setAchadas] = useState<{ id: string; nome: string; responsavel: string | null }[]>([]);
  const [feito, setFeito] = useState<
    { id: string; familiaId: string; conversaId: string | null; familiaCriada: boolean } | null
  >(null);

  function abrirConversao(c: Contato) {
    setFeito(null);
    setAchadas([]);
    setVirando(c.id);
    const nome = (c.nome || "").trim();
    setForm({
      nome, telefone: c.telefone || "",
      // Sobrenome como nome de família é o palpite que acerta na maioria e
      // não atrapalha em nenhuma: é um campo editável, não uma decisão.
      nomeFamilia: nome.includes(" ") ? `Família ${nome.split(" ").slice(-1)[0]}` : nome,
      familiaId: "", familiaNome: "", busca: "",
    });
  }

  async function buscarFamilias(q: string) {
    setForm((x) => ({ ...x, busca: q }));
    if (q.trim().length < 2) { setAchadas([]); return; }
    const r = await fetch(`/api/familias?q=${encodeURIComponent(q.trim())}`)
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) setAchadas((r.familias || []).slice(0, 8));
  }

  async function converter(id: string) {
    setOcupado(id);
    try {
      const r = await fetch("/api/contatos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id, acao: "virar_familia",
          nome: form.nome, telefone: form.telefone,
          ...(form.familiaId ? { familiaId: form.familiaId } : { nomeFamilia: form.nomeFamilia }),
        }),
      }).then((x) => x.json());
      if (!r?.ok) {
        // A recusa por telefone repetido diz ONDE a pessoa já está — é a
        // resposta útil, e vale mais que "erro ao salvar".
        recado.erro(r?.mensagem || r?.erro || "Não consegui converter.");
        return;
      }
      setFeito({ id, familiaId: r.familiaId, conversaId: r.conversaId, familiaCriada: r.familiaCriada });
      setVirando(null);
      await carregar();
    } finally { setOcupado(null); }
  }

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
      if (!r?.ok) { recado.erro(r?.erro || "Não consegui salvar."); return; }
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
          `Ola${c.nome ? `, ${primeiroNome(c.nome)}` : ""}! Aqui e da Zelo & Memoria. ` +
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

            {/* DEPOIS DE CONVERTER, O CAMINHO. Um "pronto" sem para onde ir
                obriga a pessoa a procurar a família no menu — e é aí que o
                assunto se perde. */}
            {feito?.id === c.id && (
              <div className="mt-3 rounded-xl2 border border-bom/30 bg-bom/10 p-3 text-[14px]">
                <b>Pronto.</b>{" "}
                {feito.familiaCriada ? "A família foi criada e o" : "O"} contato entrou nela.{" "}
                <a className="underline" href={`/painel/clientes/${feito.familiaId}`}>abrir a ficha</a>
                {feito.conversaId ? (
                  <> · <a className="underline" href={`/painel/conversas/${feito.conversaId}`}>
                    ir para a conversa
                  </a></>
                ) : (
                  <> · a conversa não abriu agora; ela nasce sozinha na primeira mensagem.</>
                )}
              </div>
            )}

            {virando === c.id && (
              <div className="mt-3 rounded-xl2 border border-line bg-surface p-3">
                <p className="mb-2 text-[14px] text-ink-soft">
                  O contato passa a ser gente de uma família, e o assunto continua
                  na aba <b>Conversas</b>.
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Campo rotulo="Nome do contato">
                    <Entrada value={form.nome}
                             onChange={(e: any) => setForm((x) => ({ ...x, nome: e.target.value }))} />
                  </Campo>
                  <Campo rotulo="Telefone">
                    <Entrada value={form.telefone}
                             onChange={(e: any) => setForm((x) => ({ ...x, telefone: e.target.value }))} />
                  </Campo>
                </div>

                <Campo rotulo="Procurar uma família que já existe">
                  <Entrada placeholder="digite parte do nome…" value={form.busca}
                           onChange={(e: any) => buscarFamilias(e.target.value)} />
                </Campo>

                {achadas.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {achadas.map((f) => (
                      <button key={f.id}
                        className={`rounded-full border px-3 py-1 text-[13px] ${
                          form.familiaId === f.id
                            ? "border-ouro bg-ouro/10 text-ink"
                            : "border-line text-ink-soft"}`}
                        onClick={() => setForm((x) => ({
                          ...x,
                          familiaId: x.familiaId === f.id ? "" : f.id,
                          familiaNome: x.familiaId === f.id ? "" : f.nome,
                        }))}>
                        {f.nome}{f.responsavel ? ` · ${f.responsavel}` : ""}
                      </button>
                    ))}
                  </div>
                )}

                {/* SEM FAMÍLIA ESCOLHIDA, NASCE UMA. O campo fica à vista para
                    ninguém descobrir depois que criou "Família João" sem
                    querer. */}
                {!form.familiaId && (
                  <Campo rotulo="…ou criar uma família nova com este nome">
                    <Entrada value={form.nomeFamilia}
                             onChange={(e: any) => setForm((x) => ({ ...x, nomeFamilia: e.target.value }))} />
                  </Campo>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  <Botao tom="principal" disabled={ocupado === c.id || !form.nome.trim()}
                         onClick={() => converter(c.id)}>
                    <Send size={16} />{" "}
                    {form.familiaId
                      ? `Pôr em ${form.familiaNome}`
                      : "Criar a família e o contato"}
                  </Botao>
                  <Botao onClick={() => setVirando(null)}>
                    <ArrowLeft size={16} /> Cancelar
                  </Botao>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              <Botao tom="principal" disabled={ocupado === c.id}
                     onClick={() => abrirConversao(c)}>
                <Check size={16} /> Virar contato de uma família
              </Botao>
              {/* O BOTÃO ANTIGO CHAMAVA-SE "Virou cliente" E NÃO CRIAVA
                  CLIENTE NENHUM — só carimbava o status do lead. O rótulo
                  agora diz o que ele de fato faz: tira da fila. Serve para
                  quem JÁ está cadastrado e só precisa sair daqui. */}
              <Botao disabled={ocupado === c.id} onClick={() => agir(c.id, "convertido")}>
                Já é cliente — só tirar da fila
              </Botao>
              <Botao tom="perigo" disabled={ocupado === c.id}
                     onClick={async () => {
                       const r0 = await perguntar({
                         oQue: "Por que este contato não segue?",
                         efeito: "Fica registrado, para você enxergar o padrão depois.",
                         confirmar: "Registrar",
                         pedirMotivo: "O que houve?",
                       });
                       const m = !r0 || r0 === true ? null : r0.motivo;
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
