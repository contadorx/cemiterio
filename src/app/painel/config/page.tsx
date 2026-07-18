"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

export default function Config() {
  const [aba, setAba] = useState<"casa" | "equipe" | "campo" | "campanhas" | "avaliacoes" | "indicacoes" | "privacidade" | "auditoria" | "erros">("casa");
  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/config" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Configurações</h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {([
            ["casa", "A Casa"],
            ["equipe", "Equipe"],
            ["campo", "Campo"],
            ["campanhas", "Campanhas"],
            ["avaliacoes", "Avaliações"],
            ["indicacoes", "Indicações"],
            ["privacidade", "Privacidade (LGPD)"],
            ["auditoria", "Auditoria"],
            ["erros", "Diagnóstico"],
          ] as const).map(([k, label]) => (
            <button key={k} style={aba === k ? painel.botao : painel.botaoSec} onClick={() => setAba(k)}>
              {label}
            </button>
          ))}
        </div>
        {aba === "casa" && <Casa />}
        {aba === "equipe" && <Equipe />}
        {aba === "campanhas" && <Campanhas />}
        {aba !== "casa" && aba !== "equipe" && aba !== "campanhas" && <Agregados aba={aba} />}
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

  async function atualizar(userId: string, patch: Record<string, any>) {
    await fetch(`/api/membros/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
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
            <div style={{ fontSize: 13, color: cor.cinza }}>
              {m.papel === "campo" ? "Campo" : "Administrador"}
              {m.papel === "campo" && ` · ${m.limpezas_por_dia || "padrão"} limpezas/dia`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {m.papel === "campo" && (
              <input
                type="number"
                defaultValue={m.limpezas_por_dia || ""}
                placeholder="p/ dia"
                title="Limpezas por dia desta pessoa (vazio = padrão da org)"
                style={{ ...painel.input, width: 90, padding: 8 }}
                onBlur={(e) => atualizar(m.user_id, { limpezasPorDia: e.target.value || null })}
              />
            )}
            <select style={{ ...painel.input, width: "auto", padding: 8 }} value={m.papel} onChange={(e) => atualizar(m.user_id, { papel: e.target.value })}>
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

  if (aba === "campo") {
    const totalImpacto = (d.ocorrencias || []).reduce((s: number, o: any) => s + (o.impacto || 0), 0);
    const rotulos: Record<string, string> = {
      chuva: "🌧 Chuva", falta_agua: "🚰 Falta de água", falta_material: "🧴 Falta de material",
      acesso: "🚧 Acesso", saude: "🩺 Saúde", tumulo_nao_encontrado: "❓ Túmulo não encontrado", outro: "• Outro",
    };
    return (
      <>
        <div style={painel.card}>
          <div style={{ fontSize: 13, color: cor.cinza }}>Túmulos perdidos por imprevistos (registrados)</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: totalImpacto > 0 ? "#dc2626" : cor.teal }}>{totalImpacto}</div>
        </div>

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Materiais</strong>
          {(d.materiais || []).length === 0 && <p style={{ color: cor.cinza, margin: "8px 0 0", fontSize: 14 }}>Nenhum material cadastrado. Quando a ajudante avisar que algo acabou, aparece aqui.</p>}
          {(d.materiais || []).map((m: any) => {
            const baixo = Number(m.estoque) <= Number(m.alerta_minimo);
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 8 }}>
                <span style={{ textTransform: "capitalize" }}>{m.nome}</span>
                <b style={{ color: baixo ? "#dc2626" : cor.navy }}>
                  {baixo ? "repor" : `${m.estoque} ${m.unidade}`}
                </b>
              </div>
            );
          })}
        </div>

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Dias de trabalho</strong>
          {(d.diasCampo || []).length === 0 && <p style={{ color: cor.cinza, margin: "8px 0 0", fontSize: 14 }}>Nenhum dia encerrado ainda.</p>}
          {(d.diasCampo || []).map((x: any, i: number) => (
            <div key={i} style={{ padding: "8px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 8, fontSize: 14 }}>
              <b>{new Date(x.data + "T12:00:00").toLocaleDateString("pt-BR")}</b> · {x.feitos} de {x.meta_tumulos} feitos
              {x.clima ? ` · ${x.clima}` : ""}
              {x.observacoes ? <div style={{ color: cor.cinza, marginTop: 2 }}>&ldquo;{x.observacoes}&rdquo;</div> : null}
            </div>
          ))}
        </div>

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Ocorrências relatadas</strong>
          {(d.ocorrencias || []).length === 0 && <p style={{ color: cor.cinza, margin: "8px 0 0", fontSize: 14 }}>Nenhuma ocorrência.</p>}
          {(d.ocorrencias || []).map((o: any, i: number) => (
            <div key={i} style={{ padding: "8px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 8, fontSize: 14 }}>
              <b>{rotulos[o.tipo] || o.tipo}</b>
              {o.impacto > 0 && <span style={{ color: "#dc2626" }}> · −{o.impacto} túmulo(s)</span>}
              {o.descricao && <div style={{ color: cor.cinza, marginTop: 2 }}>{o.descricao}</div>}
              <div style={{ fontSize: 12, color: cor.cinza }}>{new Date(o.created_at).toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (aba === "auditoria") {
    return (
      <>
        <p style={{ color: cor.cinza, fontSize: 14 }}>Registro das ações sensíveis feitas no sistema.</p>
        {d.auditoria.length === 0 && <p style={{ color: cor.cinza }}>Nada registrado ainda.</p>}
        {d.auditoria.map((a: any, i: number) => (
          <div key={i} style={{ ...painel.card, padding: 12 }}>
            <strong style={{ color: cor.navy }}>{String(a.acao).replace(/_/g, " ")}</strong>
            {a.alvo_tipo && <span style={{ color: cor.cinza, fontSize: 13 }}> · {a.alvo_tipo}</span>}
            <div style={{ fontSize: 12, color: cor.cinza, marginTop: 4 }}>
              {new Date(a.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
        ))}
      </>
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

function Campanhas() {
  const [hist, setHist] = useState<any[]>([]);
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [publico, setPublico] = useState("ativos");
  const [rodando, setRodando] = useState(false);
  const [res, setRes] = useState<string>("");

  async function carregar() {
    const r = await fetch("/api/campanhas").then((x) => x.json()).catch(() => null);
    if (r?.ok) setHist(r.campanhas);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function executar() {
    if (!nome || mensagem.length < 10) return;
    if (!confirm("Isso cria um rascunho de mensagem para cada cliente do público escolhido. Nada é enviado automaticamente — você aprova um a um em Conversas. Continuar?")) return;
    setRodando(true);
    setRes("");
    const r = await fetch("/api/campanhas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, mensagem, publico }),
    }).then((x) => x.json()).catch(() => null);
    setRodando(false);
    if (r?.ok) {
      setRes(`${r.criados} rascunho(s) criado(s). Vá em Conversas para revisar e enviar.`);
      setNome("");
      setMensagem("");
      carregar();
    } else setRes("Falhou: " + (r?.erro || "erro"));
  }

  const modelos = [
    { n: "Finados", m: "Olá, {nome}! O Dia de Finados está chegando. Se quiser, deixamos o túmulo especialmente cuidado antes do dia 2, para a sua visita. É só me avisar. 🌿" },
    { n: "Retorno", m: "Olá, {nome}, tudo bem? Faz um tempo que não cuidamos do túmulo por aí. Se quiser retomar as limpezas, é só me dizer que organizo tudo. 🌿" },
  ];

  return (
    <>
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Nova campanha</strong>
        <p style={{ color: cor.cinza, fontSize: 13, margin: "6px 0 12px" }}>
          Gera um rascunho por cliente — <b>nada sai sem a sua aprovação</b>. Use {"{nome}"} para inserir o
          primeiro nome de cada pessoa.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {modelos.map((mo) => (
            <button key={mo.n} style={painel.botaoSec} onClick={() => { setNome(mo.n); setMensagem(mo.m); }}>
              Usar modelo: {mo.n}
            </button>
          ))}
        </div>

        <label style={painel.rotulo}>Nome da campanha (interno)</label>
        <input style={painel.input} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Finados 2026" />

        <div style={{ marginTop: 10 }}>
          <label style={painel.rotulo}>Público</label>
          <select style={{ ...painel.input, width: "auto" }} value={publico} onChange={(e) => setPublico(e.target.value)}>
            <option value="ativos">Clientes com plano ativo</option>
            <option value="todos">Todos os clientes</option>
            <option value="sem_servico_90d">Sem limpeza há 90 dias</option>
            <option value="em_aberto">Com valor em aberto</option>
          </select>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={painel.rotulo}>Mensagem</label>
          <textarea
            style={{ ...painel.input, minHeight: 110, resize: "vertical", fontFamily: "inherit" }}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
          />
        </div>

        <button style={{ ...painel.botao, marginTop: 12 }} onClick={executar} disabled={rodando}>
          {rodando ? "Gerando rascunhos..." : "Gerar rascunhos"}
        </button>
        {res && <p style={{ color: cor.navy, marginTop: 10 }}>{res}</p>}
      </div>

      {hist.length > 0 && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Campanhas anteriores</strong>
          {hist.map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 8, fontSize: 14 }}>
              <b>{c.nome}</b> · {c.publico} · {c.criados} rascunho(s) ·{" "}
              {c.executada_em ? new Date(c.executada_em).toLocaleDateString("pt-BR") : "—"}
            </div>
          ))}
        </div>
      )}
    </>
  );
}


function Casa() {
  const [f, setF] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  async function carregar() {
    const r = await fetch("/api/config/casa").then((x) => x.json()).catch(() => null);
    if (r?.ok) setF(r.casa);
  }
  useEffect(() => { carregar(); }, []);

  async function salvar() {
    setSalvando(true);
    const r = await fetch("/api/config/casa", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) { setOk(true); setTimeout(() => setOk(false), 2000); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  if (!f) return <p style={{ color: cor.cinza }}>Carregando…</p>;
  const semPix = !f.chave_pix;

  return (
    <>
      {semPix && (
        <div style={{ ...painel.card, borderLeft: "4px solid #dc2626", background: "#fef2f2" }}>
          <strong style={{ color: "#991b1b" }}>A chave Pix não está cadastrada</strong>
          <p style={{ color: "#7f1d1d", fontSize: 14, margin: "6px 0 0" }}>
            Sem ela, a IA não consegue mandar o Pix nas cobranças — e foi instruída a não inventar.
            É o primeiro campo abaixo.
          </p>
        </div>
      )}

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Cobrança</strong>
        <div style={{ marginTop: 12 }}>
          <label style={painel.rotulo}>Chave Pix (a que vai nas mensagens)</label>
          <input style={painel.input} value={f.chave_pix || ""}
                 onChange={(e) => setF({ ...f, chave_pix: e.target.value })}
                 placeholder="CPF, CNPJ, telefone, e-mail ou chave aleatória" />
        </div>
      </div>

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Identidade</strong>
        <div style={{ marginTop: 12 }}>
          <label style={painel.rotulo}>Nome da marca</label>
          <input style={painel.input} value={f.marca_nome || ""}
                 onChange={(e) => setF({ ...f, marca_nome: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={painel.rotulo}>Assinatura</label>
          <input style={painel.input} value={f.marca_assinatura || ""}
                 onChange={(e) => setF({ ...f, marca_assinatura: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={painel.rotulo}>Site</label>
          <input style={painel.input} value={f.site || ""}
                 onChange={(e) => setF({ ...f, site: e.target.value })} />
        </div>
        <p style={{ color: cor.cinza, fontSize: 13, margin: "8px 0 0" }}>
          Aparece no portal da família, nas plaquetas, no recibo e na assinatura das mensagens.
        </p>
      </div>

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Capacidade e custo</strong>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <div>
            <label style={painel.rotulo}>Limpezas por dia</label>
            <input type="number" style={{ ...painel.input, width: 120 }} value={f.limpezas_por_dia || 0}
                   onChange={(e) => setF({ ...f, limpezas_por_dia: Number(e.target.value) })} />
          </div>
          <div>
            <label style={painel.rotulo}>Dias por semana</label>
            <input type="number" style={{ ...painel.input, width: 120 }} value={f.dias_trabalhados_semana || 0}
                   onChange={(e) => setF({ ...f, dias_trabalhados_semana: Number(e.target.value) })} />
          </div>
          <div>
            <label style={painel.rotulo}>Teto de IA por dia (0 = sem teto)</label>
            <input type="number" style={{ ...painel.input, width: 150 }} value={f.teto_ia_dia || 0}
                   onChange={(e) => setF({ ...f, teto_ia_dia: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button style={painel.botao} onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
      </div>
    </>
  );
}
