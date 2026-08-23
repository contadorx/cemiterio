"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor, numeroBR } from "../ui";
import { ATALHOS_FREQUENCIA } from "@/lib/frequencia";
import VisaoJazigos from "./VisaoJazigos";
import VincularLote from "./VincularLote";

/**
 * CARTEIRA — familia, jazigo e servico na MESMA tela.
 *
 * Eram duas telas ("Familias" e "Gestao") e um caminho que nao existia (o que a
 * equipe captura no campo). Nao havia razao para a separacao: se tem familia,
 * tem jazigo, e se tem jazigo, tem servico — e quem trabalha precisa dos tres
 * ao mesmo tempo. Agora sao abas:
 *
 *   Familias        · quem paga, quanto deve, quando lava (a lista de sempre)
 *   Jazigos e planos· cada jazigo com valor, periodicidade e vencimento (a
 *                     antiga "Gestao", em VisaoJazigos.tsx)
 *   Do campo (n)    · os jazigos capturados no cemiterio esperando familia
 *
 * A aba fica no endereco (?aba=jazigos): dá para mandar o link certo para
 * alguem e o F5 nao joga a pessoa de volta para a primeira aba. A leitura e
 * feita no window (dentro do useEffect), NAO com useSearchParams — que no
 * Next 14 obriga um <Suspense> em volta da pagina inteira so por causa disso.
 */
type Aba = "familias" | "jazigos" | "campo";

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "familias", rotulo: "Famílias" },
  { chave: "jazigos", rotulo: "Jazigos e planos" },
  // A aba "Mapa" saiu: a navegação da Nina é a plaquinha na pedra mais o
  // endereço (quadra + rua), e o mapa com pinos foi desligado. Mantê-la aqui
  // deixava a tela desligada acessível por uma porta lateral.
  { chave: "campo", rotulo: "Do campo" },
];

export default function Carteira() {
  const [aba, setAba] = useState<Aba>("familias");
  const [orfaos, setOrfaos] = useState<number | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("aba");
    if (ABAS.some((a) => a.chave === q)) setAba(q as Aba);
  }, []);

  // contador da aba "Do campo": o numero e o convite. Sem ele ninguem descobre
  // que ha jazigo esperando familia — foi assim que a fila cresceu ate agora.
  const contarOrfaos = useCallback(() => {
    fetch("/api/tumulos")
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setOrfaos((r.semDono || []).length); })
      .catch(() => {});
  }, []);
  useEffect(() => { contarOrfaos(); }, [contarOrfaos]);

  function trocar(a: Aba) {
    setAba(a);
    const url = a === "familias" ? "/painel/clientes" : `/painel/clientes?aba=${a}`;
    window.history.replaceState(null, "", url);
  }

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/clientes" />
      <div style={painel.conteudo}>
        <h1 style={{ ...painel.h1, marginBottom: 10 }}>Famílias</h1>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {ABAS.map((a) => {
            const ativa = aba === a.chave;
            const n = a.chave === "campo" ? orfaos : null;
            return (
              <button
                key={a.chave}
                onClick={() => trocar(a.chave)}
                style={{
                  ...(ativa ? painel.botaoMini : painel.botaoMiniSec),
                  ...(a.chave === "campo" && !ativa && n ? { borderColor: "rgb(var(--zm-aviso))", color: "rgb(var(--zm-aviso))" } : {}),
                }}
              >
                {a.rotulo}{n ? ` (${n})` : ""}
              </button>
            );
          })}
        </div>

        {aba === "familias" && <VisaoFamilias />}
        {aba === "jazigos" && <VisaoJazigos />}
        {aba === "campo" && <VincularLote onMudou={contarOrfaos} />}
      </div>
    </div>
  );
}

interface Cli {
  id: string;
  nome: string;
  telefone: string;
  modo: string;
  score: number;
  ativo_ia: boolean;
}

function VisaoFamilias() {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ busca: "", quadra: "", rua: "", cadencia: "", situacao: "",
                               regua: "", venceEm: "", ordem: "nome", teste: false, etapa: "" });
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
    <div>
      <div>
        <div style={{ ...painel.card, padding: 12 }}>
          {/* AS ETAPAS DO CADASTRO.
              São 66 famílias e o trabalho é feito aos poucos: ligar o túmulo,
              preencher o contrato, começar a registrar limpeza. Sem isto, a
              Sureya reabre as mesmas fichas para descobrir que já fez — e as
              que faltam somem no meio.
              A etapa é derivada dos dados: um "já conferi" marcado à mão
              desatualiza no dia em que alguém mexe por outro caminho. */}
          {d?.porEtapa && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {([
                ["", "Todas", null],
                ["sem_tumulo", "Sem túmulo", d.porEtapa.sem_tumulo],
                ["sem_contrato", "Falta contrato", d.porEtapa.sem_contrato],
                ["pronta", "Pronta, sem limpeza", d.porEtapa.pronta],
                ["operacional", "Operacional", d.porEtapa.operacional],
              ] as [string, string, number | null][]).map(([v, rot, n]) => (
                <button
                  key={v || "todas"}
                  onClick={() => setF({ ...f, etapa: v })}
                  style={f.etapa === v ? painel.botaoMini : painel.botaoMiniSec}
                >
                  {rot}{n !== null ? ` (${n})` : ""}
                </button>
              ))}
            </div>
          )}

          <div data-filtros style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
              <option value="envio_desligado">Envio automático desligado</option>
              <option value="sem_telefone">Sem telefone</option>
              <option value="falta_data">Falta data de lavagem ou cobrança</option>
              <option value="nao_conferido">Ainda não conferidos</option>
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
              {/* Faltavam "semanal" e "quinzenal", que existem no enum desde
                  sempre e são os ritmos mais usados no cemitério — filtrar por
                  eles era impossível. */}
              {["semanal","quinzenal","mensal","bimestral","trimestral","semestral","anual","avulso"].map((c) =>
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
              <option value="valor">Maior valor por limpeza</option>
              <option value="lavagem">Próxima lavagem</option>
              <option value="cobranca">Próxima cobrança</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: cor.cinza }}>
              <input type="checkbox" checked={f.teste}
                     onChange={(e) => setF({ ...f, teste: e.target.checked })} /> teste
            </label>
            <button style={painel.botaoSec}
                    onClick={() => setF({ busca: "", quadra: "", rua: "", cadencia: "", situacao: "",
                                          regua: "", venceEm: "", ordem: "nome", teste: false, etapa: "" })}>
              Limpar
            </button>
          </div>
        </div>

        {d && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, color: cor.cinza, fontSize: 14 }}>
            <span><b style={{ color: cor.navy }}>{d.totais.quantidade}</b> famílias</span>
            <span><b style={{ color: cor.navy }}>{money(d.totais.mensal)}</b> por mês</span>
            <span><b style={{ color: d.totais.atrasados ? "rgb(var(--zm-perigo))" : cor.teal }}>
              {d.totais.atrasados}</b> em aberto ({money(d.totais.emAberto)})</span>
            {d.totais.faltaData > 0 && (
              <span style={{ color: "rgb(var(--zm-aviso))" }}>
                <b>{d.totais.faltaData}</b> sem data de lavagem ou cobrança
              </span>
            )}
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
                  {/* FAMÍLIA E RESPONSÁVEL, antes de abrir a ficha.
                      A lista mostrava só o nome da PESSOA — e a família
                      costuma se chamar de outro jeito. Procurar "Alcantara"
                      não achava nada quando o contato se chama "Clecia". */}
                  <strong style={{ color: cor.navy, fontSize: 16 }}>
                    (Família - {c.familia || c.nome})
                  </strong>
                  <div style={{ fontSize: 15, color: cor.cinza, marginTop: 2 }}>
                    (Responsável - {c.nome})
                    {!c.ehResponsavel && (
                      <span style={{ color: "rgb(var(--zm-aviso))" }}>
                        {" "}· esta pessoa não é quem acerta a conta
                      </span>
                    )}
                  </div>
                  {/* A ETAPA, ao lado do nome. Ela diz qual é o PRÓXIMO passo
                      daquela família — e não só um rótulo de estado. Quem abre
                      a lista para trabalhar precisa saber onde continuar. */}
                  {/* O SELO DIZ A TAREFA, e vem da mesma conta da ficha (0106).
                      "iniciar controle" aparecia numa família conferida, com
                      contrato completo — porque esta lista fazia a própria
                      conta, olhando campos que a D-24 esvaziou. Agora o texto
                      vem de `falta`, que é o próximo passo em português. */}
                  {c.etapa && c.etapa !== "operacional" && (
                    <span style={{
                      marginLeft: 8, borderRadius: 999, padding: "2px 9px", fontSize: 12,
                      fontWeight: 600, whiteSpace: "nowrap",
                      background: c.etapa === "pronta"
                        ? "rgb(var(--zm-teal) / 0.12)" : "rgb(var(--zm-aviso) / 0.12)",
                      color: c.etapa === "pronta" ? cor.teal : "rgb(var(--zm-aviso))",
                    }}>
                      {c.etapa === "pronta" ? "aguardando a 1ª limpeza"
                        : c.falta || (c.etapa === "sem_tumulo" ? "ligar o túmulo" : "completar o contrato")}
                    </span>
                  )}
                  {/* Quem já recebeu o ok da conferência não pode parecer
                      pendente: era a contradição que o usuário viu na tela. */}
                  {c.conferidaEm && (
                    <span style={{
                      marginLeft: 6, borderRadius: 999, padding: "2px 9px", fontSize: 12,
                      fontWeight: 600, whiteSpace: "nowrap",
                      background: "rgb(var(--zm-teal) / 0.12)", color: cor.teal,
                    }}>
                      conferida
                    </span>
                  )}
                  <div style={{ fontSize: 15, color: cor.cinza, marginTop: 3 }}>
                    {(c.jazigos || []).map((j: any) => `${j.id}${j.quadra ? ` (${j.quadra}${j.rua ? " · " + j.rua : ""})` : ""}`).join(" + ") || "sem jazigo"}
                  </div>
                  <div style={{ fontSize: 15, color: cor.cinza, marginTop: 3 }}>
                    {(c.cadenciasRotulo || []).join(", ") || "sem ritmo definido"}
                    {c.mensal > 0 && ` · ${money(c.mensal)}/mês`}
                    {c.modo === "automatico" && " · IA automática"}
                    {!c.ativo_ia && " · IA desligada"}
                    {c.envio_automatico === false && (
                      <span style={{ color: "rgb(var(--zm-aviso))", fontWeight: 600 }}> · em revisão (não envia)</span>
                    )}
                  </div>
                  <div style={{ fontSize: 15, marginTop: 3,
                                color: c.faltaData ? "rgb(var(--zm-aviso))" : cor.cinza }}>
                    {c.proximaLavagem
                      ? `Lava em ${new Date(c.proximaLavagem + "T12:00:00").toLocaleDateString("pt-BR")}`
                      : "Sem data de lavagem"}
                    {" · "}
                    {c.proximaCobranca
                      ? `Cobra em ${new Date(c.proximaCobranca + "T12:00:00").toLocaleDateString("pt-BR")}`
                      : "Sem data de cobrança"}
                    {c.faltaData && " ← falta preencher"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <b style={{ color: c.atrasado ? "rgb(var(--zm-perigo))" : c.saldo > 0 ? cor.teal : cor.cinza, fontSize: 16 }}>
                    {c.saldo === 0 ? "em dia" : money(Math.abs(c.saldo))}
                  </b>
                  <div style={{ fontSize: 14, color: cor.cinza }}>
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
    nome: "", telefone: "", tratamento: "a senhora", consentimento: false,
    // jazigo
    jazigoModo: "novo" as "novo" | "vincular",
    vincularTumuloId: "",
    identificacao: "", quadraCodigo: "", rua: "", falecidoNome: "",
    // plano
    atalho: 2, // índice em ATALHOS_FREQUENCIA (2 = "Uma vez por mês")
    valorMensal: "", inicio: "",  // texto: pt-BR aceita "40,50"
  });
  const [quadras, setQuadras] = useState<string[]>([]);
  const [semDono, setSemDono] = useState<any[]>([]);
  const [csv, setCsv] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    fetch("/api/tumulos").then((x) => x.json()).then((r) => {
      if (!r?.ok) return;
      const codigos = (r.cemiterios || []).flatMap((c: any) => (c.quadras || []).map((q: any) => q.codigo));
      setQuadras([...new Set<string>(codigos)]);
      setSemDono(r.semDono || []);
    }).catch(() => {});
  }, []);

  async function criar() {
    if (!f.nome.trim() || !f.telefone.trim()) return alert("Nome e telefone são obrigatórios.");
    if (f.jazigoModo === "vincular" && !f.vincularTumuloId) return alert("Escolha o jazigo já cadastrado ou troque para “novo”.");


    const at = ATALHOS_FREQUENCIA[f.atalho];
    const temJazigo = f.jazigoModo === "vincular" ? !!f.vincularTumuloId : !!f.identificacao.trim();
    // valor em pt-BR: NaN quando nao entende, e NaN barra aqui em vez de virar
    // preco errado no banco (antes o padrao 40 entrava calado como honorario).
    const mensal = numeroBR(f.valorMensal);
    if (temJazigo && at.cadencia !== "avulso" && (!isFinite(mensal) || mensal <= 0)) {
      return alert("Digite o valor de UMA limpeza como 40 ou 40,50 (sem R$ e sem separador de milhar).");
    }

    setOcupado(true);
    const r = await fetch("/api/clientes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: f.nome, telefone: f.telefone, tratamento: f.tratamento, consentimento: f.consentimento,
        jazigo: f.jazigoModo === "vincular"
          ? { vincularTumuloId: f.vincularTumuloId, falecidoNome: f.falecidoNome }
          : { identificacao: f.identificacao, quadraCodigo: f.quadraCodigo, rua: f.rua, falecidoNome: f.falecidoNome },
        // só manda plano se há jazigo e a periodicidade não é avulso
        plano: temJazigo && at.cadencia !== "avulso"
          ? { cadencia: at.cadencia, lavagensPorCiclo: at.lavagens, valorMensal: Math.round(mensal * 100) / 100, inicio: f.inicio || undefined }
          : undefined,
      }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (!r?.ok) return alert("Falhou: " + (r?.erro || "erro"));
    // a familia e criada mesmo se o jazigo/plano falhar — antes isso era mudo.
    if (r.avisoJazigo) alert("Familia cadastrada, mas o jazigo NAO entrou:\n\n" + r.avisoJazigo);
    else if (r.avisoPlano) alert("Familia e jazigo cadastrados, mas o plano nao foi criado:\n\n" + r.avisoPlano);
    onPronto();
  }

  async function importar() {
    if (!csv.trim()) return;
    setOcupado(true);
    const r = await fetch("/api/tumulos/importar", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (!r?.ok) { alert("Falhou: " + (r?.erro || "erro")); return; }
    // r.criados e um objeto {clientes, tumulos, planos} — o alert antigo escrevia
    // "[object Object] linha(s)". E r.erros, que e onde moram TODAS as linhas
    // recusadas (valor ilegivel, jazigo de outra familia, duplicata), nao
    // aparecia em lugar nenhum: 45 familias podiam ficar de fora e a tela dizia
    // "pronto".
    const c = r.criados || {};
    const partes = [
      `${c.clientes || 0} familia(s)`,
      `${c.tumulos || 0} jazigo(s)`,
      `${c.planos || 0} plano(s)`,
    ].join(", ");
    const erros: { linha: number; motivo: string }[] = r.erros || [];
    if (erros.length) {
      const lista = erros.slice(0, 20).map((e) => `linha ${e.linha}: ${e.motivo}`).join("\n");
      const resto = erros.length > 20 ? `\n… e mais ${erros.length - 20} linha(s).` : "";
      alert(
        `Importado: ${partes}.\n\n${erros.length} linha(s) NAO entraram:\n\n${lista}${resto}` +
        "\n\nCorrija essas linhas na planilha e importe so elas de novo."
      );
    } else {
      alert(`Importado: ${partes}.`);
    }
    onPronto();
  }

  const secao: React.CSSProperties = { borderTop: `1px solid ${cor.linha}`, marginTop: 14, paddingTop: 12 };
  const tituloSecao: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: cor.cinza, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 };

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
          {/* FAMÍLIA */}
          <div style={tituloSecao}>Família</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={painel.rotulo}>Nome da família</label>
              <input style={painel.input} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })}
                     placeholder="Família SILVA" />
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

          {/* JAZIGO E LOCALIZAÇÃO */}
          <div style={secao}>
            <div style={tituloSecao}>Jazigo e localização</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button style={f.jazigoModo === "novo" ? painel.botaoMiniSec : { ...painel.botaoMiniSec, opacity: 0.6 }}
                      onClick={() => setF({ ...f, jazigoModo: "novo" })}>Novo jazigo</button>
              {semDono.length > 0 && (
                <button style={f.jazigoModo === "vincular" ? painel.botaoMiniSec : { ...painel.botaoMiniSec, opacity: 0.6 }}
                        onClick={() => setF({ ...f, jazigoModo: "vincular" })}>
                  Vincular jazigo do campo ({semDono.length})
                </button>
              )}
            </div>

            {f.jazigoModo === "novo" ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={painel.rotulo}>Identificação (lote/número)</label>
                  <input style={painel.input} value={f.identificacao}
                         onChange={(e) => setF({ ...f, identificacao: e.target.value })} placeholder="045 · lote 12" />
                </div>
                <div>
                  <label style={painel.rotulo}>Quadra</label>
                  <input style={{ ...painel.input, width: 130 }} value={f.quadraCodigo} list="quadras-cad"
                         onChange={(e) => setF({ ...f, quadraCodigo: e.target.value })} placeholder="Q-12" />
                  <datalist id="quadras-cad">{quadras.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label style={painel.rotulo}>Rua</label>
                  <input style={{ ...painel.input, width: 100 }} value={f.rua}
                         onChange={(e) => setF({ ...f, rua: e.target.value })} placeholder="RUA 1" />
                </div>
                {/* a quadra deixou de ser obrigatoria: quem ainda nao mapeou o
                    cemiterio precisa cadastrar hoje. Mas o balde "S/Q" junta
                    todos, e dois jazigos com o mesmo numero la dentro sao
                    tratados como o MESMO jazigo — por isso o aviso. */}
                <p style={{ fontSize: 13, color: cor.cinza, margin: "6px 0 0", width: "100%" }}>
                  Sem quadra? Deixe em branco: o jazigo entra em “S/Q” e ganha a quadra
                  certa na primeira passagem do campo. Atenção: dentro de “S/Q”, dois
                  jazigos com a mesma identificação são tratados como o mesmo túmulo.
                </p>
              </div>
            ) : (
              <div>
                <label style={painel.rotulo}>Jazigo já cadastrado (capturado no campo)</label>
                <select style={painel.input} value={f.vincularTumuloId}
                        onChange={(e) => setF({ ...f, vincularTumuloId: e.target.value })}>
                  <option value="">— escolha —</option>
                  {semDono.map((t) => (
                    <option key={t.id} value={t.id}>
                      {[t.quadra, t.identificacao, t.rua].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <label style={painel.rotulo}>Falecido (opcional)</label>
              <input style={painel.input} value={f.falecidoNome}
                     onChange={(e) => setF({ ...f, falecidoNome: e.target.value })} placeholder="Nome no jazigo" />
            </div>
          </div>

          {/* PLANO / PERIODICIDADE / VENCIMENTO */}
          <div style={secao}>
            <div style={tituloSecao}>Plano e periodicidade</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 190 }}>
                <label style={painel.rotulo}>Frequência das lavagens</label>
                <select style={painel.input} value={f.atalho}
                        onChange={(e) => setF({ ...f, atalho: Number(e.target.value) })}>
                  {ATALHOS_FREQUENCIA.map((a, i) => <option key={i} value={i}>{a.rotulo}</option>)}
                </select>
              </div>
              <div>
                <label style={painel.rotulo}>Valor por limpeza</label>
                <input type="text" inputMode="decimal" placeholder="40,00"
                       style={{ ...painel.input, width: 110 }} value={f.valorMensal}
                       onChange={(e) => setF({ ...f, valorMensal: e.target.value })} />
              </div>
              <div>
                <label style={painel.rotulo}>1ª lavagem</label>
                <input type="date" style={{ ...painel.input, width: 160 }} value={f.inicio}
                       onChange={(e) => setF({ ...f, inicio: e.target.value })} />
              </div>
            </div>
            <p style={{ fontSize: 13, color: cor.cinza, margin: "8px 0 0" }}>
              A 1ª lavagem e a próxima cobrança já entram na data escolhida (ou hoje). “Só quando pedirem” não cria plano.
            </p>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, margin: "14px 0" }}>
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
            Cole a planilha COM a linha de cabeçalho
          </label>
          {/* o rotulo antigo anunciava uma ordem de colunas que a API nao aceita
              (e sem cabecalho); quem seguia a tela levava erro de cabecalho. */}
          <textarea style={{ ...painel.input, minHeight: 140, fontFamily: "monospace", fontSize: 15 }}
                    value={csv} onChange={(e) => setCsv(e.target.value)}
                    placeholder={"quadra;identificacao;falecido;cliente_nome;telefone;cadencia;qtd;valor\nQD 1;128;JOSE SILVA;MARIA SILVA;11999998888;mensal;1;40,00"} />
          <p style={{ fontSize: 13, color: cor.cinza, margin: "6px 0 0" }}>
            Obrigatórias: <b>quadra, identificacao, cliente_nome, telefone</b>. As outras são
            opcionais — sem <b>cadencia</b> o jazigo entra sem plano. Valor em reais (40 ou 40,00);
            valor que o sistema não entender faz a linha ser recusada, nunca vira um preço chutado.
          </p>
          <button style={{ ...painel.botao, marginTop: 10 }} onClick={importar} disabled={ocupado}>
            {ocupado ? "Importando…" : "Importar"}
          </button>
        </>
      )}
    </div>
  );
}
