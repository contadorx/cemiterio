"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

export default function Config() {
  const [aba, setAba] = useState<"equipe" | "avaliacoes" | "indicacoes" | "privacidade" | "erros">("equipe");
  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/config" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Configurações</h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {([
            ["equipe", "Equipe"],
            ["avaliacoes", "Avaliações"],
            ["indicacoes", "Indicações"],
            ["privacidade", "Privacidade (LGPD)"],
            ["erros", "Diagnóstico"],
          ] as const).map(([k, label]) => (
            <button key={k} style={aba === k ? painel.botao : painel.botaoSec} onClick={() => setAba(k)}>
              {label}
            </button>
          ))}
        </div>
        {aba === "equipe" && <Equipe />}
        {aba !== "equipe" && <Agregados aba={aba} />}
      </div>
    </div>
  );
}

function Equipe() {
  const [membros, setMembros] = useState<any[]>([]);
  const [form, setForm] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState("campo");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const r = await fetch("/api/membros").then((x) => x.json());
    if (r.ok) setMembros(r.membros);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function criar() {
    setErro("");
    setSalvando(true);
    const r = await fetch("/api/membros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha, papel }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) {
      setForm(false);
      setNome(""); setEmail(""); setSenha(""); setPapel("campo");
      carregar();
    } else setErro(r?.erro || "falha");
  }

  async function remover(userId: string) {
    if (!confirm("Remover este acesso? A conta de login também será apagada.")) return;
    const r = await fetch(`/api/membros/${userId}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.ok) carregar();
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function trocarPapel(userId: string, papel: string) {
    await fetch(`/api/membros/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ papel }),
    });
    carregar();
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button style={painel.botao} onClick={() => setForm(!form)}>{form ? "Fechar" : "+ Novo acesso"}</button>
      </div>

      {form && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Novo acesso (ex.: a Nina, no campo)</strong>
          <div style={{ marginTop: 10 }}>
            <label style={painel.rotulo}>Nome</label>
            <input style={painel.input} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={painel.rotulo}>E-mail (será o login)</label>
            <input style={painel.input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={painel.rotulo}>Senha provisória (mín. 6)</label>
            <input style={painel.input} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={painel.rotulo}>Função</label>
            <select style={{ ...painel.input, width: "auto" }} value={papel} onChange={(e) => setPapel(e.target.value)}>
              <option value="campo">Campo (só o roteiro de limpezas)</option>
              <option value="admin">Administrador (acesso total)</option>
            </select>
          </div>
          {erro && <p style={{ color: "#dc2626", fontSize: 14, marginTop: 8 }}>{erro}</p>}
          <button style={{ ...painel.botao, marginTop: 12 }} onClick={criar} disabled={salvando}>
            {salvando ? "Criando..." : "Criar acesso"}
          </button>
        </div>
      )}

      {membros.map((m) => (
        <div key={m.user_id} style={{ ...painel.card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong style={{ color: cor.navy }}>{m.nome || "(sem nome)"}</strong>
            <div style={{ fontSize: 13, color: cor.cinza }}>{m.papel === "campo" ? "Campo" : "Administrador"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...painel.input, width: "auto", padding: 8 }} value={m.papel} onChange={(e) => trocarPapel(m.user_id, e.target.value)}>
              <option value="campo">Campo</option>
              <option value="admin">Admin</option>
            </select>
            <button style={painel.botaoPerigo} onClick={() => remover(m.user_id)}>Remover</button>
          </div>
        </div>
      ))}
    </>
  );
}

function Agregados({ aba }: { aba: string }) {
  const [d, setD] = useState<any>(null);
  const [aviso, setAviso] = useState("");
  const [ok, setOk] = useState(false);

  async function carregar() {
    const r = await fetch("/api/config/painel").then((x) => x.json());
    setD(r);
    if (r?.ok) setAviso(r.avisoPrivacidade || "");
  }
  useEffect(() => {
    carregar();
  }, []);

  async function salvarAviso() {
    await fetch("/api/config/painel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avisoPrivacidade: aviso }),
    });
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  }

  if (!d?.ok) return <p style={{ color: cor.cinza }}>Carregando...</p>;

  if (aba === "avaliacoes") {
    return (
      <>
        {d.mediaAvaliacoes != null && (
          <div style={painel.card}>
            <div style={{ fontSize: 13, color: cor.cinza }}>Média das avaliações</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: cor.teal }}>
              {Number(d.mediaAvaliacoes).toFixed(1)} ⭐
            </div>
          </div>
        )}
        {d.avaliacoes.length === 0 && <p style={{ color: cor.cinza }}>Nenhuma avaliação ainda.</p>}
        {d.avaliacoes.map((a: any, i: number) => (
          <div key={i} style={painel.card}>
            <div style={{ fontSize: 18 }}>{"⭐".repeat(a.nota)}</div>
            {a.comentario && <p style={{ color: cor.navy, margin: "6px 0 0" }}>&ldquo;{a.comentario}&rdquo;</p>}
            <div style={{ fontSize: 12, color: cor.cinza, marginTop: 4 }}>
              {new Date(a.respondida_em).toLocaleDateString("pt-BR")}
            </div>
          </div>
        ))}
      </>
    );
  }

  if (aba === "indicacoes") {
    return (
      <>
        {d.indicacoes.length === 0 && <p style={{ color: cor.cinza }}>Nenhuma indicação ainda.</p>}
        {d.indicacoes.map((x: any) => (
          <div key={x.id} style={painel.card}>
            <strong style={{ color: cor.navy }}>{x.indicado_nome || "Sem nome"} · {x.indicado_tel || "sem telefone"}</strong>
            <div style={{ fontSize: 13, color: cor.cinza, marginTop: 4 }}>
              Indicado por {x.clientes?.nome || "—"} · {x.status} · {new Date(x.created_at).toLocaleDateString("pt-BR")}
            </div>
          </div>
        ))}
      </>
    );
  }

  if (aba === "privacidade") {
    return (
      <div style={painel.card}>
        <label style={painel.rotulo}>
          Aviso de privacidade (LGPD). Este texto pode ser enviado ao cliente no primeiro contato e
          publicado. A remoção dos dados de um cliente é feita na ficha dele (botão &ldquo;Remover dados&rdquo;).
        </label>
        <textarea
          style={{ ...painel.input, minHeight: 160, resize: "vertical", fontFamily: "inherit" }}
          value={aviso}
          onChange={(e) => setAviso(e.target.value)}
          placeholder={"Ex.: Guardamos seu nome, contato e o histórico de serviços apenas para prestar o atendimento. Não compartilhamos com terceiros. Você pode pedir a remoção dos seus dados a qualquer momento."}
        />
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <button style={painel.botao} onClick={salvarAviso}>Salvar</button>
          {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
        </div>
      </div>
    );
  }

  // erros / diagnóstico
  return (
    <>
      <p style={{ color: cor.cinza, fontSize: 14 }}>Últimos erros registrados pelo sistema (para diagnóstico).</p>
      {d.erros.length === 0 && <p style={{ color: cor.teal }}>Nenhum erro registrado. ✓</p>}
      {d.erros.map((e: any, i: number) => (
        <div key={i} style={{ ...painel.card, borderLeft: "4px solid #dc2626" }}>
          <strong style={{ color: cor.navy }}>{e.contexto}</strong>
          <p style={{ color: cor.cinza, fontSize: 13, margin: "4px 0" }}>{e.mensagem}</p>
          <div style={{ fontSize: 12, color: cor.cinza }}>{new Date(e.created_at).toLocaleString("pt-BR")}</div>
        </div>
      ))}
    </>
  );
}
