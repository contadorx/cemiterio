"use client";

/**
 * O antigo /painel/mapa, agora como ABA da Carteira.
 *
 * A planta desenha os MESMOS jazigos das outras abas, com a MESMA regua de cor
 * de vencimento. Ficar em outro menu obrigava a sair da carteira para ver a
 * carteira. /painel/mapa continua de pe e redireciona para ca.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import CorrigirGps from "./CorrigirGps";
import { tilesPara, ATRIBUICAO_PADRAO } from "@/lib/tiles";
import Link from "next/link";
import { painel, cor } from "../ui";
import {
  ajustarAspecto, caixa, centroDe, comprimentoRota, escalaBonita,
  projetar, rotaVizinhoMaisProximo, separarDistantes, type Caixa, type Geo,
} from "@/lib/planta";

const CORES: Record<string, string> = {
  vencido: "#dc2626", semana: "#d97706", mes: "#0f766e", emdia: "#16a34a",
  sem: "#94a3b8", inativo: "#64748b",
};
const ROTULO: Record<string, string> = {
  vencido: "Vencido", semana: "Vence em 7 dias", mes: "Vence no mês", emdia: "Em dia",
  sem: "Sem plano/data", inativo: "Plano inativo",
};
const SITUACOES = ["vencido", "semana", "mes", "emdia", "sem", "inativo"];

const LARGURA = 640;      // proporção da caixa do desenho (não é pixel)
const ALTURA = 440;
const ASPECTO = LARGURA / ALTURA;
const MAX_PARADAS = 60;   // teto da rota sugerida (avisado na tela)

type Jazigo = {
  id: string; identificacao: string; rua: string | null; numero: string | null;
  quadra: string; quadraOrdem: number; cemiterio: string;
  cliente: string | null; clienteId: string | null;
  lat: number | null; lng: number | null; precisao: number | null;
  status: string; proximaCobranca: string | null; proximoServico: string | null;
  valorMensal: number | null; cadencia: string | null; temPlano: boolean;
  ativo: boolean | null;
};

function dataBr(d: string | null) {
  return d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
}

/**
 * Coordenada plausível. O 0,0 do Golfo da Guiné é o retorno clássico de GPS sem
 * sinal e chegou a existir na base; se entrar no desenho, a caixa vai do
 * cemitério até a África e a planta some.
 */
function gpsValido(j: Jazigo): boolean {
  const la = Number(j.lat), ln = Number(j.lng);
  if (j.lat == null || j.lng == null || !isFinite(la) || !isFinite(ln)) return false;
  if (Math.abs(la) < 0.001 && Math.abs(ln) < 0.001) return false;
  return Math.abs(la) <= 90 && Math.abs(ln) <= 180;
}

export default function VisaoMapa() {
  const [jazigos, setJazigos] = useState<Jazigo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [truncado, setTruncado] = useState(false);
  const [limite, setLimite] = useState(0);
  const [cemiterio, setCemiterio] = useState("");
  const [quadra, setQuadra] = useState("");
  const [busca, setBusca] = useState("");
  const [ocultas, setOcultas] = useState<string[]>([]);   // situações desligadas
  const [rotaLigada, setRotaLigada] = useState(false);
  const [selId, setSelId] = useState("");

  // buscar virou funcao com nome porque agora tem quem chame de novo: apagar uma
  // leitura de GPS muda a posicao (ou tira o jazigo do mapa) e a planta na tela
  // continuaria desenhando o ponto velho ate alguem recarregar a pagina.
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let ativo = true;
    fetch("/api/localizacao").then((x) => x.json()).then((r) => {
      if (!ativo) return;
      if (r?.ok) {
        setJazigos(r.jazigos || []);
        setTruncado(!!r.truncado);
        setLimite(Number(r.limite) || 0);
        const cems = [...new Set((r.jazigos || []).map((j: Jazigo) => j.cemiterio))]
          .map(String).sort((a, b) => a.localeCompare(b));
        // so na primeira carga: refazendo depois de apagar, isto jogaria a tela
        // de volta para o primeiro cemiterio, longe de onde a pessoa estava
        if (cems.length) setCemiterio((c) => (c && cems.includes(c) ? c : cems[0]));
      } else {
        // sem isto, falha do endpoint aparecia como "nenhum jazigo com GPS" e
        // mandava a equipe remarcar localização que já existe
        setErro(String(r?.erro || "não consegui carregar os jazigos"));
      }
      setCarregando(false);
    }).catch(() => { if (ativo) { setErro("não consegui falar com o servidor"); setCarregando(false); } });
    return () => { ativo = false; };
  }, [recarga]);

  const cemiterios = useMemo(
    () => [...new Set(jazigos.map((j) => j.cemiterio))].sort((a, b) => a.localeCompare(b)),
    [jazigos],
  );

  // escopo: cemitério escolhido, depois quadra (vazio = todo o cemitério)
  const doCemiterio = useMemo(
    () => jazigos.filter((j) => !cemiterio || j.cemiterio === cemiterio),
    [jazigos, cemiterio],
  );
  const quadrasDoCem = useMemo(() => {
    const m = new Map<string, { codigo: string; ordem: number; total: number; comGps: number }>();
    for (const j of doCemiterio) {
      if (!m.has(j.quadra)) m.set(j.quadra, { codigo: j.quadra, ordem: j.quadraOrdem, total: 0, comGps: 0 });
      const q = m.get(j.quadra)!;
      q.total++;
      if (gpsValido(j)) q.comGps++;
    }
    return [...m.values()].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
  }, [doCemiterio]);

  const escopo = useMemo(
    () => doCemiterio.filter((j) => !quadra || j.quadra === quadra),
    [doCemiterio, quadra],
  );

  const comGps = useMemo(() => escopo.filter(gpsValido), [escopo]);
  const semGps = useMemo(() => escopo.filter((j) => !gpsValido(j)), [escopo]);

  // QUEM É SUSPEITO NÃO PODE DEPENDER DO FILTRO DA TELA. separarDistantes elege
  // a MAIORIA; rodando sobre o escopo já filtrado, o eleitorado mudava a cada
  // clique no menu: o mesmo jazigo estava "no mapa" com o cemitério inteiro
  // (11 leituras concordando) e virava "GPS suspeito — remarque" ao escolher a
  // quadra dele (2 leituras = empate garantido = ninguém desenhado), com a
  // quadra exibindo 0% mapeado. Nada nos dados tinha mudado.
  //
  // Agora a eleição roda UMA vez por CEMITÉRIO, sobre todos os jazigos dele
  // (nem o menu de cemitério entra na conta), e o escopo só filtra o resultado.
  // Cemitérios diferentes não se julgam — o que também evita que a planta de um
  // condene a do outro. Fica de fora dessa proteção o balde "sem cemitério":
  // ali podem conviver cemitérios de verdade, e o texto do aviso diz isso.
  const suspeitos = useMemo(() => {
    const porCem = new Map<string, Jazigo[]>();
    for (const j of jazigos) {
      if (!gpsValido(j)) continue;
      if (!porCem.has(j.cemiterio)) porCem.set(j.cemiterio, []);
      porCem.get(j.cemiterio)!.push(j);
    }
    const fora = new Set<string>();
    for (const lista of porCem.values()) {
      const geo = lista.map((j) => ({ ...j, lat: Number(j.lat), lng: Number(j.lng) }));
      for (const j of separarDistantes(geo).fora) fora.add(j.id);
    }
    return fora;
  }, [jazigos]);

  // projeção em metros — feita sobre TODO o escopo, para que ligar/desligar
  // filtro não mexa na posição nem na escala do desenho.
  const { pontos, distantes, centro } = useMemo(() => {
    const geo = comGps.map((j) => ({ ...j, lat: Number(j.lat), lng: Number(j.lng) }));
    const bons = geo.filter((j) => !suspeitos.has(j.id));
    return {
      pontos: projetar(bons),
      distantes: geo.filter((j) => suspeitos.has(j.id)),
      // MESMA lista que foi projetada: o centro tem de ser o mesmo que projetar()
      // usou por dentro, senão a imagem de satélite entra deslocada dos pontos.
      centro: centroDe(bons),
    };
  }, [comGps, suspeitos]);

  const termo = busca.trim().toLowerCase();
  function passa(j: Jazigo) {
    if (ocultas.includes(j.status)) return false;
    if (!termo) return true;
    return [j.identificacao, j.cliente, j.rua, j.numero, j.quadra]
      .filter(Boolean).join(" ").toLowerCase().includes(termo);
  }
  const visiveis = useMemo(() => pontos.filter(passa), [pontos, ocultas, termo]);
  const semGpsVisiveis = useMemo(() => semGps.filter(passa), [semGps, ocultas, termo]);
  // a lista de GPS suspeito obedece aos MESMOS filtros das outras: buscar uma
  // família estreitava "Sem GPS" e deixava "GPS suspeito" listando o cemitério
  // inteiro, como se a busca não valesse ali.
  const distantesVisiveis = useMemo(() => distantes.filter(passa), [distantes, ocultas, termo]);

  // o selecionado tem de existir no que está na tela: com filtro ligado ou
  // escopo trocado, o cartão de detalhe ficava aberto num jazigo invisível
  useEffect(() => {
    if (!selId) return;
    // distantesVisiveis entra aqui porque agora da para ABRIR um jazigo de GPS
    // suspeito pelo chip — sem ele, o detalhe fechava sozinho no instante em que
    // abria, justamente no unico caso em que existe algo a consertar.
    const vivo = visiveis.some((p) => p.id === selId)
      || semGpsVisiveis.some((p) => p.id === selId)
      || distantesVisiveis.some((p) => p.id === selId);
    if (!vivo) setSelId("");
  }, [selId, visiveis, semGpsVisiveis, distantesVisiveis]);

  // BALDES SINTETICOS: /api/localizacao troca o vazio por um rotulo legivel, e
  // esses dois rotulos nao sao lugares — "sem quadra" pode juntar o cemiterio
  // inteiro e "sem cemiterio" pode juntar cidades diferentes. Tratar "sem
  // quadra" como quadra fazia o limite de 300 m acusar um escopo que
  // legitimamente atravessa o cemiterio, com um texto falando de "um jazigo
  // cadastrado nesta quadra por engano".
  const quadraReal = !!quadra && quadra !== "sem quadra";
  const cemiterioReal = !!cemiterio && cemiterio !== "sem cemitério";

  // O LIMITE DEPENDE DO ESCOPO — e nenhum destes numeros e medido, sao tetos
  // plausiveis (PENDENTE: as dimensoes reais das quadras do Leandro; ver o
  // changelog). Por isso o texto do aviso pede conferencia em vez de afirmar
  // erro. Tres casos:
  //  - QUADRA de verdade: 400 m. E uma quadra enorme, e ainda por cima medida na
  //    DIAGONAL (250x170 m ja da 302 m, e cada ponta carrega ate 30 m de erro de
  //    GPS) — 300 m dava alarme falso em quadra grande legitima.
  //  - UM CEMITERIO de verdade: 1 km. O teto antigo de 2 km deixava passar sem
  //    aviso uma leitura a 1,5 km em cemiterio de uma quadra so, ou na visao
  //    padrao (nenhum filtro), que era justamente o buraco que este aviso existe
  //    para tapar.
  //  - BALDES/TUDO: 2 km, porque ali o vao grande pode ser legitimo (dois
  //    cemiterios de verdade no mesmo balde).
  const limiteVao = quadraReal ? 400 : cemiterioReal ? 1000 : 2000;

  // A PLANTA CABE NO ESCOPO? separarDistantes so garante que cada leitura encosta
  // em alguma outra dentro de 5 km — dois pontos a 4,9 km um do outro formam
  // "grupo", e por contagio uma fileira de leituras espacadas forma um grupo
  // unico de quilometros, com "100% mapeado" e nenhum suspeito. Este aviso e a
  // prova que sobra, e por isso ele mede o PAR MAIS AFASTADO de verdade.
  //
  // NAO usar max(largura, altura) da caixa: era o maior LADO, nao a distancia.
  // Dois jazigos na diagonal a 2,8 km ficam numa caixa de 2 km de lado e
  // escapavam do aviso inteiro; e a caixa ainda soma 8 m de folga de cada lado,
  // inflando o numero mostrado. Aqui a conta e feita nos pontos crus (O(n^2),
  // com teto de leitura de 2000 jazigos nesta tela).
  // CUSTO: com 2.000 jazigos o par a par levava 59 ms (e 118 ms no render duplo
  // do StrictMode), a cada troca de filtro. Duas economias sem mudar o
  // resultado: (a) a DIAGONAL DA CAIXA e um teto do par mais afastado — se ela
  // ja cabe no limite, nenhum par estoura e nao ha o que medir; (b) dentro do
  // laco compara-se o quadrado da distancia, com uma raiz so no fim.
  const vaoMetros = useMemo(() => {
    if (pontos.length < 2) return 0;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pontos) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    if (Math.hypot(x1 - x0, y1 - y0) <= limiteVao) return 0;
    let maior2 = 0;
    for (let i = 0; i < pontos.length; i++) {
      for (let j = i + 1; j < pontos.length; j++) {
        const dx = pontos[i].x - pontos[j].x, dy = pontos[i].y - pontos[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 > maior2) maior2 = d2;
      }
    }
    return Math.sqrt(maior2);
  }, [pontos, limiteVao]);

  const vaoSuspeito = vaoMetros > limiteVao;
  // DISTANCIA EM TEXTO. Arredondando em metros, 999,7 m saia como "1000 m"
  // (numero que ninguem escreve em metros); e com uma casa em km, 1.999 m e
  // 2.000,4 m saiam os dois como "2,0 km" — so um deles com aviso, o que fazia o
  // par (numero mostrado, alarme) parecer arbitrario. Abaixo de 10 km vao duas
  // casas, que e a resolucao onde o limite ainda importa.
  const distanciaBr = (m: number) => m >= 999.5
    ? `${(m / 1000).toFixed(m < 10000 ? 2 : 1).replace(".", ",")} km`
    : `${Math.round(m)} m`;

  const total = escopo.length;
  const mapeado = total ? Math.round((pontos.length / total) * 100) : 0;
  const vencidos = escopo.filter((j) => j.status === "vencido").length;
  const selecionado = escopo.find((j) => j.id === selId) || null;

  function alternarSituacao(s: string) {
    setOcultas((o) => (o.includes(s) ? o.filter((x) => x !== s) : [...o, s]));
  }

  return (
    <div>
      <div>
        <p style={{ color: cor.cinza, fontSize: 14, marginTop: 0, marginBottom: 14 }}>
          A planta é desenhada com o GPS marcado nas lavagens, em escala real (metros). A cor mostra
          o vencimento da próxima cobrança — a mesma régua da tela de Gestão. Toque num jazigo para
          ver os detalhes.
        </p>

        {truncado && (
          <div style={{ ...painel.card, borderLeft: "4px solid #d97706", padding: 12, marginBottom: 12 }}>
            <strong style={{ color: "#92400e" }}>Planta parcial.</strong>{" "}
            <span style={{ color: cor.cinza, fontSize: 14 }}>
              A carteira bateu o teto de leitura desta tela ({limite || 2000} jazigos), então há
              jazigos que não estão aqui. Os filtros trabalham sobre o que foi lido, ou seja
              filtrar NÃO traz o que ficou de fora — me avise para paginar a planta por cemitério.
            </span>
          </div>
        )}

        {/* resumo */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8, marginBottom: 12 }}>
          <Resumo titulo="Jazigos" valor={String(total)} />
          <Resumo titulo="No mapa" valor={`${pontos.length}`} sub={`${mapeado}% mapeado`} />
          <Resumo titulo="Fora do mapa" valor={String(semGps.length + distantes.length)}
                  sub={distantes.length ? `${semGps.length} sem GPS · ${distantes.length} suspeito${distantes.length === 1 ? "" : "s"}` : "sem GPS"}
                  destaque={semGps.length + distantes.length > 0 ? "#d97706" : undefined} />
          <Resumo titulo="Vencidos" valor={String(vencidos)} destaque={vencidos > 0 ? "#dc2626" : undefined} />
        </div>

        {/* controles */}
        <div style={{ ...painel.card, padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {cemiterios.length > 1 && (
            <div>
              <label style={painel.rotulo}>Cemitério</label>
              <select style={{ ...painel.input, width: "auto" }} value={cemiterio}
                      onChange={(e) => { setCemiterio(e.target.value); setQuadra(""); setSelId(""); }}>
                {cemiterios.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={painel.rotulo}>Quadra</label>
            <select style={{ ...painel.input, width: "auto" }} value={quadra}
                    onChange={(e) => { setQuadra(e.target.value); setSelId(""); }}>
              <option value="">Todo o cemitério ({doCemiterio.length})</option>
              {quadrasDoCem.map((q) => (
                <option key={q.codigo} value={q.codigo}>
                  {/* "com GPS", não "no mapa": quem está no mapa só se sabe depois de
                      separar o GPS suspeito, e isso depende do escopo escolhido. A
                      etiqueta dizia "8 no mapa" e o cartão logo acima dizia 7. */}
                  {q.codigo} — {q.total} jazigo{q.total === 1 ? "" : "s"}{q.comGps < q.total ? ` (${q.comGps} com GPS)` : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={painel.rotulo}>Buscar (jazigo, família, rua)</label>
            <input style={painel.input} value={busca} onChange={(e) => setBusca(e.target.value)}
                   placeholder="ex.: Q-3, Dona Cida, rua 4" />
          </div>
        </div>

        {/* legenda que também filtra */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 12px", alignItems: "center" }}>
          {SITUACOES.map((s) => {
            const off = ocultas.includes(s);
            const qtd = escopo.filter((j) => j.status === s).length;
            if (!qtd && (s === "inativo" || s === "sem")) return null;
            return (
              <button key={s} onClick={() => alternarSituacao(s)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer",
                        border: `1px solid ${off ? cor.linha : CORES[s]}`, borderRadius: 999, padding: "6px 12px",
                        background: off ? "#f8fafc" : "#fff", color: off ? "#94a3b8" : cor.navy,
                        textDecoration: off ? "line-through" : "none", minHeight: 36,
                      }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: CORES[s], opacity: off ? 0.4 : 1 }} />
                {ROTULO[s]} ({qtd})
              </button>
            );
          })}
          {ocultas.length > 0 && (
            <button style={painel.botaoMiniSec} onClick={() => setOcultas([])}>mostrar tudo</button>
          )}
        </div>

        {carregando && <p style={{ color: cor.cinza }}>Carregando…</p>}

        {!carregando && erro && (
          <div style={{ ...painel.card, borderLeft: "4px solid #dc2626" }}>
            <strong style={{ color: "#dc2626" }}>Não deu para carregar o mapa.</strong>
            <p style={{ color: cor.cinza, fontSize: 14, margin: "4px 0 0" }}>
              {erro}. Recarregue a página; se insistir, é falha do servidor e não falta de GPS.
            </p>
          </div>
        )}

        {/* "nenhum com GPS" só quando é verdade: com todas as leituras suspeitas
            (ver separarDistantes) a planta também fica vazia, mas a coordenada
            EXISTE — e este texto mandava remarcar quem já estava marcado. Nesse
            caso quem explica é o cartão de GPS suspeito, logo abaixo. */}
        {!carregando && !erro && pontos.length === 0 && distantesVisiveis.length === 0 && (
          <div style={painel.card}>
            <p style={{ margin: 0, color: cor.cinza }}>
              {distantes.length > 0
                ? "As coordenadas deste escopo estão todas sob suspeita e o filtro ativo está escondendo a lista. Limpe a busca ou clique em “mostrar tudo” para ver quais jazigos remarcar."
                : "Nenhum jazigo com GPS neste escopo. Marque a localização no campo (ao lavar ou em “Cadastrar jazigo”) e a planta aparece aqui."}
            </p>
          </div>
        )}

        {!carregando && !erro && vaoSuspeito && (
          <div style={{ ...painel.card, borderLeft: "4px solid #d97706" }}>
            <strong style={{ color: "#92400e" }}>
              Planta larga demais ({distanciaBr(vaoMetros)} entre os dois jazigos mais afastados)
            </strong>
            <p style={{ color: cor.cinza, fontSize: 14, margin: "4px 0 0" }}>
              {quadraReal
                ? "Isso é muito para uma quadra só (o limite aqui é uma estimativa de quadra grande, medida na diagonal), e o ponto solto achata todo o resto do desenho num canto. A explicação provável é uma leitura marcada longe do jazigo (dentro do carro, no caminho) — perto o bastante para não entrar em “GPS suspeito” logo abaixo — ou um jazigo cadastrado nesta quadra por engano. Vale conferir antes de concluir que está errado."
                : cemiterioReal
                  ? "Esse vão é grande para um cemitério só, e ele achata todo o resto do desenho num canto. A explicação provável é uma leitura marcada longe do jazigo (dentro do carro, no caminho) — perto o bastante para não entrar em “GPS suspeito” logo abaixo."
                  : "Esse vão é grande até para um cemitério inteiro, e ele achata todo o resto do desenho num canto. Duas explicações possíveis: alguma leitura foi marcada longe do jazigo (dentro do carro, no caminho) — perto o bastante para não entrar em “GPS suspeito” logo abaixo; ou este escopo está juntando lugares diferentes, o que acontece com os jazigos sem cemitério ou sem quadra preenchidos. Escolher um cemitério no filtro acima separa os dois casos."}
              {" "}Se um filtro de situação estiver ligado, o ponto solto pode nem estar visível:
              clique em “mostrar tudo” e limpe a busca antes de procurar. Achado o jazigo errado,
              remarque a localização na próxima passagem.
            </p>
          </div>
        )}

        {!carregando && !erro && pontos.length > 0 && (
          <Planta pontos={pontos} centro={centro} visiveis={visiveis} selId={selId} onEscolher={setSelId}
                  agruparQuadras={!quadra} rotaLigada={rotaLigada} onRota={setRotaLigada} />
        )}

        {selecionado && (
          <Detalhe j={selecionado} onFechar={() => setSelId("")}
                   onMudou={() => setRecarga((n) => n + 1)} />
        )}

        {distantesVisiveis.length > 0 && (
          <div style={{ ...painel.card, borderLeft: "4px solid #d97706" }}>
            <strong style={{ color: "#92400e" }}>GPS suspeito ({distantesVisiveis.length})</strong>
            <p style={{ color: cor.cinza, fontSize: 14, margin: "4px 0 10px" }}>
              {pontos.length === 0
                ? "Neste cemitério não há maioria: as leituras se dividem em grupos afastados uns dos outros (pode ser 2 contra 2, e podem existir duas leituras vizinhas dentro de cada grupo), então não há como eleger qual grupo é o cemitério de verdade e nada é desenhado — sairia com quilômetros de largura. A coordenada existe; o que falta é confiança nela."
                : "Estes jazigos têm coordenada gravada longe do grupo que a maioria formou neste cemitério (nenhum vizinho a menos de 5 km) — provavelmente marcada longe do cemitério ou com o sinal ruim. Ficam fora da planta para não distorcer o desenho."}
              {" "}Clique no jazigo para ver as leituras e <b>apagar a errada</b> — remarcar no campo não
              apaga leitura ruim, só dilui.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {distantesVisiveis.map((t) => (
                <ChipJazigo key={t.id} t={t as Jazigo} onSelecionar={setSelId} />
              ))}
            </div>
          </div>
        )}

        {semGpsVisiveis.length > 0 && (
          <div style={painel.card}>
            <strong style={{ color: cor.navy }}>Sem GPS ({semGpsVisiveis.length})</strong>
            <p style={{ color: cor.cinza, fontSize: 14, margin: "4px 0 10px" }}>
              Estes ainda não entram na planta. Da próxima vez que passar por eles, marque a
              localização — a planta se completa sozinha.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {semGpsVisiveis.map((t) => <ChipJazigo key={t.id} t={t} onSelecionar={setSelId} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * O chip levava direto para a ficha da familia. Nos cartoes de "GPS suspeito" e
 * "Sem GPS" isso e o destino errado: quem clica ali quer resolver a COORDENADA,
 * e a ficha da familia nao tem nada sobre isso. Com onSelecionar o chip abre o
 * detalhe do jazigo (onde mora o "Corrigir localização"); o link para a ficha
 * continua sendo o comportamento padrao onde nao ha o que consertar.
 */
function ChipJazigo({ t, onSelecionar }: { t: Jazigo; onSelecionar?: (id: string) => void }) {
  const chip = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
                   border: `1px solid ${cor.linha}`, borderRadius: 999, padding: "6px 10px",
                   background: "#fff", color: cor.navy }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: CORES[t.status] || CORES.sem }} />
      {t.quadra} · {t.identificacao || "sem identificação"}
    </span>
  );
  if (onSelecionar) {
    return (
      <button type="button" onClick={() => onSelecionar(t.id)}
              style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
        {chip}
      </button>
    );
  }
  return t.clienteId
    ? <Link href={`/painel/clientes/${t.clienteId}`} style={{ textDecoration: "none" }}>{chip}</Link>
    : chip;
}

function Resumo({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub?: string; destaque?: string }) {
  return (
    <div style={{ border: `1px solid ${cor.linha}`, borderRadius: 12, padding: "10px 12px", background: "#fff" }}>
      <div style={{ fontSize: 12, color: cor.cinza, textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: destaque || cor.navy }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: cor.cinza }}>{sub}</div>}
    </div>
  );
}

type Ponto = Jazigo & { x: number; y: number };

function metrosBr(m: number) {
  return m < 1 ? m.toFixed(1).replace(".", ",") : String(Math.round(m));
}

/**
 * PLANTA — o desenho. Trabalha em METROS (ver src/lib/planta.ts): a viewBox do
 * SVG é uma janela em metros sobre o terreno, então zoom e arraste são só mexer
 * nessa janela. Os tamanhos de ponto e texto são divididos pela escala atual
 * (metros por pixel de tela) para continuarem do mesmo tamanho em qualquer zoom
 * — e a largura em pixel é MEDIDA, não presumida: no celular o SVG tem ~360 px
 * e usar 640 fixo deixava ponto e fonte quase pela metade do tamanho pedido.
 */
function Planta({ pontos, centro, visiveis, selId, onEscolher, agruparQuadras, rotaLigada, onRota }: {
  pontos: Ponto[]; centro: Geo; visiveis: Ponto[]; selId: string;
  onEscolher: (id: string) => void;
  agruparQuadras: boolean;
  rotaLigada: boolean; onRota: (v: boolean) => void;
}) {
  const base = useMemo(() => ajustarAspecto(caixa(pontos), ASPECTO), [pontos]);
  const [vb, setVb] = useState<Caixa>(base);
  const [larguraPx, setLarguraPx] = useState(LARGURA);
  const refSvg = useRef<SVGSVGElement>(null);
  const arraste = useRef<{ id: number; x: number; y: number; x0: number; y0: number; vb0: Caixa } | null>(null);
  const arrastou = useRef(false);
  // No celular, touchAction:"none" fixo sequestrava a rolagem: com a planta
  // ocupando meia tela, arrastar o dedo para descer a página não fazia nada — o
  // usuário ficava preso no mapa. Padrão agora é "pan-y" (a página rola, e o
  // arraste horizontal do mapa continua funcionando); quem quiser arrastar a
  // planta para cima/baixo liga o modo mão. No mouse nada disso importa.
  const [modoArraste, setModoArraste] = useState(false);
  // SATELITE LIGADO POR PADRAO. Ponto sobre fundo branco nao localiza ninguem: a
  // pessoa reconhece o cemiterio pelo portao, pela alameda, pelo telhado — nao
  // por coordenada. Quem quiser o desenho limpo desliga no botao.
  const [satelite, setSatelite] = useState(true);
  // guardado por CHAVE do quadrado, não como contador: contador acumulava a cada
  // arraste e, depois de rodar o mapa um pouco, acusava "sem imagem" com a
  // imagem na tela. Aqui só conta falha dos quadrados que estão sendo pedidos
  // agora, e um quadrado que falhou não é recontado ao voltar.
  const [tilesRuins, setTilesRuins] = useState<Record<string, true>>({});

  // troca de escopo (quadra/cemitério) recentra a janela
  const chave = `${pontos.length}:${base.x.toFixed(1)}:${base.y.toFixed(1)}:${base.w.toFixed(1)}`;
  useEffect(() => { setVb(base); }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = refSvg.current;
    if (!el) return;
    const medir = () => {
      const w = el.getBoundingClientRect().width;
      if (w) setLarguraPx(w);
    };
    medir();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const upx = vb.w / Math.max(larguraPx, 1);   // metros por pixel de tela

  // os quadrados de imagem que cobrem a janela atual (zoom escolhido pelo upx)
  const tiles = useMemo(
    () => (satelite ? tilesPara(centro, vb, upx) : []),
    [satelite, centro, vb.x, vb.y, vb.w, vb.h, upx], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // se TUDO falhou, o problema nao e o zoom nem o cemiterio: e o servico de
  // imagem. Dizer isso e melhor que deixar a tela branca com o botao ligado.
  const semImagem = satelite && tiles.length > 0 && tiles.every((t) => tilesRuins[t.chave]);

  const r = 7 * upx;                           // raio do ponto, constante na tela
  const fonte = 11 * upx;
  const traco = 1.5 * upx;

  function zoom(fator: number) {
    setVb((v) => {
      const w = Math.min(Math.max(v.w / fator, 6), base.w * 6);
      const h = w / ASPECTO;
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  }

  /**
   * Qual jazigo está sob este pixel da tela.
   *
   * A seleção é RESOLVIDA POR GEOMETRIA, não por qual elemento recebeu o evento,
   * por dois motivos:
   *  - com pointer capture ativa o CLIQUE é entregue ao <svg> que capturou, não
   *    ao ponto, então onClick no ponto nunca dispara;
   *  - guardar "quem foi tocado" num ref dava seleção ERRADA quando um segundo
   *    dedo (ou a palma da mão) tocava a tela enquanto o primeiro estava
   *    pressionado: o ref era sobrescrito e, ao soltar o primeiro dedo, abria a
   *    ficha de outra família.
   * Aqui o ponto escolhido é sempre o MAIS PRÓXIMO do dedo dentro do alvo, o que
   * também corrige o toque em quadra cheia: os alvos invisíveis se sobrepõem e o
   * SVG entregava o último desenhado (ordem alfabética), não o mais perto.
   */
  function jazigoNoPixel(clientX: number, clientY: number, janela: Caixa): string | null {
    const el = refSvg.current;
    if (!el) return null;
    const cx = el.getBoundingClientRect();
    if (!cx.width || !cx.height) return null;
    const mx = janela.x + ((clientX - cx.left) / cx.width) * janela.w;
    const my = janela.y + ((clientY - cx.top) / cx.height) * janela.h;
    // alvo maior que o ponto: 7 px de raio é menos que a ponta do dedo, e errar
    // o toque no celular é o que mais irrita no campo
    const alcance = (janela.w / Math.max(larguraPx, 1)) * 7 * 2.4;
    let melhor: string | null = null, melhorD = Infinity;
    for (const p of visiveis) {
      // ponto que não está DENTRO da janela não pode ser escolhido: o alcance do
      // toque vale ~17 px e um ponto 11 px fora da borda não é desenhado, mas
      // ganhava a disputa — abria a ficha de uma família que não estava na tela
      if (p.x < janela.x || p.x > janela.x + janela.w || p.y < janela.y || p.y > janela.y + janela.h) continue;
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d <= alcance && d < melhorD) { melhorD = d; melhor = p.id; }
    }
    return melhor;
  }

  // Arraste com pointer capture: sem isso, soltar o dedo fora do SVG perdia o
  // pointerup e o mapa continuava "colado" no dedo.
  function aoDescer(e: React.PointerEvent<SVGSVGElement>) {
    // botão direito / do meio não arrasta o mapa (o menu de contexto abre e o
    // pointerup nunca chega, deixando a planta colada no cursor)
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // arraste órfão (um pointerup que nunca chegou) não pode aposentar o mapa:
    // sem esta limpeza um ref velho fazia a guarda abaixo recusar TODO toque
    // seguinte — nem arrastar, nem selecionar, até recarregar a página.
    if (arraste.current && !e.currentTarget.hasPointerCapture(arraste.current.id)) arraste.current = null;
    // segundo dedo (pinça) NÃO rouba o arraste do primeiro: sobrescrever o ref
    // aqui matava o dedo que já estava arrastando, porque o pointerup dele não
    // batia mais com o id guardado e o mapa travava até recarregar a tela
    if (arraste.current && arraste.current.id !== e.pointerId) return;
    arrastou.current = false;
    arraste.current = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, vb0: vb };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* navegador antigo */ }
  }
  function aoMover(e: React.PointerEvent<SVGSVGElement>) {
    const a = arraste.current;
    if (!a || a.id !== e.pointerId) return;
    // botão solto fora da janela: o pointerup se perdeu, então encerramos aqui —
    // e, se o gesto nem chegou a virar arraste, desfazemos o empurrão, igual ao
    // pointerup normal. Sem isso, cada clique que soltava fora da tela deixava a
    // planta uns pixels torta.
    if (e.pointerType === "mouse" && e.buttons === 0) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
      if (!arrastou.current) setVb(a.vb0);
      arraste.current = null;
      return;
    }
    const largura = refSvg.current?.getBoundingClientRect().width;
    if (!largura) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    // 10 px de tolerância: no toque, o dedo sempre escorrega alguns pixels e com
    // 4 px o toque no jazigo era engolido como arraste
    if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > 10) arrastou.current = true;
    const k = vb.w / largura;
    a.x = e.clientX; a.y = e.clientY;
    // com o modo mão DESLIGADO o eixo vertical é da PÁGINA (touchAction "pan-y"):
    // mexer nele aqui fazia a rolagem do dedo arrastar o mapa junto por uns
    // pixels antes do navegador assumir, e a planta ia saindo de lugar a cada
    // rolagem. No mouse o eixo continua livre — lá não existe rolagem por arraste.
    const travarY = e.pointerType !== "mouse" && !modoArraste;
    setVb((v) => ({ ...v, x: v.x - dx * k, y: travarY ? v.y : v.y - dy * k }));
  }
  function aoSubir(e: React.PointerEvent<SVGSVGElement>) {
    const a = arraste.current;
    if (!a || a.id !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
    arraste.current = null;
    if (arrastou.current) return;
    // toque curto (nunca passou dos 10 px) NÃO é arraste: devolve a janela para
    // onde estava, senão cada toque empurrava a planta uns pixels de lado.
    setVb(a.vb0);
    // a mira usa a posição e a janela do MOMENTO EM QUE O DEDO DESCEU: os
    // setVb() do movimento podem não ter sido aplicados ainda, e mirar na janela
    // "vb" de um render antigo escolhia o jazigo errado.
    const id = jazigoNoPixel(a.x0, a.y0, a.vb0);
    // toque no vazio limpa a seleção — antes o painel ficava preso no último
    // jazigo escolhido e não havia como fechar.
    onEscolher(id || "");
  }
  function aoCancelar(e: React.PointerEvent<SVGSVGElement>) {
    const a = arraste.current;
    // só o dono do arraste encerra: cancelar por causa de OUTRO dedo (o navegador
    // dispara pointercancel no segundo toque quando ele assume a rolagem) travava
    // a planta no meio do gesto, com o primeiro dedo ainda na tela
    if (!a || a.id !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
    // gesto CANCELADO volta a janela inteira para onde estava, sempre. Quem
    // cancela é o navegador quando decide que o gesto é rolagem da página: os
    // pointermove vêm agrupados, então o primeiro já chega com 12-20 px e passava
    // do limite de arraste — a planta ficava torta a cada rolagem. Arraste que o
    // usuário realmente quis termina em pointerup, não em pointercancel.
    setVb(a.vb0);
    arraste.current = null;
  }

  // caixas por quadra (visão do cemitério inteiro)
  const caixasQuadra = useMemo(() => {
    if (!agruparQuadras) return [];
    const m = new Map<string, Ponto[]>();
    for (const p of pontos) {
      if (!m.has(p.quadra)) m.set(p.quadra, []);
      m.get(p.quadra)!.push(p);
    }
    if (m.size < 2) return [];
    return [...m.entries()].map(([codigo, ps]) => ({ codigo, qtd: ps.length, c: caixa(ps, 3, 6) }));
  }, [pontos, agruparQuadras]);

  // rota sugerida sobre os pontos visíveis
  const rota = useMemo(() => {
    if (!rotaLigada || visiveis.length < 2) return null;
    const fila = [...visiveis]
      .sort((a, b) => a.quadraOrdem - b.quadraOrdem || a.identificacao.localeCompare(b.identificacao));
    const alvo = fila.slice(0, MAX_PARADAS);
    const ordem = rotaVizinhoMaisProximo(alvo, alvo[0]);
    return { ordem, metros: comprimentoRota(ordem), cortados: fila.length - alvo.length };
  }, [rotaLigada, visiveis]);

  const rotulos = visiveis.length <= 45;
  const escala = escalaBonita(vb.w / 3);
  const sel = visiveis.find((p) => p.id === selId) || pontos.find((p) => p.id === selId) || null;
  // o halo só existe quando cabe na tela E é maior que o ponto: precisão de
  // ±2.000 m (GPS que pegou a torre de celular) desenhava um círculo maior que a
  // janela inteira e a planta virava uma mancha colorida sem informação nenhuma.
  // A comparação é DIÂMETRO contra o lado CURTO da janela (vb.h): comparar o raio
  // com a largura deixava passar halo que cobre a tela toda — com janela de 120 m
  // e precisão de 100 m, o disco de 200 m de diâmetro tapava o desenho inteiro.
  const precisaoSel = sel && sel.precisao != null ? Number(sel.precisao) : null;
  const haloGrande = precisaoSel != null && precisaoSel * 2 > vb.h;
  const haloVisivel = precisaoSel != null && precisaoSel > r && !haloGrande;
  // e há precisão que não cabe NEM no afastamento máximo DESTE escopo (o zoom
  // para em base.w*6). É relativo ao escopo, não absoluto: numa quadra QUADRADA
  // de ~30 m o halo fica impossível a partir de ~±138 m, e na planta de um
  // cemitério de 400 m só a partir de ~±1.250 m. E depende também do FORMATO do
  // escopo, não só do tamanho: uma quadra em fileira baixa o limiar para ~±95 m
  // e uma quadra com um único GPS (caixa mínima de 24 m) para ~±72 m. Ou seja
  // o veredito é do escopo, não da leitura — o mesmo jazigo pode trocar de
  // rótulo quando o vizinho ganha GPS. ±80 m não chega aqui, cai em haloGrande
  // (cabe no desenho, mas não na janela atual).
  //
  // HOJE ISTO É CAMINHO MORTO, de propósito. gps_precisao é limitado a 30 m em
  // três lugares (migrations/0013, /api/tumulos/[id]/gps e a média ponderada,
  // que nunca piora a melhor amostra), e o limiar mais baixo alcançável é ~±72 m
  // — nenhuma leitura gravada pode entrar aqui. Fica como rede: se algum dia o
  // teto de 30 m subir (ou entrar leitura importada de fora), a tela não desenha
  // uma mancha do tamanho da janela nem finge que ±500 m localiza um jazigo.
  const haloImpossivel = precisaoSel != null && precisaoSel * 2 > (base.w * 6) / ASPECTO;

  return (
    <div style={painel.card}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <strong style={{ color: cor.navy }}>
          Planta · {visiveis.length} de {pontos.length} no mapa
        </strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button style={painel.botaoMiniSec} onClick={() => zoom(1.6)} aria-label="aproximar">＋</button>
          <button style={painel.botaoMiniSec} onClick={() => zoom(1 / 1.6)} aria-label="afastar">−</button>
          <button style={painel.botaoMiniSec} onClick={() => setVb(base)}>enquadrar</button>
          <button style={modoArraste ? painel.botaoMini : painel.botaoMiniSec}
                  onClick={() => setModoArraste((v) => !v)}
                  title="No celular: ligado, o dedo arrasta a planta; desligado, o dedo rola a página.">
            {modoArraste ? "✓ mão" : "✋ mão"}
          </button>
          <button style={satelite ? painel.botaoMini : painel.botaoMiniSec}
                  onClick={() => { setSatelite((v) => !v); setTilesRuins({}); }}
                  title="Imagem aérea atrás dos pontos.">
            {satelite ? "✓ satélite" : "🛰 satélite"}
          </button>
          <button style={rotaLigada ? painel.botaoMini : painel.botaoMiniSec}
                  onClick={() => onRota(!rotaLigada)}>
            {rotaLigada ? "✓ rota" : "rota a pé"}
          </button>
        </div>
      </div>

      {rota && (
        <p style={{ margin: "0 0 8px", fontSize: 14, color: cor.cinza }}>
          Rota sugerida por vizinho mais próximo: <b style={{ color: cor.navy }}>{rota.ordem.length} paradas</b>{" "}
          · caminhada de <b style={{ color: cor.navy }}>{Math.round(rota.metros)} m</b> (sem contar o trajeto até o cemitério).
          {rota.cortados > 0 && (
            <> Mostrando as {MAX_PARADAS} primeiras paradas —{" "}
              <b style={{ color: "#92400e" }}>{rota.cortados} jazigo{rota.cortados === 1 ? "" : "s"} de fora</b>{" "}
              da rota. Filtre por quadra ou situação para cobrir o resto.</>
          )}
        </p>
      )}

      <svg ref={refSvg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
           onPointerDown={aoDescer} onPointerMove={aoMover} onPointerUp={aoSubir} onPointerCancel={aoCancelar}
           style={{ width: "100%", aspectRatio: `${LARGURA} / ${ALTURA}`, background: "#f8fafc",
                    border: `1px solid ${cor.linha}`, borderRadius: 12,
                    touchAction: modoArraste ? "none" : "pan-y", cursor: "grab",
                    display: "block" }}>
        {/* IMAGEM AÉREA — primeiro de tudo, para ficar ATRÁS de quadras, rota e
            pontos. Cada quadrado vai posicionado pelos próprios cantos (ver
            src/lib/tiles.ts). Quadrado que não carrega some sozinho: o desenho
            não pode depender de um serviço de fora. */}
        {tiles.map((t) => (
          <image key={t.chave} href={t.url} x={t.x} y={t.y} width={t.w} height={t.h}
                 preserveAspectRatio="none" style={{ pointerEvents: "none" }}
                 onError={() => setTilesRuins((m) => (m[t.chave] ? m : { ...m, [t.chave]: true }))} />
        ))}
        {/* véu claro: sobre foto de satélite, ponto colorido e texto escuro
            somem. Ele tira o contraste da imagem sem apagar a referência. */}
        {tiles.length > 0 && (
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h}
                fill="#ffffff" fillOpacity={0.22} style={{ pointerEvents: "none" }} />
        )}

        {/* caixas das quadras */}
        {caixasQuadra.map((q) => (
          <g key={q.codigo}>
            {/* sobre satélite a caixa cheia apagava o terreno, que é justamente
                o que a pessoa foi ver: fica só o contorno. */}
            <rect x={q.c.x} y={q.c.y} width={q.c.w} height={q.c.h} rx={2 * upx}
                  fill="#e2e8f0" fillOpacity={tiles.length ? 0.06 : 0.5}
                  stroke={tiles.length ? "#0f172a" : "#cbd5e1"}
                  strokeOpacity={tiles.length ? 0.45 : 1} strokeWidth={traco} />
            <text x={q.c.x + 2 * upx} y={q.c.y - 3 * upx} fontSize={fonte * 1.1} fontWeight={700} fill="#64748b">
              {q.codigo} ({q.qtd})
            </text>
          </g>
        ))}

        {/* rota */}
        {rota && (
          <polyline points={(rota.ordem || []).map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke={cor.teal} strokeWidth={traco * 1.6}
                    strokeDasharray={`${6 * upx} ${4 * upx}`} strokeLinejoin="round" />
        )}

        {/* halo de precisão SÓ do selecionado: desenhado em todos, com quadra
            cheia e zoom afastado virava uma nuvem que escondia o desenho.
            O raio é a precisão REAL em metros, sem teto nem piso: o teto de 30 m
            fazia a legenda dizer "±80 m" com um halo de 30 m (mentia justamente
            na leitura ruim que o halo existe para denunciar) e um piso em pixels
            fazia o contrário — com o cemitério inteiro na tela, um GPS ótimo de
            ±3 m aparecia como um halo de 50 m. Quando a precisão é menor que o
            próprio ponto — ou maior que a janela inteira —, não há halo para
            desenhar: o número está na legenda e no cartão de detalhe. */}
        {sel && haloVisivel && (
          <circle cx={sel.x} cy={sel.y}
                  r={precisaoSel as number}
                  fill={CORES[sel.status] || CORES.sem} fillOpacity={0.12}
                  stroke={CORES[sel.status] || CORES.sem} strokeOpacity={0.35} strokeWidth={traco} />
        )}

        {/* pontos */}
        {visiveis.map((p) => (
          <g key={p.id} style={{ cursor: "pointer" }}>
            {/* alvo invisível do mesmo tamanho do alcance de jazigoNoPixel — aqui
                só para o cursor virar mãozinha; quem decide a seleção é a
                distância calculada no pointerup, não este círculo */}
            <circle cx={p.x} cy={p.y} r={r * 2.4} fill="transparent" style={{ pointerEvents: "all" }} />
            {p.id === selId && (
              <circle cx={p.x} cy={p.y} r={r * 1.9} fill="none" stroke={cor.navy} strokeWidth={traco * 1.4} />
            )}
            <circle cx={p.x} cy={p.y} r={r} fill={CORES[p.status] || CORES.sem} stroke="#fff" strokeWidth={traco * 1.3} />
            {rotulos && (
              <text x={p.x} y={p.y - r * 1.6} textAnchor="middle" fontSize={fonte} fill={cor.navy}
                    style={{ pointerEvents: "none" }}>
                {String(p.identificacao || "").slice(0, 12)}
              </text>
            )}
          </g>
        ))}

        {/* número da parada na rota, por cima dos pontos */}
        {rota && rota.ordem.map((p, i) => (
          <text key={`n${p.id}`} x={p.x} y={p.y + r * 0.55} textAnchor="middle"
                fontSize={fonte * 0.95} fontWeight={700} fill="#fff" style={{ pointerEvents: "none" }}>
            {i + 1}
          </text>
        ))}

        {/* régua de escala e norte, ancorados no canto */}
        <g style={{ pointerEvents: "none" }}>
          <line x1={vb.x + 12 * upx} y1={vb.y + vb.h - 14 * upx}
                x2={vb.x + 12 * upx + escala} y2={vb.y + vb.h - 14 * upx}
                stroke={cor.navy} strokeWidth={traco * 1.4} />
          <text x={vb.x + 12 * upx} y={vb.y + vb.h - 20 * upx} fontSize={fonte} fill={cor.navy}>
            {metrosBr(escala)} m
          </text>
        </g>
        <text x={vb.x + vb.w - 16 * upx} y={vb.y + 22 * upx} textAnchor="middle"
              fontSize={fonte * 1.3} fontWeight={700} fill="#94a3b8"
              style={{ pointerEvents: "none" }}>N ↑</text>
      </svg>

      {semImagem && (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#92400e" }}>
          Não consegui carregar a imagem aérea agora (serviço de fora, sem contrato). A planta
          continua valendo — desligue o satélite para ver o desenho limpo.
        </p>
      )}
      {satelite && !semImagem && tiles.length > 0 && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: cor.cinza }}>{ATRIBUICAO_PADRAO}</p>
      )}

      <p style={{ margin: "8px 0 0", fontSize: 13, color: cor.cinza }}>
        No computador, arraste para mover. No celular, ligue “✋ mão” para arrastar a planta com o
        dedo (desligado, o dedo rola a página). ＋ / − aproximam.
        {sel
          ? ` Selecionado: ${sel.identificacao || "sem identificação"}${
              precisaoSel != null
                ? ` — precisão do GPS de ±${metrosBr(precisaoSel)} m${
                    haloVisivel
                      ? " (o halo é esse raio, em escala real)"
                      : haloImpossivel
                        ? (agruparQuadras
                            ? " (a incerteza é maior que o cemitério inteiro: halo omitido — esta leitura não localiza o jazigo, vale remarcar)"
                            : " (a incerteza é muito maior que esta quadra: halo omitido — esta leitura não serve para achar o jazigo aqui, vale remarcar)")
                        : haloGrande
                          ? " (maior que a área na tela: halo omitido, use − para afastar e conferir)"
                          : " (menor que o ponto, sem halo)"
                  }.`
                : "."
            }`
          : " Toque num jazigo para ver os detalhes e a precisão do GPS."}
      </p>
    </div>
  );
}

function Detalhe({ j, onFechar, onMudou }: { j: Jazigo; onFechar: () => void; onMudou: () => void }) {
  const local = [j.quadra, j.rua, j.numero ? `nº ${j.numero}` : null].filter(Boolean).join(" · ");
  const mapaExterno = j.lat != null && j.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${j.lat},${j.lng}`
    : null;

  return (
    <div style={{ ...painel.card, borderLeft: `4px solid ${CORES[j.status] || CORES.sem}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <strong style={{ color: cor.navy, fontSize: 17 }}>{j.identificacao || "sem identificação"}</strong>
          <div style={{ color: cor.cinza, fontSize: 14 }}>{local || "sem local"}</div>
          <div style={{ marginTop: 6, fontSize: 15 }}>
            {j.cliente ? <b>{j.cliente}</b> : <span style={{ color: "#d97706" }}>sem família vinculada</span>}
          </div>
        </div>
        <button style={painel.botaoMiniSec} onClick={onFechar}>fechar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 12 }}>
        <Campo rotulo="Situação" valor={ROTULO[j.status] || "—"} cor={CORES[j.status]} />
        <Campo rotulo="Próxima cobrança" valor={dataBr(j.proximaCobranca)} />
        <Campo rotulo="Próxima lavagem" valor={dataBr(j.proximoServico)} />
        {/* != null, não truthy: plano com valor zerado mostrava "—", igualzinho a
            jazigo SEM plano — e o aviso de "não tem plano" não aparecia, então a
            tela não dava nenhuma pista de que o valor está zerado. */}
        {/* "Mensalidade" mente em plano avulso/por data: nao ha mes nenhum, o
            valor e o do servico. O numero e o mesmo; o rotulo passa a dizer a
            verdade. */}
        <Campo rotulo={j.cadencia === "avulso" || j.cadencia === "por_data" ? "Valor do serviço" : "Mensalidade"}
               valor={j.valorMensal != null ? `R$ ${j.valorMensal.toFixed(2)}` : "—"} />
        {/* mesmo formatador da legenda da planta: com precisão de 0,4 m a legenda
            dizia "±0,4 m" e este campo "±0 m" para o mesmo jazigo. */}
        <Campo rotulo="Precisão do GPS" valor={j.precisao != null ? `±${metrosBr(Number(j.precisao))} m` : "—"} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {j.clienteId && (
          <Link href={`/painel/clientes/${j.clienteId}`} style={painel.botaoMini}>Abrir ficha da família</Link>
        )}
        {mapaExterno && (
          <a href={mapaExterno} target="_blank" rel="noreferrer" style={painel.botaoMiniSec}>
            Abrir no mapa do celular
          </a>
        )}
        {/* aparece sempre, inclusive sem coordenada: jazigo "sem GPS" pode ter
            leitura registrada e descartada por precisao, e ver isso e o unico
            jeito de entender por que ele nao entra na planta */}
        <CorrigirGps tumuloId={j.id} onMudou={onMudou} />
      </div>
      {!j.temPlano && (
        <p style={{ margin: "10px 0 0", fontSize: 14, color: "#92400e" }}>
          Este jazigo não tem plano. Na ficha da família, use “Criar plano” para definir a periodicidade.
        </p>
      )}
      {j.temPlano && j.ativo === false && (
        <p style={{ margin: "10px 0 0", fontSize: 14, color: "#92400e" }}>
          O plano deste jazigo está inativo: não gera lavagem nem cobrança. Reative na ficha da família.
        </p>
      )}
    </div>
  );
}

function Campo({ rotulo, valor, cor: c }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: cor.cinza, textTransform: "uppercase", letterSpacing: 0.5 }}>{rotulo}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: c || cor.navy }}>{valor}</div>
    </div>
  );
}
