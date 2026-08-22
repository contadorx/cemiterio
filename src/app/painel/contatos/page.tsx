"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Phone, Check, X, Clock, AlertTriangle } from "lucide-react";
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

function telBonito(t: string) {
  const d = String(t || "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export default function Contatos() {
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
      <h1 className="text-[22px] font-semibold text-ink">Contatos</h1>
      <p className="mb-4 text-[14px] text-ink-soft">
        Quem escreveu pelo site e ainda espera resposta.
      </p>

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
