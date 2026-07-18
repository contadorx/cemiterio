"use client";

import { useEffect, useState } from "react";
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
  const [itens, setItens] = useState<Cli[]>([]);
  const [novo, setNovo] = useState(false);

  async function carregar() {
    const r = await fetch("/api/clientes").then((x) => x.json());
    if (r.ok) setItens(r.clientes);
  }
  useEffect(() => {
    carregar();
  }, []);

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/clientes" />
      <div style={painel.conteudo}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={painel.h1}>Clientes</h1>
          <button style={painel.botao} onClick={() => setNovo(true)}>
            + Novo cliente
          </button>
        </div>

        {novo && <NovoCliente onFechar={() => setNovo(false)} onCriado={() => { setNovo(false); carregar(); }} />}

        {itens.map((c) => (
          <Link key={c.id} href={`/painel/clientes/${c.id}`} style={{ ...painel.card, display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none" }}>
            <div>
              <div style={{ fontWeight: 700, color: cor.navy }}>{c.nome}</div>
              <div style={{ fontSize: 14, color: cor.cinza }}>{c.telefone}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: c.modo === "automatico" ? "#dcfce7" : "#e2e8f0", color: c.modo === "automatico" ? "#166534" : cor.cinza }}>
                {c.modo}
              </span>
              <div style={{ fontSize: 13, color: cor.cinza, marginTop: 4 }}>score {Math.round(c.score)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NovoCliente({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const [f, setF] = useState<any>({ nome: "", telefone: "", quadra: "", tumulo: "", falecido: "", cadencia: "mensal", qtd: 1, valor: 40 });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!f.nome || !f.telefone) { setErro("Nome e telefone são obrigatórios."); return; }
    setSalvando(true);
    setErro("");
    const body: any = { nome: f.nome, telefone: f.telefone };
    if (f.tumulo) body.tumulo = { identificacao: f.tumulo, quadraCodigo: f.quadra, falecidoNome: f.falecido };
    if (f.tumulo && f.cadencia) body.plano = { cadencia: f.cadencia, qtdPorPassagem: Number(f.qtd), valorVigente: Number(f.valor) };
    const r = await fetch("/api/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    setSalvando(false);
    if (!r.ok) { setErro("Falha ao salvar."); return; }
    onCriado();
  }

  const campo = (k: string, label: string, tipo = "text") => (
    <div style={{ marginBottom: 10 }}>
      <label style={painel.rotulo}>{label}</label>
      <input style={painel.input} type={tipo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <div style={painel.card}>
      <strong style={{ color: cor.navy }}>Novo cliente</strong>
      <div style={{ marginTop: 12 }}>
        {campo("nome", "Nome")}
        {campo("telefone", "WhatsApp (com DDD)")}
        <div style={{ borderTop: `1px solid ${cor.linha}`, margin: "12px 0", paddingTop: 12 }}>
          <div style={{ color: cor.cinza, fontSize: 13, marginBottom: 8 }}>Primeiro túmulo (opcional)</div>
          {campo("quadra", "Quadra")}
          {campo("tumulo", "Identificação do túmulo")}
          {campo("falecido", "Nome do falecido")}
        </div>
        {f.tumulo && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={painel.rotulo}>Cadência</label>
              <select style={painel.input} value={f.cadencia} onChange={(e) => setF({ ...f, cadencia: e.target.value })}>
                <option value="mensal">mensal</option>
                <option value="bimestral">bimestral</option>
                <option value="trimestral">trimestral</option>
                <option value="semestral">semestral</option>
                <option value="anual">anual</option>
                <option value="avulso">avulso</option>
              </select>
            </div>
            <div style={{ width: 90 }}>
              <label style={painel.rotulo}>Qtd/vez</label>
              <input style={painel.input} type="number" value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value })} />
            </div>
            <div style={{ width: 110 }}>
              <label style={painel.rotulo}>Valor R$</label>
              <input style={painel.input} type="number" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
            </div>
          </div>
        )}
        {erro && <p style={{ color: "#dc2626" }}>{erro}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button style={painel.botao} onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
          <button style={painel.botaoSec} onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
