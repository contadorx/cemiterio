"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../ui";

interface Cli {
  id: string;
  nome: string;
  telefone: string;
  modo: string;
  score: number;
  ativo_ia: boolean;
}

export default function Clientes() {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ busca: "", quadra: "", rua: "", cadencia: "", situacao: "",
                               regua: "", venceEm: "", ordem: "nome", teste: false });
  const [quadras, setQuadras] = useState<any[]>([]);
  const [abrindo, setAbrindo] = useState(false);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (k === "teste") { if (v) p.set("teste", "1"); }
      else if (v) p.set(k, String(v));
    });
    const r = await fetch(`/api/clientes?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }, [f]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    fetch("/api/quadras").then((x) => x.json()).then((r) => r.ok && setQuadras(r.quadras)).catch(() => {});
  }, []);

  const ruas = d ? [...new Set(d.clientes.flatMap((c: any) => c.ruas))].sort() : [];
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/clientes" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Famílias</h1>

        <div style={{ ...painel.card, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...painel.input, flex: 1, minWidth: 180 }} value={f.busca}
                   onChange={(e) => setF({ ...f, busca: e.target.value })}
                   placeholder="Buscar por nome, telefone ou jazigo…" />
            <select style={{ ...painel.input, width: "auto" }} value={f.situacao}
                    onChange={(e) => setF({ ...f, situacao: e.target.value })}>
              <option value="">Todas as situações</option>
              <option value="atrasados">Em aberto (devendo)</option>
              <option value="em_dia">Em dia</option>
              <option value="adiantados">Adiantados</option>
              <option value="automatico">IA no automático</option>
              <option value="ia_desligada">IA desligada</option>
              <option value="sem_telefone">Sem telefone</option>
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.quadra}
                    onChange={(e) => setF({ ...f, quadra: e.target.value, rua: "" })}>
              <option value="">Todas as quadras</option>
              {quadras.map((q) => <option key={q.id} value={q.codigo}>{q.codigo}</option>)}
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.rua}
                    onChange={(e) => setF({ ...f, rua: e.target.value })}>
              <option value="">Todas as ruas</option>
              {ruas.map((r: any) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.cadencia}
                    onChange={(e) => setF({ ...f, cadencia: e.target.value })}>
              <option value="">Toda periodicidade</option>
              {["mensal","bimestral","trimestral","semestral","anual","avulso"].map((c) =>
                <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.venceEm}
                    onChange={(e) => setF({ ...f, venceEm: e.target.value })}>
              <option value="">Qualquer vencimento</option>
              <option value="7">Vence em 7 dias</option>
              <option value="15">Vence em 15 dias</option>
              <option value="30">Vence em 30 dias</option>
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.ordem}
                    onChange={(e) => setF({ ...f, ordem: e.target.value })}>
              <option value="nome">Ordenar por nome</option>
              <option value="saldo">Quem deve mais</option>
              <option value="valor">Maior valor mensal</option>
              <option value="lavagem">Próxima lavagem</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: cor.cinza }}>
              <input type="checkbox" checked={f.teste}
                     onChange={(e) => setF({ ...f, teste: e.target.checked })} /> teste
            </label>
            <button style={painel.botaoSec}
                    onClick={() => setF({ busca: "", quadra: "", rua: "", cadencia: "", situacao: "",
                                          regua: "", venceEm: "", ordem: "nome", teste: false })}>
              Limpar
            </button>
          </div>
        </div>

        {d && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, color: cor.cinza, fontSize: 14 }}>
            <span><b style={{ color: cor.navy }}>{d.totais.quantidade}</b> famílias</span>
            <span><b style={{ color: cor.navy }}>{money(d.totais.mensal)}</b> por mês</span>
            <span><b style={{ color: d.totais.atrasados ? "#dc2626" : cor.teal }}>
              {d.totais.atrasados}</b> em aberto ({money(d.totais.emAberto)})</span>
            <button style={{ ...painel.botaoSec, marginLeft: "auto" }} onClick={() => setAbrindo(!abrindo)}>
              {abrindo ? "Fechar" : "+ Nova família / importar"}
            </button>
          </div>
        )}

        {abrindo && <Importar onPronto={() => { setAbrindo(false); carregar(); }} />}

        {!d && <p style={{ color: cor.cinza }}>Carregando…</p>}
        {d && d.clientes.length === 0 && (
          <div style={painel.card}><p style={{ color: cor.cinza, margin: 0 }}>Nenhuma família com esses filtros.</p></div>
        )}

        {d && d.clientes.map((c: any) => (
          <Link key={c.id} href={`/painel/clientes/${c.id}`} style={{ textDecoration: "none" }}>
            <div style={{ ...painel.card, borderLeft: c.atrasado ? "4px solid #dc2626" : `1px solid ${cor.linha}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong style={{ color: cor.navy, fontSize: 16 }}>{c.nome}</strong>
                  <div style={{ fontSize: 13, color: cor.cinza, marginTop: 3 }}>
                    {c.jazigos.map((j: any) => `${j.id}${j.quadra ? ` (${j.quadra}${j.rua ? " · " + j.rua : ""})` : ""}`).join(" + ") || "sem jazigo"}
                  </div>
                  <div style={{ fontSize: 13, color: cor.cinza, marginTop: 3 }}>
                    {c.cadencias.join(", ") || "sem plano"}
                    {c.mensal > 0 && ` · ${money(c.mensal)}/mês`}
                    {c.modo === "automatico" && " · IA automática"}
                    {!c.ativo_ia && " · IA desligada"}
                    {c.proximaLavagem && ` · lava em ${new Date(c.proximaLavagem + "T12:00:00").toLocaleDateString("pt-BR")}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <b style={{ color: c.atrasado ? "#dc2626" : c.saldo > 0 ? cor.teal : cor.cinza, fontSize: 16 }}>
                    {c.saldo === 0 ? "em dia" : money(Math.abs(c.saldo))}
                  </b>
                  <div style={{ fontSize: 12, color: cor.cinza }}>
                    {c.atrasado ? "em aberto" : c.saldo > 0 ? "de crédito" : ""}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}


function Importar({ onPronto }: { onPronto: () => void }) {
  const [modo, setModo] = useState<"nova" | "csv">("nova");
  const [f, setF] = useState({
    nome: "", telefone: "", tratamento: "a senhora", jazigo: "", quadraId: "", rua: "",
    cadencia: "mensal", valorMensal: 40, consentimento: false,
  });
  const [quadras, setQuadras] = useState<any[]>([]);
  const [csv, setCsv] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    fetch("/api/quadras").then((x) => x.json()).then((r) => r.ok && setQuadras(r.quadras)).catch(() => {});
  }, []);

  async function criar() {
    if (!f.nome.trim() || !f.telefone.trim()) return alert("Nome e telefone são obrigatórios.");
    setOcupado(true);
    const r = await fetch("/api/clientes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) onPronto();
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function importar() {
    if (!csv.trim()) return;
    setOcupado(true);
    const r = await fetch("/api/tumulos/importar", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) { alert(`${r.criados || 0} linha(s) importada(s).`); onPronto(); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  return (
    <div style={painel.card}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={modo === "nova" ? painel.botao : painel.botaoSec} onClick={() => setModo("nova")}>
          Nova família
        </button>
        <button style={modo === "csv" ? painel.botao : painel.botaoSec} onClick={() => setModo("csv")}>
          Importar planilha
        </button>
      </div>

      {modo === "nova" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={painel.rotulo}>Nome da família</label>
              <input style={painel.input} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
            </div>
            <div>
              <label style={painel.rotulo}>WhatsApp</label>
              <input style={{ ...painel.input, width: 170 }} value={f.telefone}
                     onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="11 99999-9999" />
            </div>
            <div>
              <label style={painel.rotulo}>Tratamento</label>
              <select style={{ ...painel.input, width: 130 }} value={f.tratamento}
                      onChange={(e) => setF({ ...f, tratamento: e.target.value })}>
                <option value="a senhora">a senhora</option>
                <option value="o senhor">o senhor</option>
                <option value="a Dra">a Dra</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={painel.rotulo}>Jazigo</label>
              <input style={painel.input} value={f.jazigo} onChange={(e) => setF({ ...f, jazigo: e.target.value })}
                     placeholder="Família SILVA" />
            </div>
            <div>
              <label style={painel.rotulo}>Quadra</label>
              <select style={{ ...painel.input, width: 120 }} value={f.quadraId}
                      onChange={(e) => setF({ ...f, quadraId: e.target.value })}>
                <option value="">—</option>
                {quadras.map((q) => <option key={q.id} value={q.id}>{q.codigo}</option>)}
              </select>
            </div>
            <div>
              <label style={painel.rotulo}>Rua</label>
              <input style={{ ...painel.input, width: 100 }} value={f.rua}
                     onChange={(e) => setF({ ...f, rua: e.target.value })} placeholder="RUA 1" />
            </div>
            <div>
              <label style={painel.rotulo}>Periodicidade</label>
              <select style={{ ...painel.input, width: 130 }} value={f.cadencia}
                      onChange={(e) => setF({ ...f, cadencia: e.target.value })}>
                {["mensal","bimestral","trimestral","semestral","anual","avulso"].map((c) =>
                  <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={painel.rotulo}>Valor mensal</label>
              <input type="number" style={{ ...painel.input, width: 110 }} value={f.valorMensal}
                     onChange={(e) => setF({ ...f, valorMensal: Number(e.target.value) })} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, margin: "12px 0" }}>
            <input type="checkbox" checked={f.consentimento}
                   onChange={(e) => setF({ ...f, consentimento: e.target.checked })} />
            A família autorizou o contato por WhatsApp (LGPD)
          </label>
          <button style={painel.botao} onClick={criar} disabled={ocupado}>
            {ocupado ? "…" : "Cadastrar família"}
          </button>
        </>
      )}

      {modo === "csv" && (
        <>
          <label style={painel.rotulo}>
            Cole as linhas (nome; telefone; jazigo; quadra; rua; periodicidade; valor mensal)
          </label>
          <textarea style={{ ...painel.input, minHeight: 140, fontFamily: "monospace", fontSize: 13 }}
                    value={csv} onChange={(e) => setCsv(e.target.value)}
                    placeholder={"MARIA SILVA;11999998888;Família SILVA;QD 1;RUA 2;mensal;40"} />
          <button style={{ ...painel.botao, marginTop: 10 }} onClick={importar} disabled={ocupado}>
            {ocupado ? "Importando…" : "Importar"}
          </button>
        </>
      )}
    </div>
  );
}
