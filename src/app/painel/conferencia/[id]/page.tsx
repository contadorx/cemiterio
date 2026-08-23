"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Cartao, Botao, Selo, Campo, Entrada } from "../../pecas";

/**
 * A FICHA DA FAMÍLIA, do jeito que a conferência precisa dela.
 *
 * POR QUE UMA TELA NOVA, E NÃO UM LINK PARA A FICHA DO CLIENTE
 * ---------------------------------------------------------------------------
 * A conferência apontava para `/painel/clientes?familiaId=…` — um parâmetro que
 * aquela tela NÃO LÊ. O link abria a lista inteira de famílias, e quem foi
 * corrigir uma pendência tinha de procurar a família de novo, no meio de
 * trezentas. Na prática, o "abrir" não abria nada.
 *
 * Esta tela tem exatamente o que a conferência cobra, e nada além: quem
 * responde, os telefones, as pessoas, o regime de cobrança, o consentimento e
 * os jazigos com o que falta neles. Não é a ficha completa do cliente — é a
 * bancada de conserto, e ela devolve para a conferência quando termina.
 *
 * O caminho de volta está em cima E embaixo: quem corrige três coisas numa
 * ficha longa não vai rolar até o topo para voltar.
 */

interface Contato {
  id: string; nome: string; telefone: string; paga: boolean;
  parentesco: string | null; tratamento: string | null;
  observacoes: string | null; consentimentoEm: string | null;
}
interface Jazigo {
  id: string; identificacao: string; codigo: string | null;
  quadra: string | null; rua: string | null; valor: number | null; completo: boolean;
}

const REGIMES: [string, string, string][] = [
  ["contrato", "Contrato", "cobrança recorrente, com plano e datas"],
  ["avulso", "Avulso", "cada limpeza é pedida e cobrada na hora"],
];

export default function FichaDaConferencia() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");

  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [novo, setNovo] = useState({ nome: "", telefone: "" });
  const [itens, setItens] = useState<any[]>([]);

  const carregar = useCallback(async () => {
    setErro("");
    const [r, c] = await Promise.all([
      fetch(`/api/familias/${id}/contatos`).then((x) => x.json()).catch(() => null),
      fetch(`/api/conferencia?familiaId=${id}`).then((x) => x.json()).catch(() => null),
    ]);
    if (!r?.ok) { setErro(r?.erro || "não deu para carregar"); return; }
    setD(r);
    if (c?.ok) setItens(c.itens || []);
  }, [id]);

  useEffect(() => { if (id) carregar(); }, [id, carregar]);

  async function contato(metodo: "PATCH" | "DELETE", corpo: any) {
    setOcupado(corpo.contatoId || "novo");
    try {
      const url = metodo === "DELETE"
        ? `/api/familias/${id}/contatos?contatoId=${corpo.contatoId}`
        : `/api/familias/${id}/contatos`;
      const r = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: metodo === "DELETE" ? undefined : JSON.stringify(corpo),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "não consegui salvar"); return false; }
      if (r.mensagem) alert(r.mensagem);
      setEditando(null);
      await carregar();
      return true;
    } finally { setOcupado(null); }
  }

  async function adicionar() {
    if (!novo.nome.trim() || !novo.telefone.trim()) return;
    setOcupado("novo");
    try {
      const r = await fetch(`/api/familias/${id}/contatos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "novo", ...novo }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "não consegui adicionar"); return; }
      setNovo({ nome: "", telefone: "" });
      await carregar();
    } finally { setOcupado(null); }
  }

  async function quemPaga(clienteId: string | null) {
    const nome = d.contatos.find((c: Contato) => c.id === clienteId)?.nome;
    if (!confirm(clienteId
      ? `${nome} passa a responder pelo dinheiro desta família?`
      : "Deixar a família SEM responsável pelo dinheiro?\n\nÉ um estado permitido, mas a cobrança não terá para quem ir.")) return;
    setOcupado(clienteId || "sem");
    try {
      const r = await fetch(`/api/familias/${id}/contatos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "quem_paga", clienteId }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "não consegui trocar"); return; }
      await carregar();
    } finally { setOcupado(null); }
  }

  async function definirRegime(regime: string) {
    setOcupado("regime");
    try {
      const r = await fetch("/api/conferencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId: id, regime }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.erro || "não consegui salvar"); return; }
      await carregar();
    } finally { setOcupado(null); }
  }

  const Voltar = () => (
    <Link href="/painel/conferencia" className="text-[14px] underline text-ink-soft">
      ← voltar para a conferência
    </Link>
  );

  if (erro) {
    return (
      <Cartao>
        <p className="text-[15px] text-perigo">Não deu para carregar: {erro}</p>
        <div className="mt-3"><Voltar /></div>
      </Cartao>
    );
  }
  if (!d) return <p className="text-[15px] text-ink-soft">Carregando…</p>;

  const contatos: Contato[] = d.contatos || [];
  const jazigos: Jazigo[] = d.jazigos || [];
  const pendentes = itens.filter((i) => i.situacao === "pendente" && i.obrigatorio);

  return (
    <>
      <div className="mb-2"><Voltar /></div>

      <h1 className="text-[22px] font-semibold text-ink">
        {d.familia.nome}
        {d.familia.responsavelId && (
          <span className="text-ink-soft">
            {" — "}{contatos.find((c) => c.id === d.familia.responsavelId)?.nome}
          </span>
        )}
      </h1>

      {/* O QUE AINDA FALTA, no topo. Quem chegou aqui veio consertar alguma
          coisa — dizer o que é logo evita procurar. */}
      {pendentes.length > 0 ? (
        <Cartao>
          <p className="text-[15px] font-medium text-ink">
            Falta {pendentes.length} {pendentes.length === 1 ? "item" : "itens"} para esta família ficar pronta:
          </p>
          <ul className="mt-2 list-disc pl-5 text-[14px] text-ink-soft">
            {pendentes.map((i) => (
              <li key={i.item}><b className="text-ink">{i.item}</b> — {i.acao}</li>
            ))}
          </ul>
        </Cartao>
      ) : (
        <Cartao>
          <p className="text-[15px] text-positivo">
            <b>Nada obrigatório faltando.</b> Volte para a conferência e dê o ok.
          </p>
        </Cartao>
      )}

      {/* ------------------------------------------------------ AS PESSOAS */}
      <Cartao>
        <h2 className="mb-1 text-[16px] font-medium text-ink">Pessoas desta família</h2>
        <p className="mb-3 text-[13px] text-ink-soft">
          Uma delas responde pelo dinheiro. As outras existem para você ter com quem
          falar quando ela não atende.
        </p>

        {contatos.length === 0 && (
          <p className="mb-3 text-[14px] text-aviso">
            Nenhuma pessoa cadastrada. A família existe sem contato — mas a cobrança
            e as fotos não têm para onde ir.
          </p>
        )}

        {contatos.map((c) => (
          <div key={c.id} className="border-b border-line py-3 last:border-0">
            {editando === c.id ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Campo rotulo="Nome">
                  <Entrada value={form.nome ?? c.nome}
                           onChange={(e: any) => setForm({ ...form, nome: e.target.value })} />
                </Campo>
                <Campo rotulo="Telefone">
                  <Entrada value={form.telefone ?? c.telefone}
                           onChange={(e: any) => setForm({ ...form, telefone: e.target.value })} />
                </Campo>
                <Campo rotulo="Parentesco (filha, neto…)">
                  <Entrada value={form.parentesco ?? (c.parentesco || "")}
                           onChange={(e: any) => setForm({ ...form, parentesco: e.target.value })} />
                </Campo>
                <Campo rotulo="Como tratar (a senhora, o senhor…)">
                  <Entrada value={form.tratamento ?? (c.tratamento || "")}
                           onChange={(e: any) => setForm({ ...form, tratamento: e.target.value })} />
                </Campo>
                <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                  <Botao tom="principal" disabled={ocupado === c.id}
                         onClick={() => contato("PATCH", { contatoId: c.id, ...form })}>
                    Salvar
                  </Botao>
                  <Botao tom="secundario" onClick={() => { setEditando(null); setForm({}); }}>
                    Cancelar
                  </Botao>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="text-[15px] text-ink">{c.nome}</span>
                  {c.paga && <span className="ml-2"><Selo tom="bom">responde pelo dinheiro</Selo></span>}
                  <span className="block text-[13px] text-ink-soft">
                    {[c.telefone, c.parentesco, c.tratamento].filter(Boolean).join(" · ")}
                  </span>
                  <span className="block text-[13px] text-ink-soft">
                    {c.consentimentoEm
                      ? `consentimento em ${new Date(c.consentimentoEm).toLocaleDateString("pt-BR")}`
                      : "consentimento não registrado"}
                  </span>
                </span>
                <span className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <Botao tom="secundario"
                         onClick={() => { setEditando(c.id); setForm({}); }}>Editar</Botao>
                  {!c.consentimentoEm && (
                    <Botao tom="secundario" disabled={ocupado === c.id}
                           onClick={() => contato("PATCH", { contatoId: c.id, consentimento: true })}>
                      Registrar consentimento
                    </Botao>
                  )}
                  {!c.paga && (
                    <Botao tom="secundario" disabled={ocupado === c.id}
                           onClick={() => quemPaga(c.id)}>
                      Passa a responder
                    </Botao>
                  )}
                  {/* EXCLUIR nunca fica ao lado de Editar sem confirmação: numa
                      lista de três pessoas o dedo erra, e a ficha da neta que
                      atende o telefone não se refaz sozinha. */}
                  <Botao tom="perigo" disabled={ocupado === c.id}
                         onClick={() => {
                           if (!confirm(
                             `Remover ${c.nome} desta família?\n\n` +
                             `Os jazigos e o histórico ficam onde estão — sai só a pessoa.`)) return;
                           contato("DELETE", { contatoId: c.id });
                         }}>
                    Remover
                  </Botao>
                </span>
              </div>
            )}
          </div>
        ))}

        {d.familia.responsavelId && (
          <div className="mt-3">
            <button className="text-[13px] underline text-ink-soft"
                    onClick={() => quemPaga(null)}>
              deixar a família sem responsável pelo dinheiro
            </button>
          </div>
        )}

        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[14px] font-medium text-ink">Adicionar pessoa</p>
          <div className="flex flex-wrap items-end gap-2">
            <Campo rotulo="Nome">
              <Entrada value={novo.nome}
                       onChange={(e: any) => setNovo({ ...novo, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Telefone">
              <Entrada value={novo.telefone} placeholder="11 94013-1413"
                       onChange={(e: any) => setNovo({ ...novo, telefone: e.target.value })} />
            </Campo>
            <Botao tom="principal" disabled={ocupado === "novo" || !novo.nome.trim() || !novo.telefone.trim()}
                   onClick={adicionar}>
              Adicionar
            </Botao>
          </div>
        </div>
      </Cartao>

      {/* ------------------------------------------------- COMO SE COBRA */}
      <Cartao>
        <h2 className="mb-1 text-[16px] font-medium text-ink">Como se cobra desta família</h2>
        <p className="mb-3 text-[13px] text-ink-soft">
          As duas valem. O que não vale é não decidir: a lavagem acontece e ninguém
          sabe como lançar.
        </p>
        <div className="flex flex-wrap gap-2">
          {REGIMES.map(([v, rot, expl]) => (
            <button key={v} onClick={() => definirRegime(v)} disabled={ocupado === "regime"}
                    className={`rounded-xl2 border p-3 text-left ${
                      d.familia.regime === v
                        ? "border-brand bg-brand/5"
                        : "border-line bg-card hover:border-brand"}`}>
              <span className="block text-[15px] font-medium text-ink">{rot}</span>
              <span className="block text-[13px] text-ink-soft">{expl}</span>
            </button>
          ))}
        </div>
        {d.familia.regime === "nao_definido" && (
          <p className="mt-2 text-[13px] text-aviso">Ainda não decidido.</p>
        )}
      </Cartao>

      {/* ------------------------------------------------------ OS JAZIGOS */}
      <Cartao>
        <h2 className="mb-1 text-[16px] font-medium text-ink">Jazigos</h2>
        {jazigos.length === 0 ? (
          <p className="text-[14px] text-aviso">
            Nenhum jazigo ligado a esta família.{" "}
            <Link href="/painel/jazigos" className="underline">Ligar um jazigo</Link>
          </p>
        ) : (
          jazigos.map((j) => (
            <div key={j.id}
                 className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
              <span className="min-w-0">
                <span className="text-[15px] text-ink">{j.identificacao || "(sem identificação)"}</span>
                <span className="block text-[13px] text-ink-soft">
                  {[j.quadra, j.rua, j.codigo].filter(Boolean).join(" · ") || "sem quadra"}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-2">
                <Selo tom={Number(j.valor) > 0 ? "bom" : "atencao"}>
                  {Number(j.valor) > 0
                    ? `R$ ${Number(j.valor).toFixed(2)}`
                    : "sem valor de limpeza"}
                </Selo>
                {!j.completo && <Selo tom="atencao">falta quadra ou identificação</Selo>}
                <Link href="/painel/jazigos" className="text-[13px] underline text-ink-soft">
                  corrigir
                </Link>
              </span>
            </div>
          ))
        )}
      </Cartao>

      <div className="mb-8"><Voltar /></div>
    </>
  );
}
