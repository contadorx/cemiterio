"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../ui";
import BuscaSelect from "../BuscaSelect";

/**
 * /painel/jazigos — a tela de correção em lote.
 *
 * POR QUE ELA EXISTE
 * ---------------------------------------------------------------------------
 * O cadastro de campo procura, dentro da quadra, um jazigo com a mesma
 * identificação. Se acha, ele NÃO cria outro: devolve aquele e grava a foto e o
 * GPS por cima. Como o formulário do campo não pergunta a rua/carreira, dois
 * túmulos diferentes com o mesmo número em ruas diferentes da mesma quadra
 * viravam UMA LINHA. A descrição ficava a do primeiro, a foto e o GPS os do
 * segundo. Não é erro de digitação — é o sistema achando que sabe.
 *
 * Aqui a foto fica DO LADO da descrição, tudo é editável na hora, e existe o
 * botão que faltava: SEPARAR, que devolve a foto e o GPS para um jazigo novo e
 * deixa o antigo com o que sempre foi dele.
 */

interface Jazigo {
  id: string;
  identificacao: string;
  rua: string | null;
  numero: string | null;
  quadraId: string;
  quadra: string | null;
  cemiterio: string | null;
  clienteId: string | null;
  cliente: string | null;
  /** O vínculo de verdade desde a 0091. `cliente` é o contato derivado dela. */
  familiaId: string | null;
  familia: string | null;
  falecido: string | null;
  observacoes: string | null;
  lat: number | null;
  lng: number | null;
  gpsPrecisao: number | null;
  gpsAmostras: number;
  gpsEm: string | null;
  fotoLapide: string | null;
  fotoLonge: string | null;
  criadoEm: string;
  alteradoEm: string | null;
  suspeito: boolean;
  motivos: string[];
}

interface Quadra { id: string; codigo: string; cemiterio: string | null }
/** A lista continua se chamando `Cliente` na resposta da API, mas desde a
    0091 o conteúdo é de FAMÍLIAS — inclusive as que ainda não têm contato. */
interface Cliente { id: string; nome: string; contato?: string | null; semContato?: boolean }

const VERMELHO = "#b91c1c";
const AMBAR = "#b45309";

function quando(d: string | null) {
  if (!d) return "—";
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}

export default function JazigosPage() {
  const [dados, setDados] = useState<{
    jazigos: Jazigo[]; quadras: Quadra[]; clientes: Cliente[]; ruas: string[];
    total: number; suspeitos: number; completo: boolean;
  } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [quadraFiltro, setQuadraFiltro] = useState("");
  const [ruaFiltro, setRuaFiltro] = useState("");

  // A ficha da família manda para cá com a rua já escolhida ("corrigir em
  // Jazigos"). Sem ler o endereço, a pessoa cairia na lista inteira e teria
  // que procurar de novo o jazigo que estava vendo.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("rua");
    if (r) setRuaFiltro(r);
  }, []);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    const p = new URLSearchParams();
    if (filtro !== "todos") p.set("filtro", filtro);
    if (quadraFiltro) p.set("quadra", quadraFiltro);
    if (ruaFiltro) p.set("rua", ruaFiltro);
    const r = await fetch(`/api/jazigos?${p.toString()}`).then((x) => x.json()).catch(() => null);
    if (!r?.ok) setErro(r?.erro || "não consegui carregar a lista");
    else { setErro(""); setDados(r); }
    setCarregando(false);
  }, [filtro, quadraFiltro, ruaFiltro]);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    const js = dados?.jazigos || [];
    const b = busca.trim().toLowerCase();
    if (!b) return js;
    return js.filter((j) =>
      [j.identificacao, j.rua, j.numero, j.falecido, j.cliente, j.quadra]
        .filter(Boolean).join(" ").toLowerCase().includes(b));
  }, [dados, busca]);

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/jazigos" />
      <main style={painel.conteudo}>
        <h1 style={painel.h1}>Jazigos</h1>

        <div style={{ ...painel.card, background: "#f8fafc" }}>
          <strong style={{ color: cor.navy }}>Por que a foto não bate com a descrição</strong>
          <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 0", lineHeight: 1.6 }}>
            Ao cadastrar no campo, o sistema procura na quadra um jazigo com o{" "}
            <b>mesmo número</b>. Se acha, ele não cria outro — grava a foto e o GPS por cima
            daquele. Como o formulário do campo não perguntava a rua, dois túmulos com o mesmo
            número em ruas diferentes viraram uma linha só: descrição de um, foto do outro.
            Não foi você que errou.
            <br /><br />
            Nesta tela a foto fica ao lado da descrição. Quando não combinarem, use{" "}
            <b>Separar</b>: a foto e o GPS saem daqui e vão para um jazigo novo, e este volta a
            ter só o que sempre foi dele.
          </p>
        </div>

        <div style={{ ...painel.card, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...painel.input, maxWidth: 260, margin: 0 }}
              placeholder="buscar número, nome, família…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select
              style={{ ...painel.input, maxWidth: 180, margin: 0 }}
              value={quadraFiltro}
              onChange={(e) => setQuadraFiltro(e.target.value)}
            >
              <option value="">todas as quadras</option>
              {(dados?.quadras || []).map((q) => (
                <option key={q.id} value={q.id}>{q.codigo}</option>
              ))}
            </select>

            {/* FILTRO POR RUA.
                Quadra sozinha não estreita o bastante: a Quadra 1 tem dezenas
                de jazigos em dez ruas. Quem corrige cadastro trabalha por rua,
                que é como a Nina anda. */}
            <select
              style={{ ...painel.input, width: "auto" }}
              value={ruaFiltro}
              onChange={(e) => setRuaFiltro(e.target.value)}
            >
              <option value="">todas as ruas</option>
              {(dados?.ruas || []).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {[
              ["todos", "Todos"],
              ["suspeitos", "⚠ Suspeitos"],
              ["semdono", "Sem família"],
              ["semfoto", "Sem foto"],
              ["semgps", "Sem GPS"],
            ].map(([v, r]) => (
              <button
                key={v}
                style={filtro === v ? painel.botaoMini : painel.botaoMiniSec}
                onClick={() => setFiltro(v)}
              >
                {r}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 15, color: cor.cinza }}>
              {lista.length} de {dados?.total ?? 0}
              {dados?.suspeitos ? ` · ${dados.suspeitos} suspeito(s)` : ""}
            </span>
          </div>
        </div>

        {erro && (
          <div style={{ ...painel.card, borderLeft: `4px solid ${VERMELHO}`, background: "#fef2f2" }}>
            <strong style={{ color: VERMELHO }}>{erro}</strong>
          </div>
        )}

        {carregando ? (
          <p style={{ color: cor.cinza }}>Carregando…</p>
        ) : lista.length === 0 ? (
          <div style={painel.card}>
            <p style={{ color: cor.cinza, margin: 0 }}>Nenhum jazigo nesse filtro.</p>
          </div>
        ) : (
          lista.map((j) => (
            <Cartao
              key={j.id}
              j={j}
              quadras={dados?.quadras || []}
              clientes={dados?.clientes || []}
              onMudou={carregar}
            />
          ))
        )}
      </main>
    </div>
  );
}

/* ========================================================================== */

function Cartao({
  j, quadras, clientes, onMudou,
}: { j: Jazigo; quadras: Quadra[]; clientes: Cliente[]; onMudou: () => void }) {
  const [f, setF] = useState({
    identificacao: j.identificacao || "",
    rua: j.rua || "",
    numero: j.numero || "",
    quadra_id: j.quadraId,
    falecido_nome: j.falecido || "",
    familia_id: j.familiaId || "",
    observacoes: j.observacoes || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [separando, setSeparando] = useState(false);
  const [criandoFamilia, setCriandoFamilia] = useState(false);
  const [nova, setNova] = useState({ nome: "", contatoNome: "", contatoTel: "" });
  const [aviso, setAviso] = useState("");

  /**
   * CRIAR A FAMÍLIA E JÁ LIGAR ESTE JAZIGO A ELA.
   *
   * Dois passos, um toque. Criar a família e depois pedir para a pessoa achar o
   * jazigo de novo no meio de duzentos é o que fazia o vínculo ficar para
   * depois — e depois vira nunca.
   *
   * O CONTATO É OPCIONAL, e é o ponto: desde a 0091 a família existe sem
   * ninguém, e as limpezas dela viram cobrança do mesmo jeito. Exigir telefone
   * aqui reconstruiria a parede que a 0091 derrubou.
   *
   * Se a família for criada e o vínculo falhar, a tela DIZ — em vez de deixar
   * uma família órfã no cadastro sem ninguém saber que ela nasceu.
   */
  async function criarFamiliaEVincular() {
    const nome = nova.nome.trim();
    if (!nome) return;
    setSalvando(true); setErro(""); setMsg(""); setAviso("");
    try {
      const corpo: any = { nome };
      if (nova.contatoNome.trim() || nova.contatoTel.trim()) {
        corpo.contato = { nome: nova.contatoNome.trim(), telefone: nova.contatoTel.trim() };
      }
      const r = await fetch("/api/familias", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      }).then((x) => x.json()).catch(() => null);

      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não consegui criar a família"); return; }
      if (r.avisoContato) setAviso(r.avisoContato);
      // Nome repetido não é erro — mas a pessoa precisa saber, ou o cemitério
      // acaba com duas "Família Silva" e a conta partida ao meio.
      if (r.homonimas?.length) {
        setAviso((a) => [a, `Atenção: já existe "${r.homonimas[0]}" com o mesmo nome.`]
          .filter(Boolean).join(" "));
      }

      const v = await fetch(`/api/tumulos/${j.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familia_id: r.familiaId }),
      }).then((x) => x.json()).catch(() => null);

      if (!v?.ok) {
        setErro(`A família "${nome}" foi criada, mas não consegui ligar o jazigo a ela. `
                + `Procure a família na lista acima e salve.`);
        onMudou();
        return;
      }

      setF((x) => ({ ...x, familia_id: r.familiaId }));
      setMsg(`família "${nome}" criada e ligada a este jazigo`);
      setCriandoFamilia(false);
      setNova({ nome: "", contatoNome: "", contatoTel: "" });
      onMudou();
    } finally { setSalvando(false); }
  }

  const mudou =
    f.identificacao !== (j.identificacao || "") ||
    f.rua !== (j.rua || "") ||
    f.numero !== (j.numero || "") ||
    f.quadra_id !== j.quadraId ||
    f.falecido_nome !== (j.falecido || "") ||
    f.familia_id !== (j.familiaId || "") ||
    f.observacoes !== (j.observacoes || "");

  async function patch(corpo: Record<string, any>, sucesso: string) {
    setSalvando(true); setErro(""); setMsg("");
    const r = await fetch(`/api/tumulos/${j.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não consegui salvar"); return; }
    setMsg(sucesso);
    onMudou();
  }

  async function excluir() {
    if (!confirm(`Excluir o jazigo ${j.identificacao}? Só dá certo se ele não tiver limpeza feita.`)) return;
    setSalvando(true); setErro("");
    const r = await fetch(`/api/tumulos/${j.id}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não consegui excluir"); return; }
    onMudou();
  }

  return (
    <div
      style={{
        ...painel.card,
        borderLeft: j.suspeito ? `4px solid ${AMBAR}` : `4px solid ${cor.linha}`,
      }}
    >
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {/* ---- as fotos, do lado da descrição: é essa comparação que denuncia ---- */}
        <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
          <Foto url={j.fotoLapide} rotulo="lápide" onApagar={() => patch({ limparFoto: "lapide" }, "foto da lápide desligada")} />
          <Foto url={j.fotoLonge} rotulo="de longe" onApagar={() => patch({ limparFoto: "longe" }, "foto de longe desligada")} />
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ color: cor.navy, fontSize: 17 }}>
              {j.quadra || "?"} · {j.identificacao}
            </b>
            <span style={{ color: cor.cinza, fontSize: 14 }}>
              {j.cemiterio || ""} · cadastrado {quando(j.criadoEm)}
            </span>
            {j.familiaId ? (
              <Link
                href={j.clienteId ? `/painel/clientes/${j.clienteId}` : `/painel/clientes?familia=${j.familiaId}`}
                style={{ color: cor.teal, fontSize: 14 }}
              >
                {j.familia || j.cliente}
              </Link>
            ) : (
              <span style={{ color: AMBAR, fontSize: 14 }}>sem família</span>
            )}
            {/* FAMÍLIA SEM CONTATO É ESTADO LEGÍTIMO (0091) — e precisa
                aparecer aqui, senão a Sureya só descobre quando a mensagem não
                chega em ninguém. */}
            {j.familiaId && !j.clienteId && (
              <span style={{ color: AMBAR, fontSize: 13 }}>· sem contato</span>
            )}
          </div>

          {j.suspeito && (
            <div style={{ color: AMBAR, fontSize: 14, marginTop: 4 }}>
              ⚠ {(j.motivos || []).join(" · ")}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <Campo rotulo="Quadra" largura={120}>
              <select
                style={{ ...painel.input, margin: 0 }}
                value={f.quadra_id}
                onChange={(e) => setF({ ...f, quadra_id: e.target.value })}
              >
                {quadras.map((q) => <option key={q.id} value={q.id}>{q.codigo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Número / lote" largura={110}>
              <input
                style={{ ...painel.input, margin: 0 }}
                value={f.identificacao}
                onChange={(e) => setF({ ...f, identificacao: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Rua / carreira" largura={110}>
              <input
                style={{ ...painel.input, margin: 0 }}
                value={f.rua}
                placeholder="ex.: 3"
                onChange={(e) => setF({ ...f, rua: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Falecido" largura={200}>
              <input
                style={{ ...painel.input, margin: 0 }}
                value={f.falecido_nome}
                onChange={(e) => setF({ ...f, falecido_nome: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Família" largura={220}>
              {/* São quase 300 famílias: o `select` do navegador não filtra e
                  não diz quantas existem. */}
              <BuscaSelect
                valor={f.familia_id}
                // A nota diz COM QUEM se fala nesta família — ou que não há
                // ninguém. Duas "Família Silva" na lista são indistinguíveis
                // sem isso, e escolher a errada manda a cobrança para a casa
                // errada.
                opcoes={clientes.map((c) => ({
                  id: c.id,
                  nome: c.nome,
                  nota: c.semContato ? "ainda sem contato" : c.contato || null,
                }))}
                vazio="— sem família —"
                aoEscolher={(id) => setF({ ...f, familia_id: id })}
              />
              {/* O CAMINHO QUE FALTAVA.
                  A busca só acha o que já existe. Cadastrando o cemitério, a
                  família de um jazigo quase sempre AINDA NÃO EXISTE — e sair
                  desta tela para criá-la em outra, e voltar para achar o mesmo
                  jazigo no meio de duzentos, é o trabalho que fazia a pessoa
                  deixar o vínculo para depois. Depois vira nunca: são 75
                  jazigos sem família hoje. */}
              <button
                style={{ ...painel.botaoMiniSec, marginTop: 6, width: "100%" }}
                onClick={() => setCriandoFamilia((x) => !x)}
              >
                {criandoFamilia ? "cancelar" : "+ Nova família"}
              </button>
            </Campo>
          </div>

          {criandoFamilia && (
            <div style={{
              marginTop: 10, padding: 12, borderRadius: 12,
              border: `1px solid ${cor.linha}`, background: "rgb(var(--zm-fundo))",
            }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <Campo rotulo="Nome da família" largura={240}>
                  <input
                    style={{ ...painel.input, margin: 0 }}
                    autoFocus
                    placeholder="ex.: Família Nagae"
                    value={nova.nome}
                    onChange={(e) => setNova({ ...nova, nome: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter" && nova.nome.trim()) criarFamiliaEVincular(); }}
                  />
                </Campo>
                {/* CONTATO OPCIONAL, e o rótulo diz isso.
                    Um campo que parece obrigatório é obrigatório na prática:
                    quem não tem o número desiste da linha inteira em vez de
                    cadastrar a família e voltar depois. */}
                <Campo rotulo="Contato (se tiver)" largura={180}>
                  <input
                    style={{ ...painel.input, margin: 0 }}
                    placeholder="nome de quem fala"
                    value={nova.contatoNome}
                    onChange={(e) => setNova({ ...nova, contatoNome: e.target.value })}
                  />
                </Campo>
                <Campo rotulo="WhatsApp (se tiver)" largura={170}>
                  <input
                    style={{ ...painel.input, margin: 0 }}
                    inputMode="tel"
                    placeholder="com DDD"
                    value={nova.contatoTel}
                    onChange={(e) => setNova({ ...nova, contatoTel: e.target.value })}
                  />
                </Campo>
                <button
                  style={nova.nome.trim() ? painel.botaoMini : painel.botaoMiniSec}
                  disabled={!nova.nome.trim() || salvando}
                  onClick={criarFamiliaEVincular}
                >
                  {salvando ? "Criando…" : "Criar e ligar a este jazigo"}
                </button>
              </div>
              <p style={{ fontSize: 13, color: cor.cinza, margin: "8px 2px 0", lineHeight: 1.45 }}>
                Sem contato a família é criada assim mesmo e o jazigo fica ligado a ela.
                As limpezas <b>viram cobrança normalmente</b> — o telefone entra quando aparecer.
              </p>
              {aviso && (
                <p style={{ fontSize: 13, color: AMBAR, margin: "6px 2px 0" }}>{aviso}</p>
              )}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <Campo rotulo="Observações" largura={520}>
              <input
                style={{ ...painel.input, margin: 0 }}
                value={f.observacoes}
                onChange={(e) => setF({ ...f, observacoes: e.target.value })}
              />
            </Campo>
          </div>

          <div style={{ fontSize: 14, color: cor.cinza, marginTop: 8 }}>
            {j.lat !== null
              ? <>GPS: {Number(j.lat).toFixed(6)}, {Number(j.lng).toFixed(6)} · {j.gpsAmostras} leitura(s)
                  {j.gpsPrecisao ? ` · ±${Math.round(j.gpsPrecisao)}m` : ""} · {quando(j.gpsEm)}</>
              : "sem GPS marcado"}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {/* O botão fica apagado até algo mudar. Antes isso passava por
                "não tem salvar": um botão cinza, sem rótulo de estado, parece
                ausente. O texto agora diz em que pé está. */}
            <button
              style={mudou ? painel.botaoMini : painel.botaoMiniSec}
              disabled={!mudou || salvando}
              onClick={() => patch(
                { ...f, familia_id: f.familia_id || null, rua: f.rua || null, numero: f.numero || null },
                "salvo",
              )}
            >
              {salvando ? "Salvando…" : mudou ? "Salvar alterações" : "Salvar (nada mudou ainda)"}
            </button>
            {j.lat !== null && (
              <button
                style={painel.botaoMiniSec}
                disabled={salvando}
                onClick={() => {
                  if (!confirm("Apagar a posição deste jazigo? Ele sai do mapa até alguém remarcar no campo.")) return;
                  patch({ limparGps: true }, "posição apagada — remarque na próxima passagem");
                }}
              >
                Apagar GPS
              </button>
            )}
            <button
              style={painel.botaoMiniSec}
              disabled={salvando}
              onClick={() => setSeparando((x) => !x)}
            >
              {separando ? "Cancelar" : "Separar em dois"}
            </button>
            <button style={painel.botaoMiniSec} disabled={salvando} onClick={excluir}>
              Excluir
            </button>
            {msg && <span style={{ color: "#166534", fontSize: 14, alignSelf: "center" }}>✓ {msg}</span>}
            {erro && <span style={{ color: VERMELHO, fontSize: 14, alignSelf: "center" }}>{erro}</span>}
          </div>

          {separando && (
            <Separar j={j} onPronto={() => { setSeparando(false); onMudou(); }} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */

function Separar({ j, onPronto }: { j: Jazigo; onPronto: () => void }) {
  const [ident, setIdent] = useState("");
  const [rua, setRua] = useState("");
  const [falecido, setFalecido] = useState("");
  const [levar, setLevar] = useState<"ambos" | "fotos" | "gps">("ambos");
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState("");

  async function separar() {
    if (!ident.trim()) { setErro("Diga o número do jazigo novo."); return; }
    setIndo(true); setErro("");
    const r = await fetch(`/api/tumulos/${j.id}/separar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identificacao: ident.trim(),
        rua: rua.trim() || undefined,
        falecidoNome: falecido.trim() || undefined,
        levar,
      }),
    }).then((x) => x.json()).catch(() => null);
    setIndo(false);
    if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não consegui separar"); return; }
    onPronto();
  }

  return (
    <div style={{ marginTop: 12, padding: 12, background: "#fffbeb", borderRadius: 8, border: "1px solid #fde68a" }}>
      <strong style={{ color: "#92400e" }}>Separar em dois jazigos</strong>
      <p style={{ color: "#78350f", fontSize: 14, margin: "6px 0 10px", lineHeight: 1.6 }}>
        Isto cria um jazigo novo na quadra <b>{j.quadra}</b> e <b>muda de lugar</b> a foto e o
        GPS: eles saem deste registro e passam para o novo. Não é cópia. Este aqui fica com a
        descrição dele e <b>sem foto e sem posição</b> — que é a verdade, porque a foto dele
        nunca chegou a ser tirada. Remarque no campo na próxima passagem.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Campo rotulo="Número do novo" largura={120}>
          <input
            style={{ ...painel.input, margin: 0 }}
            value={ident}
            placeholder={`ex.: ${j.identificacao}-B`}
            onChange={(e) => setIdent(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Rua / carreira" largura={110}>
          <input style={{ ...painel.input, margin: 0 }} value={rua} onChange={(e) => setRua(e.target.value)} />
        </Campo>
        <Campo rotulo="Falecido (do novo)" largura={220}>
          <input style={{ ...painel.input, margin: 0 }} value={falecido} onChange={(e) => setFalecido(e.target.value)} />
        </Campo>
        <Campo rotulo="Levar para o novo" largura={160}>
          <select style={{ ...painel.input, margin: 0 }} value={levar} onChange={(e) => setLevar(e.target.value as any)}>
            <option value="ambos">foto e GPS</option>
            <option value="fotos">só as fotos</option>
            <option value="gps">só o GPS</option>
          </select>
        </Campo>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
        <button style={painel.botaoMini} disabled={indo} onClick={separar}>
          {indo ? "separando…" : "Separar"}
        </button>
        {erro && <span style={{ color: VERMELHO, fontSize: 14 }}>{erro}</span>}
      </div>
    </div>
  );
}

/* ========================================================================== */

function Foto({ url, rotulo, onApagar }: { url: string | null; rotulo: string; onApagar: () => void }) {
  if (!url) {
    return (
      <div style={{
        width: 130, height: 100, borderRadius: 8, background: "#f1f5f9",
        border: `1px dashed ${cor.linha}`, display: "flex", alignItems: "center",
        justifyContent: "center", color: cor.cinza, fontSize: 13, textAlign: "center",
      }}>
        sem foto<br />{rotulo}
      </div>
    );
  }
  return (
    <div style={{ width: 130 }}>
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`foto ${rotulo}`}
          style={{ width: 130, height: 100, objectFit: "cover", borderRadius: 8, border: `1px solid ${cor.linha}`, display: "block" }}
        />
      </a>
      <button
        style={{ ...painel.botaoMiniSec, width: "100%", marginTop: 4, fontSize: 13 }}
        onClick={() => {
          if (confirm(`Apagar a foto (${rotulo}) deste jazigo?`)) onApagar();
        }}
      >
        apagar {rotulo}
      </button>
    </div>
  );
}

function Campo({ rotulo, largura, children }: { rotulo: string; largura: number; children: React.ReactNode }) {
  return (
    <div style={{ width: largura, maxWidth: "100%" }}>
      <div style={{ fontSize: 13, color: cor.cinza, marginBottom: 2 }}>{rotulo}</div>
      {children}
    </div>
  );
}
