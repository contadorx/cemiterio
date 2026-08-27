"use client";

import { useCallback, useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";
import ConexaoWhatsapp from "./ConexaoWhatsapp";
import Regua from "./Regua";
import Extras from "./Extras";
import { useConfirmar, useRecado } from "@/components/Dialogos";
import Prioridade from "./Prioridade";
import Manutencao from "./Manutencao";
import Termo from "./Termo";

type Aba =
  | "casa" | "equipe" | "cemiterios" | "jornada" | "campo"
  | "regua" | "prioridade" | "extras"
  | "whatsapp" | "mensagens" | "campanhas" | "avaliacoes" | "indicacoes"
  | "privacidade" | "auditoria" | "erros" | "manutencao";

export default function Config() {
  const [aba, setAba] = useState<Aba>("casa");
  // A ABA VEM DO ENDERECO. Sem isto, o redirecionamento de /painel/whatsapp
  // cairia sempre em "A Casa" — e quem clicou em "Reconectar" na fila teria de
  // procurar a aba, justamente na hora em que o WhatsApp esta fora do ar.
  // Leitura no window dentro do useEffect, e nao useSearchParams: no Next 14
  // isso exigiria um <Suspense> em volta da pagina inteira so por causa disto.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("aba");
    if (q) setAba(q as any);
  }, []);

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/config" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Configurações</h1>
        <ChaveDisparos />
        <Abas atual={aba} aoTrocar={setAba} />
        {aba === "casa" && <Casa />}
        {aba === "jornada" && <Jornada />}
        {aba === "equipe" && <Equipe />}
        {aba === "cemiterios" && <Cemiterios />}
        {aba === "campanhas" && <Campanhas />}
        {aba === "mensagens" && <Mensagens />}
        {aba === "whatsapp" && <ConexaoWhatsapp />}
        {aba === "regua" && <Regua />}
        {aba === "prioridade" && <Prioridade />}
        {aba === "extras" && <Extras />}
        {aba === "manutencao" && <Manutencao />}
        {aba === "privacidade" && <Termo />}
        {/* LISTA DO QUE ENTRA, NÃO DO QUE FICA DE FORA.
            Isto era uma corrente de sete `aba !== ...`: toda tela nova tinha de
            LEMBRAR de se excluir daqui, e a Régua de cobrança não lembrou —
            ficava desenhada duas vezes, a segunda como um resto de outra aba
            embaixo dela. Uma lista negativa erra em silêncio; a positiva só
            desenha o que foi escrito nela. */}
        {AGREGADAS.includes(aba) && <Agregados aba={aba} />}
      </div>
    </div>
  );
}

/**
 * AS ABAS, AGRUPADAS.
 *
 * O QUE HAVIA AQUI
 * Quinze botões numa fileira só, em ordem de chegada — cada tela nova foi
 * empurrada para o fim da fila. "Régua de cobrança" ficava entre "WhatsApp" e
 * "Flores e extras"; "Dias e horários" caía depois de "Flores". Não havia
 * hierarquia nenhuma: quem procurava alguma coisa lia os quinze rótulos.
 *
 * Quinze itens é mais do que se lê de relance. A partir de mais ou menos sete,
 * uma lista deixa de ser vista e passa a ser VARRIDA — e varrer é o que a
 * Sureya faz no celular, com a mão ocupada, no meio do cemitério.
 *
 * O CRITÉRIO DO AGRUPAMENTO
 * Não é "temas parecidos". É A PERGUNTA QUE SE ESTÁ FAZENDO quando se abre
 * Configurações. São quatro, e nenhuma se confunde com a outra:
 *
 *   A CASA      "como o negócio é montado" — quem trabalha, onde, em que dias
 *   O DINHEIRO  "quanto custa e como cobro"
 *   A CONVERSA  "o que sai daqui para a família"
 *   O SISTEMA   "está tudo funcionando, e eu consigo provar"
 *
 * A ORDEM DOS GRUPOS É A ORDEM DE QUEM MEXE MAIS. Preço de flor muda quando o
 * fornecedor muda; a lista de cemitérios não muda quase nunca. O sistema fica
 * por último porque é onde se vai quando algo quebrou — e para esse caso existe
 * o ponto vermelho, que chama em vez de esperar ser procurado.
 */
const GRUPOS: { titulo: string; itens: [Aba, string][] }[] = [
  { titulo: "A casa", itens: [
    ["casa", "A Casa"],
    ["equipe", "Equipe"],
    ["cemiterios", "Cemitérios"],
    ["jornada", "Dias e horários"],
    ["campo", "Campo"],
  ]},
  { titulo: "O dinheiro", itens: [
    // A régua de cobrança: os degraus vivem no banco desde a 0110.
    ["regua", "Régua de cobrança"],
    // A RÉGUA DE PRIORIDADE mora em "O dinheiro" e não em "A casa" porque é
    // sobre o que a Nina faz PRIMEIRO — e o que ela faz primeiro é o que a
    // família paga primeiro. Fica ao lado da régua de cobrança de propósito:
    // são as duas réguas do sistema, e quem procura uma procura a outra.
    ["prioridade", "Régua de prioridade"],
    // O CATÁLOGO DE FLORES E EXTRAS (0117). É preço da CASA — vale para todo
    // mundo e muda quando o fornecedor muda —, por isso mora aqui e não na
    // ficha de uma família.
    ["extras", "Flores e extras"],
  ]},
  { titulo: "A conversa", itens: [
    // O WHATSAPP MORA AQUI. Estava numa rota solta, fora do menu — e é a única
    // tela onde se reconecta a instância que entrega as fotos. Quando ele cai,
    // o que se procura é "configurações", não um endereço decorado.
    ["whatsapp", "WhatsApp"],
    ["mensagens", "Mensagens"],
    ["campanhas", "Campanhas"],
    ["avaliacoes", "Avaliações"],
    ["indicacoes", "Indicações"],
  ]},
  { titulo: "O sistema", itens: [
    ["privacidade", "Privacidade (LGPD)"],
    ["auditoria", "Auditoria"],
    ["erros", "Diagnóstico"],
    // MANUTENÇÃO mora em "O sistema" e não em "O dinheiro" porque o que ela
    // conserta é REGISTRO, não cobrança: preço congelado, baixa de estoque,
    // valor da equipe. A dívida da família vem da competência e não passa por
    // aqui. Quem abre esta aba está perguntando "está tudo consistente?".
    ["manutencao", "Manutenção"],
  ]},
];

/**
 * As abas cujo conteúdo mora dentro de `Agregados`, e só elas.
 *
 * "cemiterios" NÃO está aqui — tem componente próprio. Na lista negativa
 * antiga ela passava pelo filtro e caía no fim de `Agregados`, que devolve o
 * log de erros quando não reconhece a aba. Cemitérios e Régua de cobrança
 * mostravam, coladas embaixo, a lista de erros do sistema.
 */
// "privacidade" SAIU DAQUI na 0138: ela tem componente proprio (Termo), e uma
// aba que aparece nas duas listas e desenhada duas vezes — foi o defeito que a
// lista positiva veio consertar.
const AGREGADAS: Aba[] = ["campo", "avaliacoes", "indicacoes", "auditoria", "erros"];

function Abas({ atual, aoTrocar }: { atual: Aba; aoTrocar: (a: Aba) => void }) {
  // O PONTO VERMELHO. O Diagnóstico é a aba onde se descobre que o WhatsApp
  // parou — e é a última de todas, num grupo que ninguém abre por vontade
  // própria. Foram dezenove dias de WhatsApp mudo (04/08 a 22/08) sem que
  // alguém passasse por aqui. Agora a aba avisa sozinha.
  const [problemas, setProblemas] = useState(0);
  const [whatsRuim, setWhatsRuim] = useState(false);

  useEffect(() => {
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((r) => {
        if (!r?.ok) return;
        setProblemas(Number(r.problemas) || 0);
        const w = r.whatsapp;
        setWhatsRuim(!!w && (w.silencio || w.nunca_recebeu));
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ marginBottom: 16 }}>
      {GRUPOS.map((g) => (
        <div key={g.titulo} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6,
                        textTransform: "uppercase", color: cor.cinza, marginBottom: 6 }}>
            {g.titulo}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(g.itens || []).map(([k, label]) => {
              const alerta = (k === "erros" && problemas > 0) || (k === "whatsapp" && whatsRuim);
              return (
                <button key={k} style={atual === k ? painel.botao : painel.botaoSec}
                        onClick={() => aoTrocar(k)}>
                  {label}
                  {alerta && (
                    <span title="alguma coisa parou de rodar"
                          style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999,
                                   marginLeft: 6, verticalAlign: "middle",
                                   background: "rgb(var(--zm-perigo))" }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Chave mestra dos disparos automáticos. Fica no topo da Config, sempre visível.
function ChaveDisparos() {
  const recado = useRecado();
  const perguntar = useConfirmar();
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/config/disparos")
      .then((r) => r.json())
      .then((j) => setAtivo(!!j?.ativo))
      .catch(() => setAtivo(null));
  }, []);

  async function alternar() {
    if (ativo === null) return;
    const novo = !ativo;
    if (novo && !await perguntar({
      oQue: "Ligar os disparos automáticos?",
      efeito: "A IA volta a responder sozinha e os avisos automáticos passam a sair — "
            + "sem ninguém ler antes de a família ler.",
      confirmar: "Ligar", tom: "perigo",
    })) return;
    setSalvando(true);
    const r = await fetch("/api/config/disparos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: novo }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) setAtivo(!!r.ativo);
    else recado.erro("Não consegui salvar: " + (r?.erro || "erro"));
  }

  const ligado = ativo === true;
  const fundo = ativo === null ? "#f1f5f9" : ligado ? "#f0fdf4" : "rgb(var(--zm-perigo) / 0.08)";
  const borda = ativo === null ? cor.linha : ligado ? "rgb(var(--zm-positivo))" : "rgb(var(--zm-perigo))";

  return (
    <div style={{ ...painel.card, background: fundo, borderLeft: `5px solid ${borda}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, display: "inline-block",
              background: ativo === null ? "rgb(var(--zm-ink-soft))" : ligado ? "rgb(var(--zm-positivo))" : "rgb(var(--zm-perigo))" }} />
            <strong style={{ color: cor.navy, fontSize: 17 }}>
              Disparos automáticos: {ativo === null ? "…" : ligado ? "LIGADOS" : "DESLIGADOS"}
            </strong>
          </div>
          <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
            {ligado
              ? "A IA responde sozinha (quando pode) e os avisos/convites automáticos saem normalmente."
              : "A IA não responde sozinha — tudo vira rascunho para você aprovar. As mensagens dos clientes continuam chegando e suas respostas manuais continuam saindo. Ideal enquanto migra os dados e captura as quadras."}
          </p>
        </div>
        <button
          onClick={alternar}
          disabled={ativo === null || salvando}
          style={ligado ? painel.botaoPerigo : painel.botao}
        >
          {salvando ? "Salvando…" : ligado ? "Desligar disparos" : "Ligar disparos"}
        </button>
      </div>
    </div>
  );
}

function Equipe() {
  const recado = useRecado();
  const perguntar = useConfirmar();
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
    if (!await perguntar({
      oQue: "Remover este acesso?",
      efeito: "A conta de login também é apagada. A pessoa perde o app de campo na hora.",
      confirmar: "Remover o acesso", tom: "perigo",
    })) return;
    const r = await fetch(`/api/membros/${userId}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.ok) carregar();
    else recado.erro("Falhou: " + (r?.erro || "erro"));
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
          {erro && <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 14, marginTop: 8 }}>{erro}</p>}
          <button style={{ ...painel.botao, marginTop: 12 }} onClick={criar} disabled={salvando}>
            {salvando ? "Criando..." : "Criar acesso"}
          </button>
        </div>
      )}

      {membros.map((m) => (
        <div key={m.user_id} style={{ ...painel.card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong style={{ color: cor.navy }}>{m.nome || "(sem nome)"}</strong>
            <div style={{ fontSize: 15, color: cor.cinza }}>
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
            <div style={{ fontSize: 15, color: cor.cinza }}>Média das avaliações</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: cor.teal }}>
              {Number(d.mediaAvaliacoes).toFixed(1)} ⭐
            </div>
          </div>
        )}
        {d.avaliacoes.length === 0 && <p style={{ color: cor.cinza }}>Nenhuma avaliação ainda.</p>}
        {(d.avaliacoes || []).map((a: any, i: number) => (
          <div key={i} style={painel.card}>
            <div style={{ fontSize: 18 }}>{"⭐".repeat(a.nota)}</div>
            {a.comentario && <p style={{ color: cor.navy, margin: "6px 0 0" }}>&ldquo;{a.comentario}&rdquo;</p>}
            <div style={{ fontSize: 14, color: cor.cinza, marginTop: 4 }}>
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
        {(d.indicacoes || []).map((x: any) => (
          <div key={x.id} style={painel.card}>
            <strong style={{ color: cor.navy }}>{x.indicado_nome || "Sem nome"} · {x.indicado_tel || "sem telefone"}</strong>
            <div style={{ fontSize: 15, color: cor.cinza, marginTop: 4 }}>
              Indicado por {x.clientes?.nome || "—"} · {x.status} · {new Date(x.created_at).toLocaleDateString("pt-BR")}
            </div>
          </div>
        ))}
      </>
    );
  }

  // O AVISO DE PRIVACIDADE SAIU DAQUI (0138).
  //
  // Era um campo de texto livre, unico e sem versao — e com ZERO caracteres:
  // nunca houve texto. Enquanto isso, 62 contatos estavam marcados como tendo
  // autorizado o contato. Pior, um campo assim muda em silencio: bastaria
  // reescrever para que todas passassem a "ter aceitado" o texto novo sem
  // nunca o terem visto.
  //
  // Agora mora em `Termo.tsx`, com versoes. Nada foi perdido: o campo antigo
  // estava vazio, e continua na tabela `orgs` intacto.

  if (aba === "campo") {
    const totalImpacto = (d.ocorrencias || []).reduce((s: number, o: any) => s + (o.impacto || 0), 0);
    const rotulos: Record<string, string> = {
      chuva: "🌧 Chuva", falta_agua: "🚰 Falta de água", falta_material: "🧴 Falta de material",
      acesso: "🚧 Acesso", saude: "🩺 Saúde", tumulo_nao_encontrado: "❓ Túmulo não encontrado", outro: "• Outro",
    };
    return (
      <>
        <div style={painel.card}>
          <div style={{ fontSize: 15, color: cor.cinza }}>Túmulos perdidos por imprevistos (registrados)</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: totalImpacto > 0 ? "rgb(var(--zm-perigo))" : cor.teal }}>{totalImpacto}</div>
        </div>

        <Materiais />

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
              {o.impacto > 0 && <span style={{ color: "rgb(var(--zm-perigo))" }}> · −{o.impacto} túmulo(s)</span>}
              {o.descricao && <div style={{ color: cor.cinza, marginTop: 2 }}>{o.descricao}</div>}
              <div style={{ fontSize: 14, color: cor.cinza }}>{new Date(o.created_at).toLocaleString("pt-BR")}</div>
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
        {(d.auditoria || []).map((a: any, i: number) => (
          <div key={i} style={{ ...painel.card, padding: 12 }}>
            <strong style={{ color: cor.navy }}>{String(a.acao).replace(/_/g, " ")}</strong>
            {a.alvo_tipo && <span style={{ color: cor.cinza, fontSize: 15 }}> · {a.alvo_tipo}</span>}
            <div style={{ fontSize: 14, color: cor.cinza, marginTop: 4 }}>
              {new Date(a.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
        ))}
      </>
    );
  }

  // ERROS / DIAGNÓSTICO — e SÓ ele.
  //
  // Este `return` era o fim de uma escada de `if`, o que o tornava também a
  // resposta para toda aba que ninguém tratou. Era assim que Cemitérios e
  // Régua acabavam com o log de erros pendurado embaixo. Agora quem não é
  // "erros" sai sem desenhar nada.
  if (aba !== "erros") return null;

  return (
    <>
      <p style={{ color: cor.cinza, fontSize: 14 }}>Últimos erros registrados pelo sistema (para diagnóstico).</p>
      {d.erros.length === 0 && <p style={{ color: cor.teal }}>Nenhum erro registrado. ✓</p>}
      {(d.erros || []).map((e: any, i: number) => (
        <div key={i} style={{ ...painel.card, borderLeft: "4px solid #dc2626" }}>
          <strong style={{ color: cor.navy }}>{e.contexto}</strong>
          <p style={{ color: cor.cinza, fontSize: 15, margin: "4px 0" }}>{e.mensagem}</p>
          <div style={{ fontSize: 14, color: cor.cinza }}>{new Date(e.created_at).toLocaleString("pt-BR")}</div>
        </div>
      ))}
    </>
  );
}

/**
 * O AVISO PARA TODO MUNDO.
 *
 * Uma mensagem, muitas famílias — o aviso das moedas, o recado de Finados, a
 * mudança do Pix. Uma linha por FAMÍLIA (e não por contato: uma casa com três
 * telefones receberia três vezes o mesmo recado), entrando na FILA DE
 * LIBERAÇÃO, onde já existe marcar em lote, enviar em lote e parar no meio.
 *
 * NADA SAI DAQUI. Isto enche a fila; quem manda é o comando, em Conversas.
 */
function Campanhas() {
  const perguntar = useConfirmar();
  const [hist, setHist] = useState<any[]>([]);
  const [publicos, setPublicos] = useState<any[]>([]);
  const [previa, setPrevia] = useState<any>(null);
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [publico, setPublico] = useState("todas");
  const [rodando, setRodando] = useState(false);
  const [res, setRes] = useState<string>("");
  const [erro, setErro] = useState<string>("");

  // A PRÉVIA ACOMPANHA O PÚBLICO. Trocar o público e não ver o tamanho mudar
  // é como escolher no escuro — e já houve um público que selecionava quase
  // ninguém em silêncio, porque olhava uma tabela que tinha esvaziado.
  const carregar = useCallback(async () => {
    const r = await fetch(`/api/campanhas?prever=${publico}`)
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setHist(r.campanhas || []);
      setPublicos(r.publicos || []);
      setPrevia(r.previa || null);
    }
  }, [publico]);

  useEffect(() => { carregar(); }, [carregar]);

  async function executar() {
    setErro("");
    if (!nome.trim()) { setErro("Dê um nome ao aviso — é só para você achar depois."); return; }
    if (mensagem.trim().length < 10) { setErro("Escreva a mensagem."); return; }

    const quantas = previa?.familias ?? 0;
    if (!await perguntar({
      oQue: `Preparar ${quantas} mensagem(ns) na fila de liberação?`,
      efeito: "Uma por família. NADA É ENVIADO AGORA — você lê e libera em Conversas, e pode mandar em lote.",
      confirmar: "Preparar",
    })) return;

    setRodando(true); setRes("");
    const r = await fetch("/api/campanhas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, mensagem, publico }),
    }).then((x) => x.json()).catch(() => null);
    setRodando(false);

    if (r?.ok) {
      const partes = [`${r.criados} mensagem(ns) na fila de liberação.`];
      if (r.semTelefone) partes.push(`${r.semTelefone} família(s) ficaram de fora por não ter telefone.`);
      if (r.silenciadas) partes.push(`${r.silenciadas} pediram para não receber avisos.`);
      setRes(partes.join(" "));
      setNome(""); setMensagem("");
      carregar();
    } else setErro(r?.mensagem || r?.erro || "não deu para preparar o aviso");
  }

  const modelos = [
    { n: "Aviso da casa",
      m: "Olá, {nome}! Passando um aviso rápido sobre o cemitério: " },
    { n: "Finados",
      m: "Olá, {nome}! O Dia de Finados está chegando. Se quiser, deixamos o túmulo especialmente cuidado antes do dia 2, para a sua visita. É só me avisar. 🌿" },
    { n: "Retorno",
      m: "Olá, {nome}, tudo bem? Faz um tempo que não cuidamos do túmulo por aí. Se quiser retomar as limpezas, é só me dizer que organizo tudo. 🌿" },
  ];

  return (
    <>
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Novo aviso</strong>
        <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 12px", lineHeight: 1.55 }}>
          Uma mensagem por <b>família</b>, preparada na fila de liberação —{" "}
          <b>nada sai sem o seu comando</b>. Escreva {"{nome}"} onde quiser o primeiro
          nome de quem recebe.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {modelos.map((mo) => (
            <button key={mo.n} style={painel.botaoSec}
                    onClick={() => { setNome(mo.n); setMensagem(mo.m); }}>
              {mo.n}
            </button>
          ))}
        </div>

        <label style={painel.rotulo}>Nome do aviso (só para você achar depois)</label>
        <input style={painel.input} value={nome} onChange={(e) => setNome(e.target.value)}
               placeholder="Ex.: Aviso das moedas" />

        <div style={{ marginTop: 10 }}>
          <label style={painel.rotulo}>Quem recebe</label>
          <select style={{ ...painel.input, width: "auto" }} value={publico}
                  onChange={(e) => { setPublico(e.target.value); setPrevia(null); }}>
            {publicos.map((p: any) => (
              <option key={p.id} value={p.id}>{p.rotulo} — {p.explica}</option>
            ))}
          </select>
        </div>

        {/* O TAMANHO ANTES DE DISPARAR. É a diferença entre mandar um aviso e
            descobrir depois para quantos ele foi. */}
        {previa && (
          <p style={{ margin: "10px 0 0", fontSize: 14.5 }}>
            <b>{previa.familias} família(s)</b> receberiam este aviso.
            {previa.semTelefone > 0 && (
              <span style={{ color: cor.cinza }}>
                {" "}{previa.semTelefone} ficam de fora por não ter telefone.
              </span>
            )}
            {previa.silenciadas > 0 && (
              <span style={{ color: cor.cinza }}>
                {" "}{previa.silenciadas} pediram para não receber avisos.
              </span>
            )}
          </p>
        )}

        <div style={{ marginTop: 10 }}>
          <label style={painel.rotulo}>Mensagem</label>
          <textarea
            style={{ ...painel.input, minHeight: 130, resize: "vertical", fontFamily: "inherit" }}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Olá, {nome}! …"
          />
          <p style={{ margin: "6px 0 0", fontSize: 13, color: cor.cinza }}>
            {mensagem.trim().length} letras · o texto é o mesmo para todo mundo,
            só o nome muda.
          </p>
        </div>

        {erro && <p style={{ color: cor.perigo, marginTop: 10, fontSize: 14 }}>{erro}</p>}

        <button style={{ ...painel.botao, marginTop: 12 }} onClick={executar} disabled={rodando}>
          {rodando ? "Preparando…" : "Preparar na fila de liberação"}
        </button>
        {res && (
          <p style={{ color: cor.navy, marginTop: 10, fontSize: 14.5 }}>
            {res}{" "}
            <a href="/painel/conversas" style={{ color: cor.navy }}>Ir liberar →</a>
          </p>
        )}
      </div>

      {hist.length > 0 && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Avisos anteriores</strong>
          {hist.map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderTop: `1px solid ${cor.linha}`,
                                     marginTop: 8, fontSize: 14 }}>
              <b>{c.nome}</b> · {c.publico} · {c.criados} mensagem(ns) ·{" "}
              {c.executada_em ? new Date(c.executada_em).toLocaleDateString("pt-BR") : "—"}
            </div>
          ))}
        </div>
      )}
    </>
  );
}


/**
 * CEMITÉRIOS — onde a expansão é configurada.
 *
 * Duas coisas moram aqui, e as duas são OPCIONAIS (0044):
 *   · os DIAS em que a equipe vai em cada cemitério;
 *   · a PESSOA amarrada a um cemitério.
 * Sem mexer em nada, a equipe inteira atende tudo, todos os dias — como sempre
 * foi. Você escolhe o jeito depois de ver na prática qual funciona.
 */
function Cemiterios() {
  const recado = useRecado();
  const perguntar = useConfirmar();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState({ nome: "", endereco: "" });
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const r = await fetch("/api/cemiterios").then((x) => x.json()).catch(() => null);
    if (r?.ok) { setD(r); setErro(""); }
    else setErro(r?.dica || r?.erro || "não consegui carregar");
  }
  useEffect(() => { carregar(); }, []);

  async function patch(corpo: any) {
    setSalvando(true);
    const r = await fetch("/api/cemiterios", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) carregar();
    else recado.erro(r?.erro || "não consegui salvar");
  }

  async function criar() {
    if (!novo.nome.trim()) return recado.aviso("Diga o nome do cemitério.");
    setSalvando(true);
    const r = await fetch("/api/cemiterios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novo),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) { setNovo({ nome: "", endereco: "" }); carregar(); }
    else recado.erro(r?.erro || "não consegui criar");
  }

  if (erro) {
    return (
      <div style={{ ...painel.card, borderLeft: "4px solid #b45309" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Esta aba precisa da migration 0044.</p>
        <p style={{ margin: "8px 0 0", color: cor.cinza, lineHeight: 1.5 }}>{erro}</p>
      </div>
    );
  }
  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;

  const varios = (d.cemiterios || []).length > 1;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {d.semCemiterio > 0 && (
        <div style={{ ...painel.card, borderLeft: "4px solid #b45309" }}>
          <b>{d.semCemiterio} jazigo(s) sem cemitério.</b>
          <p style={{ margin: "6px 0 0", color: cor.cinza, lineHeight: 1.5 }}>
            Deveriam ser zero depois da migration 0044. Rode a consulta 3.1 de dentro
            dela para ver quais são.
          </p>
        </div>
      )}

      {(d.cemiterios || []).map((c: any) => (
        <div key={c.id} style={painel.card}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 19, color: cor.navy }}>{c.nome}</h3>
            {!c.ativo && <span style={{ color: "rgb(var(--zm-aviso))", fontSize: 14 }}>· inativo</span>}
            <span style={{ marginLeft: "auto", fontSize: 14, color: cor.cinza }}>
              {c.jazigos} jazigo(s) · {c.familias} família(s) · {c.quadras} quadra(s)
            </span>
          </div>
          {c.endereco && <p style={{ margin: "4px 0 0", color: cor.cinza, fontSize: 14 }}>{c.endereco}</p>}

          {/* dias de atendimento */}
          <div style={{ marginTop: 12 }}>
            <label style={painel.rotulo}>Dias em que a equipe vem aqui</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(d.dias || []).map((nome: string, i: number) => {
                const marcado = c.diasSemana ? c.diasSemana.includes(i) : true;
                return (
                  <button key={i} disabled={salvando}
                    style={{ ...(marcado ? painel.botaoMini : painel.botaoMiniSec), textTransform: "capitalize" }}
                    onClick={() => {
                      const atual: number[] = c.diasSemana || [0, 1, 2, 3, 4, 5, 6];
                      const novoD = marcado ? atual.filter((x) => x !== i) : [...atual, i].sort();
                      patch({ id: c.id, diasSemana: novoD });
                    }}>
                    {nome.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
              {c.diasSemana
                ? `A rota deste cemitério só é montada nestes dias.`
                : `Sem marcação: a equipe vem em qualquer dia de trabalho da casa — que é o padrão.`}
              {" "}Desmarcar todos volta ao padrão.
            </p>
          </div>

          {/* quem trabalha aqui */}
          {varios && (
            <div style={{ marginTop: 12 }}>
              <label style={painel.rotulo}>Quem trabalha só aqui</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(d.equipeCampo || []).map((m: any) => {
                  const aqui = m.cemiterioId === c.id;
                  return (
                    <button key={m.userId} disabled={salvando}
                      style={aqui ? painel.botaoMini : painel.botaoMiniSec}
                      onClick={() => patch({ membroId: m.userId, cemiterioId: aqui ? null : c.id })}>
                      {aqui ? "✓ " : ""}{m.nome}
                    </button>
                  );
                })}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
                Quem não estiver marcado em lugar nenhum atende todos os cemitérios.
              </p>
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button style={painel.botaoMiniSec} disabled={salvando}
              onClick={async () => {
                if (c.ativo && !await perguntar({
                  oQue: `Desativar ${c.nome}?`,
                  efeito: "A rota do dia para de incluir os jazigos daqui. Nada é apagado — é só parar de agendar.",
                  confirmar: "Desativar", tom: "perigo",
                })) return;
                patch({ id: c.id, ativo: !c.ativo });
              }}>
              {c.ativo ? "Desativar" : "Reativar"}
            </button>
          </div>
        </div>
      ))}

      <div style={painel.card}>
        <b style={{ color: cor.navy }}>Cadastrar outro cemitério</b>
        <p style={{ margin: "4px 0 10px", color: cor.cinza, fontSize: 14, lineHeight: 1.5 }}>
          Depois de cadastrar, o cadastro de jazigo passa a PERGUNTAR em qual cemitério
          fica — em vez de escolher sozinho, que era como o mesmo jazigo acabava
          cadastrado duas vezes.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...painel.input, maxWidth: 320 }} placeholder="Nome (ex.: Cemitério XXXX — Mauá)"
                 value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <input style={{ ...painel.input, maxWidth: 260 }} placeholder="Bairro, cidade (opcional)"
                 value={novo.endereco} onChange={(e) => setNovo({ ...novo, endereco: e.target.value })} />
          <button style={painel.botao} disabled={salvando} onClick={criar}>Cadastrar</button>
        </div>
      </div>
    </div>
  );
}

function Casa() {
  const recado = useRecado();
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
    else recado.erro("Falhou: " + (r?.erro || "erro"));
  }

  if (!f) return <p style={{ color: cor.cinza }}>Carregando…</p>;
  const semPix = !f.chave_pix;

  return (
    <>
      {semPix && (
        <div style={{ ...painel.card, borderLeft: "4px solid #dc2626", background: "rgb(var(--zm-perigo) / 0.08)" }}>
          <strong style={{ color: "#991b1b" }}>A chave Pix não está cadastrada</strong>
          <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 14, margin: "6px 0 0" }}>
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
        <p style={{ color: cor.cinza, fontSize: 15, margin: "8px 0 0" }}>
          Aparece no portal da família, nas plaquetas, no recibo e na assinatura das mensagens.
        </p>
      </div>

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Custo da operação</strong>
        <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 12px" }}>
          É com isto que o sistema calcula o resultado de cada jazigo. Se você paga
          um valor fixo por mês, preencha o salário — o custo por hora sai da jornada.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div>
            <label style={painel.rotulo}>Salário mensal da ajudante (R$)</label>
            <input type="number" style={{ ...painel.input, width: 150 }}
                   value={f.custo_mensal_ajudante ?? 0}
                   onChange={(e) => setF({ ...f, custo_mensal_ajudante: Number(e.target.value) })} />
          </div>
          <div>
            <label style={painel.rotulo}>ou custo por hora (R$)</label>
            <input type="number" style={{ ...painel.input, width: 130 }}
                   value={f.custo_hora_campo ?? 15}
                   onChange={(e) => setF({ ...f, custo_hora_campo: Number(e.target.value) })} />
          </div>
          <div>
            <label style={painel.rotulo}>Tempo padrão por limpeza (min)</label>
            <input type="number" style={{ ...painel.input, width: 150 }}
                   value={f.minutos_padrao_limpeza ?? 25}
                   onChange={(e) => setF({ ...f, minutos_padrao_limpeza: Number(e.target.value) })} />
          </div>
        </div>
        <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
          O tempo padrão só é usado enquanto não houver medição. Assim que a Nina começar a
          usar &ldquo;Começar/Finalizar&rdquo;, o sistema passa a usar a média real dela.
        </p>
      </div>

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Capacidade</strong>
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


function Materiais() {
  const recado = useRecado();
  const perguntar = useConfirmar();
  const [itens, setItens] = useState<any[]>([]);
  const [novo, setNovo] = useState({ nome: "", unidade: "un", estoque: 0, alertaMinimo: 1 });
  const [criando, setCriando] = useState(false);

  async function carregar() {
    const r = await fetch("/api/config/materiais").then((x) => x.json()).catch(() => null);
    if (r?.ok) setItens(r.materiais);
  }
  useEffect(() => { carregar(); }, []);

  async function criar() {
    if (!novo.nome.trim()) return;
    const r = await fetch("/api/config/materiais", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novo),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setNovo({ nome: "", unidade: "un", estoque: 0, alertaMinimo: 1 }); setCriando(false); carregar(); }
    else recado.erro("Falhou: " + (r?.erro || "erro"));
  }

  async function atualizar(id: string, patch: any) {
    await fetch(`/api/config/materiais/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    carregar();
  }

  async function remover(id: string, nome: string) {
    if (!await perguntar({
      oQue: `Remover "${nome}" da lista de materiais?`,
      efeito: "Ele some das opções que a Nina marca quando pede material.",
      confirmar: "Remover", tom: "perigo",
    })) return;
    await fetch(`/api/config/materiais/${id}`, { method: "DELETE" });
    carregar();
  }

  const [comprando, setComprando] = useState<any>(null);
  const [sugestao, setSugestao] = useState<any>(null);

  async function registrarCompra(m: any, quantidade: number, valor: number) {
    const r = await fetch("/api/config/materiais/compra", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId: m.id, quantidade, valorTotal: valor }),
    }).then((x) => x.json()).catch(() => null);
    setComprando(null);
    if (r?.ok) {
      carregar();
      if (r.consumoSugerido != null && r.limpezas > 0) setSugestao({ ...r, material: m });
    } else recado.erro("Falhou ao registrar a compra.");
  }

  async function aprovarSugestao() {
    await fetch("/api/config/materiais/compra", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compraId: sugestao.compraId }),
    });
    setSugestao(null);
    carregar();
  }

  const sugestoes = ["vassoura de piaçava", "água sanitária", "pano de chão", "balde",
                     "luvas", "saco de lixo", "esponja", "rodo", "escova de aço", "flores"];

  return (
    <div style={painel.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <strong style={{ color: cor.navy }}>Materiais</strong>
        <button style={painel.botaoSec} onClick={() => setCriando(!criando)}>
          {criando ? "Fechar" : "+ Cadastrar material"}
        </button>
      </div>
      <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 0" }}>
        A Nina vê esta lista no app e marca o que está faltando. O que ela marcar zera aqui e vira ocorrência.
      </p>

      {criando && (
        <div style={{ border: `1px solid ${cor.linha}`, borderRadius: 10, padding: 12, marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={painel.rotulo}>Nome</label>
              <input style={painel.input} value={novo.nome} list="sugestoes-material"
                     onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                     placeholder="ex.: vassoura de piaçava" />
              <datalist id="sugestoes-material">
                {sugestoes.map((x) => <option key={x} value={x} />)}
              </datalist>
            </div>
            <div>
              <label style={painel.rotulo}>Unidade</label>
              <input style={{ ...painel.input, width: 80 }} value={novo.unidade}
                     onChange={(e) => setNovo({ ...novo, unidade: e.target.value })} />
            </div>
            <div>
              <label style={painel.rotulo}>Estoque</label>
              <input type="number" style={{ ...painel.input, width: 90 }} value={novo.estoque}
                     onChange={(e) => setNovo({ ...novo, estoque: Number(e.target.value) })} />
            </div>
            <div>
              <label style={painel.rotulo}>Avisar abaixo de</label>
              <input type="number" style={{ ...painel.input, width: 110 }} value={novo.alertaMinimo}
                     onChange={(e) => setNovo({ ...novo, alertaMinimo: Number(e.target.value) })} />
            </div>
            <button style={painel.botao} onClick={criar}>Salvar</button>
          </div>
        </div>
      )}

      {itens.length === 0 && (
        <p style={{ color: cor.cinza, margin: "12px 0 0", fontSize: 14 }}>
          Nenhum material cadastrado ainda.
        </p>
      )}
      {comprando && (
        <CompraMaterial m={comprando} onFechar={() => setComprando(null)}
                        onConfirmar={(q, v) => registrarCompra(comprando, q, v)} />
      )}

      {sugestao && (
        <div style={{ ...painel.card, borderLeft: "4px solid #0f766e", background: "rgb(var(--zm-positivo) / 0.08)", marginTop: 12 }}>
          <strong style={{ color: cor.navy }}>Revisar o gasto de {sugestao.material.nome}?</strong>
          <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0" }}>
            Desde a compra anterior foram <b>{sugestao.limpezas}</b> limpezas. Pelo que você comprou,
            o gasto real é de <b>{sugestao.consumoSugerido}</b> por limpeza — hoje está{" "}
            <b>{sugestao.consumoAtual}</b>.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={painel.botao} onClick={aprovarSugestao}>
              Usar {sugestao.consumoSugerido} por limpeza
            </button>
            <button style={painel.botaoSec} onClick={() => setSugestao(null)}>Deixar como está</button>
          </div>
        </div>
      )}

      {itens.map((m) => {
        const baixo = Number(m.estoque) <= Number(m.alerta_minimo);
        return (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                                   padding: "10px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 10 }}>
            <span style={{ flex: 1, minWidth: 140, textTransform: "capitalize",
                           color: baixo ? "rgb(var(--zm-perigo))" : cor.navy, fontWeight: baixo ? 700 : 400 }}>
              {m.nome} {baixo && "· repor"}
            </span>
            <div>
              <label style={{ ...painel.rotulo, marginBottom: 2 }}>Estoque</label>
              <input type="number" defaultValue={m.estoque} style={{ ...painel.input, width: 90, padding: 8 }}
                     onBlur={(e) => atualizar(m.id, { estoque: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ ...painel.rotulo, marginBottom: 2 }}>Avisar abaixo</label>
              <input type="number" defaultValue={m.alerta_minimo} style={{ ...painel.input, width: 100, padding: 8 }}
                     onBlur={(e) => atualizar(m.id, { alertaMinimo: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ ...painel.rotulo, marginBottom: 2 }}>Gasto por limpeza</label>
              <input type="number" step="0.001" defaultValue={m.consumo_por_limpeza}
                     style={{ ...painel.input, width: 110, padding: 8 }}
                     onBlur={(e) => atualizar(m.id, { consumoPorLimpeza: Number(e.target.value) })} />
            </div>
            <span style={{ color: cor.cinza, fontSize: 15 }}>
              {m.unidade}
              {Number(m.consumo_por_limpeza) > 0 &&
                ` · dura ~${Math.round(1 / Number(m.consumo_por_limpeza))} limpezas`}
              {Number(m.custo_unitario) > 0 && ` · R$ ${Number(m.custo_unitario).toFixed(2)}/${m.unidade}`}
            </span>
            <button style={painel.botaoMiniSec} onClick={() => setComprando(m)}>
              Comprei
            </button>
            <button style={painel.botaoMiniPerigo} onClick={() => remover(m.id, m.nome)}>
              Remover
            </button>
          </div>
        );
      })}
    </div>
  );
}


function Jornada() {
  const recado = useRecado();
  const perguntar = useConfirmar();
  const [j, setJ] = useState<any>(null);
  const [bloq, setBloq] = useState<any[]>([]);
  const [novo, setNovo] = useState({ data: "", motivo: "" });
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  const NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  async function carregar() {
    const r = await fetch("/api/config/jornada").then((x) => x.json()).catch(() => null);
    if (r?.ok) { setJ(r.jornada); setBloq(r.bloqueados); }
  }
  useEffect(() => { carregar(); }, []);

  async function salvar() {
    setSalvando(true);
    const r = await fetch("/api/config/jornada", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(j),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (!r?.ok) {
      recado.erro("Falhou: " + (r?.erro === "escolha_ao_menos_um_dia" ? "Escolha pelo menos um dia." : r?.erro));
      return;
    }
    setOk(true); setTimeout(() => setOk(false), 2000); carregar();

    // Mudar os dias não mexe no que já estava marcado — pergunta se quer arrumar.
    const c = await fetch("/api/agenda/reorganizar").then((x) => x.json()).catch(() => null);
    if (c?.ok && c.foraDaJornada > 0) {
      const arrumar = await perguntar({
        oQue: `Reorganizar ${c.foraDaJornada} lavagem(ns) que ficaram fora da jornada?`,
        efeito: "Elas estão em dias que não são mais de trabalho. Vão para o próximo dia de trabalho.",
        confirmar: "Reorganizar",
      });
      if (arrumar) {
        const rr = await fetch("/api/agenda/reorganizar", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diasAFrente: 120 }),
        }).then((x) => x.json()).catch(() => null);
        recado.aviso(rr?.ok
          ? `${rr.movidos} lavagem(ns) movida(s) e redistribuída(s).`
          : "Não consegui reorganizar. Use o botão na tela de Agenda.");
      }
    }
  }

  async function bloquear() {
    if (!novo.data) return;
    await fetch("/api/config/jornada", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novo),
    });
    setNovo({ data: "", motivo: "" });
    carregar();
  }

  async function desbloquear(id: string) {
    await fetch(`/api/config/jornada?id=${id}`, { method: "DELETE" });
    carregar();
  }

  if (!j) return <p style={{ color: cor.cinza }}>Carregando…</p>;
  const dias: number[] = Array.isArray(j.dias_semana) ? j.dias_semana : [1, 2, 3, 4, 5, 6];

  function alternarDia(d: number) {
    const novos = dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d].sort();
    setJ({ ...j, dias_semana: novos });
  }

  return (
    <>
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Dias de trabalho no cemitério</strong>
        <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 12px" }}>
          A agenda nunca coloca serviço num dia que não estiver marcado aqui.
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {NOMES.map((nome, d) => (
            <button key={d}
              style={dias.includes(d) ? painel.botao : painel.botaoSec}
              onClick={() => alternarDia(d)}>
              {nome}
            </button>
          ))}
        </div>
      </div>

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Horário</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12, alignItems: "flex-end" }}>
          <div>
            <label style={painel.rotulo}>Começa</label>
            <input type="time" style={{ ...painel.input, width: 130 }}
                   value={(j.hora_inicio || "08:00").slice(0, 5)}
                   onChange={(e) => setJ({ ...j, hora_inicio: e.target.value })} />
          </div>
          <div>
            <label style={painel.rotulo}>Termina</label>
            <input type="time" style={{ ...painel.input, width: 130 }}
                   value={(j.hora_fim || "16:00").slice(0, 5)}
                   onChange={(e) => setJ({ ...j, hora_fim: e.target.value })} />
          </div>
          <div>
            <label style={painel.rotulo}>Almoço (min)</label>
            <input type="number" style={{ ...painel.input, width: 110 }}
                   value={j.intervalo_almoco_min ?? 60}
                   onChange={(e) => setJ({ ...j, intervalo_almoco_min: Number(e.target.value) })} />
          </div>
          <div>
            <label style={painel.rotulo}>Limpezas por dia</label>
            <input type="number" style={{ ...painel.input, width: 120 }}
                   value={j.limpezas_por_dia ?? 20}
                   onChange={(e) => setJ({ ...j, limpezas_por_dia: Number(e.target.value) })} />
          </div>
        </div>
        <p style={{ color: cor.cinza, fontSize: 14, margin: "10px 0 0" }}>
          O cemitério abre das 7h às 18h. O horário aqui é o da equipe, e serve de referência
          no briefing da manhã.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <button style={painel.botao} onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar jornada"}
        </button>
        {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
      </div>

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Dias sem campo (feriados, cemitério fechado)</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
          <div>
            <label style={painel.rotulo}>Data</label>
            <input type="date" style={{ ...painel.input, width: 160 }} value={novo.data}
                   onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={painel.rotulo}>Motivo</label>
            <input style={painel.input} value={novo.motivo}
                   onChange={(e) => setNovo({ ...novo, motivo: e.target.value })}
                   placeholder="ex.: feriado, chuva prevista" />
          </div>
          <button style={painel.botaoSec} onClick={bloquear}>Bloquear dia</button>
        </div>
        {bloq.length === 0 && (
          <p style={{ color: cor.cinza, fontSize: 14, margin: "12px 0 0" }}>Nenhum dia bloqueado.</p>
        )}
        {bloq.map((b) => (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                                   padding: "8px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 8 }}>
            <span>{new Date(b.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              {b.motivo ? ` · ${b.motivo}` : ""}</span>
            <button style={painel.botaoMiniSec} onClick={() => desbloquear(b.id)}>
              Liberar
            </button>
          </div>
        ))}
      </div>
    </>
  );
}


function CompraMaterial({ m, onFechar, onConfirmar }:
  { m: any; onFechar: () => void; onConfirmar: (q: number, v: number) => void }) {
  const recado = useRecado();
  const [qtd, setQtd] = useState("");
  const [valor, setValor] = useState("");

  return (
    <div style={{ ...painel.card, borderLeft: `4px solid ${cor.navy}`, marginTop: 12 }}>
      <strong style={{ color: cor.navy }}>Comprei {m.nome}</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
        <div>
          <label style={painel.rotulo}>Quantidade ({m.unidade})</label>
          <input type="number" step="0.01" style={{ ...painel.input, width: 130 }} value={qtd}
                 onChange={(e) => setQtd(e.target.value)} />
        </div>
        <div>
          <label style={painel.rotulo}>Valor total (R$)</label>
          <input type="number" step="0.01" style={{ ...painel.input, width: 130 }} value={valor}
                 onChange={(e) => setValor(e.target.value)} />
        </div>
        <button style={painel.botao}
                onClick={() => {
                  const q = Number(qtd), v = Number(valor);
                  if (!q) return recado.aviso("Informe a quantidade.");
                  onConfirmar(q, v);
                }}>
          Registrar
        </button>
        <button style={painel.botaoSec} onClick={onFechar}>Cancelar</button>
      </div>
      <p style={{ color: cor.cinza, fontSize: 14, margin: "10px 0 0" }}>
        O estoque sobe, o custo por unidade é recalculado e eu comparo com as limpezas do período
        para sugerir o gasto real por limpeza.
      </p>
    </div>
  );
}

/**
 * MENSAGENS — a chave de envio de fotos e os textos da casa.
 *
 * Nasceu de duas coisas que a Sureya viu na primeira limpeza de verdade, em
 * 22/08: a mensagem que chegou na fila era um bilhete de sistema ("A limpeza
 * foi feita. Segue a foto."), e não havia como dizer "esta família não recebe
 * foto" sem desligar o envio de todo mundo.
 *
 * A CHAVE tem dois níveis de propósito: a geral aqui, e uma por família na
 * ficha dela, que SOBREPÕE esta. Desligar aqui não apaga a exceção de quem
 * pediu para receber — por isso a contagem de exceções aparece junto.
 */
function Mensagens() {
  const recado = useRecado();
  const perguntar = useConfirmar();
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [excecoes, setExcecoes] = useState<{ desligadas: number; ligadas: number }>({ desligadas: 0, ligadas: 0 });
  const [dias, setDias] = useState("");
  const [diasSalvo, setDiasSalvo] = useState("");
  const [modelos, setModelos] = useState<any[]>([]);
  const [tipo, setTipo] = useState<string>("foto");
  const [rascunho, setRascunho] = useState("");
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);

  async function carregarChave() {
    const r = await fetch("/api/config/fotos").then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setAtivo(!!r.ativo);
      setExcecoes(r.excecoes || { desligadas: 0, ligadas: 0 });
      const d = String(r.diasEntreFotos ?? 30);
      setDias(d); setDiasSalvo(d);
    } else setAtivo(null);
  }
  async function carregarTextos(t = tipo) {
    const r = await fetch(`/api/config/textos?tipo=${t}`).then((x) => x.json()).catch(() => null);
    setModelos(r?.ok ? r.modelos : []);
    setEdicao({});
  }

  useEffect(() => { carregarChave(); }, []);
  useEffect(() => { carregarTextos(tipo); }, [tipo]);

  async function alternarChave() {
    if (ativo === null) return;
    const novo = !ativo;
    if (!novo && !await perguntar({
      oQue: "Desligar o envio de fotos para as famílias?",
      efeito: "As limpezas continuam sendo registradas e você continua vendo as fotos no painel. "
            + "O que para é a mensagem para a família.",
      confirmar: "Desligar", tom: "perigo",
    })) return;
    setOcupado(true);
    const r = await fetch("/api/config/fotos", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: novo }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) carregarChave();
    else recado.erro("Não consegui salvar: " + (r?.erro || "erro"));
  }

  async function salvarDias() {
    setOcupado(true);
    const r = await fetch("/api/config/fotos", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diasEntreFotos: dias }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) carregarChave();
    else recado.erro(r?.erro === "dias_invalidos"
      ? "Escreva um número de dias entre 0 e 3650. Zero desliga o aviso."
      : "Não consegui salvar: " + (r?.erro || "erro"));
  }

  async function acao(metodo: string, corpo: any, url = "/api/config/textos") {
    setOcupado(true);
    const r = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: metodo === "DELETE" ? undefined : JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (!r?.ok) {
      recado.erro(r?.erro === "ultimo_ativo"
        ? "Este é o único texto ligado deste tipo. Sem nenhum, o sistema volta a mandar a frase curta de reserva — cadastre outro antes de desligar este."
        : r?.erro === "texto_vazio" ? "O texto não pode ficar vazio."
        : "Não consegui salvar: " + (r?.erro || "erro"));
      return false;
    }
    await carregarTextos();
    return true;
  }

  const ligado = ativo === true;
  const rotuloTipo: Record<string, string> = {
    foto: "Foto do serviço", cobranca: "Cobrança",
    lembrete: "Lembrete", agradecimento: "Agradecimento",
    // Os cinco de memória (0096) existiam no banco sem tela nenhuma.
    memoria_falecimento: "Memória · aniversário",
    memoria_marco: "Memória · um ano",
    memoria_nascimento: "Memória · nascimento",
    memoria_agrupado: "Memória · duas datas juntas",
    memoria_sem_oferta: "Memória · sem oferta",
  };
  const TIPOS_TEXTO = [
    "foto", "cobranca", "lembrete", "agradecimento",
    "memoria_falecimento", "memoria_marco", "memoria_nascimento",
    "memoria_agrupado", "memoria_sem_oferta",
  ];

  return (
    <>
      {/* ------------------------------------------------------ a chave */}
      <div style={{ ...painel.card,
                    background: ativo === null ? "#f1f5f9" : ligado ? "#f0fdf4" : "rgb(var(--zm-perigo) / 0.08)",
                    borderLeft: `5px solid ${ativo === null ? cor.linha : ligado ? "rgb(var(--zm-positivo))" : "rgb(var(--zm-perigo))"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <strong style={{ color: cor.navy, fontSize: 17 }}>
              Enviar fotos para as famílias: {ativo === null ? "…" : ligado ? "LIGADO" : "DESLIGADO"}
            </strong>
            <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0", lineHeight: 1.5 }}>
              {ligado
                ? "Ao concluir uma limpeza, a foto vira uma mensagem na fila de liberação para você aprovar."
                : "Nenhuma mensagem de foto é montada. As limpezas continuam sendo registradas e as fotos continuam no painel — você confere o trabalho de campo do mesmo jeito, a família é que não recebe."}
            </p>
            {(excecoes.desligadas > 0 || excecoes.ligadas > 0) && (
              <p style={{ color: cor.cinza, fontSize: 13, margin: "8px 0 0" }}>
                Exceções na ficha das famílias:{" "}
                {excecoes.desligadas > 0 && <b>{excecoes.desligadas} não recebe{excecoes.desligadas > 1 ? "m" : ""}</b>}
                {excecoes.desligadas > 0 && excecoes.ligadas > 0 && " · "}
                {excecoes.ligadas > 0 && <b>{excecoes.ligadas} recebe{excecoes.ligadas > 1 ? "m" : ""} sempre</b>}
                . A chave da família vale mais que esta.
              </p>
            )}
          </div>
          <button onClick={alternarChave} disabled={ativo === null || ocupado}
                  style={ligado ? painel.botaoPerigo : painel.botao}>
            {ligado ? "Desligar envio de fotos" : "Ligar envio de fotos"}
          </button>
        </div>

        {/* O AVISO DE FOTO RECENTE.
            Pedido dela: "preciso da indicação da última data de foto enviada
            para decidir ou não enviar — não quero manter a frequência toda
            data". A fila SEMPRE mostra a data; este número é só o ponto a
            partir do qual ela é pintada de atenção, para achar de relance,
            numa fila de vinte, as que provavelmente vão ser descartadas.
            Não bloqueia envio nenhum. */}
        <div style={{ borderTop: `1px solid ${cor.linha}`, marginTop: 14, paddingTop: 14 }}>
          <label style={painel.rotulo}>Avisar quando a família já recebeu foto há menos de</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)}
                   style={{ ...painel.input, width: 110 }} />
            <span style={{ fontSize: 15, color: cor.cinza }}>dias</span>
            {dias !== diasSalvo && (
              <button style={painel.botaoMini} disabled={ocupado} onClick={salvarDias}>Salvar</button>
            )}
          </div>
          <p style={{ color: cor.cinza, fontSize: 13, margin: "8px 0 0", lineHeight: 1.5 }}>
            A data da última foto aparece em toda mensagem da fila, com aviso ou sem.
            Este número só decide quando a linha fica amarela. <b>Zero desliga o aviso</b>,
            e nada aqui impede você de enviar.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------ os textos */}
      <div style={painel.card}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "rgb(var(--zm-ink))", margin: "0 0 8px" }}>Textos das mensagens</h2>
        <p style={{ color: cor.cinza, fontSize: 14, lineHeight: 1.5, marginTop: 0 }}>
          O sistema escolhe um destes a cada mensagem, para a mesma família não
          ler o mesmo parágrafo doze vezes por ano. Você sempre pode editar antes
          de enviar, e trocar por outro na tela de liberação.
          {" "}<b>{"{nome}"}</b> vira o primeiro nome de quem recebe, com o tratamento
          (“Sr. André”). <b>{"{jazigo}"}</b> vira o código do jazigo.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          {TIPOS_TEXTO.map((t) => (
            <button key={t} onClick={() => setTipo(t)}
                    style={tipo === t ? painel.botao : painel.botaoSec}>
              {rotuloTipo[t]}
            </button>
          ))}
        </div>

        {tipo.startsWith("memoria_") && (
          <p style={{ fontSize: 13.5, color: cor.cinza, lineHeight: 1.5,
                      background: "rgb(var(--zm-fundo))", border: `1px solid ${cor.linha}`,
                      borderRadius: 10, padding: 10, margin: "0 0 12px" }}>
            Estes são os textos de <b>memória</b>, e usam chaves de dois pares:{" "}
            <b>{"{{nome_familiar}}"}</b>, <b>{"{{nome_falecido}}"}</b>,{" "}
            <b>{"{{data_evento}}"}</b> e <b>{"{{anos}}"}</b> — não as mesmas dos textos de foto.
            Eles saem <b>na fila de liberação</b>, nunca direto: alguém lê antes de a família ler.
          </p>
        )}

        {modelos.length === 0 && (
          <p style={{ color: cor.cinza, fontSize: 14 }}>
            Nenhum texto cadastrado para <b>{rotuloTipo[tipo]}</b>. Sem nenhum, sai a frase
            curta de reserva — cadastre pelo menos um.
          </p>
        )}

        {modelos.map((m: any, i: number) => (
          <div key={m.id} style={{ border: `1px solid ${cor.linha}`, borderRadius: 12, padding: 12, marginBottom: 10,
                                   opacity: m.ativo ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: cor.cinza }}>
                Texto {i + 1}{m.ativo ? "" : " · desligado"}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={painel.botaoSec} disabled={ocupado}
                        onClick={() => acao("PUT", { id: m.id, ativo: !m.ativo })}>
                  {m.ativo ? "Desligar" : "Ligar"}
                </button>
                <button style={painel.botaoSec} disabled={ocupado}
                        onClick={async () => {
                          if (!await perguntar({
                            oQue: "Apagar este texto de vez?",
                            efeito: "Ele sai do sorteio das mensagens. As já preparadas na fila não mudam.",
                            confirmar: "Apagar", tom: "perigo",
                          })) return;
                          acao("DELETE", null, `/api/config/textos?id=${m.id}`);
                        }}>
                  Apagar
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={edicao[m.id] ?? m.texto}
              onChange={(e) => setEdicao((x) => ({ ...x, [m.id]: e.target.value }))}
              style={{ width: "100%", borderRadius: 10, border: `1px solid ${cor.linha}`,
                       padding: 10, fontSize: 15, lineHeight: 1.5, fontFamily: "inherit" }}
            />
            {edicao[m.id] !== undefined && edicao[m.id] !== m.texto && (
              <button style={{ ...painel.botao, marginTop: 8 }} disabled={ocupado}
                      onClick={() => acao("PUT", { id: m.id, texto: edicao[m.id] })}>
                Salvar este texto
              </button>
            )}
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <textarea
            rows={3}
            placeholder={`Escrever mais um texto de ${rotuloTipo[tipo].toLowerCase()}…`}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            style={{ width: "100%", borderRadius: 10, border: `1px solid ${cor.linha}`,
                     padding: 10, fontSize: 15, lineHeight: 1.5, fontFamily: "inherit" }}
          />
          <button style={{ ...painel.botao, marginTop: 8 }}
                  disabled={ocupado || !rascunho.trim()}
                  onClick={async () => {
                    if (await acao("POST", { tipo, texto: rascunho })) setRascunho("");
                  }}>
            Acrescentar texto
          </button>
        </div>
      </div>
    </>
  );
}
