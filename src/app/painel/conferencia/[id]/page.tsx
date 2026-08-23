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
  const [valores, setValores] = useState<Record<string, string>>({});
  const [datas, setDatas] = useState<Record<string, any>>({});
  const [lancando, setLancando] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setErro("");
    // UMA CHAMADA SÓ. Quem abre esta tela veio corrigir, e uma tela que carrega
    // em pedaços faz a pessoa corrigir o que apareceu primeiro e ir embora
    // antes do resto aparecer.
    const r = await fetch(`/api/familias/${id}/ficha`).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setErro(r?.erro || "não deu para carregar"); return; }
    setD(r);
    setItens(r.conferencia || []);
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

  /** Corrige o que a conferência cobra e não é pessoa: valor e datas. */
  async function corrigir(corpo: any, chave: string) {
    setOcupado(chave);
    try {
      const r = await fetch(`/api/familias/${id}/ficha`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "não consegui salvar"); return; }
      await carregar();
    } finally { setOcupado(null); }
  }

  /** Lança a lavagem que aconteceu e não virou dinheiro. */
  async function lancar(servicoId: string, sugerido: number | null) {
    const valor = Number(String(lancando[servicoId] ?? sugerido ?? "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) { alert("Informe o valor da lavagem."); return; }
    if (!confirm(`Lançar R$ ${valor.toFixed(2)} desta lavagem?\n\nEntra na competência do dia em que ela foi feita.`)) return;
    setOcupado(servicoId);
    try {
      const r = await fetch("/api/relatorio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servicoId, valor }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "não consegui lançar"); return; }
      alert(r.mensagem);
      await carregar();
    } finally { setOcupado(null); }
  }

  const dinheiro = (v: any) =>
    Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = (iso: string | null) =>
    iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  const mes = (iso: string | null) =>
    iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "—";

  const ROTULO_CANAL: Record<string, string> = {
    campo: "campo", manual_adm: "painel", automatico: "automático",
    importacao: "importado", "nao marcado": "sem canal",
  };

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

      {/* O TÍTULO, escrito por extenso.
          "ALCANTARA — CLECIA" economiza duas palavras e custa a certeza: quem
          lê rápido não sabe se o segundo nome é o responsável, o falecido ou
          outra família. Dizer o que cada nome é resolve, e o espaço existe. */}
      <h1 className="text-[22px] font-semibold text-ink">
        (Família - {d.familia.nome}){" "}
        {d.familia.responsavel
          ? <>(Responsável - {d.familia.responsavel})</>
          : <span className="text-aviso">(Responsável - não definido)</span>}
      </h1>
      {d.saldo && (
        <p className="mb-3 text-[14px] text-ink-soft">
          Saldo da família:{" "}
          <b className={Number(d.saldo.valor) < 0 ? "text-perigo" : "text-positivo"}>
            {Number(d.saldo.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </b>
          {Number(d.saldo.valor) < 0 ? " em aberto" : Number(d.saldo.valor) > 0 ? " adiantado" : ""}
        </p>
      )}

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
              <span className="flex flex-shrink-0 flex-wrap items-center gap-2">
                {/* O VALOR SE CORRIGE AQUI. Era um link para a tela de jazigos,
                    de onde não se volta para a conferência — e o valor é a
                    pendência mais comum. Um campo resolve. */}
                <span className="flex items-center gap-1">
                  <span className="text-[13px] text-ink-soft">R$</span>
                  <input
                    value={valores[j.id] ?? (j.valor != null ? String(j.valor) : "")}
                    onChange={(e) => setValores({ ...valores, [j.id]: e.target.value })}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="w-24 rounded-lg border border-line bg-card px-2 py-1 text-[14px] text-ink"
                  />
                  <Botao tom="secundario" disabled={ocupado === j.id}
                         onClick={() => corrigir(
                           { jazigoId: j.id, valor: Number(String(valores[j.id] ?? j.valor ?? "").replace(",", ".")) },
                           j.id)}>
                    Salvar
                  </Botao>
                </span>
                {!(Number(j.valor) > 0) && <Selo tom="atencao">sem valor</Selo>}
                {!j.completo && <Selo tom="atencao">falta quadra ou identificação</Selo>}
                <Link href="/painel/jazigos" className="text-[13px] underline text-ink-soft">
                  abrir no cadastro
                </Link>
              </span>
            </div>
          ))
        )}
      </Cartao>

      {/* ------------------------------------------------------- O PLANO
          Só aparece com contrato: avulso não usa plano, e mostrar um bloco
          vazio de plano numa família avulsa é convidar a criar um. */}
      {d.familia.regime === "contrato" && (
        <Cartao>
          <h2 className="mb-1 text-[16px] font-medium text-ink">Plano</h2>
          {(d.planos || []).length === 0 ? (
            <p className="text-[14px] text-aviso">
              Família com contrato e sem plano ativo — não vai gerar nem cobrança nem agenda.{" "}
              <Link href="/painel/clientes" className="underline">criar o plano</Link>
            </p>
          ) : (
            (d.planos || []).map((p: any) => (
              <div key={p.id} className="border-b border-line py-3 last:border-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[15px] text-ink">
                    {p.cadencia}{p.qtdPorPassagem > 1 ? ` · ${p.qtdPorPassagem}x por passagem` : ""}
                  </span>
                  {p.valor != null && <Selo tom="neutro">{dinheiro(p.valor)}</Selo>}
                  {!p.ativo && <Selo tom="neutro">inativo</Selo>}
                  {p.semData && <Selo tom="atencao">falta data</Selo>}
                </div>
                {/* AS DUAS DATAS QUE A CONFERÊNCIA COBRA. Sem elas o plano
                    existe e não faz nada: nem cobra, nem entra na agenda. */}
                <div className="flex flex-wrap items-end gap-2">
                  <Campo rotulo="Próxima cobrança">
                    <input type="date"
                           value={datas[p.id]?.cob ?? (p.proximaCobranca || "")}
                           onChange={(e) => setDatas({ ...datas, [p.id]: { ...datas[p.id], cob: e.target.value } })}
                           className="rounded-lg border border-line bg-card px-2 py-1.5 text-[14px] text-ink" />
                  </Campo>
                  <Campo rotulo="Próximo serviço">
                    <input type="date"
                           value={datas[p.id]?.serv ?? (p.proximoServico || "")}
                           onChange={(e) => setDatas({ ...datas, [p.id]: { ...datas[p.id], serv: e.target.value } })}
                           className="rounded-lg border border-line bg-card px-2 py-1.5 text-[14px] text-ink" />
                  </Campo>
                  <Botao tom="secundario" disabled={ocupado === p.id}
                         onClick={() => corrigir({
                           planoId: p.id,
                           proximaCobranca: datas[p.id]?.cob ?? (p.proximaCobranca || ""),
                           proximoServico: datas[p.id]?.serv ?? (p.proximoServico || ""),
                         }, p.id)}>
                    Salvar as datas
                  </Botao>
                </div>
              </div>
            ))
          )}
        </Cartao>
      )}

      {/* ------------------------------- A LAVAGEM QUE NÃO VIROU DINHEIRO
          Fica ANTES do extrato porque é o que está errado. No extrato ela
          não aparece — é justamente isso que a torna invisível: um serviço
          que aconteceu e não deixou linha nenhuma no razão. */}
      {(d.semCobranca || []).length > 0 && (
        <Cartao>
          <h2 className="mb-1 text-[16px] font-medium text-perigo">
            {d.semCobranca.length} lavagem(ns) sem cobrança
          </h2>
          <p className="mb-3 text-[13px] text-ink-soft">
            A limpeza aconteceu e nenhum lançamento foi feito. Não há erro em lugar
            nenhum: o serviço foi marcado como executado sem valor, e o dinheiro
            simplesmente não existiu. O valor sugerido é o do jazigo — confirme ou troque.
          </p>
          {(d.semCobranca || []).map((l: any) => (
            <div key={l.servico_id}
                 className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
              <span className="min-w-0">
                <span className="text-[15px] text-ink">{l.jazigo}</span>
                <span className="block text-[13px] text-ink-soft">
                  lavada em {dia(l.dia)} · competência {mes(l.competencia)} ·
                  registrada pelo {ROTULO_CANAL[l.canal] || l.canal}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-2">
                <span className="text-[13px] text-ink-soft">R$</span>
                <input
                  value={lancando[l.servico_id] ?? (l.valor_sugerido != null ? String(l.valor_sugerido) : "")}
                  onChange={(e) => setLancando({ ...lancando, [l.servico_id]: e.target.value })}
                  inputMode="decimal"
                  className="w-24 rounded-lg border border-line bg-card px-2 py-1 text-[14px] text-ink"
                />
                <Botao tom="principal" disabled={ocupado === l.servico_id}
                       onClick={() => lancar(l.servico_id, l.valor_sugerido)}>
                  Lançar
                </Botao>
              </span>
            </div>
          ))}
        </Cartao>
      )}

      {/* --------------------------------------------------- O EXTRATO
          Competência, origem e canal em cada linha: é com essas três que
          se confere. E o ok fica no evento, não numa lista à parte. */}
      <Cartao>
        <h2 className="mb-1 text-[16px] font-medium text-ink">Eventos desta família</h2>
        <p className="mb-3 text-[13px] text-ink-soft">
          Por competência, com a porta por onde cada registro entrou.
        </p>
        {(d.eventos || []).length === 0 ? (
          <p className="text-[14px] text-ink-soft">Nenhum lançamento ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th className="py-2 pr-3">competência</th>
                  <th className="py-2 pr-3">data</th>
                  <th className="py-2 pr-3">origem</th>
                  <th className="py-2 pr-3">canal</th>
                  <th className="py-2 pr-3">jazigo</th>
                  <th className="py-2 pr-3 text-right">valor</th>
                  <th className="py-2 pr-3">ok</th>
                </tr>
              </thead>
              <tbody>
                {(d.eventos || []).map((e: any) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-ink">{mes(e.competencia)}</td>
                    <td className="py-2 pr-3 text-ink-soft">{dia(e.data)}</td>
                    <td className="py-2 pr-3 text-ink-soft">
                      {e.origem}{e.e_estorno ? " (estorno)" : ""}
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">{ROTULO_CANAL[e.canal] || e.canal}</td>
                    <td className="py-2 pr-3 text-ink-soft">{e.jazigo || "—"}</td>
                    <td className={`py-2 pr-3 text-right ${
                      Number(e.valor_com_sinal) < 0 ? "text-perigo" : "text-positivo"}`}>
                      {dinheiro(e.valor_com_sinal)}
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        onClick={async () => {
                          await fetch("/api/relatorio", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ lancamentoId: e.id, ok: !e.conferido_em }),
                          });
                          carregar();
                        }}
                        className={e.conferido_em ? "text-positivo" : "text-ink-soft underline"}>
                        {e.conferido_em ? "✓ conferido" : "dar ok"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <div className="mb-8"><Voltar /></div>
    </>
  );
}
